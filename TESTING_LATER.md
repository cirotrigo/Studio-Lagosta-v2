# 🧪 Guia de Teste - Later API Integration

**Instruções completas para testar a integração Later no site.**

---

## 📋 Pré-requisitos

### 1. Later Account Setup

1. **Criar conta Later FREE:**
   - Acesse https://getlate.dev
   - Crie uma conta gratuita
   - Conecte sua conta Instagram

2. **Obter API Key:**
   - Vá em Settings → API
   - Gere uma nova API key
   - Copie a key

3. **Configurar Variáveis de Ambiente:**

Adicione ao seu `.env`:

```env
# Later API Integration
LATER_API_KEY=sua_api_key_aqui
LATE_WEBHOOK_SECRET=gere_um_secret_aleatorio
```

**Gere o webhook secret:**
```bash
# Opção 1: Usar o script
npx tsx scripts/later/generate-webhook-secret.ts

# Opção 2: Manualmente
openssl rand -hex 32
```

**OU use o setup interativo:**
```bash
npx tsx scripts/later/setup.ts
```

---

## 🚀 Passo a Passo do Teste

### **PASSO 1: Testar Conexão com Later**

```bash
npx tsx scripts/later/test-connection.ts
```

**Resultado esperado:**
```
✅ Found 1 account(s):

1. @sua_conta_instagram
   Platform: instagram
   Account ID: acc_12345  ← COPIE ESTE ID
   Profile ID: ig_67890
   Status: ✅ Active
```

📝 **Ação:** Copie o `Account ID` (ex: `acc_12345`)

---

### **PASSO 2: Listar Seus Projetos**

```bash
npx tsx scripts/later/list-projects.ts
```

**Resultado esperado:**
```
Total Projects: 8
  • Later API: 0
  • Zapier/Buffer: 8

📤 PROJECTS USING ZAPIER/BUFFER
1. Lagosta Criativa (ID: 1)
2. Espeto Gaúcho (ID: 2)
...
```

📝 **Ação:** Escolha um projeto para teste (recomendo o de menor volume)

---

### **PASSO 3: Configurar Projeto para Later**

```bash
npx tsx scripts/later/configure-project.ts "Lagosta Criativa" acc_12345
```

Substitua:
- `"Lagosta Criativa"` pelo nome do seu projeto
- `acc_12345` pelo Account ID copiado no Passo 1

**Resultado esperado:**
```
✅ Project configured successfully!
📊 UPDATED CONFIGURATION:
   Project ID: 1
   Project Name: Lagosta Criativa
   Posting Provider: LATER
   Later Account ID: acc_12345
```

---

### **PASSO 4: Criar Post de Teste**

#### Opção A: Via UI (Recomendado)

1. **Acesse o site** em desenvolvimento:
   ```bash
   npm run dev
   ```

2. **Faça login** no dashboard

3. **Navegue até o projeto** configurado

4. **Crie um novo post:**
   - Tipo: Story
   - Upload uma imagem de teste
   - Caption: "Teste Later API 🚀"
   - Agendamento: Imediato (IMMEDIATE)
   - Publish Type: Direct

5. **Clique em "Criar Post"**

#### Opção B: Via API (Avançado)

```bash
curl -X POST http://localhost:3000/api/projects/1/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "postType": "STORY",
    "caption": "Teste Later API 🚀",
    "mediaUrls": ["URL_DA_IMAGEM"],
    "scheduleType": "IMMEDIATE",
    "publishType": "DIRECT"
  }'
```

---

### **PASSO 5: Verificar Logs do Servidor**

Monitore o terminal onde `npm run dev` está rodando:

```
📤 [Dual-Mode Router] Using Later API for project "Lagosta Criativa"
[Later Scheduler] Creating post with schedule type: IMMEDIATE
[Later Client] 📤 Uploading media from URL: https://...
[Later Client] ✅ Media uploaded successfully via presign: ... (image)
[Later Scheduler] Creating post in Later...
[Later Client] Post created: post_abc (publishing)
[Later Scheduler] Deducting credits...
[Later Scheduler] ✅ Post cm123 processed successfully
```

✅ **Sucesso se ver:** `Using Later API` e `✅ Post processed successfully`

❌ **Erro se ver:** `Using Zapier/Buffer` ou erros de API

---

### **PASSO 6: Verificar no Later Dashboard**

1. **Acesse:** https://app.getlate.dev
2. **Vá para Calendar** ou **Posts**
3. **Verifique:** Post de teste deve aparecer
4. **Status:** `Publishing` ou `Published`

---

### **PASSO 7: Verificar no Banco de Dados**

Opcional, mas útil para debug:

```bash
npx prisma studio
```

1. Abra tabela `SocialPost`
2. Encontre o post recém-criado
3. Verifique campos:
   - `status`: deve ser `SCHEDULED` ou `POSTED`
   - `laterPostId`: deve ter valor (ex: `post_abc123`)
   - `verificationTag`: deve ter valor se for Story

---

### **PASSO 8: Configurar Webhook Later (Opcional)**

Para receber confirmações de publicação:

1. **No Later Dashboard:**
   - Settings → Webhooks
   - Add Webhook URL: `https://seu-dominio.com/api/webhooks/later`
   - Selecione eventos:
     - ✅ `post.scheduled`
     - ✅ `post.published`
     - ✅ `post.failed`
   - Copie o Webhook Secret

2. **Adicione ao `.env`:**
   ```env
   LATE_WEBHOOK_SECRET=secret_copiado_aqui
   ```

3. **Reinicie o servidor:**
   ```bash
   # Ctrl+C e depois
   npm run dev
   ```

4. **Teste o webhook:**
   - Crie outro post
   - Aguarde publicação
   - Verifique logs do webhook:
   ```
   📥 LATER WEBHOOK RECEIVED
   ✨ Processing post.published event...
✅ Post cm123 confirmed as POSTED
```

---

## 🔐 Segurança

- Nunca publique logs que contenham tokens ou chaves.
- Se um token aparecer em logs, **rotacione imediatamente**.

---

## ✅ Critérios de Sucesso

O teste é considerado **bem-sucedido** se:

1. ✅ Logs mostram `Using Later API`
2. ✅ Post aparece no Later dashboard
3. ✅ Post é publicado no Instagram (para posts imediatos)
4. ✅ Status no banco atualiza para `POSTED`
5. ✅ Webhook é recebido e processado (se configurado)
6. ✅ Story verification funciona (se for Story)

---

## 🐛 Troubleshooting

### Problema: "Using Zapier/Buffer" nos logs

**Causa:** Projeto não configurado corretamente

**Solução:**
```bash
# Verificar configuração
npx tsx scripts/later/list-projects.ts

# Reconfigurar se necessário
npx tsx scripts/later/configure-project.ts "Nome do Projeto" acc_xxxxx
```

---

### Problema: "LATER_API_KEY not found"

**Causa:** API key não configurada

**Solução:**
1. Verifique `.env` tem `LATER_API_KEY=...`
2. Reinicie servidor (`npm run dev`)
3. Teste conexão: `npx tsx scripts/later/test-connection.ts`

---

### Problema: "Failed to upload media"

**Causa:** URL de mídia inválida ou inacessível

**Solução:**
1. Verifique URL está acessível (abra no navegador)
2. Verifique formato (JPG, PNG, MP4)
3. Verifique tamanho (max 8MB imagens, 100MB vídeos)

---

### Problema: "Rate limit exceeded"

**Causa:** Muitas requisições em pouco tempo

**Solução:**
1. Aguarde 1 minuto
2. Later FREE: 60 req/min
3. Post criará retry automático

---

### Problema: Webhook não recebido

**Causa:** Webhook não configurado ou URL incorreta

**Solução:**
1. Verifique URL no Later: `https://seu-dominio.com/api/webhooks/later`
2. Teste webhook localmente: use ngrok para expor localhost
3. Verifique `LATE_WEBHOOK_SECRET` no `.env`

---

## 🔄 Rollback

Se encontrar problemas e quiser voltar para Zapier:

### Rollback de Um Projeto

```bash
npx tsx scripts/later/rollback-to-zapier.ts "Nome do Projeto"
```

### Rollback de Todos os Projetos (Emergência)

```bash
npx tsx scripts/later/rollback-to-zapier.ts --all
```

Isso reverte imediatamente para Zapier/Buffer sem perder dados.

---

## 📊 Monitoramento

### Ver Status de Todos os Projetos

```bash
npx tsx scripts/later/list-projects.ts
```

### Ver Posts Recentes

```bash
npx prisma studio
```

1. Tabela `SocialPost`
2. Ordenar por `createdAt` descrescente
3. Verificar:
   - `status`: SCHEDULED, POSTED, FAILED
   - `laterPostId`: presente se foi via Later
   - `verificationStatus`: para Stories

---

## 📈 Próximos Passos Após Teste Bem-Sucedido

1. **Monitorar por 24-48h:**
   - Taxa de sucesso
   - Tempo de publicação
   - Story verification

2. **Se tudo OK, migrar próximo projeto:**
   ```bash
   npx tsx scripts/later/configure-project.ts "Próximo Projeto" acc_xxxxx
   ```

3. **Repetir até migrar todos os projetos**

4. **Desativar Zapier integration**

---

## 📚 Documentação Completa

- **Later Integration Guide:** `/docs/later-integration.md`
- **Migration Plan:** `/prompts/plano-later.md`
- **Scripts README:** `/scripts/later/README.md`
- **Later API Docs:** https://docs.getlate.dev

---

## 🆘 Suporte

Se encontrar problemas não listados aqui:

1. Verifique logs do servidor
2. Verifique logs do Later dashboard
3. Teste conexão: `npx tsx scripts/later/test-connection.ts`
4. Consulte `/docs/later-integration.md` seção Troubleshooting

---

**Última atualização:** 2024-12-28
**Status:** ✅ Pronto para teste
