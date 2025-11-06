# 🔧 Troubleshooting - Studio Lagosta

Soluções para problemas comuns durante desenvolvimento e produção.

---

## 🔄 "Ainda redireciona para /dashboard quando logado"

### Problema
Você está logado, acessa `http://localhost:3000` ou `www.lagostacriativa.com.br`, mas é redirecionado automaticamente para `/dashboard`.

### Causa
O servidor dev ainda está rodando o código antigo em cache.

### Solução Completa

#### 1️⃣ Parar o Servidor

No terminal onde está rodando `npm run dev`, pressione:
```
Ctrl + C
```

Aguarde o servidor parar completamente.

#### 2️⃣ Limpar Cache do Next.js

```bash
# Deletar pasta .next
rm -rf .next

# Deletar node_modules/.cache (se existir)
rm -rf node_modules/.cache
```

**Windows (PowerShell):**
```powershell
Remove-Item -Recurse -Force .next
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
```

#### 3️⃣ Fazer Git Pull (se necessário)

Se você está testando mudanças que eu fiz:
```bash
git pull origin main
```

#### 4️⃣ Reinstalar Dependências (se atualizou packages)

Apenas se você atualizou algum package:
```bash
npm install
```

#### 5️⃣ Reiniciar o Servidor

```bash
npm run dev
```

Aguarde a mensagem:
```
✓ Ready in X.Xs
```

#### 6️⃣ Limpar Cache do Navegador

**Opção A: Hard Refresh**
- **Chrome/Edge:** `Ctrl + Shift + R` (Windows/Linux) ou `Cmd + Shift + R` (Mac)
- **Firefox:** `Ctrl + F5` (Windows/Linux) ou `Cmd + Shift + R` (Mac)
- **Safari:** `Cmd + Option + R`

**Opção B: DevTools**
1. Abra DevTools (F12)
2. Clique com botão direito no ícone de reload
3. Selecione: **"Empty Cache and Hard Reload"**

**Opção C: Modo Anônimo**
1. Abra uma janela anônima/privada
2. Acesse: `http://localhost:3000`
3. Faça login novamente
4. Teste

#### 7️⃣ Testar Novamente

1. Acesse: `http://localhost:3000`
2. Verifique: Landing page deve carregar (sem redirect!)
3. Observe: Header mostra "Ir para o Studio" se estiver logado

---

## 🔐 "Clerk: Invalid publishable key"

### Problema
```
Error: Invalid publishable key
```

### Causa
Variáveis de ambiente do Clerk não configuradas.

### Solução

#### 1. Criar arquivo `.env.local`

Na raiz do projeto:
```bash
# .env.local

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

#### 2. Pegar chaves do Clerk

1. Acesse: [clerk.com/dashboard](https://dashboard.clerk.com)
2. Selecione seu projeto
3. Vá em: **API Keys**
4. Copie as chaves de **Development**

#### 3. Reiniciar servidor

```bash
# Parar (Ctrl+C)
# Reiniciar
npm run dev
```

---

## 💾 "DATABASE_URL is not defined"

### Problema
```
Error: DATABASE_URL is not defined
```

### Causa
Banco de dados não configurado.

### Solução

#### 1. Criar banco PostgreSQL

**Opções:**
- [Neon](https://neon.tech) - Recomendado, grátis, rápido
- [Supabase](https://supabase.com) - Grátis, inclui outras features
- [Railway](https://railway.app) - Grátis com limites
- Postgres local

#### 2. Pegar connection string

Exemplo Neon:
```
postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

#### 3. Adicionar no `.env.local`

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
```

#### 4. Rodar migrations

```bash
npm run db:push
```

---

## 🌐 "ERR_TOO_MANY_REDIRECTS" (Loop infinito)

### Problema
Site em loop de redirecionamento.

### Causa Comum
Cloudflare com Proxy (nuvem laranja) + SSL mode incorreto.

### Solução

#### No Cloudflare:

**Opção A: DNS Only (Recomendado)**
1. Cloudflare → DNS
2. Registro `www`: Clique na **nuvem laranja** 🟠
3. Mude para: **nuvem cinza** ⚫ (DNS only)
4. Salve

**Opção B: Ajustar SSL Mode**
1. Cloudflare → SSL/TLS
2. Mude para: **Full** ou **Full (strict)**
3. Aguarde 2-3 minutos
4. Limpe cache do navegador

---

## 🔒 "SSL Certificate Invalid"

### Problema
Navegador mostra aviso de certificado inválido.

### Causa
SSL ainda está sendo provisionado ou configuração incorreta.

### Solução

#### Produção (Vercel)

1. Vercel → Settings → Domains
2. Verificar status do domínio: deve estar **Valid**
3. Se estiver **Pending**, aguardar 5-10 minutos
4. Se falhar:
   - Remover domínio
   - Aguardar 5 minutos
   - Adicionar novamente

#### Local (Development)

Use HTTP, não HTTPS:
```
http://localhost:3000
```

Não:
```
https://localhost:3000
```

---

## 📦 "Module not found" ou "Cannot find module"

### Problema
```
Error: Cannot find module '@/components/...'
```

### Causa
Dependências não instaladas ou cache corrompido.

### Solução

```bash
# 1. Deletar node_modules
rm -rf node_modules

# 2. Deletar lock files
rm -f package-lock.json
rm -f yarn.lock

# 3. Reinstalar
npm install

# 4. Limpar cache Next.js
rm -rf .next

# 5. Reiniciar
npm run dev
```

---

## ⚡ "Build falha com TypeScript errors"

### Problema
```
Error: Type 'X' is not assignable to type 'Y'
```

### Causa
Erros de tipo no código.

### Solução

#### Verificar erros localmente

```bash
npm run typecheck
```

#### Se build precisa passar urgente

**Temporário (NÃO recomendado):**

`next.config.ts`:
```typescript
typescript: {
  ignoreBuildErrors: true, // Já está assim no projeto
}
```

**Melhor solução:** Corrigir os erros de tipo!

---

## 🎨 "Estilos não aplicam / Tailwind não funciona"

### Problema
Classes Tailwind não funcionam, estilos não aplicam.

### Causa
Cache ou compilação incompleta do Tailwind.

### Solução

```bash
# 1. Parar servidor
Ctrl + C

# 2. Deletar .next
rm -rf .next

# 3. Reiniciar
npm run dev

# 4. Hard refresh no navegador
Ctrl + Shift + R
```

#### Verificar configuração Tailwind

`tailwind.config.ts` deve ter:
```typescript
content: [
  "./src/**/*.{js,ts,jsx,tsx,mdx}",
]
```

---

## 🔄 "Mudanças no código não aparecem"

### Problema
Você editou o código mas nada muda no navegador.

### Causa
Hot reload não está funcionando ou cache.

### Solução

#### 1. Verificar se servidor está rodando

Terminal deve mostrar:
```
○ Compiling /...
✓ Compiled successfully
```

#### 2. Hard refresh

`Ctrl + Shift + R` (ou `Cmd + Shift + R` no Mac)

#### 3. Reiniciar servidor

```bash
# Parar (Ctrl+C)
rm -rf .next
npm run dev
```

#### 4. Se ainda não funciona

Pode ser problema com o arquivo. Verifique:
- Nome do arquivo está correto?
- Arquivo está na pasta correta?
- Import path está correto?

---

## 🐘 "Prisma: Error querying the database"

### Problema
```
Error: Error querying the database
```

### Causa
Schema desatualizado ou banco não sincronizado.

### Solução

```bash
# 1. Gerar Prisma Client
npx prisma generate

# 2. Push schema para o banco
npm run db:push

# 3. (Se necessário) Reset completo
npm run db:reset
```

**⚠️ ATENÇÃO:** `db:reset` apaga TODOS os dados!

---

## 📱 "Site não funciona no mobile"

### Problema
Site funciona no desktop mas não no celular.

### Causa
Firewall, rede, ou URL incorreta.

### Solução

#### 1. Usar IP local

```bash
# Descobrir seu IP
# Mac/Linux:
ifconfig | grep "inet "

# Windows:
ipconfig
```

Procure algo como: `192.168.x.x`

#### 2. Acessar no celular

No celular (mesma rede WiFi):
```
http://192.168.x.x:3000
```

#### 3. Se ainda não funciona

Configurar Next.js para aceitar conexões externas.

`package.json`:
```json
"scripts": {
  "dev": "next dev -H 0.0.0.0"
}
```

Reiniciar:
```bash
npm run dev
```

---

## 🚀 "Deploy na Vercel falha"

### Problema
Build falha na Vercel com erro genérico.

### Causa
Variáveis de ambiente, dependências, ou erros de build.

### Solução

#### 1. Verificar logs

Vercel → Deployments → Selecionar deploy → Ver log completo

#### 2. Problemas comuns

**Missing environment variables:**
- Adicionar no Vercel → Settings → Environment Variables

**Build command fails:**
- Testar local: `npm run build`
- Corrigir erros antes de fazer push

**Out of memory:**
- Otimizar imports
- Reduzir bundle size

#### 3. Fazer clean deploy

1. Vercel → Settings → Git
2. Scroll até "Ignored Build Step"
3. Deixe vazio (para forçar builds)
4. Deployments → Redeploy (sem usar cache)

---

## 🔐 "Unauthorized / 401 error" em API routes

### Problema
```
Error: Unauthorized (401)
```

### Causa
Request sem autenticação válida.

### Solução

#### Verificar se Clerk está configurado

API route deve ter:
```typescript
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // ... resto do código
}
```

#### Verificar cookies

DevTools (F12) → Application → Cookies

Deve ter cookies do Clerk:
- `__client`
- `__session`

Se não tiver, fazer login novamente.

---

## 📊 "Analytics não rastreia eventos"

### Problema
Google Analytics ou Meta Pixel não registram eventos.

### Causa
Pixel não carregou ou AdBlocker ativo.

### Solução

#### 1. Verificar se pixel carregou

DevTools (F12) → Network → Filtrar: `analytics` ou `fbevents`

Deve aparecer requests.

#### 2. Verificar variáveis de ambiente

`.env.local`:
```bash
NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX"
NEXT_PUBLIC_FACEBOOK_PIXEL_ID="123456789012345"
```

**⚠️ IMPORTANTE:** Devem começar com `NEXT_PUBLIC_`!

#### 3. Desativar AdBlocker

AdBlockers bloqueiam pixels. Testar em:
- Modo anônimo
- Outro navegador
- Network mobile (dados móveis)

---

## 🆘 Ainda com Problemas?

### Checklist Final

- [ ] Servidor reiniciado com cache limpo?
- [ ] Navegador com hard refresh / modo anônimo?
- [ ] Variáveis de ambiente configuradas?
- [ ] Git está atualizado (git pull)?
- [ ] Dependências instaladas (npm install)?
- [ ] Logs verificados (terminal e browser console)?

### Onde Buscar Ajuda

1. **Logs:** Sempre o primeiro lugar
   - Terminal: erros do servidor
   - Browser Console (F12): erros client-side
   - Vercel Functions: erros em produção

2. **Documentação:**
   - [Next.js Docs](https://nextjs.org/docs)
   - [Clerk Docs](https://clerk.com/docs)
   - [Vercel Docs](https://vercel.com/docs)
   - [Prisma Docs](https://prisma.io/docs)

3. **Comunidades:**
   - [Next.js Discord](https://nextjs.org/discord)
   - [Vercel Discord](https://vercel.com/discord)
   - [Clerk Discord](https://clerk.com/discord)

---

**Data de criação:** 2025-01-06
**Última atualização:** 2025-01-06
