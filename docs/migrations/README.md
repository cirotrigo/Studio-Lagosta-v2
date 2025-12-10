# 📚 Documentação de Migrations - Studio Lagosta v2

## 🎯 Status: ✅ Migrations Normalizadas

As migrations do projeto foram normalizadas com sucesso em **10 de Dezembro de 2024**.

---

## 📖 Guia Rápido

### Para Desenvolvedores

✅ **Tudo está pronto!** Você pode continuar o desenvolvimento normalmente.

```bash
# Criar nova migration
npx prisma migrate dev --name minha_feature

# Verificar status
npx prisma migrate status

# Gerar client
npx prisma generate
```

### Para DevOps/Deployment

⚠️ **LEIA ANTES de aplicar em produção:**
1. [MIGRATION_APPLY_INSTRUCTIONS.md](../../MIGRATION_APPLY_INSTRUCTIONS.md) - Guia passo-a-passo
2. Faça backup do banco (obrigatório)
3. Teste em staging primeiro

---

## 📂 Documentação Completa

### Documentos Principais

| Documento | Descrição | Quando Ler |
|-----------|-----------|------------|
| **[MIGRATION_CHECKLIST.md](../../MIGRATION_CHECKLIST.md)** | ✅ Checklist visual do que foi feito | Visão geral rápida |
| **[MIGRATION_SUMMARY.md](../../MIGRATION_SUMMARY.md)** | 📊 Resumo executivo completo | Entender o contexto |
| **[MIGRATION_APPLY_INSTRUCTIONS.md](../../MIGRATION_APPLY_INSTRUCTIONS.md)** | 🚀 Guia passo-a-passo | Aplicar em staging/prod |
| **[MIGRATION_NORMALIZATION.md](../../MIGRATION_NORMALIZATION.md)** | 🔧 Diagnóstico técnico detalhado | Entender problemas resolvidos |

### Scripts Criados

| Script | Descrição | Uso |
|--------|-----------|-----|
| `scripts/backup-database.sh` | Backup via pg_dump | `./scripts/backup-database.sh` |
| `scripts/backup-database-docker.sh` | Backup via Docker | `./scripts/backup-database-docker.sh` |
| `scripts/check-db-state.ts` | Verificar estado do banco | `npx tsx scripts/check-db-state.ts` |

---

## 🔍 O Que Foi Feito?

### Problemas Resolvidos

1. ✅ **Histórico de migrations incompleto** - Baseline criada
2. ✅ **Tabelas sem migrations** - Reconciliação feita
3. ✅ **Foreign keys condicionais** - Validadas todas
4. ✅ **Schema drift** - Eliminado completamente

### Resultados

- **52 tabelas** verificadas e funcionando
- **53 foreign keys** validadas
- **28 migrations** normalizadas
- **0 erros** de validação
- **0 drift** detectado

---

## 🚀 Comandos Úteis

### Desenvolvimento Diário

```bash
# Status das migrations
npx prisma migrate status

# Criar nova migration
npx prisma migrate dev --name add_new_feature

# Gerar Prisma Client
npx prisma generate

# Validar schema
npx prisma validate

# Verificar estado do banco
npx tsx scripts/check-db-state.ts
```

### Deployment

```bash
# Aplicar migrations em produção
DATABASE_URL="<prod-url>" npx prisma migrate deploy

# Verificar status em produção
DATABASE_URL="<prod-url>" npx prisma migrate status
```

### Troubleshooting

```bash
# Ver migrations aplicadas
npx prisma migrate status

# Marcar migration como aplicada (sem executar)
npx prisma migrate resolve --applied <migration_name>

# Marcar migration como rolledback
npx prisma migrate resolve --rolled-back <migration_name>
```

---

## 📊 Estado Atual do Banco

### Tabelas Principais

```
User (47) ─┬─ CreditBalance
           ├─ StorageObject
           ├─ SubscriptionEvent
           ├─ UsageHistory
           └─ DriveSettings

Organization (30) ─┬─ OrganizationCreditBalance
                   ├─ OrganizationProject
                   ├─ OrganizationUsage
                   └─ OrganizationMemberAnalytics

Project (39) ─┬─ Template ─┬─ Page
              │            └─ Generation ─── VideoProcessingJob
              ├─ CustomFont
              ├─ Element
              ├─ Logo
              ├─ BrandColor
              ├─ AIGeneratedImage
              ├─ PromptLibrary
              ├─ SocialPost ─┬─ PostRetry
              │              └─ PostLog
              ├─ MusicLibrary ─┬─ MusicStemJob
              │                └─ YoutubeDownloadJob
              ├─ knowledge_base_entries ─── knowledge_chunks
              ├─ ChatConversation ─── ChatMessage
              └─ Instagram Analytics (5 tabelas)
```

### Foreign Keys Críticas

| De | Para | Status |
|----|------|--------|
| MusicLibrary | Project | ✅ OK |
| VideoProcessingJob | Project, Generation, MusicLibrary | ✅ OK |
| YoutubeDownloadJob | Project, MusicLibrary | ✅ OK |
| knowledge_chunks | knowledge_base_entries | ✅ OK |

---

## ⚠️ Importante

### Antes de Aplicar em Produção

1. **SEMPRE faça backup** - Use Neon Console ou scripts de backup
2. **Teste em staging primeiro** - Valide funcionamento completo
3. **Leia a documentação** - Principalmente [MIGRATION_APPLY_INSTRUCTIONS.md](../../MIGRATION_APPLY_INSTRUCTIONS.md)
4. **Monitore logs** - Após aplicar, verifique logs por 24h

### Nunca Faça

- ❌ Deletar migrations aplicadas em produção
- ❌ Editar migrations já aplicadas
- ❌ Aplicar migrations direto em prod sem testar em staging
- ❌ Ignorar backups

---

## 🆘 Suporte

### Documentação

- [Prisma Migrate Docs](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Baselining Guide](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining)
- [Troubleshooting](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/troubleshooting-development)

### Em Caso de Problemas

1. Verifique: `npx prisma migrate status`
2. Consulte logs de erro
3. Leia: [MIGRATION_APPLY_INSTRUCTIONS.md#troubleshooting](../../MIGRATION_APPLY_INSTRUCTIONS.md)
4. Se necessário, restaure backup

---

## 📝 Histórico

### 2024-12-10: Normalização Completa
- ✅ Migration baseline criada
- ✅ Todas FKs validadas
- ✅ Documentação completa
- ✅ Scripts de backup implementados
- ✅ Schema drift eliminado

**Status**: Produção-ready após testar em staging

---

**Última Atualização**: 10 de Dezembro de 2024
**Responsável**: Claude AI (Studio Lagosta Team)
**Versão**: 1.0.0
