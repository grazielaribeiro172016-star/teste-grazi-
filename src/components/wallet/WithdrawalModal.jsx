// ═══════════════════════════════════════════════════════════════
//  WithdrawalModal — Tela de saque (estilo cassino real)
//  Fluxo: escolhe valor → informa chave PIX → confirma → status pendente
//
//  IMPORTANTE: o saldo é debitado IMEDIATAMENTE via RPC segura
//  (request_withdrawal). O envio real do PIX ainda não está conectado
//  ao Mercado Pago — fica registrado como 'pending' até você configurar
//  as credenciais (ver api/process-withdrawal.js para o próximo passo).
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { supabase, hasSupabase } from '../../lib/supabase'

const QUICK_AMOUNTS = [20, 50, 100, 200]
const MIN_WITHDRAWAL = 20
const MAX_WITHDRAWAL = 2000

const PIX_KEY_TYPES = [
  { id: 'cpf', label: 'CPF' },
  { id: 'email', label: 'Email' },
  { id: 'telefone', label: 'Telefone' },
  { id: 'aleatoria', label: 'Chave Aleatória' },
]

const fmt = v => 'R$ ' + Math.abs(+v).toFixed(2).replace('.', ',')

export function WithdrawalModal({ user, currentBalance, onClose, onWithdrawn }) {
  const [amount, setAmount] = useState(50)
  const [customAmount, setCustomAmount] = useState('')
  const [pixKeyType, setPixKeyType] = useState('cpf')
  const [pixKey, setPixKey] = useState('')
  const [step, setStep] = useState('choose') // choose | confirm | processing | success | error
  const [errorMsg, setErrorMsg] = useState('')
  const [withdrawalId, setWithdrawalId] = useState(null)

  function pickAmount(v) {
    setAmount(v)
    setCustomAmount('')
    setErrorMsg('')
  }

  function handleCustomChange(v) {
    const clean = v.replace(/[^0-9]/g, '')
    setCustomAmount(clean)
    if (clean) setAmount(Number(clean))
    setErrorMsg('')
  }

  function validateAndGoToConfirm() {
    if (amount < MIN_WITHDRAWAL) { setErrorMsg(`Valor mínimo: ${fmt(MIN_WITHDRAWAL)}`); return }
    if (amount > MAX_WITHDRAWAL) { setErrorMsg(`Valor máximo: ${fmt(MAX_WITHDRAWAL)}`); return }
    if (amount > currentBalance) { setErrorMsg('Saldo insuficiente para este saque.'); return }
    if (!pixKey || pixKey.trim().length < 3) { setErrorMsg('Informe uma chave PIX válida.'); return }
    setErrorMsg('')
    setStep('confirm')
  }

  async function confirmWithdrawal() {
    setStep('processing')
    setErrorMsg('')
    try {
      const { data, error } = await supabase.rpc('request_withdrawal', {
        p_user_id: user.id,
        p_amount: amount,
        p_pix_key: pixKey.trim(),
        p_pix_key_type: pixKeyType,
      })

      if (error) { setErrorMsg('Erro ao processar saque. Tente novamente.'); setStep('confirm'); return }

      if (!data.ok) {
        const reasons = {
          below_minimum: `Valor mínimo: ${fmt(data.min_amount)}`,
          above_maximum: `Valor máximo: ${fmt(data.max_amount)}`,
          insufficient_balance: 'Saldo insuficiente.',
          invalid_pix_key: 'Chave PIX inválida.',
          pending_withdrawal_exists: 'Você já tem um saque pendente. Aguarde o processamento ou cancele-o no Histórico.',
        }
        setErrorMsg(reasons[data.reason] || 'Não foi possível processar o saque.')
        setStep('confirm')
        return
      }

      setWithdrawalId(data.withdrawal_id)
      setStep('success')
      onWithdrawn?.(data.new_balance)

    } catch (err) {
      console.error(err)
      setErrorMsg('Erro de conexão. Tente novamente.')
      setStep('confirm')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(5,7,15,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'rgba(10,15,30,.98)', border: '1px solid rgba(0,229,176,.25)', borderRadius: 20, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 21, fontWeight: 700, color: '#00e5b0' }}>🏦 Sacar via PIX</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7a9a', fontSize: 26, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ background: 'rgba(0,229,176,.06)', border: '1px solid rgba(0,229,176,.2)', borderRadius: 10, padding: '8px 14px', fontSize: 16, color: '#00e5b0', marginBottom: 16, textAlign: 'center' }}>
          Saldo disponível: <strong>{fmt(currentBalance)}</strong>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(255,61,90,.1)', border: '1px solid rgba(255,61,90,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 17, color: '#ff3d5a', marginBottom: 16 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ── STEP: Escolher valor e chave PIX ── */}
        {step === 'choose' && (
          <>
            <div style={{ fontSize: 16, color: '#6a7a9a', marginBottom: 10 }}>Valor do saque:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
              {QUICK_AMOUNTS.map(v => (
                <button key={v} onClick={() => pickAmount(v)} style={{
                  padding: '12px 0', borderRadius: 10,
                  border: `2px solid ${amount === v && !customAmount ? '#00e5b0' : 'rgba(0,229,176,.2)'}`,
                  background: amount === v && !customAmount ? 'rgba(0,229,176,.12)' : 'transparent',
                  color: amount === v && !customAmount ? '#00e5b0' : '#6a7a9a',
                  fontFamily: "'Rajdhani',sans-serif", fontSize: 17, fontWeight: 700, cursor: 'pointer',
                }}>R$ {v}</button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Ou digite outro valor"
              value={customAmount}
              onChange={e => handleCustomChange(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', background: 'rgba(5,7,15,.9)', border: '1px solid rgba(0,229,176,.2)', borderRadius: 10, color: '#eeeaf0', fontFamily: "'Rajdhani',sans-serif", fontSize: 18, outline: 'none', marginBottom: 18 }}
            />

            <div style={{ fontSize: 16, color: '#6a7a9a', marginBottom: 10 }}>Tipo de chave PIX:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
              {PIX_KEY_TYPES.map(t => (
                <button key={t.id} onClick={() => setPixKeyType(t.id)} style={{
                  padding: '8px 4px', borderRadius: 8,
                  border: `1.5px solid ${pixKeyType === t.id ? '#00e5b0' : 'rgba(0,229,176,.15)'}`,
                  background: pixKeyType === t.id ? 'rgba(0,229,176,.1)' : 'transparent',
                  color: pixKeyType === t.id ? '#00e5b0' : '#6a7a9a',
                  fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>{t.label}</button>
              ))}
            </div>

            <input
              type="text"
              placeholder={`Digite sua chave PIX (${PIX_KEY_TYPES.find(t => t.id === pixKeyType)?.label})`}
              value={pixKey}
              onChange={e => { setPixKey(e.target.value); setErrorMsg(''); }}
              style={{ width: '100%', padding: '11px 14px', background: 'rgba(5,7,15,.9)', border: '1px solid rgba(0,229,176,.2)', borderRadius: 10, color: '#eeeaf0', fontFamily: "'Rajdhani',sans-serif", fontSize: 18, outline: 'none', marginBottom: 20 }}
            />

            <button onClick={validateAndGoToConfirm} style={{ width: '100%', padding: '13px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#00e5b0,#00b88a)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              CONTINUAR — {fmt(amount)}
            </button>
          </>
        )}

        {/* ── STEP: Confirmação ── */}
        {step === 'confirm' && (
          <>
            <div style={{ background: 'rgba(245,200,66,.06)', border: '1px solid rgba(245,200,66,.2)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
              <div style={{ fontSize: 15, color: '#6a7a9a', marginBottom: 4 }}>Valor do saque</div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 32, fontWeight: 700, color: '#f5c842', marginBottom: 14 }}>{fmt(amount)}</div>
              <div style={{ fontSize: 15, color: '#6a7a9a', marginBottom: 4 }}>Chave PIX ({PIX_KEY_TYPES.find(t => t.id === pixKeyType)?.label})</div>
              <div style={{ fontSize: 18, color: '#eeeaf0', wordBreak: 'break-all' }}>{pixKey}</div>
            </div>
            <div style={{ fontSize: 15, color: '#6a7a9a', marginBottom: 18, textAlign: 'center', lineHeight: 1.6 }}>
              O valor será debitado do seu saldo agora. O PIX é processado em até 24h úteis.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('choose')} style={{ flex: 1, padding: '12px', border: '1px solid rgba(255,200,80,.2)', borderRadius: 10, background: 'transparent', color: '#6a7a9a', fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                VOLTAR
              </button>
              <button onClick={confirmWithdrawal} style={{ flex: 2, padding: '12px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#00e5b0,#00b88a)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                CONFIRMAR SAQUE
              </button>
            </div>
          </>
        )}

        {/* ── STEP: Processando ── */}
        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 16px' }} />
            <div style={{ color: '#6a7a9a', fontSize: 17 }}>Processando solicitação...</div>
          </div>
        )}

        {/* ── STEP: Sucesso ── */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: 10 }}>
            <div style={{ fontSize: 63, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 20, color: '#00e5b0', marginBottom: 8 }}>Saque solicitado!</div>
            <div style={{ fontSize: 16, color: '#6a7a9a', marginBottom: 20, lineHeight: 1.6 }}>
              {fmt(amount)} já foi debitado do seu saldo.<br/>
              Seu PIX será processado em até 24h úteis.<br/>
              Acompanhe o status na aba Histórico.
            </div>
            <button onClick={onClose} style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#00e5b0,#00b88a)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              FECHAR
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
