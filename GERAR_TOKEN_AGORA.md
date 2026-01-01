# ⚡ Gerar Token do Instagram AGORA - Guia Rápido

## 🎯 O QUE VOCÊ PRECISA

Um **Instagram Access Token** válido para conectar a conta @bacanabar (ou outra conta do projeto).

## ✅ MÉTODO MAIS SIMPLES - FUNCIONA SEMPRE

### Passo 1: Acesse o Graph API Explorer

**LINK DIRETO:** https://developers.facebook.com/tools/explorer/

### Passo 2: Configure o Explorer

1. No canto superior, clique em **"Meta App"** (ou "Application")
2. Selecione seu app (o que você usa para o Instagram)
3. Se não tem app, clique em **"Create App"** primeiro

### Passo 3: Mude para Instagram Graph API

1. À direita de "Meta App", tem um dropdown que diz **"User or Page"**
2. Clique nele
3. Selecione **"Instagram Account"**

### Passo 4: Selecione a Conta do Instagram

1. Vai aparecer **"Get User Access Token"**
2. Clique nele
3. Uma janela vai abrir pedindo para **fazer login no Instagram**
4. **Faça login com a conta que quer conectar** (ex: bacanabar)

### Passo 5: Selecione as Permissões

Marque estas permissões (IMPORTANTE):

- ✅ `instagram_basic`
- ✅ `instagram_content_publish`
- ✅ `instagram_manage_comments`
- ✅ `instagram_manage_insights` ← **ESSENCIAL para analytics de Stories!**
- ✅ `pages_read_engagement`

Clique em **"Generate Access Token"**

### Passo 6: Copie o Token

1. Depois de autorizar, volte para o Graph API Explorer
2. Você verá um token longo no campo **"Access Token"**
3. Copie TODO o token (200-300 caracteres)

### Passo 7: Converta para Token de Longa Duração

**IMPORTANTE:** O token inicial expira em 1 hora. Precisamos converter para 60 dias.

**LINK DIRETO:** https://developers.facebook.com/tools/debug/accesstoken/

1. Cole o token que você copiou
2. Clique em **"Debug"**
3. Você verá informações sobre o token
4. Clique no botão **"Extend Access Token"** (no final da página)
5. Um novo token de **60 dias** será gerado
6. **COPIE ESSE NOVO TOKEN!**

### Passo 8: Teste o Token

Abra o terminal e teste:

```bash
curl "https://graph.instagram.com/me?fields=id,username,account_type&access_token=SEU_TOKEN_AQUI"
```

Deve retornar algo como:
```json
{
  "id": "123456789",
  "username": "bacanabar",
  "account_type": "BUSINESS"
}
```

Se funcionar, **ESSE É O TOKEN CORRETO!**

---

## 🚨 PROBLEMAS COMUNS

### ❌ "Invalid OAuth access token"

**Causa:** Token copiado errado
**Solução:**
- Certifique-se de copiar TODO o token
- Não deve ter espaços ou quebras de linha
- Token tem 200-300 caracteres

### ❌ "The access token could not be decrypted"

**Causa:** Token do Facebook, não do Instagram
**Solução:** No Graph API Explorer, certifique-se de selecionar **"Instagram Account"** não "User or Page"

### ❌ "(#10) Application does not have permission"

**Causa:** Falta a permissão `instagram_manage_insights`
**Solução:** Ao gerar o token, marque TODAS as permissões listadas acima

---

## 🎯 MÉTODO ALTERNATIVO - Meta Business Suite

Se o método acima não funcionar, use esta alternativa:

### Passo 1: Acesse o Business Manager

**LINK:** https://business.facebook.com/settings/system-users

### Passo 2: Crie um System User

1. Clique em **"Add"**
2. Nome: "Studio Lagosta API"
3. Role: **Admin**
4. Clique em **"Create System User"**

### Passo 3: Gere o Token

1. Clique no System User que você criou
2. Clique em **"Generate New Token"**
3. Selecione seu App
4. Marque as permissões:
   - ✅ `instagram_basic`
   - ✅ `instagram_manage_insights`
   - ✅ `pages_read_engagement`
5. Token Expiration: **60 days**
6. Clique em **"Generate Token"**

### Passo 4: Copie e Teste

Copie o token e teste com o curl acima.

---

## 💾 DEPOIS DE GERAR O TOKEN

1. **Adicione ao .env local:**
   ```bash
   INSTAGRAM_ACCESS_TOKEN=seu_token_aqui
   ```

2. **Atualize na Vercel:**
   - https://vercel.com/
   - Seu projeto > Settings > Environment Variables
   - Edit `INSTAGRAM_ACCESS_TOKEN`
   - Cole o token
   - Save

3. **Redeploy:**
   ```bash
   vercel --prod
   ```

---

## 🆘 AINDA TEM PROBLEMAS?

**Me envie:**
1. Screenshot do Graph API Explorer (com o tipo de conta selecionado)
2. Os primeiros 20 caracteres do token gerado
3. O erro que está aparecendo

Vou te ajudar a resolver!

---

## ⏰ LEMBRETE IMPORTANTE

- Token expira em **60 dias**
- Configure um lembrete no calendário
- Ou use tokens que nunca expiram (via Meta Business Suite + System User)
