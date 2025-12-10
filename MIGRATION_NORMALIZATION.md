# Migration Normalization Guide

## 📋 Sumário

Este documento guia o processo de normalização do histórico de migrations do Prisma no projeto Studio Lagosta v2.

## 🚨 Problema Identificado

O histórico de migrations está incompleto:
- **Não existe migration baseline** que crie as tabelas centrais (User, Project, Generation, Template, etc.)
- **Migrations antigas fazem ALTER em tabelas inexistentes** usando verificações condicionais (`IF EXISTS`)
- **Foreign Keys inconsistentes**: MusicLibrary, VideoProcessingJob, YoutubeDownloadJob têm FKs condicionais
- **Schema drift**: Campo `organizationId` em MusicLibrary na migration mas não no schema.prisma

## 🎯 Objetivos

1. ✅ Criar migration baseline com todas as tabelas do schema.prisma atual
2. ✅ Marcar migrations antigas como no-op
3. ✅ Garantir FKs corretos e consistentes
4. ✅ Validar com shadow database
5. ✅ Documentar processo de aplicação segura

## 🔄 Estratégia de Normalização

### Opção 1: Reset Completo (Recomendado para Dev/Staging)

**Cenário**: Ambiente de desenvolvimento ou staging sem dados críticos

```bash
# 1. Backup manual (via interface do Neon/Vercel)
# Acesse: https://console.neon.tech > Seu Database > Backups

# 2. Deletar migrations antigas
rm -rf prisma/migrations

# 3. Criar migration baseline
npx prisma migrate dev --name baseline --create-only

# 4. Editar a migration gerada para ser idempotente (usar CREATE TABLE IF NOT EXISTS)

# 5. Aplicar e marcar como aplicada
npx prisma migrate resolve --applied baseline
npx prisma migrate deploy
```

### Opção 2: Manter Histórico (Produção)

**Cenário**: Ambiente de produção com dados críticos

```bash
# 1. Backup obrigatório (ver seção Backup)

# 2. Criar migration de reconciliação
npx prisma migrate dev --name reconcile_schema --create-only

# 3. Editar migration para:
#    - Adicionar tabelas faltantes (IF NOT EXISTS)
#    - Corrigir FKs faltantes
#    - Remover campos obsoletos (organizationId do MusicLibrary)

# 4. Validar em staging primeiro

# 5. Aplicar em produção
npx prisma migrate deploy
```

## 💾 Backup Manual do Banco

### Via Neon Console (Recomendado)

1. Acesse: https://console.neon.tech
2. Selecione seu projeto
3. Vá em **Branches** > Seu branch (main/production)
4. Clique em **Create branch** para criar snapshot antes das alterações
5. Ou baixe backup via SQL:

```sql
-- Execute no Neon SQL Editor
-- Salve o resultado em arquivo .sql

-- Backup de schema
SELECT
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Backup de dados críticos (exemplo)
COPY (SELECT * FROM "User") TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM "Project") TO STDOUT WITH CSV HEADER;
-- Repita para tabelas críticas
```

### Via CLI (Se pg_dump estiver configurado)

```bash
# Instalar PostgreSQL client compatível (v17)
# macOS:
brew install postgresql@17

# Ubuntu:
sudo apt-get install postgresql-client-17

# Fazer backup
pg_dump $DATABASE_URL > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Comprimir
gzip backups/backup_*.sql
```

### Via Vercel Dashboard

Se estiver usando Vercel Postgres:
1. Acesse: https://vercel.com/dashboard
2. Vá em seu projeto > Storage > Postgres
3. Clique em **Backups** > **Create backup**

## 📝 Problemas Específicos Identificados

### 1. MusicLibrary

**Problema**: Migration tem campo `organizationId` mas schema.prisma não
```sql
-- Migration 20250201090000_add_youtube_download_jobs
"organizationId" TEXT,  -- ❌ NÃO existe no schema.prisma
```

**Solução**: Remover campo na migration de reconciliação
```sql
ALTER TABLE "MusicLibrary" DROP COLUMN IF EXISTS "organizationId";
```

### 2. VideoProcessingJob

**Problema**: Tabela criada sem FKs para Project
```sql
-- Migration não adiciona FK para Project
CREATE TABLE IF NOT EXISTS "VideoProcessingJob" (
  "projectId" INTEGER NOT NULL,  -- FK faltante!
  ...
);
```

**Solução**: Adicionar FK na migration de reconciliação
```sql
ALTER TABLE "VideoProcessingJob"
  ADD CONSTRAINT IF NOT EXISTS "VideoProcessingJob_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

### 3. YoutubeDownloadJob

**Problema**: FK para Project é condicional (pode não ter sido criada)
```sql
-- Migration usa IF EXISTS (pode falhar)
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Project') THEN
  ALTER TABLE "YoutubeDownloadJob" ADD CONSTRAINT ...
```

**Solução**: Garantir FK existe
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'YoutubeDownloadJob_projectId_fkey'
  ) THEN
    ALTER TABLE "YoutubeDownloadJob"
      ADD CONSTRAINT "YoutubeDownloadJob_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
```

### 4. KnowledgeBaseEntry

**Problema**: Tabela pode não existir
```sql
-- Schema.prisma define a tabela, mas não há migration que a cria
model KnowledgeBaseEntry {
  id          String           @id @default(cuid())
  projectId   Int
  ...
  @@map("knowledge_base_entries")
}
```

**Solução**: Criar tabela na baseline ou reconciliação
```sql
CREATE TABLE IF NOT EXISTS "knowledge_base_entries" (
  -- Definição completa conforme schema.prisma
);
```

## 🔍 Validação

### 1. Verificar estado atual do banco

```sql
-- Listar todas as tabelas
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Verificar FKs existentes
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
```

### 2. Verificar migrations aplicadas

```sql
SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC;
```

### 3. Validar schema com Prisma

```bash
# Verificar drift entre schema.prisma e banco
npx prisma migrate status

# Validar schema
npx prisma validate

# Gerar tipos TypeScript
npx prisma generate
```

## 📦 Arquivos Criados

### Scripts de Backup

- `scripts/backup-database.sh` - Backup via pg_dump (requer versão compatível)
- `scripts/backup-database-docker.sh` - Backup via Docker (requer Docker rodando)

### Migrations

- `prisma/migrations/00000000000000_baseline/` - Migration baseline (a ser criada)
- `prisma/migrations/99999999999999_reconcile_schema/` - Migration de reconciliação (a ser criada)

## ⚠️ Avisos Importantes

1. **SEMPRE faça backup antes de aplicar migrations em produção**
2. **Teste em staging primeiro**
3. **Migrations são irreversíveis** (não há rollback automático)
4. **Shadow database** precisa estar configurada para `prisma migrate dev`
5. **Não delete migrations aplicadas** em produção (apenas marque como no-op)

## 🚀 Próximos Passos

1. ✅ Criar backup manual do banco (via Neon/Vercel Console)
2. ⏳ Gerar migration baseline
3. ⏳ Validar em ambiente de desenvolvimento
4. ⏳ Aplicar em staging
5. ⏳ Aplicar em produção

## 📞 Suporte

Em caso de problemas:
1. Verifique logs da migration: `prisma/migrations/<timestamp>/migration.sql`
2. Consulte documentação Prisma: https://www.prisma.io/docs/concepts/components/prisma-migrate
3. Verifique estado do banco: `npx prisma migrate status`
