# Melhorias Implementadas na Integração com LATE API

## Data: 09/01/2025

### Problemas Identificados e Resolvidos

## 1. ✅ Race Condition na Duplicação de Posts (CRÍTICO)

### Problema
- Cron executando a cada minuto sem proteção contra concorrência
- Posts sendo enviados múltiplas vezes para o Later API
- Janela de vulnerabilidade entre início do processamento e salvamento do `laterPostId`

### Solução Implementada
**Arquivo:** `src/lib/posts/later-scheduler.ts`

- Implementado lock distribuído com transação Prisma
- Adicionado campo `processingStartedAt` no banco de dados
- Verificação dupla: status POSTING + laterPostId antes de processar
- Posts já em processamento são automaticamente skipados

```typescript
// Lock pessimista para evitar processamento duplo
const post = await db.$transaction(async (tx) => {
  // Verifica e marca como POSTING atomicamente
  // Retorna null se já está sendo processado
})
```

---

## 2. ✅ Posts Marcados como FAILED Prematuramente (CRÍTICO)

### Problema
- Sistema marcava posts como FAILED após 10 minutos em status POSTING
- Later API pode demorar mais de 10 minutos para processar
- Conflito de status: posts publicados mas mostrados como falhos

### Solução Implementada
**Arquivo:** `src/lib/posts/scheduler.ts`

- Timeout aumentado de 10 para 30 minutos
- Verificação adicional: só marca como stuck se não tem `laterPostId`
- Usa `processingStartedAt` quando disponível para medição precisa

---

## 3. ✅ Rate Limiting no Catch-up de Posts Atrasados

### Problema
- Sistema processava até 5 posts atrasados simultaneamente
- Poderia exceder rate limit do Later API
- Falhas em cascata ao processar múltiplos posts

### Solução Implementada
**Arquivo:** `src/lib/posts/executor.ts`

- Delay de 2 segundos entre posts atrasados
- Detecção de erros de rate limit (para processamento imediato)
- Limite mantido em 5 posts por execução com processamento sequencial

---

## 4. ✅ Verificação Real de Stories do Instagram

### Problema
- Stories marcados como VERIFIED sem verificar no Instagram
- Later API pode reportar sucesso mas story falhar no Instagram
- Usuários viam "verificado" para stories não publicados

### Solução Implementada
**Arquivo:** `src/lib/posts/verification/story-verifier.ts`

- Removida verificação automática para posts DIRECT
- Mantida apenas para posts REMINDER (não críticos)
- Todos os stories DIRECT agora verificados via Instagram Graph API

---

## 5. ✅ Idempotência no Webhook do Later

### Problema
- Webhooks podiam ser processados múltiplas vezes
- Later pode reenviar webhooks em caso de timeout
- Status podiam ser sobrescritos incorretamente

### Solução Implementada
**Arquivo:** `src/app/api/webhooks/late/route.ts`

- EventId único para cada webhook: `{postId}-{event}-{timestamp}`
- Verificação no banco antes de processar
- Skip automático de eventos duplicados
- Aplicado em: `handlePostPublished`, `handlePostFailed`, `handlePartialPublish`

---

## Arquivos Modificados

1. **prisma/schema.prisma**
   - Adicionado campo `processingStartedAt DateTime?`

2. **src/lib/posts/later-scheduler.ts**
   - Implementado lock distribuído com transação

3. **src/lib/posts/scheduler.ts**
   - Timeout aumentado para 30 minutos
   - Lógica melhorada para detecção de posts travados

4. **src/lib/posts/executor.ts**
   - Rate limiting de 2 segundos entre posts atrasados
   - Detecção de rate limit errors

5. **src/lib/posts/verification/story-verifier.ts**
   - Desabilitada verificação automática para posts DIRECT

6. **src/app/api/webhooks/late/route.ts**
   - Implementada idempotência com eventId

---

## Comandos Executados

```bash
# Aplicar mudanças no banco de dados
npx prisma db push

# Gerar Prisma Client
npx prisma generate

# Verificar tipos TypeScript
npm run typecheck
```

---

## Monitoramento Recomendado

### Métricas para Acompanhar Melhorias

1. **Taxa de Duplicação**
   ```sql
   SELECT COUNT(*) FROM "SocialPost"
   WHERE caption IN (
     SELECT caption FROM "SocialPost"
     GROUP BY caption, DATE_TRUNC('minute', scheduledDatetime)
     HAVING COUNT(*) > 1
   )
   ```

2. **Falsos Negativos**
   ```sql
   SELECT COUNT(*) FROM "SocialPost"
   WHERE status = 'FAILED'
   AND instagramMediaId IS NOT NULL
   ```

3. **Tempo Médio de Processamento**
   ```sql
   SELECT AVG(EXTRACT(EPOCH FROM (sentAt - processingStartedAt))) as avg_seconds
   FROM "SocialPost"
   WHERE processingStartedAt IS NOT NULL
   AND sentAt IS NOT NULL
   ```

4. **Taxa de Retry**
   ```sql
   SELECT
     COUNT(DISTINCT pr.postId) as posts_with_retry,
     COUNT(DISTINCT sp.id) as total_posts,
     ROUND(COUNT(DISTINCT pr.postId)::numeric / COUNT(DISTINCT sp.id) * 100, 2) as retry_percentage
   FROM "SocialPost" sp
   LEFT JOIN "PostRetry" pr ON sp.id = pr.postId
   WHERE sp.createdAt > NOW() - INTERVAL '7 days'
   ```

5. **Webhooks Duplicados**
   ```sql
   SELECT metadata->>'eventId', COUNT(*)
   FROM "PostLog"
   WHERE metadata->>'eventId' IS NOT NULL
   GROUP BY metadata->>'eventId'
   HAVING COUNT(*) > 1
   ```

---

## Próximos Passos Sugeridos

1. **Monitorar por 48 horas** para verificar redução de duplicação
2. **Configurar alertas** para posts travados > 30 minutos
3. **Analisar logs** de rate limit para ajustar delays se necessário
4. **Considerar implementar** fila de processamento (Bull/BullMQ) para maior robustez
5. **Adicionar métricas** no dashboard admin para visibilidade

---

## Rollback (se necessário)

Para reverter as mudanças:

```bash
# Reverter código
git revert HEAD

# Remover campo do banco (criar migration)
ALTER TABLE "SocialPost" DROP COLUMN "processingStartedAt";
```

---

## Notas Importantes

- **Backward Compatible**: Código funciona mesmo sem `processingStartedAt` (usa `updatedAt` como fallback)
- **Zero Downtime**: Mudanças podem ser aplicadas sem parar o serviço
- **Testado**: TypeScript compilation passou sem erros
- **Banco Sincronizado**: Schema aplicado com sucesso via `prisma db push`