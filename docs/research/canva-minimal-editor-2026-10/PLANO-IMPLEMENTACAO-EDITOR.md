# Plano de implementação — elementos vetoriais recoloríveis e modelos minimalistas no editor

> **Status:** proposta para decisão do owner. Nada foi implementado. **Revisado depois da revisão adversarial do Codex**
> (12 achados aceitos — ver `REVISAO-CODEX.md`; as correções estão marcadas "(Codex nº)").
> **Base auditada:** `origin/main` `1cab1ab85fb89a3f432a7be8380c707e6a3a1cde` (14/10/2026). Antes de cada checkpoint,
> `git fetch` e reconferir os `arquivo:linha` citados — o repositório anda rápido.
> **Leitura obrigatória antes do primeiro PR:** `AUDITORIA-EDITOR-ATUAL.md`, `ARQUITETURA-VETORES.md`,
> `ARQUITETURA-EDITOR-PROPOSTA.md`, `CATALOGO-CANDIDATO-STUDIO.md`, `SVG-ELEMENTOS.md` (mesma pasta) e
> `docs/regras/editor-e-galeria.md`, `docs/regras/compositor.md`, `docs/regras/render-e-texto.md`,
> `docs/regras/publicacao-e-agenda.md`.

---

## 0. Como executar (para a sessão que implementar)

1. **Um checkpoint = um PR**, em **worktree** (o checkout é compartilhado — `AGENTS.md`, "commite por worktree"):
   `git worktree add <dir> origin/main`, symlink de `node_modules` e `prisma/generated`, branch `feat/<cp-id>-<slug>`.
2. Antes do PR: `npm run typecheck`, `npm run lint`, `npx vitest run <arquivos do CP>` e `npm run test:unit` inteiro.
3. **Regra nova vai no arquivo da área, no MESMO PR do comportamento:** vetores → `docs/regras/editor-e-galeria.md`;
   arquétipos → `docs/regras/compositor.md`; MCP → `docs/regras/mcp.md`. Nunca no `CLAUDE.md`.
4. **Nenhuma migração no MVP.** Fases P2 que pedirem (papel na `BrandColor`, preferências no `ItemDePlano`):
   `npm run db:migrate -- --name <x>` no branch de dev do Neon; produção com `migration.sql` à mão + `npm run db:deploy`.
   Nunca `npx prisma …` cru (vai para produção).
5. **Mudou código de render?** Antes do deploy, o **inventário de diferenças de pixel** do checkpoint (ver CP-V0); depois
   do deploy no ar, `scripts/rerender-agendados.ts` (dry-run, depois `--apply`). Post com `laterPostId` é intocável —
   não é re-renderizado nem "corrigido" (`docs/regras/publicacao-e-agenda.md`, janela de congelamento). (Codex 1)
6. **Consultas de leitura ao banco** (contar camadas, conferir nomes de cor) são feitas pelo owner ou no branch de dev
   recém-recriado (`npm run db:dev:setup -- --recriar`), nunca com escrita.
7. **Não mexer** no CP1 da direção de arte nem no diretor de arte. `tratamento` e `logo.zona = borda tratada` esperam o CP1.

Estimativa relativa: **S** ≤ 1 dia · **M** 2–4 dias · **L** 1–2 semanas · **XL** > 2 semanas.
Prioridade: **P0** fundação/segurança · **P1** alto valor · **P2** depois.

---

## 1. Estado atual (resumo; detalhe em `AUDITORIA-EDITOR-ATUAL.md`)

- O vetor já existe: `shape` + `shapeType: 'svg-path'` com path congelado, desenhado pelo editor (Konva, `sceneFunc`) e
  pelo servidor (`RenderEngine` em `@napi-rs/canvas`, `Path2D` injetado). Uma cor de preenchimento e uma de contorno.
- A biblioteca de formas (`src/lib/assets/shapes-library.ts`) é dado em código; o painel "Formas" tem busca, categorias
  e insere no centro (hoje copiando a cor de vitrine `definition.fill`, `shapes-panel.tsx:43-54`).
- Paridade do `svg-path` hoje: o editor ignora `pathFillRule`; o traço diverge em caixa não quadrada; dois parsers
  (Konva × Skia); a rota de miniatura avulsa não injeta `Path2D` (`render-engine.ts:2199-2204`).
- Cinco desenhadores: editor, servidor, `/gerar-criativo` (desenha toda forma como `Rect` e PUBLICA esse PNG), desktop ×2.
- Forma não tem flip, nem trava de proporção por camada, nem toolbar contextual; no celular não troca de cor.
- Cor é hex literal (ou `rgba` depois da canonização de forma); `BrandColor` sem papel; vários resolvedores de "cor da
  marca" com precedências diferentes; nenhum renderer lê paleta.
- O compositor já materializa spec → `Layer[]` → página normal; tem `provar` (PNG sem gravar) e `somenteAvaliar`
  (camadas sem gravar, `compor.ts:1148`); a área segura efetiva vem da página da marca (`assinatura.ts:415-427`).
- A porta principal de escrita (PATCH de página) aceita qualquer camada (`z.array(z.unknown())`).
- `type` novo some em silêncio em 5 desenhadores e é recusado pelo contrato e pelo "Salvar".
- O desktop (último commit 26/03/2026) destrói campos desconhecidos no push e o PUT apaga páginas ausentes do payload.

## 2. Gaps

| Para… | Falta |
|---|---|
| elementos | dados na biblioteca (6 svg-path novos no MVP), categorias, painel fundido "Elementos" |
| SVG | paridade por construção (traçado único); flip; proporção por camada; validação nas portas de escrita |
| segurança de dado | guarda do push do desktop (camadas e páginas); `/gerar-criativo` não pode publicar retângulo |
| recolor | três estados de cor bem separados; UI de slots com cores da marca primeiro; campo validado; multiparte depois |
| cores da marca | resolvedor de papéis **para vetores** (`escuro/claro/destaque/destaque2/texto`); proveniência; "reaplicar" |
| arquétipos | definição em código; `preferencias.arquetipo` na spec, no MCP e no `medir-copy`; preferências efetivas congeladas; acento |
| templates minimalistas | 3 presets da família A (MVP); "foto em caixa" (B/C); spec sem foto (E); aba Layouts |

## 3. Arquitetura (resumo)

- **VectorAsset** = entrada estendida de `ShapeDefinition` (dado em código, versionado por PR).
- **VectorLayer** = `shape`/`svg-path` + `style.vetor` (proveniência, papéis; partes na fase multicor). Sem `type` novo.
- **ColorSlot** = `{ id, alvo: 'fill'|'stroke', papelPadrao, rotulo }`. Fase 0: `preenchimento`→`fill`,
  `contorno`→`strokeColor`.
- **Papel de cor** = `escuro | claro | destaque | destaque2 | texto`, resolvido por função pura só para vetores; o render
  só lê a cor gravada.
- **Archetype** = módulo puro `src/lib/compositor/arquetipos/`; **instância** = `spec.preferencias.arquetipo` + as
  preferências efetivas congeladas na mesma spec.
- **Materialização** = `comporPeca`. MCP: persiste como hoje. Editor: `somenteAvaliar` + rota que cria página nova.

## 4. Data model

| Onde | Muda? | O quê |
|---|---|---|
| Banco (Prisma) | **não no MVP** | P2 opcional: `BrandColor.papel` anulável (CP-V7); preferências no `ItemDePlano` (CP-T6) |
| `Page.layers` (JSON) | só dados novos dentro de `style` | `style.vetor = { asset:{id,versao}, papeis?, partes?, cores? }`, `style.manterProporcao?`, `style.tracoPontas?`; `style.flipH/flipV` passam a valer para forma |
| `Page.tags` | opcional | `arquetipo:<id>` e `layout` (páginas da aba Layouts) |
| `Generation.fieldValues` | só dados novos | `spec.preferencias.arquetipo = {id, versao, params, efetivo?}` + preferências efetivas (`ancora`, `alinha`, `cantoDaMarca`, `enquadramento`) + `spec.preferencias.acento = {id, versao, papel, cor}`; `composicao.arquetipo = {id, versao, paramsEfetivos, avisosDeZona}` — em arte existente, gravar por merge no banco (`mesclarFieldValuesDaArte`) |
| Código | sim | catálogo (`shapes-library.ts`), traçado (`src/lib/vetor/`), resolvedor de papéis (`src/lib/brand/papeis-de-cor.ts`), arquétipos (`src/lib/compositor/arquetipos/`) |
| SVG | **nunca** no v1 | só strings de path normalizadas e validadas |

## 5. Types (TypeScript)

| Arquivo | Mudança |
|---|---|
| `src/types/template.ts:142-217` (`LayerStyle`) | `vetor?: VetorDaCamada`; `manterProporcao?: boolean`; `tracoPontas?: 'butt' \| 'round'`; comentário em `flipH/flipV` |
| `src/lib/assets/shapes-library.ts:13-31` (`ShapeDefinition`) | `category` com as 7 novas + legado; `versao?`, `ajuste?`, `traco?`, `slots?`, `partes?`, `papeisPermitidos?`; `keywords` PT/EN |
| novo `src/lib/vetor/tipos.ts` | `PapelDeCor`, `SlotDeCor`, `ParteDoVetor`, `VetorDaCamada`, `Segmento`, `CorLida` |
| `src/lib/compositor/spec.ts:108-136` (`preferenciasSchema`) | `arquetipo` e `acento` — o `z.object` atual **descarta** chave desconhecida |
| novo `src/lib/compositor/arquetipos/tipos.ts` | `Arquetipo`, `Familia`, `ZonaDoPapel`, `ParamsDoArquetipo` (zod) |
| `src/hooks/use-project.ts:11-45` | tipar `assinatura` (a rota já devolve a linha inteira) |

`LayerType` **não muda**. Nenhum enum de tipo muda.

## 6. Editor (componentes)

| Componente | Mudança | CP |
|---|---|---|
| `template-editor-shell.tsx:878-889, 945-946, 961-962, 204-205, 722-723` | "Formas" sai; "Elementos" monta o painel novo (desktop e celular) | V2 |
| `panels/shapes-panel.tsx:13-161` | vira o painel Elementos: 8 categorias, busca PT/EN; **inserção resolve as cores pelo papel** (não copia a vitrine), grava `vetor.asset`, `vetor.papeis`, `manterProporcao` | V2 |
| `panels/elements-panel.tsx:287-375` | grid e upload viram a categoria "Marca"; `fetch` direto → `useProjectElements` | V2 |
| `properties-panel.tsx:1398-1544` (`ShapeControls`) | slots; Marca → Nesta página → Personalizada (`HexColorField`); elo "acompanha a marca"; reaplicar; flip; proporção; `lerCor` | V1, V3 |
| `brand-color-swatches.tsx:31-37` | "ativo" por cor lida (`lerCor`), não por string | V3 |
| `hex-color-field.tsx` | passa a ser usado (hoje órfão) | V3 |
| novo `shape-toolbar.tsx` + `editor-canvas.tsx:136-142, 446-457` | toolbar contextual de forma (também no celular) | V4 |
| `konva-transformer.tsx:120-139, 286` | `keepRatio` por `style.manterProporcao`; só alças de canto quando travado | V1 |
| `sidebar/editor-sidebar.tsx:24` + novo `sidebar/layouts-panel.tsx` | aba "Layouts" | T2 |
| `src/contexts/template-editor-context.tsx:583-599` | `addLayers(layers)` (N camadas, 1 desfazer) — só quando um item inserir mais de uma camada | V5 (se preciso) |

## 7. Konva

- O desenho do ramo `svg-path` sai do JSX para uma **função pura** `desenharSvgPath(ctx, camada, caixa)` em
  `src/lib/vetor/`, chamada pelo `sceneFunc` do editor (com o contexto do Konva) e pelo `RenderEngine.renderShape` (com o
  contexto do napi). Um teste dessa função cobre os dois lados por construção. (Codex 11)
- Parse memoizado; traçar com a escala da caixa, restaurar, preencher (com `fillRule`) e contornar em px da camada.
- Flip dentro do traçado (`translate/scale(-1)` em torno do centro da caixa), nunca na escala do nó.
- Multiparte (CP-V5): um `Konva.Shape` com `sceneFunc` pintando cada parte + `hitFunc` com o retângulo da caixa
  (obrigatório — `node_modules/konva/lib/Shape.js:379,401`); escala uniforme centrada ("meet").
- Cache do blur (`konva-layer-factory.tsx:1450-1462`): incluir `pathData`, `vetor.*`, `flipH`, `flipV` nas dependências.
- Nada de `strokeScaleEnabled=false` (espaço de tela — `Context.js:460-489`).

## 8. Color slots

- Fase 0 (MVP): até 2 slots — `preenchimento` (`style.fill`) e `contorno` (`style.strokeColor`). Itens só de contorno
  gravam `fill: 'transparent'`. Proveniência em `style.vetor.papeis[slot]`.
- **Três estados de cor** (Codex 4): cor da paleta (`#rrggbb`, `hexValido`) · cor persistida (`#rrggbb` ou `rgba` da
  canonização) · `'transparent'` (sem preenchimento, fora do `hexValido`). Toda comparação/leitura passa por
  `lerCor(valor) → { hex, alfa } | 'transparente' | null` (novo, puro).
- Fase multiparte (CP-V5): `style.vetor.partes[]` + `style.vetor.cores{}` e a silhueta em `pathData` + `fill`.

## 9. Asset library

- Catálogo em código; 31 itens em `SVG-ELEMENTOS.md` §7 (20 svg-path novos); MVP = 10.
- **IDs estáveis:** a biblioteca também alimenta as máscaras de imagem (`image-toolbar.tsx:33`; `style.mask.shapeId`).
- Teste de dados obrigatório (CP-V2): todo `pathData` passa no parser e no validador; tetos; slots coerentes; ids únicos;
  palavras-chave PT/EN; nenhuma cor de vitrine usada na inserção.
- Categoria "Marca" = elementos do projeto (PNG/JPEG de hoje). SVG da marca entra pelo importador (P2).

## 10. Brand colors

- Resolvedor puro **só para vetores** `src/lib/brand/papeis-de-cor.ts`: `resolverCorDaMarca(papel, { paleta,
  assinatura, corDoTexto })` (cadeia em `ARQUITETURA-VETORES.md` §4.2); saída por `hexValido`.
- **Não substituir** `corEscuraDaMarca` nem `corDaManchaDoProjeto`: eles priorizam o véu da própria página
  (`fundo-de-texto.ts:348-365`) e servem o halo. Unificar = CP-V7 (P2), só com fixtures reais. (Codex 5)
- Dados no cliente: `useBrandColors` + `useProject` (assinatura tipada). A aba Marca passa a invalidar
  `['brand-colors', id]` (`project-assets-panel.tsx:1182,1209`).
- `primary/secondary` não entram (sem dado).

## 11. Templates (onde moram os arquétipos)

`src/lib/compositor/arquetipos/` — `tipos.ts` (zod), `catalogo.ts` (definições e presets; **versão publicada é
imutável**), `zonas.ts` (frações → zonas presas à área segura **efetiva** da marca: a função recebe a geometria que
`montarAssinatura` devolve — `assinatura.ts:415-427` — e usa `NUMEROS_PADRAO.geometria` só como piso e nos testes),
`mapeamento.ts` (arquétipo → preferências efetivas + acento), `index.ts`. Nada de tabela, nada de página-modelo semeada.
(Codex 9)

## 12. Materialização

- **MCP** (`compor-arte`, `compor-leva`): spec com `preferencias.arquetipo` → o compositor resolve as preferências
  efetivas, **grava-as explicitamente na spec** com `arquetipo.efetivo = true`, compõe e persiste como hoje.
  Recomposição usa as efetivas, não relê o catálogo. (Codex 7)
- **Restrição × alvo:** no MVP, as restrições são as preferências efetivas + o acento; as zonas do catálogo são alvo de
  QA — o diagnóstico avisa (não recusa) quando um papel sai da tolerância. (Codex 9)
- **Editor** (CP-T2): rota que chama `comporPeca(spec, { somenteAvaliar: true })` (`compor.ts:1148`) e cria a página
  nova — contrato de entrada e falha no CP-T2. (Codex 10)
- Família A (MVP): preferências que já existem + acento. Famílias B/C (P1): variante de assinatura sintetizada em
  memória por `carregarAssinatura` (`compor.ts:213-286`).

## 13. Render (paridade)

- `desenharSvgPath` (§7) usada pelos dois renderers; parser único `Konva.Path.parsePathData` nos dois lados (no servidor,
  import de `konva/lib/shapes/Path`) — **spike no início do CP-V0**: rodar no vitest (ambiente `node`) e no bundle da
  função de render; se não rodar, parser próprio com teste de equivalência contra o do Konva em todo `pathData` da
  biblioteca.
- Semântica única: traço em px da camada; `fillRule` respeitado; `tracoPontas` nos dois lados.

## 14. Export

PNG 2×, miniatura e vídeo do editor herdam o stage. Post publicado sai do `RenderEngine` — pelo traçado único. A rota
`/api/templates/generate-thumbnail` deixa de depender de `Path2D` para `svg-path`. `/gerar-criativo` é tratado no CP-X1.

## 15. API

| Rota | Mudança | CP |
|---|---|---|
| PATCH `/api/templates/[id]/pages/[pageId]`, PATCH `/api/pages/[pageId]/layers/[layerId]`, POST `/api/templates/[id]/pages`, PUT `/api/templates/[id]` | **validação de `svg-path`** (comandos, ≤ 16 KB, `vetor.partes` ≤ 8, cores por `lerCor`); erro 422 explícito | X2 |
| PUT `/api/templates/[id]` (push do desktop) | guarda de camadas **e** páginas (ou aposentar o push) | X0 |
| POST `/api/gerar-criativo/finalize` | recusar página com `svg-path` ou receber o PNG desenhado pelo traçado | X1 |
| **nova** POST `/api/templates/[id]/pages/from-layout` | cria página a partir de layout (`hasProjectWriteAccess`, contrato do Layer) | T2 |
| MCP `compor-arte` / `compor-leva` / `medir-copy` | aceitam `preferencias.arquetipo`; fixtures em `scripts/validar-registro-mcp.ts` no mesmo commit | T1a |
| MCP `ver-assinatura` | lista arquétipos compatíveis | T1b |

## 16. Segurança

- v1 não armazena nem desenha marcação SVG: catálogo em código, só strings de path revisadas em PR.
- **Validação nas quatro portas de escrita** de `Page.layers` (CP-X2), não só no contrato do compositor. Antes de ligar,
  uma consulta de leitura confirma que nenhuma página existente falharia — senão o autosave travaria. (Codex 4)
- Importador (CP-V6, P2): requisitos de `ARQUITETURA-VETORES.md` §6.
- Registrado fora do escopo: logo SVG cru no Blob (`logos/route.ts:104-112`) — sanitizar ou rasterizar no upload.

## 17. Testes

| Tipo | O quê | Onde |
|---|---|---|
| **Unitário** | `desenharSvgPath` com contexto gravador (sequência de comandos = a mesma para editor e servidor por construção; memo; flip; `fillRule`; `tracoPontas`); `lerCor`; validador de path; resolvedor de papéis (fixtures com e sem assinatura, nomes que não casam o regex, nunca devolve a cor do asset); zonas e mapeamento dos arquétipos; funções puras da UI (cores nesta página, escolha explícita remove o elo, reaplicar preserva alfa); guarda do desktop | `src/lib/vetor/__tests__`, `src/lib/brand/__tests__`, `src/lib/compositor/arquetipos/__tests__`, `src/lib/assets/__tests__`, `src/lib/templates/__tests__` |
| **Integração** | `comporPeca` com `arquetipo` (padrão de `src/lib/compositor/__tests__/compositor.test.ts`): preferências efetivas gravadas, acento com a cor certa, procedência, recomposição reproduz SEM consultar o catálogo; **`medir-copy` e `comporPeca` escolhem a mesma variante e a mesma geometria com o mesmo arquétipo**; rota `from-layout` (mock do compositor + gate de acesso) **e a página persistida e reaberta pelo GET**; PATCH preserva `style.vetor` e recusa path inválido | idem |
| **Visual (pixel), uma fixture comum** | a MESMA fixture de `Page.layers` (anel `evenodd`, contorno 4 px em caixa 800×200, item invertido, item com alfa, item com blur) desenhada: (a) pelo `CanvasRenderer` (harness do CP0, `src/lib/direcao-de-arte/__tests__/suporte/propriedades.ts:108-111`); (b) pela rota de miniatura (`generateThumbnail`); (c) pelo caminho do post (`renderStoryImage` com a página da fixture); (d) pelo `/gerar-criativo` depois do CP-X1 — amostras de pixel iguais dentro da tolerância | `src/lib/vetor/__tests__/render-*.test.ts` |
| **Regressão / inventário** | todas as formas `svg-path` da biblioteca + amostra de camadas reais (branch de dev) renderizadas antes/depois do CP-V0 nos dois renderers; relatório de diferenças anexado ao PR | script de diagnóstico no PR |
| **Smoke** | `compor-arte` com `provar: true` para os 3 presets em 3 marcas com assinatura (Real, Espeto, Wine Vix) no `npm run dev` com o branch de dev do Neon | manual, roteiro no PR |
| **Editor × servidor (manual)** | para a fixture comum: `stage.toDataURL` do editor × PNG do servidor, comparação por pixel com tolerância (script de dev com Playwright; o e2e não roda no CI) | checklist no PR do CP-V0 |

## 18. Migração

- **MVP: nenhuma migração de banco e nenhuma reescrita de `Page.layers`.**
- **Mudanças de pixel previstas (todas no CP-V0)**, com inventário antes do deploy (Codex 1): (1) contorno do `svg-path`
  no servidor passa a px da camada; (2) o editor passa a respeitar `pathFillRule`; (3) o servidor troca o parser
  (`Path2D` do Skia → parser do Konva). Aceitar só diferenças previstas; re-render depois do deploy; `laterPostId` intocável.
- P2: `BrandColor.papel` (CP-V7) e preferências no `ItemDePlano` (CP-T6), aditivas.

## 19. Desktop

- MVP: nenhuma mudança no app desktop.
- **Antes do CP-V2** (quando o catálogo começa a gravar `style.vetor`): CP-X0 — guarda no servidor para camadas **e**
  páginas, ou aposentadoria formal do push. (Codex 3)
- Desenhar vetor no desktop (Konva 10, formato próprio) fica fora deste plano.

## 20. MCP / IA

- `compor-arte`, `compor-leva`, `medir-copy`: `preferencias.arquetipo = { id, versao?, params? }` — inclusive
  **`src/lib/compositor/medir-copy-service.ts:72-83,102-103`**, que hoje reconstrói a spec só com `variante` e `arranjos`
  e perderia o arquétipo. (Codex 6)
- `ver-assinatura` lista os arquétipos que a marca suporta; instruções do MCP ganham uma linha (o script de validação
  recusa tool inexistente).
- O Dot/diretor **usa** arquétipo como parâmetro explícito; **escolher** sozinho é CP-T6, depois do CP1.

---

## 21. Checkpoints

### Trilha X — guardas (P0, antes do catálogo chegar à equipe)

#### CP-X0 · Guarda do push do desktop (camadas e páginas) — **P0 · S** (ou decisão de aposentar o push)
- **Objetivo:** o `PUT /api/templates/[id]` com `designData.pages` (caminho do desktop) (1) preserva, por id de camada,
  as chaves de `style` e `metadata` que o payload não traz (`pathData`, `pathViewBox`, `pathFillRule`, `vetor`, `mask`,
  `flipH/V`, `slot`, `compositor`…) e (2) **não apaga páginas** ausentes do payload quando elas têm conteúdo que o desktop
  não conhece — ou recusa com 409 o push que causaria perda. Alternativa: aposentar o push.
- **Arquivos:** `src/app/api/templates/[id]/route.ts:198-298`; novo `src/lib/templates/mesclar-camadas-do-desktop.ts` +
  `__tests__`.
- **Risco:** baixo — o desktop não edita esses campos.
- **Testes:** helper puro com fixtures no formato do normalizador do Electron
  (`desktop-app/electron/services/sync/template-normalizer.ts:166-344`); página ausente do payload não é apagada.
- **Critério de saída:** push no formato do desktop não remove `pathData`/`vetor` nem páginas.
- **Depende de:** decisão do owner. **Antes de:** CP-V2.
- **Rollback:** reverter.

#### CP-X1 · `/gerar-criativo` seguro para vetor — **P0 · S**
- **Objetivo:** a prévia do assistente desenha `svg-path` pela `desenharSvgPath` (fim do `Rect`) **ou** o `finalize`
  recusa página com `svg-path` até isso existir; decisão do owner pode ser aposentar a via. (Codex 2)
- **Arquivos:** `src/components/gerar-criativo/components/canvas-preview.tsx:244-299,548-606`;
  `src/app/api/gerar-criativo/finalize/route.ts:22-35`.
- **Testes:** fixture com `svg-path` → finalize recusa (ou PNG com a forma certa).
- **Critério de saída:** nenhum caminho publica retângulo no lugar de vetor.
- **Depende de:** CP-V0. **Antes de:** CP-V2.
- **Rollback:** reverter.

#### CP-X2 · Validação de `svg-path` nas portas de escrita — **P0 · S**
- **Objetivo:** PATCH de página, PATCH de camada, POST de página e PUT do template validam camadas `svg-path`
  (`pathData` só com comandos de path, ≤ 16 KB; `vetor.partes` ≤ 8; cores por `lerCor`); 422 explícito. (Codex 4)
- **Arquivos:** `src/app/api/templates/[id]/pages/[pageId]/route.ts:43-55`; `src/app/api/pages/[pageId]/layers/[layerId]/route.ts:52-68`;
  `src/app/api/templates/[id]/pages/route.ts:11`; `src/app/api/templates/[id]/route.ts:255-260`; validador em
  `src/lib/vetor/validar.ts` (usado também pelo `layer-contract.ts`).
- **Risco:** travar o autosave de página existente → **antes de ligar**, consulta de leitura que roda o validador sobre
  todas as camadas `svg-path` de produção (owner/dev branch); se alguma falhar, corrigir o dado primeiro. **Se o PR #225
  entrar** (o `reverter-arte` passa a RECUSAR snapshot com qualquer problema do `validarCamadas`), a varredura cobre
  também `Generation.fieldValues.layersSnapshot`: validador novo dentro do `layer-contract.ts` reprovando snapshot antigo
  = reverter recusado para aquela arte.
- **Testes:** cada porta recusa path inválido/excessivo e aceita todas as formas da biblioteca.
- **Critério de saída:** zero falhas na consulta prévia; testes verdes.
- **Depende de:** CP-V0. **Antes de:** CP-V2.
- **Rollback:** reverter.

### Trilha V — vetores

#### CP-V0 · Traçado único do `svg-path` (paridade editor↔servidor) — **P0 · M**
- **Objetivo:** `desenharSvgPath` pura + parse memoizado usada pelos dois renderers; `fillRule` no editor; contorno em px
  da camada nos dois lados; `tracoPontas`; validador de path (usado depois pelo CP-X2).
- **Arquivos:** novo `src/lib/vetor/{tipos,tracar,desenhar,validar}.ts` + `__tests__`;
  `src/components/templates/konva-layer-factory.tsx:1518-1560`; `src/lib/render-engine.ts:1840-1863`;
  `src/types/template.ts:191-195`; `docs/regras/editor-e-galeria.md`.
- **Risco:** muda pixel de propósito (§18) — por isso o **inventário de diferenças** é parte do critério de saída; spike
  do import do parser no servidor no primeiro dia.
- **Testes:** unitários de `desenharSvgPath`; fixture comum (§17) no `CanvasRenderer` e na miniatura avulsa; inventário.
- **Critério de saída:** inventário anexado ao PR com só as diferenças previstas; preenchimentos idênticos; contorno igual
  nos dois eixos e nos dois renderers; verdes typecheck/lint/test:unit; regra registrada.
- **Depende de:** nada.
- **Rollback:** reverter o PR (os dois renderers voltam juntos); se houve re-render, rodar de novo depois do revert.

#### CP-V1 · Inverter e travar proporção em forma — **P0 · S**
- **Objetivo:** `style.flipH/flipV` desenhados por `desenharSvgPath` (editor e servidor); `style.manterProporcao` →
  `keepRatio` e só alças de canto; botões no `ShapeControls`.
- **Arquivos:** `src/lib/vetor/desenhar.ts`; `konva-transformer.tsx:120-139,286`; `properties-panel.tsx`; `src/types/template.ts`.
- **Risco:** forma girada + flip — o flip é dentro da caixa; espelhar arrastando continua bloqueado
  (`konva-transformer.tsx:143-145`).
- **Testes:** `desenharSvgPath` com flip; pixel de path assimétrico invertido (fixture comum).
- **Critério de saída:** inverter H/V igual no editor e no servidor; proporção travada no editor; camadas sem os campos
  não mudam.
- **Depende de:** CP-V0.
- **Rollback:** reverter; camada com `flipH` volta a sair sem espelhar.

#### CP-V2 · Biblioteca de elementos + painel "Elementos" + cor por papel na inserção — **P0 · M**
- **Objetivo:** `ShapeDefinition` estendida; 10 itens do MVP (4 presets + 6 svg-path novos); rail funde "Formas" em
  "Elementos"; 8 categorias; busca PT/EN; **inserção resolve cada slot pelo papel padrão** com o resolvedor puro (que
  nasce aqui, mínimo) e grava `vetor.asset` + `vetor.papeis` — a cor de vitrine nunca vai para a camada. (Codex 8)
- **Arquivos:** `src/lib/assets/shapes-library.ts` + novo `src/lib/assets/__tests__/shapes-library.test.ts`; novo
  `src/lib/brand/papeis-de-cor.ts` + `__tests__`; `src/components/templates/panels/shapes-panel.tsx`;
  `panels/elements-panel.tsx`; `template-editor-shell.tsx`; `src/hooks/use-project-elements.ts`; `src/hooks/use-project.ts`;
  `docs/regras/editor-e-galeria.md`.
- **Risco:** a equipe já conhece "Formas"; ids da biblioteca alimentam máscaras — não renomear/apagar; marca sem
  assinatura (cadeia de fallback do resolvedor).
- **Testes:** dados do catálogo; resolvedor (fixtures); inserção usa o resolvedor (função pura); smoke de render de todos
  os itens do MVP na fixture comum.
- **Critério de saída:** cada item entra centrado, selecionado, com 1 desfazer, com as cores da marca, e sai igual no
  servidor.
- **Depende de:** CP-V0, **CP-X0, CP-X1, CP-X2**.
- **Rollback:** reverter; camadas criadas continuam `svg-path` válidas.

#### CP-V3 · UI de cores por slot — **P0 · M**
- **Objetivo:** `ShapeControls` com slots; Marca → Nesta página → Personalizada (`HexColorField`); `lerCor` (swatch
  ativo com `rgba`); elo "acompanha a marca" (escolha explícita remove o papel); "Reaplicar cores da marca" na camada
  (com desfazer, preservando alfa); aba Marca invalida `['brand-colors']`. **Sem tocar nos resolvedores do halo.** (Codex 5)
- **Arquivos:** `properties-panel.tsx:1398-1544`; `brand-color-swatches.tsx:31-37`; `hex-color-field.tsx`;
  `src/lib/vetor/cor.ts` (`lerCor`); `src/components/projects/project-assets-panel.tsx:1182,1209`.
- **Risco:** cache de paleta de 5 min (mitigado pela invalidação); UX de "elo" — rótulo claro.
- **Testes:** funções puras (reaplicar, escolha explícita, cores nesta página); `lerCor`.
- **Critério de saída:** swatch ativo; escolha manual desfaz o elo; reaplicar restaura; tudo desfazível.
- **Depende de:** CP-V2.
- **Rollback:** reverter (só UI).

#### CP-V4 · Toolbar contextual de forma (+ celular) — **P1 · M**
- `ShapeToolbar` na zona de 118 px: slots, contorno, inverter, proporção, opacidade; aparece no celular.
  Arquivos: novo `shape-toolbar.tsx`; `editor-canvas.tsx:136-142,446-457`. Depende de CP-V1, CP-V3.

#### CP-V5 · Vetor multicolor (partes por slot) — **P1 · L**
- `style.vetor.partes` + `cores` em `desenharSvgPath`; `hitFunc` de caixa; "meet"; silhueta mantida; canonização deixa a
  opacidade para o renderer quando há partes; dependências do cache do blur; itens multicor (`onda-base`); N slots na UI.
- Arquivos: `src/lib/vetor/*`; `konva-layer-factory.tsx:1450-1462,1518-1560`; `render-engine.ts:1840-1863` (+ opacidade em
  `renderLayer`); `src/lib/shape-style.ts:132-168`; `shapes-library.ts`; `properties-panel.tsx`.
- Testes: fixture comum com 3 slots (amostra por slot), `evenodd`, opacidade, "meet"; protocolo de performance
  (`ARQUITETURA-VETORES.md` §7). Depende de CP-V3 (e das guardas X0–X2, já feitas).

#### CP-V6 · Importador de SVG para curadoria — **P2 · L**
- `scripts/importar-vetor.ts` + `src/lib/vetor/importar.ts` (puro): sanitiza (allowlist), normaliza, separa slots por cor,
  aplica tetos e **emite a entrada de catálogo** — nenhum SVG vai para o banco nem para o Blob. Fixtures maliciosas
  (`script`, `onload`, `foreignObject`, `href` externo, `@import`) recusadas. Depende de CP-V5.

#### CP-V7 · Papel na `BrandColor` e unificação dos resolvedores — **P2 · S/M**
- Coluna anulável `papel` (migração aditiva) e UI na aba Marca, só com evidência de cliente em que a derivação erra;
  unificar `corEscuraDaMarca`/`corDaManchaDoProjeto` com o resolvedor só com fixtures reais provando a mesma saída.

### Trilha T — arquétipos e modelos

#### CP-T0 · Arquétipos em código — **P0 · S**
- **Objetivo:** tipos (zod), MIN-01/MIN-02 e os 3 presets do MVP, zonas por formato em frações, `zonasNoFormato(arquetipo,
  formato, geometriaEfetiva)` (recebe a geometria que `montarAssinatura` devolve; `NUMEROS_PADRAO` só nos testes e como
  piso), acentos permitidos, versão imutável.
- **Arquivos:** novo `src/lib/compositor/arquetipos/{tipos,catalogo,zonas,index}.ts` + `__tests__`.
- **Testes:** schema; presets dentro da área segura com a geometria padrão **e** com uma geometria derivada de página
  (margens maiores); ids únicos.
- **Critério de saída:** testes verdes. **Depende de:** nada. **Rollback:** apagar o módulo.

#### CP-T1a · Arquétipo na spec, no MCP e no `medir-copy` (sem acento) — **P0 · M**
- **Objetivo:** `preferencias.arquetipo`; mapeamento para `ancora`/`alinha`/`cantoDaMarca`/`enquadramento`; o
  compositor **grava as preferências efetivas na spec** (`arquetipo.efetivo = true`) antes de persistir; recomposição usa
  as efetivas e não relê o catálogo (Codex 7); conflito explícito na primeira composição → `ARQUETIPO_CONFLITA_COM_PREFERENCIA`;
  procedência (`composicao.arquetipo` com `avisosDeZona`); **`medir-copy-service` passa o arquétipo** (Codex 6); MCP
  `compor-arte`/`compor-leva`/`medir-copy` + fixtures do registro; presets #1 e #3 (sem acento).
- **Arquivos:** `src/lib/compositor/spec.ts:108-136`; `compor.ts:173-188,401-434,1110-1142`; `persistencia.ts:125-144`;
  `defasagem.ts:545-568`; **`medir-copy-service.ts:72-83,102-103`**; `src/lib/mcp/catalogo/compositor.ts:62-79`;
  `scripts/validar-registro-mcp.ts`; `docs/regras/compositor.md`; `docs/regras/mcp.md`.
- **Risco:** variante sorteada estruturalmente incompatível com o arquétipo → com arquétipo, preferir a variante padrão do
  formato; nada de tratamento novo (CP1).
- **Testes:** preferências efetivas gravadas; recomposição reproduz com o catálogo alterado (mock); `medir-copy` e
  `comporPeca` com a mesma variante e geometria; avisos de zona; snapshot do registro.
- **Critério de saída:** `compor-arte` (`provar: true`) com os presets #1 e #3 × 3 marcas reais (branch de dev) aprovado
  pelo owner.
- **Depende de:** CP-T0. **Rollback:** reverter; specs gravadas com `arquetipo` têm as efetivas explícitas — a
  recomposição segue igual (o schema antigo descarta só a chave `arquetipo`).

#### CP-T1b · Acento preso ao texto + `ver-assinatura` — **P0 · M**
- **Objetivo:** acento `svg-path` (item do catálogo) preso ao grupo do headline (lado/eixo do arquétipo), cor pelo papel
  `texto` (cor do headline na assinatura) ou `destaque`, **congelado** na spec (`preferencias.acento = {id, versao, papel,
  cor}`); preset #2 (fio em L); `ver-assinatura` lista arquétipos compatíveis; linha nas instruções do MCP.
- **Arquivos:** novo `src/lib/compositor/arquetipos/acento.ts`; `compor.ts:1012-1034`; `src/lib/mcp/catalogo/compositor.ts:220-270`;
  `src/lib/mcp/instrucoes.ts`; `docs/regras/compositor.md`.
- **Risco:** acento colidindo com texto ou logo (reusar a checagem de encosto); polaridade (o papel `texto` herda a do
  headline).
- **Testes:** acento presente, cor = headline, recomposição mantém o acento congelado.
- **Critério de saída:** os 3 presets × 3 marcas aprovados pelo owner.
- **Depende de:** CP-T1a, CP-V2 (itens e resolvedor). **Rollback:** reverter.

#### CP-T2 · Aba "Layouts" no editor — **P1 · M**
- **Objetivo:** 3ª aba do `EditorSidebar`; cards com prévia HTML (técnica do `ComboCard`); "Usar layout" chama a rota.
- **Contrato da rota `POST /api/templates/[id]/pages/from-layout`** (Codex 10):
  - entrada: `{ arquetipo: { id, params? }, aPartirDaPagina: pageId, fotoUrl?: string }`; gate `hasProjectWriteAccess`;
  - **foto:** `fotoUrl` explícita; senão a camada `bg-foto` da página; senão a maior camada `image` que cubra ≥ 90% da
    página; senão **409 `LAYOUT_SEM_FOTO`** (a UI abre o painel de imagens);
  - **textos:** camadas de texto da página com papel (`metadata.compositor.papel`, depois `papelDoNome`) viram os blocos;
    sem headline → **placeholder** "Título" (e "Serviço" etc.), e o nome da página nasce "Layout — <preset> (rascunho)";
  - marca sem página de assinatura → **422 `ASSINATURA_INCOMPLETA`** (o card fica desabilitado com o motivo);
  - composição: `comporPeca(spec, { somenteAvaliar: true })` (`compor.ts:1148`) → `prepararCamadasParaGravar` → página
    nova `isTemplate: false`, tags `['layout', 'arquetipo:<id>']`, **ordem logo depois da página de origem**, fundo = a foto;
  - saída: `{ pageId }`; a UI navega para ela. A página de origem não muda.
  - **aplicar na página aberta** (só se o owner pedir — decisão 7): `replacePageContent` do PR #226 (entra no desfazer),
    nunca `loadTemplate`, que pula o histórico e deixa o autosave gravar a troca sem volta.
- **Arquivos:** `sidebar/editor-sidebar.tsx:24`; novo `sidebar/layouts-panel.tsx`; nova rota; `src/hooks/use-pages.ts`/
  `use-page-actions.ts`; `docs/regras/editor-e-galeria.md`.
- **Testes:** rota (mock do compositor; cada erro; gate); **página persistida reaberta pelo GET com as camadas**; função
  "textos por papel"; QA manual.
- **Critério de saída:** "Usar layout" cria página editável com o preset, sem tocar na de origem.
- **Depende de:** CP-T1b. **Rollback:** reverter (UI + rota).

#### CP-T3 · Foto em caixa no compositor (famílias B e C) — **P1 · L**
- `varianteDoArquetipo` (variante de assinatura sintetizada em memória) em `carregarAssinatura`; `bg-foto` em caixa com
  máscara (`arco-janela`, círculo, cápsula) e fundo por papel; régua sobre a caixa; presets #8–#13; variante promovida
  fora do rodízio. Arquivos: `src/lib/compositor/arquetipos/variante.ts`; `compor.ts:213-286,330-337,965-983`;
  `assinatura.ts:324-441,541-634`; `shapes-library.ts`. Depende de CP-T1b e do **aval do owner** (estilo da casa).

#### CP-T4 · Catálogo completo (Story + Feed) — **P1 · M**
- Presets #4–#7 (A), #15–#16 (E; exige spec sem foto), feed de todos; página de QA com `provar` em 3 marcas.
  Depende de CP-T1b (+ CP-T3 para B/C).

#### CP-T5 · Promover layout a variante editável da marca — **P2 · M**
#### CP-T6 · Diretor/Dot escolhendo arquétipo — **P2 · L** (depois do CP1; preferências no `ItemDePlano` = migração)

---

## 22. Ordem recomendada

```
 CP-V0 ──┬── CP-X1 ──┐
         ├── CP-X2 ──┤
 CP-X0 ──┼───────────┼── CP-V2 ── CP-V3 ══ MVP-V ══ CP-V4 · CP-V5 · CP-V6
         └── CP-V1 ──┘     │
 CP-T0 ── CP-T1a ──────── CP-T1b ══ MVP-T ══ CP-T2 ── CP-T4
                                             └── CP-T3 (aval) ── CP-T4 (B/C)
```

Paralelo desde o dia 1: **CP-V0**, **CP-T0** e a decisão do **CP-X0**. CP-T1a não depende da trilha V.

## 23. MVP (escopo declarado — Codex 12, 13, 15)

O MVP são **duas entregas independentes**, com critérios próprios:

| Entrega | Checkpoints | Critério de aceitação |
|---|---|---|
| **MVP-V · Elementos no editor web (desktop)** | X0 (ou aposentar o push), V0, X1, X2, V1, V2, V3 — 7 PRs (3 M + 4 S) | no editor web de computador: inserir os 10 itens, recolorir por papel da marca, inverter, travar proporção; pixel igual editor × servidor na fixture comum; push do desktop sem perda; `/gerar-criativo` sem retângulo |
| **MVP-T · Composição minimalista pelo MCP** | T0, T1a, T1b — 3 PRs | `compor-arte`/`compor-leva` com os 3 presets × 3 marcas aprovados pelo owner; `medir-copy` coerente; recomposição reproduz |

**Fora do MVP, de propósito:** aba Layouts (CP-T2, primeiro P1), toolbar e recolor de forma no celular (CP-V4 — o celular
fica como hoje), multicor (CP-V5), famílias B/C/E.

Teste da hipótese do owner:

| Hipótese | Veredito |
|---|---|
| painel Elementos | ✅ CP-V2 |
| 10 SVGs | ✅ 4 presets do que existe + 6 `svg-path` novos de 1 cor |
| 1–2 color slots | ✅ **sem renderer novo** (`fill` + `strokeColor`) |
| BrandColor | ✅ com ajuste: papéis `escuro/claro/destaque/texto`; `primary/secondary` não (sem dado) |
| resize/rotate | ✅ já existe |
| flip | ✅ custa os dois renderers (CP-V1, S) |
| persistência | ✅ dado novo só em `style` — mas **com validação nas portas** (CP-X2) |
| export | ✅ herda; com a fixture comum provando |
| 3 arquétipos | ⚠ **2 arquétipos (MIN-01, MIN-02), 3 presets**; MIN-03 espera o gate de logo do CP1 |
| 3 templates minimalistas | ✅ como presets, entregues pelo MCP |
| ➕ faltava | CP-V0 (paridade) e as guardas X0/X1/X2 |
| ➖ sai | aba Layouts e celular ficam P1 |

## 24. Versão final desejada

31 itens no catálogo (20 `svg-path` novos), 8 categorias, busca PT/EN, slots de 1 a 4 cores, papéis com elo e
"reaplicar"; 12 arquétipos em 5 famílias; 17 presets (Story + Feed); aba Layouts; materialização pelo compositor com
procedência e receita congelada; diretor e Dot pedindo arquétipo por parâmetro (escolhendo, depois do CP1); importador
de SVG para a curadoria.

## 25. Maiores riscos

1. **Mudança de pixel do CP-V0** (contorno, `fillRule` no editor, parser) — inventário antes, re-render depois,
   `laterPostId` intocável.
2. **Desktop apaga camadas e páginas no push** — CP-X0 antes do catálogo.
3. **`/gerar-criativo` publica retângulo** — CP-X1 antes do catálogo.
4. **Validação nas portas travar autosave** — consulta prévia; zero falhas antes de ligar.
5. **Halo mudar por "unificação" de resolvedor** — não unificar no MVP.
6. **Medir e compor divergirem com arquétipo** — `medir-copy-service` no CP-T1a + teste.
7. **Receita em código mudar peça antiga** — preferências efetivas congeladas; versão imutável.
8. **Duas fontes de posição** (variante × arquétipo) — preferir variante padrão; zonas como alvo com aviso.
9. **Estilo da casa** × famílias B/C e MIN-11 — aval antes do CP-T3.
10. **CP1 em curso** — `tratamento` e `logo.zona` fora até lá.
11. **Parser no servidor** — spike no primeiro dia do CP-V0.

## 26. Arquivos principais afetados (por checkpoint)

| CP | Arquivos |
|---|---|
| X0 | `src/app/api/templates/[id]/route.ts` · `src/lib/templates/mesclar-camadas-do-desktop.ts` (novo) |
| X1 | `src/components/gerar-criativo/components/canvas-preview.tsx` · `src/app/api/gerar-criativo/finalize/route.ts` |
| X2 | `src/app/api/templates/[id]/pages/[pageId]/route.ts` · `src/app/api/pages/[pageId]/layers/[layerId]/route.ts` · `src/app/api/templates/[id]/pages/route.ts` · `src/app/api/templates/[id]/route.ts` · `src/lib/vetor/validar.ts` · `src/lib/creatives/layer-contract.ts` |
| V0 | `src/lib/vetor/*` (novo) · `src/components/templates/konva-layer-factory.tsx` · `src/lib/render-engine.ts` · `src/types/template.ts` |
| V1 | `src/lib/vetor/desenhar.ts` · `src/components/templates/konva-transformer.tsx` · `properties-panel.tsx` |
| V2 | `src/lib/assets/shapes-library.ts` · `src/lib/brand/papeis-de-cor.ts` (novo) · `panels/shapes-panel.tsx` · `panels/elements-panel.tsx` · `template-editor-shell.tsx` · `src/hooks/use-project-elements.ts` · `src/hooks/use-project.ts` |
| V3 | `properties-panel.tsx` · `brand-color-swatches.tsx` · `hex-color-field.tsx` · `src/lib/vetor/cor.ts` · `src/components/projects/project-assets-panel.tsx` |
| V4 | `shape-toolbar.tsx` (novo) · `editor-canvas.tsx` |
| V5 | `src/lib/vetor/*` · `konva-layer-factory.tsx` · `render-engine.ts` · `src/lib/shape-style.ts` · `shapes-library.ts` |
| T0 | `src/lib/compositor/arquetipos/*` (novo) |
| T1a | `src/lib/compositor/{spec,compor,persistencia,defasagem,medir-copy-service}.ts` · `src/lib/mcp/catalogo/compositor.ts` · `scripts/validar-registro-mcp.ts` |
| T1b | `src/lib/compositor/arquetipos/acento.ts` (novo) · `compor.ts` · `src/lib/mcp/catalogo/compositor.ts` · `src/lib/mcp/instrucoes.ts` |
| T2 | `sidebar/editor-sidebar.tsx` · `sidebar/layouts-panel.tsx` (novo) · `src/app/api/templates/[id]/pages/from-layout/route.ts` (novo) · `src/hooks/use-pages.ts` |
| T3 | `src/lib/compositor/arquetipos/variante.ts` (novo) · `compor.ts` · `assinatura.ts` · `shapes-library.ts` |
| Regras | `docs/regras/editor-e-galeria.md` · `docs/regras/compositor.md` · `docs/regras/mcp.md` |

## 27. Decisões do owner (antes de começar)

> As respostas ficam na página https://claude.ai/artifact/NvqXoJauyywfptSbdpky9h (coleção `decisoes`, um documento
> por item: `d01`…`d11` e `p225a`, `p225b`, `p226a`, `p226b`). Ler com `ArtifactData list` antes de implementar.

1. **Papéis de cor:** `escuro / claro / destaque / destaque2 / texto` no lugar de `brand.primary/secondary/accent/light/dark`?
2. **Desktop:** o push ainda é usado? (CP-X0 com guarda, ou aposentar o push)
3. **`/gerar-criativo`:** aposentar a via ou desenhar vetor nela (CP-X1)?
4. **Estilo da casa:** divisão foto/cor (família B) e molduras de foto (família C) entram no automático? MIN-11 só manual?
5. **Rail:** fundir "Formas" em "Elementos"?
6. **Escopo do MVP:** duas entregas (editor web desktop + composição por MCP), com Layouts e celular em P1 — ok?
7. **"Usar layout":** só página nova no v1?
8. **Propagação de paleta:** só por "reaplicar"?
9. **MIN-03 e logo `topo-centro`:** esperar o CP1?
10. **Consultas de leitura:** autorizar a contagem de `svg-path` com contorno em páginas agendadas (inventário do
    CP-V0) e a varredura do validador (CP-X2)?
11. **Catálogo em código** (curadoria por PR) no v1; upload de SVG da marca só na P2?
