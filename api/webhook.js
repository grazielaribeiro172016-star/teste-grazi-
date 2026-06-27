// ═══════════════════════════════════════════════════════════════
//  /api/webhook
//  Vercel Serverless Function
//  Recebe notificações do Mercado Pago e credita saldo com segurança.
//
//  CAMADAS DE SEGURANÇA:
//  1. Valida assinatura HMAC do header x-signature (anti-forjamento)
//  2. NUNCA confia só no payload do webhook — consulta a API do MP
//     de volta para confirmar o status real do pagamento
//  3. Idempotência garantida no banco (campo `credited` com lock)
//  4. Toda alteração de saldo passa pela RPC confirm_pix_payment
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET // configurar no painel do Mercado Pago

// ── Validação da assinatura do webhook (anti-forjamento) ───────
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/webhooks
function validateSignature(req) {
  if (!MP_WEBHOOK_SECRET) {
    console.warn('[webhook] MP_WEBHOOK_SECRET não configurado — pulando validação (NÃO RECOMENDADO EM PRODUÇÃO)')
    return true // permite rodar mesmo sem secret configurado, mas avisa no log
  }

  const signature = req.headers['x-signature']
  const requestId = req.headers['x-request-id']
  if (!signature) return false

  // Formato do header: "ts=1234567890,v1=hash..."
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=')
    acc[key.trim()] = value
    return acc
  }, {})

  const { ts, v1 } = parts
  if (!ts || !v1) return false

  const dataId = req.body?.data?.id || ''
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`

  const expectedSignature = crypto
    .createHmac('sha256', MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(v1, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    // ── 1. Validação de assinatura ────────────────────────────
    const isValid = validateSignature(req)
    if (!isValid) {
      console.error('[webhook] Assinatura inválida — possível tentativa de forjamento')
      return res.status(401).json({ error: 'Assinatura inválida' })
    }

    const { type, data } = req.body

    // Mercado Pago envia vários tipos de evento — só nos importa "payment"
    if (type !== 'payment') {
      return res.status(200).json({ ok: true, ignored: true })
    }

    const mpPaymentId = data?.id
    if (!mpPaymentId) {
      return res.status(400).json({ error: 'payment_id ausente' })
    }

    // ── 2. NUNCA confiar só no payload — consulta o MP de volta ──
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    })

    if (!mpResponse.ok) {
      console.error('[webhook] erro ao consultar pagamento no MP:', mpPaymentId)
      return res.status(502).json({ error: 'Erro ao verificar pagamento' })
    }

    const payment = await mpResponse.json()

    // payment.status pode ser: pending, approved, authorized, in_process,
    // in_mediation, rejected, cancelled, refunded, charged_back
    const normalizedStatus = payment.status === 'approved' ? 'approved'
      : payment.status === 'rejected' ? 'rejected'
      : payment.status === 'cancelled' ? 'cancelled'
      : 'pending'

    // ── 3. Credita via RPC idempotente ────────────────────────
    const { data: result, error } = await supabaseAdmin.rpc('confirm_pix_payment', {
      p_mp_payment_id: String(mpPaymentId),
      p_status: normalizedStatus,
      p_raw_webhook: payment,
    })

    if (error) {
      console.error('[webhook] erro RPC confirm_pix_payment:', error)
      return res.status(500).json({ error: 'Erro ao processar confirmação' })
    }

    console.log('[webhook] processado:', mpPaymentId, result)

    // Mercado Pago espera 200 OK rapidamente, senão reenvia o webhook
    return res.status(200).json({ ok: true, result })

  } catch (err) {
    console.error('[webhook] exceção:', err)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
