# Plano — Empilhamento das combinações de texto (reflow pela âncora)

> **Status 28/07/2026**: fases 1–4 implementadas e verificadas server-side
> (invariantes + PNGs antes/depois com a combinação "Título + detalhes" do
> Espeto). Pontos de preenchimento cobertos: arte-livre, arte-rápida,
> story-renderer (render agendado) e create-from-template. Reflow reativo do
> editor implementado, aguardando verificação visual pós-deploy. Combinações
> ancoradas perto da BASE do canvas ainda crescem para baixo (podem estourar
> com texto muito longo) — pilha com âncora bottom é o refinamento pendente.

Objetivo: combinações de texto sempre ajustadas independentemente do tamanho do
texto aplicado — texto ancorado no topo cresce para baixo e os elementos abaixo
acompanham a quebra de linha. Vale para o editor E para as automações de IA que
preenchem os campos (arte-rápida, arte-livre, content-planner).

## Diagnóstico (28/07/2026)

O problema NÃO é a caixa individual — é a ausência de fluxo entre as caixas:

1. **`buildComboLayers` cria as camadas com `autoExpand: false`** (decisão
   antiga: "a altura salva na combinação é a que o usuário ajustou"). Texto da
   IA maior que o exemplo: o servidor **trunca por linhas inteiras** na altura
   gravada (`renderLines`), o editor esconde o excesso.
2. **`bakeLayers` (arte-rápida) troca só o `content`** — nenhuma re-medição,
   nenhum reposicionamento. `estimateComboElementHeight` conta apenas `\n`
   explícito e ignora quebra por largura.
3. **Nada move os elementos de baixo.** As camadas do combo já nascem com
   `metadata.groupId/elementId/presetId`, mas nenhum código usa esse elo para
   reposicionar.

## O que JÁ existe e será reaproveitado (não reinventar)

- **Editor**: `autoExpand` + `anchor` com direção de crescimento correta
  (topo desce, base sobe, meio abre) em `konva-editable-text.tsx`, com a trava
  anti-loop por assinatura + guard |diff| < 1 (NÃO remover nenhum dos dois).
- **Servidor**: `renderLines` com `autoExpand: true` já desenha além da altura
  gravada na direção da âncora — a paridade de crescimento existe.
- **Medidor server-side**: `breakTextIntoLines` do RenderEngine (privado hoje).
- **Elo do grupo**: `metadata.groupId` + `elementId` persistidos nas camadas.
- **Histórico**: `updateLayer(..., { coalesceKey })` permite agrupar o reflow
  do grupo num undo só.

## Desenho

### 1. Medidor compartilhado por ambiente
- Servidor: expor `RenderEngine.measureWrappedHeight(content, width, style,
  config)` público (breakTextIntoLines + lineHeight). Registrar as fontes do
  projeto ANTES (`registerProjectFonts`) — medir com fallback dá altura errada.
- Editor: extrair o "nó Konva descartável" do efeito de autoExpand para um
  helper `measureKonvaTextHeight` (medir no nó da tela não funciona: com altura
  fixa o Konva para de quebrar).

### 2. Reflow puro compartilhado — `src/lib/combo-stack-reflow.ts`
`reflowComboStack(layersDoGrupo, measure) => patches[{id, position, size}]`
- ordena os membros por y original;
- para cada camada de TEXTO: altura natural via `measure`; delta = natural −
  atual; aplica altura nova mantendo o topo (anchor top); acumula o delta e
  desloca TODOS os membros seguintes (texto ou não) por `y += deltaAcumulado`;
- deslocamento por DELTA, não re-cálculo de gaps: os espaçamentos que o usuário
  ajustou à mão sobrevivem;
- elementos na mesma faixa de y (colunas lado a lado, ex. "marmitex" el-4/el-5)
  não se movem entre si — só o que está abaixo do bottom original;
- puro, sem React nem DB — importável de rotas, MCP e editor.

### 3. `buildComboLayers` passa a criar pilhas
- `autoWrap.autoExpand: true`, `anchor: 'top'`, `metadata.stackOrder: índice`.
- `estimateComboElementHeight` vira só o chute inicial; o reflow corrige logo
  em seguida com medida real.

### 4. Pontas do servidor (automações de IA)
- **arte-livre**: após `buildComboLayers` com `textOverrides` → reflow com o
  medidor server. A IA não precisa contar caracteres: o layout se ajusta.
- **arte-rápida (`bakeLayers`)**: após aplicar `slotValues`, reflow dos grupos
  afetados (camadas com `groupId`). Camadas soltas sem grupo: ligar
  `autoExpand` para ao menos não truncar (crescer sem mover vizinhos é melhor
  que cortar).
- **MCP/prepare-creative**: confirmar que todos os caminhos de slot passam por
  um dos dois pontos acima (ponto único de aplicação).

### 5. Editor
- Depois do onChange de altura no efeito de autoExpand, disparar o reflow do
  grupo via contexto (`updateLayer` sequencial com o MESMO `coalesceKey`).
- A trava por assinatura existente segura o loop; reflow só com |delta| ≥ 1.

## Armadilhas conhecidas (da casa)
- Camada de texto é cacheada como bitmap com fontSize > 24: conferir se height
  está na assinatura de invalidação do cache (position não precisa).
- Fonte precisa estar carregada antes de medir (fontsTick no editor;
  registerProjectFonts no server) — medir com fallback quebra o layout.
- Rota nova que grave `Page.layers` precisa chamar `invalidateScheduledRenders`.
- A entrelinha mora em DOIS campos (`style.lineHeight` e
  `autoWrap.lineHeight`) — o medidor deve ler igual ao render (autoWrap primeiro).

## Fases
1. `measureWrappedHeight` público + `combo-stack-reflow.ts` + teste de paridade
   (medida server × editor para os mesmos inputs).
2. `buildComboLayers` (autoExpand/anchor/stackOrder) + reflow na arte-livre.
3. Reflow no `bakeLayers`/arte-rápida + varredura dos caminhos MCP.
4. Reflow reativo no editor (grupo acompanha a digitação).
5. (Opcional) migração dos combos default por projeto — não obrigatória: o
   reflow age nas camadas criadas, não no catálogo.
