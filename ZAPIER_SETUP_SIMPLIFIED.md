# 🚀 Configuração Simplificada do Zapier - Buffer → Studio Lagosta

## 📋 Resumo do Fluxo

**FLUXO SIMPLIFICADO (sem dependência de campos customizados):**

1. **Studio Lagosta** → Envia post para Zapier
2. **Zapier** → Cria post no Buffer
3. **Buffer** → Publica no Instagram
4. **Buffer** → Confirma publicação (trigger "New Sent Update")
5. **Zapier** → Envia webhook para Studio Lagosta
6. **Studio Lagosta** → Atualiza status do último post "POSTING" para "POSTED"

---

## ✅ VANTAGENS DA NOVA ABORDAGEM

- ✅ **Não depende de campos customizados** do Buffer
- ✅ **Não precisa buscar API do Instagram** para permalink
- ✅ **Identifica post automaticamente** pelo último status "POSTING"
- ✅ **Funciona com dados que o Buffer já retorna** nativamente
- ✅ **Simples de configurar** no Zapier

---

## 🔧 ZAP 1: Studio Lagosta → Buffer (Envio)

### **Trigger: Webhooks by Zapier - Catch Hook**

**URL do webhook:** (copiar do Zapier após criar o trigger)

Configure no projeto do Studio Lagosta em: **Configurações do Projeto → Webhook do Zapier**

---

### **Action 1: Buffer - Create Update**

**Mapeamento de campos:**

| Campo Buffer | Valor do Zapier |
|-------------|-----------------|
| **Profile** | Selecione o perfil do Instagram |
| **Text** | `{{caption}}` (deixar vazio para Stories) |
| **Media** | `{{image0}}` ou `{{video}}` |
| **Share Now** | `Yes` (para posts imediatos) |
| **Scheduled At** | `{{scheduled_datetime}}` (para posts agendados) |

**Campos opcionais (ignorar):**
- ❌ Note
- ❌ Metadata
- ❌ Tags

---

## 🔧 ZAP 2: Buffer → Studio Lagosta (Confirmação)

### **Trigger: Buffer - New Sent Update**

**Configuração:**
- Account: Sua conta do Buffer
- Trigger: Quando um post é enviado com sucesso

---

### **Action: Webhooks by Zapier - POST**

**URL:**
```
https://seu-dominio.com/api/webhooks/buffer/post-sent
```

**Method:** POST

**Headers:**
```
x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941
Content-Type: application/json
```

**Payload Type:** JSON

**Data (Body):**
```json
{
  "status": "sent",
  "buffer_update_id": "{{id}}",
  "sent_at": {{created_at}}
}
```

**Mapeamento de campos do Buffer:**

| Campo no Payload | Campo do Buffer | Exemplo |
|-----------------|-----------------|---------|
| `status` | Fixo: `"sent"` | `"sent"` |
| `buffer_update_id` | `{{id}}` | `"6904c1ba2ab341f5f10a5254"` |
| `sent_at` | `{{created_at}}` | `1761919418` |

---

## 🧪 TESTE DO WEBHOOK

### **Teste 1: Simular confirmação de sucesso**

```bash
curl -X POST https://seu-dominio.com/api/webhooks/buffer/post-sent \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941" \
  -d '{
    "status": "sent",
    "buffer_update_id": "test_123",
    "sent_at": 1761919418
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Post marked as published",
  "postId": "cm5abc123xyz",
  "projectName": "Meu Projeto"
}
```

---

### **Teste 2: Simular falha**

```bash
curl -X POST https://seu-dominio.com/api/webhooks/buffer/post-sent \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941" \
  -d '{
    "status": "failed",
    "buffer_update_id": "test_123"
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Post marked as failed",
  "postId": "cm5abc123xyz"
}
```

---

## 📊 COMO FUNCIONA A IDENTIFICAÇÃO DO POST

### **Estratégia de Match:**

1. Webhook recebe apenas: `status`, `buffer_update_id`, `sent_at` (3 campos!)
2. Sistema busca no banco de dados:
   - Status = `POSTING` (aguardando confirmação)
   - Ordenado por `createdAt DESC` (mais recente primeiro)
3. Atualiza o post encontrado:
   - Sucesso: `status = POSTED`, `sentAt = timestamp`
   - Falha: `status = FAILED`, `failedAt = timestamp`

### **Por que funciona:**

- ✅ Posts são enviados um por vez pelo usuário
- ✅ Status `POSTING` é único (só existe enquanto aguarda confirmação)
- ✅ Webhook do Buffer é rápido (confirma em segundos)
- ✅ Busca sempre o mais recente = match correto

---

## 🎯 FLUXO DE STATUS DO POST

```
DRAFT (Rascunho)
   ↓
SCHEDULED (Agendado para envio)
   ↓
POSTING (Enviado para Buffer, aguardando confirmação)
   ↓
[Webhook recebe confirmação]
   ↓
POSTED ✅ (Publicado com sucesso)
   ou
FAILED ❌ (Falhou ao publicar)
```

---

## 🔍 LOGS E DEBUG

### **Verificar logs no servidor:**

```bash
# Ver logs do webhook
pm2 logs studio-lagosta --lines 100 | grep "Buffer webhook"

# Ver último post POSTING
psql $DATABASE_URL -c "SELECT id, status, \"createdAt\" FROM \"SocialPost\" WHERE status = 'POSTING' ORDER BY \"createdAt\" DESC LIMIT 5;"
```

### **Logs esperados:**

**Quando post é enviado:**
```
✅ Post cm5abc123xyz enviado para Buffer com sucesso! Aguardando confirmação de publicação...
```

**Quando webhook recebe confirmação:**
```
📩 Buffer webhook received: { status: 'sent', buffer_update_id: '6904c1ba...', user_email: 'cirotrigo@gmail.com' }
📍 Found post: cm5abc123xyz from project Meu Projeto
✅ Post cm5abc123xyz confirmed as POSTED
```

---

## ⚠️ TROUBLESHOOTING

### **Problema: "No pending post found"**

**Causa:** Nenhum post com status `POSTING` foi encontrado.

**Soluções:**
1. Verificar se o post foi enviado com sucesso para o Buffer
2. Checar se o status do post no DB está como `POSTING`
3. Confirmar que o email do usuário está correto

```sql
-- Verificar posts POSTING
SELECT id, status, "userId", "createdAt"
FROM "SocialPost"
WHERE status = 'POSTING'
ORDER BY "createdAt" DESC;
```

---

### **Problema: Post permanece como "POSTING"**

**Causa:** Webhook não foi chamado ou falhou.

**Soluções:**
1. Verificar se o Zap 2 (Buffer → Studio Lagosta) está ativo
2. Ver logs do Zapier para erros
3. Testar o webhook manualmente com curl

---

### **Problema: Post errado sendo atualizado**

**Causa:** Múltiplos posts com status `POSTING` ao mesmo tempo.

**Soluções:**
1. Adicionar delay entre envios de posts (2-3 segundos)
2. Verificar se o filtro por `user_email` está funcionando
3. Limpar posts antigos em `POSTING`:

```sql
-- Marcar posts antigos POSTING como FAILED (mais de 5 minutos)
UPDATE "SocialPost"
SET status = 'FAILED',
    "errorMessage" = 'Timeout - webhook não recebido',
    "failedAt" = NOW()
WHERE status = 'POSTING'
  AND "createdAt" < NOW() - INTERVAL '5 minutes';
```

---

## 📝 CHECKLIST DE CONFIGURAÇÃO

### **No Studio Lagosta:**

- [ ] Banco de dados atualizado com novos status `POSTING` e `POSTED`
- [ ] Webhook secret configurado: `BUFFER_WEBHOOK_SECRET` em `.env`
- [ ] Código atualizado (scheduler + webhook route)
- [ ] Deploy realizado

### **No Zapier:**

#### **Zap 1 (Envio):**
- [ ] Trigger: Webhooks by Zapier - Catch Hook
- [ ] Action: Buffer - Create Update
- [ ] Campos mapeados corretamente
- [ ] Zap testado e ativado

#### **Zap 2 (Confirmação):**
- [ ] Trigger: Buffer - New Sent Update
- [ ] Action: Webhooks POST
- [ ] URL do webhook configurada
- [ ] Header `x-webhook-secret` configurado
- [ ] Payload JSON mapeado
- [ ] Zap testado e ativado

### **Testes:**
- [ ] Enviar post de teste via Studio Lagosta
- [ ] Verificar que status muda para `POSTING`
- [ ] Aguardar publicação no Buffer
- [ ] Confirmar que status atualiza para `POSTED`
- [ ] Verificar logs do webhook

---

## 🎉 PRONTO!

Agora o fluxo está simplificado e funcional:
- ✅ Não depende de campos customizados do Buffer
- ✅ Não precisa de API do Instagram
- ✅ Identifica posts automaticamente
- ✅ Fácil de debugar e manter

**Status visual no dashboard:**
- 🔵 **POSTING** = "Postando..." (azul)
- ✅ **POSTED** = "Postado" (verde)
- ❌ **FAILED** = "Falhou" (vermelho)
