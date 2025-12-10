# Instruções para Aplicação da Normalização de Migrations

## 📋 Situação Atual

✅ **Banco de Produção**: Todas as tabelas existem e estão corretas
✅ **Foreign Keys**: Validadas - 53 FKs corretas
✅ **Migration Baseline**: Criada em `prisma/migrations/00000000000001_baseline/`
⚠️ **Histórico**: Migrations aplicadas no banco mas faltam no diretório local

## 🎯 O Que Foi Feito

1. ✅ Análise completa do schema.prisma (52 tabelas, 19 enums)
2. ✅ Verificação do estado do banco (todas tabelas existem)
3. ✅ Criação de migration baseline (00000000000001_baseline)
4. ✅ Scripts de backup criados
5. ✅ Documentação completa

## 🚀 Passos para Aplicar (Ambiente de Desenvolvimento)

### Passo 1: Backup (OBRIGATÓRIO)

✅ **Backup já criado em**: `backups/backup_2025-12-10.json` (7.39 MB, 3,083 registros)

```bash
# Opção A: Usar backup JSON existente (FEITO)
# ✅ Arquivo: backups/backup_2025-12-10.json
# ✅ Data: 10 de Dezembro de 2024
# ✅ Registros: 3,083 (todos os dados críticos)

# Opção B: Criar novo backup JSON
npx tsx scripts/backup-database-json.ts

# Opção C: Via Neon Console (Mais Seguro para Produção)
# Acesse https://console.neon.tech e crie um backup/branch

# Opção D: Via Docker (se Docker estiver rodando)
chmod +x scripts/backup-database-docker.sh
./scripts/backup-database-docker.sh

# Opção E: Via pg_dump local (se tiver PostgreSQL 17 instalado)
pg_dump $DATABASE_URL > backups/backup_manual_$(date +%Y%m%d).sql
gzip backups/backup_manual_*.sql
```

**Instruções de restauração**: [backups/RESTORE_INSTRUCTIONS.md](backups/RESTORE_INSTRUCTIONS.md)

### Passo 2: Marcar Baseline como Aplicada

A migration baseline não deve ser executada (o banco já existe).
Vamos apenas marcá-la como "aplicada" no histórico:

```bash
# Marcar baseline como já aplicada
npx prisma migrate resolve --applied 00000000000001_baseline

# Verificar status
npx prisma migrate status
```

### Passo 3: Validar Estado

```bash
# Verificar se há drift (não deve haver)
npx prisma migrate status

# Gerar client atualizado
npx prisma generate

# Validar schema
npx prisma validate

# Testar conexão
npx tsx scripts/check-db-state.ts
```

### Passo 4: Criar Migrations Futuras

De agora em diante, crie migrations normalmente:

```bash
# Exemplo: adicionar nova coluna
npx prisma migrate dev --name add_new_feature

# Aplicar em produção
npx prisma migrate deploy
```

## 📦 Estrutura de Migrations Normalizada

```
prisma/migrations/
├── 00000000000001_baseline/          # ⭐ Nova baseline (marcada como aplicada)
├── 20241123120000_add_prompt_...     # Migrations antigas (já aplicadas)
├── 20250116120000_create_video_...
├── 20250117130000_add_generation_...
... (outras migrations antigas)
└── [futuras migrations...]            # Novas migrations serão criadas aqui
```

## ⚠️ Problemas Conhecidos e Soluções

### 1. MusicLibrary - Campo `organizationId` Extra

**Problema**: Migration antiga adiciona campo `organizationId` mas schema.prisma não o define.

**Status**: ✅ Verificado no banco - campo NÃO existe (schema correto)

**Ação**: Nenhuma (já está correto)

### 2. VideoProcessingJob - FK para Project

**Status**: ✅ Verificada - FK existe e está correta

**Query de verificação**:
```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'VideoProcessingJob'
  AND constraint_type = 'FOREIGN KEY';
```

### 3. YoutubeDownloadJob - FKs para Project e MusicLibrary

**Status**: ✅ Verificadas - Ambas FKs existem

**FKs presentes**:
- `YoutubeDownloadJob_projectId_fkey` → Project(id)
- `YoutubeDownloadJob_musicId_fkey` → MusicLibrary(id)

### 4. KnowledgeBaseEntry - Nome da Tabela

**Observação**: Tabela usa snake_case (`knowledge_base_entries`) no banco
devido ao `@@map("knowledge_base_entries")` no schema.prisma

**Status**: ✅ Correto - tabela existe com nome mapeado

## 🔍 Comandos de Verificação

### Verificar Migrations Aplicadas

```bash
npx prisma migrate status
```

Resultado esperado:
```
Database schema is up to date!
```

### Verificar Tabelas no Banco

```bash
npx tsx scripts/check-db-state.ts
```

Resultado esperado:
- 52 tabelas
- 53 foreign keys
- Todas tabelas críticas ✅

### Verificar Foreign Keys Específicas

```sql
-- Execute via Neon SQL Editor ou psql
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
  AND tc.table_name IN ('MusicLibrary', 'VideoProcessingJob', 'YoutubeDownloadJob')
ORDER BY tc.table_name;
```

## 🏭 Aplicação em Staging/Produção

### Staging (Teste Primeiro)

```bash
# 1. Backup obrigatório
# Criar branch no Neon Console antes

# 2. Aplicar migrations
DATABASE_URL="<staging-url>" npx prisma migrate deploy

# 3. Verificar
DATABASE_URL="<staging-url>" npx prisma migrate status

# 4. Testar aplicação
npm run build
npm run start
```

### Produção (Após Validar em Staging)

```bash
# 1. Backup CRÍTICO
# Criar backup completo via Neon Console

# 2. Janela de manutenção (opcional mas recomendado)
# Notificar usuários se possível

# 3. Aplicar migrations
DATABASE_URL="<prod-url>" npx prisma migrate deploy

# 4. Verificar
DATABASE_URL="<prod-url>" npx prisma migrate status

# 5. Monitorar logs
# Verificar se aplicação está funcionando normalmente
```

## 🆘 Rollback (Em Caso de Problema)

### Se Migration Baseline Causar Problema

```bash
# 1. Reverter marca de "aplicada"
# (Não há rollback automático, mas podemos remover da tabela _prisma_migrations)

# 2. Restaurar backup
gunzip -c backups/latest.sql.gz | psql $DATABASE_URL

# 3. Investigar problema específico
```

### Se Aplicação Parar de Funcionar

```bash
# 1. Verificar logs da aplicação
npm run dev # local
# ou verificar logs do Vercel/servidor

# 2. Verificar schema drift
npx prisma migrate status

# 3. Regenerar Prisma Client
npx prisma generate

# 4. Rebuildar aplicação
npm run build
```

## 📊 Checklist de Validação Pós-Aplicação

- [ ] `npx prisma migrate status` retorna "up to date"
- [ ] `npx prisma generate` completa sem erros
- [ ] `npx prisma validate` passa
- [ ] `npm run build` completa com sucesso
- [ ] Aplicação inicia sem erros
- [ ] Testes de integração passam (se houver)
- [ ] Queries básicas funcionam:
  - [ ] Listar usuários
  - [ ] Listar projetos
  - [ ] Criar template
  - [ ] Gerar criativo
  - [ ] Chat com IA

## 📞 Suporte

### Erros Comuns

**Erro: "Migration failed to apply"**
- Causa: Migration sendo executada quando banco já tem as tabelas
- Solução: Usar `npx prisma migrate resolve --applied <nome>`

**Erro: "Shadow database error"**
- Causa: Shadow DB não consegue replicar estado
- Solução: Usar `--skip-seed` ou configurar shadow DB corretamente

**Erro: "Foreign key constraint violation"**
- Causa: Dados órfãos no banco
- Solução: Identificar e corrigir dados antes de aplicar migration

### Logs Úteis

```bash
# Logs detalhados de migration
DATABASE_URL="<url>" npx prisma migrate deploy --schema=prisma/schema.prisma

# Verificar logs de produção
vercel logs <project-name>

# Verificar logs do Neon
# Acesse: Neon Console > Logs
```

## 🎉 Sucesso!

Se todos os passos foram completados:
- ✅ Histórico de migrations normalizado
- ✅ Baseline estabelecida
- ✅ Shadow DB funciona corretamente
- ✅ Novas migrations podem ser criadas normalmente
- ✅ Deploy automático funciona

## 📚 Referências

- [Prisma Migrate Reference](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Baselining Documentation](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining)
- [Troubleshooting Migrations](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/troubleshooting-development)
- [MIGRATION_NORMALIZATION.md](./MIGRATION_NORMALIZATION.md) - Diagnóstico detalhado

---

**Criado em**: 2024-12-10
**Última atualização**: 2024-12-10
**Status**: ✅ Pronto para aplicação
