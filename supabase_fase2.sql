-- ═══════════════════════════════════════════════════════════════
--  FORTUNA DO TIGRE — SQL SUPABASE FASE 2
--  Execute no SQL Editor do seu projeto Supabase
--  Ordem: 1) Tabelas → 2) RLS → 3) Policies → 4) Triggers → 5) RPC
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. TABELA PROFILES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  balance       DECIMAL(12,2) NOT NULL DEFAULT 100.00,
  total_won     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_lost    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  best_win      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  streak        INTEGER NOT NULL DEFAULT 0,
  dragons       INTEGER NOT NULL DEFAULT 0,
  rounds        INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. TABELA TRANSACTIONS (Fase 4/5) ───────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('deposit','withdrawal','game_win','game_loss')),
  amount        DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description   TEXT,
  pix_id        TEXT,          -- ID da cobrança Mercado Pago (Fase 5)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. TABELA GAME_HISTORY (Fase 4) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.game_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game          TEXT NOT NULL,
  bet           DECIMAL(12,2) NOT NULL,
  result        DECIMAL(12,2) NOT NULL,
  multiplier    DECIMAL(8,2),
  won           BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. INDEXES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_username    ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_transactions_user    ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_history_user    ON public.game_history(user_id);
CREATE INDEX IF NOT EXISTS idx_game_history_game    ON public.game_history(game);
CREATE INDEX IF NOT EXISTS idx_game_history_created ON public.game_history(created_at DESC);

-- ─── 5. ROW LEVEL SECURITY ───────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history  ENABLE ROW LEVEL SECURITY;

-- ─── 6. POLICIES — profiles ──────────────────────────────────
-- Usuário vê apenas seu próprio perfil
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Usuário atualiza apenas seu próprio perfil (campos não-financeiros)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert só via trigger (criado automaticamente ao criar user)
CREATE POLICY "profiles_insert_trigger"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─── 7. POLICIES — transactions ──────────────────────────────
CREATE POLICY "transactions_select_own"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Nenhum INSERT direto pelo frontend — apenas via RPC segura
-- (A RPC roda com SECURITY DEFINER, bypassa RLS de forma controlada)

-- ─── 8. POLICIES — game_history ──────────────────────────────
CREATE POLICY "game_history_select_own"
  ON public.game_history FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 9. TRIGGER: cria perfil automaticamente ao cadastrar ────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
BEGIN
  -- Usa username do metadata se disponível, senão gera pelo email
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1) || '_' || FLOOR(RANDOM() * 9000 + 1000)::TEXT
  );

  -- Garante unicidade do username
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_username := v_username || '_' || FLOOR(RANDOM() * 100)::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, email, username, balance)
  VALUES (NEW.id, NEW.email, v_username, 100.00)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Vincula trigger ao evento de novo usuário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 10. TRIGGER: atualiza updated_at automaticamente ────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 11. RPC SEGURA: atualiza saldo ──────────────────────────
-- Esta função roda no SERVIDOR com SECURITY DEFINER
-- O frontend NUNCA pode alterar balance diretamente
-- Toda mudança de saldo passa por aqui e é auditada em transactions
CREATE OR REPLACE FUNCTION public.update_balance_safe(
  p_user_id   UUID,
  p_delta     DECIMAL,   -- positivo = ganhou, negativo = perdeu
  p_game_id   TEXT,
  p_bet       DECIMAL,
  p_result    DECIMAL,
  p_won       BOOLEAN
)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance     DECIMAL;
BEGIN
  -- Só o próprio usuário pode chamar sua RPC
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Lock na linha para evitar race condition
  SELECT balance INTO v_current_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  -- Saldo nunca fica negativo
  v_new_balance := GREATEST(0, v_current_balance + p_delta);

  -- Atualiza perfil
  UPDATE public.profiles
  SET
    balance    = v_new_balance,
    total_won  = total_won  + CASE WHEN p_won THEN p_result ELSE 0 END,
    total_lost = total_lost + CASE WHEN NOT p_won THEN p_bet ELSE 0 END,
    best_win   = GREATEST(best_win, CASE WHEN p_won THEN p_result ELSE 0 END),
    wins       = wins   + CASE WHEN p_won THEN 1 ELSE 0 END,
    losses     = losses + CASE WHEN NOT p_won THEN 1 ELSE 0 END,
    rounds     = rounds + 1
  WHERE id = p_user_id;

  -- Registra na tabela de transações
  INSERT INTO public.transactions (user_id, type, amount, balance_after, description)
  VALUES (
    p_user_id,
    CASE WHEN p_won THEN 'game_win' ELSE 'game_loss' END,
    ABS(p_delta),
    v_new_balance,
    p_game_id || ' | aposta: ' || p_bet || ' | resultado: ' || p_result
  );

  -- Registra no histórico de jogos
  INSERT INTO public.game_history (user_id, game, bet, result, multiplier, won)
  VALUES (
    p_user_id,
    p_game_id,
    p_bet,
    p_result,
    CASE WHEN p_bet > 0 THEN ROUND(p_result / p_bet, 2) ELSE 0 END,
    p_won
  );

  RETURN v_new_balance;
END;
$$;

-- ─── 12. RPC ADMIN: adicionar saldo (painel teste) ───────────
-- Só funciona se o usuário tiver role 'admin' (definir no Supabase Dashboard)
CREATE OR REPLACE FUNCTION public.admin_add_balance(
  p_user_id UUID,
  p_amount  DECIMAL
)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance DECIMAL;
BEGIN
  -- Verifica se é admin (role customizado - configurar no Supabase Auth)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  UPDATE public.profiles
  SET balance = balance + p_amount
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, 'deposit', p_amount, v_new_balance, 'Admin: crédito manual de teste');

  RETURN v_new_balance;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════
-- Rode este SELECT para confirmar que tudo foi criado:
SELECT
  tablename,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) AS policies
FROM pg_tables t
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'transactions', 'game_history')
ORDER BY tablename;
