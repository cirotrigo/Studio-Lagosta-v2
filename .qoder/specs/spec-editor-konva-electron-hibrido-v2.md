# Especificação v2 (Atualizada): Editor Konva-Only para Electron

## 1. Decisão de Produto

A partir desta versão, o módulo de artes no desktop será **100% Konva + JSON**.

### O que muda
- **Removido como motor de geração:** pipeline HTML/DS.
- **Fonte oficial de identidade visual:** assets do projeto já configurados no web.
- **Preview, edição e export:** mesmo motor Konva (WYSIWYG real).

### Objetivo
Permitir criar, automatizar, reaproveitar e editar artes com total flexibilidade visual, sem bloqueio por templates HTML/CSS rígidos.

---

## 2. Escopo Funcional

## 2.1 Editor Konva (core)
- Edição visual completa de templates e artes.
- Multi-page (carrossel/múltiplas variações).
- Seleção múltipla, transform, snap/smart guides, zoom, copy/paste.
- Undo/redo (v1 linear, árvore em fase avançada).
- Painel de propriedades e painel de layers.

## 2.2 Tipos de layer suportados
- `text`
- `rich-text`
- `image`
- `gradient`
- `gradient2`
- `shape`
- `icon`
- `logo`
- `element`
- `video`

Total: **10 tipos**.

## 2.3 Shapes base
- `rectangle`
- `rounded-rectangle`
- `circle`
- `triangle`
- `star`
- `arrow`
- `line`

## 2.4 Automação com slots (JSON)
- Templates Konva possuem `slot bindings` por layer.
- LLM retorna copy estruturada (title/description/cta/badge etc.).
- Engine aplica copy nos slots com constraints (maxLines, overflowBehavior, min/max font).
- Usuário edita cada variação no Konva antes da aprovação.

---

## 3. Fonte de Identidade (sem Design System HTML)

A identidade visual deve vir **somente do projeto web**, via APIs já existentes.

## 3.1 Endpoints de referência
- `GET /api/projects/:id/brand-assets`
  - nome da marca, logo, cores, fontes, preferências de texto/overlay.
- `GET /api/projects/:id/brand-style`
  - descrição de estilo e referências visuais.
- `GET /api/projects/:id/art-templates`
  - templates existentes (agora com engine Konva).
- `GET /api/knowledge?projectId=:id`
  - base de conhecimento do projeto (horários, cardápio, campanhas, diferenciais, FAQ etc.).

## 3.2 Regras
- Não usar parser de HTML/ZIP de Design System para renderização.
- Não depender de CSS externo para composição final da arte.
- Tokens visuais no desktop são derivados de `brand-assets` e salvos no documento Konva.
- A geração de copy deve injetar contexto da base de conhecimento do projeto por padrão.

## 3.3 Injeção de Base de Conhecimento (RAG)
- O prompt do usuário é enriquecido automaticamente com contexto relevante da base do projeto.
- Prioridade de categorias para artes promocionais:
  1. `CAMPANHAS`
  2. `HORARIOS`
  3. `CARDAPIO`
  4. `DIFERENCIAIS`
- O contexto é extraído por busca semântica (RAG) usando `projectId` como isolamento.
- Regras de segurança de conteúdo:
  - Não inventar horário, preço, endereço ou condição comercial quando não houver contexto.
  - Se houver conflito entre prompt e base, retornar aviso interno e manter “pedido do usuário” como prioridade editável.
  - Informações críticas (dias/horários/valores) devem ser preferencialmente preenchidas em `description`, `badge` e `footer_info_*`.

---

## 4. Arquitetura

## 4.1 Renderer (React + Konva)
- EditorShell, EditorStage, LayerFactory, PropertiesPanel, LayersPanel, PagesBar.
- Stores Zustand (`editor`, `pages`, `history`, `sync`, `gallery`).
- Aplicação de copy automatizada via slot binder.

## 4.2 Main Process (Electron)
- Persistência local JSON.
- Exportação (PNG/JPEG) e batch.
- Sincronização pull/push com API web.
- Gerenciamento de fila offline.

## 4.3 IPC
- Renderer não acessa filesystem diretamente.
- Todo I/O passa por `ipcMain.handle` + preload.

---

## 5. Persistência Local (JSON-only)

## 5.1 Decisão
- **Persistência oficial:** JSON files.
- **Não usar SQLite nesta iniciativa.**

## 5.2 Caminhos
- macOS: `~/Library/Application Support/LagostaTools/`
- Windows: `%APPDATA%/LagostaTools/`

## 5.3 Estrutura

```txt
LagostaTools/
├── projects/
│   └── {projectId}/
│       ├── settings.json
│       ├── templates/
│       │   ├── {templateId}.json
│       │   └── thumbs/{templateId}.png
│       ├── generations/
│       │   └── {generationId}.json
│       └── history/
├── gallery/
├── sync/
│   ├── queue.json
│   └── last-sync.json
└── config.json
```

## 5.4 Regras de robustez
- Escrita atômica (`tmp` + `rename`).
- `schemaVersion` obrigatório em todo documento.
- Migração de schema por versão.
- Fila com deduplicação (`projectId + entityId + op`).

---

## 6. Modelo de Dados

## 6.1 Documento de template Konva

```ts
export type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export interface KonvaTemplateDocument {
  schemaVersion: 2
  id: string
  projectId: number
  engine: 'KONVA'
  name: string
  format: ArtFormat
  source: 'local' | 'synced'

  design: {
    pages: KonvaPage[]
    currentPageId: string
  }

  identity: {
    brandName?: string
    logoUrl?: string
    colors: string[]
    fonts: Array<{ name: string; fontFamily: string; fileUrl?: string }>
    textColorPreferences?: {
      titleColor?: string
      subtitleColor?: string
      infoColor?: string
      ctaColor?: string
    }
  }

  slots: SlotBinding[]

  meta: {
    fingerprint?: string
    createdAt: string
    updatedAt: string
    syncedAt?: string
    isDirty: boolean
    thumbnailPath?: string
  }
}

export interface KonvaPage {
  id: string
  name: string
  width: number
  height: number
  background?: string
  order: number
  layers: Layer[]
  thumbnailPath?: string
}

export interface SlotBinding {
  id: string
  layerId: string
  fieldKey:
    | 'pre_title'
    | 'title'
    | 'description'
    | 'cta'
    | 'badge'
    | 'footer_info_1'
    | 'footer_info_2'
  label: string
  constraints?: {
    maxLines?: number
    maxCharsPerLine?: number
    minFontSize?: number
    maxFontSize?: number
    overflowBehavior?: 'scale-down' | 'ellipsis' | 'clip'
  }
}
```

### Regras do schema
- IDs de template são `string`.
- Fonte única de layer: `design.pages[].layers`.
- Não duplicar `layers` fora de `pages`.

---

## 7. Fluxo de Automação (Konva-only)

## 7.1 Geração
1. Usuário escolhe projeto, formato e template Konva.
2. Seleciona foto e prompt base.
3. Define variações (`1`, `2`, `4` inicialmente).
4. Pipeline consulta base de conhecimento do projeto (RAG) com base no prompt.
5. LLM gera copy estruturada em JSON com contexto do projeto.
6. Slot binder aplica copy no documento Konva.
7. Sistema cria variações em fila e mostra preview Konva.

## 7.2 Aprovação
- Aprovação por variação (não bloqueante).
- Edição textual/visual no próprio Konva antes de aprovar.
- Após aprovar: export final e persistência em histórico.

## 7.3 Reedição
- Arte aprovada abre em modo editor com estado completo.
- Suporte a “Salvar como novo template”.

## 7.4 Exemplo de uso (Happy Hour)
Entrada do usuário:
- Prompt: “Crie variações sobre o happy hour com essa foto.”

Comportamento esperado:
1. RAG encontra na base dados de campanha (dias/horários/regras).
2. Copy já vem com informações relevantes sem o usuário repetir detalhes.
3. Usuário aprova direto ou ajusta no Konva.
4. Variações aprovadas vão para histórico/publicação.

---

## 8. Exportação

## 8.1 Escopo v1
- `PNG`
- `JPEG`

## 8.2 Pipeline
1. Konva gera canvas por página/variação.
2. Buffer vai via IPC para o main.
3. Main aplica pós-processamento (Sharp) quando necessário.
4. Salva em disco e retorna paths.

## 8.3 Dimensões padrão
- `STORY`: `1080x1920`
- `FEED_PORTRAIT`: `1080x1350`
- `SQUARE`: `1080x1080`

## 8.4 Fora do v1
- SVG vetorial completo.

---

## 9. Sincronização Offline-First

## 9.1 Estados
`idle | offline | syncing | conflict | error`

## 9.2 Regras
- Toda alteração local gera operação em `sync/queue.json`.
- `push` com idempotência (`operationId`).
- `pull` atualiza snapshot remoto sem perder alterações locais.
- Conflito por `updatedAt + hash`.
- Estratégias: `keep-local`, `keep-remote`, `duplicate-local`.

## 9.3 Auth
- Reaproveitar sessão desktop já existente.
- Se `401`, tentar refresh antes de falhar.
- Nunca descartar fila local por erro de autenticação.

---

## 10. Contratos IPC

```ts
// Templates
'konva:template:list'      (projectId: number) => KonvaTemplateDocument[]
'konva:template:get'       (projectId: number, templateId: string) => KonvaTemplateDocument | null
'konva:template:save'      (projectId: number, doc: KonvaTemplateDocument) => { ok: true; id: string }
'konva:template:delete'    (projectId: number, templateId: string) => { ok: true }

// Generation/Automation
'konva:generation:prepare' (payload: GenerationPayload) => PreparedVariation[]
'konva:generation:approve' (payload: ApprovePayload) => { ok: true; files: string[] }
'konva:generation:knowledge-preview' (payload: KnowledgeQueryPayload) => { ok: true; snippets: KnowledgeSnippet[] }

// Export
'konva:export:single'      (payload: ExportSinglePayload) => { ok: true; filePath: string }
'konva:export:batch'       (payload: ExportBatchPayload) => { ok: true; files: string[] }

// Sync
'konva:sync:pull'          (projectId: number) => SyncPullResult
'konva:sync:push'          (projectId: number) => SyncPushResult
'konva:sync:status'        (projectId: number) => SyncStatus
```

---

## 11. Estrutura de Código

```txt
desktop-app/
├── src/
│   ├── components/editor/
│   ├── stores/
│   │   ├── editor.store.ts
│   │   ├── pages.store.ts
│   │   ├── history.store.ts
│   │   ├── sync.store.ts
│   │   └── gallery.store.ts
│   ├── hooks/
│   ├── pages/
│   │   ├── EditorPage.tsx
│   │   ├── TemplatesPage.tsx
│   │   └── GalleryPage.tsx
│   └── types/
└── electron/
    ├── ipc/
    └── services/
```

### Observação importante
`json-storage.ts` deve ficar no `electron/services` (main process), não no renderer.

---

## 12. Plano de Implementação

## Fase 1 — Fundação Konva-only (1-2 semanas)
- Limpar dependências de DS/HTML no fluxo de geração novo.
- Definir schema JSON v2 de template Konva.
- Implementar storage local JSON + IPC de template.
- Preparar stores Zustand base.

Critérios:
- salvar/carregar template local.
- typecheck web/electron sem erro.

## Fase 2 — Core Editor (2 semanas)
- Port de `EditorStage`, `LayerFactory`, `PropertiesPanel`, `LayersPanel`.
- Seleção, transform, zoom, copy/paste.

Critérios:
- WYSIWYG estável para edição manual.

## Fase 3 — Multi-page e Export (1-2 semanas)
- Pages bar, reorder, thumbnails.
- Export single/batch PNG/JPEG.

Critérios:
- export fiel sem corte indevido.

## Fase 4 — Automação por slots (1-2 semanas)
- Slot binding por layer.
- Aplicar copy estruturada + constraints.
- Aprovação por variação com reedição.

Critérios:
- gerar → ajustar → aprovar → salvar histórico.

## Fase 5 — Sync offline-first (2 semanas)
- queue, pull/push, resolução de conflito.
- indicadores de sync no UI.

Critérios:
- edição offline sem perda e sincronização previsível.

## Fase 6 — Avançado (backlog)
- Grouping de layers.
- Histórico em árvore.
- Export SVG vetorial.

---

## 13. Build e Distribuição (scripts reais)

```bash
npm --prefix desktop-app run dev:electron
npm --prefix desktop-app run build:electron
npm --prefix desktop-app run package:mac
npm --prefix desktop-app run package:win
npm --prefix desktop-app run package
```

---

## 14. Critérios de Aceite (MVP)

- Editor Konva cria e edita template completo.
- Template JSON aplica identidade do projeto web (`brand-assets`).
- Automação por slots gera variações editáveis no Konva.
- Aprovação salva arte final e permite reedição posterior.
- Export batch PNG/JPEG estável em fila.
- Sync offline-first funcional com resolução de conflito.

---

## 15. Não-objetivos desta versão

- Motor HTML/DS paralelo de geração.
- Parsing/import de Design System HTML/ZIP para render final.
- Export SVG vetorial completo.
- Histórico em árvore com merge visual.

Esses itens ficam fora desta fase para evitar rigidez e acelerar entrega do fluxo Konva-only.
