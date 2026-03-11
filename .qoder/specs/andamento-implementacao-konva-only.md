# Andamento da Implementação — Konva-Only

## Objetivo
Acompanhar progresso fase a fase, com hash de commit, validações executadas e próximos passos para continuidade entre conversas.

## Regras de execução
1. Implementar em fases pequenas e fechadas.
2. Ao final de cada fase:
   - executar validações,
   - commitar,
   - atualizar este arquivo.
3. Não avançar para próxima fase com typecheck quebrado.
4. Não reintroduzir pipeline HTML/DS no fluxo de geração.

## Comandos obrigatórios por fase
```bash
npm --prefix desktop-app run typecheck
npm --prefix desktop-app run typecheck:electron
```

## Convenção de commit
```txt
feat(konva-fase-X): <resumo objetivo da fase>
```

Exemplos:
- `feat(konva-fase-1): define schema v2 e contratos IPC`
- `feat(konva-fase-5): integra RAG da base de conhecimento no prompt-only`

---

## Status macro

| Fase | Nome | Status | Commit | Validação | Atualizado em |
|------|------|--------|--------|-----------|---------------|
| 0 | Alinhamento | ⬜ Não iniciado | - | - | - |
| 1 | Contratos e Schema | ✅ Concluído | 36e29e9 | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 2 | Storage JSON + IPC | ✅ Concluído | feat(konva-fase-2): implementa storage json atomico e ipc de templates | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 3 | Editor Konva Core | ✅ Concluído | feat(konva-fase-3): implementa editor konva core no desktop-app | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 4 | Multi-page + Formatos | ✅ Concluído | feat(konva-fase-4): implementa multipage e formatos instagram | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 4.1 | Refino de texto + geração no editor | ✅ Concluído | feat(konva-fase-4.1): refino de texto e gerar arte no editor com selecao de paginas | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 5 | Prompt-only + RAG | ⬜ Não iniciado | - | - | - |
| 6 | Fundo IA + Referências | ⬜ Não iniciado | - | - | - |
| 7 | Aprovação + Reedição | ⬜ Não iniciado | - | - | - |
| 8 | Export Single/Batch | ⬜ Não iniciado | - | - | - |
| 9 | Sync Offline-first | ⬜ Não iniciado | - | - | - |
| 10 | UX de simplicidade máxima | ⬜ Não iniciado | - | - | - |

Legenda status:
- ⬜ Não iniciado
- 🟨 Em andamento
- ✅ Concluído
- ⛔ Bloqueado

---

## Registro por fase

### Fase 0 — Alinhamento
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 1 — Contratos e Schema
- Escopo fechado: contratos tipados da base Konva-only com schema v2, payloads de geração/export/sync e mapa de canais IPC `konva:*`.
- Decisões:
  - `schemaVersion` fixo em `2` (`KONVA_TEMPLATE_SCHEMA_VERSION`) e IDs padronizados como `string`.
  - fonte única de layers em `design.pages[].layers`, sem duplicação fora de `pages`.
  - contratos de IPC definidos via `args/result map` por canal para reforçar tipagem de `invoke`.
- Arquivos alterados:
  - `desktop-app/src/types/template.ts`
  - `desktop-app/src/types/generation.ts`
  - `desktop-app/src/types/electron-ipc.ts`
  - `desktop-app/src/types/art-automation.ts`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `36e29e9 - feat(konva-fase-1): define schema v2 e contratos ipc konva-only`
- Próximo passo: implementar Fase 2 com storage JSON atômico no main process e handlers IPC de template/sync.

### Fase 2 — Storage JSON + IPC
- Escopo fechado: persistência local JSON no main process com escrita atômica e handlers IPC `konva:template:*`/`konva:sync:*` conectados ao preload.
- Decisões:
  - storage local em `appData/LagostaTools` com criação automática da árvore base.
  - escrita atômica via arquivo temporário (`.tmp-*`) + `rename`.
  - deduplicação da fila de sync por chave `projectId:entityId:op` em `sync/queue.json`.
  - handlers IPC modularizados e registrados no bootstrap do Electron.
- Arquivos alterados:
  - `desktop-app/electron/services/json-storage.ts`
  - `desktop-app/electron/ipc/template-handlers.ts`
  - `desktop-app/electron/ipc/sync-handlers.ts`
  - `desktop-app/electron/ipc/konva-ipc-types.ts`
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/preload.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-2): implementa storage json atomico e ipc de templates`
- Próximo passo: iniciar Fase 3 (Editor Konva Core), sem reintroduzir pipeline HTML/DS no motor de geração.

### Fase 3 — Editor Konva Core
- Escopo fechado: editor Konva funcional no `desktop-app` com `EditorPage`, persistência local via IPC da Fase 2, stage WYSIWYG para documento v2, seleção/transform, zoom/pan, smart guides básicos, painel de layers e painel de propriedades.
- Decisões:
  - portar apenas o núcleo estável do editor existente no repositório, sem reintroduzir pipeline HTML/DS.
  - usar `react-konva@18.2.14` com `konva@10.2.0`, compatíveis com React 18 do `desktop-app`.
  - manter histórico linear em store separada (`history.store.ts`) com limite de 100 snapshots e mutações centralizadas em `editor.store.ts`.
  - priorizar edição direta mínima no preview via `double click` para texto/imagem e edição detalhada no painel de propriedades.
- Arquivos alterados:
  - `desktop-app/package.json`
  - `desktop-app/package-lock.json`
  - `desktop-app/src/App.tsx`
  - `desktop-app/src/components/layout/Sidebar.tsx`
  - `desktop-app/src/pages/EditorPage.tsx`
  - `desktop-app/src/components/editor/EditorShell.tsx`
  - `desktop-app/src/components/editor/EditorStage.tsx`
  - `desktop-app/src/components/editor/LayerFactory.tsx`
  - `desktop-app/src/components/editor/LayersPanel.tsx`
  - `desktop-app/src/components/editor/PropertiesPanel.tsx`
  - `desktop-app/src/stores/editor.store.ts`
  - `desktop-app/src/stores/history.store.ts`
  - `desktop-app/src/stores/pages.store.ts`
  - `desktop-app/src/lib/editor/document.ts`
  - `desktop-app/src/lib/editor/formats.ts`
  - `desktop-app/src/lib/editor/smart-guides.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-3): implementa editor konva core no desktop-app`
- Próximo passo: iniciar Fase 4 com `PagesBar`, presets de formato Instagram, navegação multipágina, reordenação e thumbnails básicas.

### Fase 4 — Multi-page + Formatos
- Escopo fechado: barra de páginas integrada ao editor Konva com navegação, criação, duplicação, remoção, reordenação por drag-and-drop, presets globais de formato Instagram e thumbnails básicas por página no renderer.
- Decisões:
  - concentrar operações multipágina em `pages.store.ts`, desacoplando histórico/documento principal do runtime de thumbnails.
  - aplicar troca de formato em todo o documento com resize proporcional de páginas e layers para preservar integridade visual do schema v2.
  - gerar thumbnails localmente no renderer via Canvas 2D para manter o fluxo estável sem depender de export IPC nesta fase.
  - manter `currentPageId` no documento como fonte oficial do estado de navegação.
- Arquivos alterados:
  - `desktop-app/src/components/editor/EditorShell.tsx`
  - `desktop-app/src/components/editor/PagesBar.tsx`
  - `desktop-app/src/lib/editor/thumbnail.ts`
  - `desktop-app/src/stores/editor.store.ts`
  - `desktop-app/src/stores/pages.store.ts`
  - `desktop-app/src/pages/EditorPage.tsx`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-4): implementa multipage e formatos instagram`
- Próximo passo: parar nesta conversa e abrir a próxima a partir da Fase 5 (Prompt-only + RAG).

### Fase 4.1 — Refino de texto + geração no editor
- Escopo fechado: microtipografia persistida no schema Konva, ancoragem por safe-area, paleta/logos do projeto no painel de propriedades e fluxo local de `Gerar Arte` dentro do editor com seleção de páginas, foto do projeto e fila assíncrona.
- Decisões:
  - consolidar o cálculo de texto em `text-layout.ts` para manter stage, thumbnail e render local de geração lendo as mesmas regras de overflow/alinhamento.
  - reaproveitar a integração existente de fotos (`Drive` + `Upload`) e manter a geração desta fase local ao editor, sem puxar o pipeline completo de prompt/RAG da Fase 5.
  - aplicar a foto escolhida como layer de fundo em `cover`, ocupando toda a página, com variações por crop/foco para evitar faixas e manter o canvas preenchido.
  - usar hooks específicos para logos e cores do projeto, priorizando assets oficiais do web no painel sem criar fluxo paralelo.
- Arquivos alterados:
  - `desktop-app/src/components/editor/EditorShell.tsx`
  - `desktop-app/src/components/editor/EditorStage.tsx`
  - `desktop-app/src/components/editor/LayerFactory.tsx`
  - `desktop-app/src/components/editor/PropertiesPanel.tsx`
  - `desktop-app/src/components/editor/EditorGenerateArtModal.tsx`
  - `desktop-app/src/components/editor/EditorGenerationQueue.tsx`
  - `desktop-app/src/components/project/generate/PhotoSelector.tsx`
  - `desktop-app/src/pages/EditorPage.tsx`
  - `desktop-app/src/stores/editor-generation.store.ts`
  - `desktop-app/src/hooks/use-editor-generation-queue.ts`
  - `desktop-app/src/hooks/use-project-colors.ts`
  - `desktop-app/src/hooks/use-project-logos.ts`
  - `desktop-app/src/lib/editor/text-layout.ts`
  - `desktop-app/src/lib/editor/image-fit.ts`
  - `desktop-app/src/lib/editor/render-page.ts`
  - `desktop-app/src/lib/editor/generation.ts`
  - `desktop-app/src/lib/editor/formats.ts`
  - `desktop-app/src/lib/editor/smart-guides.ts`
  - `desktop-app/src/lib/editor/thumbnail.ts`
  - `desktop-app/src/types/template.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-4.1): refino de texto e gerar arte no editor com selecao de paginas`
- Próximo passo: iniciar a Fase 5 com o pipeline prompt-only + RAG usando o modal/fila do editor como ponto de entrada do fluxo automatizado.

### Fase 5 — Prompt-only + RAG
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 6 — Fundo IA + Referências
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 7 — Aprovação + Reedição
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 8 — Export Single/Batch
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 9 — Sync Offline-first
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 10 — UX de simplicidade máxima
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

---

## Bloqueios / decisões pendentes
- 

## Observações de handoff (próxima conversa)
- Estado atual: Fases 1, 2, 3 e 4 concluídas e validadas com typecheck web/electron.
- Último commit estável: feat(konva-fase-4): implementa multipage e formatos instagram
- Próxima fase recomendada: Fase 5 — Prompt-only + RAG.
