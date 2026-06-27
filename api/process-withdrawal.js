// ═══════════════════════════════════════════════════════════════
//  /api/process-withdrawal
//  Vercel Serverless Function — AINDA NÃO ATIVA EM PRODUÇÃO
//
//  STATUS ATUAL: a experiência de saque já está completa e funcional
//  no app (debita saldo, valida limites, cria registro 'pending' no
//  Supabase). O que FALTA é conectar esta função para realmente
//  enviar o PIX via API do Mercado Pago quando você processar os
//  saques pendentes.
//
//  COMO ATIVAR (quando tiver o Mercado Pago configurado):
//  1. Mercado Pago tem uma API de "Transferências" (PIX OUT) que
//     requer uma conta empresarial com saldo disponível.
//     Doc: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/transfers
//  2. Esta função consultaria os saques 'pending' no Supabase
//  3. Para cada um, chamaria a API de transferência do Mercado Pago
//  4. Em caso de sucesso, chamaria a RPC admin_process_withdrawal
//     com status 'completed' e o mp_payment_id retornado
//  5. Em caso de falha, chamaria com status 'rejected' (isso já
//     devolve o saldo automaticamente ao jogador, ver SQL)
//
//  FLUXO MANUAL ATUAL (enquanto isso não está automatizado):
//  Você pode processar saques manualmente:
//  1. Veja os saques pendentes: SELECT * FROM withdrawal_requests
//     WHERE status = 'pending' ORDER BY created_at;
//  2. Faça o PIX manualmente pelo seu banco para a chave informada
//  3. Marque como processado:
//     SELECT admin_process_withdrawal('ID_DO_SAQUE', 'completed');
//  4. Ou, se não puder processar, rejeite (devolve o saldo):
//     SELECT admin_process_withdrawal('ID_DO_SAQUE', 'rejected', NULL, 'motivo aqui');
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  // ── Proteção: só admin pode chamar esta rota ──────────────────
  const adminSecret = req.headers['x-admin-secret']
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  return res.status(501).json({
    error: 'Integração com Mercado Pago (PIX OUT) ainda não configurada.',
    message: 'Processe os saques manualmente por enquanto. Veja os comentários no topo deste arquivo para o fluxo manual e os passos de ativação futura.',
  })

  // ─────────────────────────────────────────────────────────────
  // CÓDIGO FUTURO (quando a API de transferências do MP estiver pronta):
  //
  // const { withdrawalId } = req.body
  //
  // const { data: withdrawal } = await supabaseAdmin
  //   .from('withdrawal_requests')
  //   .select('*')
  //   .eq('id', withdrawalId)
  //   .single()
  //
  // const mpResponse = await fetch('https://api.mercadopago.com/v1/transfers', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
  //   },
  //   body: JSON.stringify({
  //     amount: withdrawal.amount,
  //     pix_key: withdrawal.pix_key,
  //     pix_key_type: withdrawal.pix_key_type,
  //   }),
  // })
  //
  // const mpData = await mpResponse.json()
  //
  // if (mpResponse.ok) {
  //   await supabaseAdmin.rpc('admin_process_withdrawal', {
  //     p_withdrawal_id: withdrawalId,
  //     p_new_status: 'completed',
  //     p_mp_payment_id: mpData.id,
  //   })
  //   return res.status(200).json({ ok: true })
  // } else {
  //   await supabaseAdmin.rpc('admin_process_withdrawal', {
  //     p_withdrawal_id: withdrawalId,
  //     p_new_status: 'rejected',
  //     p_rejection_reason: mpData.message,
  //   })
  //   return res.status(502).json({ error: 'Falha ao processar PIX' })
  // }
}
