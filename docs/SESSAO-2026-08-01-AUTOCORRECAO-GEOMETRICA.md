# Sessão 2026-08-01 — Validação geométrica e autocorreção de texto pré-render

Fecha o bug do texto que vazava da caixa no export e sobrepunha a camada de
baixo (repro: By Rock, template 140 "Happy Hour" Layout 2, subtitulo com `\n`),
e implementa a autocorreção geométrica pós-layout nos três geradores de arte.

## Causa real do bug (diferente da hipótese)

Não era clip divergente entre editor e export. A cadeia:

1. O **template fonte já tem caixas que se interceptam por design** (Subtitulo
   y=1694 h=100 sobre Rodape-1 y=1750) — funciona porque o conteúdo original é
   1 linha (~46px de glifo).
2. `reflowLayersAfterFill` **cresce a caixa do texto solto alterado**
   (autoExpand) sem olhar vizinho: com 2 linhas, Subtitulo foi a 103px
   (1694–1797), por cima do Rodape-1. Como não é pilha de combinação, nada
   empurrou o Rodape para baixo.
3. O export desenhou fielmente as caixas gravadas — que agora colidem.

Lição que virou código: a validação compara a **área real dos GLIFOS**
(descontado o padding de 6px do desenho, tolerância de 4px), não as caixas
gravadas — comparar caixas dispararia falso positivo em todo render de
template com sobreposição intencional de caixas.

## O que entrou

- **`src/lib/creatives/text-geometry.ts`** — validação determinística:
  overflow (altura E largura de linha vs. caixa), colisão glifo-a-glifo entre
  camadas de texto, e área segura (`CANVAS_MARGIN` escalado, só texto).
  Medição via `RenderEngine.measureTextLayerBox` (novo; mesma quebra/fonte do
  desenho — `measureTextLayerHeight` virou delegação).
- **`src/lib/creatives/text-autofix.ts`** — a escada: fontSize em passos de 4%
  (piso 80% do original E 24px na base 1080) → lineHeight até 0.92 → expandir
  caixa se os glifos não colidem e cabem na área segura → **bloqueio
  estruturado** (`CreativeError TEXTO_NAO_CABE`, 422, com `autocorrecao` nos
  details). Nunca mexe em conteúdo/quebra/fonte/cor/alinhamento/posição, nunca
  remove camada, nunca trunca, nunca renderiza torto. Guardas: máx 3 passadas,
  métrica estritamente decrescente, idempotente, sem IA e sem custo (NUNCA
  chama melhorar-arte). Bloqueio devolve as camadas ORIGINAIS.
- **Ponto único `aplicarAutofixOuFalhar`** chamado por `createArteRapida`,
  `createArteLivre` e `ajustarArte` DEPOIS do reflow e ANTES de persistir —
  camadas corrigidas são as persistidas, então **editor e export mostram o
  mesmo**. Cobre MCP, Claudinho (`/api/external/creatives`) e quem mais usar
  as libs.
- **Flags** `Project.textAutofixEnabled` e `Template.textAutofixEnabled`
  (default true; migration `20260801040000_add_text_autofix_flags`, aplicada
  em dev e produção). Desligada → **cria como antes, mas com `avisos[]`** na
  resposta. A flag de template consultada é a do template FONTE (o modelo).
- **Relatório `autocorrecao` obrigatório** na resposta das três tools e no
  `fieldValues` da Generation: `{necessaria, aplicada, iteracoes, ajustes[]
  {camada, propriedade, de, para, motivo}, pendencias[]}` — ou `{bloqueio,
  camadasEnvolvidas}` no erro. Telemetria: log `[text-autofix]` com
  projectId/sourceTemplateId/ajustes — template que corrige toda hora tem
  caixa mal dimensionada; o conserto certo é no template.
- **`conferir-arte` diagnostica sobreposição**: leitura divergente + colisão
  na página → `resultado: 'sobreposicao'` com as DUAS camadas, em vez de
  "faltando" culpando o slot errado. Localiza a página via
  `fieldValues.pageId` (agora gravado em toda Generation nova) ou
  `SocialPost.pageId`.
- **`escolher-modelo` devolve `slotFields` em cada alternative** — antes a
  alternativa era escolha às cegas (Layout 2 tem Pre-titulo e Badge que o
  Layout 1 não tem, e só dava para descobrir no editor).

## Papéis (não misturar)

Validação geométrica **corrige** (determinística, grátis, dirige o loop);
visão do conferir-arte **confirma** (não-determinística, cara, gate final —
pega o que a geometria não vê). A autocorreção nunca chama a melhoria
generativa.

## Validação

`scripts/.tmp-test-text-autofix.ts`: 18/18 — escada corrige a réplica do
repro (38→30.4 + lh 0.92, 1 iteração), idempotência, bloqueio estruturado
com camadas originais, **repro real via MCP corrigido** (página persistida sem
colisão, visão lê os textos), sobreposição diagnosticada na página quebrada
original, flag off cria com avisos, alternatives com slotFields. Regressão
`.tmp-test-mcp-arte-tools.ts --sem-melhoria`: 20/20. Typecheck e lint limpos.

Pendência conhecida (fase 2, de propósito): check de contraste
(texto sobre região clara sem gradiente) — citado na spec como opcional.

## Descobertas do primeiro uso real (madrugada de 01/08, story de domingo)

O teste "criar e agendar story de domingo do By Rock" derrubou três defeitos
que o E2E do template 140 não tinha como pegar:

1. **`fontWeight` fora do múltiplo de 100 QUEBRA o parse do font string do
   napi-rs** — e o sintoma depende da plataforma: no macOS o texto sai
   GIGANTE (~4×), no Linux da Vercel sai **INVISÍVEL** (lambda não tem fonte
   de sistema para o fallback). O peso 250 veio da normalização afe7d3e→afe3d7e
   (usWeightClass REAL do Metrisch ExtraLight é 250; o Bacana tem 310–390).
   Varredura: 148 páginas em 5 projetos; ZERO posts DRAFT/SCHEDULED
   referenciando páginas afetadas. Fix: `cssFontWeight()` no render-engine
   arredonda ao múltiplo de 100 [100..900] — não muda face (1 face por
   família) nem o limiar de faux-bold (≥600). Os DADOS ficam como estão
   (o peso do arquivo é verdade; o saneamento é do renderer).
2. **Colisão por caixa-fórmula dava falso positivo em headline empilhado**
   (o modelo Domingo tem "Seu almoço"/"de domingo" com em-boxes sobrepostos
   por design). Fix em duas partes: folga de tinta exata (baseline `middle`
   no centro do line-box, igual ao renderLines; `actualBoundingBox` medido
   com o MESMO baseline) e tolerância vertical proporcional ao corpo
   (`max(4px, 0.18×fontSize)` — 11px de interseção em fs77 é roçar de
   pontas em x diferentes, não texto sobre texto).
3. **Overflow vertical agora é paridade com o TRUNCAMENTO do render**
   (linhas descartadas por `floor(altura/lineBox)`, só sem autoExpand) — a
   caixa do designer pode ser menor que a fórmula e desenhar certinho; o
   defeito real é linha CORTADA, não pixel de fórmula.

Também: `register-project-fonts` blindado (status HTTP conferido — antes um
403 do Blob gravava o corpo do erro como .otf no cache /tmp da instância,
envenenando-a; `registerFromPath` devolve boolean e não lança — agora é
conferido, com cache-bust e re-download; falha vira log ALTO com o nome das
famílias) e `normalizeForComparison` unifica variantes de bullet (·•∙●) —
"· " vs "• " não é divergência de texto real.

Moral do teste: o ink-check por região validou o render local "correto"
enquanto o texto estava 4× maior — verificação por proxy engana; olhar a
imagem de verdade (conferir-arte) foi o que pegou tudo.
