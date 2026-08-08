# Plano — Fase 2 da agenda web: rotas, grade e mobile de verdade

**Data:** 08/08/2026
**Origem:** detalhamento da Fase 2 do `PLANO-AGENDA-WEB-2026-08-04.md` (§ 4),
depois de estudar o código das duas agendas, dos dois modais grandes e do app
desktop. **Inclui a visualização otimizada para mobile como parte de cada
etapa**, não como fase à parte — pedido do Ciro em 08/08.

---

## 1. O que o estudo do código acrescentou ao plano de 04/08

1. **São DUAS agendas, e a do projeto não tem mobile nenhum.**
   - `/agenda` (global) → `AgendaCalendarView` (448 linhas): tem `useIsMobile`,
     `MobileAgendaListView` + `MobileDayGroup` + `MobilePostCard`, drawer de
     canais e `CalendarHeader` adaptado (filtros num dropdown compacto).
   - `/projects/[id]?tab=agenda` → `ProjectAgendaView` (398 linhas): cópia ~80%
     igual, **sem nenhum tratamento mobile** — no celular renderiza a grade de
     mês do desktop espremida dentro de uma aba. E é essa agenda que os links de
     WhatsApp abrem (avisos de falha, lembretes e o link que o MCP devolve
     apontam para `?tab=agenda`).
   - Divergências silenciosas entre as duas: a semana começa **segunda** no
     projeto e **domingo** na global; `parseRecurringConfig` e os helpers de
     range de mês/semana/dia estão duplicados.

2. **O celular é o argumento mais forte a favor das rotas.** No telefone o
   `PostPreviewModal` é um Dialog de `max-h-[90vh]` com até três modais
   empilhados por cima (reagendar, aprovar, melhorar com IA) numa tela de
   375px; o `PostComposer` é um formulário de 6 seções rolando **dentro** de um
   modal. Rota em tela cheia resolve os dois de graça.

3. **`useIsMobile()` é matchMedia pós-mount e nasce `false`** — o primeiro
   render é sempre desktop, mesmo no telefone, e depois pisca para mobile.
   Regra para as telas novas: **CSS responsivo primeiro** (breakpoints
   Tailwind); o hook fica só para diferenças estruturais grandes (montar ou não
   um drawer), nunca para o layout em si.

4. **O deep-link já existe enquanto gambiarra**: `?tab=agenda&postId=X` abre o
   composer via efeito + `router.replace` para limpar o parâmetro
   (`project-agenda-view.tsx:119-147`). É a prova de que estado na URL está
   sendo retrofitado — as rotas o tornam nativo.

5. **`PostMiniCard` do mês já mostra miniatura** (a linha "só chips de texto"
   do plano de 04/08 está desatualizada) — mas a arte é minúscula e a visão de
   grade com a arte grande continua não existindo.

6. **Rotas por projeto já são o padrão do repo**: `/projects/[id]/analytics`,
   `/creativos` e `/instagram` existem e herdam o shell (Sidebar + Topbar) do
   layout protegido. `/projects/[id]/agenda/*` entra no mesmo molde.

7. **`GET /api/projects/[id]/posts/[postId]` já existe** (o deep-link usa) — a
   tela do post não precisa de rota de API nova.

8. **A referência do desktop para a grade** é simples:
   `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` de `PostCard` com
   a arte no aspecto real (`aspect-[9/16]` ou `aspect-[4/5]`)
   (`SchedulerPage.tsx:172`). Grade assim é **naturalmente mobile**: no
   celular colapsa para 2 colunas sem código extra.

---

## 2. Rotas e estado na URL

```
/projects/[id]/agenda                  → a agenda (visões: mês | grade | mais as atuais)
/projects/[id]/agenda/novo             → criar post
/projects/[id]/agenda/[postId]         → a tela do post
/projects/[id]/agenda/[postId]/editar  → editar post (mesmo componente do novo)
```

Estado na URL, para o voltar/recarregar/compartilhar funcionarem:

```
?visao=mes|grade|semana|dia   &data=2026-08-08   &formato=STORY   &situacao=DRAFT
```

**Redirects permanentes** (links `?tab=agenda` vivem em mensagens antigas de
WhatsApp — gerados por `post-failure-notifier.ts`, `reminder-notifier.ts`,
`agendar.ts` e `scripts/mcp-server.ts`):

- `/projects/[id]?tab=agenda` → `/projects/[id]/agenda`
- `/projects/[id]?tab=agenda&postId=X` → `/projects/[id]/agenda/X`
  (hoje o `postId` abre o composer direto; a rota abre a **tela do post**, e
  editar fica a um toque — semântica mais segura para link recebido no celular)

Depois do deploy, os 4 geradores de link passam a emitir a URL nova.

---

## 3. As telas, com o mobile desenhado junto

### 3.1 Tela do post — `/agenda/[postId]`

O corpo do `PostPreviewModal` (923 linhas) é reaproveitado inteiro — badges,
janela de congelamento, avisos de rascunho/falha, melhorar com IA, polling de
publicação. Muda só a casca:

- **Desktop (≥1024px):** duas colunas — a arte à esquerda no formato real,
  info + ações à direita. Cabeçalho com voltar, cliente e horário.
- **Mobile:** uma coluna — arte no topo (largura cheia, aspecto real), infos
  abaixo, e **barra de ações fixa no rodapé** (`sticky bottom-0`) com as 2–3
  ações principais do estado (Aprovar / Publicar agora / Re-agendar); o resto
  no menu `⋯`. É o padrão de app que o Ciro pediu — nada de caçar botão no
  meio do scroll.
- Os sub-diálogos curtos **continuam modais** (reagendar, duplicar, aprovar,
  confirmar exclusão) — confirmação curta é onde modal é bom.
- Ganhos colaterais: o polling de "Publicando…" sobrevive à navegação (hoje
  morre junto com o modal que fecha), e o link do post pode ser mandado no
  WhatsApp.

### 3.2 Visão GRADE — a visão mobile por excelência

O equivalente do LISTA do desktop, agrupado por dia:

- `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, cards com a
  **arte no aspecto real** (4:5 / 9:16), hora, badge de situação e contador de
  carrossel. Cabeçalho de dia atravessando a grade ("Sexta, 8 de agosto").
- Base: evoluir o `mobile-post-card.tsx` — hoje ele é texto-first com thumb de
  64px; vira card arte-first compartilhado por todas as larguras. O visual de
  situação já resolvido nele (tracejado âmbar = rascunho etc.) é mantido.
- **No mobile a GRADE é a visão padrão** (2 colunas). No desktop é a terceira
  visão ao lado de mês/semana/dia.
- Clique no card → rota do post. Sem drag-and-drop na grade v1 (reagendar é
  pela tela do post ou pelo mês no desktop).
- A lista mobile da agenda global (`MobileAgendaListView`) é **substituída**
  pela grade — some um conjunto de componentes paralelos.

### 3.3 A agenda em rota — `/agenda`

- A aba "Agenda" do projeto vira **navegação** (`router.push`) para a rota; o
  conteúdo sai da `TabsContent`.
- Visões mês/semana/dia mantidas como estão no desktop, **mais** a grade. O
  seletor de visão passa a aparecer no mobile também (hoje é escondido e o
  celular fica preso numa visão só).
- Header responsivo por CSS: os filtros colapsam para o dropdown compacto que
  a global já tem — sem `isMobile` para layout.

### 3.4 Composer — `/agenda/novo` e `/agenda/[postId]/editar`

O formulário (796 linhas, muita regra: mídia com fila de enquadramento, IA de
legenda, recorrência) é mantido; muda a casca:

- **Desktop:** formulário à esquerda, **preview vivo à direita** no formato
  real declarado pelo tipo (4:5, 9:16, carrossel com slides) — como no
  desktop-app.
- **Mobile:** uma coluna; o preview vira um bloco colapsável (ou aba
  "Prévia"); **CTA fixo no rodapé** ("Salvar rascunho" / "Agendar").
- Os cards de tipo de post passam a declarar a dimensão
  (`Feed 1080×1350 (4:5)`), como no desktop.

### 3.5 Unificação global × projeto

Com as telas em rota, `ProjectAgendaView` e `AgendaCalendarView` passam a
compartilhar o miolo (a global é a mesma agenda com seletor de projeto e range
de semana unificado — **segunda-feira**, padrão BR). Helpers duplicados
(`parseRecurringConfig`, ranges) vão para `calendar-utils`.

---

## 4. Entregas, na ordem

Cada etapa é testada **nos dois tamanhos** (browser + resize mobile 375px)
antes de seguir — a lição da Fase 1 (3 defeitos achados só no teste visual).

| # | Entrega | O mobile ganha |
|---|---|---|
| 2.1 | Rota da tela do post + redirect de `?postId`; `PostPreviewModal` aposentado nas DUAS agendas | tela cheia com barra de ações fixa, no lugar da pilha de modais |
| 2.2 | Rota da agenda + visão GRADE + aba vira link + redirect de `?tab=agenda`; grade substitui a lista mobile global | a agenda do projeto finalmente existe no celular; grade 2 colunas com a arte |
| 2.3 | Composer em rota (novo + editar) com preview vivo | formulário de uma coluna com CTA fixo, sem modal |
| 2.4 | Unificação global/projeto + limpeza (componentes mobile paralelos, helpers duplicados, semana=segunda) | manutenção única — mexeu numa, valeu nas duas |

A 2.1 vem primeiro porque não depende de nada: a agenda continua na aba e só o
clique passa a navegar. A 2.2 é onde a URL da agenda nasce; 2.3 e 2.4 fecham.

---

## 4.1 Entrega 2.1 — feita e testada (08/08/2026)

No ar em desenvolvimento, verificado no navegador com sessão real, nos dois
tamanhos (1440×900 e 375×812) e em quatro estados de post.

- `src/app/(protected)/projects/[id]/agenda/[postId]/page.tsx` — a rota.
- `src/components/agenda/post-actions/post-detail-view.tsx` — o corpo, um só
  para a rota e para o modal.
- `post-preview-modal.tsx` foi de 923 para ~60 linhas: virou casca do mesmo
  componente. Sobreviveu porque existe um TERCEIRO consumidor que o estudo não
  tinha achado — o painel de agenda **dentro do editor de templates**, onde
  navegar sairia do editor e perderia o que não foi salvo.
- `src/hooks/use-post.ts`, `src/lib/agenda-routes.ts` (endereços num lugar só,
  para a 2.2 trocar `agendaHref` e todo mundo acompanhar).
- Semana começa na **segunda** em toda a agenda (`startOfWeek`/`getWeekRange`/
  `WEEKDAY_HEADERS` em `calendar-utils`, usados pelas duas agendas e pelas duas
  visões). Antes: projeto na segunda, global e calendários no domingo.

Decisões tomadas na implementação:

- **Ação não fecha a tela.** No modal tudo terminava em `onClose()`; aqui só
  excluir volta para a agenda. Como consequência a tela precisa recarregar o
  post sozinha — as mutações compartilhadas invalidam só as LISTAS, então
  `recarregarPost()` invalida `['social-post', id]` depois de cada ação.
- **O polling de "Publicando…" sobrevive** — no modal ele morria junto com o
  modal que a própria ação fechava.
- **A trilha de navegação do layout é escondida nesta rota** (o último item
  virava o cuid do post capitalizado, quebrando em 3 linhas no celular). Segue
  o padrão que `/projects/[id]/page.tsx` já usa, com restauração no unmount.
- **No celular a barra de ações tem só a ação principal + `⋯`.** A largura útil
  é de 261px (o shell aninha três paddings) e quatro botões não cabem: ou
  empilham em 173px de altura, ou se sobrepõem. Os secundários viram itens de
  menu com `sm:hidden`.

Defeitos encontrados no teste, nenhum visível ao typecheck:

1. **Botão Aprovar branco no tema escuro** — ver [[reference-tailwind-modificador-vence]].
2. **Cabeçalho e ações não grudavam**: o `glass-panel` do layout tem
   `overflow: clip`, e qualquer overflow ≠ `visible` num ancestral desliga o
   `position: sticky` dos descendentes. Trocado por altura definida + coluna
   flex com scroll no meio — imune ao ancestral.
3. **Pontos do carrossel viravam bolas de 44px**: o `globals.css` força
   `min-height/min-width: 44px` em todo `button` abaixo de 768px. O indicador
   passou para um `<span>` dentro do botão — alvo de toque preservado.
4. **Classes mortas** (margem negativa, `h-[calc(…-10rem)]`, `min-w-[7rem]`,
   `sm:inline-flex`) — ver [[reference-tailwind-classes-mortas]].

Não testado por falta de dado no branch de dev: **Melhorar com IA** (não há post
rascunho/agendado com `generationId` e fora da janela de congelamento).

## 4.2 Entrega 2.2 — feita e testada (08/08/2026)

- `src/app/(protected)/projects/[id]/agenda/page.tsx` — a agenda em tela cheia.
- `src/components/agenda/grade/post-art-card.tsx` e `agenda-grid-view.tsx` — a
  visão GRADE: arte no formato real, agrupada por dia, 2 colunas no celular e
  até 5 no desktop.
- `src/hooks/use-agenda-view-state.ts` — visão, data e filtros na URL
  (`?visao=grade&data=2026-08-08&formato=STORY&situacao=DRAFT&prazo=UPCOMING`),
  escritos com `replace` para não encher o histórico.
- A aba "Agenda" virou navegação; `?tab=agenda` e `?tab=agenda&postId=X`
  redirecionam. Os quatro geradores de link fora da UI
  (`post-failure-notifier`, `reminder-notifier`, `agendar.ts`, `mcp-server`)
  passaram a emitir a URL nova.
- **Removidos**: `mobile-agenda-list-view.tsx`, `mobile-day-group.tsx`,
  `mobile-post-card.tsx` — o conjunto paralelo que existia só para o celular.
  A grade os substitui nas duas agendas.
- O seletor de visão passou a aparecer no CELULAR (antes escondido abaixo de
  768px, deixando o telefone preso numa visão só). Ali aparecem GRADE e DIA;
  mês e semana continuam só no desktop, porque sete colunas não cabem em 375px
  — e, se o estado disser mês/semana, o celular cai na grade.

Decisões:

- **O card não repete ações.** O card inteiro leva à tela do post, onde tudo
  já mora. A lista mobile antiga tinha Aprovar/Preview/Editar no card, e cada
  botão era mais uma cópia de regra para manter em dia.
- **Sem arrastar-e-soltar na grade v1.** Reagendar é pela tela do post (ou
  pelo mês, no desktop).
- **A grade cobre o MÊS**, como a visão de mês — muda o desenho, não o período.

Defeitos encontrados no teste:

1. `capitalize` do Tailwind põe maiúscula em toda palavra: "Agosto De 2026",
   "Segunda-Feira, 27 De Julho". Trocado por `formatMonthYear`/`rotuloDoDia`.
2. Em 261px o nome do cliente quebrava no meio ("by.-rock") e o mês em três
   linhas ("Agos-to De 2026") — faltava `truncate`/`whitespace-nowrap`, e o mês
   virou abreviado no celular ("Ago 2026").
3. **`bottom-1.5` e `left-1.5` não geram CSS** (enquanto `top-1.5` e
   `right-1.5` geram): o logo do cliente ia parar em cima do horário. Trocado
   por `bottom-2`/`left-2`. Ver [[reference-tailwind-classes-mortas]].

**Causa raiz provável das classes mortas** (achada aqui, não corrigida): o
projeto roda **Tailwind v4.1.13** — `@import "tailwindcss"` e `@theme inline`
no `globals.css` — mas mantém um `tailwind.config.ts` no formato v3, com os
globs de `content`, **sem nenhum `@config` no CSS que o carregue**. Ou seja,
aquele arquivo é configuração morta e a varredura fica por conta da detecção
automática do v4. Vale investigar à parte: se for isso, um `@config` (ou
`@source`) resolve a família inteira de defeitos, que já custou tempo em três
sessões.

## 4.3 Entrega 2.3 — feita e testada (08/08/2026)

- `src/components/posts/post-composer-form.tsx` — o corpo do composer, sem
  casca. Toda a validação veio intacta (legenda obrigatória fora de story,
  carrossel de 2 a 10, reel só com vídeo, data no futuro, recorrência).
- `src/components/posts/post-live-preview.tsx` — a **prévia viva**: cabeçalho
  com o @ do cliente, a arte na proporção real, legenda cortada em 125
  caracteres como o Instagram faz, e a linha de quando sai.
- Rotas `/projects/[id]/agenda/novo` (aceita `?data=` do botão "+" do dia) e
  `/projects/[id]/agenda/[postId]/editar`.
- `post-composer.tsx` foi de 796 para ~75 linhas: virou casca de Dialog sobre o
  mesmo formulário, para o painel de agenda do editor de templates.
- Os cards de tipo agora **declaram a dimensão** (`Feed 1080×1350`), como no
  app desktop.

Decisões:

- **Salvar em "editar" volta para a TELA DO POST**, não para a agenda: quem
  edita quer conferir. Criar volta para a agenda.
- **A prévia começa RECOLHIDA no celular.** Aberta, um story em 9:16 toma a
  tela inteira e empurra o primeiro campo para baixo da dobra — medido. No
  desktop fica sempre à vista, na coluna da direita. O estado é um só e a
  diferença é CSS (`hidden lg:block`), nunca `useIsMobile`.
- **O formulário só é montado quando o modal abre.** É o que zera o estado
  entre aberturas, no lugar dos efeitos que faziam essa limpeza à mão a partir
  do `open`.

Ganho colateral: as rotas da agenda emagreceram, porque o composer saiu do
bundle delas — `/agenda` de 405 kB para 248 kB, a agenda do projeto de 377 kB
para 220 kB.

## 4.4 Entrega 2.4 — feita e testada (08/08/2026). Fase 2 completa.

`src/components/agenda/agenda-workspace.tsx` (289 linhas) é agora A agenda, e
as duas telas viraram cascas:

| | antes | depois |
|---|---|---|
| `agenda-calendar-view.tsx` (global) | 448 | **108** |
| `project-agenda-view.tsx` (cliente) | 398 | **49** |
| `post-preview-modal.tsx` | 923 | **64** |
| `post-composer.tsx` | 796 | **82** |

O que sobrou em cada casca é só o que de fato difere: a global tem a lista de
canais, a contagem de agendados e a gaveta do celular; a do cliente tem o
redirecionamento do `?postId` antigo. Ambas passaram a guardar visão, data e
filtros na URL.

Dois defeitos que a unificação expôs e corrigiu:

1. **A visão de MÊS desenha 42 células — inclui os dias do mês vizinho — mas a
   agenda global e o painel do editor buscavam só do dia 1 ao último.** Post
   marcado numa dessas células nunca aparecia. Visível no teste: 27 a 31 de
   julho passaram de vazios a 23, 33, 28, 25 e 13 posts na agenda global.
   `getMonthRange` (que preenche até a borda da semana) virou o padrão.
2. **A GRADE não pode usar o mesmo range.** Ela lista por dia, então trazer
   "27 de julho" debaixo de um cabeçalho que diz "Agosto de 2026" seria
   mentira — ela usa `getStrictMonthRange`. As duas bordas convivem de
   propósito em `getRangeForView`.

Limpeza: `parseRecurringConfig` tinha QUATRO cópias (as duas agendas, a rota de
edição e o painel do editor). A do painel era mais frouxa — inventava
"DAILY 09:00" quando o dado estava torto. Ficou a estrita, exportada de
`post-composer-form`. Os helpers de range saíram das telas para
`calendar-utils`.

Verificado no navegador: as duas agendas nas quatro visões, o painel de agenda
DENTRO do editor de templates (modal do post e composer modal — as duas
lacunas que a 2.3 tinha deixado em aberto), e a correção do range aparecendo
nos dois lugares.

## 4.5 Ajustes depois do teste em produção (08/08/2026)

Commit `f1c4d9d`, depois do `7b2d1ff` que subiu a Fase 2 inteira.

- **A GRADE virou a visão padrão** das duas agendas (`useAgendaViewState('grade')`).
- **A grade mostra de HOJE em diante** (`getGradeRange`): no dia 20, começar
  pelo dia 1 punha uma semana e meia de posts já publicados na frente do que
  interessa. Mês inteiramente no passado fica vazio por definição — a tela diz
  isso, senão parece que os posts sumiram.
- **Consequência a saber**: rascunho atrasado de dias anteriores deixa de
  aparecer na grade, e de contar no `DraftsBanner` enquanto ela estiver ativa.
  Continua na visão de mês e no filtro de atrasados.

Conferido em produção com um agendado real (`cmsggqblr…`, Seu Quinto, story de
09/08 às 20:00): a tela do post traz "Editável até 09/08/2026, 19:55" (5 min
antes, como manda a janela de congelamento), o "Melhorar com IA" aparece porque
o post tem Generation e não está congelado, e o "Editar Template" aponta para
`/templates/159/editor?pageId=cmsgfwvne…` — os mesmos ids que o banco guarda.

## 5. Armadilhas (do estudo + regras da casa)

- **`useIsMobile` nasce `false`** — layout por CSS; o hook só para montar/não
  montar estruturas (drawer). Senão o telefone pisca desktop a cada navegação.
- **`sm:max-w-*` obrigatório em modal** (§ 8 do plano de 04/08) — vale para os
  sub-diálogos que ficam. Aproveitar a passagem para corrigir os cinco que
  saem com 512px (rich-text, gerar-criativos, editor de imagem,
  comparar-melhoria, exportar).
- **Guard do PhotoSwipe** (`isPhotoSwipeOpen`/`wasPhotoSwipeJustClosed` no
  fechamento do modal): na rota, "fechar" é o back do navegador — testar que o
  back com o lightbox aberto fecha o lightbox, não a página.
- **Toda a lógica de negócio migra intacta**: janela de congelamento
  (`descreverJanela`), regras do melhorar com IA (só o slide visível,
  `applyToPostMediaIndex`), aviso de rascunho, `gerandoArte`. Reescrever nada.
- **Scroll restoration**: voltar da tela do post deve devolver à posição na
  agenda. Vindo da agenda, `router.back()`; entrando por link direto, o botão
  voltar faz `push` para `/agenda`.
- **Invalidação de cache**: as mutações invalidam `['agenda-posts']` — a tela
  do post deve ler do mesmo cache (seed pela lista + fetch por id), senão
  aprovar na tela e voltar mostra o estado velho.
- **Redirect é permanente**, não transitório — links `?tab=agenda` vivem em
  conversas de WhatsApp que ninguém apaga.
- **DnD de reagendar** usa `TouchSensor` com delay de 250ms no mês — não levar
  para a grade v1; no celular reagendar é pela tela do post.

## 6. O que NÃO fazer (herdado e reafirmado)

- Reescrever os corpos dos dois componentes grandes — casca nova, miolo
  intacto, um por vez.
- Criar um "modo mobile" paralelo novo — a Fase 2 **apaga** um conjunto
  paralelo (a lista mobile global); não nasce outro.
- Trocar mês/semana/dia por grade à força — a grade entra como opção (padrão
  no mobile), o resto fica.
- Bottom-tab-bar de app nativo, gestos de swipe entre telas, PWA — fora do
  escopo; é navegação com rotas, não um app novo.
