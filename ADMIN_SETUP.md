# 🔐 Configuração de Acesso Admin

Guia para configurar quem pode acessar o painel `/admin`.

---

## 🎯 Como Funciona

O acesso admin é controlado por **variáveis de ambiente**:

- `ADMIN_EMAILS` - Lista de emails com acesso admin
- `ADMIN_USER_IDS` - Lista de IDs do Clerk com acesso admin

**Você precisa configurar pelo menos UM dos dois!**

---

## ⚡ Configuração Rápida (2 minutos)

### Método 1: Por Email (Recomendado)

#### 1. Adicionar no `.env.local`

```bash
# .env.local (desenvolvimento)

ADMIN_EMAILS="seu@email.com,outro@email.com"
```

**Formato:**
- Emails separados por vírgula
- Sem espaços
- Case-sensitive (precisa ser exatamente igual ao email no Clerk)

#### 2. Reiniciar servidor

```bash
# Parar (Ctrl+C)
npm run dev
```

#### 3. Testar

Acesse: `http://localhost:3000/admin`

---

### Método 2: Por User ID

Se preferir usar IDs ao invés de emails:

#### 1. Pegar seu User ID do Clerk

**Opção A: No código**
```typescript
// Adicione temporariamente em qualquer página logada
const { userId } = useAuth()
console.log('My User ID:', userId)
```

**Opção B: Clerk Dashboard**
1. [clerk.com/dashboard](https://dashboard.clerk.com)
2. Selecione seu projeto
3. Vá em **Users**
4. Clique no seu usuário
5. Copie o **User ID** (começa com `user_`)

#### 2. Adicionar no `.env.local`

```bash
ADMIN_USER_IDS="user_2abc123xyz,user_3def456uvw"
```

#### 3. Reiniciar e testar

```bash
npm run dev
```

---

## 🚀 Configuração em Produção (Vercel)

### 1. No Vercel Dashboard

1. Acesse [vercel.com](https://vercel.com)
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**
4. Adicione a variável:

```
Name: ADMIN_EMAILS
Value: seu@email.com,outro@email.com
Environment: Production, Preview, Development
```

### 2. Redeploy

1. Vá em **Deployments**
2. Clique nos 3 pontinhos
3. **Redeploy**

---

## 🔍 Como Verificar se Funcionou

### Teste 1: Acesso Negado
1. Faça login com um usuário **que não está na lista**
2. Acesse: `/admin`
3. **Esperado:** Redireciona para `/dashboard`

### Teste 2: Acesso Permitido
1. Faça login com um usuário **que está na lista**
2. Acesse: `/admin`
3. **Esperado:** Mostra o painel admin ✅

---

## 🛠️ Troubleshooting

### "Ainda não consigo acessar"

**Checklist:**
- [ ] Email no `.env.local` está **exatamente igual** ao do Clerk?
- [ ] Servidor foi **reiniciado** após adicionar a variável?
- [ ] Fez **hard refresh** no navegador (`Cmd+Shift+R`)?
- [ ] Está logado com o usuário correto?

**Verificar variável está carregando:**
```typescript
// Adicione temporariamente em src/lib/admin-utils.ts
console.log('ADMIN_EMAILS:', process.env.ADMIN_EMAILS)
console.log('ADMIN_USER_IDS:', process.env.ADMIN_USER_IDS)
```

### "Redireciona para /dashboard"

**Causa:** Email/UserID não está na lista de admins.

**Solução:**
1. Verifique o email exato no Clerk Dashboard
2. Copie e cole no `.env.local` (não digite manualmente)
3. Certifique-se que não há espaços extras

### "Variável não carrega em produção"

**Causa:** Variável não foi adicionada no Vercel ou não fez redeploy.

**Solução:**
1. Vercel → Settings → Environment Variables
2. Adicione `ADMIN_EMAILS` marcando **Production**
3. Faça redeploy completo (sem cache)

---

## 🔒 Segurança

### Boas Práticas

✅ **FAZER:**
- Usar emails corporativos verificados
- Limitar a poucos usuários admin
- Revisar lista periodicamente
- Usar IDs quando possível (mais seguro que emails)

❌ **NÃO FAZER:**
- Adicionar muitos admins desnecessariamente
- Compartilhar credenciais de admin
- Commitar `.env.local` no Git (já está no .gitignore)
- Usar emails pessoais não verificados

### Remover Acesso Admin

Para remover acesso de alguém:

1. Edite `.env.local` / Vercel env vars
2. Remova o email/ID da lista
3. Reinicie servidor / Redeploy
4. Usuário será redirecionado para `/dashboard` ao tentar acessar `/admin`

---

## 📊 Múltiplos Admins

Você pode ter vários admins usando ambos os métodos:

```bash
# .env.local

# Por email
ADMIN_EMAILS="admin1@empresa.com,admin2@empresa.com,admin3@empresa.com"

# E/OU por User ID
ADMIN_USER_IDS="user_2abc123xyz,user_3def456uvw,user_4ghi789rst"
```

**Como funciona:**
- Se o usuário estiver em **qualquer uma das duas listas**, tem acesso
- As listas são combinadas (OR lógico)

---

## 🎓 Exemplo Completo

### Desenvolvimento (.env.local)

```bash
# Admins locais para desenvolvimento
ADMIN_EMAILS="voce@email.com"

# Outras variáveis necessárias
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Produção (Vercel)

```bash
# Admins de produção
ADMIN_EMAILS="admin@empresa.com,ti@empresa.com"

# OU usando IDs
ADMIN_USER_IDS="user_2prodABC123,user_2prodXYZ789"

# Outras variáveis
DATABASE_URL="postgresql://production..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_APP_URL="https://www.lagostacriativa.com.br"
```

---

## 🔗 Arquivos Relacionados

- `src/lib/admin-utils.ts` - Lógica de verificação de admin
- `src/app/admin/layout.tsx` - Layout que verifica permissão
- `src/middleware.ts` - Requer autenticação (não verifica admin)

---

## 📚 Próximos Passos

Depois de configurar acesso admin:

1. ✅ Acesse `/admin/settings` para configurar feature costs
2. ✅ Configure billing plans em `/admin/settings/plans`
3. ✅ Gerencie usuários em `/admin/users`
4. ✅ Veja analytics em `/admin/usage`

---

**Data de criação:** 2025-01-06
**Última atualização:** 2025-01-06
