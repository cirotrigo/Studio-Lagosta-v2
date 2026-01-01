# Como Gerar Token de Longa Duração do Instagram

## Passo a Passo Completo

### 1. Acesse o Facebook for Developers

Abra: https://developers.facebook.com/

### 2. Encontre seu App

- Clique em **"My Apps"** no canto superior direito
- Selecione o app que está conectado ao Instagram

### 3. Configure Instagram Basic Display

**Opção A: Se já existe o produto Instagram Basic Display**
1. No menu lateral, procure por **"Instagram Basic Display"**
2. Clique em **"Basic Display"**

**Opção B: Se NÃO existe**
1. Clique em **"Add Product"** (Adicionar Produto)
2. Procure por **"Instagram Basic Display"**
3. Clique em **"Set Up"** (Configurar)

### 4. Configure o Instagram App

1. Vá para **Settings > Basic** (Configurações > Básico)
2. Preencha os campos obrigatórios:
   - **Display Name**: Nome do seu app
   - **Privacy Policy URL**: URL da política de privacidade
   - **User Data Deletion URL**: URL para deletar dados

3. Salve as mudanças

### 5. Adicione Instagram Testers

1. Ainda em **Instagram Basic Display**
2. Role até **"Instagram Testers"**
3. Clique em **"Add Instagram Testers"**
4. Digite o **username** do Instagram que você quer conectar (ex: `bacanabar`)
5. Clique em **"Submit"**

6. **IMPORTANTE**: Agora você precisa ACEITAR o convite no Instagram:
   - Abra o Instagram (app ou web)
   - Vá para **Configurações > Apps and Websites** (ou **Sites e Apps**)
   - Procure por **"Tester Invites"** (Convites de Teste)
   - **Aceite** o convite do seu app

### 6. Gere o Token de Acesso

1. Volte para **Facebook Developers**
2. Em **Instagram Basic Display**, vá para **"User Token Generator"**
3. Clique em **"Generate Token"** ao lado da conta do Instagram
4. Uma janela popup vai abrir pedindo autorização
5. **Faça login** com a conta do Instagram
6. **Autorize** as permissões solicitadas
7. O token será gerado automaticamente

### 7. Verifique as Permissões

O token gerado deve ter estas permissões:
- ✅ `instagram_basic` - Acesso básico ao perfil
- ✅ `instagram_graph_user_profile` - Acesso ao perfil
- ✅ `instagram_graph_user_media` - Acesso às mídias

**⚠️ PARA ANALYTICS DE STORIES**: Você precisa de uma permissão adicional:
- ✅ `instagram_manage_insights` - **Analytics e Insights**

### 8. Como Adicionar a Permissão de Insights

**IMPORTANTE**: Para ter `instagram_manage_insights`, você precisa:

1. **Converter para Instagram Business Account**:
   - Abra o Instagram
   - Vá para **Settings > Account > Switch to Professional Account**
   - Escolha **Business** (não Creator)

2. **Conectar à Página do Facebook**:
   - No Instagram: **Settings > Account > Linked Accounts > Facebook**
   - Conecte a uma **Página do Facebook** (não perfil pessoal)

3. **Usar Instagram Graph API** (não Basic Display):
   - No Facebook Developers, adicione o produto **"Instagram Graph API"**
   - Isso requer **App Review** do Facebook
   - OU use o **Instagram Insights API** (mais simples)

### 9. SOLUÇÃO ALTERNATIVA (Mais Fácil)

Se você não conseguir a permissão de insights, há outra forma:

**Use o Meta Business Suite:**

1. Acesse https://business.facebook.com/
2. Vá para **Business Settings > Instagram Accounts**
3. Conecte sua conta do Instagram
4. Gere um **System User Token** com permissões de insights

**Passos:**
1. **Business Settings** > **System Users** > **Add**
2. Crie um System User
3. Clique em **Generate New Token**
4. Selecione as permissões:
   - ✅ `instagram_basic`
   - ✅ `instagram_manage_insights`
   - ✅ `pages_read_engagement`
5. Gere o token (60 dias de validade)

### 10. Copie o Token

Quando o token for gerado, você verá algo assim:

```
IGQVJ... [longo texto] ...xYZ
```

**COPIE TODO O TOKEN** - ele é bem longo (200-300 caracteres)!

### 11. Adicione ao Projeto

1. Abra o arquivo `.env` do projeto
2. Atualize a variável:
   ```
   INSTAGRAM_ACCESS_TOKEN=seu_token_completo_aqui
   ```

3. Se estiver em produção, atualize também na **Vercel**:
   - Vá para Vercel Dashboard
   - Projeto > Settings > Environment Variables
   - Edite `INSTAGRAM_ACCESS_TOKEN`
   - Cole o novo token
   - Redeploy o projeto

### 12. Teste o Token

Execute no terminal:

```bash
curl "https://graph.instagram.com/me?fields=id,username&access_token=SEU_TOKEN"
```

Deve retornar algo como:
```json
{
  "id": "123456789",
  "username": "bacanabar"
}
```

### 13. IMPORTANTE: Renovação

- Tokens de **60 dias** expiram após 2 meses
- Configure um **lembrete** para renovar antes de expirar
- Ou use **Refresh Tokens** para renovação automática

## Resumo Rápido

1. ✅ Facebook Developers → Seu App
2. ✅ Instagram Basic Display → Set Up
3. ✅ Adicionar Instagram Tester → Aceitar convite no Instagram
4. ✅ User Token Generator → Generate Token
5. ✅ Copiar token completo
6. ✅ Adicionar ao `.env` e Vercel
7. ✅ Redeploy

## Problemas Comuns

### ❌ "The access token could not be decrypted"
- Token incompleto ou copiado errado
- Gere um novo token

### ❌ "(#10) Application does not have permission"
- Token não tem permissão de insights
- Use Meta Business Suite (solução alternativa acima)

### ❌ "Invalid OAuth access token"
- Token expirou (60 dias)
- Gere um novo token

## Precisa de Ajuda?

Documentação oficial:
- Instagram Basic Display: https://developers.facebook.com/docs/instagram-basic-display-api
- Instagram Graph API: https://developers.facebook.com/docs/instagram-api
- Access Tokens: https://developers.facebook.com/docs/facebook-login/guides/access-tokens
