# Story Insights Setup Guide

Este documento explica como configurar o sistema de relatórios de analytics para Instagram Stories.

## Visão Geral

O sistema captura automaticamente analytics de Stories do Instagram **antes que expirem (24 horas)** usando a Instagram Graph API.

### Métricas Capturadas

- **Impressions**: Total de visualizações do Story
- **Reach**: Número único de contas que viram o Story
- **Replies**: Número de respostas/mensagens diretas
- **Engagement**: Interações totais (replies + taps)

## Arquitetura

### Componentes Criados

1. **`/src/lib/instagram/graph-api-client.ts`**
   - Método `getStoryInsights()` para buscar analytics de um Story específico
   - Suporte para métricas: impressions, reach, replies, exits, taps_forward, taps_back

2. **`/src/app/api/cron/fetch-story-insights/route.ts`**
   - Cron job que roda a cada 12 horas
   - Busca Stories postadas nas últimas 24 horas
   - Fetches insights via Instagram Graph API
   - Salva analytics no banco de dados

3. **`/src/app/api/projects/[projectId]/stories-report/route.ts`**
   - Endpoint para gerar relatório de Stories
   - Retorna estatísticas consolidadas e lista de Stories com analytics
   - Suporta filtro por período (dias)

## Configuração Necessária

### ⚠️ IMPORTANTE: Permissões do Instagram Access Token

O `INSTAGRAM_ACCESS_TOKEN` precisa ter as seguintes permissões:

1. **`instagram_basic`** - Acesso básico ao perfil
2. **`instagram_manage_insights`** - **OBRIGATÓRIO** para buscar insights de Stories

### Como Obter Token com Permissões Corretas

1. Acesse [Facebook for Developers](https://developers.facebook.com/)
2. Vá para seu App > Instagram Basic Display ou Instagram Graph API
3. Gere um novo Access Token com as permissões:
   - `instagram_basic`
   - `instagram_manage_insights`
4. Adicione o token ao `.env`:
   ```
   INSTAGRAM_ACCESS_TOKEN=seu_token_aqui
   ```

### Verificar Permissões do Token

Use este endpoint para verificar as permissões do token atual:

```bash
curl -X GET "https://graph.facebook.com/debug_token?input_token=SEU_TOKEN&access_token=SEU_TOKEN"
```

## Como Funciona

### Fluxo Automático

1. **Story é postada** via Buffer/Zapier → Later → Instagram
2. **Sistema de verificação** identifica o Story no Instagram e salva `verifiedStoryId`
3. **Cron job** (12h) busca Stories com menos de 24h que ainda não têm analytics
4. **Instagram Graph API** retorna insights do Story
5. **Banco de dados** é atualizado com as métricas
6. **Relatório** fica disponível via endpoint API

### Janela de Tempo

- **Stories expiram**: 24 horas após publicação
- **Cron roda**: A cada 12 horas
- **Garantia**: Pelo menos 1 tentativa de captura antes da expiração

## Testando o Sistema

### 1. Verificar Stories Disponíveis

Execute o cron manualmente:

```bash
curl -X GET http://localhost:3000/api/cron/fetch-story-insights \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

### 2. Ver Relatório de um Projeto

```bash
curl http://localhost:3000/api/projects/5/stories-report
```

Parâmetros opcionais:
- `?days=30` - Últimos 30 dias (padrão)
- `?days=7` - Última semana

## Resposta do Relatório

```json
{
  "success": true,
  "project": {
    "id": 5,
    "name": "Bacana"
  },
  "summary": {
    "totalStories": 15,
    "totalImpressions": 4520,
    "totalReach": 2180,
    "totalReplies": 42,
    "averages": {
      "impressions": 301,
      "reach": 145,
      "replies": 2.8,
      "engagementRate": 3.5
    }
  },
  "stories": [
    {
      "id": "...",
      "caption": "...",
      "sentAt": "2026-01-01T12:00:00Z",
      "analytics": {
        "impressions": 350,
        "reach": 180,
        "replies": 5,
        "engagementRate": 2.7
      }
    }
  ]
}
```

## Limitações Conhecidas

### ❌ Erro de Permissão

Se você ver este erro:
```json
{
  "error": "(#10) Application does not have permission for this action"
}
```

**Solução**: Regenere o Instagram Access Token com a permissão `instagram_manage_insights`.

### ⏰ Stories Antigas

Stories com mais de 24 horas **não podem ter insights coletados** - a API do Instagram não permite acesso após a expiração.

## Monitoramento

### Logs do Cron Job

Os logs mostram:
- ✅ Stories processadas com sucesso
- ⏰ Stories muito antigas (> 24h)
- ❌ Erros de permissão ou API
- ⏭️ Stories ignoradas (sem verifiedStoryId)

### Estatísticas

```bash
# Total de Stories sem analytics
SELECT COUNT(*) FROM "SocialPost"
WHERE "postType" = 'STORY'
  AND "status" = 'POSTED'
  AND "analyticsReach" IS NULL;

# Stories dentro da janela de 24h
SELECT COUNT(*) FROM "SocialPost"
WHERE "postType" = 'STORY'
  AND "status" = 'POSTED'
  AND "verifiedStoryId" IS NOT NULL
  AND "sentAt" > NOW() - INTERVAL '24 hours'
  AND "analyticsReach" IS NULL;
```

## Próximos Passos

1. ✅ Gerar novo Instagram Access Token com permissões corretas
2. ✅ Adicionar cron job ao Vercel (ou outro scheduler)
3. ✅ Criar interface visual para o relatório de Stories
4. ✅ Adicionar alertas quando Stories não conseguem analytics

## Referências

- [Instagram Graph API - Insights](https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights)
- [Story Insights Metrics](https://developers.facebook.com/docs/instagram-api/guides/insights)
