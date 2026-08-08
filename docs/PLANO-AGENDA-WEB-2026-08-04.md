# Plano — trazer a fluidez do app desktop para a agenda web

**Data:** 04/08/2026
**Origem:** análise do app desktop (`desktop-app/`, Lagosta Tools v1.0.0) rodando,
comparado com a agenda web (`src/components/agenda/*`, `src/components/posts/*`).
**Prioridade definida pelo Ciro:** (1) enquadramento de imagem, (2) navegação.

---

## 1. O que o desktop faz

### 1.1 Navegação: uma tela por tarefa

`desktop-app/src/App.tsx` tem 8 rotas (`react-router`), todas em tela cheia dentro
de um `AppShell` com sidebar fixa. Criar post não é um modal — é a rota
`/new-post`, com **seta de voltar** no canto superior esquerdo, título ("Novo
Post") e subtítulo contextual ("Criar carrossel para Empório Fonseca"). Editar é
`/edit-post/:postId`. É o padrão de app de celular que o Ciro descreveu: clicou,
abriu tela, volta pela setinha.

### 1.2 Agendador: duas visões, ambas mostrando a ARTE

- **MÊS** — calendário com um chip por post: miniatura da arte + hora, colorido
  por situação (verde publicado, laranja agendado). Dá para ler a semana inteira
  de relance, vendo as fotos.
- **LISTA** — grade de cards grandes com a arte no formato real (4:5 no feed,
  9:16 no story), contador de carrossel (`1/5`), badge de tipo, badge de
  situação e a data por extenso. No hover aparecem editar e excluir.

Cabeçalho fixo: título, alternador LISTA/MÊS, botão de sincronizar e o CTA
laranja "+ Novo Post".

### 1.3 Novo Post: formulário à esquerda, preview vivo à direita

- **Tipo de post** em 4 cards que declaram a dimensão (`Feed 1080×1350 (4:5)`,
  `Story 1080×1920 (9:16)`, `Reel`, `Carrossel — até 10 imagens`).
- **Fonte da imagem** em abas: Local · Google Drive · Imagens IA · Criativos.
- **Legenda** com contador (0/2200) e "Gerar com IA".
- **Preview** numa coluna própria, sempre visível.

### 1.4 O enquadramento (`CropEditor.tsx`, 560 linhas)

Modal dedicado, aberto por imagem:

- Moldura na **proporção do tipo de post** (4:5 ou 9:16), travada.
- **Arrastar** a moldura reposiciona; **4 alças de canto** aproximam/afastam
  mantendo a proporção. O resto da foto fica esmaecido (60% preto) — dá para ver
  o que sobra.
- **Contador de pixels reais** no cabeçalho (`1440 × 1800 px`), que fica
  **vermelho** quando o lado maior cai abaixo de **1080px**, com o texto
  "— mínimo 1080px". É o guard-rail que impede publicar foto mole.
- Botões: "Centralizar" (reset), "Cancelar", "Aplicar Crop".
- A aplicação é **destrutiva e server-side**: `electron/ipc/image-processor.ts`
  faz `sharp.extract(região).resize(1080×1350, fit: cover)`. O arquivo original
  fica guardado em memória (`originalArrayBuffer`), o que permite **reenquadrar
  quantas vezes quiser** sem perda acumulada.

---

## 2. O que a web tem hoje

| | Desktop | Web |
|---|---|---|
| Criar post | rota `/new-post`, tela cheia, voltar | `PostComposer` — `<Dialog>` de 791 linhas |
| Ver post | rota `/edit-post/:id` | `PostPreviewModal` — 923 linhas, com modais dentro |
| Visões da agenda | Mês + Lista (arte grande) | Mês + Semana + Dia (só chips) |
| Enquadramento | editor dedicado, por imagem | **não existe** |
| Grade com a arte | sim (LISTA) | só no mobile, em componentes separados |
| Estado na URL | sim (rotas) | não (state local do componente) |

### 2.1 O buraco do enquadramento

`src/lib/images/client-resize.ts` → `resizeToInstagramFeed()` corta a imagem
**no centro, em silêncio**, para 1080×1350, via canvas. E só no upload **local**
(`local-file-uploader.tsx`). As outras três abas — Google Drive, Imagens IA,
Criativos — passam a URL adiante **sem tratamento nenhum**.

Consequência prática: foto na horizontal vira um quadrado do meio da cena; prato
que estava embaixo some; e ninguém é avisado. Quem percebe, percebe no
Instagram.

Existe um `POST /api/tools/process-image` com `sharp` (`fit: cover`,
`position: 'attention'` — corte "inteligente"), mas ele é usado só por
`src/components/tools/scheduler/ImageUploader.tsx`, fora do fluxo da agenda.

### 2.2 Por que o desktop parece mais fluido

Quatro causas concretas, todas reproduzíveis na web:

1. **Uma tela por tarefa.** Modal empilhado (preview → composer → date picker →
   confirmação) obriga a decorar de onde se veio. Rota tem voltar, scroll
   próprio e foco inteiro.
2. **Estado na URL.** Dá para recarregar, voltar pelo botão do navegador e
   mandar o link do post para alguém.
3. **Densidade visual certa.** A agenda mostra o produto (a arte), não linhas de
   texto sobre a arte.
4. **Compromisso declarado antes do commit.** O tipo diz a dimensão, o preview
   mostra o resultado, o contador diz se a resolução aguenta.

---

## 3. FASE 1 — Enquadramento (prioridade)

**Objetivo:** ninguém publica foto cortada por acaso. Toda imagem que entra num
post tem enquadramento escolhido por gente, ou herdado de um padrão explícito.

### 3.1 Regras de produto

- **Sem fricção quando não precisa**: imagem que já está na proporção do alvo
  entra direto, sem abrir nada.
- **Fora da proporção abre o enquadramento**, com três caminhos:
  - **presets** — Centro · Topo · Base · Automático (o `position: 'attention'`
    do sharp acha o assunto);
  - **ajuste livre** — arrastar e aproximar, como no desktop;
  - **aceitar o padrão** — um clique em "Usar centro" e segue.
- **Carrossel usa UMA proporção para todos os slides** (é regra do Instagram): o
  alvo é escolhido uma vez e cada slide tem o seu enquadramento dentro dele.
- **Piso de 1080px** no lado maior, com o mesmo aviso vermelho do desktop.
- **Reenquadrar depois**: guardando o original, o post agendado pode ser
  reenquadrado sem perda acumulada.

### 3.2 Arquitetura

**Componente** `src/components/posts/crop/crop-dialog.tsx` — controlado e
agnóstico da fonte: recebe `src`, `targetRatio` e `originalSize`; devolve
`{ left, top, width, height }` em px da imagem original. Toda a lógica de
geometria pode ser portada do `CropEditor.tsx` do desktop (é DOM puro, sem
Electron), corrigindo de passagem o que lá está torto: o `handleTouchMove`
ignora `cropSize` e recalcula pela altura, então no toque a moldura pula depois
de um zoom.

**Aplicação do corte** — dois caminhos, pela origem da imagem:

- **arquivo local** → canvas no cliente. Estender `client-resize.ts` para
  aceitar `cropRegion` (a função já faz exatamente essa conta, só que fixa no
  centro). Sem round-trip, sem subir o arquivo cru.
- **URL (Drive, IA, Criativos)** → server-side com `sharp`. Estender
  `/api/tools/process-image` para aceitar `sourceUrl` + `cropRegion`, ou criar
  `/api/posts/media/crop`. Devolve a URL nova no Blob.

**Ponto de entrada único**: `media-upload-system.tsx` — as 4 abas já convergem
ali. Cada card de mídia (`sortable-media-item.tsx`) ganha a ação "Enquadrar".

**Persistência para reenquadrar depois**: hoje `SocialPost.mediaUrls` é
`String[]` e não há onde guardar nem o original nem a região. Proposta:
`SocialPost.mediaMeta Json?` — array paralelo a `mediaUrls` com
`{ originalUrl, cropRegion, targetRatio }`. Migration **escrita à mão** +
`npm run db:deploy` (regra da casa: `migrate dev` contra produção pede reset).

### 3.3 Entregas, na ordem

| # | Entrega | Fecha o quê |
|---|---|---|
| 1.1 | `CropDialog` + enquadramento no upload **local**, substituindo o corte silencioso | o caso mais comum e o pior (corte invisível) |
| 1.2 | Enquadramento nas outras 3 abas, via sharp server-side | Drive/IA/Criativos param de entrar sem tratamento |
| 1.3 | `mediaMeta` + botão "Reenquadrar" no preview do post agendado | conserto sem refazer o post |

### 3.4 Armadilhas conhecidas (do próprio repo)

- **Post congelado** (`laterPostId` não nulo) não aceita troca de arte — o botão
  de reenquadrar precisa respeitar a janela de 5 minutos, como a melhoria com IA
  já faz (`descreverJanela`).
- **Nunca reduzir `mediaUrls`** — a invariante que a melhoria com IA acabou de
  ganhar (04/08) vale igual aqui: reenquadrar um slide troca **uma** posição.
- **Blob órfão**: cada reenquadramento cria um arquivo novo. Ou limpa o
  anterior, ou entra na varredura periódica.
- **`renderStatus`**: imagem enviada de fora é `NOT_NEEDED`. Reenquadrar não
  pode ressuscitar o post para o cron de render.

---

## 4. FASE 2 — Navegação e organização (depois do crop)

> **Detalhamento em 08/08/2026**: `PLANO-AGENDA-WEB-FASE2-2026-08-08.md` —
> estudo do código das duas agendas + mobile integrado em cada etapa. Esta
> seção fica como registro da ideia original.

### 4.1 Rotas no lugar de modais

Hoje a agenda é uma aba (`?tab=agenda`) e toda ação é modal. Proposta, usando o
App Router (o "abre tela nova com setinha" vira `router.push`, e o voltar do
navegador funciona de graça):

- `/projects/[id]/agenda` — a agenda em tela cheia
- `/projects/[id]/agenda/novo` — composer em tela cheia
- `/projects/[id]/agenda/[postId]` — o post em tela cheia

Modal fica só para confirmação curta (excluir, aprovar, cancelar) — que é onde
modal é bom.

Migração por tela, não de uma vez: `PostPreviewModal` (923 linhas) e
`PostComposer` (791) viram páginas reaproveitando o mesmo corpo, com a casca
trocada.

### 4.2 Terceira visão: GRADE

Além de mês/semana/dia, uma visão de grade com a arte grande — o equivalente do
LISTA do desktop, que é o que dá para bater o olho e aprovar. O
`mobile-post-card.tsx` já é quase isso e pode virar a base compartilhada.

### 4.3 Composer com preview vivo

Duas colunas: formulário à esquerda, preview no formato real à direita (4:5,
9:16, e o carrossel com os slides). Os cards de tipo declaram a dimensão, como
no desktop.

### 4.4 Unificar mobile e desktop

Hoje são dois conjuntos de componentes (`agenda/mobile/*` vs `agenda/calendar/*`).
Com telas em rota e a visão de grade, o mobile passa a ser a mesma tela em outra
largura.

---

## 5. O que NÃO fazer

- **Portar o Electron como está.** O crop dele depende de `sharp` local e do
  arquivo em memória; na web a metade das imagens é URL remota.
- **Trocar todos os modais por rotas de uma vez.** São ~1.700 linhas em dois
  componentes, cheias de regra de negócio (janela de congelamento, melhoria com
  IA, aprovação). Uma tela por vez, com a lógica intacta.
- **Enquadramento não destrutivo no publicador.** O Zernio recebe URL pronta;
  guardar só a região exigiria um passo de render no meio da publicação — mais
  uma coisa para falhar 5 minutos antes do post.

---

## 6. Decisões tomadas (Ciro, 04/08/2026)

1. **Reenquadrar depois: NÃO por enquanto.** Sem coluna nova, sem migration. A
   Fase 1 entrega escolha de enquadramento **na criação**; errou, refaz a mídia
   do post. Se doer na prática, a entrega 1.3 volta para a mesa.
2. **Padrão é o CENTRO**, com a maior área possível — previsível, e é o mesmo
   resultado do corte automático de hoje, só que agora visto antes de aplicar.
3. **O piso de 1080px trava o zoom, mas não trava o botão** quando a foto
   ORIGINAL já é menor que 1080 no lado maior: ali não existe enquadramento
   válido, e travar só impediria de usar a foto. Nesse caso o aviso explica que
   o Instagram vai esticar.

## 7. Estado da implementação

**Fase 1.1 — feita** (04/08/2026):

- `src/components/posts/crop/crop-dialog.tsx` — o enquadramento. Moldura travada
  na proporção, arrastar para posicionar, 4 alças com a borda oposta parada,
  grade de terços, contador de pixels reais, "Centralizar" e — na fila de várias
  imagens — "Usar o centro nas demais".
- `src/lib/images/client-resize.ts` — `POST_TYPE_DIMENSIONS`, `readImageSize` e
  `cropToPostType` (recorta e entrega no tamanho final; sem região, corta pelo
  centro como antes).
- `src/components/posts/local-file-uploader.tsx` — o upload local passa pela
  fila de enquadramento. Vídeo nunca; imagem já na proporção também não (não
  haveria o que escolher).
- `media-upload-system.tsx` passa o `postType`; REEL fica de fora (só vídeo).

**Fase 1.2 — feita** (04/08/2026):

- `POST /api/posts/media/crop` — recorte com `sharp` para mídia que já está numa
  URL (Criativos, Imagens IA, Drive). Só aceita host do nosso Blob (senão a rota
  vira proxy de SSRF), clampa a região antes de extrair e devolve um arquivo
  NOVO — a arte de origem não é alterada, então o mesmo criativo pode ir para
  dois posts com enquadramentos diferentes.
- Botão **Enquadrar** em cada mídia selecionada (`sortable-media-item.tsx`),
  escondido em vídeo e em upload local (esse já foi recortado antes de subir).
- `media-upload-system.tsx` preserva o recorte quando o seletor de criativos
  reporta a lista inteira — sem isso, marcar outro criativo devolvia a arte
  original por cima da recortada.

**Testado ponta a ponta em 04/08/2026** (navegador, sessão real):

| Caminho | Resultado |
|---|---|
| Upload local 2400×1200 → feed | saiu 1080×1350 com EXATAMENTE a região escolhida (conferido por amostragem de cor) |
| Arrastar a moldura | trava na borda da foto (parou em 791px de 791 disponíveis) |
| Aproximar pela alça | parou em **864×1080 px** — o piso de 1080 no lado maior |
| Proporção durante o gesto | 0.8000 constante (4:5) |
| Criativo 2160×3840 (story) → carrossel | `enquadrado-*.jpg` 1080×1350; a faixa do topo bate **pixel a pixel** com o topo do original |

Três defeitos encontrados e corrigidos NO teste (nenhum apareceria no
typecheck): as quatro alças empilhadas num canto, a moldura sem os terços, e o
modal crescendo 2.500px de altura com foto em pé. Ver § 8.

**Falta:** a Fase 2 (navegação).

## 8. Armadilhas de Tailwind descobertas no caminho

Três classes que aparecem no `class` do elemento e **não geram CSS nenhum**
nesta build — todas viraram `style` inline no `crop-dialog.tsx`:

- `-left-2.5` / `-top-2.5` / `-right-2.5` / `-bottom-2.5` (inset negativo)
- `left-1/3` / `top-1/3` (inset fracionário)
- `h-[86dvh]` / `max-h-[86dvh]` (unidade `dvh` em valor arbitrário)

O caso do `dvh` é o pior porque falha em silêncio DUAS vezes: a classe não gera
regra **e** o `tailwind-merge` descarta o `max-h-[calc(100dvh-2rem)]` do
`DialogContent` base por considerá-lo conflitante — o modal fica sem teto de
altura nenhum.

**`sm:max-w-*` é obrigatório em modal.** O `DialogContent` base declara
`sm:max-w-lg`; regra com media query vence regra sem, então qualquer
`max-w-[1400px]` cru é ignorado em tela ≥640px. Estavam todos saindo com 512px:

| Componente | Declarado | Saía com |
|---|---|---|
| `post-composer.tsx` | `max-w-[1400px]` | 512px — **corrigido** |
| `crop-dialog.tsx` | `max-w-4xl` | 512px — **corrigido** |
| `rich-text-editor-modal.tsx` | `max-w-[95vw]` | 512px |
| `generate-creatives-modal.tsx` | `max-w-4xl` | 512px |
| `image-editor-modal.tsx` | `max-w-4xl` | 512px |
| `compare-improvement-dialog.tsx` | `max-w-3xl` | 512px |
| `export-modal.tsx` | `max-w-3xl` | 512px |

Os cinco últimos seguem estreitos — é um `sm:` em cada, mas muda a cara de telas
que o Ciro não pediu para mexer hoje.
