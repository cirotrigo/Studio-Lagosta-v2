# 🎯 Mapeamento Final dos Campos do Zapier

## 📊 Análise dos Dados Disponíveis

### **Dados do Studio Lagosta (Entrada do Zap 1):**
```yaml
✅ Disponível:
  metadata:
    studio_post_id: "cmhkkzdvo0001ld048h2f7oj1"
    post_id: "cmhkkzdvo0001ld048h2f7oj1"
    project_id: 4
    project_name: "Seu Quinto"
    user_id: "cmgpxg8sb0000l104fn4178o3"
    created_at: "2025-11-04T13:04:36.612Z"
```

### **Dados do Buffer (Saída após postagem):**
```yaml
✅ Disponível:
  Updates Id: "6904c1ba2ab341f5f10a5254"
  Updates Created At: 1761919418
  Updates User Email: "cirotrigo@gmail.com"
  Updates Status: "buffer"

❌ NÃO Disponível:
  - metadata (não é retornado pelo Buffer)
  - studio_post_id (não existe no Buffer)
```

---

## ✅ SOLUÇÃO RECOMENDADA: 3 OPÇÕES

### **OPÇÃO 1: Usar Zapier Storage (MAIS ROBUSTO)** ⭐ RECOMENDADO

**Vantagem:** Armazena o mapeamento de forma confiável
**Desvantagem:** Requer plano Zapier Professional

#### **ZAP 1: Studio Lagosta → Buffer**

1. **Trigger:** Webhooks by Zapier - Catch Hook
2. **Action 1:** Storage by Zapier - Set Value
   - **Key:** `buffer_{{metadata__studio_post_id}}`
   - **Value:** `{{metadata__studio_post_id}}`
   - **TTL:** 3600 (1 hora)
3. **Action 2:** Buffer - Create Update
   - Criar post normalmente

#### **ZAP 2: Buffer → Studio Lagosta (Confirmação)**

1. **Trigger:** Buffer - New Sent Update
2. **Action 1:** Storage by Zapier - Get Value
   - **Key:** `buffer_*` (buscar por padrão)
   - **Fallback:** usar último post POSTING
3. **Action 2:** Webhooks by Zapier - POST
   ```json
   {
     "status": "sent",
     "buffer_update_id": "{{Updates Id}}",
     "sent_at": {{Updates Created At}},
     "studio_post_id": "{{storage_value}}"
   }
   ```

---

### **OPÇÃO 2: Usar Último Post POSTING (MAIS SIMPLES)** ⭐ JÁ IMPLEMENTADO

**Vantagem:** Não precisa de Zapier Storage
**Desvantagem:** Pode falhar se múltiplos posts forem enviados rapidamente

#### **ZAP 2: Buffer → Studio Lagosta (Confirmação)**

**Payload:**
```json
{
  "status": "sent",
  "buffer_update_id": "{{Updates Id}}",
  "sent_at": {{Updates Created At}}
}
```

**Como funciona:**
- Sistema busca o último post com status `POSTING`
- Ordena por `createdAt DESC`
- Atualiza para `POSTED`

**Quando usar:**
- ✅ Apenas 1 usuário postando
- ✅ Posts enviados com intervalo > 5 segundos
- ✅ Não quer pagar Zapier Professional

---

### **OPÇÃO 3: Adicionar studio_post_id no Webhook do Buffer** ❌ NÃO POSSÍVEL

**Problema:** Buffer não aceita campos customizados que são retornados na confirmação.

---

## 🎯 MAPEAMENTO FINAL RECOMENDADO

### **Se você tem Zapier Professional → Use OPÇÃO 1**

**ZAP 1: Studio Lagosta → Buffer**
```
1. Webhook Trigger
   ↓
2. Storage Set Value
   Key: buffer_{{metadata__studio_post_id}}
   Value: {{metadata__studio_post_id}}
   ↓
3. Buffer Create Update
```

**ZAP 2: Buffer → Studio Lagosta**
```
1. Buffer New Sent Update
   ↓
2. Storage Get Value (buscar studio_post_id)
   ↓
3. Webhook POST
   {
     "status": "sent",
     "buffer_update_id": "{{Updates Id}}",
     "sent_at": {{Updates Created At}},
     "studio_post_id": "{{storage_value}}"
   }
```

---

### **Se você tem Zapier FREE/Starter → Use OPÇÃO 2 (Atual)**

**ZAP 2: Buffer → Studio Lagosta**
```
1. Buffer New Sent Update
   ↓
2. Webhook POST
   {
     "status": "sent",
     "buffer_update_id": "{{Updates Id}}",
     "sent_at": {{Updates Created At}}
   }
```

**Sistema identifica automaticamente:**
- Busca último post com status `POSTING`
- Ordena por data de criação (mais recente)
- Atualiza para `POSTED`

---

## 📋 CAMPOS DETALHADOS PARA MAPEAMENTO

### **Campos Obrigatórios:**

| Campo | Fonte | Valor Exemplo | Descrição |
|-------|-------|---------------|-----------|
| `status` | Fixo | `"sent"` | Indica sucesso |

### **Campos Opcionais (Recomendados):**

| Campo | Fonte Buffer | Valor Exemplo | Descrição |
|-------|--------------|---------------|-----------|
| `buffer_update_id` | `{{Updates Id}}` | `"6904c1ba2ab341f5f10a5254"` | ID do post no Buffer |
| `sent_at` | `{{Updates Created At}}` | `1761919418` | Timestamp Unix |

### **Campo Opcional (Apenas com Storage):**

| Campo | Fonte | Valor Exemplo | Descrição |
|-------|-------|---------------|-----------|
| `studio_post_id` | Storage ou Formatter | `"cmhkkzdvo0001ld048h2f7oj1"` | ID do post no Studio |

---

## 🧪 TESTE DO MAPEAMENTO

### **Teste 1: Com Storage (OPÇÃO 1)**
```bash
curl -X POST http://localhost:3000/api/webhooks/buffer/post-sent \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941" \
  -d '{
    "status": "sent",
    "buffer_update_id": "6904c1ba2ab341f5f10a5254",
    "sent_at": 1761919418,
    "studio_post_id": "cmhkkzdvo0001ld048h2f7oj1"
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Post marked as published",
  "postId": "cmhkkzdvo0001ld048h2f7oj1",
  "projectName": "Seu Quinto"
}
```

---

### **Teste 2: Sem Storage (OPÇÃO 2 - Atual)**
```bash
curl -X POST http://localhost:3000/api/webhooks/buffer/post-sent \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941" \
  -d '{
    "status": "sent",
    "buffer_update_id": "6904c1ba2ab341f5f10a5254",
    "sent_at": 1761919418
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Post marked as published",
  "postId": "cmhkkzdvo0001ld048h2f7oj1",
  "projectName": "Seu Quinto"
}
```

---

## 🎯 DECISÃO FINAL

### **Você deve usar: OPÇÃO 2 (Sem Storage)** ✅

**Por quê?**
1. ✅ **Mais simples** - Menos steps no Zapier
2. ✅ **Sem custo adicional** - Funciona no plano Free
3. ✅ **Já implementado** - Webhook já busca automaticamente
4. ✅ **Confiável** - Posts são enviados um por vez
5. ✅ **Menos pontos de falha** - Não depende de Storage

**Quando considerar OPÇÃO 1:**
- ⚠️ Múltiplos usuários postando simultaneamente
- ⚠️ Posts enviados em lote (>5 por minuto)
- ⚠️ Já tem Zapier Professional

---

## 📦 PAYLOAD FINAL (OPÇÃO 2 - RECOMENDADO)

### **Configuração no Zapier (Zap 2):**

**URL:**
```
https://studio-lagosta.vercel.app/api/webhooks/buffer/post-sent
```

**Headers:**
```
x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941
Content-Type: application/json
```

**Data (JSON):**
```json
{
  "status": "sent",
  "buffer_update_id": "{{Updates Id}}",
  "sent_at": {{Updates Created At}}
}
```

### **Mapeamento dos Campos:**

| Campo no Webhook | Campo do Buffer (Zapier) |
|-----------------|--------------------------|
| `status` | Fixo: `"sent"` |
| `buffer_update_id` | `{{Updates Id}}` ou `{{Updates ID}}` |
| `sent_at` | `{{Updates Created At}}` |

---

## ✅ CHECKLIST DE CONFIGURAÇÃO

### **Zap 2: Buffer → Studio Lagosta**

- [ ] Trigger: Buffer - New Sent Update
- [ ] Action: Webhooks by Zapier - POST
- [ ] URL configurada: `https://studio-lagosta.vercel.app/api/webhooks/buffer/post-sent`
- [ ] Header `x-webhook-secret` configurado
- [ ] Payload JSON com 3 campos: status, buffer_update_id, sent_at
- [ ] Campo `status` = `"sent"` (fixo, entre aspas)
- [ ] Campo `buffer_update_id` = `{{Updates Id}}`
- [ ] Campo `sent_at` = `{{Updates Created At}}` (número, sem aspas)
- [ ] Testar com post real
- [ ] Verificar que post muda de POSTING → POSTED

---

## 🎉 PRONTO!

Configuração final:
- ✅ **3 campos apenas**
- ✅ **Sem dependências de Storage**
- ✅ **Funciona no Zapier Free**
- ✅ **Simples e robusto**

**O webhook já está preparado para receber esses dados e funcionar perfeitamente!**
