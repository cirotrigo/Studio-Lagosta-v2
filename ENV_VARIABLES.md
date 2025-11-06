# Guia de Variáveis de Ambiente para Produção

Este documento lista todas as variáveis de ambiente necessárias para colocar o Studio Lagosta em produção com domínio customizado.

---

## 🔑 Variáveis Obrigatórias

Estas variáveis **DEVEM** estar configuradas para a aplicação funcionar:

### Database (Prisma)
```bash
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```
- **Onde conseguir:** Neon, Supabase, Railway, ou outro provedor PostgreSQL
- **Importante:** Adicione `?sslmode=require` ao final para conexões seguras

### Clerk (Autenticação)
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```
- **Onde conseguir:** [clerk.com/studio](https://studio.clerk.com) → Seu projeto → API Keys
- **Importante:** Use as chaves de **Production** para o domínio real

### App URL
```bash
NEXT_PUBLIC_APP_URL="https://www.lagostacriativa.com.br"
```
- **Valor local:** `http://localhost:3000`
- **Valor produção:** `https://www.lagostacriativa.com.br`
- **Importante:** Não coloque `/` no final

---

## 🔧 Variáveis Opcionais (Funcionalidades Extras)

### Google Drive (Upload de Arquivos)
```bash
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="https://www.lagostacriativa.com.br/google-drive-callback"
```
- **Onde conseguir:** [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
- **O que faz:** Permite integração com Google Drive para upload de assets

### Vercel Blob (Armazenamento de Arquivos)
```bash
BLOB_READ_WRITE_TOKEN="vercel_blob_..."
```
- **Onde conseguir:** Vercel Dashboard → Storage → Create Database → Blob
- **O que faz:** Armazena imagens, vídeos e arquivos exportados
- **Alternativa:** Configure outro provider de storage se preferir

### Replicate (Geração de Imagens AI)
```bash
REPLICATE_API_TOKEN="r8_..."
```
- **Onde conseguir:** [replicate.com](https://replicate.com) → Account → API Tokens
- **O que faz:** Permite gerar imagens com IA usando modelos do Replicate
- **Custo:** Pay-per-use baseado no modelo utilizado

### OpenAI (Recursos de IA)
```bash
OPENAI_API_KEY="sk-..."
```
- **Onde conseguir:** [platform.openai.com](https://platform.openai.com) → API Keys
- **O que faz:** Recursos de IA como geração de texto, análise, etc.
- **Custo:** Pay-per-use baseado no modelo e tokens utilizados

### Meta/Facebook Ads (Instagram Integration)
```bash
META_ACCESS_TOKEN="your-long-lived-token"
META_APP_ID="your-app-id"
META_APP_SECRET="your-app-secret"
```
- **Onde conseguir:** [developers.facebook.com](https://developers.facebook.com) → Seus Apps
- **O que faz:** Permite postar automaticamente no Instagram
- **Importante:** Token deve ser de longa duração (long-lived)

### Zapier (Automações)
```bash
ZAPIER_WEBHOOK_SECRET="your-webhook-secret"
```
- **Onde conseguir:** Configure no seu Zap
- **O que faz:** Recebe webhooks para automações
- **Veja:** `ZAPIER_FINAL_MAPPING.md` para mais detalhes

---

## 📊 Analytics (Opcional mas Recomendado)

### Google Analytics
```bash
NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX"
```
- **Onde conseguir:** [analytics.google.com](https://analytics.google.com) → Admin → Data Streams
- **O que faz:** Rastreamento de visitantes e comportamento no site

### Google Tag Manager
```bash
NEXT_PUBLIC_GTM_ID="GTM-XXXXXXX"
```
- **Onde conseguir:** [tagmanager.google.com](https://tagmanager.google.com)
- **O que faz:** Gerenciamento centralizado de tags e pixels

### Meta Pixel (Facebook Pixel)
```bash
NEXT_PUBLIC_FACEBOOK_PIXEL_ID="123456789012345"
```
- **Onde conseguir:** [business.facebook.com](https://business.facebook.com) → Events Manager
- **O que faz:** Rastreamento para anúncios do Facebook/Instagram

---

## ⚙️ Como Configurar na Vercel

### Método 1: Via Dashboard (Recomendado)

1. Acesse [vercel.com](https://vercel.com)
2. Selecione seu projeto **Studio-Lagosta-v2**
3. Vá em **Settings** → **Environment Variables**
4. Para cada variável:
   - Clique em **Add Variable**
   - Cole o nome (ex: `DATABASE_URL`)
   - Cole o valor
   - Selecione os ambientes (Production, Preview, Development)
   - Clique em **Save**

### Método 2: Via CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Adicionar variável
vercel env add DATABASE_URL production
```

---

## 🔄 Quando Atualizar Variáveis

Após adicionar/atualizar variáveis de ambiente, você **DEVE fazer redeploy**:

### Via Dashboard:
1. Vá em **Deployments**
2. Clique nos 3 pontinhos do último deploy
3. Clique em **Redeploy**

### Via CLI:
```bash
vercel --prod
```

---

## 🧪 Como Testar Localmente

### 1. Criar arquivo `.env.local`

Crie o arquivo na raiz do projeto:

```bash
# .env.local (NÃO COMMITAR NO GIT!)

# Database
DATABASE_URL="postgresql://localhost:5432/studio_lagosta"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Opcionais (adicione se necessário)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
REPLICATE_API_TOKEN="..."
OPENAI_API_KEY="..."
```

### 2. Rodar localmente

```bash
npm run dev
```

### 3. Verificar se as variáveis estão carregando

No código, adicione temporariamente:
```typescript
console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL)
console.log('CLERK_KEY configured:', !!process.env.CLERK_SECRET_KEY)
```

---

## ✅ Checklist de Configuração

Antes de ir para produção, verifique:

### Essencial
- [ ] `DATABASE_URL` configurada e testada
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` configurada
- [ ] `CLERK_SECRET_KEY` configurada
- [ ] `NEXT_PUBLIC_APP_URL` com o domínio correto
- [ ] Chaves do Clerk são de **Production** (não test)

### Clerk Configuration
- [ ] Domínio adicionado no Clerk Dashboard
- [ ] Sign-in URL atualizada
- [ ] Sign-up URL atualizada
- [ ] After sign-in redirect configurado
- [ ] After sign-up redirect configurado

### Funcionalidades Extras (se usar)
- [ ] Google Drive configurado
- [ ] Vercel Blob configurado
- [ ] Replicate API configurada
- [ ] OpenAI API configurada
- [ ] Meta/Instagram tokens configurados

### Analytics
- [ ] Google Analytics ID configurado
- [ ] Meta Pixel ID configurado
- [ ] GTM ID configurado (se usar)

---

## 🔒 Segurança

### ⚠️ NUNCA faça isso:

❌ Commitar arquivo `.env` ou `.env.local` no Git
❌ Expor chaves secretas em código client-side
❌ Usar chaves de desenvolvimento em produção
❌ Compartilhar chaves em chats ou emails

### ✅ Sempre faça isso:

✅ Use variáveis de ambiente
✅ Adicione `.env*` no `.gitignore`
✅ Use chaves diferentes para dev e produção
✅ Rotacione chaves periodicamente
✅ Use variáveis `NEXT_PUBLIC_*` apenas para dados públicos

---

## 🐛 Troubleshooting

### Erro: "DATABASE_URL is not defined"

**Solução:**
1. Verifique se a variável está no Vercel Dashboard
2. Faça redeploy do projeto
3. Verifique se o nome está correto (case-sensitive)

### Erro: "Clerk authentication failed"

**Solução:**
1. Verifique se está usando chaves de **Production** no Clerk
2. Confirme que o domínio está adicionado no Clerk Dashboard
3. Limpe cache e cookies do navegador
4. Faça redeploy após atualizar as chaves

### Erro: "Invalid DATABASE_URL format"

**Solução:**
1. Verifique o formato: `postgresql://user:pass@host:port/db`
2. Adicione `?sslmode=require` ao final
3. Escape caracteres especiais na senha (use URL encoding)
4. Teste a conexão com uma ferramenta como `psql` ou DataGrip

### Variáveis não aparecem no código

**Solução:**
1. Reinicie o servidor de desenvolvimento (`npm run dev`)
2. No Vercel, faça um novo deploy
3. Verifique se usou `NEXT_PUBLIC_` para variáveis client-side
4. Limpe `.next` folder e faça rebuild

---

## 📚 Referências

- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Clerk Production Checklist](https://clerk.com/docs/deployments/production-checklist)
- [Prisma Connection URLs](https://www.prisma.io/docs/reference/database-reference/connection-urls)

---

**Data de criação:** 2025-01-06
**Última atualização:** 2025-01-06
