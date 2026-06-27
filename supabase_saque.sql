-- ═══════════════════════════════════════════════════════════════
--  FORTUNA DO TIGRE — SQL SAQUE (Withdrawal)
--  Execute no SQL Editor do Supabase APÓS fase2, fases3_4 e fase5
--
--  LÓGICA: o saldo é debitado IMEDIATAMENTE ao solicitar o saque
--  (evita que o jogador continue apostando o valor que já pediu
--  para sacar). O registro fica como 'pending' até você processar
--  manualmente o PIX real (ou até o Mercado Pago estar conectado
--  via /api/process-withdrawal no futuro).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. TABELA withdrawal_requests ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  pix_key         TEXT NOT NULL,              -- chave PIX informada pelo usuário
  pix_key_type    TEXT NOT NULL DEFAULT 'cpf', -- cpf, email, telefone, aleatoria
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed','rejected','cancelled')),
  mp_payment_id   TEXT,                       -- preenchido quando o PIX real for enviado
  rejection_reason TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user   ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON public.withdrawal_requests(status);

-- ─── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawal_select_own" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_select_own"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Nenhum INSERT/UPDATE direto pelo frontend — tudo via RPC segura abaixo

-- ─── 3. TRIGGER updated_at ────────────────────────────────────
DROP TRIGGER IF EXISTS withdrawal_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. RPC: solicitar saque (debita saldo imediatamente) ─────
-- Limites: mínimo R$20, máximo R$2000 por solicitação
-- Trava o saldo com FOR UPDATE para evitar saque duplicado simultâneo
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id     UUID,
  p_amount      DECIMAL,
  p_pix_key     TEXT,
  p_pix_key_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance      DECIMAL;
  v_withdrawal_id    UUID;
  v_min_amount       DECIMAL := 20.00;
  v_max_amount       DECIMAL := 2000.00;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_amount < v_min_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'below_minimum', 'min_amount', v_min_amount);
  END IF;

  IF p_amount > v_max_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'above_maximum', 'max_amount', v_max_amount);
  END IF;

  IF p_pix_key IS NULL OR LENGTH(TRIM(p_pix_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_pix_key');
  END IF;

  -- Lock na linha para evitar saque duplicado em requisições simultâneas
  SELECT balance INTO v_current_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'current_balance', v_current_balance);
  END IF;

  -- Impede múltiplos saques pendentes simultâneos (facilita controle operacional)
  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests
    WHERE user_id = p_user_id AND status IN ('pending','processing')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pending_withdrawal_exists');
  END IF;

  -- Debita o saldo IMEDIATAMENTE (evita que o jogador aposte o valor solicitado)
  v_new_balance := v_current_balance - p_amount;

  UPDATE public.profiles
  SET balance = v_new_balance
  WHERE id = p_user_id;

  -- Cria a solicitação de saque
  INSERT INTO public.withdrawal_requests (user_id, amount, pix_key, pix_key_type, status)
  VALUES (p_user_id, p_amount, p_pix_key, p_pix_key_type, 'pending')
  RETURNING id INTO v_withdrawal_id;

  -- Registra a transação (negativa, saída)
  INSERT INTO public.transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, 'withdrawal', p_amount, v_new_balance, 'Saque solicitado - PIX ' || p_pix_key_type || ' (pendente de processamento)');

  RETURN jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_withdrawal_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- ─── 5. RPC: cancelar saque pendente (devolve saldo) ───────────
-- Útil caso o jogador queira desistir antes do processamento manual
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(
  p_user_id        UUID,
  p_withdrawal_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal  public.withdrawal_requests;
  v_new_balance DECIMAL;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_withdrawal.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_cancel', 'status', v_withdrawal.status);
  END IF;

  -- Devolve o saldo
  UPDATE public.profiles
  SET balance = balance + v_withdrawal.amount
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  UPDATE public.withdrawal_requests
  SET status = 'cancelled'
  WHERE id = p_withdrawal_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, 'deposit', v_withdrawal.amount, v_new_balance, 'Saque cancelado - saldo devolvido');

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;

-- ─── 6. RPC ADMIN: marcar saque como processado/rejeitado ──────
-- Usada pelo painel admin OU pela futura integração real com Mercado Pago
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  p_withdrawal_id UUID,
  p_new_status    TEXT,
  p_mp_payment_id TEXT DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal public.withdrawal_requests;
  v_new_balance DECIMAL;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Se for rejeitado, devolve o saldo ao jogador
  IF p_new_status = 'rejected' THEN
    UPDATE public.profiles
    SET balance = balance + v_withdrawal.amount
    WHERE id = v_withdrawal.user_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO public.transactions (user_id, type, amount, balance_after, description)
    VALUES (v_withdrawal.user_id, 'deposit', v_withdrawal.amount, v_new_balance, 'Saque rejeitado - saldo devolvido: ' || COALESCE(p_rejection_reason, 'sem motivo informado'));
  END IF;

  UPDATE public.withdrawal_requests
  SET status = p_new_status,
      mp_payment_id = COALESCE(p_mp_payment_id, mp_payment_id),
      rejection_reason = p_rejection_reason,
      processed_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── 7. VERIFICAÇÃO ───────────────────────────────────────────
SELECT 'Sistema de saque aplicado com sucesso!' AS status;

SELECT
  tablename,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) AS policies
FROM pg_tables t
WHERE schemaname = 'public'
AND tablename = 'withdrawal_requests';
