# Arquitetura proposta — elementos vetoriais e modelos minimalistas no editor atual

> Partes 13, 15, 16, 17, 18 e 29. Proposta sobre o código auditado em `origin/main` `1cab1ab8`
> (`AUDITORIA-EDITOR-ATUAL.md`). A decisão de COMO o vetor é desenhado e guardado está em `ARQUITETURA-VETORES.md`;
> os modelos estão em `CATALOGO-CANDIDATO-STUDIO.md`; a execução, em `PLANO-IMPLEMENTACAO-EDITOR.md`.

---

## 1. Princípios

1. **Um editor, um formato, dois renderers, uma paleta, um sistema de modelos** (regra do owner). Tudo o que segue
   estende peças que já existem; nenhuma tem par paralelo.
2. **A página é a verdade.** Depois de materializada, a peça é uma `Page` normal (`isTemplate: false`); o editor não
   consulta catálogo, arquétipo nem paleta para editá-la ou desenhá-la.
3. **O que o render precisa mora em `Page.layers`.** Cores e geometria congeladas na camada; catálogo, arquétipo e papel
   de cor são **proveniência** (reaplicável por gesto explícito), nunca referência viva.
4. **Campo novo só dentro de `style`** (atravessa todos os schemas e o molde do compositor); nunca `type` novo,
   `shapeType` novo ou chave nova no topo da camada.
5. **Paridade por construção:** um único módulo puro de traçado para o editor e o servidor.
6. **Materializar = compositor.** Não nasce um terceiro materializador de layout em código (os dois anteriores morreram
   por ignorar a assinatura).

---

## 2. As entidades e os nomes no repo

| Conceito da sessão | Nome proposto | Onde mora | Tipo de coisa |
|---|---|---|---|
| VectorAsset | entrada da **biblioteca de elementos** (`ShapeDefinition` estendida) | `src/lib/assets/shapes-library.ts` (ou `elementos-library.ts` ao lado, mesmo formato) | dado em código, versionado por PR |
| VectorLayer | camada `shape` com `shapeType: 'svg-path'` + `style.vetor` | `Page.layers` | dado da página (nenhum tipo novo) |
| ColorSlot | `slots[]` da entrada (`{ id, alvo: fill/stroke, papelPadrao, rotulo }`) | biblioteca | metadado |
| Token de marca | **papel de cor**: `escuro`, `claro`, `destaque`, `destaque2`, `texto` | resolvedor puro (`src/lib/brand/papeis-de-cor.ts`) | função sem banco |
| Archetype / ArchetypeDefinition | **arquétipo** (`MIN-01`…), família, zonas em frações, parâmetros (zod), acentos permitidos | `src/lib/compositor/arquetipos/` | dado + funções puras |
| Modelo-base (preset) | `minimal-fb-topo-esquerda` etc. = arquétipo + params fixos | mesmo módulo | dado |
| ArchetypeInstance / params | `spec.preferencias.arquetipo = { id, versao, params }` | spec do compositor → `Generation.fieldValues.spec` | proveniência |
| Element Library (UI) | painel **Elementos** (fusão de "Formas" + "Elementos") | `src/components/templates/panels/` | UI |
| Galeria de modelos (UI) | aba **Layouts** do painel Templates | `src/components/templates/sidebar/` | UI |

---

## 3. Mapa: onde cada peça entra (Parte 13)

Legenda das colunas: **A** VectorAsset · **B** VectorLayer · **C** Archetype · **D** ArchetypeInstance/params ·
**E** Element Library · **F** color slots da marca.

| Etapa | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| **UI** (`template-editor-shell.tsx`, painéis, toolbars) | prévia no painel (SVG em `currentColor`, como o `ShapesPanel` já faz) | toolbar contextual de forma + bloco do `ShapeControls` | cards na aba Layouts (prévia HTML, sem Konva) | "Usar layout" escolhe preset e foto | painel Elementos: busca, categorias, "Marca" | swatches por slot: marca → nesta página → personalizada (validada); elo "acompanha a marca" |
| **Editor Context** (`template-editor-context.tsx`) | — | `addLayer` (1 camada) / `addLayers` novo (N camadas, 1 desfazer) | — | página nova chega por `createPage` / navegação | inserção no centro, seleção automática | `updateLayerStyle` grava hex + papel; "reaplicar" é um `applyDesign` com desfazer |
| **Layer Model** (`src/types/template.ts`) | — | `LayerStyle.vetor?`, `manterProporcao?`, `tracoPontas?`; `flipH/flipV` passam a valer para forma | — | — | — | `vetor.papeis[slot]` (proveniência) |
| **Konva** (`konva-layer-factory.tsx`, `konva-transformer.tsx`) | — | ramo `svg-path` usa o traçado compartilhado; `fillRule`; flip; multiparte com `hitFunc`; `keepRatio` por camada | — | — | — | lê só hex |
| **Autosave / API** (`page-sync-wrapper.tsx`, PATCH de página) | — | nada muda (`style` é aberto); a canonização de forma aprende `vetor` na fase multiparte | — | rota nova "página a partir de layout" (cria página) | — | "reaplicar" passa pelo PATCH normal → invalida e pede recomposição |
| **Page.layers** | — | camada `shape` com geometria e cores congeladas | — | tag `arquetipo:<id>` na página (opcional) | — | hex + papel por slot |
| **Renderer** (`render-engine.ts`) | — | mesmo traçado compartilhado no ramo `svg-path` | — | — | — | lê só hex; **nunca resolve papel** |
| **Export / miniatura / posts** | — | herdam (PNG 2×, JPEG da miniatura, vídeo; post pelo servidor) | — | — | — | — |
| **Compositor** (`src/lib/compositor/`) | acentos vêm da biblioteca | ornamento preso ao texto vira camada `svg-path` | definição + mapeamento para preferências / variante em memória | `preferencias.arquetipo`; procedência em `fieldValues` | — | papel `texto`/`destaque` resolvido da assinatura |
| **MCP** (`src/lib/mcp/catalogo/compositor.ts`) | — | — | `ver-assinatura` lista os arquétipos | `compor-arte`, `compor-leva`, `medir-copy` aceitam `arquetipo` | — | — |

---

## 4. UI de Elementos (Parte 15)

### 4.1 Rail e painel

- O rail esquerdo tem 13 botões e já está no limite (auditor C §2.3). **Funde-se "Formas" em "Elementos"**: um item só,
  montando o painel novo; "Formas" sai do rail (desktop e celular).
- O painel novo parte do `ShapesPanel` (`panels/shapes-panel.tsx:13-161`), que já tem busca por rótulo e palavras-chave,
  seções por categoria, prévia em `currentColor` e clique que insere no centro.

```
ELEMENTOS
[ Buscar elementos…                    ]
Linhas      ───  ═══  - - -  ⟵
Formas      ●  ○  ▭  ⬭(pílula)  ⬮
Orgânicos   ⬬  ⬭  ~
Setas       →  ↷  ›
Destaques   ‿  ▬(pincel)  ◯(marcação)
Editorial   ┌  ⌐ ¬(cantoneiras)  (  )
Ornamentos  ✦  ✳  ···
Marca       [uploads do projeto: PNG/JPEG, como hoje]
```

- **Categorias:** Linhas, Formas (= as "Básicas" de hoje), Orgânicos, Setas, Destaques, Editorial, Ornamentos, Marca.
  As "Decorativas" de hoje se redistribuem.
- **"Marca"** = o grid e o upload do painel Elementos atual (`elements-panel.tsx:287-375`), trocando o `fetch` direto
  pelo hook `useProjectElements` (regra do repo: nada de `fetch` em componente cliente).
- **Clique** = `handleAddShape` de hoje: centro da página, ~33% da largura, seleção automática, um desfazer. "Área livre"
  fica para depois (o centro é o que o Canva faz — `SVG-ELEMENTOS.md` §1).
- **Celular:** de graça — o drawer monta os mesmos componentes.
- **Não pôr propriedades dentro do painel Elementos:** trocar de aba desmonta o painel e o estado se perde (regra já
  registrada em `docs/regras/editor-e-galeria.md:271-274`).

### 4.2 Propriedades do vetor selecionado

**Toolbar contextual** (principal; também resolve o celular, onde hoje forma não troca de cor), no molde da
`ImageToolbar`, na zona fixa de 118 px (`editor-canvas.tsx:446-457`):

```
[● Preenchimento ▾] [○ Contorno ▾] [espessura ▾] | [⇋] [⇅] | [🔒 proporção] | opacidade ───●──
```

**Painel Propriedades** (controle completo), no ramo `shape` (`properties-panel.tsx:468-470` → `ShapeControls`):

```
CORES
  Preenchimento  [●]  🔗 acompanha a marca: Destaque
  Contorno       [●]  🔗 acompanha a marca: Texto
    Marca:        ● ● ● ●            ← BrandColorSwatches, maiores e com nome
    Nesta página: ● ●                ← cores já usadas em design.layers (derivado, sem armazenar)
    Personalizada [#______]          ← HexColorField (validado; hoje órfão)
  [Reaplicar cores da marca]
CONTORNO   espessura [2] px   pontas [reta | redonda]
OPACIDADE  ───────●──
TRANSFORMAR  [⇋ inverter H] [⇅ inverter V]   rotação [0°]
PROPORÇÃO  [🔒 travada]
```

- Escolher um swatch ou digitar uma cor **desfaz o elo** do slot (a equipe decidiu); "Reaplicar cores da marca" só
  mexe nos slots com elo.
- Comparar cor exige normalizar `rgba(...)`→hex (a canonização de forma grava `rgba` hoje e o swatch nunca aparece ativo).
- Vetor multicolor (fase P1): a lista de slots cresce; o padrão "escolhe a parte, depois a cor" já existe no
  `GradientEditor` (`gradient-editor.tsx:107-108,312-341`).
- Flip e proporção só aparecem quando os dois renderers desenharem (CP-V1); botão que não faz nada não entra.

---

## 5. UI de Modelos (Parte 16)

- **Onde:** uma 3ª aba no `EditorSidebar` (`sidebar/editor-sidebar.tsx:24`, hoje "Templates | Redimensionar"), aberta
  pelo botão Templates do rail. Nome: **Layouts** — "Modelo" já é o botão de promover página a modelo do cliente e
  "Templates" é a pasta.
- **Não** dentro da lista do `TemplatesPanel`: os dados dele são os templates do projeto e o "Usar" dele substitui a
  página sem desfazer e zera o histórico (`templates-panel.tsx:104-109`; `template-editor-context.tsx:1081,1100`).

```
LAYOUTS                       [Story | Feed]
Minimalistas · Editorial · Divisão · Sem foto
┌────────┐ ┌────────┐ ┌────────┐
│ prévia │ │ prévia │ │ prévia │   prévia em HTML com as fontes e cores da marca
│  HTML  │ │  HTML  │ │  HTML  │   (técnica do ComboCard: cqw + pair resolvido)
└────────┘ └────────┘ └────────┘
Topo à esquerda   Base com fio em L   Centro óptico
Story · Feed      Story · Feed        Story · Feed
pre headline apoio serviço logo       ← chips de papéis suportados
[Usar layout]
```

- **Card:** prévia, nome, formatos, papéis suportados (vocabulário `PAPEIS_DO_COMPOSITOR`, `papel-do-nome.ts:13`).
  Prévia em HTML, não em stage Konva (miniaturas Konva dentro do editor já causaram efeito colateral —
  `docs/regras/editor-e-galeria.md:256-259`).
- **"Usar layout"** cria uma **página nova** no template aberto com as camadas materializadas pelo compositor (§6), usando
  a foto e os textos da página atual quando existirem (por papel), ou placeholders. Não destrói nada; dispensa desfazer.
- **"Aplicar nesta página"** só numa fase posterior e só com desfazer (`applyDesign` com histórico, nunca
  `loadTemplate`).
- Depois de nascer, é página normal: o "Modelo" que já existe a promove a modelo do cliente se a equipe quiser — o ciclo
  fecha sem segundo sistema de templates.

---

## 6. Arquétipo × template × página (materialização)

```
arquétipo (código) + params ─┐
assinatura da marca (página "Assinatura" + Project.assinatura) ─┤
foto (Drive / página atual) ─┤──► comporPeca (compositor) ──► Layer[] (contrato do Layer + autofix + régua)
copy por papel ──────────────┘                                   │
                                                                 ├─ MCP compor-arte / compor-leva: persistAndRenderCreative
                                                                 │    → página de conteúdo na pasta da semana + Generation
                                                                 │      (procedência: spec.preferencias.arquetipo, composicao.arquetipo)
                                                                 └─ Editor "Usar layout": rota nova cria página no template aberto
                                                                      (tag arquetipo:<id>), sem Generation, sem post
```

1. **Arquétipo em código** (`src/lib/compositor/arquetipos/`): família, papéis, zonas em frações por formato, params
   (zod), acentos permitidos (ids da biblioteca + papel de cor), versão. Nada de fonte, corpo ou cor.
2. **MVP (família A):** o arquétipo **mapeia para preferências que já existem** — `ancora`, `alinha`, `cantoDaMarca`,
   `enquadramento` — mais o acento (ornamento `svg-path` preso ao grupo do headline, cor pelo papel `texto` ou
   `destaque`). Essas são as únicas RESTRIÇÕES; as zonas do catálogo são alvo de QA (o diagnóstico avisa quando um papel
   sai da zona; não recusa). A área segura é a efetiva da marca (`assinatura.ts:415-427`). Fora do MVP: logo em
   `topo-centro`; corte de foto à esquerda/direita.
3. **P1 (famílias B, C, E):** o arquétipo muda a ESTRUTURA → uma função pura sintetiza em memória uma **variante de
   assinatura** (caixas e grupos do arquétipo, estilo copiado da página real da marca) e entra em `carregarAssinatura`,
   a porta única de compor, `medir-copy` e `ver-assinatura` — medir e compor nunca divergem. Mais "foto em caixa" com
   máscara (o editor e o servidor já desenham `style.mask`).
4. **Precedência:** o arquétipo pedido vence a variante sorteada; a foto escolhe a posição dentro das zonas permitidas.
5. **Proveniência sem amarrar a edição:** `fieldValues.spec.preferencias.arquetipo` (pedido) e
   `fieldValues.composicao.arquetipo` (decidido); tag opcional na página. **Reprodutível sem o catálogo:** ao persistir,
   o compositor grava na spec as preferências EFETIVAS que o arquétipo produziu (`ancora`, `alinha`, `cantoDaMarca`,
   `enquadramento`) e o acento resolvido (id e versão do item, papel, hex); a recomposição (edição só de texto) usa
   esses valores congelados, não relê o catálogo — mudar ou apagar uma receita em código não altera peça já feita.
   Versão publicada de arquétipo nunca é editada: muda-se criando outra. Edição de geometria nunca recompõe.
   (Correção da revisão do Codex.)
6. **"Usar layout" no editor** reaproveita a porta que já existe para compor sem gravar: `comporPeca(spec,
   { somenteAvaliar: true })` devolve as camadas (`compor.ts:1148`); a rota nova só valida (contrato do Layer) e cria a
   página.
7. **Story e Feed:** compor duas vezes, uma página por formato.

---

## 7. Compositor, diretor de arte e Dot (Parte 17)

- O diretor (ou o Dot) escolhe `{ arquetipo: 'minimal-fb-base-esquerda', params: { acento: 'fio-em-L' } }` e chama
  `compor-arte` / `compor-leva` como hoje; a peça sai materializada em camadas normais, com procedência.
- `ver-assinatura` passa a listar os arquétipos compatíveis com a marca (papéis que a assinatura tem; formatos com
  página de assinatura).
- `medir-copy` aceita o mesmo `arquetipo`, para medir com a geometria que vai compor.
- O lote (`compor-leva`) inclui o arquétipo no hash do item: mudar versão ou params sob o mesmo `itemId` vira
  `LOTE_ITEM_CONFLITO` (comportamento correto, `docs/regras/lotes.md`).
- **Fora de escopo agora:** o diretor ESCOLHER arquétipo sozinho (por foto, por tema) e os parâmetros `tratamento` e
  `logo.zona = borda tratada` — dependem do CP1 da direção de arte e das decisões do owner (gates de logo, polaridade).
  Esta proposta não mexe no CP1 nem no diretor.
- O plano de conteúdo (`ItemDePlano`) não leva preferências de composição; levar arquétipo pela bancada exige migração —
  fase P2.

---

## 8. "Não criar um segundo sistema" — conferência (Parte 18)

| Proibido | Como esta proposta evita |
|---|---|
| Segundo editor | mesmo `TemplateEditorContext`, mesmo stage, mesmos painéis estendidos |
| Formato de página incompatível | nenhum `type` novo; tudo em `style`; páginas antigas intactas |
| Segundo renderer | o ramo `svg-path` que já existe nos dois lados, com UM módulo de traçado |
| Segunda paleta de marca | papéis resolvidos da `BrandColor` + `Project.assinatura`; nenhum mapa novo por projeto; `primary/secondary` não são inventados |
| Segundo sistema de templates | arquétipo = receita do compositor; o resultado é `Page` normal; "virar modelo" é o botão que já existe |

---

## 9. Anti-padrões (Parte 29)

1. **Criar segundo editor** ou um "modo layout" com estado próprio.
2. **`type: 'vector'` ou `shapeType` novo** — some em silêncio ou vira retângulo em 5 desenhadores.
3. **Armazenar SVG sem sanitizar**, ou armazenar marcação SVG de qualquer jeito no v1.
4. **SVG como `Konva.Image` com recolor por texto** — dois motores de SVG (navegador e Skia), pisca ao recolorir.
5. **Rasterizar tudo cedo demais** (PNG por cor) — é o que a Real já sofre com os ícones 429–432.
6. **Hardcode de cor por cliente** (`VECTOR_COLORS_POR_PROJETO`) — já há 4 paletas paralelas.
7. **Inventar `primary/secondary`** sem dado — vira segunda paleta.
8. **Resolver token no render** — invalidação nova, congelados misturados, `reverter` infiel, editor ≠ servidor.
9. **Proveniência em `metadata`** — o molde do compositor e o desktop apagam.
10. **Referência viva ao catálogo** — arte agendada muda em silêncio; versão e prova não veem.
11. **100 templates rígidos** ou arquétipos semeados como páginas-modelo "para preencher" — é o "(3 layouts)" arquivado.
12. **Arquétipo no rodízio de variantes** sem exclusão — muda as levas existentes do cliente.
13. **Arquétipo amarrado à página para sempre** — depois de materializar, é página normal.
14. **Migration big bang** — nada aqui exige migração no MVP.
15. **Quebrar páginas existentes** — a única mudança de pixel prevista é a correção de paridade do CP-V0, medida e com
    re-render.
16. **Depender do Canva em runtime** — a pesquisa é referência de design; nada consulta o Canva.
17. **Tratamento/véu novo antes do CP1** — `tratamento` e `logo.zona` esperam a direção de arte.
