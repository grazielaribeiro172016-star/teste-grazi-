-- ═══════════════════════════════════════════════════════════════
--  FORTUNA DO TIGRE — SQL FASES 3 e 4
--  Execute no SQL Editor do Supabase APÓS o supabase_fase2.sql
--  Adiciona: índices extras, views de estatísticas, funções úteis
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. GARANTIR colunas extras no profiles (Fase 3) ─────────
-- Adiciona colunas que a Fase 3 precisa sincronizar
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dragons INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounds  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wins    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses  INTEGER NOT NULL DEFAULT 0;

-- ─── 2. ATUALIZAR RPC update_balance_safe (Fase 3) ───────────
-- Versão atualizada que também sincroniza dragons/rounds/wins/losses
CREATE OR REPLACE FUNCTION public.update_balance_safe(
  p_user_id   UUID,
  p_delta     DECIMAL,
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
  v_is_dragon       BOOLEAN;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  v_new_balance := GREATEST(0, v_current_balance + p_delta);
  v_is_dragon   := (p_game_id = 'slot' AND p_result >= 100 * p_bet AND p_won);

  UPDATE public.profiles SET
    balance    = v_new_balance,
    total_won  = total_won  + CASE WHEN p_won     THEN p_result ELSE 0 END,
    total_lost = total_lost + CASE WHEN NOT p_won THEN p_bet    ELSE 0 END,
    best_win   = GREATEST(best_win, CASE WHEN p_won THEN p_result ELSE 0 END),
    wins       = wins   + CASE WHEN p_won     THEN 1 ELSE 0 END,
    losses     = losses + CASE WHEN NOT p_won THEN 1 ELSE 0 END,
    rounds     = rounds + 1,
    dragons    = dragons + CASE WHEN v_is_dragon THEN 1 ELSE 0 END,
    streak     = CASE WHEN p_won THEN streak + 1 ELSE 0 END
  WHERE id = p_user_id;

  -- Registra transação
  INSERT INTO public.transactions (user_id, type, amount, balance_after, description)
  VALUES (
    p_user_id,
    CASE WHEN p_won THEN 'game_win' ELSE 'game_loss' END,
    ABS(p_delta),
    v_new_balance,
    p_game_id || ' | aposta: ' || p_bet || ' | resultado: ' || p_result
  );

  -- Registra no histórico
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

-- ─── 3. VIEW: estatísticas por jogo por usuário (Fase 4) ─────
CREATE OR REPLACE VIEW public.game_stats_by_user AS
SELECT
  user_id,
  game,
  COUNT(*)                                          AS rounds,
  SUM(CASE WHEN won THEN 1 ELSE 0 END)             AS wins,
  SUM(CASE WHEN NOT won THEN 1 ELSE 0 END)         AS losses,
  ROUND(AVG(CASE WHEN won THEN 1.0 ELSE 0 END)*100,1) AS win_rate_pct,
  SUM(bet)                                          AS total_bet,
  SUM(result)                                       AS total_result,
  SUM(result) - SUM(bet)                            AS lucro,
  CASE WHEN SUM(bet) > 0
    THEN ROUND(SUM(result)/SUM(bet)*100, 1)
    ELSE 0
  END                                               AS rtp_real_pct,
  MAX(result)                                       AS best_result,
  MAX(created_at)                                   AS last_played
FROM public.game_history
GROUP BY user_id, game;

-- Policy na view (herda da tabela)
-- A view já é segura pois game_history tem RLS

-- ─── 4. VIEW: leaderboard global (top 20 por lucro) ─────────
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.username,
  p.balance,
  p.total_won,
  p.best_win,
  p.rounds,
  p.wins,
  p.dragons,
  CASE WHEN p.rounds > 0
    THEN ROUND(p.wins::DECIMAL / p.rounds * 100, 1)
    ELSE 0
  END AS win_rate_pct
FROM public.profiles p
WHERE p.rounds > 0
ORDER BY p.total_won DESC
LIMIT 20;

-- ─── 5. ÍNDICES extras para performance (Fase 4) ─────────────
CREATE INDEX IF NOT EXISTS idx_game_history_won    ON public.game_history(user_id, won);
CREATE INDEX IF NOT EXISTS idx_game_history_game_u ON public.game_history(user_id, game);
CREATE INDEX IF NOT EXISTS idx_transactions_type   ON public.transactions(user_id, type);

-- ─── 6. FUNÇÃO: resumo do usuário (para ProfilePage) ─────────
CREATE OR REPLACE FUNCTION public.get_user_summary(p_user_id UUID)
RETURNS TABLE (
  balance       DECIMAL,
  total_won     DECIMAL,
  best_win      DECIMAL,
  rounds        INTEGER,
  wins          INTEGER,
  losses        INTEGER,
  dragons       INTEGER,
  streak        INTEGER,
  favorite_game TEXT,
  rtp_real      DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    pr.balance,
    pr.total_won,
    pr.best_win,
    pr.rounds,
    pr.wins,
    pr.losses,
    pr.dragons,
    pr.streak,
    COALESCE(
      (SELECT gh.game FROM public.game_history gh
       WHERE gh.user_id = p_user_id
       GROUP BY gh.game ORDER BY COUNT(*) DESC LIMIT 1),
      'nenhum'
    ) AS favorite_game,
    CASE WHEN pr.total_won + pr.total_lost > 0
      THEN ROUND(pr.total_won / (pr.total_won + pr.total_lost) * 100, 1)
      ELSE 0
    END AS rtp_real
  FROM public.profiles pr
  WHERE pr.id = p_user_id;
END;
$$;

-- ─── 7. POLICY: leaderboard público (apenas leitura) ─────────
-- A view leaderboard só expõe username e estatísticas agregadas
-- Sem emails, IDs ou dados sensíveis
GRANT SELECT ON public.leaderboard TO anon, authenticated;

-- ─── 8. VERIFICAÇÃO FINAL ─────────────────────────────────────
SELECT 'Fases 3+4 aplicadas com sucesso!' AS status;

SELECT
  schemaname,
  viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('game_stats_by_user', 'leaderboard');
