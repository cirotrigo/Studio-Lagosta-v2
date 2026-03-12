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
| 5 | Prompt-only + RAG | ✅ Concluído | feat(konva-fase-5): pipeline prompt-only com RAG e slot binding | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 6 | Fundo IA + Referências | ✅ Concluído | feat(konva-fase-6): integra fundo ia com nano banana 2 e fallback | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 6.1 | Análise de imagem opcional | ✅ Concluído | feat(konva-fase-6.1): analise de imagem opcional no pipeline de copy | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 7 | Aprovação + Reedição | ✅ Concluído | feat(konva-fase-7): aprova variacoes e abre reedicao no editor | `typecheck` + `typecheck:electron` ✅ | 2026-03-12 |
| 7.1 | Hotfix fontes na reedição | ✅ Concluído | fix(konva-fase-7.1): corrige fontes e fontSize na reediçao | `typecheck` + `typecheck:electron` ✅ | 2026-03-12 |
| 8 | Export Single/Batch | ✅ Concluído | feat(konva-fase-8): export single e batch com naming padronizado | `typecheck` + `typecheck:electron` ✅ | 2026-03-11 |
| 9 | Sync Offline-first | ✅ Concluído | feat(konva-fase-9): sync offline-first com push/pull e resolucao de conflitos | `typecheck` + `typecheck:electron` ✅ | 2026-03-12 |
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
- Escopo fechado: modo rápido com 1 prompt no `GenerateArtTab`, orquestração local Konva-only para copy estruturada + seleção automática/manual de template, binder de slots com constraints, fila assíncrona por variação e injeção automática do contexto da base de conhecimento por `projectId`.
- Decisões:
  - manter a geração 100% no motor Konva do desktop, sem reintroduzir preview/render HTML no fluxo da Fase 5.
  - usar RAG priorizado por categoria (`CAMPANHAS`, `HORARIOS`, `CARDAPIO`, `DIFERENCIAIS`) com fallback textual no banco quando a busca semântica não responder.
  - preservar prioridade do pedido do usuário em conflitos com a base e devolver avisos de revisão para dados críticos.
  - suportar templates Konva antigos sem `slots` explícitos inferindo bindings por heurística e fazendo merge seguro de campos faltantes.
  - tratar `Gerar com IA` nesta fase apenas como orquestração de pipeline, com fallback visual local até a integração definitiva do fundo na Fase 6.
- Arquivos alterados:
  - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
  - `desktop-app/src/components/project/generate/GenerationQueue.tsx`
  - `desktop-app/src/lib/automation/prompt-orchestrator.ts`
  - `desktop-app/src/lib/automation/slot-binder.ts`
  - `desktop-app/src/stores/generation.store.ts`
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/preload.ts`
  - `desktop-app/src/features/art-automation/ipc-contracts.ts`
  - `src/app/api/tools/generate-ai-text/route.ts`
  - `src/lib/knowledge/search.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
  - `npx tsc -p /tmp/tsconfig-web-phase5-<temp>.json --noEmit` (validação isolada dos arquivos web alterados) ✅
- Commit: `feat(konva-fase-5): pipeline prompt-only com RAG e slot binding`
- Próximo passo: iniciar a Fase 6 com a integração definitiva de geração de fundo IA (Nano Banana 2 + fallback) reaproveitando o `backgroundMode='ai'`, as referências visuais e o payload já orquestrado na Fase 5.

### Fase 6 — Fundo IA + Referências
- Escopo fechado: integração do fundo IA ao modo rápido Konva-only com Nano Banana 2 como primário, fallback automático para a versão anterior, referências visuais até 5 no fluxo padrão, persistência em `Geradas com IA` e invalidação da galeria após geração.
- Decisões:
  - reaproveitar a rota web `src/app/api/tools/generate-art/route.ts` como backend de fundo IA via `backgroundOnly`, preservando a persistência existente em `AIGeneratedImage`.
  - criar IPC dedicado `generate-ai-background` no Electron para centralizar sessão, retry de autenticação e normalização do retorno do backend para o renderer.
  - aplicar o fundo IA gerado no binder Konva por `backgroundImageUrl`, removendo o aviso legado de fallback visual da Fase 5.
  - expor no estado/UI da fila os metadados de fundo (`model`, `fallbackUsed`, `persisted`, `referenceCount`) para transparência e debug do usuário.
- Arquivos alterados:
  - `desktop-app/electron/ipc/generation-handlers.ts`
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/preload.ts`
  - `desktop-app/src/lib/automation/background-service.ts`
  - `desktop-app/src/lib/automation/prompt-orchestrator.ts`
  - `desktop-app/src/lib/automation/slot-binder.ts`
  - `desktop-app/src/stores/generation.store.ts`
  - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
  - `desktop-app/src/components/project/generate/GenerationQueue.tsx`
  - `src/app/api/tools/generate-art/route.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-6): integra fundo ia com nano banana 2 e fallback`

### Fase 6.1 — Análise de imagem opcional
- Escopo fechado:
  - adicionar toggle persistido no estado para análise visual opcional no modo rápido, mantendo `default = false`.
  - executar análise de imagem antes da etapa de copy quando houver foto base ou referência disponível.
  - cruzar candidatos visuais com `CARDAPIO` e `CAMPANHAS`, injetando apenas contexto confiável na LLM.
  - expor badge e resumo curto da análise no resultado, sem mudar o fluxo quando o toggle estiver desligado.
- Decisões:
  - a análise visual roda no backend de `generate-ai-text` com `gemini-2.5-flash`, usando a foto base ou a primeira referência do job.
  - associação automática de prato só acontece quando há dupla validação: confiança visual mínima e match suficiente com a base do projeto.
  - em baixa confiança ou falha da análise, o pipeline segue com copy contextual genérica e aviso explícito, sem inventar prato.
  - o modal do editor espelha a preferência do toggle para manter consistência de UX, mas o enriquecimento efetivo acontece no pipeline de copy do modo rápido.
- Arquivos alterados:
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/preload.ts`
  - `desktop-app/src/components/editor/EditorGenerateArtModal.tsx`
  - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
  - `desktop-app/src/features/art-automation/ipc-contracts.ts`
  - `desktop-app/src/lib/automation/image-context-analyzer.ts`
  - `desktop-app/src/lib/automation/prompt-orchestrator.ts`
  - `desktop-app/src/stores/generation.store.ts`
  - `src/app/api/tools/generate-ai-text/route.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-6.1): analise de imagem opcional no pipeline de copy`
- Próximo passo: iniciar a Fase 7 para aprovação por variação, abertura da arte no editor e fluxo de reedição.

### Fase 7 — Aprovação + Reedição
- Escopo fechado:
  - adicionar aprovação individual por card no resultado do modo rápido, com persistência no projeto via export Konva para `Artes`.
  - abrir qualquer variação pronta como draft isolado no `EditorPage`, preservando o estado visual da página aprovada sem sobrescrever o template de origem.
  - expor no editor o fluxo explícito de `Salvar como novo template` para documentos vindos do modo rápido.
- Decisões:
  - aprovação reaproveita o mesmo renderer Konva do preview (`renderPageToDataUrl`) antes do envio ao backend, para reduzir divergência entre preview e arquivo final salvo.
  - o draft aberto no editor é recortado para a página atual da variação e recebe `id` novo, evitando overwrite acidental do template base.
  - a persistência aprovada usa a mesma rota de export dos criativos do editor, fazendo a variação aparecer em `Artes`/histórico web do projeto sem criar um pipeline paralelo.
  - o resultado foi extraído para `ResultImageCard` + `ApprovalPanel` para separar estados de geração e aprovação do `GenerateArtTab`.
- Arquivos alterados:
  - `desktop-app/src/components/editor/EditorShell.tsx`
  - `desktop-app/src/components/project/generate/ApprovalPanel.tsx`
  - `desktop-app/src/components/project/generate/ResultImageCard.tsx`
  - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
  - `desktop-app/src/hooks/use-editor-generation-queue.ts`
  - `desktop-app/src/lib/editor/export-file-name.ts`
  - `desktop-app/src/pages/EditorPage.tsx`
  - `desktop-app/src/stores/generation.store.ts`
  - `desktop-app/src/types/art-automation.ts`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-7): aprova variacoes e abre reedicao no editor`
- Próximo passo: iniciar a Fase 8 para export single/batch padronizado e carrossel a partir dos documentos Konva já aprovados/revisados.

### Fase 7.1 — Hotfix fontes na reedição
- Escopo fechado:
  - restaurar o microajuste tipográfico nas variações abertas via `Editar no Konva`, preservando `fontFamily`, `fontSize`, `lineHeight` e `letterSpacing` no draft.
  - pré-carregar as fontes do projeto/documento antes da montagem do stage no editor e exibir fallback controlado quando alguma família falhar.
  - eliminar markup HTML legado (`<br>`, `<p>`, tags soltas) no pipeline Konva para preview, aprovação e reedição.
- Decisões:
  - o draft de reedição passou a receber merge da identidade do projeto no `EditorPage`, priorizando `brand-assets` para popular `identity.fonts`, `logoUrl` e `colors`.
  - o carregamento de fontes ficou centralizado em um hook dedicado do editor, usando `downloadBlob` + `FontFace` e segurando o stage até o registro inicial terminar.
  - o fallback passou a ser controlado por stack explícita (`fonte solicitada -> Inter -> Arial -> sans-serif`) tanto no stage Konva quanto no renderer canvas.
  - o `autoScale` passou a respeitar `fontSize` como tamanho preferido, evitando que o painel parecesse "ignorar" alterações de tamanho no draft.
  - a normalização de `<br>`/HTML residual foi centralizada no fluxo Konva (`prompt-orchestrator` + `slot-binder`) para cobrir preview, aprovação e reedição no mesmo ponto.
- Arquivos alterados:
  - `desktop-app/src/components/editor/EditorShell.tsx`
  - `desktop-app/src/components/editor/LayerFactory.tsx`
  - `desktop-app/src/components/editor/PropertiesPanel.tsx`
  - `desktop-app/src/hooks/use-editor-project-fonts.ts`
  - `desktop-app/src/lib/automation/prompt-orchestrator.ts`
  - `desktop-app/src/lib/automation/slot-binder.ts`
  - `desktop-app/src/lib/editor/font-utils.ts`
  - `desktop-app/src/lib/editor/text-layout.ts`
  - `desktop-app/src/lib/editor/text-normalization.ts`
  - `desktop-app/src/pages/EditorPage.tsx`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `fix(konva-fase-7.1): corrige fontes e fontSize na reediçao`
- Próximo passo: iniciar a Fase 8 para consolidar export single/batch e carrossel no fluxo Konva-only.

### Fase 8 — Export Single/Batch
- Escopo fechado:
  - export single de página/variação individual em PNG e JPEG com dimensões corretas por formato.
  - export batch de variações e carrossel com ordem preservada.
  - naming padronizado com padrão `{projectSlug}_{format}_{timestamp}` para single e `{projectSlug}_{format}_{timestamp}_v{index}_p{index}` para batch.
  - fidelidade visual entre preview Konva e arquivo exportado (sem letterbox, sem corte indevido).
  - botão "Exportar" no card de variação e "Exportar todas" no job.
- Decisões:
  - usar Sharp no main process para garantir dimensões exatas e qualidade de output.
  - exportar PNG internamente no renderer e converter para JPEG no handler IPC quando solicitado.
  - diretório padrão em `Pictures/LagostaTools` com opção de escolher outro via dialog.
  - naming usa timestamp compacto (`YYYYMMDD-HHmmss`) para evitar colisões sem ser verboso.
  - manter fallback para download simples quando export Electron não estiver disponível.
- Arquivos alterados:
  - `desktop-app/electron/ipc/export-handlers.ts` (novo)
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/preload.ts`
  - `desktop-app/src/lib/export/konva-exporter.ts` (novo)
  - `desktop-app/src/lib/editor/export-file-name.ts`
  - `desktop-app/src/components/project/generate/ResultImageCard.tsx`
  - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-8): export single e batch com naming padronizado`
- Próximo passo: iniciar a Fase 9 para sync offline-first com push/pull incremental e detecção de conflitos.

### Fase 9 — Sync Offline-first
- Escopo fechado:
  - Push/pull incremental com fila local (`sync/queue.json`) e deduplicação por chave.
  - Detecção de conflito via `updatedAt` + hash SHA256 do documento.
  - Três estratégias de resolução: `keep-local`, `keep-remote`, `duplicate-local`.
  - Indicador de status de sync na sidebar com estados visuais (idle/syncing/offline/conflict/error).
  - Dialog de resolução de conflito com comparação de versões e opções claras.
  - Hook `useSyncStatus` para polling automático e integração com eventos online/offline.
- Decisões:
  - Manter fila local em JSON no main process, nunca descartar por erro de auth.
  - Hash calculado excluindo campos voláteis (`updatedAt`, `createdAt`, `syncedAt`, `isDirty`).
  - Retry com refresh de sessão em `401` antes de falhar permanentemente.
  - Sync automático via polling (30s online, 5s offline) + manual via botão.
  - Conflitos armazenados em arquivo separado (`sync/conflicts.json`) com lifecycle próprio.
  - Integração transparente: save template já enfileira operação de sync automaticamente.
- Arquivos alterados:
  - `desktop-app/electron/ipc/konva-ipc-types.ts`
  - `desktop-app/electron/services/json-storage.ts`
  - `desktop-app/electron/services/sync-service.ts` (novo)
  - `desktop-app/electron/ipc/sync-handlers.ts`
  - `desktop-app/electron/ipc/template-handlers.ts`
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/preload.ts`
  - `desktop-app/src/types/template.ts`
  - `desktop-app/src/stores/sync.store.ts` (novo)
  - `desktop-app/src/hooks/use-sync-status.ts` (novo)
  - `desktop-app/src/components/layout/SyncStatusIndicator.tsx` (novo)
  - `desktop-app/src/components/layout/Sidebar.tsx`
  - `desktop-app/src/components/sync/ConflictResolutionDialog.tsx` (novo)
  - `desktop-app/src/App.tsx`
  - `.qoder/specs/andamento-implementacao-konva-only.md`
  - `.qoder/specs/checklist-implementacao-konva-only.md`
- Testes executados:
  - `npm --prefix desktop-app run typecheck` ✅
  - `npm --prefix desktop-app run typecheck:electron` ✅
- Commit: `feat(konva-fase-9): sync offline-first com push/pull e resolucao de conflitos`
- Próximo passo: iniciar a Fase 10 com UX de simplicidade máxima (modo rápido padrão, presets, indicadores de contexto).

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


## Observações de handoff (proxima conversa)
- Estado atual: Fases 1, 2, 3, 4, 4.1, 5, 6, 6.1, 7, 7.1, 8 e 9 concluidas; desktop/electron validados.
- Ultimo commit estavel: feat(konva-fase-9): sync offline-first com push/pull e resolucao de conflitos
- Proxima fase recomendada: Fase 10 — UX de simplicidade maxima.
- Prompt preparado: aguardando criacao de `.qoder/specs/prompt-nova-conversa-konva-fase10.md`
