# 🗄️ Migração do Banco de Dados Local para Produção

## Situação Atual

Você já tem um banco de dados PostgreSQL local funcionando em:
- **Host**: `127.0.0.1:5432`
- **Database**: `saas_template`
- **Dados existentes**:
  - 1 usuário
  - 1 projeto
  - 1 template
  - Configurações de admin e planos

## 🎯 Objetivo

Migrar toda a estrutura e dados para um banco de produção na Vercel/Neon/Supabase.

---

## 📋 Opções de Deploy

### Opção 1: Banco Novo + Recriar Dados (Recomendado) ⭐

**Vantagens:**
- Mais limpo e seguro
- Evita problemas de conflito de IDs
- Dados de teste não vão para produção

**Processo:**

1. **Criar banco de produção vazio**
2. **Aplicar schema Prisma**
3. **Recriar configurações via Clerk/Admin**

### Opção 2: Migrar Dados Completos

**Vantagens:**
- Mantém todos os dados
- Útil se já tem usuários reais

**Desvantagens:**
- Mais complexo
- Pode ter conflitos com Clerk IDs

---

## 🚀 Opção 1: Deploy com Banco Novo (RECOMENDADO)

### Passo 1: Criar Banco de Produção

#### A) Vercel Postgres (Mais Fácil)

```bash
# 1. Acesse https://vercel.com/dashboard
# 2. Seu Projeto → Storage → Create → Postgres
# 3. Nome: studio-lagosta-db
# 4. Região: US East (mais próxima)
# 5. Copie a DATABASE_URL
```

#### B) Neon (Gratuito)

```bash
# 1. https://neon.tech
# 2. New Project → Nome: studio-lagosta
# 3. Região: US East
# 4. Copie a Connection String
```

#### C) Supabase

```bash
# 1. https://supabase.com
# 2. New Project → Nome: studio-lagosta
# 3. Database Password: [escolha uma senha forte]
# 4. Settings → Database → Connection String (Transaction Mode)
```

### Passo 2: Aplicar Schema ao Banco de Produção

```bash
# 1. Exportar DATABASE_URL de produção
export DATABASE_URL="postgresql://user:pass@host/db"

# 2. Aplicar schema
npx prisma db push

# Ou criar migrations
npx prisma migrate deploy

# 3. Verificar
npx prisma studio
```

### Passo 3: Deploy na Vercel

```bash
# 1. Commit das mudanças
git add .
git commit -m "feat: ready for production deployment"
git push

# 2. Importar na Vercel
# https://vercel.com/new
# - Import repository
# - Configure environment variables (ver abaixo)
```

### Passo 4: Configurar Variáveis de Ambiente na Vercel

```env
# Database
DATABASE_URL=postgresql://... (da Neon/Supabase/Vercel)

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# URLs do Clerk
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# App URL
NEXT_PUBLIC_APP_URL=https://seu-app.vercel.app

# Vercel Blob (para uploads)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Admin
ADMIN_EMAILS=seu@email.com
```

### Passo 5: Configurar Webhook do Clerk

```bash
# 1. Clerk Dashboard → Webhooks → Create
# 2. Endpoint URL: https://seu-app.vercel.app/api/webhooks/clerk
# 3. Events: user.created, user.updated, user.deleted
# 4. Copie o Signing Secret
# 5. Adicione como CLERK_WEBHOOK_SECRET na Vercel
```

### Passo 6: Primeiro Acesso

```bash
# 1. Acesse: https://seu-app.vercel.app
# 2. Faça Sign Up (cria primeiro usuário)
# 3. Acesse /admin/settings para configurar:
#    - Feature costs
#    - Billing plans (sync com Clerk)
```

---

## 🔄 Opção 2: Migrar Dados do Local para Produção

**⚠️ ATENÇÃO:** Só use se realmente precisa dos dados locais em produção!

### Passo 1: Dump do Banco Local

```bash
# 1. Fazer backup completo
pg_dump -h 127.0.0.1 -U postgres -d saas_template \
  --no-owner --no-acl \
  --exclude-table=_prisma_migrations \
  --data-only \
  > backup_local.sql

# 2. Ou só dados específicos
pg_dump -h 127.0.0.1 -U postgres -d saas_template \
  --table=AdminSettings \
  --table=Plan \
  --data-only \
  > backup_configs.sql
```

### Passo 2: Preparar Banco de Produção

```bash
# 1. Criar banco de produção (ver Passo 1 da Opção 1)

# 2. Aplicar schema
DATABASE_URL="postgresql://..." npx prisma db push

# 3. Verificar estrutura
DATABASE_URL="postgresql://..." npx prisma studio
```

### Passo 3: Importar Dados

```bash
# CUIDADO: Isso sobrescreve dados!

# 1. Restaurar backup
psql "postgresql://user:pass@host/db" < backup_configs.sql

# Ou só tabelas específicas
psql "postgresql://..." < backup_specific.sql
```

### Passo 4: Ajustar IDs do Clerk

**PROBLEMA:** Os `clerkId` do local não funcionarão em produção!

**SOLUÇÃO:**

```sql
-- Conectar ao banco de produção
psql "postgresql://..."

-- 1. Ver usuários atuais
SELECT id, "clerkId", email FROM "User";

-- 2. Deletar usuários de teste
DELETE FROM "User" WHERE email LIKE '%@example.com';

-- 3. Ajustar foreign keys se necessário
-- (depende dos dados que você importou)
```

### Passo 5: Recriar Usuário via Sign Up

```bash
# 1. Acesse seu app em produção
# 2. Faça Sign Up normalmente
# 3. Webhook do Clerk criará usuário automaticamente
# 4. Vincule dados antigos se necessário (manualmente via SQL)
```

---

## 🎨 Caso Específico: Studio Lagosta

Baseado na análise do código, você tem um **sistema de geração de criativos**. Aqui está o que fazer:

### Dados que DEVEM ir para produção:

✅ **AdminSettings** - Custos de features
✅ **Plan** - Planos de billing
✅ **FeatureCosts** - Configuração de créditos

### Dados que NÃO devem ir:

❌ **User** - Recriar via Clerk
❌ **Project** - Projetos de teste
❌ **Template** - Templates de teste
❌ **Generation** - Gerações de teste
❌ **CreditBalance** - Recriado automaticamente

### Script de Migração Seletiva:

```bash
#!/bin/bash
# migrate-configs.sh

# 1. Exportar apenas configurações
pg_dump -h 127.0.0.1 -U postgres -d saas_template \
  --table=AdminSettings \
  --table=Plan \
  --data-only \
  --column-inserts \
  > production_configs.sql

# 2. Aplicar no banco de produção
echo "Cole a DATABASE_URL de produção:"
read PROD_DB_URL

psql "$PROD_DB_URL" < production_configs.sql

echo "✅ Configurações migradas!"
echo "Próximo passo: Sign up para criar primeiro usuário"
```

---

## 📊 Verificação Pós-Deploy

### Checklist de Testes:

```bash
# 1. Landing page carrega
curl https://seu-app.vercel.app

# 2. Sign up funciona
# - Acesse /sign-up
# - Crie conta
# - Verifique webhook do Clerk

# 3. Banco de dados
psql "postgresql://..." -c "SELECT COUNT(*) FROM \"User\";"
psql "postgresql://..." -c "SELECT COUNT(*) FROM \"Plan\";"

# 4. Admin funciona
# - Acesse /admin (com email de ADMIN_EMAILS)
# - Verifique settings
# - Teste sync de planos

# 5. Features principais
# - Upload de logo
# - Criação de projeto
# - Geração de criativo
```

---

## 🔧 Troubleshooting

### "Prisma Client not found"

```bash
# Na Vercel, adicione build command:
prisma generate && next build
```

### "Can't connect to database"

```bash
# 1. Verifique DATABASE_URL na Vercel
# 2. Teste conexão local
psql "postgresql://..."

# 3. Whitelist IPs (Neon/Supabase)
# Vercel usa IPs dinâmicos - habilite "Allow all"
```

### "Clerk webhook não funciona"

```bash
# 1. Verifique URL
https://seu-app.vercel.app/api/webhooks/clerk

# 2. Verifique secret
# CLERK_WEBHOOK_SECRET deve estar na Vercel

# 3. Teste manual no Clerk Dashboard
```

### "Dados antigos não aparecem"

```bash
# Se migrou dados mas não vê:
# 1. Verificar se importou corretamente
psql "postgresql://..." -c "SELECT * FROM \"Plan\";"

# 2. Verificar foreign keys
# User.id deve existir antes de CreditBalance

# 3. Recriar via admin/settings se necessário
```

---

## 💡 Recomendação Final

**Para o Studio Lagosta, recomendo:**

1. ✅ **Opção 1**: Banco novo limpo
2. ✅ Migrar **apenas** AdminSettings e Plans (se configurados)
3. ✅ Recriar usuários via Sign up
4. ✅ Testar criação de projetos/templates em produção

**Motivos:**
- Dados de desenvolvimento não poluem produção
- Evita conflitos de Clerk IDs
- Mais fácil de debugar
- Segue best practices

---

## 📚 Arquivos de Referência

- Schema completo: `prisma/schema.prisma`
- Ambiente local: `.env`
- Docs de auth: `docs/authentication.md`
- Docs de database: `docs/database.md`

---

**Pronto para o deploy? Comece pela Opção 1! 🚀**
