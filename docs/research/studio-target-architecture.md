# Menor arquitetura alvo (revista após a revisão adversarial)

> **PROPOSTA — ainda não implementada.** Nada nesta página existe no código, a não ser o que
> estiver marcado como CONFIRMADO, que descreve o código atual.

Proposta de 12/10/2026, revista no mesmo dia depois da revisão adversarial do Codex. O veredito
foi **needs-attention**, com quatro achados validados (ver a seção "Alterações após revisão
adversarial", no fim). Os números de linha foram conferidos em `137a1e7e` (`origin/main`, depois
do PR #202).

Rótulos: **CONFIRMADO** (no código, com caminho), **INFERIDO**, **DESCONHECIDO**.

## Princípio

O caminho é **reaproveitar o que o Studio já tem**. A primeira versão desta proposta reinventava
três peças que já existiam (a gravação com revisão, o executor de ajustes e o casamento por
papel). Esta versão parte delas.

```text
        UI (editor)                       MCP (porta única)
             │                                   │
             ▼                                   ▼
   rotas /api (PATCH da página,        handlers do catálogo
   PATCH da camada, PUT do template)   (ajustar-arte, criar-arte-de-modelo…)
             │                                   │
             └──────────────┬────────────────────┘
                            ▼
     operações de aplicação já existentes em src/lib
     (ajustarArte · createArteRapida · comporPeca · reverterCamadasDaArte)
                            │
         ┌──────────────────┼──────────────────────────┐
         ▼                  ▼                          ▼
  resolver alvo        aplicarAjustes             preenchimento
  (slotId → papel      (executor puro,            (bakeLayers + reflow
   único → id)          estendido)                 + autofix, POR VIA)
         └──────────────────┼──────────────────────────┘
                            ▼
              gravarCamadasComRevisao   ← página existente
              persistAndRenderCreative  ← página nova (inalterado)
                            │
                            ▼
    depois do commit: invalidateScheduledRenders + pedirRecomposicaoDaArteCongelada
```

**Adaptação ao desenho original.** O editor **não** passa por `aplicarAjustes`. Ele grava a
página inteira, e continua assim (migrar o editor para operações é P2). O que ele passa a
compartilhar com o MCP é a **gravação** (`gravarCamadasComRevisao`) e os **efeitos depois da
gravação**. `aplicarAjustes` é o executor das operações que **agentes** pedem.

---

## 1. Gravação: `gravarCamadasComRevisao` é a base

O que existe hoje (`src/lib/copy-autoral/persistir.ts:93`). CONFIRMADO.

| Aspecto | Como funciona |
|---|---|
| Compare-and-set | Relê a página a cada volta e grava com `updateMany where { id, updatedAt: base.updatedAt }`. Por padrão são 4 voltas. Esgotadas as voltas, lança `PAGINA_MUDOU_DURANTE` (409) e não grava nada. |
| Camadas | Recebe uma **função** `camadas(base)` calculada sobre a página **relida** (o PATCH de camada funde a camada editada na página atual, não na da leitura inicial). |
| `Page.copyAutoral` | `revisaoDaPaginaComCamadas` mede a revisão do contrato **na mesma escrita** das camadas. Se o contrato recusar (histórico cheio, copy que não cabe), as camadas vão, o contrato fica e um `aviso` volta. |
| Autoria | `quem: { autor, motivo, superficie }` vai para a revisão. Com `humana: true`, reconcilia a marca "escondida pelo revisor" contra a base relida. |
| Revisão | `reconciliarComAnteriores` reconcilia o contrato com as camadas anteriores, como revisão do sistema. |
| Dados extras | `dados` grava outros campos na mesma escrita (por exemplo `background`, `width`). |
| Transação | Recebe o `cliente` (o `db` ou a `tx` de quem chama). A transação é de quem chama. |
| Retorno | `{ camadas, base, revisao, aviso }`, onde `base` é a página **efetivamente substituída**, contra a qual se decide se o visual mudou. |

Quem já usa (CONFIRMADO):

- o PATCH de camada (`api/pages/[pageId]/layers/[layerId]/route.ts:82`);
- o PUT do template (`api/templates/[id]/route.ts:200`);
- `reverterCamadasDaArte` (`compositor/reverter.ts:48`).

Quem **reimplementa o mesmo laço** (CONFIRMADO; o próprio cabeçalho do módulo admite):

| Caminho | Onde | Diferenças |
|---|---|---|
| PATCH do editor | `api/templates/[id]/pages/[pageId]/route.ts:266-312` | Laço de CAS próprio; `invalidateScheduledRenders(tx)` **dentro** da transação |
| `ajustarArte` | `creatives/arte-rapida.ts:963` (o laço começa em `:1182`) | Laço próprio com `isTemplate: false` no `where` (recusa página-modelo); invalidação **fora** da transação, depois do render |
| Recomposição | `compositor/recompor.ts:543` | CAS próprio |

**Efeitos dentro e fora da transação, hoje:**

- **Dentro:** as camadas, o contrato e os `dados`. No PATCH do editor e no de camada,
  `invalidateScheduledRenders(tx)` também roda dentro no PATCH do editor, no PATCH de camada, no PUT do
  template e no `reverter`.
- **Fora, depois do commit:** `pedirRecomposicaoDaArteCongelada`, que enfileira um job, em todos
  os caminhos menos a própria recomposição. Em `ajustarArte` também `invalidateScheduledRenders(db)`,
  depois do render, e na recomposição `invalidateScheduledRenders(db)` quando ela recompõe.

**Proposta:**

1. Os três caminhos que reimplementam o laço passam a chamar `gravarCamadasComRevisao`. O
   `isTemplate: false` do `ajustarArte` vira uma opção de guarda, em vez de uma cópia do laço.
2. A **regra de efeitos** fica escrita num lugar só:
   - `invalidateScheduledRenders` roda na mesma transação **quando o chamador tem uma**;
   - `pedirRecomposicaoDaArteCongelada` roda **sempre depois do commit** (ela enfileira trabalho
     e não pode ser desfeita por rollback).
   - Uma função pequena `depoisDeGravarCamadas(pageIds, visualMudou)` cobre o "depois". Não é um
     mecanismo novo: ela junta as duas chamadas que hoje se repetem em cada caminho de gravação (PATCH da
     página, PATCH da camada, PUT do template, `reverter` e `ajustarArte`).
3. **A codificação de `Page.layers` não muda agora.** `gravarCamadasComRevisao` grava **string
   JSON** ("a forma da coluna"), e `lerCamadas` lê as três formas. A primeira versão desta
   proposta queria gravar array nativo, o que mexeria em todos os leitores. Fica como P2, e só
   com medição em produção.

---

## 2. `semanticRole` não é `slotId`

Quatro conceitos, um para cada pergunta:

| Conceito | Pergunta que responde | Hoje (CONFIRMADO) | Evolução |
|---|---|---|---|
| `layer.id` | Qual nó desta página? | Id físico. **É regenerado na duplicação** (`copy-autoral/duplicacao.ts`). | Inalterado |
| `layer.type` | Que tipo de desenho? | `text`, `image`, `logo`… | Inalterado |
| `semanticRole` | Que **função** cumpre na peça? | `metadata.compositor.papel` (`pre, headline, headline2, apoio, cta, servico`) | O mesmo campo, com vocabulário canônico ampliado com `foto` e `logo` |
| `slotId` | Qual **ocorrência editável** é esta? | Não existe. O que mais se aproxima: o id `<papel>-N` do compositor (`servico-2`) e `metadata.compositor.bloco` (o id do bloco do contrato da copy) | Uma marca nova na camada (`metadata.slot.id`), estável entre clonagens |

**O `slotId` é uma identidade lógica, local ao template ou à página.** Não é um id de banco nem
global. O `layer.id` é a identidade física da instância e pode mudar na duplicação; o
`metadata.slot.id` deve sobreviver a ela.

Exemplo:

```text
layer.id = "text-8f931"   semanticRole = servico   slotId = servico-endereco
layer.id = "text-17ca2"   semanticRole = servico   slotId = servico-horario
```

**Leitura com estado explícito.** Uma declaração inválida não pode sumir atrás de uma inferência
legada.

- O papel e o slot são lidos com três estados: `ausente`, `valido` e `invalido`. O papel válido
  diz também a origem: metadata, id ou nome legado, tipo ou id reservado.
- Um `metadata.compositor.papel = "servicoo"` numa camada de id `servico` sai **`invalido`**,
  não `servico`.
- O legado (`papelDaCamada`) continua funcionando como hoje nos consumidores antigos. A fundação
  nova só passa a **diagnosticar** a inconsistência.

**Por que o `slotId` mora numa marca e não no `layer.id`.** O Studio já resolveu isso uma vez. A
duplicação regenera os ids e, antes da troca, `materializarVinculosDoIdFisico` transforma em
marca na camada todo vínculo que dependia do id físico (papel e bloco). CONFIRMADO
(`copy-autoral/duplicacao.ts`, `copy-autoral/efetiva.ts`). O `slotId` segue a mesma regra desde o
início.

**`slotId` × `bloco`.** O `bloco` identifica um pedaço do **conteúdo** de uma peça (a copy
escrita). O `slotId` identifica um **lugar** do modelo. Numa peça gerada de um modelo, os dois
podem coincidir, mas não são a mesma coisa: o modelo existe antes de qualquer copy. INFERIDO; a
decisão final sai do primeiro PR.

### Cardinalidade esperada (expectativa, não validação)

| Cardinalidade | Significado | Papéis (default do vocabulário) |
|---|---|---|
| `ONE` | Espera-se uma ocorrência | `headline`, `logo`, `foto` (imagem principal) |
| `OPTIONAL` | Espera-se zero ou uma | `pre`, `headline2`, `apoio`, `cta` |
| `MANY` | Zero ou mais | `servico` |

São **defaults do papel**, não regra:

- **Uma página fora do esperado não é inválida.** Um modelo pode ter dois logos, duas fotos, mais
  de um CTA ou vários serviços.
- **A expectativa nunca recusa operação.** Ela serve para mensagens, testes e a descoberta
  pelos agentes. A recusa de ambiguidade vem da contagem **observada** na página (regra 2
  abaixo).
- **O template pode sobrescrever a expectativa** de um papel no futuro. A distinção é entre a
  **cardinalidade esperada** do papel e as **ocorrências observadas** na página.

Isso **não altera os tipos agora**. Começa como uma tabela no código, ao lado do vocabulário.

### Política para papéis repetidos

1. **Papel com uma única ocorrência na página:** uma operação endereçada pelo papel é aceita.
2. **Papel com várias ocorrências:** a operação **exige** `slotId` ou `layerId`. Endereçar só pelo
   papel é **recusado**, e a recusa lista as ocorrências pela identidade (`layerId`, `slotId`,
   papel, tipo, nome, visibilidade). Mostrar o conteúdo (um trecho do texto) é papel da camada de
   apresentação, depois de o acesso à página estar autorizado, não do resolvedor.
3. O sistema **nunca escolhe** entre duas camadas do mesmo papel: nem a primeira, nem a mais
   alta, nem a maior.
4. Preencher um papel `MANY` **não** escreve o mesmo conteúdo em todas as ocorrências. O valor de
   um papel `MANY` é uma **lista ordenada**, casada por `slotId`. Sem `slotId`, a operação é
   recusada pela regra 2. Isso já tem precedente: o leitor da copy devolve `servico` e
   `servico-2` "juntos, de cima para baixo" (`compositor/defasagem.ts:191`), mas isso é
   **leitura**; na escrita, a ordem visual não é contrato.

### Resolução do alvo (pura, estrutural, sem fallback legado)

Precedência explícita:

```text
A. layerId       → a instância física exata (id repetido na página = erro de integridade)
B. slotId        → exatamente uma camada; zero = SLOT_NOT_FOUND; mais de uma = SLOT_DUPLICADO
C. semanticRole  → uma ocorrência resolve; zero = ROLE_NOT_FOUND; mais de uma = AMBIGUOUS_TARGET
```

- **Nunca escolhe a primeira camada.**
- **Campos que discordam:** se o alvo traz mais de um campo e eles apontam para camadas
  diferentes, o resultado é erro.
- **Sem fallback legado.** O casamento antigo dos `slotValues` por id ou nome **não** entra na
  resolução nova. Ele continua funcionando, intocado, em `bakeLayers` e em `aplicarSlotNaCamada`
  (`posts/page-to-design-data.ts:85`).
- **O contrato semântico entra de forma aditiva.** É o que permite provar que nenhuma arte antiga
  mudou.

---

## 3. Vias de edição: contratos diferentes, sem pipeline universal

A primeira versão propunha um pipeline obrigatório bake → reflow → autofix para todas as vias.
**Isso estava errado.** Cada via tem um contrato próprio. CONFIRMADO linha a linha:

| Via | Entrada | Transformações | Reflow | Autofix | Persistência | Render | Invalidação |
|---|---|---|---|---|---|---|---|
| **compor** (`comporPeca`) | spec (copy por papel) + assinatura + foto | layout por blocos, a partir da área livre | não; o layout já nasce medido | **sim** (`compor.ts:1003`) | página **nova** (`persistAndRenderCreative`) | PNG na hora → `Generation` | não se aplica (página nova) |
| **ajustar-arte** (`ajustarArte`) | página existente + `slotValues` + `ajustes` + `versaoEsperada` | `bakeLayers` → reflow → `aplicarAjustes` | **sim**, mas **pulado** quando há ajustes sem troca de texto (`arte-rapida.ts:1066`) | **sim**, nas camadas trocadas e nas alteradas | CAS próprio, recusa modelo | PNG (`renderPageAndRegister`) | invalida e recompõe **fora** da transação |
| **criar-arte-de-modelo** (`createArteRapida`) | página-modelo + `slotValues` (ou `copyAutoral`) | clona as camadas → `bakeLayers` | **sim** (`:704`) | **sim** (`:708`) | página **nova** na pasta de arte | PNG na hora → `Generation` | não se aplica |
| **editor** (PATCH da página) | o array inteiro de camadas, vindo do cliente | nenhuma no servidor (o editor muta no browser) | no browser, ao editar combinações (INFERIDO) | **não** | CAS próprio + revisão inline | não renderiza; o render acontece depois, no cron | invalida **dentro** da transação e recompõe depois |
| **story/post agendado** (`renderStoryImage`) | página + `slotValues` do post (só se a página é modelo) | aplica os slots | **sim** (`story-renderer.ts:108`) | **não** | **não grava camadas**: grava `mediaUrls` do post | PNG no cron | — |
| criar do template (UI) | página-modelo + valores | clona e troca | **sim** | **não** | página nova (`page.create`) | não | não se aplica |

**Por que o autofix não pode ser universal.** No story agendado, o render acontece **minutos
antes de publicar**. Um autofix ali mudaria o corpo do texto de uma peça que a pessoa já viu e
aprovou, sem ninguém olhar o resultado. Lá, "não cabe" deve virar **aviso antes do agendamento**,
não correção silenciosa no render. INFERIDO; a decisão é da equipe.

### O que pode ser compartilhado com segurança

1. **A resolução do alvo** (seção 2), em toda via que recebe valores ou ajustes.
2. **O medidor de texto do servidor** (`createServerTextMeasurer`), que já é compartilhado.
3. **A gravação** de página existente (seção 1): editor, `ajustarArte` e recomposição.
4. **Os efeitos depois da gravação** (seção 1).
5. **A regra da troca de imagem**, um ponto só, chamado por `bakeLayers` e
   `aplicarSlotNaCamada`. Ao trocar o arquivo de uma camada de imagem:
   - zera o `style.crop` manual;
   - aplica `objectFit: 'cover'`, centralizado (ou o foco por assunto do compositor, quando a via
     o tiver);
   - preserva o contêiner: posição, tamanho, rotação, máscara, efeitos e ordem de empilhamento.
   - Hoje o crop da foto anterior vale para a nova, e sem `cover` a imagem estica
     (`image-fit.ts:25`). CONFIRMADO.

**O que fica por via, de propósito:** reflow, autofix, persistência (página nova × existente),
render e o momento da invalidação.

---

## 4. `aplicarAjustes`: o executor existente, a estender

`src/lib/creatives/revisao/aplicar-ajustes.ts:272`. Contrato em `revisao/contrato.ts:82`.
CONFIRMADO.

| Aspecto | Hoje |
|---|---|
| Natureza | Função **pura**: `(camadas, ajustes, { canvas, medir }) → { camadas, aplicados, recusados, alteradas }`. O medidor vem de fora. |
| Operações | `fonte` (corpo, escala, entrelinha), `mover` (dx, dy), `gradiente` (força e altura da borda, ou um gradiente por id), `visibilidade`, `caixa` (largura ou altura automática de **um** texto) |
| Endereçamento | Só por **id de camada** (`camadas: string[]`, até 40). O gradiente aceita id ou `borda`. |
| Recusas | Ajuste incompleto (`problemaDoAjuste`), camada inexistente, tipo errado (`fonte` e `caixa` só em texto; `gradiente` só em gradiente). **Nunca aplica pela metade.** |
| Reflow próprio | A pilha **da mesma coluna** acompanha o delta de altura, medido pelo **mesmo medidor** antes e depois; o elemento acompanha o seu texto (`elementoDe`). |
| Medição | Injetada. O `rich-text` é medido como texto simples. |
| Saída para o autofix | `alteradas`: as camadas cujo corpo, caixa ou entrelinha mudou. |
| Quem chama | Em produção, só `ajustarArte` (`arte-rapida.ts:1072`), que exige `versaoEsperada` quando há ajustes. Fora dela, o script `scripts/revisar-antes-depois.ts`. |
| Testes | `revisao/__tests__/aplicar-ajustes.test.ts` |

**Operações que faltam**, na ordem provável de necessidade:

1. cor do texto;
2. família da fonte;
3. alinhamento do texto;
4. ordem de empilhamento;
5. adicionar ou remover camada;
6. rotação;
7. efeitos.

Trocar texto e imagem **não** entra no executor: continua sendo `slotValues`, preenchimento,
porque já tem reflow e revisão de copy próprios.

**Direção:**

- **Estender `aplicarAjustes`, não criar outro executor.**
  1. O ajuste ganha os alvos `slot` e `papel`, além de `camadas`. A resolução é a da seção 2, com
     as mesmas recusas.
  2. Operações novas entram **uma a uma**, cada uma com teste, quando um caso real pedir.
  3. O retorno continua o mesmo: `aplicados`, `recusados` e `alteradas`.

---

## 5. MCP

- **O nível das tools já está certo.** `compor-arte`, `criar-arte-de-modelo`, `ajustar-arte` e
  `agendar-leva` são operações de intenção.
- A manipulação semântica chega ao agente pelo **`ajustar-arte` estendido** (alvos por papel e
  slot, mais operações). Não é preciso uma tool nova por operação.
- `listar-modelos` / `escolher-modelo` passam a devolver os **slots** de cada modelo: `slotId`,
  papel, tipo, cardinalidade e texto atual.

---

## 6. Prioridades revistas

A hipótese do Ciro foi confrontada com a auditoria. Ajustes feitos:

- **"Convergência dos caminhos críticos" fica estreita no P0.** Entram só os três laços de
  gravação de **página**. A convergência de **post** entre web e MCP (criar, cancelar, editar) é
  outra trilha e vai para o P1.
- **"Testes de regressão visual" não existem hoje.** Não há teste de pixel nem snapshot no
  repositório. O P0 pede **testes de caracterização** sobre o `Layer[]` de saída de cada via
  (posição, tamanho, conteúdo, papel), que são baratos e determinísticos. Comparação de pixel é
  P1.

### P0 (pequeno)

1. **Vocabulário semântico canônico:** `PAPEIS` + `foto` + `logo`, lido por **uma** função. O
   `papelDoNome` vira importador do legado.
2. **Identidade estável de slot:** a marca `metadata.slot`, preservada na duplicação como o papel
   e o bloco já são.
3. **Política de cardinalidade e de papéis repetidos** (seção 2): uma função de resolução do alvo,
   com recusa explícita.
4. **Preencher e ajustar usando esse contrato:**
   - `bakeLayers` e `aplicarSlotNaCamada` passam a usar a resolução comum;
   - `aplicarAjustes` aceita os alvos `slot` e `papel`;
   - a regra da troca de imagem fica num ponto só.
5. **Convergência da gravação de página:** PATCH do editor, `ajustarArte` e recomposição sobre
   `gravarCamadasComRevisao`, mais `depoisDeGravarCamadas`.
6. **Testes de caracterização** de cada via **antes** de mexer nela, e de copy (o contrato depois
   de cada gravação).

### P1

- Novas operações no `aplicarAjustes` (cor, família, alinhamento, ordem, adicionar e remover).
- O MCP devolve os slots dos modelos; `ajustar-arte` com alvos semânticos documentado para
  agentes.
- Registro de auditoria das chamadas MCP, na porta única.
- Idempotency key em `colocar-na-agenda` e `postar-agora` (o padrão `ItemDeLote` já existe).
- **Convergir a tool legada `prepare-creative`** do `scripts/mcp-server.ts` para o catálogo e a
  porta. Hoje ela chama `prepareCreative` sem `projetosVisiveis` (LOW 1 da verificação do PR #202).
- **`ProjectScope` explícito** (`{ type: 'all' } | { type: 'restricted'; ids }`) no lugar da
  convenção "ausente = acesso global" do `PrepareCreativeInput` (LOW 2 da verificação do PR #202).
- As demais divergências entre web e MCP (criar, cancelar, editar e reagendar post) e as 23 tools
  legadas restantes.
- Annotations corretas e escopo OAuth de leitura × escrita.
- Aviso de "não cabe" **antes** de agendar post de modelo, em vez de autofix no render.
- Comparação de pixel em algumas páginas de referência.
- Bugs do workflow da agenda (`FAILED` sem `handlePublishFailure`, as duas tabelas de status do
  Zernio).

### P2

- Scene graph hierárquico, frames e grupos com transformação.
- Constraints avançadas e redimensionamento inteligente entre formatos.
- Renderizador único.
- Vídeo e timeline no servidor.
- Editor movido a operações (undo por operação).
- Gravar `Page.layers` como array nativo.
- Papéis `preco`, `oferta` e `badge`, quando um modelo real pedir.
- Estados de aprovação e cancelamento do post (trilha da agenda).
- Resources e prompts do MCP.

---

## 7. Adoção em fases (planejada, ainda não implementada)

### PR A — fundação sem mudança de produção

Só arquivos novos em `src/lib/semantica/**`. Nenhum módulo de produção os importa.

- **Vocabulário:** reaproveita `PAPEIS_DO_COMPOSITOR` por import, mais `foto` e `logo`.
- **Leitores:** `lerSemanticRole` e `lerSlotId`, com estados explícitos.
- **Resolvedor:** `resolverAlvo`, puro, sem fallback legado.
- **Cardinalidade esperada:** informativa.
- **Descriptor puro** para a descoberta pelos agentes.
- **Testes:**
  - caracterização dos caminhos atuais, com fixtures **sintéticas** (nenhum dado de cliente, nem
    anonimizado);
  - um teste provando que a duplicação real regenera o `layer.id` e preserva o
    `metadata.slot.id`.

Não toca em `bakeLayers`, `aplicarSlotNaCamada`, `aplicarAjustes`, `gravarCamadasComRevisao`,
`ajustarArte`, `persistAndRenderCreative`, render, agenda, editor nem no schema.

### PR B — adoção (planejado depois do merge do PR A)

1. `slotId` reconhecido em `bakeLayers`.
2. `slotId` reconhecido no preenchimento da agenda.
3. Os descriptors na saída existente de `escolher-modelo`, sem tool nova.
4. A regra única de troca de imagem.
5. A integração com `aplicarAjustes`.
6. A migração progressiva dos modelos.

A convergência da gravação (P0-5) vem depois, com revisão do Codex, porque mexe na transação do
editor.

---

## Alterações após revisão adversarial

Revisão adversarial do Codex sobre a primeira versão (12/10/2026). Veredito **needs-attention**.
Os quatro achados foram conferidos no código e classificados como **VALIDADOS**.

| # | Finding | Classificação | Consequência | Mudança na proposta |
|---|---|---|---|---|
| 1 | A proposta de gravação ignorava `gravarCamadasComRevisao` e a revisão atômica de `Page.copyAutoral` | VALIDADO | Uma `gravarCamadasDaPagina` nova seria um quarto mecanismo de persistência, e sem a revisão do contrato na mesma escrita reabriria os bugs PR3-F01/F03 (camadas X com contrato Y) | `gravarCamadasComRevisao` vira a base. Os três laços que a reimplementam convergem para ela. A codificação de `layers` não muda agora (seção 1) |
| 2 | O papel não serve como identidade de slot, porque papéis se repetem | VALIDADO | `servico` e `servico-2` (`compositor/camadas-extras.ts:102`) quebrariam o endereçamento só por papel: o agente editaria a ocorrência errada | Papel e `slotId` separados, cardinalidade `ONE`/`OPTIONAL`/`MANY`, recusa quando o papel é ambíguo e `slotId` como marca preservada na duplicação (seção 2) |
| 3 | Não deve haver um pipeline universal bake → reflow → autofix | VALIDADO | As vias têm contratos diferentes. Um autofix no render do agendado mudaria uma peça já vista, e o `ajustarArte` pula o reflow de propósito quando há ajustes | Tabela das vias (seção 3); só cinco etapas declaradas compartilháveis; reflow e autofix ficam por via |
| 4 | `aplicarAjustes` já existe como executor puro | VALIDADO | Um `aplicarAjustes` novo duplicaria o executor e perderia os cuidados já revisados (mesmo medidor dos dois lados, pilha por coluna, `elementoDe`, entrelinha em dois campos) | Estender o existente: alvos `slot` e `papel`, operações novas uma a uma (seção 4) |
