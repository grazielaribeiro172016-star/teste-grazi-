import { useRef, useCallback } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'

export function useGameSync(user) {
  const debounceRef = useRef(null)

  const syncRound = useCallback(async ({ gameId, bet, result, won, G, setG }) => {
    if (!hasSupabase || !user) return

    const delta = won ? result - bet : -bet

    try {
      const { data: newBalance, error } = await supabase.rpc('update_balance_safe', {
        p_user_id: user.id,
        p_delta:   delta,
        p_game_id: gameId,
        p_bet:     bet,
        p_result:  result,
        p_won:     won,
      })
      if (error) { console.error('[syncRound]', error.message); return }
      if (newBalance !== null && newBalance !== undefined) {
        setG(p => ({ ...p, saldo: Number(newBalance) }))
      }
    } catch (err) {
      console.error('[syncRound] exceção:', err)
    }
  }, [user])

  const syncProfile = useCallback((G) => {
    if (!hasSupabase || !user) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      await supabase.from('profiles').update({
        balance: G.saldo, total_won: G.totalWon, best_win: G.best,
        streak: G.streak, dragons: G.dragons, rounds: G.rounds,
        wins: G.wins, losses: G.losses,
      }).eq('id', user.id)
    }, 1500)
  }, [user])

  const fetchHistory = useCallback(async (limit = 50, game = null) => {
    if (!hasSupabase || !user) return []
    let query = supabase
      .from('game_history').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (game) query = query.eq('game', game)
    const { data, error } = await query
    if (error) { console.error('[fetchHistory]', error); return [] }
    return data || []
  }, [user])

  const fetchTransactions = useCallback(async (limit = 30) => {
    if (!hasSupabase || !user) return []
    const { data, error } = await supabase
      .from('transactions').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { console.error('[fetchTransactions]', error); return [] }
    return data || []
  }, [user])

  const fetchGameStats = useCallback(async () => {
    if (!hasSupabase || !user) return []
    const { data, error } = await supabase
      .from('game_history').select('game, won, bet, result')
      .eq('user_id', user.id)
    if (error) { console.error('[fetchGameStats]', error); return [] }
    const stats = {}
    for (const row of (data || [])) {
      if (!stats[row.game]) stats[row.game] = { game: row.game, rounds: 0, wins: 0, totalBet: 0, totalResult: 0 }
      stats[row.game].rounds++
      if (row.won) stats[row.game].wins++
      stats[row.game].totalBet    += Number(row.bet)
      stats[row.game].totalResult += Number(row.result)
    }
    return Object.values(stats).map(s => ({
      ...s,
      winRate: s.rounds > 0 ? Math.round(s.wins / s.rounds * 100) : 0,
      rtp:     s.totalBet > 0 ? Math.round(s.totalResult / s.totalBet * 100) : 0,
      lucro:   s.totalResult - s.totalBet,
    })).sort((a, b) => b.rounds - a.rounds)
  }, [user])

  // Busca saques pendentes/em processamento do usuário (para permitir cancelamento)
  const fetchPendingWithdrawals = useCallback(async () => {
    if (!hasSupabase || !user) return []
    const { data, error } = await supabase
      .from('withdrawal_requests').select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
    if (error) { console.error('[fetchPendingWithdrawals]', error); return [] }
    return data || []
  }, [user])

  // Cancela um saque pendente — devolve o saldo automaticamente (via RPC)
  const cancelWithdrawal = useCallback(async (withdrawalId) => {
    if (!hasSupabase || !user) return { ok: false, reason: 'no_user' }
    const { data, error } = await supabase.rpc('cancel_withdrawal', {
      p_user_id: user.id,
      p_withdrawal_id: withdrawalId,
    })
    if (error) { console.error('[cancelWithdrawal]', error); return { ok: false, reason: 'error' } }
    return data
  }, [user])

  return { syncRound, syncProfile, fetchHistory, fetchTransactions, fetchGameStats, fetchPendingWithdrawals, cancelWithdrawal }
}
