// ═══════════════════════════════════════════════════════════════
//  WalletModal — Tela de depósito via PIX
//  Fluxo: escolhe valor → gera QR → aguarda confirmação → fecha
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { supabase, hasSupabase } from '../../lib/supabase'

const QUICK_AMOUNTS = [20, 50, 100, 200]

export function WalletModal({ user, onClose, onDeposited }) {
  const [amount, setAmount] = useState(50)
  const [customAmount, setCustomAmount] = useState('')
  const [step, setStep] = useState('choose') // choose | generating | waiting | success | error
  const [pixData, setPixData] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)
  const pixRecordIdRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  function pickAmount(v) {
    setAmount(v)
    setCustomAmount('')
  }

  function handleCustomChange(v) {
    const clean = v.replace(/[^0-9]/g, '')
    setCustomAmount(clean)
    if (clean) setAmount(Number(clean))
  }

  async function generatePix() {
    if (amount < 5) { setErrorMsg('Valor mínimo: R$ 5,00'); return }
    if (amount > 5000) { setErrorMsg('Valor máximo: R$ 5.000,00'); return }
    setStep('generating')
    setErrorMsg('')

    try {
      const res = await fetch('/api/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId: user.id, userEmail: user.email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao gerar PIX')
        setStep('choose')
        return
      }

      setPixData(data)
      pixRecordIdRef.current = data.pixRecordId
      setStep('waiting')
      startPolling(data.pixRecordId)

    } catch (err) {
      console.error(err)
      setErrorMsg('Erro de conexão. Tente novamente.')
      setStep('choose')
    }
  }

  function startPolling(pixRecordId) {
    // Verifica no Supabase a cada 3s se o pagamento foi confirmado
    pollRef.current = setInterval(async () => {
      if (!hasSupabase) return
      const { data, error } = await supabase
        .from('pix_payments')
        .select('status, credited')
        .eq('id', pixRecordId)
        .single()

      if (error) return

      if (data.credited) {
        clearInterval(pollRef.current)
        setStep('success')
        onDeposited?.()
      } else if (data.status === 'rejected' || data.status === 'cancelled') {
        clearInterval(pollRef.current)
        setErrorMsg('Pagamento não foi aprovado.')
        setStep('error')
      }
    }, 3000)

    // Timeout de 30 minutos (expira junto com o PIX)
    setTimeout(() => {
      clearInterval(pollRef.current)
      if (step === 'waiting') {
        setErrorMsg('Tempo esgotado. Gere um novo QR Code.')
        setStep('error')
      }
    }, 30 * 60 * 1000)
  }

  function copyPixCode() {
    if (!pixData?.qrCode) return
    navigator.clipboard.writeText(pixData.qrCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function reset() {
    clearInterval(pollRef.current)
    setStep('choose')
    setPixData(null)
    setErrorMsg('')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(5,7,15,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'rgba(10,15,30,.98)', border: '1px solid rgba(245,200,66,.2)', borderRadius: 20, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 21, fontWeight: 700, color: '#f5c842' }}>💰 Depositar via PIX</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7a9a', fontSize: 26, cursor: 'pointer' }}>✕</button>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(255,61,90,.1)', border: '1px solid rgba(255,61,90,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 17, color: '#ff3d5a', marginBottom: 16 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ── STEP: Escolher valor ── */}
        {step === 'choose' && (
          <>
            <div style={{ fontSize: 16, color: '#6a7a9a', marginBottom: 12 }}>Escolha o valor do depósito:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              {QUICK_AMOUNTS.map(v => (
                <button key={v} onClick={() => pickAmount(v)} style={{
                  padding: '12px 0', borderRadius: 10,
                  border: `2px solid ${amount === v && !customAmount ? '#f5c842' : 'rgba(255,200,80,.2)'}`,
                  background: amount === v && !customAmount ? 'rgba(245,200,66,.12)' : 'transparent',
                  color: amount === v && !customAmount ? '#f5c842' : '#6a7a9a',
                  fontFamily: "'Rajdhani',sans-serif", fontSize: 17, fontWeight: 700, cursor: 'pointer',
                }}>R$ {v}</button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Ou digite outro valor"
              value={customAmount}
              onChange={e => handleCustomChange(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', background: 'rgba(5,7,15,.9)', border: '1px solid rgba(255,200,80,.2)', borderRadius: 10, color: '#eeeaf0', fontFamily: "'Rajdhani',sans-serif", fontSize: 18, outline: 'none', marginBottom: 20 }}
            />
            <button onClick={generatePix} style={{ width: '100%', padding: '13px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#f5c842,#e8a020)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              GERAR PIX — R$ {amount.toFixed(2).replace('.', ',')}
            </button>
          </>
        )}

        {/* ── STEP: Gerando ── */}
        {step === 'generating' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 47, marginBottom: 16 }}>⏳</div>
            <div style={{ color: '#6a7a9a', fontSize: 17 }}>Gerando seu PIX...</div>
          </div>
        )}

        {/* ── STEP: Aguardando pagamento ── */}
        {step === 'waiting' && pixData && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, color: '#6a7a9a', marginBottom: 16 }}>
              Escaneie o QR Code ou copie o código abaixo
            </div>
            {pixData.qrCodeBase64 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, display: 'inline-block' }}>
                <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" style={{ width: 200, height: 200 }} />
              </div>
            )}
            <button onClick={copyPixCode} style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid rgba(245,200,66,.3)', background: 'rgba(245,200,66,.08)', color: '#f5c842', fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
              {copied ? '✅ Copiado!' : '📋 Copiar código PIX'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, color: '#00e5b0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e5b0', animation: 'bp 1.5s infinite' }} />
              Aguardando confirmação do pagamento...
            </div>
            <div style={{ fontSize: 15, color: '#6a7a9a', marginTop: 12 }}>
              O saldo será creditado automaticamente após o pagamento.
            </div>
          </div>
        )}

        {/* ── STEP: Sucesso ── */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 63, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 21, color: '#2dde98', marginBottom: 8 }}>Depósito confirmado!</div>
            <div style={{ fontSize: 17, color: '#6a7a9a', marginBottom: 20 }}>R$ {amount.toFixed(2).replace('.', ',')} já está disponível no seu saldo.</div>
            <button onClick={onClose} style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#2dde98,#1ab578)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              FECHAR
            </button>
          </div>
        )}

        {/* ── STEP: Erro ── */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 63, marginBottom: 16 }}>😔</div>
            <button onClick={reset} style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#f5c842,#e8a020)', color: '#000', fontFamily: "'Cinzel Decorative',serif", fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
