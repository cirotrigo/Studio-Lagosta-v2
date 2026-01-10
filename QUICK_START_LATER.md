# ⚡ Quick Start - Later Integration

**Configure Later em 5 minutos!**

---

## 🎯 Passo a Passo Simples

### 1️⃣ Criar Conta Later

```
https://getlate.dev
```

- Criar conta FREE
- Conectar Instagram
- Ir em **Settings → API**
- Copiar **API Key**

---

### 2️⃣ Adicionar ao .env

Abra o arquivo `.env` na raiz do projeto e adicione:

```env
LATER_API_KEY=cole_sua_api_key_aqui
```

Salve o arquivo.

---

### 3️⃣ Gerar Webhook Secret

```bash
npx tsx scripts/later/generate-webhook-secret.ts
```

Copie o secret gerado e adicione ao `.env`:

```env
LATE_WEBHOOK_SECRET=cole_o_secret_gerado_aqui
```

---

### 4️⃣ Testar Conexão

```bash
npx tsx scripts/later/test-connection.ts
```

✅ **Deve mostrar:**
```
✅ Found 1 account(s):

1. @sua_conta_instagram
   Account ID: acc_12345  ← COPIE ESTE ID
```

📝 **Copie o Account ID** (ex: `acc_12345`)

---

### 5️⃣ Configurar Projeto

```bash
npx tsx scripts/later/configure-project.ts "Nome do Projeto" acc_12345
```

Substitua:
- `"Nome do Projeto"` → nome exato do seu projeto
- `acc_12345` → Account ID copiado no passo 4

✅ **Deve mostrar:**
```
✅ Project configured successfully!
   Posting Provider: LATER
```

---

### 6️⃣ Testar no Site

```bash
npm run dev
```

1. Acesse o dashboard
2. Vá no projeto configurado
3. Crie um **Story** de teste:
   - Upload uma imagem
   - Caption: "Teste Later 🚀"
   - Agendamento: **Imediato**
4. Clique em **Criar Post**

---

### 7️⃣ Verificar Logs

No terminal, procure por:

```
[Later Client] ✅ Media uploaded successfully via presign: ... (image)
[Later Client] Post created: post_abc (published|publishing)
[Later Scheduler] ✅ Post processed successfully
```

✅ **Sucesso!** Se viu esses logs, está funcionando!

---

### 8️⃣ Verificar Later Dashboard

```
https://app.getlate.dev
```

O post deve aparecer no calendário!

---

## 🔧 Troubleshooting Rápido

### ❌ "LATER_API_KEY not found"

**Solução:**
1. Verifique o arquivo `.env` tem a linha:
   ```env
   LATER_API_KEY=sua_key_aqui
   ```
2. Salve o arquivo
3. Rode o comando novamente

---

### ❌ "Using Zapier/Buffer" nos logs

**Solução:**
```bash
# Ver configuração dos projetos
npx tsx scripts/later/list-projects.ts

# Se o projeto não estiver usando LATER, configure:
npx tsx scripts/later/configure-project.ts "Nome do Projeto" acc_xxxxx
```

---

### ❌ "No accounts found"

**Solução:**
1. Vá em https://app.getlate.dev
2. Settings → Accounts
3. Conecte sua conta Instagram
4. Tente novamente

---

## 🆘 Precisa de Ajuda?

Documentação completa: [TESTING_LATER.md](TESTING_LATER.md)

Scripts disponíveis:
```bash
# Setup interativo
npx tsx scripts/later/setup.ts

# Ver todos os projetos
npx tsx scripts/later/list-projects.ts

# Voltar para Zapier (rollback)
npx tsx scripts/later/rollback-to-zapier.ts "Nome do Projeto"
```

---

**🎉 Pronto! Você configurou Later em seu projeto!**

---

## 🔐 Produção & Segurança

- Configure `LATE_WEBHOOK_SECRET` e `CRON_SECRET` no ambiente de produção.
- Não compartilhe logs que contenham tokens ou chaves.
- Se uma chave aparecer em logs, **rotacione imediatamente**.
