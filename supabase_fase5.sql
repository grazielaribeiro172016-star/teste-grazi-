-- ═══════════════════════════════════════════════════════════════
--  FORTUNA DO TIGRE — SQL FASE 5 (PIX via Mercado Pago)
--  Execute no SQL Editor do Supabase APÓS fase2 e fases3_4
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. TABELA pix_payments ───────────────────────────────────
-- Registro de cada cobrança PIX, com status e idempotência
CREATE TABLE IF NOT EXISTS public.pix_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mp_payment_id   TEXT UNIQUE,              -- ID retornado pelo Mercado Pago
  amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
  qr_code         TEXT,                     -- código copia-e-cola do PIX
  qr_code_base64  TEXT,                     -- imagem do QR em base64
  credited        BOOLEAN NOT NULL DEFAULT FALSE,  -- garante crédito único (idempotência)
  credited_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  raw_webhook     JSONB,                    -- payload completo do último webhook recebido (auditoria)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_payments_user   ON public.pix_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_pix_payments_mp_id  ON public.pix_payments(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_pix_payments_status ON public.pix_payments(status);

-- ─── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_payments_select_own" ON public.pix_payments;
CREATE POLICY "pix_payments_select_own"
  ON public.pix_payments FOR SELECT
  USING (auth.uid() = user_id);

-- Nenhum INSERT/UPDATE direto pelo frontend — tudo via service_role nas Vercel Functions
-- (service_role bypassa RLS automaticamente, então não precisamos de policy de insert/update aqui)

-- ─── 3. TRIGGER updated_at ────────────────────────────────────
DROP TRIGGER IF EXISTS pix_payments_updated_at ON public.pix_payments;
CREATE TRIGGER pix_payments_updated_at
  BEFORE UPDATE ON public.pix_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. RPC: criar cobrança PIX (chamada pelo /api/create-pix) ─
-- Roda com service_role no backend, não é exposta diretamente ao usuário
CREATE OR REPLACE FUNCTION public.create_pix_record(
  p_user_id UUID,
  p_amount  DECIMAL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.pix_payments (user_id, amount, status)
  VALUES (p_user_id, p_amount, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 5. RPC: confirmar pagamento e creditar saldo (idempotente) ─
-- Chamada pelo /api/webhook DEPOIS de validar com a API do Mercado Pago
-- A trava "credited = FALSE" garante que mesmo se o webhook chegar
-- duplicado, o saldo NUNCA é creditado duas vezes para o mesmo pagamento
CREATE OR REPLACE FUNCTION public.confirm_pix_payment(
  p_mp_payment_id TEXT,
  p_status        TEXT,
  p_raw_webhook   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment      public.pix_payments;
  v_new_balance  DECIMAL;
BEGIN
  -- Busca o pagamento com lock para evitar race condition entre webhooks simultâneos
  SELECT * INTO v_payment
  FROM public.pix_payments
  WHERE mp_payment_id = p_mp_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  -- Sempre atualiza status e payload bruto para auditoria
  UPDATE public.pix_payments
  SET status = p_status, raw_webhook = p_raw_webhook
  WHERE id = v_payment.id;

  -- Já creditado antes? Não credita de novo (idempotência)
  IF v_payment.credited THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_credited', 'payment_id', v_payment.id);
  END IF;

  -- Só credita se o status for approved
  IF p_status != 'approved' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'not_approved_yet', 'status', p_status);
  END IF;

  -- Credita o saldo no profile
  UPDATE public.profiles
  SET balance = balance + v_payment.amount
  WHERE id = v_payment.user_id
  RETURNING balance INTO v_new_balance;

  -- Marca como creditado (trava de idempotência)
  UPDATE public.pix_payments
  SET credited = TRUE, credited_at = NOW()
  WHERE id = v_payment.id;

  -- Registra a transação financeira
  INSERT INTO public.transactions (user_id, type, amount, balance_after, description, pix_id)
  VALUES (
    v_payment.user_id,
    'deposit',
    v_payment.amount,
    v_new_balance,
    'Depósito via PIX confirmado',
    p_mp_payment_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'credited',
    'payment_id', v_payment.id,
    'new_balance', v_new_balance
  );
END;
$$;

-- ─── 6. RPC: vincular mp_payment_id após criar cobrança ───────
-- Chamada pelo /api/create-pix após receber resposta do Mercado Pago
CREATE OR REPLACE FUNCTION public.attach_mp_payment_id(
  p_pix_record_id UUID,
  p_mp_payment_id TEXT,
  p_qr_code       TEXT,
  p_qr_code_base64 TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_payments
  SET mp_payment_id  = p_mp_payment_id,
      qr_code        = p_qr_code,
      qr_code_base64 = p_qr_code_base64
  WHERE id = p_pix_record_id;
END;
$$;

-- ─── 7. ATUALIZA admin_add_balance para registrar em pix_payments ──
-- (mantém compatibilidade com painel de teste já existente)
-- Sem mudanças necessárias — admin_add_balance da Fase 2 continua funcionando
-- para crédito manual de teste, sem envolver Mercado Pago

-- ─── 8. VERIFICAÇÃO ───────────────────────────────────────────
SELECT
  tablename,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) AS policies
FROM pg_tables t
WHERE schemaname = 'public'
AND tablename = 'pix_payments';

SELECT 'Fase 5 SQL aplicado com sucesso!' AS status;
