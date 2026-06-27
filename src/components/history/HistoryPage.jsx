// ═══════════════════════════════════════════════════════════════
//  FASE 4 — HistoryPage
//  Histórico completo de rodadas e estatísticas por jogo.
//  Dados buscados do Supabase (game_history + transactions).
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'

const fmt = v => 'R$ ' + Math.abs(+v).toFixed(2).replace('.', ',')
const fmtDate = s => {
  const d = new Date(s)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const GAME_EMOJIS = {
  slot:'🎰', crash:'✈️', mina:'💣', roleta:'🎡', dados:'🎲',
  duelo:'🃏', torre:'🗼', blackjack:'♠️', keno:'🌌', plinko:'🔵',
}

function Panel({ title, children, style = {} }) {
  return (
    <div style={{ background: 'rgba(10,15,30,.85)', border: '1px solid rgba(255,200,80,.15)', borderRadius: 14, backdropFilter: 'blur(10px)', overflow: 'hidden', ...style }}>
      {title && <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,200,80,.12)', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: '#00e5b0', fontWeight: 600 }}>{title}</div>}
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  )
}

export function HistoryPage({ user, fetchHistory, fetchTransactions, fetchGameStats, fetchPendingWithdrawals, cancelWithdrawal }) {
  const [tab, setTab] = useState('rounds')
  const [rounds, setRounds] = useState([])
  const [transactions, setTransactions] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [pendingWithdrawals, setPendingWithdrawals] = useState([])
  const [cancellingId, setCancellingId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      fetchHistory(100),
      fetchTransactions(50),
      fetchGameStats(),
      fetchPendingWithdrawals ? fetchPendingWithdrawals() : Promise.resolve([]),
    ]).then(([r, t, gs, pw]) => {
      setRounds(r)
      setTransactions(t)
      setGameStats(gs)
      setPendingWithdrawals(pw)
      setLoading(false)
    })
  }, [user])

  async function handleCancel(withdrawalId) {
    if (!cancelWithdrawal) return
    setCancellingId(withdrawalId)
    const result = await cancelWithdrawal(withdrawalId)
    if (result?.ok) {
      // Remove da lista local e recarrega transações (para mostrar a devolução)
      setPendingWithdrawals(prev => prev.filter(w => w.id !== withdrawalId))
      fetchTransactions(50).then(setTransactions)
    }
    setCancellingId(null)
  }

  if (!user) return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 16px 100px', textAlign: 'center' }}>
      <div style={{ fontSize: 63, marginBottom: 16 }}>🔐</div>
      <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 24, color: '#f5c842', marginBottom: 8 }}>Histórico na Nuvem</div>
      <div style={{ fontSize: 17, color: '#6a7a9a', marginBottom: 24 }}>Crie uma conta para ter seu histórico completo salvo permanentemente.</div>
    </div>
  )

  const filteredRounds = filter === 'all' ? rounds : rounds.filter(r => r.game === filter)
  const totalBet = rounds.reduce((a, r) => a + Number(r.bet), 0)
  const totalResult = rounds.reduce((a, r) => a + Number(r.result), 0)
  const lucro = totalResult - totalBet
  const winRate = rounds.length > 0 ? Math.round(rounds.filter(r => r.won).length / rounds.length * 100) : 0

  const TABS = [
    { id: 'rounds', l: '🎮 Rodadas' },
    { id: 'stats', l: '📊 Por Jogo' },
    { id: 'transactions', l: '💳 Transações' },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 24, fontWeight: 700, color: '#f5c842', textAlign: 'center' }}>
        📜 Histórico Completo
      </div>

      {/* Resumo geral */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          { l: 'Rodadas', v: rounds.length, c: '#eeeaf0' },
          { l: 'Acerto', v: winRate + '%', c: '#2dde98' },
          { l: lucro >= 0 ? 'Lucro' : 'Prejuízo', v: (lucro >= 0 ? '+' : '') + fmt(lucro), c: lucro >= 0 ? '#2dde98' : '#ff3d5a' },
          { l: 'RTP Real', v: totalBet > 0 ? Math.round(totalResult / totalBet * 100) + '%' : '—', c: '#00e5b0' },
        ].map(s => (
          <Panel key={s.l}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#6a7a9a', marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
          </Panel>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, background: 'rgba(5,7,15,.6)', borderRadius: 10, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8,
            background: tab === t.id ? 'rgba(245,200,66,.15)' : 'transparent',
            color: tab === t.id ? '#f5c842' : '#6a7a9a',
            fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700,
            cursor: 'pointer', transition: 'all .2s',
          }}>{t.l}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#6a7a9a', fontSize: 17 }}>Carregando...</div>
      )}

      {/* ── Tab: Rodadas ── */}
      {!loading && tab === 'rounds' && (
        <Panel title="🎮 Últimas 100 Rodadas">
          {/* Filtro por jogo */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setFilter('all')} style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${filter === 'all' ? '#f5c842' : 'rgba(255,200,80,.2)'}`, background: filter === 'all' ? 'rgba(245,200,66,.1)' : 'transparent', color: filter === 'all' ? '#f5c842' : '#6a7a9a', fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Todos</button>
            {Object.keys(GAME_EMOJIS).map(g => (
              <button key={g} onClick={() => setFilter(g)} style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${filter === g ? '#f5c842' : 'rgba(255,200,80,.2)'}`, background: filter === g ? 'rgba(245,200,66,.1)' : 'transparent', color: filter === g ? '#f5c842' : '#6a7a9a', fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                {GAME_EMOJIS[g]}
              </button>
            ))}
          </div>

          {filteredRounds.length === 0
            ? <div style={{ textAlign: 'center', color: '#6a7a9a', fontSize: 16, padding: 20 }}>Nenhuma rodada encontrada.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }} className="ns">
              {filteredRounds.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 8,
                  background: r.won ? 'rgba(45,222,152,.04)' : 'rgba(255,61,90,.03)',
                  borderLeft: `3px solid ${r.won ? '#2dde98' : '#ff3d5a'}`,
                }}>
                  <span style={{ fontSize: 21 }}>{GAME_EMOJIS[r.game] || '🎮'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: '#eeeaf0', fontWeight: 600 }}>{r.game.charAt(0).toUpperCase() + r.game.slice(1)}</div>
                    <div style={{ fontSize: 14, color: '#6a7a9a' }}>{fmtDate(r.created_at)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: r.won ? '#2dde98' : '#ff3d5a' }}>
                      {r.won ? '+' + fmt(r.result - r.bet) : '-' + fmt(r.bet)}
                    </div>
                    <div style={{ fontSize: 14, color: '#6a7a9a' }}>Aposta: {fmt(r.bet)}</div>
                  </div>
                  {r.multiplier && r.won && (
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 15, fontWeight: 700, color: '#f5c842', minWidth: 36, textAlign: 'right' }}>×{Number(r.multiplier).toFixed(1)}</div>
                  )}
                </div>
              ))}
            </div>
          }
        </Panel>
      )}

      {/* ── Tab: Stats por jogo ── */}
      {!loading && tab === 'stats' && (
        <Panel title="📊 Performance por Jogo">
          {gameStats.length === 0
            ? <div style={{ textAlign: 'center', color: '#6a7a9a', fontSize: 16, padding: 20 }}>Nenhum dado ainda. Jogue para ver suas estatísticas!</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px 60px 70px 70px', gap: 8, padding: '4px 8px', fontSize: 12, letterSpacing: 1.5, color: '#6a7a9a', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,200,80,.1)', paddingBottom: 6, marginBottom: 2 }}>
                <span>Jogo</span><span></span><span>Rodadas</span><span>Acerto</span><span>Lucro</span><span>RTP Real</span>
              </div>
              {gameStats.map(s => (
                <div key={s.game} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px 60px 70px 70px', gap: 8, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,.02)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 21 }}>{GAME_EMOJIS[s.game] || '🎮'}</span>
                    <span style={{ fontSize: 15, color: '#eeeaf0', fontWeight: 600 }}>{s.game.charAt(0).toUpperCase() + s.game.slice(1)}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.winRate}%`, background: s.winRate >= 50 ? '#2dde98' : '#ff3d5a', borderRadius: 2, transition: 'width .5s' }} />
                  </div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: '#eeeaf0', textAlign: 'center' }}>{s.rounds}</div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: s.winRate >= 50 ? '#2dde98' : '#ff3d5a', textAlign: 'center' }}>{s.winRate}%</div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 15, color: s.lucro >= 0 ? '#2dde98' : '#ff3d5a', textAlign: 'right' }}>{s.lucro >= 0 ? '+' : ''}{fmt(s.lucro)}</div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: s.rtp >= 95 ? '#2dde98' : s.rtp >= 85 ? '#f5c842' : '#ff3d5a', textAlign: 'right' }}>{s.rtp}%</div>
                </div>
              ))}
            </div>
          }
        </Panel>
      )}

      {/* ── Tab: Transações ── */}
      {!loading && tab === 'transactions' && (
        <>
          {pendingWithdrawals.length > 0 && (
            <Panel title="🏦 Saques Pendentes" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingWithdrawals.map(w => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(245,200,66,.06)', border: '1px solid rgba(245,200,66,.2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#f5c842', fontFamily: "'Cinzel',serif" }}>{fmt(w.amount)}</div>
                      <div style={{ fontSize: 13, color: '#8a96aa' }}>
                        PIX ({w.pix_key_type}) · {fmtDate(w.created_at)}
                      </div>
                      <div style={{ fontSize: 12, color: '#f5c842', marginTop: 2 }}>
                        ⏳ Aguardando processamento (até 24h úteis)
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancel(w.id)}
                      disabled={cancellingId === w.id}
                      className="btn-press"
                      style={{ padding: '8px 14px', border: '1px solid rgba(255,61,90,.4)', borderRadius: 8, background: 'rgba(255,61,90,.08)', color: '#ff3d5a', fontSize: 13, fontWeight: 700, cursor: cancellingId === w.id ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: cancellingId === w.id ? .6 : 1 }}
                    >
                      {cancellingId === w.id ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#6a7a9a', marginTop: 10, textAlign: 'center' }}>
                Ao cancelar, o valor volta imediatamente para o seu saldo.
              </div>
            </Panel>
          )}
          <Panel title="💳 Histórico de Transações">
          {transactions.length === 0
            ? <div style={{ textAlign: 'center', color: '#6a7a9a', fontSize: 16, padding: 20 }}>Nenhuma transação ainda.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 450, overflowY: 'auto' }} className="ns">
              {transactions.map(t => {
                const isWin = t.type === 'game_win' || t.type === 'deposit'
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.02)', borderLeft: `3px solid ${isWin ? '#2dde98' : '#ff3d5a'}` }}>
                    <span style={{ fontSize: 24 }}>
                      {t.type === 'deposit' ? '💳' : t.type === 'withdrawal' ? '🏦' : isWin ? '🏆' : '❌'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, color: '#eeeaf0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description || t.type}
                      </div>
                      <div style={{ fontSize: 14, color: '#6a7a9a' }}>{fmtDate(t.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Cinzel',serif", color: isWin ? '#2dde98' : '#ff3d5a' }}>
                        {isWin ? '+' : '-'}{fmt(t.amount)}
                      </div>
                      <div style={{ fontSize: 14, color: '#6a7a9a' }}>Saldo: {fmt(t.balance_after)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          }
        </Panel>
        </>
      )}
    </div>
  )
}
