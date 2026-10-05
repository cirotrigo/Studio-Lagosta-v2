# Modelos (templates) e curadoria

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Página nasce CONTEÚDO; modelo é promoção deliberada (10/08/2026)

`Page.isTemplate = true` significa "layout reutilizável do cliente" e é o que
enche o pool que `prepareCreative` (`arte-rapida.ts`, escolhe `candidates[0]`),
`sugerirPosts` (modeloDoDia) e `listar-modelos` consultam. O default do schema
é `false` — quem grava `true` está cadastrando acervo, não salvando uma arte.

- **A tool `create-page` do MCP local marcava MODELO por default** (`?? true`),
  e a skill `create-template-pages` a usa para montar as peças da semana: toda
  arte datada virava candidata permanente. Era a origem estrutural da poluição
  que forçou a despromoção de 22 modelos em 10/08. Hoje o default é `false` e a
  promoção é explícita (`isTemplate: true`) ou posterior (`marcar-como-modelo`).
- **Quem cria Page com `isTemplate: true` de propósito**: `create-template` do
  MCP local (existe para cadastrar layout temático) e
  `POST /api/projects/[id]/modelos` (o "criar modelo" da UI). Todo o resto —
  editor, duplicar, `persist.ts`, `arte-enviada.ts`, `create-from-template`,
  `gerar-criativo/finalize` — cria conteúdo, explícita ou implicitamente.
- **Nada exige que a página seja modelo para virar post**: `get-template-pages`
  não filtra por `isTemplate` e `create-post`/`render-story` não olham o campo.
  Quem filtra é só o acervo (`plan-week`, `prepare-creative`, `sugerir-posts`,
  `model-pages`, `template-pages`), que é justamente o que se quer limpo.
- **Modelo não pode ser apagado pela UI** (`DELETE` de página devolve 403
  `template_page`): conteúdo marcado por engano fica preso até ser despromovido.
- Curadoria do que já existe é outra frente, com aprovação item a item:
  `scripts/inventario-uso-modelos.ts` — **despromover, nunca excluir**.

### Modelo sem dia declarado é CURINGA da semana (16/08/2026)

`casaComDia` só dá match quando o texto CONTÉM o nome do dia, e não havia
curinga: modelo genérico só aparecia na sugestão se declarasse um dia.
`escolherModeloDoDia` (`src/lib/posts/dia-semana.ts`) resolve — ESPECÍFICO
primeiro, curinga como reserva.

- 🔴 **Tirar a tag do dia NÃO libera o modelo — REMOVE ele da sugestão.** Foi
  o que quase se fez com os "Story base (3 layouts)" de TERO e Wine Vix, que
  tinham `quinta` carimbada justamente porque era a única forma de aparecer.
  Medido antes de gravar: sem `quinta` e sem curinga, os dois clientes caíam de
  2 dias cobertos para 1 e não ganhavam nenhum outro. A saída é CÓDIGO, e o
  script de dado (`liberar-modelo-base-de-dia-fixo.ts`) só é seguro DEPOIS
  dele. Cobertura real depois dos dois: TERO 1→7, Wine Vix 1→7, By Rock 3→7.
- **A prioridade mora no módulo puro, não em quem chama**: `sugerirPosts` e o
  inventário de curadoria (`scripts/inventario-uso-modelos.ts`) PRECISAM casar
  do mesmo jeito — divergir despromove um modelo que a sugestão ainda enxerga,
  e o dia some em silêncio. É a mesma razão pela qual `casaComDia` já morava
  lá.
- 🔴 **O curinga recebe UMA chave de cobertura (`dia:*`), nunca as sete.** Com
  sete ele viraria "único cobridor" de todo dia e a proteção contra chave órfã
  nunca o deixaria ser despromovido. `dia:*` é o que ele é — a reserva — e
  perder o último curinga do cliente tira a reserva de todos os dias.
- **A query de modelos ganhou `orderBy` (`usedCount asc, name asc`).** Ela não
  tinha nenhum, então "o primeiro que casa" dependia da ordem do Postgres — com
  dois modelos do mesmo dia (o By Rock tem dois de sábado e dois de terça) a
  escolha era arbitrária. O curinga amplia isso de um dia para todos os sem
  específico. `usedCount` é `Int` não-nulo: a armadilha do `ASC` ser NULLS LAST
  vale para `lastUsedAt`, não aqui.
- `modeloSugerido` carrega `curinga: boolean` — quem monta a proposta não pode
  dizer "o modelo de sábado" sobre um layout de base.

### Tag de tema de modelo: o vocabulário vem dos PILARES (16/08/2026)

- 🔴 **Tag de DIA não serve para busca por tema, e era o que 8 dos 20 modelos
  tinham de único.** `prepareCreative` casa o tema pedido contra
  `Page.tags` + `Template.tags` e FALHA quando nada bate; o dia já é resolvido
  por outro caminho (`casaComDia`, que lê o NOME da página e do template). Ou
  seja: a tag de dia era redundante E deixava o modelo inalcançável por
  assunto. Corrigido por `scripts/taguear-modelos-sem-tema.ts`, com as tags
  lidas da copy real de cada arte, declaradas uma a uma. "Só dia" caiu de 8
  para 0; alcançáveis por tema subiram de 6 para 14.
- **O vocabulário de tema NÃO se inventa: são os pilares.** `ContentPillar` já
  é "a taxonomia fechada de temas de UM cliente", com slug normalizado e
  aprovada por gente. `scripts/semear-tags-de-tema.ts` leva os slugs aprovados
  para `ProjectTag` (a sugestão do TagInput) — 53 tags em 9 clientes. Um
  segundo vocabulário de temas recriaria o problema que os pilares vieram
  resolver ("happy hour" e "drinks" em baldes diferentes).
- **`ProjectTag` é só autocomplete** — semear não muda busca de ninguém. Quem
  casa modelo com tema é `Page.tags` + `Template.tags`.
- **Os dois vocabulários foram alinhados** (`scripts/alinhar-tags-aos-pilares.ts`,
  16/08): 7 modelos ganharam o slug do pilar ao lado da tag própria.
  ACRESCENTA, nunca substitui — `ribs` e `barbecue` continuam, porque alguém
  vai pedir "o story de ribs" e `prepareCreative` casa por `includes`; as duas
  portas levam à mesma arte. O script confere que o slug é pilar APROVADO
  daquele cliente antes de gravar: sem isso, um erro de digitação vira tag
  órfã que busca nenhuma alcança.
- 🔴 **Os 6 "Story base" ficam FORA do alinhamento, de propósito.** São
  CURINGA da semana; dar tema a eles os prenderia a um assunto — o mesmo erro
  da tag `quinta`, desfeito no mesmo dia.
- 🔴 **O gargalo não são as tags, são os MODELOS**: medido depois do
  alinhamento, só **9 dos 30 pilares aprovados têm algum modelo**
  (Wine Vix: 0 de 6; TERO: 1 de 7; O Quintal: 1 de 6; By Rock: 5 de 6). Pedir
  "story de harmonização" no Wine Vix não acha modelo e cai na geração por IA
  — o que funciona, mas custa crédito e não usa a diagramação aprovada da
  marca. Tag nova não resolve isso; modelo novo resolve.
- ⚠️ **Fica aberto**: `ProjectTag` tem lixo herdado (dia da semana, `Template`,
  `Página 1`, `Quarta-feira (Cópia)`) — limpar é destrutivo e não foi feito. E
  dois modelos não têm pilar correspondente (By Rock "Delivery", sem pilar de
  delivery; Wine Vix "Página 1", copy genérica) — inventar encaixe seria pior
  que a divergência, já que a taxonomia é fechada por decisão da F2.

### Promover página a modelo voltou ao editor (16/08/2026)

O editor ganhou o botão **Marcar modelo** (header no desktop; dentro do menu
"O que você quer fazer?" no celular) — um popover com o switch de
`Page.isTemplate` **e** as tags de tema no MESMO lugar. Componente em
`src/components/templates/page-model-control.tsx`.

O que havia antes: a única porta WEB para `isTemplate: true` era
`POST /api/projects/[id]/modelos`, que CRIA um modelo em branco. Página já
desenhada não tinha como ser promovida — a aba Modelos lista só
`isTemplate: true` (`/api/templates/[id]/template-pages`), então a página comum
nunca aparecia lá nem para virar modelo, nem para receber tag. Promover uma
arte existente só dava pelo MCP.

- 🔴 **O botão não estava faltando: foi REMOVIDO de propósito** no commit
  `10fd26f0` (09/05/2026), com a justificativa "Modelos created via the new
  flow are born with isTemplate=true; the toggle was confusing". A premissa
  valia para modelo criado do zero e deixou órfã a PROMOÇÃO. Ficaram três
  órfãos vivos: `ToggleTemplateButton`, `useToggleTemplate` e a rota PATCH —
  hoje os dois últimos voltaram a ter dono. O componente antigo em
  `src/components/template/` (SINGULAR) segue morto; o editor vivo é
  `src/components/templates/` (PLURAL), e a semelhança já produziu
  diagnóstico errado.
- **Switch e tags moram JUNTOS porque modelo sem tag não é achado por tema**:
  `prepareCreative` casa o tema contra `Page.tags` + `Template.tags` e FALHA
  quando nada bate. Separar os controles produz o "modelo mudo" que forçou a
  despromoção em massa de 10/08. A ordem é imposta pelo código — a rota de
  tags exige `isTemplate: true`, então o campo só destrava depois de marcar.
- **Promover é CURADORIA, não edição.** A rota `toggle-template` usava
  `hasTemplateWriteAccess` (qualquer membro da org) enquanto as outras portas
  (`/modelos`, `.../tags`) exigem `hasProjectOwnership`. Com o botão escondido
  era latente; exposto, vira porta lateral — o membro promove pelo editor e
  toma 403 ao taguear, deixando no pool exatamente o modelo sem tag. Gate
  alinhado; a UI lê o mesmo `canCurate` de `GET /api/projects/[id]`.
- **Estado de UI derivado de `Page` depende do CONTEÚDO do campo, não da
  REFERÊNCIA — e quem segura isso hoje é a biblioteca, não o nosso código.**
  O autosave chama `useUpdatePage({ skipInvalidation: true })`, que SUBSTITUI o
  objeto inteiro da página no cache `['pages', templateId]` (`use-pages.ts:145`)
  pela resposta do PATCH, a cada pausa da digitação no canvas. Um efeito com a
  referência do array na dependência remontaria o rascunho a cada autosave —
  apagando as tags sendo escritas e o botão "Salvar tags" junto. **Medido: isso
  NÃO acontece hoje**, porque o `replaceEqualDeep` do `@tanstack/query-core`
  (structural sharing, `query.js:61`) preserva a referência quando o conteúdo é
  igual. A proteção é frágil por depender de a rota nunca parar de mandar
  `tags`: sem o campo, `?? []` cria array novo a cada render e o wipe volta.
  Por isso a dependência é `JSON.stringify` do conteúdo.
- 🔴 **`['pages', templateId]` e `['template-pages']` são caches DIFERENTES da
  mesma verdade.** O hook de tags invalida o segundo (aba Modelos); o editor lê
  o primeiro. Sem escrita cirúrgica no `['pages']`, reabrir o popover sem
  recarregar mostrava as tags ANTIGAS — o popover desmonta ao fechar e
  reconstrói o rascunho desse cache. Invalidar sairia caro: refetch de
  `['pages']` traz todas as páginas COM layers só por causa de uma lista.
- **A invalidação de `['template-pages']` passou a ser por PREFIXO.** A aba
  Modelos consulta um endpoint que devolve as páginas de TODOS os templates do
  projeto, mas cacheia sob o id do PRIMEIRO (`seedTemplateId`); promover página
  de outro template não invalidava essa entrada.
- 🔴 **`side="bottom"` do `SheetContent` é `h-auto` SEM teto nem rolagem**
  (`ui/sheet.tsx:69`). Conteúdo novo em sheet de baixo empurra opções para fora
  da tela em aparelho baixo. Teto e scroll vão no USO, nunca no componente
  compartilhado.
- **Fora do `agendaMode` nos dois layouts**: ali o editor é o ajuste rápido de
  UM post vindo da agenda. O ramo mobile não tem esse if, então expor sem
  guardar divergia celular × desktop.
- **A tool `marcar-como-modelo` do MCP recebeu o MESMO gate** (16/08/2026):
  `assertCuradorDoProjeto`, ao lado de `assertProjetoPermitido`. Ver o bloco
  abaixo — ENXERGAR um cliente e mandar na curadoria dele são portas
  diferentes, e só a primeira existia no conector.
