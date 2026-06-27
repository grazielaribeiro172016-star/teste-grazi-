import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const inp = {
  width: '100%', padding: '11px 14px',
  background: 'rgba(5,7,15,.9)', border: '1px solid rgba(255,200,80,.2)',
  borderRadius: 10, color: '#eeeaf0', fontFamily: "'Rajdhani',sans-serif",
  fontSize: 18, fontWeight: 500, outline: 'none',
}

export function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
      else setError('Link inválido ou expirado. Solicite um novo email de recuperação.')
    })
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setMsg('✅ Senha redefinida com sucesso!')
    setTimeout(onDone, 2000)
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05070f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 9999 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'rgba(10,15,30,.98)', border: '1px solid rgba(255,200,80,.2)', borderRadius: 20, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 47 }}>🔐</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 21, fontWeight: 700, color: '#f5c842', marginTop: 8 }}>Nova Senha</div>
        </div>
        {error && <div style={{ background: 'rgba(255,61,90,.1)', border: '1px solid rgba(255,61,90,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 17, color: '#ff3d5a', marginBottom: 16 }}>⚠️ {error}</div>}
        {msg && <div style={{ background: 'rgba(0,229,176,.1)', border: '1px solid rgba(0,229,176,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 17, color: '#00e5b0', marginBottom: 16 }}>{msg}</div>}
        {validSession && !msg && (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input style={inp} type="password" placeholder="Nova senha" value={password} onChange={e => setPassword(e.target.value)} required />
            <input style={inp} type="password" placeholder="Confirmar senha" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            <button type="submit" disabled={loading} style={{ padding: '12px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#f5c842,#e8a020)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: loading ? .5 : 1 }}>
              {loading ? 'SALVANDO...' : 'SALVAR NOVA SENHA'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
