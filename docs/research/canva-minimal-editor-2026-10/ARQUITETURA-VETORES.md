# Arquitetura de vetores recoloríveis

> Decisão sobre COMO o SVG entra no editor (Parte 14), o modelo de `VectorAsset`, color slots e papéis de cor
> (Parte 10 · Modelo conceitual · Tokens), segurança (Parte 21) e performance (Parte 22).
> Base: `AUDITORIA-EDITOR-ATUAL.md` e os relatórios A, B, D e E em `evidencias/auditoria/`.
> Tudo aqui é proposta; nada foi implementado.

---

## 1. Os fatos que decidem

1. Já existe um vetor monocromático nos dois renderers: `shape` + `shapeType: 'svg-path'`, com o path congelado na
   camada (`src/types/template.ts:191-195`; editor `konva-layer-factory.tsx:1518-1560`; servidor
   `render-engine.ts:1843-1862`). [OBS reconferido]
2. Campo novo dentro de `style` atravessa autosave, contrato, "Salvar", combinações, compositor, cópias, versão e
   invalidação; `type` novo é recusado ou some em todos esses lugares. [OBS]
3. Um `shapeType` novo cai no `default` de **retângulo cheio** nos dois renderers (`konva-layer-factory.tsx:1619-1634`;
   `render-engine.ts:1965-1972`). [OBS]
4. Nenhum renderer lê paleta de marca; todo campo de cor é hex literal. [OBS]
5. 94% dos vetores observados no Canva têm 1 ou 2 cores (`SVG-ELEMENTOS.md` §3).

---

## 2. As opções (Parte 14)

| Critério | **A** — SVG como imagem rasterizada | **B** — imagem com SVG embutido (data URL / Konva.Image), recolor reescrevendo o SVG | **C** — `type: 'vector'` novo | **D (recomendada)** — `shape`/`svg-path` estendido, geometria congelada, traçado compartilhado |
|---|---|---|---|---|
| **Edição** | só posição/tamanho; alça lateral vira recorte | idem A (semântica de imagem: proporção forçada, recorte lateral, duplo clique abre crop) | o que se construir | a de forma: Transformer, guias, z-order, grupos, blur já valem |
| **Recolor** | um arquivo por cor (é o que a Real faz hoje com PNG 429–432) | trocar texto do SVG e recarregar; o `use-image` zera a imagem e pisca o placeholder | o que se construir | **fase 0: `fill` + `strokeColor`** (2 slots, já existe); fase 1: partes por slot |
| **Performance** | 1 blit; ~4 MiB por variante 1024² | re-rasterização do SVG a cada zoom/resize; SVG inline incha o JSON | depende | 1 nó Konva por vetor; parse memoizado; 30 vetores ≈ 1 ms/quadro (estimativa do auditor B, a medir) |
| **Segurança** | baixa (bitmap) | **alta exposição**: SVG cru no documento ou no Blob | depende do armazenamento | **v1 não guarda marcação SVG**: só strings de path validadas |
| **Export** | igual imagem | depende do motor SVG do navegador (Safari pode contaminar o canvas, a medir) | precisa de case em 5 desenhadores | herda PNG 2×, miniatura e vídeo do editor; servidor por ramo existente |
| **Konva** | `Image` | `Image` | componente novo | ramo existente do `ShapeNode` + `hitFunc` de caixa quando houver partes |
| **Persistência** | `fileUrl` | `fileUrl`/data URL | enum em 3 lugares + `Record<LayerType>` | **nada muda** (`style` é aberto em todos os schemas) |
| **Compatibilidade** | total | parcial | **pior caso**: some no editor antigo, buraco publicado, 400 no Salvar, `reverter` descarta, desktop pinta caixa cinza | leitor antigo desenha a **silhueta numa cor** (`pathData` + `fill` mantidos) |
| **Migração** | nenhuma | nenhuma | enums + renderers + contrato + desktop | nenhuma de schema; dados novos só em `style` |
| **Manutenção** | arquivos por cor se multiplicam | **segundo e terceiro motor de render** (SVG do navegador + módulo SVG do Skia) — contra a regra do owner | 12–14 pontos de código (auditor A) | um módulo de traçado puro usado pelos dois renderers (padrão de `filters/apply.ts`) |

**Recomendação: D.** O SVG recolorível é uma camada `shape` com `shapeType: 'svg-path'` — sem `type` novo e sem
`shapeType` novo. A fase 0 não toca renderer para recolorir (1–2 slots = `fill` + `strokeColor`); a fase multiparte
estende o MESMO ramo dos dois renderers por um módulo compartilhado. **A** fica como fallback para arte que não se
normaliza em paths (textura, pincel com ruído, ilustração com gradiente complexo): entra como imagem, como hoje.

---

## 3. O modelo

### 3.1 `VectorAsset` = entrada de catálogo em código

Sem tabela nova no v1. O catálogo é dado versionado no repo, no padrão de `SHAPES_LIBRARY` (`src/lib/assets/shapes-library.ts`,
"forma nova é UMA entrada de dados") e de `FONT_COMBO_LAYOUTS`. Campos novos, todos opcionais, numa definição que
continua sendo `ShapeDefinition`:

```ts
// esboço — não é código do repo
type PapelDeCor = 'escuro' | 'claro' | 'destaque' | 'destaque2' | 'texto'

interface ShapeDefinition {            // a interface que já existe, estendida
  id: string; label: string; shapeType: ShapeType
  category: 'linhas' | 'formas' | 'organicos' | 'setas' | 'destaques' | 'editorial' | 'ornamentos'
  keywords?: string[]                  // PT e EN ("onda", "wave")
  pathData?: string; pathViewBox?: [number, number, number, number]; pathFillRule?: 'nonzero' | 'evenodd'
  aspect?: number
  // novos
  versao?: number                      // muda quando o desenho muda; a camada guarda a versão que copiou
  ajuste?: 'travado' | 'livre'         // travado = proporção presa no Transformer (gráfico); livre = estica (fio, moldura)
  traco?: { largura: number; pontas?: 'butt' | 'round'; juncao?: 'round' | 'miter' }
  slots?: Array<{ id: string; alvo: 'fill' | 'stroke'; papelPadrao: PapelDeCor; rotulo: string }>
  partes?: Array<{ d: string; slot: string; alvo: 'fill' | 'stroke'; fillRule?: 'nonzero' | 'evenodd' }>  // fase multiparte
  papeisPermitidos?: Array<'AGRUPAMENTO' | 'CONTRASTE' | 'DIRECIONAMENTO' | 'IDENTIFICACAO' | 'PROFUNDIDADE' | 'IDENTIDADE'>
}
```

- `papeisPermitidos` (os "allowedRoles" da sessão) é metadado de curadoria para o diretor de arte/compositor escolher
  acento por função; o editor ignora.
- O catálogo cresce por PR (curadoria). SVG enviado por usuário é fase P2 (§6).

### 3.2 `VectorLayer` = `shape` + `svg-path` com `style.vetor`

```ts
// esboço da camada (Page.layers) — nenhum campo novo fora de `style`
{
  type: 'shape',
  style: {
    shapeType: 'svg-path',
    pathData: '…', pathViewBox: [0, 0, w, h], pathFillRule: 'nonzero',   // o desenho (fase 0) ou a silhueta (multiparte)
    fill: '#rrggbb' | 'transparent',     // slot de preenchimento (fase 0)
    strokeColor: '#rrggbb', strokeWidth: 2, // slot de contorno (fase 0) — px da camada, constante ao redimensionar
    flipH?: boolean, flipV?: boolean,      // já existem no tipo (imagem); passam a valer para forma (CP-V1)
    manterProporcao?: boolean,             // lido pelo Transformer (CP-V1); nasce de `ajuste: 'travado'`
    tracoPontas?: 'butt' | 'round',        // para sublinhado/fio de ponta redonda (os dois renderers)
    vetor?: {
      asset: { id: 'moldura-aberta', versao: 1 },        // PROVENIÊNCIA, não referência viva
      papeis?: { contorno: 'texto' },                     // de onde veio a cor de cada slot (UI e "reaplicar" leem)
      partes?: [{ d, slot, alvo, fillRule }],             // só na fase multiparte
      cores?: { onda1: '#…', onda2: '#…' },               // só na fase multiparte: o que o render lê nas partes
    },
  },
}
```

Por que assim (cada ponto com a fonte):
- **Geometria congelada na camada**, não referência ao catálogo: a versão da página, a invalidação, a miniatura
  reaproveitada e a `PostRenderProof` só enxergam `Page.layers` (`versao.ts:45-58`; `agendamento.ts:501-512`;
  `render-post-art.ts:185-187`). Referência viva deixaria arte agendada mudar em silêncio. Precedente: `style.mask.path`.
- **Proveniência dentro de `style`, nunca em `metadata`:** o molde das combinações apaga `metadata`
  (`font-combinations-capture.ts:297-301`) e o ornamento sobrescreve (`font-combinations.ts:231-233`); o desktop reduz
  `metadata` a `{role}`.
- **Não usar o nome `slot` na camada:** `metadata.slot` já é a identidade semântica B1 (`semantica/ler.ts:69-76`).
- **`pathData` + `fill` sempre presentes** (também na fase multiparte, como silhueta): leitor antigo desenha uma forma
  de uma cor em vez de nada ou de um retângulo. Sem `pathData` o editor desenha um retângulo azul e o servidor nada
  (`konva-layer-factory.tsx:1525-1535` × `render-engine.ts:1844`) → o contrato tem de recusar `svg-path` sem `pathData`.

### 3.3 Color slots

| Fase | Slots | Onde mora a cor | Renderer |
|---|---|---|---|
| **0 (MVP)** | até 2: `preenchimento` → `style.fill`; `contorno` → `style.strokeColor` | campos que já existem | **sem mudança** além da paridade (CP-V0) |
| **Multiparte (P1)** | N (o catálogo limita a 4) | `style.vetor.cores[slot]`, uma por parte | ramo `svg-path` dos dois lados lê `vetor.partes` pelo traçado compartilhado |

Regras:
- **Três estados de cor, que não se misturam** (achado da revisão do Codex):
  1. **cor da paleta** — o que o resolvedor devolve: sempre `#rrggbb` canônico, validado por `hexValido`;
  2. **cor persistida** — o que a camada guarda depois da canonização de forma: `#rrggbb` ou `rgba(r,g,b,a)` (a
     opacidade embutida); toda comparação passa por um leitor único `lerCor(valor) → { hex, alfa } | 'transparente' | null`;
  3. **sem preenchimento** — `'transparent'` explícito nos itens só de contorno; não passa por `hexValido` (que o recusa)
     e não é "cor da marca".
- A cor de vitrine do catálogo **nunca** vai para a camada: a inserção resolve pelo papel (§4) ou usa a escolha explícita.
- **Opacidade:** a canonização de forma embute a opacidade no `fill`/`strokeColor` como `rgba(...)` e zera `opacity`
  (`shape-style.ts:132-168`). Fase 0 aceita isso (é como forma funciona hoje); a UI **normaliza `rgba`→hex** para
  comparar com o swatch (hoje o swatch nunca aparece ativo). Na multiparte, a canonização deixa de dobrar a opacidade
  quando há `vetor.partes` e os dois renderers aplicam a opacidade da camada (o servidor já aplica em
  `renderLayer`, `render-engine.ts:211-215`).

### 3.4 Desenho: um módulo de traçado, dois renderers

- Módulo puro novo, sem `import konva` do pacote raiz e sem napi: recebe segmentos já analisados e um contexto 2D
  genérico (`moveTo/lineTo/bezierCurveTo/quadraticCurveTo/arc/translate/rotate/scale/closePath` — os mesmos nomes no
  `Konva.Context` e no contexto do napi). Padrão do repo: `src/lib/konva/filters/apply.ts`, `src/lib/image-fit.ts`.
- **Parser único:** o de hoje é `Konva.Path.parsePathData` (normaliza relativos, H/V, S/T; arcos em parametrização de
  centro) usado por `traceSvgPath` (`src/lib/konva/svg-path-clip.ts`). O servidor usa `Path2D` do Skia → **dois
  parsers**. Proposta: usar a função estática do Konva nos dois lados (no servidor, import de `konva/lib/shapes/Path`) e
  memoizar por `d`. Verificação obrigatória no CP-V0: o import roda no vitest (ambiente `node`) e no bundle da função de
  render; se não rodar, parser próprio com teste de equivalência contra o do Konva para todos os `pathData` da
  biblioteca.
- **Semântica de traço única:** traçar o path com a escala da caixa, restaurar o transform e só então preencher e
  contornar — o traço fica em px da camada nos DOIS lados (é o que o editor já faz, `konva-layer-factory.tsx:1549-1557`;
  o servidor hoje divide pela escala média e diverge em caixa não quadrada).
- `fillRule` passa a ser respeitado no editor.
- Flip: `translate/scale(-1)` em torno do centro da caixa DENTRO do traçado (nunca na escala do nó, porque o
  `transformEnd` zera a escala).
- Multiparte no editor: `Konva.Shape` único com `sceneFunc` que pinta cada parte com sua cor + **`hitFunc` com o
  retângulo da caixa** (obrigatório: sem ele o hit chama o `sceneFunc` e as cores sujam o colorKey —
  `node_modules/konva/lib/Shape.js:379,401`).
- `ajuste: 'travado'` vira `manterProporcao` na camada e o Transformer força `keepRatio` com alças de canto
  (`konva-transformer.tsx:120-139`). A renderização multiparte usa escala uniforme centrada ("meet") para o desenho não
  deformar quando alguém estica pela alça lateral.

---

## 4. Cores da marca (tokens e papéis)

### 4.1 Os tokens pedidos × os dados que existem

| Token pedido | Existe dado? | Papel proposto |
|---|---|---|
| `brand.dark` | sim: `Project.assinatura.mancha` / `.fundo` (10 projetos) | **`escuro`** |
| `brand.light` | não tem casa no banco; derivável (cor de maior luz da paleta; "claro" dos gradientes) | **`claro`** |
| `brand.accent` | sim: `Project.assinatura.destaque.fill` (+ `alternativa`) | **`destaque`** (+ `destaque2`) |
| `brand.primary` / `brand.secondary` | **não**: só posição na lista, e a ordem muda por consumidor (DESC no editor, ASC no desktop) | **não entram** até existir papel na própria `BrandColor` |
| — | sim: a cor do papel de texto na página de assinatura | **`texto`** (o acento segue o texto ao qual está preso) |

Fonte: `evidencias/auditoria/auditor-D-cores-e-marca.md` §2.3, §2.4, §4.4. Os cinco tokens criariam, na prática, uma
segunda paleta (alguém teria de inventar primária/secundária). `escuro/claro/destaque` são POLARIDADE + ACENTO — o mesmo
vocabulário da régua do compositor (`luzDaCor < 128`) e do achado BQ1 da auditoria de direção de arte.

### 4.2 Resolvedor único, puro

`resolverCorDaMarca(papel, { paleta, assinatura, corDoTexto? }) → { hex: '#rrggbb', fonte }` — módulo sem `@/lib/db`
(regra do `AGENTS.md`), saída sempre por `hexValido` (`src/lib/creatives/halo/fundo-de-texto.ts:83-90`).

| Papel | 1ª fonte | 2ª | 3ª | Padrão |
|---|---|---|---|---|
| `escuro` | `assinatura.fundo` (preenchimento) / `assinatura.mancha` (sombra, véu) — **só se gravados** | `BrandColor` cujo nome casa o regex de escuro (`fundo-de-texto.ts:361`) | a de menor luz | `#111111` |
| `claro` | — | nome casa creme/branco/off-white | a de maior luz | `#FFFFFF` |
| `destaque` | `assinatura.destaque.fill` | cor das peças encaixada na paleta (`prompt-do-manual.ts:98-105`) | a mais saturada | cai em escuro/claro |
| `destaque2` | `assinatura.destaque.alternativa` | — | — | — |
| `texto` | a cor do papel de texto ao qual o acento se prende (assinatura) | — | — | `escuro` |

- **Regra dura:** a cor original do SVG nunca é devolvida.
- **O resolvedor novo serve só aos vetores.** Os dois resolvedores de "escuro" que já existem (cliente
  `corEscuraDaMarca`, servidor `corDaManchaDoProjeto`) **não** são trocados: eles dão precedência ao véu da própria
  página, depois ao nome, depois ao quase-preto (`fundo-de-texto.ts:348-365`) — outra ordem, que o halo usa. Unificar
  fica para depois (P2), só com fixtures reais provando a mesma saída. (Correção da revisão do Codex.)

### 4.3 Ciclo de vida da cor

1. **Inserção** (painel, arquétipo, compositor): cada slot recebe o hex do resolvedor e `vetor.papeis[slot] = papel`.
2. **Escolha explícita** (swatch, seletor, campo validado): grava o hex e **remove** o papel daquele slot.
3. **"Reaplicar cores da marca"** (ação explícita na camada e, depois, na página): reescreve só os slots com papel,
   preservando o alfa; passa pela porta normal (autosave → PATCH → `invalidateScheduledRenders` +
   `pedirRecomposicaoDaArteCongelada`); post com `laterPostId` é intocável.
4. **O render nunca resolve.** Token resolvido em render exigiria paleta nos 5 desenhadores, criaria invalidação nova por
   troca de paleta, misturaria congelados com cor velha e quebraria o `reverter` (auditor D §4.1).
5. **Papel na `BrandColor`** (coluna anulável, migração aditiva) só se a derivação errar num cliente real — decisão do owner.

---

## 5. Compatibilidade (Parte 20)

| Pergunta | Resposta | Por quê |
|---|---|---|
| Páginas antigas continuam abrindo? | sim | nenhum campo existente muda de sentido; `style.vetor` é opcional |
| Layers antigas continuam renderizando? | sim, **exceto** o que o CP-V0 muda de propósito, e que precisa de inventário antes do deploy: (1) o servidor passa a desenhar o contorno do `svg-path` em px da camada (hoje divide pela escala média); (2) o editor passa a respeitar `pathFillRule`; (3) o servidor troca o `Path2D` do Skia pelo parser do Konva + traçado compartilhado | renderizar antes/depois TODAS as formas da biblioteca e uma amostra de camadas `svg-path` reais (branch de dev), nos dois renderers; aceitar só as diferenças previstas; `scripts/rerender-agendados.ts --apply` depois do deploy; post com `laterPostId` não muda |
| Export continua idêntico? | sim para tudo que não é `svg-path` com contorno; vetores novos saem iguais no editor e no servidor por construção | módulo de traçado único |
| Templates existentes continuam válidos? | sim | nenhuma mudança de schema |
| Posts existentes continuam editáveis? | sim; post entregue (`laterPostId`) não muda nunca | regra de congelamento |
| Desktop precisa entender vetor? | não para abrir; **sim para não destruir**: o push do desktop já apaga `pathData` hoje, e o PUT ainda apaga páginas que não vierem no payload | guarda CP-X0 (camadas **e** páginas) — ou aposentar o push — **antes do CP-V2**, quando o catálogo começa a gravar `style.vetor` (`PLANO-IMPLEMENTACAO-EDITOR.md`) |
| Versões antigas do editor ignoram ou quebram? | aba antiga desenha a silhueta numa cor (`pathData` + `fill`) e regrava `style.vetor` intacto (merge raso preserva chave desconhecida) | o autosave grava o array como veio; o servidor canoniza só shape (spread) |

---

## 6. Segurança do SVG (Parte 21)

**v1 (catálogo em código):** nenhuma marcação SVG é armazenada nem desenhada — só strings de path normalizadas, revisadas
em PR. A superfície de XSS de SVG não existe.

**Importador (fase P2, para curadoria ou upload da marca)** — requisitos obrigatórios:
1. Parser XML estrito, sem DTD/entidades externas; recusa `<!DOCTYPE>`.
2. **Allowlist de elementos:** `svg, g, path, rect, circle, ellipse, line, polyline, polygon`. Recusa: `script`,
   `foreignObject`, `iframe`, `image`, `use` com `href` externo, `style` com `@import`/`url()`, `animate*`, `set`,
   `filter`, `mask`, `clipPath` (v1), `text`, `pattern`, gradientes (v1: viram 1 slot ou recusa).
3. **Allowlist de atributos:** `d, x, y, width, height, cx, cy, r, rx, ry, points, x1, y1, x2, y2, fill, stroke,
   stroke-width, fill-rule, opacity, transform, viewBox`. Recusa todo `on*`, `href`, `xlink:href`, `style` (ou analisa só
   `fill/stroke` declarados).
4. `viewBox` obrigatório; dimensão máxima 4096 nas duas direções.
5. Saída do importador NÃO é SVG: é `{ partes: [{ d, slot, alvo, fillRule }] }` com `d` reescrito em comandos absolutos
   `M L C Q Z` (transforms aplicados, arcos em cúbicas, números com 2 casas).
6. Tetos: arquivo ≤ 64 KB; ≤ 8 partes; ≤ 400 segmentos no total; `d` final ≤ 16 KB; ≤ 4 cores distintas (slots); cores
   fora de hex sólido recusadas.
7. Upload por usuário (se existir) é rota autenticada com gate de escrita no projeto, validação no servidor (nunca só no
   cliente) e sem servir o SVG original de volta.
8. **Validação em TODAS as portas que gravam `Page.layers`**, não só no contrato do compositor: PATCH de página
   (`api/templates/[id]/pages/[pageId]/route.ts:47`, hoje `z.array(z.unknown())`), PATCH de camada, PUT do template e
   POST de página. Para camadas `svg-path`: `pathData` não vazio, só comandos de path, ≤ 16 KB; `vetor.partes` ≤ 8;
   cores lidas por `lerCor`. Erro explícito (422) — e, antes de ligar, uma consulta de leitura confirma que nenhuma
   página existente falharia (senão o autosave travaria). Hoje o contrato não valida cor (`layer-contract.ts:133-208`) e
   o servidor não tem sanitizador central (`sanitizeColor` citado num script não existe). (Correção da revisão do Codex.)
9. **Fora do escopo, registrado:** o upload de logo já grava SVG cru no Blob com o MIME original
   (`api/projects/[projectId]/logos/route.ts:104-112`). Como `<img>` não executa script, o risco é de quem abrir a URL do
   Blob direto (origem do Blob, não do app). Vale um item próprio: rasterizar ou sanitizar no upload.

Logos SVG já sobem crus ao Blob hoje (`logos/route.ts:108-111`) — risco existente, fora deste plano, registrado.

---

## 7. Performance (Parte 22)

| Cenário | Custo esperado (estimativa do auditor B, a medir) | Limite proposto |
|---|---|---|
| 1 vetor | 1 nó Konva, 2 desenhos/quadro (cena + hit) | — |
| 10 vetores | 10 nós, ~20 desenhos; parse 0 com memo | — |
| 30 vetores | 30 nós, ~60 desenhos, ~3.600 segmentos ≈ 1 ms/quadro no desktop | **aviso** acima de 30 vetores na página |
| Workspace contínuo (N páginas vivas) | multiplica por N | memo de parse compartilhado entre páginas |
| Miniatura / export PNG / vídeo | herdam o stage; vetor é redesenhado no `pixelRatio` do export | nenhum cache de vetor sem `pixelRatio` declarado (regra da casa) |
| Servidor | mesmo traçado; sem SVG nem Path2D | — |
| Payload | autosave manda todas as camadas; undo guarda 50 snapshots/página; prova duplica | por camada: `d` ≤ 4 KB (catálogo) / 16 KB (importado); página: soma de paths ≤ 200 KB |
| Desktop | não desenha `svg-path` (retângulo) | sem custo; risco é de dado (§5) |

Protocolo de medição (CP-V5): página 1080×1920 com 1/10/30 vetores de 1/3/8 partes; `layer.draw()` ×100, arraste de 3 s
com `hitOnDragEnabled`, modo foco ligado, workspace com 6 páginas; Chrome e iPad/Safari.
