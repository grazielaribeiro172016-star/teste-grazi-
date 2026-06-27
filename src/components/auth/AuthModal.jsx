import { useState } from 'react'

const inp = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(5,7,15,.9)',
  border: '1px solid rgba(255,200,80,.2)',
  borderRadius: 10,
  color: '#eeeaf0',
  fontFamily: "'Rajdhani',sans-serif",
  fontSize: 18,
  fontWeight: 500,
  outline: 'none',
  transition: 'border-color .2s',
}

const btn = (bg, tc = '#000') => ({
  width: '100%',
  padding: '12px',
  border: 'none',
  borderRadius: 10,
  background: bg,
  color: tc,
  fontFamily: "'Cinzel Decorative',serif",
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: 1,
  transition: 'opacity .2s',
})

export function AuthModal({ onAuth, authError, setAuthError, signIn, signUp, resetPassword }) {
  const [tab, setTab] = useState('login') // login | cadastro | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setSuccessMsg('')
    const ok = await signIn(email, password)
    if (ok) onAuth()
    setLoading(false)
  }

  async function handleCadastro(e) {
    e.preventDefault()
    if (username.length < 3) { setAuthError('Nome de usuário precisa ter ao menos 3 caracteres.'); return }
    if (password.length < 6) { setAuthError('A senha precisa ter ao menos 6 caracteres.'); return }
    setLoading(true); setSuccessMsg('')
    const ok = await signUp(email, password, username)
    if (ok) {
      setSuccessMsg('✅ Conta criada! Verifique seu email para confirmar.')
      setTab('login')
    }
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true); setSuccessMsg('')
    const ok = await resetPassword(email)
    if (ok) setSuccessMsg('📧 Email de recuperação enviado! Verifique sua caixa de entrada.')
    setLoading(false)
  }

  function changeTab(t) { setTab(t); setAuthError(null); setSuccessMsg('') }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(5,7,15,.97)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(10,15,30,.98)',
        border: '1px solid rgba(255,200,80,.2)',
        borderRadius: 20,
        padding: 32,
        boxShadow: '0 0 60px rgba(245,200,66,.1)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 53, marginBottom: 8 }}>⭐</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 24, fontWeight: 900, background: 'linear-gradient(90deg,#f5c842,#fff8dc,#f5c842)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Roda da Fortuna ⭐
          </div>
          <div style={{ fontSize: 15, color: '#6a7a9a', letterSpacing: 2, marginTop: 4 }}>
            {tab === 'login' ? 'ENTRAR NA CONTA' : tab === 'cadastro' ? 'CRIAR CONTA' : 'RECUPERAR SENHA'}
          </div>
        </div>

        {/* Tabs */}
        {tab !== 'reset' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: 'rgba(5,7,15,.6)', borderRadius: 10, padding: 4 }}>
            {['login', 'cadastro'].map(t => (
              <button key={t} onClick={() => changeTab(t)} style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: 8,
                background: tab === t ? 'rgba(245,200,66,.15)' : 'transparent',
                color: tab === t ? '#f5c842' : '#6a7a9a',
                fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700,
                cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase',
                transition: 'all .2s',
              }}>
                {t === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {authError && (
          <div style={{ background: 'rgba(255,61,90,.1)', border: '1px solid rgba(255,61,90,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 17, color: '#ff3d5a', marginBottom: 16 }}>
            ⚠️ {authError}
          </div>
        )}

        {/* Success */}
        {successMsg && (
          <div style={{ background: 'rgba(0,229,176,.1)', border: '1px solid rgba(0,229,176,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 17, color: '#00e5b0', marginBottom: 16 }}>
            {successMsg}
          </div>
        )}

        {/* ── LOGIN ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
              onFocus={e => e.target.style.borderColor = 'rgba(245,200,66,.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,200,80,.2)'} />
            <input style={inp} type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required
              onFocus={e => e.target.style.borderColor = 'rgba(245,200,66,.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,200,80,.2)'} />
            <button type="submit" disabled={loading} style={{ ...btn('linear-gradient(135deg,#f5c842,#e8a020)'), opacity: loading ? .5 : 1 }}>
              {loading ? 'ENTRANDO...' : 'ENTRAR'}
            </button>
            <button type="button" onClick={() => changeTab('reset')} style={{ background: 'none', border: 'none', color: '#6a7a9a', fontSize: 16, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'Rajdhani',sans-serif" }}>
              Esqueci minha senha
            </button>
          </form>
        )}

        {/* ── CADASTRO ── */}
        {tab === 'cadastro' && (
          <form onSubmit={handleCadastro} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input style={inp} type="text" placeholder="Nome de usuário (min. 3 caracteres)" value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} required
              onFocus={e => e.target.style.borderColor = 'rgba(245,200,66,.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,200,80,.2)'} />
            <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
              onFocus={e => e.target.style.borderColor = 'rgba(245,200,66,.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,200,80,.2)'} />
            <input style={inp} type="password" placeholder="Senha (min. 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} required
              onFocus={e => e.target.style.borderColor = 'rgba(245,200,66,.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,200,80,.2)'} />
            <div style={{ fontSize: 15, color: '#6a7a9a', background: 'rgba(245,200,66,.05)', border: '1px solid rgba(245,200,66,.1)', borderRadius: 8, padding: '8px 12px' }}>
              🎁 Novo jogador recebe <strong style={{ color: '#f5c842' }}>R$ 100,00</strong> de saldo simulado para jogar!
            </div>
            <button type="submit" disabled={loading} style={{ ...btn('linear-gradient(135deg,#00e5b0,#00b88a)'), opacity: loading ? .5 : 1 }}>
              {loading ? 'CRIANDO CONTA...' : 'CRIAR CONTA GRÁTIS'}
            </button>
          </form>
        )}

        {/* ── RECUPERAR SENHA ── */}
        {tab === 'reset' && (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 17, color: '#6a7a9a', marginBottom: 4 }}>
              Digite seu email e enviaremos um link para redefinir sua senha.
            </div>
            <input style={inp} type="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)} required
              onFocus={e => e.target.style.borderColor = 'rgba(245,200,66,.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,200,80,.2)'} />
            <button type="submit" disabled={loading} style={{ ...btn('linear-gradient(135deg,#4da6ff,#2277dd)', '#fff'), opacity: loading ? .5 : 1 }}>
              {loading ? 'ENVIANDO...' : 'ENVIAR LINK DE RECUPERAÇÃO'}
            </button>
            <button type="button" onClick={() => changeTab('login')} style={{ background: 'none', border: 'none', color: '#6a7a9a', fontSize: 16, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'Rajdhani',sans-serif" }}>
              ← Voltar ao login
            </button>
          </form>
        )}

        {/* Modo simulação (sem login) */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,200,80,.08)', textAlign: 'center' }}>
          <button onClick={onAuth} style={{ background: 'none', border: '1px solid rgba(255,200,80,.15)', borderRadius: 8, color: '#6a7a9a', fontSize: 15, padding: '7px 16px', cursor: 'pointer', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 }}>
            🎮 Jogar no modo simulação (sem conta)
          </button>
        </div>
      </div>
    </div>
  )
}
