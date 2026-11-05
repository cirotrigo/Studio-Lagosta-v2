# GEO — Prontidão para busca por IA e agentes — lagostacriativa.com.br

Auditoria de 05/10/2026, só leitura (curl público + código em `Studio-Lagosta-v2`, sem edição).
Sem credenciais de DataForSEO/GSC: menções de marca e visibilidade em LLM não foram medidas por ferramenta.

## Nota: AI Search Readiness = 43/100

| Dimensão | Peso | Nota | Contribuição |
|---|---|---|---|
| Citabilidade | 25% | 45 | 11,3 |
| Legibilidade estrutural | 20% | 50 | 10,0 |
| Multimodal | 15% | 60 | 9,0 |
| Autoridade e marca/entidade | 20% | 30 | 6,0 |
| Acessibilidade técnica | 20% | 35 | 7,0 |
| **Total** | | | **43** |

Por plataforma (estimativa de laboratório):

| Plataforma | Nota | Por quê |
|---|---|---|
| Google AI Overviews | 40 | HTML SSR ok para o Googlebot, mas sem sitemap, sem JSON-LD, uma página só |
| ChatGPT Search | 35 | OAI-SearchBot recebe 200, mas não há robots/llms/sitemap e o FAQ não está no HTML |
| Perplexity | 35 | Mesmo quadro; passagens curtas e sem números próprios em quase todas as seções |
| Bing Copilot | 30 | Bing depende muito de sitemap/IndexNow — os dois ausentes |

Projeção: só os itens CRÍTICOS e ALTOS (robots, sitemap, llms.txt, JSON-LD do PR #198, FAQ no HTML, página Sobre) levam a nota para ~65–70.

---

## Acesso dos crawlers de IA

Não existe `robots.txt`: `GET /robots.txt` → **307 → /sign-in?redirect_url=%2Frobots.txt** (também em `www.`). Na prática todo crawler cai no default "tudo liberado" (robots que não responde 2xx é tratado como ausente), então nada está bloqueado — mas também nada está declarado, e o redirect para login é um sinal de baixa qualidade.

A home em si responde **200 com HTML completo (SSR)** para todos os agentes testados — sem o handshake do Clerk que o navegador sofre (`x-clerk-auth-reason: dev-browser-missing`, `x-clerk-auth-status: signed-out`):

| Crawler | Governa | Status hoje |
|---|---|---|
| OAI-SearchBot | Citação no ChatGPT Search | Liberado por omissão (200 na home) |
| GPTBot | Treino da OpenAI (não é ChatGPT Search) | Liberado por omissão |
| Claude-SearchBot | Citação na busca do Claude | Liberado por omissão (200) |
| ClaudeBot | Treino da Anthropic (não é busca) | Liberado por omissão |
| PerplexityBot | Índice do Perplexity | Liberado por omissão (200) |
| Googlebot | Google Search **e** AI Overviews | Liberado (200) |
| Google-Extended | Treino/grounding do Gemini — **não** afeta AI Overviews | Liberado por omissão |
| Applebot / Applebot-Extended | Siri/Spotlight / treino Apple Intelligence | Liberado por omissão |
| CCBot, cohere-ai | Treino | Liberado por omissão |

## llms.txt

**Ausente** — `GET /llms.txt` → 307 → /sign-in. Também `/sitemap.xml` → 307.

---

## Achados por severidade

### CRÍTICO

**C1. robots.txt, sitemap.xml e llms.txt são engolidos pelo middleware do Clerk**
- Evidência: os três respondem `307 → /sign-in`. Causa em `src/middleware.ts`: o `matcher` só pula arquivos com as extensões listadas (`html|css|js|…|webmanifest`) — `.txt` e `.xml` não estão — e nenhum dos três está em `isPublicRoute`. Também não existem `src/app/robots.ts`, `sitemap.ts` nem `llms.txt/route.ts`.
- Correção:
  1. Acrescentar a `isPublicRoute`: `'/robots.txt'`, `'/sitemap.xml'`, `'/llms.txt'`, `'/llms-full.txt'`.
  2. Criar `src/app/robots.ts` (MetadataRoute.Robots):
     ```
     User-agent: *
     Allow: /
     Disallow: /api/
     Disallow: /admin
     Disallow: /projects
     Disallow: /dashboard
     Disallow: /templates
     Disallow: /sign-in
     Disallow: /sign-up
     Disallow: /oauth
     Disallow: /envio
     Allow: /.well-known/

     Sitemap: https://lagostacriativa.com.br/sitemap.xml
     ```
     Não bloquear OAI-SearchBot, Claude-SearchBot, PerplexityBot nem Googlebot. Bloquear GPTBot/ClaudeBot/Google-Extended/CCBot é decisão de negócio (só afeta treino) — para uma agência que quer ser lembrada pelos modelos, recomendo **deixar liberado**.
     Não colocar `/.well-known` em Disallow: o robots não afeta clientes OAuth, mas o `Allow` explícito evita que alguém "limpe" isso depois.
  3. Criar `src/app/sitemap.ts` com `/`, `/privacy-policy`, `/terms-of-service` (e as páginas novas de C3/A3).
  4. Criar `src/app/llms.txt/route.ts` com `dynamic = 'force-static'`, **gerado dos mesmos dados das seções de venda**, no formato do `Site-Ciro-Trigo/src/app/llms.txt/route.ts` (que já está no ar e é um bom modelo). Para isso os arrays de conteúdo hoje dentro dos componentes (`objections`, planos do `OfferSection`, cases) precisam ir para um módulo `src/content/` compartilhado. Esqueleto:
     ```
     # Lagosta Criativa
     > Agência de marketing gastronômico em Vitória – ES: foto e vídeo, gestão de redes, atendimento com IA + CRM, sites com cardápio digital e tráfego pago para restaurantes.

     Fundador e responsável técnico: Ciro Trigo (https://cirotrigo.com.br/sobre). CNPJ 21.339.876/0001-37. Vitória – ES.
     WhatsApp: (27) 99757-8627 · E-mail: contato@lagostacriativa.com.br · Instagram: https://www.instagram.com/lagostacriativa/

     ## Serviços e preços
     - Foto e vídeo (avulso, por produção): Só Fotos R$ 990/sessão; Só Vídeos R$ 1.990/sessão; Edição 3 vídeos R$ 500, 6 vídeos R$ 890.
     - Gestão de redes / Atendimento com IA + CRM / Sites e cardápio digital / Tráfego pago: <planos e preços>
     ## Resultados (agosto/2026, painéis de atendimento)
     - Ilha do Caranguejo: 950+ mensagens respondidas pela IA, 96,4% das conversas.
     - Empório Fonseca: < 1 min para a primeira resposta, 95,5% das conversas respondidas.
     - 9 restaurantes do ES com conteúdo semanal; 7 com agente de IA.
     ## Clientes e sites entregues
     ## Perguntas frequentes
     ```
- Verificação: `curl -sI https://lagostacriativa.com.br/robots.txt` → `200 text/plain`; idem `/llms.txt`, `/sitemap.xml` (`application/xml`). Confirmar que `/.well-known/oauth-protected-resource` continua `200 application/json` com CORS.

### ALTO

**A1. Respostas do FAQ não estão no HTML**
- Evidência: as 4 perguntas aparecem, mas o HTML traz `<div data-state="closed" … hidden="" role="region">` vazio — o Radix `AccordionContent` não monta o conteúdo fechado. As respostas (`src/components/sales/ObjectionsSection.tsx`) só existem no bundle JS. São justamente os blocos pergunta→resposta mais citáveis da página.
- Correção: `forceMount` no `AccordionContent` com `data-[state=closed]:hidden` (ou `<details>/<summary>` nativo — o lado mais preguiçoso e que já funciona sem JS). Depois, `FAQPage` no JSON-LD.

**A2. 4 das 5 categorias de planos não estão no HTML**
- Evidência: só a aba "Foto e Vídeo" sai renderizada (R$ 990, R$ 1.990, R$ 500/R$ 890). "Gestão de Redes", "Atendimento com IA + CRM", "Sites e Cardápio Digital" e "Tráfego Pago" são `TabsContent` inativos (`OfferSection.tsx:239`) e não montam. Preço é o dado mais pedido em prompts do tipo "quanto custa uma agência de marketing para restaurante em Vitória".
- Correção: `forceMount` nos `TabsContent` com a inativa escondida por CSS, **e** os preços no llms.txt e em `Offer`/`OfferCatalog` no JSON-LD.

**A3. Nenhum dado estruturado em produção (PR #198 pendente)**
- Evidência: zero `application/ld+json` na home. O PR #198 (`feat/link-ciro-trigo`) adiciona `ProfessionalService` com `@id https://lagostacriativa.com.br/#lagosta-criativa`, `areaServed`, `sameAs` Instagram e `founder` com `@id https://cirotrigo.com.br/#ciro-trigo` — **esse @id confere** com o que `cirotrigo.com.br/sobre` publica.
- Correção: mergear o #198 e completar:
  - `telephone`, `email`, `taxID` (CNPJ), `logo`, `image`, `url`, `priceRange`;
  - `hasOfferCatalog` com os planos (A2);
  - `FAQPage` (A1);
  - `sameAs` com LinkedIn da empresa e perfil do Google (se existirem).
  - **Fechar o grafo do outro lado**: em `Site-Ciro-Trigo/src/lib/seo.ts:58` o `worksFor` cita a Lagosta como `{ '@type': 'Organization', name, url }` **sem @id**. Trocar por `{ '@id': 'https://lagostacriativa.com.br/#lagosta-criativa' }` (mesmo id do #198). Sem isso os dois sites descrevem duas entidades que os motores precisam adivinhar se são a mesma.

**A4. A entidade "Lagosta Criativa" não se define nas primeiras linhas, e Ciro Trigo só aparece no rodapé**
- Evidência: H1 = "Marketing que Gera Fila na Porta"; subtítulo "Não vendemos posts…". Nem o nome da empresa, nem "agência de marketing gastronômico", nem "Vitória – ES" aparecem nos primeiros ~60 palavras do conteúdo; "a única empresa do ES" está só no `meta description`. O fundador aparece uma vez: "Responsável Técnico: Ciro Trigo", sem link (o link vem no #198). Não há página Sobre (`/about` → 404).
- Correção:
  - Uma frase-definição logo abaixo do H1, curta e citável: "A Lagosta Criativa é uma agência de marketing gastronômico de Vitória – ES, fundada por Ciro Trigo, que reúne foto e vídeo, redes sociais, atendimento com IA, sites e tráfego pago para restaurantes."
  - Uma página `/sobre` (ou seção "Quem faz") com bio do Ciro, desde quando atua, quantos restaurantes, equipe — e link recíproco com `cirotrigo.com.br/sobre` (que já linka para cá).

**A5. Rotas de conteúdo novas cairiam no login: o `'/[slug]'` do middleware é literal**
- Evidência: `GET /qualquer-coisa` e `/marketing-gastronomico` → `307 → /sign-in`. Em `createRouteMatcher`, `'/[slug]'` não é parâmetro, é o texto "[slug]". Só `/about`, `/pricing`, `/contact`, `/blog` (explícitos) passam — e hoje dão 404.
- Impacto GEO: qualquer página de serviço, case ou artigo que se crie para ganhar citação (A4, M2) ficará invisível para crawler sem ninguém perceber.
- Correção: listar as rotas públicas novas explicitamente (`'/sobre'`, `'/servicos(.*)'`, `'/cases(.*)'`, `'/blog(.*)'`) e remover o `'/[slug]'` enganoso. Não trocar por um curinga `'/:slug'`, que abriria rotas do app.

### MÉDIO

**M1. Passagens curtas e sem número nas seções de serviço e de cases**
- Evidência: cada serviço tem 1 frase (~15–25 palavras). Os cases dizem "Redução no tempo de atendimento", "Elevação de receita no FDS", "Recorde de Pedidos" — sem número, sem período. Contraste: o bloco de estatísticas do topo é o melhor trecho citável da página ("950+ mensagens… 96,4% das conversas"; "< 1 min… 95,5%"; "Números de agosto/2026, lidos nos painéis de atendimento") — tem número, fonte e data.
- Correção: um bloco autossuficiente por serviço (~80–150 palavras: o que é, para quem, o que entra, prazo, quanto custa, um número de resultado) e cada case com métrica + período ("Coronel Picanha: tempo da primeira resposta caiu de X para Y min em Z").

**M2. Uma página só para cinco serviços**
- Evidência: só `/` tem conteúdo público. Perguntas como "fotografia gastronômica em Vitória preço" ou "atendimento com IA no WhatsApp para restaurante" competem contra páginas dedicadas de outros sites.
- Correção (depois de A5): uma página por serviço com H2 em forma de pergunta ("Quanto custa…", "Como funciona o atendimento com IA…") e resposta direta nas primeiras 40–60 palavras de cada seção.

**M3. Prova social marcada "Em breve"**
- Evidência: "Depoimento 2 — Em breve", "Depoimento 3 — Em breve". Um único depoimento (Jefinho, Coronel Picanha).
- Correção: tirar os placeholders do HTML até existirem; trazer depoimentos com nome, cargo e restaurante. Placeholder é texto que um extrator pode citar.

**M4. `www` e apex servem a mesma home — e o OAuth usa `www`**
- Evidência: `https://www.lagostacriativa.com.br/` → 200 (canonical aponta para o apex, o que mitiga). Mas o metadata OAuth publicado diz `"resource":"https://www.lagostacriativa.com.br/api/mcp"`, `"authorization_servers":["https://www.lagostacriativa.com.br"]` (`oauthIssuer()` vem de `STUDIO_LAGOSTA_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL`).
- Correção: **não** fazer um 301 de host inteiro `www → apex`: quebraria a validação do issuer no conector MCP (claude.ai/ChatGPT) e os tokens já emitidos para a audiência `www…/api/mcp`. Se quiser consolidar, redirecione só HTML de marketing (`/`, `/privacy-policy`, `/terms-of-service`, páginas novas) e exclua `/.well-known/*`, `/api/*`, `/oauth/*`, `/sign-in*`. O canonical atual já resolve o essencial para busca.

**M5. Clerk de DESENVOLVIMENTO na produção e `no-store` na home**
- Evidência: handshake com `advanced-caribou-4.clerk.accounts.dev` no primeiro acesso de navegador; `cache-control: private, no-cache, no-store` + metas `Cache-Control/Pragma/Expires` na home; `x-vercel-cache: MISS`.
- Impacto: crawlers de IA não sofreram o handshake nos testes (receberam 200 direto), mas agentes de navegação (browser real) sofrem o redirect extra; e home sem cache = TTFB mais alto e risco de timeout em crawlers impacientes.
- Correção: instância Clerk de produção; home estática/ISR (`revalidate`) e remover as metas de no-cache.

**M6. Páginas de login indexáveis**
- Evidência: `/sign-in` e `/sign-up` respondem 200, sem `<meta name="robots" content="noindex">`, com título "Lagosta Criativa - Studio".
- Correção: `robots: { index: false }` no metadata dessas rotas (além do Disallow de C1).

### BAIXO

**B1. Markdown para agentes**: `Accept: text/markdown` devolve HTML. Com o llms.txt gerado do conteúdo (C1), um `/llms-full.txt` (ou `/index.md`) com a página inteira em Markdown sai de graça do mesmo módulo. Não é padrão consolidado — fazer só depois de C1.

**B2. /.well-known**: hoje público por causa do OAuth (`oauth-protected-resource`, `oauth-authorization-server` → 200 JSON com CORS `*`; rewrite em `next.config` + `'/.well-known(.*)'` em `isPublicRoute`). **Manter exatamente assim.** Acréscimos opcionais e sem risco, por serem caminhos novos: `/.well-known/security.txt` (hoje 404; RFC 9116, contato e `Expires`). Não recomendo agora `mcp.json`/`api-catalog`: não há consumidor relevante e o conector já é descoberto pelo `401 + WWW-Authenticate` do `/api/mcp`. Qualquer arquivo novo em `public/.well-known/` deve ser conferido contra os rewrites para não sombrear os dois endpoints OAuth.

**B3. `/favicon.ico` 404** (ícone vem do Blob). Cosmético para agentes; um `src/app/favicon.ico` resolve.

**B4. Headings sem pergunta**: nenhum H2/H3 está em forma de pergunta, exceto o FAQ (que é H3 do Radix sem a resposta no HTML). "Por que a maioria fracassa?" é o único.

---

## Marca e entidade

| Sinal | Situação | Fonte |
|---|---|---|
| Wikipedia | Ausente (busca pt.wikipedia sem resultado para a marca) | API pública |
| Instagram | `@lagostacriativa` linkado no rodapé | HTML |
| Site do fundador | `cirotrigo.com.br/sobre` cita e linka a Lagosta; `worksFor` sem `@id` | curl + `Site-Ciro-Trigo/src/lib/seo.ts:58` |
| LinkedIn (empresa) | Não linkado pelo site | HTML |
| Perfil no Google | Não linkado pelo site | HTML |
| YouTube / Reddit | **Não medido** (sem ferramenta); nenhum link no site | — |

Correlação conhecida: menções em YouTube (~0,74) e Reddit pesam mais que backlinks (~0,27) para citação em IA. A Lagosta produz vídeo de restaurante toda semana — um canal no YouTube com bastidores e cases ("como fotografamos o cardápio do X") é a alavanca de menção mais barata que ela tem. Os clientes (Coronel Picanha, Seu Quinto, TERO, Espeto Gaúcho, Empório Fonseca, Clericot, Cypra) linkando "site/marketing por Lagosta Criativa" a partir dos próprios sites (os 3 sites entregues) é o segundo sinal mais barato.

---

## Top 5 mudanças de maior impacto

| # | Mudança | Esforço |
|---|---|---|
| 1 | Liberar e criar `robots.txt`, `sitemap.xml` e `llms.txt` (C1) — o llms.txt no molde do cirotrigo.com.br | ~2 h |
| 2 | Mergear o PR #198 + completar o JSON-LD (Offer, FAQPage, contato) e pôr o `@id` da Lagosta no `worksFor` do cirotrigo.com.br (A3) | ~2 h |
| 3 | FAQ e todos os planos no HTML (`forceMount`/`<details>`) (A1, A2) | ~1 h |
| 4 | Frase-definição sob o H1 + página `/sobre` com o Ciro, e corrigir o `'/[slug]'` do middleware antes de criar páginas (A4, A5) | ~4 h |
| 5 | Cases com número e período, um bloco autossuficiente por serviço (M1) — depois, uma página por serviço (M2) | 1–2 dias (conteúdo) |

## Dados estruturados para findings (AI Search Readiness)

```json
{
  "category": "AI Search Readiness",
  "score": 43,
  "dimensions": {"citability": 45, "structure": 50, "multimodal": 60, "authority": 30, "technical": 35},
  "platforms": {"google_aio": 40, "chatgpt": 35, "perplexity": 35, "bing_copilot": 30},
  "crawlers": {"robots_txt": "307 -> /sign-in (ausente)", "OAI-SearchBot": "allowed-by-default", "Claude-SearchBot": "allowed-by-default", "PerplexityBot": "allowed-by-default", "Googlebot": "allowed", "GPTBot": "allowed-by-default", "ClaudeBot": "allowed-by-default", "Google-Extended": "allowed-by-default"},
  "llms_txt": "missing (307 -> /sign-in)",
  "sitemap": "missing (307 -> /sign-in)",
  "ssr": true,
  "json_ld": "none in production (PR #198 pending)",
  "findings": [
    {"id": "C1", "severity": "critical", "title": "robots/sitemap/llms.txt redirecionam para login (middleware)"},
    {"id": "A1", "severity": "high", "title": "Respostas do FAQ fora do HTML (Radix Accordion fechado)"},
    {"id": "A2", "severity": "high", "title": "4 de 5 categorias de planos fora do HTML (Tabs inativas)"},
    {"id": "A3", "severity": "high", "title": "Sem JSON-LD; worksFor do cirotrigo.com.br sem @id"},
    {"id": "A4", "severity": "high", "title": "Entidade e fundador não definidos no topo; sem página Sobre"},
    {"id": "A5", "severity": "high", "title": "'/[slug]' literal no middleware: páginas novas caem no login"},
    {"id": "M1", "severity": "medium", "title": "Passagens curtas, cases sem número"},
    {"id": "M2", "severity": "medium", "title": "Uma página para cinco serviços"},
    {"id": "M3", "severity": "medium", "title": "Depoimentos 'Em breve' no HTML"},
    {"id": "M4", "severity": "medium", "title": "www e apex servem a home; OAuth usa www — não redirecionar host inteiro"},
    {"id": "M5", "severity": "medium", "title": "Clerk de desenvolvimento e no-store na home"},
    {"id": "M6", "severity": "medium", "title": "/sign-in e /sign-up indexáveis"},
    {"id": "B1", "severity": "low", "title": "Sem versão Markdown para agentes"},
    {"id": "B2", "severity": "low", "title": "/.well-known: manter OAuth; security.txt opcional"},
    {"id": "B3", "severity": "low", "title": "/favicon.ico 404"},
    {"id": "B4", "severity": "low", "title": "Headings sem forma de pergunta"}
  ]
}
```
