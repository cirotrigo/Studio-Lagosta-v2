# Plano — App mobile da equipe: bancada, agenda e criativos (12/08/2026)

Estudo de viabilidade e plano de desenvolvimento para um aplicativo de celular
de uso interno da equipe, cobrindo **bancada** (criação e aprovação de artes,
fila), **agenda** (acompanhamento das postagens dos clientes) e **criativos**
(galeria). Pedido do Ciro em 12/08/2026.

> **Decisão de 12/08/2026 (mesmo dia): o Ciro não quer a inscrição na Apple.**
> Sem o Developer Program não existe app nativo distribuível para equipe
> (conta gratuita expira o app em 7 dias e exige reinstalar via Xcode), então
> **a via principal passa a ser a PWA — ver § 11**, que substitui as fases do
> § 7. Os §§ 3–7 ficam como estavam: são o mapa do caminho nativo, válido se
> um dia a inscrição acontecer (o § 11 reaproveita quase tudo deles, menos a
> camada OAuth/`/api/app`, que a PWA dispensa).

## 1. O pedido, traduzido em requisitos

- App **mobile**, desenvolvido **no macOS** (Xcode no Mac do Ciro), rodando no
  iPhone dele e da equipe. Bônus da via escolhida: o mesmo build roda em Macs
  Apple Silicon ("Designed for iPhone"), o que cobre também a leitura literal
  de "roda no macOS".
- **Sem hospedagem nova.** O app é um **controle remoto** do backend que já
  está no ar na Vercel — geração de arte, fila durável, render, agenda, Zernio,
  Drive e crons são todos server-side e continuam onde estão. Não existe
  versão "standalone" possível: o app sem o backend não faz nada.
- **Distribuição direta**, sem App Store pública: arquivo de instalação (ou
  TestFlight) para as pessoas da equipe.
- **Sem tela de créditos e sem burocracia de login** — mas com identidade
  suficiente para que a arte gerada no app apareça no usuário certo do site.
- Foco: **aprovação rápida** — artes na bancada e na fila, acompanhamento da
  agenda dos clientes. Não é um editor completo no celular.

## 2. Veredito de viabilidade

**Viável, e mais barato do que parece.** O levantamento do código (12/08)
mostrou que o backend já foi construído da forma exata que um cliente mobile
precisa:

1. **As três telas têm rotas HTTP finas sobre serviços extraídos.** A regra da
   casa de tirar a lógica das rotas (`agendarPost`, `startArtGeneration`,
   `processarAprovacao`, `plano-service`, `registrarDesfecho`…) significa que o
   app não reimplementa regra nenhuma — as travas (janela de congelamento,
   sinais de aprendizado, dedupe, gates) moram nos serviços e valem para
   qualquer porta de entrada.
2. **Todo acompanhamento assíncrono é polling simples**, sem WebSocket: 5s na
   bancada (`GET /api/generations/[id]`), 10–20s na agenda, com a fila durável
   (`GenerationJob` + cron por minuto) como rede de segurança no servidor. É o
   modelo ideal para app que entra e sai de foreground.
3. **A fila da bancada é do servidor desde a F3** (`PlanoDeConteudo` +
   `ItemDePlano`): o celular e o site enxergam a MESMA fila, com reconciliação
   de status já resolvida (`para-bancada.ts`, `reconciliar.ts`).
4. **A autenticação leve já existe, pronta e testada**: a infraestrutura OAuth
   2.1 + PKCE construída para o conector MCP (`McpOAuthToken`, rotas
   `/api/oauth/*`, tela de consentimento, refresh com rotação, hashes SHA-256
   no banco). O app faz login UMA vez num navegador (a mesma tela de
   consentimento que o claude.ai usa) e daí em diante vive de tokens — e o
   token carrega o `clerkId`, então **toda arte gerada no app nasce atribuída
   ao usuário do site**, que é exatamente o que se quer.
5. **As mídias são URLs públicas do Vercel Blob** — exibir no app é `<Image>`
   com a URL, sem proxy nem assinatura.

O trabalho real se resume a: (a) uma **porta de token** para rotas de app
(`/api/app/*`), (b) **duas rotas que hoje só existem no MCP** (propor-semana e
executar-plano), e (c) **o app em si**, que é majoritariamente UI.

## 3. Decisões de arquitetura

### 3.1 Tecnologia do app: React Native + Expo (recomendado)

| Opção | Prós | Contras |
|---|---|---|
| **Expo / React Native** ✅ | Mesmo stack mental do repo (TypeScript, React, TanStack Query — os hooks do site viram ports quase diretos); build local no Mac com `npx expo run:ios` (prebuild + Xcode), **sem serviço de nuvem obrigatório**; Android de brinde se um dia precisar | Ponte nativa a mais para depurar; app ~2× o tamanho de um nativo puro |
| SwiftUI nativo | Melhor sensação de plataforma; menor | Linguagem nova para a equipe; zero reuso de tipos/hooks; mais lento de construir e manter |
| PWA (site responsivo + "Adicionar à Tela de Início") | O MAIS barato — a agenda já tem componentes mobile (`viewModeEfetivo` cai para grade, `mobile-channels-drawer`); zero distribuição | Não é "arquivo de instalação"; sensação web; login Clerk por sessão de navegador |

Recomendação: **Expo como via principal**, com a PWA como *acelerador
opcional* (§ 8) — 1–2 dias de polimento responsivo dão acesso imediato pelo
celular enquanto o app nativo é construído, sem conflito entre as duas coisas.

Bibliotecas do app: `expo-router` (navegação), `@tanstack/react-query` (o
mesmo do site), `expo-auth-session` (PKCE), `expo-secure-store` (tokens no
Keychain), `expo-image` (cache de imagem), `FlashList` (listas grandes).

### 3.2 Distribuição: TestFlight interno (recomendado)

Pré-requisito único: inscrição no **Apple Developer Program (US$ 99/ano)** na
conta do Ciro. A partir dela, três vias:

| Via | Como funciona | Limites | Avaliação |
|---|---|---|---|
| **TestFlight interno** ✅ | Cada pessoa entra no App Store Connect como testadora interna; instala pelo app TestFlight; **atualiza sozinho** a cada build novo | Até 100 pessoas; **sem revisão da Apple**; build vale 90 dias (subir build novo renova) | A melhor para equipe: instalação por convite, update automático, revogação por pessoa |
| Ad-hoc (IPA) | Coleta o UDID de cada iPhone, registra no portal, gera o `.ipa` assinado e distribui o arquivo (AirDrop, link `itms-services` num HTTPS qualquer — pode ser um estático no próprio deploy da Vercel) | 100 aparelhos/ano por tipo; **sem update automático**; reassinar a cada renovação anual | É a leitura literal de "distribuir o arquivo de instalação", mas dá mais trabalho a cada versão |
| Sideloading Brasil | A Apple fechou acordo com o CADE para permitir distribuição fora da App Store no Brasil (nos moldes da UE) | Regras ainda assentando; exigências de elegibilidade da conta | **Observar, não planejar em cima** — se amadurecer, vira a via definitiva de "arquivo livre" |

Conta Apple gratuita (sem o Program) não serve para equipe: app expira em 7
dias e só 3 aparelhos. Serve só para o desenvolvimento no aparelho do Ciro
antes da inscrição. Se alguém da equipe usar Android, o Expo gera o APK e a
instalação é livre, sem custo nem cadastro.

### 3.3 Autenticação: reusar o OAuth do conector, não inventar outra

O desejo é "quem tem o app acessa livremente, sem autenticação complexa" — e
ao mesmo tempo "a arte gerada deve aparecer no usuário do site". As duas
coisas juntas descartam o atalho óbvio e apontam para o que já existe:

- **Rejeitado: segredo compartilhado embutido no app** (padrão
  `EXTERNAL_API_SECRET`). Parece "acesso livre", mas: não há atribuição
  (toda arte sairia de um usuário-robô), não há como revogar uma pessoa que
  sai da equipe sem trocar o app de todo mundo, e um vazamento do arquivo de
  instalação viraria acesso total permanente ao estúdio.
- **Adotado: OAuth 2.1 + PKCE que o MCP já usa** (`src/lib/mcp/oauth.ts`).
  O fluxo, do ponto de vista de quem usa, é UMA tela: o app abre o navegador
  na tela de consentimento (`/oauth/authorize`), a pessoa entra com a conta
  do Studio (Clerk) uma única vez, autoriza, e volta para o app. Dali em
  diante é invisível: access token de 1h renovado por refresh token com
  rotação (já implementados), guardados no Keychain. `McpOAuthToken.userId`
  é o `clerkId` — atribuição resolvida por construção.

O que falta na infra (pequeno):

- **Redirect URI de app nativo**: o fluxo hoje valida `redirectUris`
  registradas; conferir se `registerClient` aceita scheme customizado
  (`lagosta://oauth-callback`, RFC 8252). Se a validação exigir `https`,
  liberar o scheme do app (allowlist explícita, não geral).
- **Revogação manual**: hoje não há endpoint nem UI (a revogação existe só na
  rotação e no reuso de código). Para "pessoa saiu da equipe", v1 pode ser um
  script/SQL (`revokedAt`); uma telinha em `/admin` fica para depois.

### 3.4 Camada de API: namespace `/api/app/*` com rotas finas

As rotas atuais são amarradas à sessão Clerk **pelo middleware** (rota de API
não-pública redireciona para `/sign-in` em HTML — inútil para um app). Em vez
de mexer rota a rota, nasce um namespace novo, no molde do `/api/mcp`:

- `/api/app(.*)` entra na lista pública do `src/middleware.ts` e **se
  autentica sozinho**: helper `autenticarApp(req)` = `Bearer` →
  `resolveAccessToken` (mesma função do MCP) → usuário.
- **Resolução de usuário é SÓ leitura** (`findUnique` por `clerkId`, nunca
  `getUserFromClerkId`) — criar User em código de auth é como nascem os Users
  fantasma. Token válido de usuário sem linha no banco = 401 com mensagem
  dizendo qual e-mail está conectado (regra da casa desde `bc085d0`).
- **Visibilidade de projetos reusa a lição do MCP** (`projetosVisiveis` +
  `orgsDoUsuario` com cache de 60s): membro de organização enxerga os
  clientes, Clerk fora do ar degrada para MENOS acesso, e negativa diz quem
  está conectado.
- As rotas são **casca fina sobre os MESMOS serviços** das rotas web — zero
  regra nova. A identidade (`decididoPor`, dono da Generation) sai SEMPRE do
  token, nunca de campo enviado pelo cliente.

Rotas do namespace (v1):

| Rota `/api/app/...` | Serviço por trás | Já existe equivalente? |
|---|---|---|
| `GET /projetos` | `projetosVisiveis` (mcp/tools) | Sim (`/api/projects`, Clerk) |
| `GET /projetos/[id]/agenda?inicio&fim` | mesma query do calendar (com `congelado` derivado) | Sim (`/posts/calendar`) |
| `POST /projetos/[id]/posts/aprovacao` | `processarAprovacao` (APPROVE/REVERT) | Sim (`/posts/approval`) |
| `PUT /projetos/[id]/posts/[postId]` | mesma lógica do PUT atual (reagendar/editar) | Sim |
| `GET /posts/[postId]/status` | polling de POSTING | Sim |
| `GET /projetos/[id]/planos*` + `PATCH .../itens/[itemId]` | `plano-service`, `reconciliar` | Sim |
| `GET /projetos/[id]/slots`, `GET /acervo` | `sugerirPosts`, `buscarNoAcervo` | Sim |
| `POST /projetos/[id]/arte-ia` (+ `refazer`) | `startArtGeneration` + fila | Sim |
| `GET /generations/[id]` (+ `feedback`) | polling + `feedback-de-arte` | Sim |
| `POST /projetos/[id]/agendar` | `agendarPost` + desfecho de slot | Sim |
| `POST /projetos/[id]/revisao-ortografica` | `revisarOrtografia` | Sim |
| `GET /projetos/[id]/criativos?pagina` | listagem com filtro `track<>'imagem'` (raw SQL, `COALESCE`) | Sim (`/generations`) |
| `POST /generations/[id]/melhorar` | `startImprovement` | Sim (`/improve`) |
| **`POST /projetos/[id]/propor-semana`** | `proporSemana` | **Não — só MCP hoje** |
| **`POST /projetos/[id]/executar-plano`** | `executarPlano` | **Não — só MCP hoje** |

Sobre as duas últimas: `proporSemana` monta e persiste sem gastar; a rota é
trivial. `executarPlano` **mantém o gate mecânico de duas chamadas** — a 1ª
devolve a conta sem escrever nada, e só `confirmar: true` na 2ª produz. No
app isso vira uma tela de confirmação mostrando a conta; o gate existe para
um humano ver o custo antes, e a tela satisfaz isso.

Duplicação assumida e por quê: as rotas `/api/app` repetem a validação zod e
a chamada de serviço das rotas web (~20–40 linhas cada). A alternativa —
ensinar cada rota existente a aceitar dois modos de auth e tirá-las do
middleware — espalharia risco por 200+ arquivos para economizar pouco. Onde a
rota web tem lógica própria (o PUT de posts com sync do Zernio, o desfecho de
aprendizado com 204 linhas), **extrair o miolo para `src/lib` primeiro** e as
duas rotas consumirem o mesmo serviço — na direção que o repo já segue.

### 3.5 Créditos: continuam existindo, o app só não fala deles

"Não precisa computar créditos" vira: **o app não mostra saldo nem bloqueia
por crédito** — mas a dedução server-side continua intacta, porque ela mora
nos serviços (`startArtGeneration` valida e debita) e criar um caminho de
geração sem cobrança seria uma segunda verdade de preço (armadilha já
registrada no repo). O custo cai no dono do projeto, como hoje no site e no
conector. Se um dia o time quiser "app ilimitado", isso é decisão de preço no
admin, não fork de código.

## 4. Escopo funcional do app (v1)

Três abas + login. Tudo em português de gente (regra da casa: nunca vazar
DRAFT/SCHEDULED/pageId para a conversa — vale dobrado numa tela).

**Login** — botão único "Entrar com a conta do Studio" → navegador → volta.
Sessão persistida no Keychain; renovação silenciosa; sair = apagar tokens.

**Agenda** (a aba de acompanhamento)
- Lista vertical por período (a "grade" do site, que já é o modo mobile),
  seletor de cliente (ou "todos"), filtro por tipo.
- Card: capa (`renderedImageUrl || mediaUrls[0]`), horário BRT, status em PT
  com as mesmas cores, cadeado quando `congelado` (o campo booleano que a API
  já deriva — o app **esconde editar/melhorar** nesses posts, como o site),
  spinner "Gerando a arte…" quando `pageId` com render pendente.
- Ações: **aprovar** e **voltar para rascunho** (em lote e por post),
  **reagendar** (data/hora), ver detalhe com motivo de falha e link da
  publicação. Polling de "Postando…" a cada 10s enquanto houver POSTING.

**Bancada** (a aba de produção — o coração do pedido)
- **Fila** = plano ativo do servidor: os mesmos cards do site (tema, copy,
  foto, slot, situação), reconciliados pelo servidor — item `gerando` cujo
  job terminou aparece `pronto` ao abrir.
- Por card: **gerar** (dispara `arte-ia`, poll de 5s, teto de 8 min com o
  aviso honesto "pode ainda terminar e aparecer na galeria"), **ver a arte**
  com os avisos de verificação (texto divergente, número inventado, cena
  alterada — avisam, nunca vetam), **feedback** "Gostei / Preciso melhorar"
  (um toque grava; o texto é opcional), **editar** copy/horário (PATCH do
  item), **agendar** (rascunho ou agendado direto), **descartar**.
- **Propor semana**: um botão que chama a rota nova e enche a fila com a
  leva (slots + assunto + foto + dica de copy). **Executar plano**: tela de
  conta → confirmar → acompanha os itens gerando.
- Compositor completo (montar item do zero com busca no acervo + revisão
  ortográfica) entra, mas pode ser a última entrega da fase — o fluxo de
  APROVAÇÃO da fila é o que o pedido prioriza.

**Criativos**
- Galeria infinita do projeto (60 por página, mesmo filtro que esconde as
  fotos de cena da trilha `imagem`), refetch enquanto houver PROCESSING.
- Lightbox nativo com os botões de feedback (a lição do PhotoSwipe/teclado do
  site nem se aplica — no nativo o problema não existe).
- **Melhorar com IA** (pedido de até 1200 chars, poll, comparação
  antes/depois), compartilhar/baixar pela share sheet do iOS (mandar arte no
  WhatsApp vira gesto de um toque — provável uso mais frequente).

**Fora do v1, de propósito**: editor Konva (edição fina de camada continua no
desktop), carrossel guiado com confirmação de look (v1.1 — o fluxo existe nas
rotas, é só UI), export de vídeo, base de conhecimento, chat, admin,
qualquer tela de créditos.

## 5. Trabalho no backend (este repo)

| # | Entrega | Tamanho |
|---|---|---|
| B1 | `autenticarApp` + `/api/app(.*)` público no middleware + `projetosVisiveis` compartilhado (mover de `mcp/tools.ts` para `src/lib/projects/`) | P |
| B2 | Redirect URI de scheme nativo no fluxo OAuth (+ teste do fluxo com `expo-auth-session`) | P |
| B3 | Rotas finas de leitura: projetos, agenda, planos, criativos, generation/status | M |
| B4 | Rotas finas de escrita: aprovação, reagendar, agendar, arte-ia, melhorar, feedback, desfecho, revisão ortográfica (extraindo miolo onde a rota web tem lógica própria) | M/G |
| B5 | Rotas novas: `propor-semana` e `executar-plano` (com o gate de 2 chamadas) | P/M |
| B6 | `superficie: 'app'` no vocabulário de sinais (para o KPI distinguir de onde veio a decisão) | P |
| B7 | Script de revogação de token por pessoa (v1 do offboarding) | P |

Regras da casa que estas rotas carregam por construção (e o code review deve
conferir): `decididoPor` = `User.id` interno resolvido do token, lookup de
User **sem criar**, sinais de aprendizado passam pelos mesmos serviços (chave
de idempotência incluída), congelado respeitado, `mediaUrls` nunca reduzido,
filtro Json por `COALESCE` em SQL cru.

## 6. Trabalho no app

Morada: pasta `mobile/` neste mesmo repo (package.json próprio; o build da
Vercel não a enxerga — adicionar ao `.vercelignore` só para o upload ficar
leve). Mesmo repo = tipos de resposta das rotas `/api/app` versionados junto
com quem os serve.

| # | Entrega | Tamanho |
|---|---|---|
| A1 | Esqueleto Expo (router, tema, cliente HTTP com refresh automático, TanStack Query) | M |
| A2 | Login OAuth PKCE + Keychain + interceptor de 401 | M |
| A3 | Aba Agenda (lista, card, aprovar/reverter, reagendar, detalhe, polling) | M/G |
| A4 | Aba Criativos (galeria, lightbox, feedback, melhorar, share) | M |
| A5 | Aba Bancada (fila, gerar+poll, avisos, agendar, editar, propor/executar) | G |
| A6 | Compositor mínimo (acervo + slots + revisão) | M |
| A7 | Build/assinatura, ícone, TestFlight, guia de instalação da equipe | M |

## 7. Fases e estimativas

Estimativas em dias de trabalho focado (com Claude Code no par):

- **F0 — Fundação (3–5 dias)**: B1 + B2 + B3 parcial; app A1 + A2. Critério
  de saída: fazer login no iPhone e ver a lista de clientes e a agenda de um
  deles, com dados de produção.
- **F1 — Agenda (3–4 dias)**: B3/B4 da agenda + A3. Saída: aprovar um
  rascunho de verdade pelo celular e vê-lo agendado no site.
- **F2 — Criativos (2–3 dias)**: rotas de galeria/melhoria + A4. Saída:
  melhorar uma arte pelo celular e dar feedback.
- **F3 — Bancada (4–6 dias)**: B4 restante + B5 + A5 (+ A6 se couber).
  Saída: propor a semana, gerar uma peça, aprovar e agendar, tudo do celular.
- **F4 — Distribuição e acabamento (3–4 dias)**: A7, B6, B7, ajustes de uso
  real da equipe.

Total: **~3 semanas de trabalho focado**. Custo recorrente novo: US$ 99/ano
da Apple. Infra: zero — mesma Vercel, mesmo banco, mesma fatura de IA de
sempre (o app não adiciona nem remove custo de geração).

## 8. Acelerador opcional: PWA em 1–2 dias

Enquanto o nativo não chega, dá para ter 70% do valor imediatamente: a agenda
já tem os componentes mobile; falta revisar a bancada e a galeria em viewport
estreito, adicionar `manifest.json` + ícone (o middleware já até exclui
`.webmanifest` da proteção, preparado para um arquivo que nunca existiu) e
ensinar a equipe o "Adicionar à Tela de Início". Login continua o Clerk de
hoje. Nada disso é jogado fora depois — o site fica melhor no celular de
qualquer forma, e o backend do app (F0) é o mesmo.

## 9. Riscos e pontos de atenção

- **Redirect de scheme nativo** no OAuth é a única incógnita técnica da
  fundação — resolver na F0, antes de qualquer UI (mitigação trivial:
  allowlist do scheme na validação de `redirectUris`).
- **Acesso da equipe**: atribuição exige que cada pessoa tenha conta no
  Studio e esteja na organização Clerk do estúdio — mesma regra do site e do
  conector. Vale conferir quem da equipe ainda não tem.
- **TestFlight interno** exige cada pessoa no App Store Connect (papel
  mínimo). Sem revisão da Apple; testador externo exigiria Beta App Review.
- **Build de 90 dias** no TestFlight: subir um build novo a cada ciclo
  (baixa fricção; o update é automático para todos).
- **URLs do Blob são públicas por construção** — nada muda em relação ao
  site, mas é bom estar dito: quem tiver a URL de uma arte a vê.
- **Polling vs. bateria**: os intervalos do site (4–5s) valem no app apenas
  com a tela aberta; em background, nada roda (e a fila durável do servidor
  garante que o trabalho termina de qualquer jeito). Push notification fica
  de fora do v1 — os avisos operacionais já chegam pelo grupo de WhatsApp.
- **Sideloading no Brasil** (acordo Apple × CADE) pode simplificar a
  distribuição no futuro; não é premissa de nada neste plano.

## 10. Decisões que ficam com o Ciro antes da F0

1. Inscrever a conta Apple no Developer Program (US$ 99/ano) — destrava
   TestFlight e ad-hoc. **Decidido em 12/08: NÃO. Ver § 11.**
2. TestFlight interno (recomendado) ou IPA ad-hoc como via de distribuição.
3. Alguém da equipe usa Android? (Se sim, o APK sai quase de graça do Expo.)
4. Rodar o acelerador PWA (§ 8) em paralelo ou ir direto ao nativo.
5. Confirmar que toda a equipe tem conta no Studio e está na organização.

## 11. Plano revisado (12/08/2026): PWA como via principal, sem Apple

Sem a inscrição, o § 8 deixa de ser acelerador e vira o produto. E a troca
tem um dividendo que o estudo deixou explícito: **a maior parte do trabalho
de backend do caminho nativo desaparece**, porque a PWA roda no mesmo domínio
do site com a sessão Clerk de sempre —

- **B1–B4 e A1–A2 do plano nativo somem inteiros**: nada de porta OAuth para
  scheme nativo, nada de namespace `/api/app/*`, nada de Keychain/refresh. As
  telas mobile consomem as MESMAS rotas que o site já usa, com a mesma
  atribuição de usuário por construção.
- **Sobram do backend só**: as rotas HTTP de `propor-semana` e
  `executar-plano` (hoje só no MCP; o gate de 2 chamadas do executar
  continua), e `superficie` própria nos sinais se quisermos distinguir a
  decisão vinda do celular.
- **Distribuição = um link.** A pessoa entra com a conta dela uma vez, toca em
  "Adicionar à Tela de Início" e ganha um ícone que abre em tela cheia
  (standalone), sem barra do Safari. Atualização é instantânea para todo
  mundo — melhor que TestFlight nesse quesito. Revogar acesso = desativar a
  conta, como no site.
- **O que o celular precisa já funciona no Safari**: polling de geração,
  upload/câmera via input de arquivo, compartilhar arte no WhatsApp pela Web
  Share API, e push para PWA instalada existe no iOS ≥ 16.4 se um dia for
  desejado (v1 não precisa — o grupo de WhatsApp já avisa).
- **Limites aceitos**: não há arquivo de instalação (a via é o link), a
  sensação é um degrau abaixo do nativo, e nada roda em segundo plano — o que
  não importa aqui, porque quem trabalha é o servidor (fila durável + crons).

Forma: **melhorar as páginas existentes em viewport estreito**, não criar
rotas paralelas `/m/*` — duas versões da mesma tela viram duas fontes de
verdade de UI (a agenda já provou o caminho certo: `viewModeEfetivo` cai para
grade no celular). Acrescenta-se um shell de navegação inferior (abas
Bancada / Agenda / Criativos) visível só em telas pequenas, `manifest.json` +
ícones (o middleware já exclui `.webmanifest` da proteção, preparado para um
arquivo que nunca existiu) e `start_url` numa tela de entrada enxuta.

### Fases revisadas

- **P0 — PWA instalável (1–2 dias)**: manifest, ícones, meta tags iOS, shell
  de abas mobile, revisão da agenda em tela estreita. Saída: ícone na tela
  de início do iPhone do Ciro abrindo a agenda em tela cheia, com aprovação
  de rascunho funcionando.
- **P1 — Bancada no celular (3–4 dias)**: fila, gerar com polling e avisos,
  feedback, editar, agendar; compositor mínimo por último. Saída: gerar,
  aprovar e agendar uma peça real só pelo celular.
- **P2 — Criativos no celular (1–2 dias)**: galeria e lightbox em viewport
  estreito (grade e PhotoSwipe já existem — cuidado com as armadilhas
  registradas de `[class*="container"]` e teclado do lightbox), melhorar com
  IA, compartilhar via Web Share.
- **P3 — Propor/executar semana (1–2 dias)**: as duas rotas HTTP novas +
  botões na bancada mobile, com a tela de conta antes do confirmar.

Total: **~1 a 1,5 semana** de trabalho focado. Custo: zero — nenhuma conta
nova, nenhuma infraestrutura nova, nenhum arquivo para distribuir.

O caminho nativo (§§ 3–7) não é jogado fora: se a inscrição na Apple
acontecer um dia, a PWA já terá consolidado as telas mobile e o app Expo
nasce por cima das mesmas rotas — com a camada OAuth como único trabalho
extra de backend.
