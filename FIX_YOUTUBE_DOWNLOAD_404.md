# Correção do Erro 404 na API de Download do YouTube

## Data: 09/01/2025

### Problema Identificado

O cron job de processamento de downloads do YouTube estava falhando com erro 404:

```
[error] [VIDEO-API] Failed to check progress: Error: Failed to fetch progress: 404
```

### Causa Raiz

1. **Jobs Expirados**: A API externa (`https://p.savenow.to/ajax`) mantém jobs por tempo limitado
2. **IDs Inválidos**: Após algumas horas, os IDs de job não são mais válidos na API externa
3. **Loop Infinito**: Jobs antigos continuavam tentando verificar progresso indefinidamente

### Solução Implementada

#### 1. Detecção e Tratamento de Erro 404

**Arquivo:** `src/lib/youtube/video-download-client.ts`

```typescript
if (response.status === 404) {
  const jobAge = Date.now() - new Date(job.createdAt).getTime()
  const oneHour = 60 * 60 * 1000

  if (jobAge > oneHour || job.retryCount >= 3) {
    // Marca como falho se job é muito antigo ou teve muitas tentativas
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: 'Download job expired or not found in external API',
      },
    })
    return null
  }
}
```

#### 2. Limpeza de Jobs Stuck

**Arquivo:** `src/app/api/cron/process-youtube-downloads/route.ts`

```typescript
// Limpar jobs stuck que estão downloading há mais de 2 horas
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
const stuckJobs = await db.youtubeDownloadJob.updateMany({
  where: {
    status: 'downloading',
    startedAt: { lt: twoHoursAgo },
  },
  data: {
    status: 'failed',
    error: 'Download timeout - job stuck for more than 2 hours',
  },
})
```

### Regras de Negócio

| Condição | Ação |
|----------|------|
| **404 + Job > 1 hora** | Marca como `failed` |
| **404 + 3+ tentativas** | Marca como `failed` |
| **Status downloading > 2 horas** | Marca como `failed` |
| **Jobs failed > 24 horas** | Deletados automaticamente |

### Benefícios

1. **Previne Loop Infinito**: Jobs antigos não ficam mais tentando para sempre
2. **Limpa Jobs Stuck**: Remove jobs travados automaticamente
3. **Melhor Logging**: Logs mais informativos para debug
4. **Performance**: Reduz processamento desnecessário

### Monitoramento

Para verificar jobs problemáticos:

```sql
-- Jobs stuck em downloading
SELECT id, youtubeUrl, status, startedAt, retryCount
FROM "YoutubeDownloadJob"
WHERE status = 'downloading'
AND startedAt < NOW() - INTERVAL '2 hours';

-- Jobs com muitas tentativas
SELECT id, youtubeUrl, status, error, retryCount
FROM "YoutubeDownloadJob"
WHERE retryCount > 3
ORDER BY retryCount DESC;
```

### Status do Sistema

| Componente | Status |
|------------|--------|
| **Cron Job** | ✅ Funcionando |
| **Tratamento 404** | ✅ Implementado |
| **Limpeza Automática** | ✅ Ativa |
| **Timeout de Jobs** | ✅ 2 horas |

### Arquivos Modificados

- `src/lib/youtube/video-download-client.ts` - Tratamento de erro 404
- `src/app/api/cron/process-youtube-downloads/route.ts` - Limpeza de jobs stuck

### Conclusão

✅ **RESOLVIDO** - Sistema de download do YouTube agora trata corretamente jobs expirados e previne loops infinitos de processamento.