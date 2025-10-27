# 📘 Guia de Configuração Boost.space - Instagram Analytics

## 🔐 Seu Webhook Secret

```
a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404
```

**⚠️ IMPORTANTE**: Use este secret em TODOS os módulos HTTP Request nos cenários do Boost.space.

---

## 🎯 Visão Geral dos Cenários

Você precisará criar 3 cenários no Boost.space:

1. **Instagram Stories Monitor** - Coleta stories quando expiram
2. **Instagram Feeds Monitor** - Coleta feeds quando são publicados
3. **Weekly Report Generator** - Gera relatórios semanais (agendado)

---

## 📱 Cenário 1: Instagram Stories Monitor

### Configuração Inicial
- **Nome**: Instagram Stories Monitor
- **Tipo**: Instant (Webhook)
- **Status**: Active

### Módulo 1: Watch Comments on Media (Instagram Business)

**Configuração:**
```
Tipo: STORY (apenas stories, NÃO marcar FEED)
Connection: [Sua conexão Instagram/Facebook]
```

**O que faz:** Detecta quando uma story expira (após 24h)

### Módulo 2: Get Media Insights (Instagram Business)

**Configuração:**
```
Connection: [Mesma conexão do módulo anterior]
Media ID: {{1.media_id}}
Metrics: Selecionar TODOS:
  ✅ impressions
  ✅ reach
  ✅ taps_forward
  ✅ taps_back
  ✅ exits
  ✅ replies
```

**O que faz:** Busca métricas detalhadas da story

### Módulo 3: HTTP - Make a Request

**Configuração:**

**URL:**
```
https://seu-dominio.vercel.app/api/webhooks/instagram/story
```
*Substitua `seu-dominio.vercel.app` pelo seu domínio real*

**Method:** `POST`

**Headers:**
```json
[
  {
    "name": "Content-Type",
    "value": "application/json"
  },
  {
    "name": "x-webhook-secret",
    "value": "a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404"
  }
]
```

**Body Type:** Raw

**Body (JSON):**
```json
{
  "media_id": "{{1.media_id}}",
  "username": "{{1.username}}",
  "media_type": "{{1.media_type}}",
  "media_url": "{{1.media_url}}",
  "thumbnail_url": "{{ifempty(1.thumbnail_url; null)}}",
  "caption": "{{ifempty(1.caption; null)}}",
  "timestamp": "{{1.timestamp}}",
  "insights": {
    "impressions": {{2.impressions}},
    "reach": {{2.reach}},
    "taps_forward": {{2.taps_forward}},
    "taps_back": {{2.taps_back}},
    "exits": {{2.exits}},
    "replies": {{2.replies}}
  },
  "captured_at": "{{formatDate(now; 'YYYY-MM-DDTHH:mm:ss.SSSZ')}}"
}
```

---

## 📸 Cenário 2: Instagram Feeds Monitor

### Configuração Inicial
- **Nome**: Instagram Feeds Monitor
- **Tipo**: Instant (Webhook)
- **Status**: Active

### Módulo 1: Watch Media (Instagram Business)

**Configuração:**
```
Tipo: FEED (IMAGE, VIDEO, CAROUSEL_ALBUM)
Connection: [Sua conexão Instagram/Facebook]
```

**O que faz:** Detecta quando um novo feed é publicado

### Módulo 2: Sleep (Tools)

**Configuração:**
```
Delay: 300000 (5 minutos em milissegundos)
```

**Por quê?** Instagram leva ~5 minutos para processar insights de posts novos

**💡 DICA DE TESTE:** Na primeira rodada, DESABILITE este módulo para testar mais rápido. Reabilite depois!

### Módulo 3: Get Media Insights (Instagram Business)

**Configuração:**
```
Connection: [Mesma conexão]
Media ID: {{1.id}}
Metrics: Selecionar:
  ✅ engagement
  ✅ impressions
  ✅ reach
  ✅ saved
```

### Módulo 4: Get Media (Instagram Business)

**Configuração:**
```
Connection: [Mesma conexão]
Post ID: {{1.id}}
```

**O que faz:** Busca dados públicos (likes, comments)

### Módulo 5: HTTP - Make a Request

**Configuração:**

**URL:**
```
https://seu-dominio.vercel.app/api/webhooks/instagram/feed
```

**Method:** `POST`

**Headers:**
```json
[
  {
    "name": "Content-Type",
    "value": "application/json"
  },
  {
    "name": "x-webhook-secret",
    "value": "a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404"
  }
]
```

**Body Type:** Raw

**Body (JSON):**
```json
{
  "id": "{{1.id}}",
  "caption": "{{ifempty(1.caption; null)}}",
  "media_type": "{{1.media_type}}",
  "media_url": "{{1.media_url}}",
  "thumbnail_url": "{{ifempty(1.thumbnail_url; null)}}",
  "permalink": "{{1.permalink}}",
  "timestamp": "{{1.timestamp}}",
  "username": "{{1.username}}",
  "likes": {{ifempty(4.like_count; 0)}},
  "comments": {{ifempty(4.comments_count; 0)}},
  "insights": {
    "engagement": {{3.engagement}},
    "impressions": {{3.impressions}},
    "reach": {{3.reach}},
    "saved": {{3.saved}}
  },
  "captured_at": "{{formatDate(now; 'YYYY-MM-DDTHH:mm:ss.SSSZ')}}"
}
```

---

## 📊 Cenário 3: Weekly Report Generator

### Configuração Inicial
- **Nome**: Instagram Weekly Report Generator
- **Tipo**: Scheduled
- **Schedule**:
  - Frequência: Semanal
  - Dia: Segunda-feira
  - Hora: 00:00 UTC
- **Status**: Active

### Módulo 1: PostgreSQL - Select Rows

**⚠️ ATENÇÃO**: Este cenário requer acesso ao seu banco de dados Neon. Por segurança, você pode:
- Opção A: Criar um usuário read-only no Neon
- Opção B: Usar a API do Next.js para buscar dados (recomendado)

**Se optar pela API do Next.js**, pule este módulo e use um HTTP Request para buscar dados da sua API.

**URL da API alternativa:**
```
GET https://seu-dominio.vercel.app/api/instagram/weekly-data
```

### Módulo 2: Iterator

**Configuração:**
```
Array: {{1.projects}}
```

### Módulo 3: HTTP - Make a Request

**Configuração:**

**URL:**
```
https://seu-dominio.vercel.app/api/webhooks/instagram/report
```

**Method:** `POST`

**Headers:**
```json
[
  {
    "name": "Content-Type",
    "value": "application/json"
  },
  {
    "name": "x-webhook-secret",
    "value": "a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404"
  }
]
```

**Body Type:** Raw

**Body (JSON):**
```json
{
  "username": "{{2.username}}",
  "period": {
    "start": "{{formatDate(subtractDays(now; 7); 'YYYY-MM-DDTHH:mm:ss.SSSZ')}}",
    "end": "{{formatDate(subtractDays(now; 1); 'YYYY-MM-DDTHH:mm:ss.SSSZ')}}",
    "type": "weekly"
  },
  "metrics": {
    "feeds": {
      "published": {{2.feeds_published}},
      "goal": 4,
      "completion_rate": {{round(divide(2.feeds_published; 4) * 100; 2)}},
      "missing": {{max(subtract(4; 2.feeds_published); 0)}}
    },
    "stories": {
      "published": {{2.stories_published}},
      "goal": 21,
      "completion_rate": {{round(divide(2.stories_published; 21) * 100; 2)}},
      "missing": {{max(subtract(21; 2.stories_published); 0)}}
    },
    "overall": {
      "completion_rate": {{round(divide(add(divide(2.feeds_published; 4); divide(2.stories_published; 21)); 2) * 100; 2)}},
      "score": "{{if(gte(divide(add(divide(2.feeds_published; 4); divide(2.stories_published; 21)); 2); 0.9); 'A'; if(gte(divide(add(divide(2.feeds_published; 4); divide(2.stories_published; 21)); 2); 0.8); 'B'; if(gte(divide(add(divide(2.feeds_published; 4); divide(2.stories_published; 21)); 2); 0.7); 'C'; if(gte(divide(add(divide(2.feeds_published; 4); divide(2.stories_published; 21)); 2); 0.6); 'D'; 'F'))))}}",
      "days_without_post": 0
    }
  },
  "alerts": [],
  "generated_at": "{{formatDate(now; 'YYYY-MM-DDTHH:mm:ss.SSSZ')}}"
}
```

---

## 🧪 Testando os Cenários

### Teste 1: Stories
1. Publique uma story de teste no Instagram
2. Aguarde 24h (ou force expiração no Instagram)
3. Verifique logs no Boost.space
4. Verifique no banco de dados se a story foi salva

### Teste 2: Feeds
1. **PRIMEIRO**: Desabilite o módulo Sleep para testar mais rápido
2. Publique um feed de teste
3. Verifique logs no Boost.space
4. Insights podem estar zerados (normal sem o delay)
5. **DEPOIS**: Reabilite o Sleep e teste novamente

### Teste 3: Webhook Direto (sem Boost.space)

Use o Postman ou cURL para testar diretamente:

```bash
# Teste Story Webhook
curl -X POST https://seu-dominio.vercel.app/api/webhooks/instagram/story \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404" \
  -d '{
    "media_id": "test_123",
    "username": "test_account",
    "media_type": "IMAGE",
    "media_url": "https://example.com/image.jpg",
    "timestamp": "2025-01-27T10:00:00.000Z",
    "insights": {
      "impressions": 100,
      "reach": 80,
      "taps_forward": 10,
      "taps_back": 2,
      "exits": 5,
      "replies": 3
    },
    "captured_at": "2025-01-27T10:00:00.000Z"
  }'

# Teste Feed Webhook
curl -X POST https://seu-dominio.vercel.app/api/webhooks/instagram/feed \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404" \
  -d '{
    "id": "test_feed_123",
    "username": "test_account",
    "media_type": "IMAGE",
    "media_url": "https://example.com/feed.jpg",
    "permalink": "https://instagram.com/p/test",
    "timestamp": "2025-01-27T10:00:00.000Z",
    "likes": 50,
    "comments": 10,
    "insights": {
      "engagement": 60,
      "impressions": 500,
      "reach": 400,
      "saved": 15
    },
    "captured_at": "2025-01-27T10:00:00.000Z"
  }'
```

---

## ✅ Checklist de Configuração

### Pré-requisitos
- [ ] Conta Instagram Business conectada ao Facebook
- [ ] Acesso ao Boost.space
- [ ] Domínio configurado (Vercel/produção)
- [ ] Secret adicionado ao `.env.local` ✅ (já feito!)

### Cenário 1 - Stories
- [ ] Módulo 1: Watch Comments configurado
- [ ] Módulo 2: Get Media Insights com todas métricas
- [ ] Módulo 3: HTTP Request com URL correta
- [ ] Módulo 3: Headers com secret correto
- [ ] Cenário testado e funcionando

### Cenário 2 - Feeds
- [ ] Módulo 1: Watch Media configurado
- [ ] Módulo 2: Sleep (300000ms) - inicialmente desabilitado para teste
- [ ] Módulo 3: Get Media Insights
- [ ] Módulo 4: Get Media (likes/comments)
- [ ] Módulo 5: HTTP Request com URL correta
- [ ] Módulo 5: Headers com secret correto
- [ ] Cenário testado sem Sleep
- [ ] Sleep reabilitado após teste
- [ ] Cenário testado com Sleep

### Cenário 3 - Weekly Reports
- [ ] Schedule configurado (Segunda 00:00 UTC)
- [ ] Módulo de busca de dados configurado
- [ ] Iterator configurado
- [ ] HTTP Request com URL correta
- [ ] Headers com secret correto
- [ ] Lógica de cálculo de score testada

### Banco de Dados
- [ ] Projetos vinculados às contas Instagram
- [ ] Campo `instagramUsername` preenchido
- [ ] Campo `instagramAccountId` preenchido

### Produção
- [ ] Cenários ativos no Boost.space
- [ ] Webhooks testados em produção
- [ ] Dashboard acessível
- [ ] Dados aparecendo corretamente

---

## 🆘 Troubleshooting

### Erro 401: Invalid webhook secret
**Causa:** Secret incorreto ou não enviado
**Solução:** Verifique se o header `x-webhook-secret` está correto:
```
a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404
```

### Erro 404: Project not found
**Causa:** Username do Instagram não está vinculado a nenhum projeto
**Solução:** Execute no banco de dados:
```sql
UPDATE "Project"
SET "instagramUsername" = 'seu_username_instagram'
WHERE id = SEU_PROJECT_ID;
```

### Story/Feed não aparece no dashboard
**Causa:** Dados podem não ter sido salvos corretamente
**Solução:**
1. Verifique logs do Boost.space
2. Teste webhook diretamente com cURL
3. Verifique tabelas no banco: `InstagramStory`, `InstagramFeed`

### Insights zerados
**Causa:** Instagram precisa de tempo para processar métricas
**Solução:**
- Stories: Aguarde 24h para expirarem
- Feeds: Use o módulo Sleep (5min) no cenário

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique logs do Boost.space
2. Verifique logs do Next.js (Vercel)
3. Teste webhooks manualmente com cURL
4. Verifique se o secret está correto em todos os lugares

---

**Última atualização:** 2025-10-27
**Webhook Secret:** `a7ebf84f74e21692eb10bac3feb44b7dc436ca64a1b44ea18dfdf35f4dde1404`
