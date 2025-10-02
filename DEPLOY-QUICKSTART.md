# ⚡ Deploy Rápido na Vercel

## Problema Resolvido

O erro `Can't reach database server at 127.0.0.1:5432` foi corrigido! A landing page agora funciona mesmo sem banco de dados durante o build.

---

## 🚀 Deploy em 5 Minutos

### 1. Preparar Ambiente

```bash
# Verificar se está tudo OK
npm run deploy:check
```

### 2. Criar Banco de Dados

**Escolha uma opção:**

**A) Vercel Postgres** (Recomendado)
- Vá em https://vercel.com/dashboard
- Storage → Create → Postgres
- Copie a `DATABASE_URL`

**B) Neon** (Gratuito)
- https://neon.tech → New Project
- Copie a connection string

**C) Supabase**
- https://supabase.com → New Project
- Settings → Database → Copy connection string

### 3. Deploy na Vercel

**Via GitHub (Mais Fácil):**

1. Push para GitHub:
```bash
git add .
git commit -m "feat: ready for production"
git push
```

2. Importar na Vercel:
   - https://vercel.com/new
   - Import repository
   - Configure variáveis (próximo passo)
   - Deploy!

**Via CLI:**

```bash
# Instalar CLI
npm i -g vercel

# Deploy
vercel

# Production
vercel --prod
```

### 4. Configurar Variáveis na Vercel

No dashboard da Vercel, vá em **Settings → Environment Variables**:

#### Mínimas Obrigatórias:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Clerk (pegue em https://dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
NEXT_PUBLIC_APP_URL=https://SEU-APP.vercel.app

# Blob Storage (crie em Vercel Dashboard)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Admin
ADMIN_EMAILS=seu@email.com
```

### 5. Rodar Migrações

```bash
# Puxar variáveis
vercel env pull .env.production

# Rodar migrations
DATABASE_URL="sua-url-aqui" npx prisma migrate deploy
```

Ou use o schema direto:

```bash
DATABASE_URL="sua-url-aqui" npx prisma db push
```

### 6. Configurar Webhook do Clerk

1. Clerk Dashboard → Webhooks
2. Create endpoint
3. URL: `https://SEU-APP.vercel.app/api/webhooks/clerk`
4. Events: `user.created`, `user.updated`
5. Copie o secret e adicione como `CLERK_WEBHOOK_SECRET` na Vercel

---

## ✅ Pronto!

Acesse seu app: `https://SEU-APP.vercel.app`

---

## 🔍 Verificações

- [ ] Landing page carrega
- [ ] Sign up funciona
- [ ] Dashboard acessível
- [ ] Upload de arquivo funciona
- [ ] Admin page acessível

---

## 🆘 Problemas?

### Build falha

```bash
# Teste localmente
npm run build

# Se funcionar local, verifique:
# 1. Variáveis de ambiente na Vercel
# 2. Node version (deve ser 18+)
```

### Database error

```bash
# Teste conexão
psql "sua-database-url"

# Verifique:
# 1. DATABASE_URL correta na Vercel
# 2. IP da Vercel na whitelist (Neon/Supabase)
```

### Webhook não funciona

```bash
# Verifique:
# 1. URL correta no Clerk
# 2. CLERK_WEBHOOK_SECRET na Vercel
# 3. Teste manual no Clerk Dashboard
```

---

## 📚 Docs Completos

Veja `VERCEL-DEPLOY.md` para instruções detalhadas.

---

## 💡 Dicas

1. **Use Vercel Postgres**: Mais fácil de configurar
2. **Configure Blob Storage**: Necessário para uploads
3. **Teste localmente primeiro**: `npm run build`
4. **Use environment preview**: Para testar antes da produção
5. **Configure domínio custom**: Mais profissional

---

**Deploy feito? Celebre! 🎉**
