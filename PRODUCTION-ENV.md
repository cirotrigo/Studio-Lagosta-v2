# 🚀 Variáveis de Ambiente para Produção

## ✅ Checklist de Configuração

Antes de fazer deploy em produção (Vercel), configure estas variáveis de ambiente:

### 1. **Clerk (Autenticação)** - OBRIGATÓRIO
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
```

**Como obter:**
1. Acesse [Clerk Dashboard](https://studio.clerk.com)
2. Selecione seu projeto de produção
3. API Keys → Copie as chaves de **Production**

### 2. **Database (PostgreSQL)** - OBRIGATÓRIO
```bash
DATABASE_URL=postgresql://...
```

**Como obter:**
1. Use Vercel Postgres, Supabase ou Neon
2. Copie a connection string

### 3. **OpenAI (Embeddings & Chat)** - OBRIGATÓRIO para Base de Conhecimento
```bash
OPENAI_API_KEY=sk-proj-...
```

**Como obter:**
1. Acesse [OpenAI Platform](https://platform.openai.com/api-keys)
2. Crie uma nova API key
3. **IMPORTANTE**: Esta key é usada para:
   - Gerar embeddings da base de conhecimento
   - Chat com modelos OpenAI (GPT-4o, GPT-4o-mini)

### 4. **Upstash Vector (RAG)** - OBRIGATÓRIO para Base de Conhecimento
```bash
UPSTASH_VECTOR_REST_URL=https://...upstash.io
UPSTASH_VECTOR_REST_TOKEN=...
```

**Como obter:**
1. Acesse [Upstash Console](https://console.upstash.com)
2. Crie um Vector Database
3. **Configuração importante:**
   - Dimensions: `1536` (para text-embedding-3-small da OpenAI)
   - Metric: `COSINE`
   - Region: Escolha próximo aos seus usuários
4. Copie REST URL e REST TOKEN

### 5. **Vercel Blob (Upload de Arquivos)** - Opcional
```bash
BLOB_READ_WRITE_TOKEN=...
```

**Como obter:**
1. No projeto Vercel → Storage → Create Database → Blob
2. Token será gerado automaticamente

### 6. **Admin Access** - Recomendado
```bash
ADMIN_EMAILS=seu-email@example.com
ADMIN_USER_IDS=user_... (Clerk User ID)
```

### 7. **Outros Provedores de IA** - Opcional

**Anthropic (Claude):**
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Google (Gemini):**
```bash
GOOGLE_GENERATIVE_AI_API_KEY=...
```

**Mistral:**
```bash
MISTRAL_API_KEY=...
```

**OpenRouter (agregador):**
```bash
OPENROUTER_API_KEY=sk-or-...
```

---

## 📋 Configuração no Vercel

### Via Dashboard:
1. Acesse seu projeto no Vercel
2. Settings → Environment Variables
3. Adicione cada variável acima
4. **IMPORTANTE**: Selecione os ambientes:
   - ✅ Production
   - ✅ Preview (opcional)
   - ✅ Development (opcional)

### Via CLI:
```bash
vercel env add OPENAI_API_KEY
vercel env add UPSTASH_VECTOR_REST_URL
vercel env add UPSTASH_VECTOR_REST_TOKEN
# ... adicione todas as outras
```

---

## 🔍 Validação Pós-Deploy

Após configurar e fazer deploy, teste:

### 1. Teste Autenticação
- ✅ Fazer login
- ✅ Criar conta
- ✅ Mudar organizações

### 2. Teste Base de Conhecimento
- ✅ Adicionar texto à base de conhecimento
- ✅ Verificar se foi indexado (chunks > 0)
- ✅ Fazer pergunta no chat que use o conhecimento

### 3. Teste Chat
- ✅ Enviar mensagem com GPT-4o
- ✅ Verificar se RAG está injetando contexto
- ✅ Criar e carregar conversas

---

## ⚠️ Problemas Comuns

### Erro 500 ao adicionar conhecimento:
**Causa:** OpenAI API key ou Upstash não configurados

**Solução:**
1. Verifique se `OPENAI_API_KEY` está configurado
2. Verifique se `UPSTASH_VECTOR_REST_URL` e `UPSTASH_VECTOR_REST_TOKEN` estão configurados
3. Redeploy após adicionar variáveis

### RAG não está injetando contexto:
**Causa:** Chunks não foram criados ou workspaceId incorreto

**Solução:**
1. Verifique se a entrada tem chunks > 0
2. Verifique se workspaceId corresponde ao orgId do Clerk
3. Use o endpoint `/admin/knowledge/migrate` se necessário

### Erro de autenticação:
**Causa:** Usando development keys em produção

**Solução:**
1. No Clerk Dashboard, mude para Production environment
2. Copie as keys de **Production**, não Development
3. Atualize as variáveis no Vercel

---

## 📚 Recursos

- [Clerk Docs](https://clerk.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Upstash Vector Docs](https://upstash.com/docs/vector/overall/getstarted)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
