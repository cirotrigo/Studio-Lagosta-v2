# 🚀 Guia Completo de Deploy - Studio Lagosta

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Preparação](#preparação)
3. [Banco de Dados](#banco-de-dados)
4. [Deploy na Vercel](#deploy-na-vercel)
5. [Configuração Pós-Deploy](#configuração-pós-deploy)
6. [Verificação](#verificação)
7. [Troubleshooting](#troubleshooting)

---

## Visão Geral

### O que é o Studio Lagosta?

Sistema de geração de criativos visuais com:
- ✅ Autenticação via Clerk
- ✅ Editor de templates dinâmicos
- ✅ Geração de criativos (stories, feed, square)
- ✅ Integração com Google Drive
- ✅ Sistema de créditos
- ✅ Admin dashboard

### Stack Tecnológica

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: Clerk
- **Storage**: Vercel Blob
- **Deploy**: Vercel

### Status Atual do Projeto

✅ **Build local funciona**
✅ **Database local funcionando** (1 usuário, 1 projeto, 1 template)
✅ **TypeScript sem erros**
✅ **Pronto para deploy**

---

## Preparação

### 1. Verificar Build Local

```bash
# Verificar tudo antes do deploy
npm run deploy:check

# Se falhar, corrigir erros antes de continuar
```

### 2. Fazer Backup das Configurações (Opcional)

```bash
# Fazer backup apenas das configs importantes
npm run db:backup

# Isso cria: backups/YYYY-MM-DD_HH-MM-SS/
# - admin_settings.sql
# - plans.sql
# - schema.sql
# - import.sh (para importar depois)
```

### 3. Preparar Git

```bash
# Commit todas as mudanças
git add .
git commit -m "feat: ready for production deployment"

# Push para GitHub (se ainda não fez)
git push origin main
```

---

## Banco de Dados

### Opção A: Vercel Postgres (Recomendado para Deploy Vercel)

**Vantagens:**
- ✅ Integração automática
- ✅ Fácil configuração
- ✅ Bom para começar

**Passos:**

1. Acesse https://vercel.com/studio
2. Vá em **Storage** → **Create Database** → **Postgres**
3. Nome: `studio-lagosta-db`
4. Região: `US East` (mais próxima do Brasil)
5. Clique em **Create**
6. **Copie a `DATABASE_URL`** (você vai usar depois)

### Opção B: Neon (Gratuito Permanente)

**Vantagens:**
- ✅ Gratuito para sempre (com limites)
- ✅ Muito rápido
- ✅ Fácil de usar

**Passos:**

1. Acesse https://neon.tech
2. Crie conta
3. **New Project**
4. Nome: `studio-lagosta`
5. Região: `US East`
6. **Copie a Connection String**

### Opção C: Supabase

**Vantagens:**
- ✅ Gratuito
- ✅ Tem outras features (storage, auth - mas não vamos usar)

**Passos:**

1. Acesse https://supabase.com
2. **New Project**
3. Nome: `studio-lagosta`
4. Database Password: [escolha uma senha forte]
5. Região: `East US`
6. Vá em **Settings** → **Database**
7. Copie **Connection String** (Transaction Mode)
8. Substitua `[YOUR-PASSWORD]` pela senha que criou

### 🎯 Minha Recomendação

**Use Neon** se quer:
- Gratuito para sempre
- Melhor performance
- Menos acoplamento

**Use Vercel Postgres** se quer:
- Tudo em um lugar só
- Setup mais rápido
- Fácil monitoramento

---

## Deploy na Vercel

### Método 1: Via GitHub (Recomendado)

1. **Fazer push do código**
   ```bash
   git push origin main
   ```

2. **Importar na Vercel**
   - Acesse https://vercel.com/new
   - Selecione seu repositório GitHub
   - Clique em **Import**

3. **Configurar Build Settings**
   - Framework Preset: `Next.js`
   - Build Command: `npm run build` (já configurado)
   - Output Directory: `.next` (padrão)
   - Install Command: `npm install` (padrão)

4. **Adicionar Environment Variables** (ver próxima seção)

5. **Deploy!**
   - Clique em **Deploy**
   - Aguarde 2-3 minutos

### Método 2: Via CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (desenvolvimento)
vercel

# Deploy (produção)
vercel --prod
```

---

## Configuração de Environment Variables

### Na Vercel Dashboard

**Settings** → **Environment Variables** → Adicione cada uma:

#### 🔴 OBRIGATÓRIAS

```env
# ===== DATABASE =====
DATABASE_URL=postgresql://user:pass@host:5432/database
# ☝️ Cole a URL que você copiou do Neon/Vercel/Supabase

# ===== CLERK AUTHENTICATION =====
# Pegue em https://studio.clerk.com → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Webhook (vamos configurar depois)
CLERK_WEBHOOK_SECRET=whsec_...

# URLs do Clerk
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/studio
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/studio

# ===== APP =====
NEXT_PUBLIC_APP_URL=https://seu-app.vercel.app
# ☝️ Substitua pelo domínio que a Vercel gerou

# ===== VERCEL BLOB =====
# Vamos configurar na próxima seção
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# ===== ADMIN =====
ADMIN_EMAILS=seu@email.com
# ☝️ Email que terá acesso ao /admin
```

#### 🟢 OPCIONAIS (mas recomendadas)

```env
# Google Drive (para backup de criativos)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_GOOGLE_API_KEY=...

# Make.com (para webhooks de geração)
MAKE_WEBHOOK_ANALYZE_URL=...
MAKE_WEBHOOK_CREATIVE_URL=...

# AI Providers (se for usar chat)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

**💡 Dica:** Configure em **All Environments** para funcionar em preview e produção.

---

## Configuração Pós-Deploy

### 1. Configurar Vercel Blob Storage

**O que é:** Armazenamento para logos, fontes, elementos gráficos.

**Como configurar:**

1. No dashboard da Vercel, vá em **Storage** → **Create** → **Blob**
2. Nome: `studio-lagosta-blob`
3. Clique em **Create**
4. **Copie o token** (`BLOB_READ_WRITE_TOKEN`)
5. Adicione nas **Environment Variables**
6. **Redeploy** (Settings → Deployments → Latest → ⋯ → Redeploy)

### 2. Aplicar Schema ao Banco de Dados

**Método A: Via Prisma (Recomendado)**

```bash
# 1. Puxar variáveis da Vercel
vercel env pull .env.production

# 2. Aplicar schema
DATABASE_URL="sua-url-aqui" npx prisma db push

# 3. Verificar
DATABASE_URL="sua-url-aqui" npx prisma studio
```

**Método B: Via SQL Dump**

```bash
# Se fez backup antes
cd backups/YYYY-MM-DD_HH-MM-SS/

# Aplicar schema
psql "sua-database-url" < schema.sql

# Importar configs (opcional)
./import.sh "sua-database-url"
```

### 3. Configurar Webhook do Clerk

**O que faz:** Sincroniza usuários do Clerk com o banco de dados.

**Como configurar:**

1. Acesse https://studio.clerk.com
2. Selecione sua aplicação
3. Vá em **Webhooks** → **Add Endpoint**
4. Configure:
   ```
   Endpoint URL: https://seu-app.vercel.app/api/webhooks/clerk

   Events to listen:
   ✅ user.created
   ✅ user.updated
   ✅ user.deleted
   ```
5. Clique em **Create**
6. **Copie o Signing Secret** (whsec_...)
7. Adicione como `CLERK_WEBHOOK_SECRET` na Vercel
8. **Redeploy** na Vercel

### 4. Primeiro Acesso

1. **Acesse seu app:** `https://seu-app.vercel.app`

2. **Faça Sign Up:**
   - Crie sua conta
   - Webhook criará usuário automaticamente no banco

3. **Verifique o Admin:**
   - Acesse `/admin`
   - Se configurou `ADMIN_EMAILS` corretamente, deve funcionar

4. **Configure Settings:**
   - `/admin/settings/features` - Custos de features
   - `/admin/settings/plans` - Sync com Clerk billing

---

## Verificação

### Checklist Completo

```bash
# 1. Site carrega
✅ https://seu-app.vercel.app deve carregar a landing page

# 2. Sign up funciona
✅ Criar conta
✅ Receber email de verificação
✅ Login funcionar

# 3. Banco de dados
✅ Usuário criado no banco (via webhook)
✅ CreditBalance criado automaticamente

# 4. Dashboard
✅ /studio acessível
✅ Pode criar projeto
✅ Upload de logo funciona (precisa de BLOB_READ_WRITE_TOKEN)

# 5. Admin
✅ /admin acessível (se ADMIN_EMAILS configurado)
✅ Pode ver usuários
✅ Pode ajustar créditos

# 6. Funcionalidades principais
✅ Criar projeto
✅ Upload de logo/elementos/fontes
✅ Criar template
✅ Gerar criativo
```

### Verificação no Banco

```bash
# Conectar ao banco de produção
psql "sua-database-url"

# Verificar usuários
SELECT id, "clerkId", email, name FROM "User";

# Verificar créditos
SELECT u.email, cb."creditsRemaining"
FROM "CreditBalance" cb
JOIN "User" u ON cb."userId" = u.id;

# Verificar projetos
SELECT id, name, "userId" FROM "Project";
```

---

## Troubleshooting

### ❌ Build falha na Vercel

**Erro:** `Can't reach database server`

**Solução:**
✅ Já corrigido! A landing page não acessa mais o banco durante build.

Se ainda der erro:
```bash
# Testar build local
npm run build

# Se funcionar local, verificar:
# 1. Node version na Vercel (Settings → General → Node.js Version)
# 2. Deve ser 18.x ou superior
```

### ❌ "BLOB_READ_WRITE_TOKEN not configured"

**Solução:**
1. Criar Blob Storage na Vercel
2. Copiar token
3. Adicionar em Environment Variables
4. Redeploy

### ❌ Webhook do Clerk não funciona

**Sintomas:** Usuário não é criado no banco após sign up

**Solução:**
```bash
# 1. Verificar URL no Clerk Dashboard
https://seu-app.vercel.app/api/webhooks/clerk

# 2. Verificar secret
# CLERK_WEBHOOK_SECRET deve estar na Vercel

# 3. Testar manualmente
# Clerk Dashboard → Webhooks → Send Test Event

# 4. Ver logs
# Vercel → Deployments → Latest → Functions
```

### ❌ "Forbidden" ao acessar /admin

**Solução:**
```bash
# Verificar ADMIN_EMAILS
# Settings → Environment Variables → ADMIN_EMAILS

# Deve conter o email exato que você usou no sign up
ADMIN_EMAILS=seuemail@exemplo.com

# Se mudou, redeploy
```

### ❌ Upload de arquivo falha

**Solução:**
1. Verificar `BLOB_READ_WRITE_TOKEN`
2. Criar Blob Storage se não criou
3. Redeploy após adicionar token

### ❌ Database connection timeout

**Para Neon/Supabase:**
```bash
# Verificar IP whitelist
# Neon/Supabase Dashboard → Settings → Security
# Adicionar: 0.0.0.0/0 (permitir todos)

# Vercel usa IPs dinâmicos
```

---

## 🎯 Resumo: Deploy em 10 Passos

1. ✅ Verificar build local: `npm run deploy:check`
2. ✅ Criar banco de dados (Neon/Vercel/Supabase)
3. ✅ Push para GitHub: `git push`
4. ✅ Importar na Vercel: https://vercel.com/new
5. ✅ Configurar Environment Variables
6. ✅ Deploy!
7. ✅ Criar Blob Storage
8. ✅ Aplicar schema: `prisma db push`
9. ✅ Configurar webhook do Clerk
10. ✅ Testar: Sign up + Dashboard + Admin

---

## 📚 Documentação Adicional

- **Deploy rápido:** `DEPLOY-QUICKSTART.md`
- **Migração de dados:** `DEPLOY-DATABASE-MIGRATION.md`
- **Configurar Blob:** `SETUP-BLOB.md`
- **Docs da Vercel:** `VERCEL-DEPLOY.md`

---

## 💡 Próximos Passos Pós-Deploy

### Configuração Inicial

1. **Configurar Planos de Billing**
   - Criar planos no Clerk
   - Sync em `/admin/settings/plans`

2. **Configurar Custos de Features**
   - `/admin/settings/features`
   - Definir créditos por operação

3. **Configurar Google Drive** (opcional)
   - Para backup de criativos
   - Ver `SETUP-GOOGLE-DRIVE.md`

### Customização

1. **Domínio Custom**
   - Vercel → Settings → Domains
   - Adicionar seu domínio

2. **Analytics**
   - Adicionar Google Analytics
   - Configurar GTM

3. **Monitoring**
   - Vercel Analytics (grátis)
   - Sentry para erros

---

**🎉 Parabéns! Seu Studio Lagosta está no ar!**

**URL do seu app:** https://seu-app.vercel.app

Precisa de ajuda? Veja os outros guias em `docs/` ou `AGENTS.md`
