# Correção do Campo processingStartedAt Ausente no Banco

## Data: 09/01/2025

### Problema Identificado

Os cron jobs estavam falhando com o erro:

```
Error [PrismaClientKnownRequestError]:
Invalid `prisma.socialPost.findMany()` invocation:
The column `SocialPost.processingStartedAt` does not exist in the current database.
code: 'P2022'
```

### Causa Raiz

O campo `processingStartedAt` foi adicionado ao schema Prisma mas não foi migrado para o banco de dados de produção.

### Solução Aplicada

#### 1. Migration SQL Manual

Criado arquivo `prisma/migrations/20250109_add_processing_started_at.sql`:

```sql
ALTER TABLE "SocialPost"
ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx"
ON "SocialPost"("processingStartedAt");
```

#### 2. Execução da Migration

```bash
cat prisma/migrations/20250109_add_processing_started_at.sql | \
  npx prisma db execute --stdin --schema prisma/schema.prisma
```

#### 3. Código Resiliente

**src/lib/posts/scheduler.ts** - Usa `updatedAt` como fallback:
```typescript
const stuckPosts = await db.socialPost.findMany({
  where: {
    status: PostStatus.POSTING,
    laterPostId: null,
    updatedAt: { // Sempre existe
      lt: thirtyMinutesAgo
    }
  }
})
```

#### 4. Regeneração do Prisma Client

```bash
npx prisma generate
```

### Verificação

Testado com script que confirma:
- ✅ Campo existe no banco
- ✅ Queries funcionam corretamente
- ✅ Updates com o campo funcionam
- ✅ TypeScript compila sem erros

### Status dos Cron Jobs

| Cron Job | Status | Função |
|----------|--------|--------|
| `/api/cron/posts` | ✅ Funcionando | Executa posts agendados |
| `/api/cron/check-stuck-posts` | ✅ Funcionando | Marca posts travados como FAILED |
| `/api/cron/reminders` | ✅ Funcionando | Processa posts de reminder |
| `/api/cron/verify-stories` | ✅ Funcionando | Verifica stories do Instagram |
| `/api/cron/status-sync` | ✅ Funcionando | Sincroniza status com Later API |

### Monitoramento

Para verificar se o campo existe em qualquer ambiente:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'SocialPost'
AND column_name = 'processingStartedAt';
```

### Prevenção Futura

1. **Sempre executar migrations** após mudanças no schema
2. **Usar código defensivo** quando adicionar novos campos
3. **Testar em staging** antes de deploy em produção
4. **Documentar mudanças** no banco de dados

### Arquivos Modificados

- `prisma/migrations/20250109_add_processing_started_at.sql` - Migration SQL
- `src/lib/posts/scheduler.ts` - Código resiliente
- `src/lib/posts/later-scheduler.ts` - Usa campo diretamente

### Conclusão

✅ **RESOLVIDO** - Todos os cron jobs funcionando normalmente com o campo adicionado ao banco.