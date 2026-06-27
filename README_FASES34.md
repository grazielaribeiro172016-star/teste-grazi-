# 🐯 Fortuna do Tigre — Fases 3 e 4

## O que foi feito

### Fase 3 — Migração localStorage → Supabase
- ✅ **Zero localStorage** — o estado do jogo vive só em memória React
- ✅ **`useGameSync` hook** — sincroniza cada rodada com Supabase via RPC segura
- ✅ **`syncRound`** — chamado após cada jogada em todos os 10 jogos (23 pontos de sync)
- ✅ **`syncProfile`** — debounce de 1.5s para atualizações rápidas (ex: Keno)
- ✅ **Restauração automática** — ao logar, saldo e stats carregam do Supabase
- ✅ **Modo guest** — joga sem conta, estado só em memória (sem localStorage)

### Fase 4 — Histórico Completo
- ✅ **Tela `/history`** — nova rota acessível pelo menu inferior (📜)
- ✅ **Tab Rodadas** — últimas 100 jogadas com filtro por jogo
- ✅ **Tab Por Jogo** — win rate, lucro e RTP real por jogo com barra visual
- ✅ **Tab Transações** — histórico financeiro completo
- ✅ **Resumo no topo** — rodadas, acerto %, lucro/prejuízo, RTP real
- ✅ **Botão no Perfil** — acesso direto ao histórico
- ✅ **Views SQL** — `game_stats_by_user` e `leaderboard` no Supabase
- ✅ **Função SQL** — `get_user_summary` para resumo rápido do usuário

## Setup

### 1. Execute o SQL no Supabase
SQL Editor → cole `supabase_fases3_4.sql` → Run

(Precisa ter rodado o `supabase_fase2.sql` antes)

### 2. Rodar local
```bash
npm install
npm run dev
```

## Estrutura adicionada

```
src/
├── hooks/
│   └── useGameSync.js         ← Fase 3: sync Supabase por rodada
└── components/
    └── history/
        └── HistoryPage.jsx    ← Fase 4: histórico completo
```

## Próxima fase
**Fase 5** — PIX via Mercado Pago:
- `/api/create-pix` — gera cobrança
- `/api/webhook` — confirma pagamento
- Painel admin de teste
