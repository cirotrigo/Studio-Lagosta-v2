# Guia de Configuração de Domínio Customizado

Este guia mostra como configurar o domínio **www.lagostacriativa.com.br** para funcionar com seu projeto Studio Lagosta na Vercel.

## 🎯 Arquitetura Final

Depois da configuração:

- **www.lagostacriativa.com.br** → Landing page de marketing (acessível por todos)
- **www.lagostacriativa.com.br/dashboard** → Aplicação Studio (requer autenticação)
- Header inteligente: mostra "Ir para o Studio" quando usuário está logado

---

## 📋 Pré-requisitos

- Acesso ao painel de controle do seu domínio (Registro.br, GoDaddy, Cloudflare, etc.)
- Acesso ao seu projeto na Vercel
- Variáveis de ambiente configuradas (veja `ENV_VARIABLES.md`)

---

## 🚀 Passo 1: Adicionar Domínio na Vercel

### 1.1 No Dashboard da Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Selecione seu projeto **Studio-Lagosta-v2**
3. Vá em **Settings** → **Domains**
4. Clique em **Add Domain**

### 1.2 Adicionar Domínio Principal

Digite: `www.lagostacriativa.com.br`

A Vercel irá mostrar as configurações de DNS necessárias.

### 1.3 (Opcional) Adicionar Domínio Raiz

Se você também quiser que `lagostacriativa.com.br` (sem www) funcione:

1. Clique em **Add Domain** novamente
2. Digite: `lagostacriativa.com.br`
3. A Vercel irá configurar um redirect automático de `lagostacriativa.com.br` → `www.lagostacriativa.com.br`

---

## 🌐 Passo 2: Configurar DNS no Registro.br

### 2.1 Acessar Painel de DNS

1. Acesse [registro.br](https://registro.br)
2. Faça login com sua conta
3. Vá em **Meus Domínios**
4. Clique em `lagostacriativa.com.br`
5. Vá em **DNS** → **Gerenciar DNS**

### 2.2 Adicionar Registros DNS

#### Para www.lagostacriativa.com.br:

**Opção A - CNAME (Recomendado):**
```
Tipo: CNAME
Nome: www
Valor: cname.vercel-dns.com.
TTL: 3600
```

**Opção B - A Record:**
```
Tipo: A
Nome: www
Valor: 76.76.21.21
TTL: 3600
```

#### Para lagostacriativa.com.br (raiz - opcional):

```
Tipo: A
Nome: @
Valor: 76.76.21.21
TTL: 3600
```

### 2.3 Salvar Configurações

Clique em **Salvar** e aguarde a propagação DNS (pode levar de 5 minutos a 48 horas).

---

## 🔒 Passo 3: Configurar HTTPS/SSL

A Vercel configura SSL automaticamente. Após adicionar o domínio:

1. Aguarde alguns minutos
2. A Vercel irá provisionar o certificado SSL automaticamente
3. Status mudará de "Pending" para "Valid"

Se houver problemas:
- Verifique se os registros DNS estão corretos
- Aguarde mais tempo para propagação
- Em caso de erro, remova e adicione o domínio novamente

---

## ⚙️ Passo 4: Atualizar Variáveis de Ambiente

### 4.1 Na Vercel

1. Vá em **Settings** → **Environment Variables**
2. Atualize a variável `NEXT_PUBLIC_APP_URL`:

```
NEXT_PUBLIC_APP_URL=https://www.lagostacriativa.com.br
```

3. Clique em **Save**

### 4.2 No Clerk (Autenticação)

1. Acesse [clerk.com/dashboard](https://dashboard.clerk.com)
2. Selecione seu projeto
3. Vá em **Domains**
4. Adicione o novo domínio:
   - **Domain**: `www.lagostacriativa.com.br`
   - **Type**: Production
5. Atualize as URLs de redirect:
   - **Sign-in URL**: `https://www.lagostacriativa.com.br/sign-in`
   - **Sign-up URL**: `https://www.lagostacriativa.com.br/sign-up`
   - **After sign-in URL**: `https://www.lagostacriativa.com.br/dashboard`
   - **After sign-up URL**: `https://www.lagostacriativa.com.br/dashboard`

### 4.3 Fazer Redeploy

Depois de atualizar as variáveis:

1. Vá em **Deployments** na Vercel
2. Clique nos 3 pontinhos do último deploy
3. Clique em **Redeploy**
4. Selecione **Use existing Build Cache** (desmarque para deploy completo)

---

## ✅ Passo 5: Verificar Funcionamento

### 5.1 Testar Rotas Públicas

Acesse: `https://www.lagostacriativa.com.br`

Você deve ver:
- ✅ Landing page de marketing
- ✅ Header com botões "Entrar" e "Cadastre-se" (se não estiver logado)
- ✅ Certificado SSL válido (cadeado verde)

### 5.2 Testar Autenticação

1. Clique em "Cadastre-se" ou "Entrar"
2. Faça login com sua conta
3. Deve ser redirecionado para: `https://www.lagostacriativa.com.br/dashboard`

### 5.3 Testar Landing Page Quando Logado

1. Estando logado, acesse: `https://www.lagostacriativa.com.br`
2. A landing page deve carregar normalmente (não redireciona)
3. No header, deve aparecer o botão "Ir para o Studio" ao invés de "Entrar"
4. Clique em "Ir para o Studio" e verifique se vai para `/dashboard`

---

## 🔧 Troubleshooting

### Erro: "Domain not verified"

**Solução:**
1. Verifique se os registros DNS estão corretos
2. Use uma ferramenta de DNS lookup: [dnschecker.org](https://dnschecker.org)
3. Aguarde mais tempo para propagação (até 48h)
4. Tente remover e adicionar o domínio novamente

### Erro: "Too many redirects"

**Solução:**
1. Verifique se não há regras de redirect conflitantes no seu provedor DNS
2. Se usar Cloudflare, desative o proxy (clique na nuvem laranja)
3. Limpe cache do navegador e cookies

### Erro: "Application error" após o deploy

**Solução:**
1. Verifique se todas as variáveis de ambiente estão configuradas
2. Veja os logs em **Deployments** → **Functions**
3. Confirme que `DATABASE_URL` está configurada
4. Confirme que as variáveis do Clerk estão corretas

### Header mostra "Entrar" mesmo logado

**Solução:**
1. Limpe cache e cookies do navegador
2. Verifique se o domínio está configurado no Clerk
3. Faça logout e login novamente
4. Verifique os cookies no DevTools (F12)

### Páginas protegidas não redirecionam para login

**Solução:**
1. Verifique se o arquivo `middleware.ts` foi commitado
2. Faça um novo deploy completo (sem cache)
3. Verifique se as chaves do Clerk estão corretas nas variáveis de ambiente

---

## 📱 Configurações Adicionais (Opcional)

### Configurar Subdomínio App (app.lagostacriativa.com.br)

Se você quiser usar um subdomínio separado para a aplicação:

1. Na Vercel, adicione o domínio: `app.lagostacriativa.com.br`
2. No DNS, adicione:
   ```
   Tipo: CNAME
   Nome: app
   Valor: cname.vercel-dns.com.
   ```
3. Configure o middleware para redirecionar usuários logados para `app.lagostacriativa.com.br`

**Nota:** Você precisará ajustar também as configurações do Clerk para aceitar múltiplos domínios.

---

## 📊 Monitoramento

### Analytics

Se você configurou Google Analytics ou Meta Pixel:
1. Atualize as propriedades no GA/Meta para incluir o novo domínio
2. Verifique se os eventos estão sendo enviados corretamente
3. Configure filtros para excluir traffic de teste

### Logs da Vercel

Para monitorar erros em produção:
1. Vá em **Deployments** → selecione o deploy ativo
2. Clique em **Functions**
3. Veja os logs em tempo real
4. Configure alertas em **Settings** → **Notifications**

---

## 🎉 Pronto!

Seu domínio customizado está configurado! Agora você tem:

✅ Landing page profissional em www.lagostacriativa.com.br (acessível por todos)
✅ Aplicação Studio protegida por autenticação em /dashboard
✅ HTTPS/SSL configurado automaticamente
✅ Header dinâmico que mostra "Ir para o Studio" quando logado

---

## 📚 Próximos Passos

1. Configure SEO e meta tags para marketing
2. Crie páginas de marketing adicionais (sobre, pricing, contato)
3. Configure Google Search Console com o novo domínio
4. Adicione sitemap.xml para SEO
5. Configure redirects de URLs antigas (se houver)

---

## 🆘 Suporte

Se encontrar problemas:

1. Veja logs detalhados na Vercel
2. Verifique variáveis de ambiente
3. Consulte a documentação:
   - [Vercel Domains](https://vercel.com/docs/concepts/projects/custom-domains)
   - [Clerk Production Setup](https://clerk.com/docs/deployments/overview)
4. Contate o suporte da Vercel ou Clerk se necessário

**Data de criação:** 2025-01-06
**Última atualização:** 2025-01-06
