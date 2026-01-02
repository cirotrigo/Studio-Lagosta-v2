# Configuração do N8N para Lembretes

## Problema Identificado

O webhook de lembrete está sendo disparado corretamente, mas o campo `reminderSentAt` não está sendo atualizado no banco de dados em produção. Por isso, o badge não fica verde.

## Solução: Webhook de Confirmação

Adicionamos um endpoint que o N8N pode chamar para confirmar o recebimento do lembrete.

---

## Configuração do Workflow N8N

### 1. Webhook de Entrada (Recebe o Lembrete)

**URL**: `https://n8n.lagostacriativa.com.br/webhook/notifica-lagosta`

**Método**: POST

**Payload recebido**:
```json
{
  "type": "reminder",
  "post": {
    "id": "cmjw762fp0001swrseebzlfst",
    "content": "Legenda do post",
    "scheduledFor": "2026-01-01T22:40:00Z",
    "platform": "instagram",
    "postType": "POST",
    "mediaUrls": ["https://..."],
    "extraInfo": null,
    "firstComment": null
  },
  "project": {
    "id": 8,
    "name": "Lagosta Criativa",
    "instagramUsername": "lagostacriativa"
  }
}
```

### 2. Processar Lembrete

Aqui você faz o que quiser com o lembrete:
- Enviar notificação
- Salvar no Google Sheets
- Enviar e-mail
- etc.

### 3. **IMPORTANTE**: Chamar Webhook de Confirmação

Depois de processar o lembrete, adicione um nó HTTP Request:

**URL**: `https://sua-url-vercel.com/api/webhooks/reminder-confirm`

**Método**: POST

**Headers**:
```json
{
  "Content-Type": "application/json"
}
```

**Body** (JSON):
```json
{
  "postId": "{{ $json.post.id }}"
}
```

**Importante**: Use o campo `post.id` do payload original.

---

## Resposta do Endpoint

### Sucesso (200):
```json
{
  "success": true,
  "message": "Reminder confirmed",
  "sentAt": "2026-01-01T22:30:00.000Z"
}
```

### Já Confirmado (200):
```json
{
  "success": true,
  "message": "Already marked as sent",
  "sentAt": "2026-01-01T22:30:00.000Z"
}
```

### Erro - Post Não Encontrado (404):
```json
{
  "error": "Post not found"
}
```

### Erro - Não é REMINDER (400):
```json
{
  "error": "Post is not a reminder"
}
```

---

## Exemplo de Workflow N8N

```
┌─────────────────┐
│  Webhook Trigger│  Recebe lembrete
│  (POST)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Processar      │  Suas ações
│  Lembrete       │  (notificar, etc)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Request   │  Confirma recebimento
│  POST /confirm  │  (marca badge verde)
└─────────────────┘
```

---

## Teste Local

Para testar o endpoint de confirmação localmente:

```bash
curl -X POST http://localhost:3000/api/webhooks/reminder-confirm \
  -H "Content-Type: application/json" \
  -d '{"postId": "cmjw762fp0001swrseebzlfst"}'
```

Resposta esperada:
```json
{
  "success": true,
  "message": "Reminder confirmed",
  "sentAt": "2026-01-01T22:36:00.000Z"
}
```

---

## Verificar se Funcionou

Depois que o N8N chamar o endpoint de confirmação:

1. **Recarregue a página** do calendário
2. O badge do lembrete deve ficar **verde** 🟢
3. Ao passar o mouse, deve mostrar: "Lembrete enviado em DD/MM/AAAA HH:MM"

---

## Troubleshooting

### Badge não fica verde

1. Verifique os logs do N8N - a chamada foi bem-sucedida?
2. Verifique se o `postId` está correto
3. Teste manualmente com o curl acima
4. Verifique no banco:
   ```bash
   node -e "
   const { PrismaClient } = require('./prisma/generated/client');
   const prisma = new PrismaClient();
   prisma.socialPost.findUnique({
     where: { id: 'SEU-POST-ID' }
   }).then(p => console.log('reminderSentAt:', p.reminderSentAt));
   "
   ```

### Webhook não chega no N8N

1. Verifique se o webhook está configurado no projeto
2. Verifique os logs do Vercel (cron job `/api/cron/reminders`)
3. Teste manualmente:
   ```bash
   curl "https://sua-url-vercel.com/api/cron/reminders" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
