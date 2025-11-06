# 🔍 Guia de Debug do Sistema de Webhooks

Este guia ajuda a diagnosticar e corrigir problemas com o sistema de postagens e webhooks do Buffer/Zapier.

## 📊 Status dos Posts

Os posts passam pelos seguintes status:

```
DRAFT → SCHEDULED → POSTING → POSTED
                         ↓
                      FAILED
```

- **DRAFT**: Rascunho, não enviado
- **SCHEDULED**: Agendado, aguardando execução do cron
- **POSTING**: Enviado para Zapier, aguardando confirmação
- **POSTED**: Confirmado como publicado com sucesso
- **FAILED**: Falha no envio ou publicação

---

## 🚨 Problema: Posts Travados em POSTING

### Causas Comuns

1. **Zapier não está chamando o webhook de confirmação**
2. **Webhook secret está incorreto**
3. **Buffer retornou erro e Zapier não notificou**
4. **Cron job de limpeza não está funcionando**

### Como Verificar

#### 1. Verificar posts travados no banco:

```bash
psql $DATABASE_URL -c "
SELECT
  id,
  status,
  \"postType\",
  TO_CHAR(\"updatedAt\", 'YYYY-MM-DD HH24:MI') as last_update,
  EXTRACT(EPOCH FROM (NOW() - \"updatedAt\"))/60 as minutes_stuck
FROM \"SocialPost\"
WHERE status = 'POSTING'
ORDER BY \"updatedAt\" DESC;"
```

#### 2. Ver logs de um post específico:

```bash
psql $DATABASE_URL -c "
SELECT
  event,
  message,
  TO_CHAR(\"createdAt\", 'YYYY-MM-DD HH24:MI:SS') as timestamp
FROM \"PostLog\"
WHERE \"postId\" = 'SEU_POST_ID'
ORDER BY \"createdAt\" DESC;"
```

---

## 🧪 Endpoint de Teste do Webhook

Use este endpoint para simular o webhook do Buffer **sem precisar do Zapier**:

### Simular Sucesso:

```bash
curl "https://seu-dominio.vercel.app/api/webhooks/buffer/test?postId=POST_ID&success=true"
```

### Simular Falha:

```bash
curl "https://seu-dominio.vercel.app/api/webhooks/buffer/test?postId=POST_ID&success=false"
```

### Exemplo:

```bash
# Pegar um post em POSTING
POST_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM \"SocialPost\" WHERE status = 'POSTING' LIMIT 1;" | xargs)

# Testar webhook de sucesso
curl "http://localhost:3000/api/webhooks/buffer/test?postId=$POST_ID&success=true"

# Verificar se mudou para POSTED
psql $DATABASE_URL -c "SELECT id, status FROM \"SocialPost\" WHERE id = '$POST_ID';"
```

---

## 🔧 Configuração do Zapier

### Passo 1: Trigger (Webhook by Zapier)

- **Event**: Catch Hook
- **URL**: Copie a URL fornecida pelo Zapier
- **Configure em**: `.env` como `ZAPIER_WEBHOOK_URL`

### Passo 2: Filtro (Opcional mas Recomendado)

Adicione filtros para rotear posts por projeto usando `instagram_account_id`:

```
Only continue if...
  instagram_account_id = "by.rock"
```

### Passo 3: Buffer Action

- **App**: Buffer
- **Action**: Create a Post
- **Account**: Selecione a conta do Instagram
- **Campos**:
  - **Text**: `caption` (do webhook)
  - **Media**: `url1` para carrossel, `media_urls[0]` para posts simples
  - **Post Now**: True (para publish_type = "direct")

### Passo 4: **CRÍTICO** - Webhook de Confirmação

Depois da ação do Buffer, adicione:

- **App**: Webhooks by Zapier
- **Action**: POST
- **URL**: `https://seu-dominio.vercel.app/api/webhooks/buffer/post-sent`
- **Headers**:
  ```
  Content-Type: application/json
  x-webhook-secret: SEU_BUFFER_WEBHOOK_SECRET
  ```
- **Payload** (JSON):
  ```json
  {
    "success": {{true ou false baseado no Buffer}},
    "buffer_update_id": {{ID do Buffer}},
    "sent_at": {{Timestamp do Buffer}},
    "message": {{Mensagem de erro, se houver}},
    "metadata": {
      "studio_post_id": {{metadata__studio_post_id}},
      "post_id": {{metadata__post_id}}
    }
  }
  ```

**IMPORTANTE**: O campo `metadata.studio_post_id` é essencial para identificar o post correto!

---

## 📝 Payload Enviado PARA o Zapier

Quando um post é enviado, este é o payload completo:

```json
{
  "post_type": "post|story|reels|carousel",
  "media_type": "image|video|multiple_images",
  "caption": "Texto do post",
  "media_urls": ["https://..."],
  "media_count": 1,
  "alt_text": ["Texto alternativo"],
  "first_comment": "Primeiro comentário",
  "publish_type": "direct|reminder",

  "url1": "https://...",
  "url2": "https://...",
  // ... url3 até url10 (vazios se não aplicável)

  "instagram_account_id": "by.rock",
  "instagram_username": "By Rock",

  "metadata": {
    "studio_post_id": "cmhkgz846...",
    "post_id": "cmhkgz846...",
    "project_id": 1,
    "project_name": "By Rock",
    "user_id": "user_123",
    "created_at": "2024-11-06T12:00:00Z"
  }
}
```

---

## 🔐 Variáveis de Ambiente Necessárias

Verifique se estas variáveis estão configuradas:

```bash
# Webhook do Zapier (para enviar posts)
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/...

# Secret para autenticar webhook de confirmação
BUFFER_WEBHOOK_SECRET=seu_secret_aqui

# Secret para cron jobs da Vercel
CRON_SECRET=seu_cron_secret_aqui
```

### Como verificar no Vercel:

1. Acesse o projeto no Vercel
2. Settings → Environment Variables
3. Verifique se as 3 variáveis acima existem

---

## 🤖 Cron Jobs

O sistema usa 2 cron jobs:

### 1. `/api/cron/posts` - A cada minuto

Executa posts agendados e retries.

**Verifica**:
- Posts com status `SCHEDULED` na janela de ±1 minuto
- Retries pendentes

### 2. `/api/cron/check-stuck-posts` - A cada 10 minutos

Marca posts travados em `POSTING` por mais de 10 minutos como `FAILED`.

**Teste manual**:

```bash
curl -X GET \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://seu-dominio.vercel.app/api/cron/check-stuck-posts
```

---

## 📊 Monitoramento em Tempo Real

### Ver logs do webhook no Vercel:

1. Acesse o projeto no Vercel
2. Logs → Function Logs
3. Filtre por `/api/webhooks/buffer/post-sent`

### Procure por:

```
📥 BUFFER WEBHOOK RECEIVED at ...
🔐 Validating webhook secret...
✅ Secret validated successfully
🔍 Looking for post by ID from metadata: ...
📍 Found post: ... from project ...
✨ Processing SUCCESSFUL post...
✅ Post ... confirmed as POSTED
```

### Em caso de erro:

```
❌ Buffer webhook: Invalid secret
❌ Buffer webhook: No POSTING post found
💥 Processing FAILED post...
```

---

## 🆘 Resolução de Problemas Comuns

### Problema: Posts sempre ficam em POSTING

**Solução**: Webhook de confirmação não está configurado no Zapier

1. Adicione o passo de webhook após o Buffer no Zapier
2. Verifique que o `x-webhook-secret` está correto
3. Teste com o endpoint de teste

### Problema: Webhook retorna 401 Unauthorized

**Solução**: Secret incorreto

1. Verifique `BUFFER_WEBHOOK_SECRET` no Vercel
2. Use o mesmo valor no header do Zapier
3. Reinicie o deploy se mudou a variável

### Problema: Webhook retorna 404 Post not found

**Solução**: Metadata não está sendo passado

1. Verifique que `metadata.studio_post_id` está no payload
2. Use o passo "Custom Request" no Zapier para controlar o payload

### Problema: Posts não são enviados no horário

**Solução**: Cron job não está executando

1. Verifique o `vercel.json` tem o cron configurado
2. Veja logs do cron em Vercel → Logs → Cron Jobs
3. Verifique que `CRON_SECRET` está configurado

---

## 📞 Checklist de Debug

- [ ] Variáveis de ambiente configuradas (`ZAPIER_WEBHOOK_URL`, `BUFFER_WEBHOOK_SECRET`, `CRON_SECRET`)
- [ ] Zapier tem webhook de confirmação configurado
- [ ] Header `x-webhook-secret` está correto no Zapier
- [ ] Metadata `studio_post_id` está sendo passado no webhook
- [ ] Cron jobs estão executando (verificar logs no Vercel)
- [ ] Testou com endpoint de teste (`/api/webhooks/buffer/test`)

---

## 🎯 Próximos Passos

1. Configure o Zapier seguindo o passo a passo acima
2. Teste com o endpoint de teste para validar
3. Poste um post de teste e monitore os logs
4. Verifique se mudou de POSTING para POSTED

Se ainda tiver problemas, compartilhe os logs do Vercel! 🚀
