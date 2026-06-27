// ═══════════════════════════════════════════════════════════════
//  /api/create-pix
//  Vercel Serverless Function
//  Cria uma cobrança PIX via Mercado Pago e registra no Supabase.
//
//  IMPORTANTE: usa SERVICE_ROLE_KEY (não a anon key) — só roda no
//  backend, nunca é exposta ao navegador.
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN
const MP_API_URL = 'https://api.mercadopago.com/v1/payments'

// Valores mínimo e máximo permitidos por depósito (ajuste como preferir)
const MIN_AMOUNT = 5
const MAX_AMOUNT = 5000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { amount, userId, userEmail } = req.body

    // ── Validações básicas ──────────────────────────────────
    if (!userId || !userEmail) {
      return res.status(401).json({ error: 'Usuário não autenticado' })
    }
    const amountNum = Number(amount)
    if (!amountNum || isNaN(amountNum) || amountNum < MIN_AMOUNT || amountNum > MAX_AMOUNT) {
      return res.status(400).json({ error: `Valor deve estar entre R$ ${MIN_AMOUNT} e R$ ${MAX_AMOUNT}` })
    }

    // ── Confirma que o usuário existe de fato (evita forjar userId) ──
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    // ── Cria o registro pendente no Supabase ANTES de chamar o MP ──
    const { data: pixRecordId, error: rpcError } = await supabaseAdmin
      .rpc('create_pix_record', { p_user_id: userId, p_amount: amountNum })

    if (rpcError) {
      console.error('[create-pix] erro ao criar registro:', rpcError)
      return res.status(500).json({ error: 'Erro interno ao preparar pagamento' })
    }

    // ── Chama a API do Mercado Pago ─────────────────────────
    const idempotencyKey = `fortuna-${pixRecordId}` // evita cobrança duplicada se a request for repetida

    const mpResponse = await fetch(MP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: amountNum,
        description: 'Fortuna do Tigre - Depósito',
        payment_method_id: 'pix',
        payer: { email: profile.email },
        notification_url: `${process.env.PUBLIC_APP_URL}/api/webhook`,
        external_reference: pixRecordId,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error('[create-pix] erro Mercado Pago:', mpData)
      return res.status(502).json({ error: 'Erro ao gerar cobrança PIX', detail: mpData.message })
    }

    const qrCode = mpData.point_of_interaction?.transaction_data?.qr_code
    const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64

    // ── Vincula o mp_payment_id ao registro no Supabase ─────
    await supabaseAdmin.rpc('attach_mp_payment_id', {
      p_pix_record_id: pixRecordId,
      p_mp_payment_id: String(mpData.id),
      p_qr_code: qrCode,
      p_qr_code_base64: qrCodeBase64,
    })

    return res.status(200).json({
      pixRecordId,
      mpPaymentId: mpData.id,
      qrCode,
      qrCodeBase64,
      amount: amountNum,
      expiresAt: mpData.date_of_expiration,
    })

  } catch (err) {
    console.error('[create-pix] exceção:', err)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
