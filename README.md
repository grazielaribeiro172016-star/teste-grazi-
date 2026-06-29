# Roda da Fortuna — Fase 2 (Supabase Auth)

## Setup em 5 passos

### 1. Criar projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) → **New Project**
2. Escolha nome, senha e região (South America - São Paulo)
3. Aguarde ~2 minutos

### 2. Executar o SQL
1. No painel Supabase → **SQL Editor** → **New query**
2. Cole todo o conteúdo de `supabase_fase2.sql`
3. Clique **Run**
4. Confirme que aparece `profiles | 3 policies` no resultado

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env.local
```
Edite `.env.local` com suas chaves:
- `VITE_SUPABASE_URL`: Supabase → Settings → API → Project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase → Settings → API → anon public

### 4. Rodar local
```bash
npm install
npm run dev
```

### 5. Deploy na Vercel
```bash
vercel
```
Na Vercel, adicione as variáveis de ambiente:
- Settings → Environment Variables → adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

---

## Estrutura de arquivos

```
src/
├── App.jsx                        ← App principal + roteamento
├── main.jsx                       ← Entry point React
├── lib/
│   └── supabase.js                ← Cliente Supabase (singleton)
├── hooks/
│   └── useAuth.js                 ← Hook de autenticação
└── components/
    └── auth/
        ├── AuthModal.jsx          ← Modal Login/Cadastro/Reset
        └── ResetPasswordPage.jsx  ← Página de nova senha
```

## Funcionalidades da Fase 2

- ✅ Login com email e senha
- ✅ Cadastro com username único
- ✅ Logout
- ✅ Recuperação de senha por email
- ✅ Perfil salvo no Supabase
- ✅ Saldo sincronizado na nuvem
- ✅ Modo simulação (sem conta)
- ✅ RLS: cada usuário vê apenas seus dados
- ✅ Trigger automático cria perfil ao cadastrar

## Próximas fases

- **Fase 3**: Migrar todo localStorage → Supabase
- **Fase 4**: Histórico completo de rodadas
- **Fase 5**: PIX via Mercado Pago
