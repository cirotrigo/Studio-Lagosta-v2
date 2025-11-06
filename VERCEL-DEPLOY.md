# 🚀 Guia de Deploy na Vercel

## Pré-requisitos

Antes de fazer o deploy, você precisa ter:

1. ✅ Conta no Vercel (https://vercel.com/signup)
2. ✅ Conta no Clerk (https://clerk.com)
3. ✅ Banco de dados PostgreSQL (Vercel Postgres, Supabase, Neon, etc.)

---

## 📋 Passo a Passo

### 1. Criar Banco de Dados PostgreSQL

**Opção A: Vercel Postgres (Recomendado)**

1. Acesse https://vercel.com/studio
2. Vá em **Storage** → **Create Database** → **Postgres**
3. Escolha um nome (ex: `studio-lagosta-db`)
4. Clique em **Create**
5. Copie a `DATABASE_URL` gerada

**Opção B: Neon (Gratuito)**

1. Acesse https://neon.tech
2. Crie um projeto
3. Copie a connection string

**Opção C: Supabase**

1. Acesse https://supabase.com
2. Crie um projeto
3. Vá em **Settings** → **Database**
4. Copie a **Connection String** (Transaction Mode)

### 2. Configurar Clerk

1. Acesse https://studio.clerk.com
2. Crie uma aplicação (se não tiver)
3. Vá em **API Keys** e copie:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. Vá em **Webhooks** e crie um webhook:
   - URL: `https://SEU-DOMINIO.vercel.app/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`
   - Copie o `CLERK_WEBHOOK_SECRET`

### 3. Criar Vercel Blob Storage

1. No dashboard da Vercel, vá em **Storage** → **Create** → **Blob**
2. Dê um nome (ex: `studio-lagosta-blob`)
3. Copie o `BLOB_READ_WRITE_TOKEN`

### 4. Fazer Deploy na Vercel

#### Via Dashboard (Mais Fácil)

1. Acesse https://vercel.com/new
2. Importe o repositório do GitHub
3. Configure as variáveis de ambiente (veja abaixo)
4. Clique em **Deploy**

#### Via CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Fazer login
vercel login

# Deploy
vercel

# Seguir prompts e configurar variáveis
```

### 5. Configurar Variáveis de Ambiente na Vercel

No painel da Vercel, vá em **Settings** → **Environment Variables** e adicione:

#### 🔐 Obrigatórias

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Clerk URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/studio
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/studio

# App
NEXT_PUBLIC_APP_URL=https://SEU-DOMINIO.vercel.app

# Vercel Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Admin
ADMIN_EMAILS=seu@email.com
```

#### 📦 Opcionais (mas recomendadas)

```env
# AI Providers (se for usar chat)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...

# Analytics
NEXT_PUBLIC_GTM_ID=GTM-...
NEXT_PUBLIC_GA_ID=G-...
```

### 6. Executar Migrações do Banco

Após o deploy, você precisa rodar as migrações:

**Opção A: Via Vercel CLI (Recomendado)**

```bash
# Conectar ao projeto
vercel link

# Puxar variáveis de ambiente
vercel env pull .env.local

# Rodar migrações
npx prisma migrate deploy

# Ou push direto do schema
npx prisma db push
```

**Opção B: Via Script Local**

```bash
# Configurar DATABASE_URL da produção no .env.local
DATABASE_URL="postgresql://..."

# Rodar migrations
npx prisma migrate deploy
```

### 7. Configurar Webhook do Clerk

1. No Clerk Dashboard, vá em **Webhooks**
2. Edite o webhook criado anteriormente
3. Atualize a URL para: `https://SEU-DOMINIO.vercel.app/api/webhooks/clerk`
4. Salve

### 8. Testar o Deploy

1. Acesse `https://SEU-DOMINIO.vercel.app`
2. Faça sign up
3. Verifique se o usuário foi criado no banco
4. Teste upload de arquivo (deve usar Blob)

---

## 🔧 Troubleshooting

### Erro: "Can't reach database server"

**Causa:** DATABASE_URL não configurada ou incorreta

**Solução:**
1. Verifique se a variável está configurada na Vercel
2. Teste a conexão localmente: `psql "postgresql://..."`
3. Verifique se o IP da Vercel está na whitelist (Neon/Supabase)

### Erro: "BLOB_READ_WRITE_TOKEN not configured"

**Causa:** Token do Blob não configurado

**Solução:**
1. Crie um Blob Storage na Vercel
2. Adicione o token nas variáveis de ambiente
3. Redeploy

### Erro: Webhook do Clerk não funciona

**Causa:** URL incorreta ou secret errado

**Solução:**
1. Verifique a URL: `https://SEU-DOMINIO.vercel.app/api/webhooks/clerk`
2. Verifique se `CLERK_WEBHOOK_SECRET` está correto
3. Teste manualmente no Clerk Dashboard

### Build falha com erro de TypeScript

**Solução:**
```bash
# Localmente, rode
npm run typecheck

# Corrija os erros e faça commit
git add .
git commit -m "fix: typescript errors"
git push
```

### Prisma Client não encontrado

**Solução:**
A Vercel deve gerar o cliente automaticamente, mas se falhar:

1. Adicione um script `postinstall` no `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

---

## 🎯 Checklist Pós-Deploy

- [ ] Landing page carrega
- [ ] Sign up funciona
- [ ] Usuário criado no banco
- [ ] Dashboard acessível
- [ ] Upload de arquivo funciona
- [ ] Webhooks do Clerk funcionam
- [ ] Admin page acessível
- [ ] Planos de billing visíveis

---

## 💰 Custos Estimados (Plano Gratuito)

- **Vercel**: Gratuito (100GB bandwidth)
- **Vercel Postgres**: $0 (512MB)
- **Vercel Blob**: Gratuito (1GB)
- **Clerk**: Gratuito (até 10k MAU)
- **Neon/Supabase**: Gratuito (com limites)

**Total**: $0/mês para começar! 🎉

---

## 📚 Recursos

- Vercel Docs: https://vercel.com/docs
- Clerk Docs: https://clerk.com/docs
- Prisma Docs: https://www.prisma.io/docs
- Next.js Docs: https://nextjs.org/docs
