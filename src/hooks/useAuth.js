import { useState, useEffect, useCallback } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  const fetchProfile = useCallback(async (userId) => {
    if (!hasSupabase) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) setProfile(data)
    return data
  }, [])

  useEffect(() => {
    // Sem Supabase configurado: vai direto para modo guest
    if (!hasSupabase) {
      setLoading(false)
      return
    }

    let initialCheckDone = false

    // Timeout de segurança: nunca deixa a tela de carregamento travada
    // por mais de 4s, mesmo se a rede estiver lenta ou o Supabase não responder
    const safetyTimer = setTimeout(() => setLoading(false), 4000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      initialCheckDone = true
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          setLoading(false)
          clearTimeout(safetyTimer)
        })
      } else {
        setLoading(false)
        clearTimeout(safetyTimer)
      }
    }).catch(() => {
      initialCheckDone = true
      setLoading(false)
      clearTimeout(safetyTimer)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Ignora o disparo inicial duplicado do onAuthStateChange — getSession() já cuida disso
      if (!initialCheckDone) return
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id)
      else setProfile(null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(safetyTimer)
    }
  }, [fetchProfile])

  async function signIn(email, password) {
    if (!hasSupabase) { setAuthError('Supabase não configurado.'); return false }
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setAuthError(translateError(error.message)); return false }
    return true
  }

  async function signUp(email, password, username) {
    if (!hasSupabase) { setAuthError('Supabase não configurado.'); return false }
    setAuthError(null)
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing) { setAuthError('Este nome de usuário já está em uso.'); return false }

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } },
    })
    if (error) { setAuthError(translateError(error.message)); return false }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id, email, username,
        balance: 100.00, total_won: 0, total_lost: 0, best_win: 0,
        streak: 0, dragons: 0, rounds: 0, wins: 0, losses: 0,
      })
    }
    return true
  }

  async function signOut() {
    if (!hasSupabase) return
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function resetPassword(email) {
    if (!hasSupabase) { setAuthError('Supabase não configurado.'); return false }
    setAuthError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setAuthError(translateError(error.message)); return false }
    return true
  }

  async function syncGameState(G) {
    if (!hasSupabase || !user) return
    await supabase.from('profiles').update({
      balance: G.saldo, total_won: G.totalWon, best_win: G.best,
      streak: G.streak, dragons: G.dragons, rounds: G.rounds,
      wins: G.wins, losses: G.losses,
    }).eq('id', user.id)
  }

  return {
    user, profile, loading, authError, setAuthError,
    signIn, signUp, signOut, resetPassword, syncGameState, fetchProfile,
  }
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email ou senha incorretos.'
  if (msg.includes('Email not confirmed')) return 'Confirme seu email antes de entrar.'
  if (msg.includes('User already registered')) return 'Este email já está cadastrado.'
  if (msg.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.'
  return msg
}
