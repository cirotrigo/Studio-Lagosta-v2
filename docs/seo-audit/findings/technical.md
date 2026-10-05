# SEO técnico — lagostacriativa.com.br (05/10/2026)

Nota da categoria: **58/100**

## Critical

### C1. robots.txt e sitemap.xml não existem e redirecionam para o login
- Evidência: `curl -I /robots.txt` e `/sitemap.xml` → `307 /sign-in?redirect_url=...`. Não há `src/app/robots.ts` nem `sitemap.ts`, e `/robots.txt`, `/sitemap.xml`, `/llms.txt` não estão na lista pública do `src/middleware.ts` (linhas 5-37), então o Clerk os protege.
- Impacto: crawlers recebem HTML de login em vez de robots (Google trata como "sem robots", ok, mas Bing e rastreadores de IA ficam sem diretrizes), nenhum sitemap, e nada impede o rastreio das áreas do app.
- Correção: criar `src/app/robots.ts` (allow `/`, `/privacy-policy`, `/terms-of-service`; disallow `/projects`, `/dashboard`, `/admin`, `/api`, `/oauth`, `/envio`, `/subscribe`, `/templates`, `/sign-in`, `/sign-up`; `sitemap: https://lagostacriativa.com.br/sitemap.xml`) e `src/app/sitemap.ts` (home + privacy + terms + páginas CMS publicadas). Adicionar `'/robots.txt'`, `'/sitemap.xml'`, `'/llms.txt'` ao `createRouteMatcher` em `src/middleware.ts` (após a linha 19, junto de `/.well-known`).

### C2. Rotas inexistentes nunca dão 404: todo caminho vira 307 para /sign-in
- Evidência: `/xyz-404` → `307 /sign-in?redirect_url=%2Fxyz-404`. O middleware (linhas 67-72) redireciona qualquer rota não pública antes de o Next decidir se ela existe. Soft-404/redirect em massa, e URLs de lixo que alguém linke viram "páginas de login" indexáveis.
- Correção: manter o redirect só para prefixos reais do app (lista explícita em `isProtectedRoute`: `/projects`, `/dashboard`, `/admin`, `/templates`, `/billing`, ...) e deixar o resto cair no 404 do Next. Alternativa mínima: `X-Robots-Tag: noindex` (ver H2).

## High

### H1. Instância de DESENVOLVIMENTO do Clerk em produção
- Evidência (CONTEXTO): handshake 307 via `advanced-caribou-4.clerk.accounts.dev`; resposta traz `x-clerk-auth-reason: dev-browser-missing`. O primeiro acesso de um visitante sem cookie sofre um redirect extra (latência/LCP e risco de o crawler que não segue cookies ver 307). Googlebot recebeu 200 no meu teste, mas com `x-clerk-auth-status: signed-out` e a dependência do handshake permanece para usuários reais.
- Correção: trocar para instância Production do Clerk (chaves `pk_live_`/`sk_live_` na Vercel, domínio `clerk.lagostacriativa.com.br`). Além disso, tornar a home independente do Clerk: `clerkMiddleware` só deveria rodar nas rotas do app (ajustar `config.matcher` em `src/middleware.ts` linha 77-83 para excluir `/`, `/privacy-policy`, `/terms-of-service`).

### H2. Nenhuma proteção noindex para as rotas do app / login
- Evidência: `/sign-in` e `/sign-up` respondem 200 sem `robots` meta nem `X-Robots-Tag`; não há robots.txt (C1). Páginas do app redirecionadas por 307 não indexam, mas sign-in/sign-up sim.
- Correção: `export const metadata = { robots: { index: false, follow: false } }` em `src/app/(public)/sign-in/**/page.tsx` e `sign-up`, `src/app/envio`, `src/app/oauth`, `src/app/subscribe`; ou header `X-Robots-Tag: noindex` via `headers()` em `next.config.ts` (bloco que começa na linha ~30 do array de headers).

### H3. www e apex servem 200 duplicado, sem redirect
- Evidência: `https://www.lagostacriativa.com.br/` → 200 (não 301 para o apex). Só o canonical mitiga.
- Correção: na Vercel (Domains) configurar `www` com redirect 308 para `lagostacriativa.com.br`; ou `redirects()` em `next.config.ts` com `has: [{type:'host', value:'www.lagostacriativa.com.br'}]` → `https://lagostacriativa.com.br/:path*` permanent.

### H4. Home sem cache e sem estática (TTFB e LCP)
- Evidência: `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` na home; `src/app/layout.tsx` linhas 23-24 `dynamic = 'force-dynamic'`/`revalidate = 0` (herdado de metadata via banco), e `src/app/page.tsx` `revalidate = 0`. Cada visita renderiza no servidor e consulta SiteSettings; sem CDN cache. Também há meta `Cache-Control/Pragma/Expires` no `<head>` (layout.tsx linhas 61-65 e 105-109), que não têm efeito em HTTP e só poluem o HTML.
- Correção: remover `force-dynamic` e `other: {Cache-Control...}` do layout; `revalidate = 3600` na home (com `revalidateTag` ao salvar SiteSettings). Home deve ser servida estática pela CDN.

## Medium

### M1. Sem dados estruturados em produção
- Evidência: nenhum JSON-LD no HTML. O PR #198 (ainda não mergeado) adiciona `ProfessionalService`. Correção: mergear o #198; incluir `address`/`areaServed` (Vitória–ES), `telephone`, `sameAs` (Instagram) e `logo`, no `src/app/page.tsx`.

### M2. Páginas legais com title "Studio Lagosta"; layout raiz herda metadata do SiteSettings do app
- Evidência: `/privacy-policy` → `<title>Política de Privacidade | Studio Lagosta`. O layout raiz (linhas 30-112) usa `settings.siteName` do admin e, na falha do banco, cai em "Studio Lagosta" com `og-image.png` (placeholder). Páginas sem metadata própria herdam OG/canonical errados.
- Correção: definir metadata específica por página pública; no fallback de `layout.tsx` (linha ~85) trocar `/og-image.png` por `/og-lagosta.png`.

### M3. Canonical sem barra e `metadataBase` dependente de env
- Evidência: `<link rel="canonical" href="https://lagostacriativa.com.br"/>`; `layout.tsx` usa `NEXT_PUBLIC_APP_URL || 'http://localhost:3000'` (linhas 42, 83): se a env faltar em um preview/deploy, canonicals e OG saem para localhost. Correção: fallback fixo para `https://lagostacriativa.com.br` em produção.

### M4. /about, /pricing, /contact, /blog marcadas como públicas, mas respondem 404
- Evidência: `/about` → 404; middleware (linhas 30-33) as libera. Sem páginas = links mortos potenciais e crawl budget perdido. Correção: remover do matcher o que não existe ou criar as páginas (ver "conteúdo" abaixo).

### M5. Conteúdo de página única
- Evidência: apenas a home; 1 `<h1>`, vários `<h2>` (hierarquia correta). Para ranquear "marketing para restaurantes Vitória ES" faltam páginas de serviço/cidade/casos. (Pertence também à auditoria de conteúdo.)

## Low

### L1. Headers de segurança incompletos
- Evidência: presentes `strict-transport-security: max-age=63072000` (sem `includeSubDomains`/`preload`), COOP/COEP/CORP. Ausentes: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors`. Correção: acrescentar ao bloco `source: '/:path*'` em `next.config.ts` (~linha 33). Atenção: `COEP: credentialless` global pode quebrar embeds/pixels de terceiros (`AnalyticsPixels`).

### L2. Favicon
- `/favicon.ico` 404; ícone vem do Blob com `?v=timestamp` (muda a cada deploy do metadata → cache bust constante). Correção: colocar `src/app/favicon.ico`/`icon.png` estático.

### L3. Imagens
- 1 `<img alt="">` na home e alt genérico "Cliente Lagosta Criativa" (client-2…). Preloads de 10 logos de clientes (`link` header) competem com a LCP; manter preload só da logo/hero e `loading="lazy"` nas demais. Preferir `next/image`.

## O que está OK
- Viewport correto e zoom permitido (maximum-scale=5); `lang="pt-br"` (padrão é `pt-BR`, trivial); título/descrição únicos, OG/Twitter completos (`og-lagosta.png` 200); canonical da home aponta para o apex; HTTPS/HSTS; HTML renderizado no servidor (SSR, conteúdo visível sem JS); manifest 200; `/projects` redireciona para o login (comportamento esperado do app).
- Não verificado: Core Web Vitals reais (sem CrUX/PSI), hreflang (site só em pt-BR, não necessário), IndexNow (não há chave publicada; baixa prioridade).

## Prioridade sugerida
1. C1 + C2 (middleware + robots/sitemap) — um PR pequeno em `src/middleware.ts` e dois arquivos novos.
2. H1 (Clerk produção) e H3 (redirect www).
3. H4 (cache da home), H2 (noindex), depois M/L.
