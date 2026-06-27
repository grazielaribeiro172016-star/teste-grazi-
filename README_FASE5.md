# 🐯 Fortuna do Tigre — Fase 5 (PIX via Mercado Pago)

## ⚠️ Leia antes de ativar

Esta fase liga **pagamento real**. Antes de testar com dinheiro de verdade, valide tudo com o **Painel Admin** (modo teste, sem PIX real).

---

## O que foi construído

| Arquivo | Função |
|---|---|
| `api/create-pix.js` | Gera cobrança PIX via Mercado Pago |
| `api/webhook.js` | Recebe confirmação e credita saldo (com segurança) |
| `src/components/wallet/WalletModal.jsx` | Tela de depósito com QR Code |
| `src/components/admin/AdminPanel.jsx` | Painel oculto de teste |
| `supabase_fase5.sql` | Tabela `pix_payments` + RPCs seguras |

---

## Segurança implementada

1. **Validação de assinatura HMAC** do webhook — bloqueia tentativas de forjar pagamentos chamando `/api/webhook` direto
2. **Confirmação dupla** — mesmo recebendo o webhook, o backend consulta a API do Mercado Pago de volta antes de creditar
3. **Idempotência** — campo `credited` com lock de linha garante que o mesmo pagamento nunca é creditado duas vezes, mesmo se o Mercado Pago reenviar o webhook
4. **Saldo só muda no backend** — frontend nunca altera `balance` diretamente, sempre via RPC com `SECURITY DEFINER`
5. **Service Role isolada** — a chave que bypassa RLS só existe nas Vercel Functions, nunca chega ao navegador

---

## Setup — passo a passo

### 1. Execute o SQL
Supabase → SQL Editor → cole `supabase_fase5.sql` → Run

(precisa ter rodado fase2 e fases3_4 antes)

### 2. Pegue suas credenciais do Mercado Pago

Acesse [mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel):

- **Credenciais de produção** → Access Token → copie para `MP_ACCESS_TOKEN`
- **Suas integrações** → crie uma aplicação → **Webhooks** → configure a URL `https://seu-dominio.vercel.app/api/webhook` → copie a **chave secreta** para `MP_WEBHOOK_SECRET`

### 3. Pegue a Service Role Key do Supabase

Supabase → Settings → API → **service_role** (clique em "Reveal") → copie para `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **Esta chave é extremamente sensível** — ela ignora todas as regras de segurança (RLS). Nunca a coloque no código do frontend, nunca a suba para o GitHub.

### 4. Configure as variáveis na Vercel

Settings → Environment Variables → adicione todas do `.env.example`:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MP_ACCESS_TOKEN
MP_WEBHOOK_SECRET
PUBLIC_APP_URL
VITE_ADMIN_PANEL_KEY
```

### 5. Configure seu usuário como admin (para usar o painel de teste)

No Supabase Dashboard:
- Authentication → Users → clique no seu usuário
- Edite **Raw App Meta Data** e adicione:
```json
{ "role": "admin" }
```

### 6. Redeploy
```bash
vercel --prod
```

---

## Testando ANTES do PIX real

Acesse: `https://seu-dominio.vercel.app/admin?key=SUA_VITE_ADMIN_PANEL_KEY`

1. Digite o email de um usuário cadastrado
2. Clique em **+50** ou outro valor
3. Confirme que o saldo mudou
4. Teste **ZERAR SALDO**

Isso valida que `update_balance_safe` e `admin_add_balance` funcionam — sem gastar PIX de verdade.

---

## Testando o fluxo PIX completo

1. Logado como jogador comum → Perfil → **💰 DEPOSITAR VIA PIX**
2. Escolha um valor → **GERAR PIX**
3. Escaneie o QR Code com o app do seu banco (use um valor pequeno, ex: R$ 5)
4. Pague de verdade
5. Em até ~10 segundos o app detecta a confirmação automaticamente (polling no Supabase)
6. Saldo atualizado

### Se o webhook não chegar
Verifique:
- A URL configurada no Mercado Pago é exatamente `https://seu-dominio.vercel.app/api/webhook`
- `MP_WEBHOOK_SECRET` está correto
- Logs da Vercel: Project → Deployments → [latest] → Functions → `webhook`

---

## Fluxo técnico completo

```
Jogador clica "Depositar R$ 50"
        ↓
Frontend chama /api/create-pix
        ↓
Backend valida usuário no Supabase
        ↓
Backend cria registro "pending" em pix_payments
        ↓
Backend chama API do Mercado Pago → gera QR Code
        ↓
Backend vincula mp_payment_id ao registro
        ↓
Frontend mostra QR Code, começa polling no Supabase
        ↓
Jogador paga o PIX no app do banco
        ↓
Mercado Pago dispara webhook → /api/webhook
        ↓
Backend valida assinatura HMAC (anti-forjamento)
        ↓
Backend consulta API do MP de novo (confirma status real)
        ↓
Backend chama RPC confirm_pix_payment (idempotente)
        ↓
Saldo creditado + transação registrada
        ↓
Frontend detecta via polling → mostra sucesso
```

---

## Tabelas finais no Supabase

| Tabela | Conteúdo |
|---|---|
| `profiles` | Saldo atual e estatísticas agregadas |
| `transactions` | Histórico de cada crédito/débito (inclui `pix_id`) |
| `game_history` | Histórico de cada rodada jogada |
| `pix_payments` | Status de cada cobrança PIX gerada |

---

## Limites configurados

- Depósito mínimo: R$ 5,00
- Depósito máximo: R$ 5.000,00
- Expiração do PIX: 30 minutos

Ajuste em `api/create-pix.js` (`MIN_AMOUNT`, `MAX_AMOUNT`) se quiser outros valores.
