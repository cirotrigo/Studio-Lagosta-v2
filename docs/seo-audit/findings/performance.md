# Performance e Imagens — lagostacriativa.com.br (05/10/2026)

Dados de lab (Playwright/Chromium, sem CrUX). Desktop 1350x940 sem throttle; mobile 412x823, 4G lento simulado (1,6 Mbps, 150 ms RTT) e CPU 4x. Capturas em `screenshots/` (desktop e mobile, dobra e página inteira). Dados brutos: `m-desktop.json`, `m-mobile.json`. Lighthouse CLI não está instalado; os números abaixo vêm de PerformanceObserver. Código só lido.

## Notas

| Área | Nota | Motivo |
|---|---|---|
| Performance | **58/100** | Desktop bom (LCP 1,4 s, CLS 0,013). Mobile lento: LCP 10,1 s, FCP 5,2 s. O vídeo da prova social está quebrado. |
| Imagens | **45/100** | Logos em PNG sem otimização (1,3 MB). `<img>` cru em todo lugar. Alt vazio ou genérico em parte. Sem cache. |

## Métricas

| | Desktop | Mobile (throttled) |
|---|---|---|
| TTFB (HTML, inclui handshake Clerk) | 766 ms | 731 ms |
| FCP | 1,26 s | 5,20 s |
| LCP | 1,37 s (logo PNG do hero, 207 KB) | 10,09 s (mesmo elemento) |
| CLS | 0,013 (bom) | 0 |
| Long tasks / TBT | 0 / 0 ms | 2 tarefas (122 e 100 ms) / ~72 ms |
| INP (estimado) | Bom: nenhuma long task no desktop, hidratação leve | Provável bom; no máximo ~125 ms de bloqueio no carregamento |
| Requisições / peso transferido | 54 / ~1,65 MB | 54 / ~1,65 MB |
| Imagens | 1,31 MB (79%) | idem |
| Clerk (terceiro) | 306 KB, 10 requisições | idem |
| Elementos no DOM | 810 | 814 |

INP não foi medido com interação real; é estimativa por ausência de tarefas longas. Passa no limite de 200 ms com folga em teoria.

## Crítico

### 1. O vídeo da SocialProofSection não toca para visitantes anônimos
`/videos/depoimento-jefinho-coronel.mp4` responde **307 → /sign-in** (confirmado com curl e no navegador: a resposta é o HTML do login). O matcher do middleware exclui extensões estáticas (html, css, js, imagens, fontes...) mas **não `mp4`**, então o Clerk intercepta e o `<video>` nunca carrega. O visitante vê o botão de play e nada acontece. É o depoimento de um cliente, a principal prova social.
- Correção: `src/middleware.ts`, linha 80 (`config.matcher`): acrescentar `mp4|webm|mov` à lista de extensões ignoradas. Alternativa: pôr `/videos(.*)` em `isPublicRoute` (linha 5).
- Mesmo problema para qualquer `.mp4`/`.pdf`/`.txt`/`.xml` em `public/`.

### 2. O vídeo tem 28 MB (`public/videos/depoimento-jefinho-coronel.mp4`)
Quando o item 1 for corrigido, o `<video preload="metadata">` (render real mostra `preload: metadata`, sem poster) deixa o primeiro frame preto e baixa o arquivo inteiro em stream a partir do play. 28 MB para um vídeo vertical que cabe em 393x700 é excessivo; em 4G lento é minutos de espera.
- Recodificar em H.264 720x1280, ~2 a 3 Mbps (alvo 4 a 8 MB) e, idealmente, também WebM/AV1. Hospedar no Vercel Blob ou em CDN com suporte a Range, não em `public/` (que também consome banda do deploy).
- `src/components/sales/SocialProofSection.tsx`, linhas 24 a 34: adicionar `poster="/videos/depoimento-poster.webp"` (também resolve a tela preta antes do play), `preload="none"`, e `width`/`height` ou `aspect-ratio` no contêiner.

### 3. LCP mobile de 10 s: o logo do hero é um PNG de 207 KB sem prioridade
O elemento LCP em desktop e mobile é `<img src="/lagosta-logo.png">` (1024x419, exibido a 384x144 no máximo). Não usa `next/image`, não tem `fetchpriority`, `width/height` nem formato moderno, e vem com `cache-control: max-age=0, must-revalidate`. No mobile, FCP 5,2 s e LCP 10,1 s: o HTML só chega depois do handshake do Clerk e a imagem de 207 KB disputa banda com 306 KB de JS do Clerk e 10 PNGs do carrossel de clientes.
- `src/components/sales/HeroSection.tsx`, linhas 77 a 82: trocar por `next/image` com `priority`, `width={768} height={314}`, `sizes="(min-width:768px) 384px, 256px"`. O pipeline já está configurado para AVIF/WebP (`next.config.ts`, linha 290). Resultado esperado: ~15 a 25 KB, LCP mobile em torno de 3 s.
- Reexportar `lagosta-logo.png` otimizado também resolve o uso em `SalesFooter.tsx` linha 16.

### 4. Imagens dos clientes: PNGs de até 244 KB exibidas a 48 px de altura
`public/clients/client-*.png` somam ~1,0 MB e são baixadas **inteiras** para aparecer a ≤ 48 px de altura (client-6 tem 1024x714 e 244 KB, mostrada a 69x48; client-2 tem 1024x899 e 191 KB, mostrada a 55x48; client-4 e 5 idem). O carrossel (`HeroSection.tsx`, linhas 176 a 190) duplica a lista (`[0,1].map`), mas o navegador reaproveita a URL do cache, então o custo é uma vez só.
- Converter para WebP/AVIF ou SVG, com no máximo 192 px de largura (2x de 96): cada arquivo cai para 2 a 8 KB, economia estimada de ~950 KB (58% do peso da página).
- Ou usar `next/image` com `width`/`height` e `sizes`, deixando o otimizador do Next entregar AVIF.
- Os 4 logos repetidos em CaseStudiesSection (linhas 14 a 41) e os do hero apontam para os mesmos arquivos, então a correção vale para os dois.

## Alto

### 5. Nenhuma imagem de `public/` tem cache
Todas as imagens (`/clients`, `/sites`, `/lagosta-logo.png`) saem com `cache-control: public, max-age=0, must-revalidate`. Cada visita repetida revalida 14 arquivos. Já os assets `/_next/static` têm `immutable` por um ano.
- `next.config.ts`: adicionar `headers()` com `Cache-Control: public, max-age=31536000, immutable` para `/clients/:path*`, `/sites/:path*` e `/videos/:path*` (renomear com hash ao trocar). Com `next/image` o resultado já fica em cache pelo otimizador.

### 6. Clerk em instância de desenvolvimento (`pk_test_…`, `advanced-caribou-4.clerk.accounts.dev`) carregado na home pública
- Primeira visita sem cookie: **2 redirecionamentos** (`/v1/client/handshake` e `?__clerk_handshake=`) antes do HTML. É a parte principal do TTFB de ~750 ms e do atraso de FCP no mobile.
- A home inteira vira dinâmica: `cache-control: private, no-cache, no-store` e `x-vercel-cache: MISS` (HTML nunca vem de CDN). Causas: `export const dynamic = 'force-dynamic'` + `revalidate = 0` em `src/app/layout.tsx` (linhas ~23 e 24), `generateMetadata` lendo o banco, e `ClerkProvider` envolvendo tudo (layout linha 132).
- clerk-js: 306 KB transferidos (4 chunks) e 10 requisições, em página que só mostra botões "entrar" e CTAs. Aparece como tarefa longa de ~120 ms no mobile.
- Correções, por impacto:
  1. Trocar a chave para a instância de **produção** do Clerk (`pk_live_`). Instância de dev tem rate limit e o handshake é mais lento; também não deve ficar em produção por segurança.
  2. Mover `ClerkProvider` para um layout do grupo `(protected)`/`/sign-in` e deixar a home pública estática (`export const revalidate = 3600`), mantendo só um `getSiteSettings` com `unstable_cache` e tag. Isso tira o handshake e o Clerk da home e permite cache de CDN.
  3. Se for preciso manter o provider global, ao menos remover `force-dynamic` do layout e cachear `getSiteSettings`.

### 7. Fontes: 8 pesos de Montserrat (100 a 900) configurados, 5 usados e baixados
`src/app/layout.tsx`, linhas 14 a 21: `weight: ["100",…,"900"]` gera 8 `@font-face`. Foram baixados 35,5 KB de woff2 variável por peso carregado (em runtime: 300, 400, 500, 600, 700 e 900 com status `loaded`; 100, 800 não). `display: swap` e `preload` estão corretos e o `Montserrat Fallback` com ajuste de métrica existe, então o CLS de fonte é mínimo (0,003 no H1). Melhor ainda: omitir `weight` e usar a fonte variável (`Montserrat({ subsets:['latin'], variable })`), que serve um único arquivo para todos os pesos, e `preload` só dos usados. Ganho pequeno, risco baixo.

## Médio

### 8. `<img>` cru em vez de `next/image` (todas as seções de vendas)
Nenhuma imagem passa pelo otimizador. Pontos: `HeroSection.tsx` linhas 77 a 82 e 176 a 190; `CaseStudiesSection.tsx` (logos); `SalesFooter.tsx` linha 16; `SitesShowcaseSection.tsx` (os 3 prints `.webp` de 1100x688, 10 a 52 KB, já em WebP e com `loading="lazy"`: **bem**, mas sem `width`/`height` e sem `sizes`; renderizam a 387x242, então 1100 px é 2,8x demais para mobile). `next.config.ts` já tem `formats: ['image/avif','image/webp']`, só falta usar o componente.

### 9. Alt text
- 10 logos do hero (carrossel visível): 4 com alt genérico "Cliente Lagosta Criativa" (client-2, 3, 4, 5). `client-3` aparece com alt "Cliente Lagosta Criativa" no hero e "Espeto Gaúcho" no case study, indicando o nome correto; client-2, 4 e 5 não têm nome identificado. Use o nome do restaurante.
- Cópia duplicada do carrossel: `alt=""` com `aria-hidden` no contêiner (correto, decorativo).
- Logo, 3 prints de sites e demais: alt descritivo, ok.

### 10. Sem `width`/`height` nas imagens: CLS potencial
O CLS medido é baixo (0,013, só o H1 trocando de fonte e um botão/overlay do vídeo), mas as imagens sem dimensões só não deslocam porque o contêiner tem altura fixada por classe (`h-12`, `w-64 h-24`). Os 3 prints de `SitesShowcaseSection` usam `h-auto` sem aspect-ratio; só estão sob a dobra e lazy, então hoje não causam deslocamento visível. Colocar `width={1100} height={688}` evita regressão.

## Baixo / OK

- **Analytics (GTM, GA4, Meta Pixel)**: só carregam **depois do consentimento** (`AnalyticsPixels`, `src/components/analytics/pixels.tsx`), com `afterInteractive`. Em produção sem cookie, nenhum script de terceiros além do Clerk. Bom. Não há scripts de terceiros no HTML (grep `gtag/fbq/googletagmanager` = 0).
- JS próprio: 36 KB transferidos de `/_next/static` (comprimido). Pequeno. Sem long task no desktop.
- Sem `preconnect`/`dns-prefetch` para `advanced-caribou-4.clerk.accounts.dev` (o JS é `async` e o handshake é redirecionamento; ganha pouco). Se o Clerk continuar na home, adicionar `<link rel="preconnect">` no layout.
- CSS: 2 arquivos, ~36 KB juntos, não é gargalo.
- Marquee de logos: animação CSS (`transform`), sem JS; respeita `prefers-reduced-motion`. Bom. `backdrop-blur` em 3 trechos (`HeroSection`, `SocialProofSection`) pode pesar em Android baixo; olhar só se houver jank.
- `favicon.ico` 404 (já anotado em CONTEXTO): ícone vem do Blob, sem custo extra.

## Ordem sugerida

1. Middleware: liberar `.mp4` (1 linha; destrava a prova social).
2. Recodificar o vídeo e pôr `poster` e `preload="none"`.
3. Hero: logo com `next/image` + `priority`; converter os 10 logos de clientes.
4. Clerk de produção; tirar `ClerkProvider` e `force-dynamic` da home para HTML em cache de CDN.
5. Headers de cache para `/clients`, `/sites`, `/videos`.
6. Fonte variável da Montserrat.

Ganho esperado: peso da home de ~1,65 MB para ~0,45 MB; LCP mobile de ~10 s para ~3 s; FCP mobile de 5 s para ~2 s.
