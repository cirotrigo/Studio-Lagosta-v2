# 🌐 Configuração com Cloudflare + Vercel

**Seu domínio já está no Cloudflare? PERFEITO!** Esta é a melhor configuração possível.

---

## 🎯 Por Que Usar Cloudflare?

✅ **CDN global grátis** - Site mais rápido no mundo todo
✅ **Proteção DDoS** - Segurança contra ataques
✅ **SSL/TLS flexível** - Certificado gerenciado automaticamente
✅ **Cache inteligente** - Reduz custos e melhora performance
✅ **Analytics** - Estatísticas detalhadas de tráfego
✅ **Page Rules** - Controle avançado de redirecionamentos

**Não apague o Cloudflare!** Apenas configure corretamente.

---

## 📋 Passo a Passo - Configuração Cloudflare + Vercel

### 1️⃣ Configurar DNS no Cloudflare

#### 1.1 Acessar o Painel

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com)
2. Faça login
3. Selecione o domínio: `lagostacriativa.com.br`
4. Vá em **DNS** (menu lateral esquerdo)

#### 1.2 Configurar Registro WWW

**Opção A: CNAME (Recomendado para Cloudflare)**

Procure se já existe um registro para `www`. Se existir, edite. Se não, crie:

```
Type: CNAME
Name: www
Target: cname.vercel-dns.com
Proxy status: 🟠 DNS only (IMPORTANTE!)
TTL: Auto
```

**⚠️ MUITO IMPORTANTE:** O ícone da nuvem deve estar **CINZA** (DNS only), NÃO laranja!

**Por quê?** Se deixar laranja (Proxied), o Cloudflare vai interceptar o tráfego e o SSL da Vercel não funcionará corretamente. Com DNS only, o Cloudflare apenas roteia o DNS, e a Vercel cuida do resto.

#### 1.3 Configurar Domínio Raiz (Opcional)

Se você quer que `lagostacriativa.com.br` (sem www) também funcione:

**Opção 1: A Record (Simples)**
```
Type: A
Name: @
IPv4 address: 76.76.21.21
Proxy status: 🟠 DNS only
TTL: Auto
```

**Opção 2: Page Rule para Redirect (Melhor para SEO)**
```
URL: lagostacriativa.com.br/*
Forwarding URL: 301 - Permanent Redirect
Destination: https://www.lagostacriativa.com.br/$1
```

#### 1.4 Salvar Configurações

Clique em **Save** em cada registro criado/editado.

---

### 2️⃣ Configurações SSL/TLS no Cloudflare

#### 2.1 Acessar Configurações SSL

1. No painel do Cloudflare, vá em **SSL/TLS**
2. Selecione o modo: **Full (strict)** ou **Full**

**Recomendado:** `Full (strict)` - mais seguro

#### 2.2 Edge Certificates

1. Vá em **SSL/TLS** → **Edge Certificates**
2. Certifique-se que:
   - ✅ **Always Use HTTPS** está ATIVADO
   - ✅ **Automatic HTTPS Rewrites** está ATIVADO
   - ❌ **Universal SSL** deve estar ATIVO (não desative!)

---

### 3️⃣ Adicionar Domínio na Vercel

#### 3.1 Vercel Dashboard

1. Acesse [vercel.com](https://vercel.com)
2. Selecione seu projeto: **Studio-Lagosta-v2**
3. Vá em **Settings** → **Domains**
4. Clique em **Add Domain**

#### 3.2 Adicionar Domínios

**Adicione o domínio www:**
```
www.lagostacriativa.com.br
```

**A Vercel vai mostrar:**
```
✓ Valid Configuration
  CNAME: www.lagostacriativa.com.br → cname.vercel-dns.com
```

**Adicione o domínio raiz (opcional):**
```
lagostacriativa.com.br
```

A Vercel pode sugerir configurar um redirect automático de `lagostacriativa.com.br` → `www.lagostacriativa.com.br`. Aceite!

---

### 4️⃣ Verificar Propagação DNS

#### 4.1 Usar DNSChecker

1. Acesse [dnschecker.org](https://dnschecker.org)
2. Digite: `www.lagostacriativa.com.br`
3. Selecione tipo: **CNAME**
4. Clique em **Search**

**Resultado esperado:**
```
www.lagostacriativa.com.br → cname.vercel-dns.com
```

#### 4.2 Tempo de Propagação

- **Com Cloudflare:** 2-10 minutos (super rápido!)
- **Sem Cloudflare:** 5 minutos a 48 horas

---

### 5️⃣ Configurar Variáveis de Ambiente

No Vercel Dashboard → **Settings** → **Environment Variables**:

```bash
NEXT_PUBLIC_APP_URL=https://www.lagostacriativa.com.br
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
```

**Marque:** Production, Preview, Development

---

### 6️⃣ Configurar Clerk

No [Clerk Dashboard](https://dashboard.clerk.com):

#### 6.1 Adicionar Domínio

1. Vá em **Domains**
2. Clique em **Add domain**
3. Digite: `www.lagostacriativa.com.br`
4. Selecione: **Production**
5. Salve

#### 6.2 Atualizar URLs

1. Vá em **Paths**
2. Configure:

```
Sign-in URL: https://www.lagostacriativa.com.br/sign-in
Sign-up URL: https://www.lagostacriativa.com.br/sign-up
Home URL: https://www.lagostacriativa.com.br
After sign-in URL: https://www.lagostacriativa.com.br/dashboard
After sign-up URL: https://www.lagostacriativa.com.br/dashboard
```

---

### 7️⃣ Fazer Redeploy na Vercel

1. Vercel Dashboard → **Deployments**
2. Clique nos 3 pontinhos do último deploy
3. Clique em **Redeploy**
4. Aguarde completar
5. Status deve ficar: **Ready** ✅

---

## ✅ Verificar se Funcionou

### Teste 1: DNS
```bash
# No terminal (Mac/Linux)
dig www.lagostacriativa.com.br CNAME

# Resultado esperado:
www.lagostacriativa.com.br. 300 IN CNAME cname.vercel-dns.com.
```

### Teste 2: SSL
1. Acesse: `https://www.lagostacriativa.com.br`
2. Clique no cadeado verde
3. Verifique: Certificado válido

### Teste 3: Landing Page
1. Acesse: `https://www.lagostacriativa.com.br`
2. Verificar: Landing page carrega
3. Verificar: Header mostra botões corretos

### Teste 4: Autenticação
1. Fazer login
2. Ir para: `/dashboard`
3. Verificar: App funciona normalmente

### Teste 5: Header Inteligente
1. Estando logado, voltar para: `https://www.lagostacriativa.com.br`
2. Verificar: Header mostra "Ir para o Studio"

---

## 🎨 Configurações Opcionais do Cloudflare

### Performance

1. **Speed** → **Optimization**
   - ✅ Auto Minify: HTML, CSS, JS
   - ✅ Brotli (compressão melhor que gzip)
   - ✅ Early Hints

2. **Caching** → **Configuration**
   - Browser Cache TTL: **4 hours** (recomendado)
   - Crawler Hints: **Enabled**

### Segurança

1. **Security** → **Settings**
   - Security Level: **Medium** (ou High se tiver muito bot)
   - ✅ Bot Fight Mode (grátis)
   - ✅ Email Address Obfuscation

2. **SSL/TLS** → **Edge Certificates**
   - ✅ Always Use HTTPS
   - ✅ Automatic HTTPS Rewrites
   - Minimum TLS Version: **TLS 1.2**

### Page Rules (Opcional - Melhorar Performance)

Criar regras para otimizar cache:

**Rule 1: Cache Static Assets**
```
URL: *lagostacriativa.com.br/*.{jpg,jpeg,png,gif,ico,svg,webp,woff,woff2,ttf,css,js}
Settings:
- Browser Cache TTL: 1 month
- Cache Level: Standard
```

**Rule 2: Redirect Root to WWW (se configurou)**
```
URL: lagostacriativa.com.br/*
Forwarding URL: 301 - Permanent Redirect
Destination: https://www.lagostacriativa.com.br/$1
```

---

## 🐛 Troubleshooting Cloudflare

### Erro: "Too Many Redirects" (ERR_TOO_MANY_REDIRECTS)

**Causa:** Cloudflare com Proxy (nuvem laranja) + SSL mode errado

**Solução:**
1. Cloudflare → DNS
2. Clique na **nuvem laranja** do registro `www`
3. Mude para: **🟠 DNS only** (nuvem cinza)
4. Aguarde 2-3 minutos
5. Limpe cache do navegador
6. Teste novamente

**OU:**

1. Cloudflare → SSL/TLS
2. Mude para: **Full** ou **Full (strict)**
3. Aguarde 2-3 minutos
4. Teste novamente

### Erro: SSL Certificate Invalid

**Causa:** Cloudflare tentando usar próprio SSL enquanto Vercel também usa

**Solução:**
1. Mantenha DNS only (nuvem cinza)
2. Vercel cuidará do SSL automaticamente
3. Aguarde a Vercel provisionar certificado (5-10 min)

### Domínio não resolve / Não encontrado

**Causa:** DNS ainda não propagou

**Solução:**
1. Verifique em [dnschecker.org](https://dnschecker.org)
2. Aguarde mais alguns minutos
3. Limpe cache DNS local:
   ```bash
   # Mac
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

   # Windows
   ipconfig /flushdns
   ```

### Site lento / Não cacheia

**Causa:** Configurações de cache não otimizadas

**Solução:**
1. Cloudflare → Caching → Configuration
2. Caching Level: **Standard**
3. Browser Cache TTL: **4 hours**
4. Crie Page Rules para assets estáticos

---

## 🆚 Cloudflare vs DNS Direto

| Feature | Cloudflare | DNS Registro.br |
|---------|------------|-----------------|
| Velocidade DNS | ⚡ 2-10 min | 🐌 5min - 48h |
| CDN Global | ✅ Grátis | ❌ Não tem |
| Proteção DDoS | ✅ Automática | ❌ Não tem |
| Analytics | ✅ Detalhado | ❌ Básico |
| SSL Flexível | ✅ Várias opções | ❌ Limitado |
| Cache | ✅ Inteligente | ❌ Não tem |
| Page Rules | ✅ Sim | ❌ Não tem |

**Veredicto:** 🏆 Cloudflare é MUITO melhor! Mantenha!

---

## 📊 Monitoramento

### Analytics no Cloudflare

1. Acesse: Cloudflare → Analytics
2. Veja:
   - Requests totais
   - Bandwidth usado
   - Cache hit rate
   - Ameaças bloqueadas
   - Performance por país

### Web Analytics (Grátis e Sem Cookie!)

1. Cloudflare → Web Analytics
2. Adicione o site
3. Copie o snippet
4. Cole no `src/app/layout.tsx`:

```tsx
<Script
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "SEU_TOKEN_AQUI"}'
  strategy="afterInteractive"
/>
```

**Vantagem:** Analytics sem cookies = não precisa de aviso LGPD!

---

## 🎉 Pronto!

Agora você tem o melhor dos dois mundos:

✅ **Cloudflare:** CDN, cache, segurança, analytics
✅ **Vercel:** Hospedagem, deploy automático, edge functions
✅ **Domínio customizado:** www.lagostacriativa.com.br
✅ **SSL:** Certificado válido e automático
✅ **Performance:** Site rápido no mundo todo
✅ **Segurança:** Proteção contra ataques

---

## 📚 Resumo das Configurações

### No Cloudflare:
```
DNS:
- Type: CNAME
- Name: www
- Target: cname.vercel-dns.com
- Proxy: 🟠 DNS only (nuvem cinza)

SSL/TLS:
- Mode: Full (strict)
- Always Use HTTPS: ON
```

### Na Vercel:
```
Domains:
- www.lagostacriativa.com.br ✓

Environment Variables:
- NEXT_PUBLIC_APP_URL=https://www.lagostacriativa.com.br
- (outras variáveis...)
```

### No Clerk:
```
Domains:
- www.lagostacriativa.com.br (Production)

Paths:
- Sign-in: /sign-in
- After sign-in: /dashboard
```

---

## 🆘 Precisa de Ajuda?

**Documentação:**
- [Cloudflare DNS](https://developers.cloudflare.com/dns/)
- [Vercel Custom Domains](https://vercel.com/docs/concepts/projects/custom-domains)
- [Cloudflare + Vercel Guide](https://vercel.com/guides/using-cloudflare-with-vercel)

**Suporte:**
- Cloudflare Community: [community.cloudflare.com](https://community.cloudflare.com)
- Vercel Discord: [vercel.com/discord](https://vercel.com/discord)

---

**Data de criação:** 2025-01-06
**Última atualização:** 2025-01-06
