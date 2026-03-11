# Checklist Técnico Executável — Konva-Only (Desktop)

## Objetivo
Implementar fluxo de criação de artes para Instagram com motor único Konva + JSON, priorizando experiência "1 prompt" para social media.

---

## Fase 0 — Alinhamento e corte de escopo (1 dia)
- [ ] Congelar o escopo v1: Konva-only, sem HTML/DS na geração.
- [ ] Confirmar export v1: PNG/JPEG.
- [ ] Confirmar formatos: STORY (1080x1920), FEED_PORTRAIT (1080x1350), SQUARE (1080x1080).
- [ ] Definir feature flags: `konva_only_enabled`, `prompt_quick_mode_enabled`.

Saída:
- [ ] ADR curto em `docs/` com decisões finais.

---

## Fase 1 — Contratos e schema (2-3 dias)

Arquivos:
- `desktop-app/src/types/template.ts`
- `desktop-app/src/types/electron-ipc.ts`
- `desktop-app/src/types/generation.ts`

Tarefas:
- [x] Criar `KonvaTemplateDocument` v2 com `design.pages[].layers` como fonte única.
- [x] Definir `SlotBinding` com constraints (`maxLines`, `overflowBehavior`, etc.).
- [x] Padronizar IDs como `string`.
- [x] Definir contratos IPC (`konva:template:*`, `konva:export:*`, `konva:generation:*`, `konva:sync:*`).

DoD:
- [x] Tipos compilam em `typecheck` e `typecheck:electron`.

---

## Fase 2 — Storage JSON no Main + IPC (3-4 dias)

Arquivos:
- `desktop-app/electron/services/json-storage.ts`
- `desktop-app/electron/ipc/template-handlers.ts`
- `desktop-app/electron/ipc/sync-handlers.ts`
- `desktop-app/electron/main.ts`
- `desktop-app/electron/preload.ts`

Tarefas:
- [x] Implementar persistência local JSON com escrita atômica.
- [x] Criar CRUD de templates via IPC.
- [x] Criar fila local de sync (`sync/queue.json`) com deduplicação.
- [x] Expor APIs seguras no preload.

DoD:
- [x] Criar/editar/remover/listar template local funciona.
- [x] Restart do app preserva dados.

---

## Fase 3 — Editor Konva core (1-2 semanas)

Arquivos (port/adaptação):
- `desktop-app/src/components/editor/EditorShell.tsx`
- `desktop-app/src/components/editor/EditorStage.tsx`
- `desktop-app/src/components/editor/LayerFactory.tsx`
- `desktop-app/src/components/editor/PropertiesPanel.tsx`
- `desktop-app/src/components/editor/LayersPanel.tsx`
- `desktop-app/src/stores/editor.store.ts`
- `desktop-app/src/stores/pages.store.ts`
- `desktop-app/src/stores/history.store.ts`

Tarefas:
- [x] Portar stage + layers + transformer.
- [x] Seleção múltipla e transform.
- [x] Zoom + pan + smart guides.
- [x] Undo/redo linear (limite 100 snapshots).

DoD:
- [x] Edição WYSIWYG estável para text/image/shape/logo.

---

## Fase 4 — Multi-page e formatos Instagram (3-4 dias)

Arquivos:
- `desktop-app/src/components/editor/PagesBar.tsx`
- `desktop-app/src/stores/pages.store.ts`
- `desktop-app/src/lib/editor/formats.ts`

Tarefas:
- [ ] Add/remove/duplicar página.
- [ ] Reorder por drag.
- [ ] Presets de formato Instagram.
- [ ] Geração de thumbnail por página.

DoD:
- [ ] Story, Feed e Square com dimensões corretas.

---

## Fase 5 — Prompt-only pipeline (1 semana)

Arquivos:
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
- `desktop-app/src/lib/automation/prompt-orchestrator.ts`
- `desktop-app/src/lib/automation/slot-binder.ts`
- `desktop-app/src/stores/generation.store.ts`
- `src/app/api/tools/generate-ai-text/route.ts` (web)
- `src/lib/knowledge/search.ts` (web)

Tarefas:
- [ ] Criar modo "Rápido" com campos mínimos:
  - prompt único
  - formato (story/feed/carrossel)
  - imagem de fundo: `usar foto` ou `gerar com IA`
  - referências (até 5)
- [ ] Injetar contexto da base de conhecimento do projeto por padrão no pipeline de copy:
  - usar `projectId` para isolamento
  - priorizar categorias `CAMPANHAS`, `HORARIOS`, `CARDAPIO`, `DIFERENCIAIS`
  - fallback gracioso quando não houver contexto
- [ ] Orquestrar pipeline:
  1. recuperar contexto RAG do projeto
  2. gerar copy estruturada
  3. gerar/escolher fundo
  4. aplicar slots no template Konva
  5. produzir variações em fila
- [ ] Auto-seleção de template por objetivo + tamanho do texto.

DoD:
- [ ] Usuário consegue gerar arte válida com 1 prompt e 1 clique em "Gerar".
- [ ] Cenário "happy hour" funciona sem usuário repetir dia/horário quando isso estiver cadastrado na base.

---

## Fase 6 — Geração de fundo IA + referências (3-4 dias)

Arquivos:
- `desktop-app/electron/ipc/generation-handlers.ts`
- `desktop-app/src/lib/automation/background-service.ts`

Tarefas:
- [ ] Integrar motor primário `Nano Banana 2`.
- [ ] Fallback automático para versão anterior em erro.
- [ ] Suporte a referências (até 5 no UX; backend pode aceitar mais).
- [ ] Persistir imagens geradas em "Geradas com IA".

DoD:
- [ ] Retry/fallback e mensagens de erro claras.

---

## Fase 7 — Aprovação por variação + reedição (4-5 dias)

Arquivos:
- `desktop-app/src/components/project/generate/ResultImageCard.tsx`
- `desktop-app/src/components/project/generate/ApprovalPanel.tsx`
- `desktop-app/src/pages/EditorPage.tsx`

Tarefas:
- [ ] Aprovação individual por variação.
- [ ] Abrir variação no Konva para microajuste.
- [ ] "Salvar como novo template" após edição.
- [ ] Aprovação envia ao web/histórico corretamente.

DoD:
- [ ] Arte aprovada mantém fidelidade visual entre preview e arquivo final.

---

## Fase 8 — Export single/batch (3-4 dias)

Arquivos:
- `desktop-app/electron/ipc/export-handlers.ts`
- `desktop-app/src/lib/export/konva-exporter.ts`

Tarefas:
- [ ] Export PNG/JPEG por página.
- [ ] Export batch para variações e carrossel.
- [ ] Naming padronizado por projeto/campanha.

DoD:
- [ ] Sem corte indevido; dimensão final correta.

---

## Fase 9 — Sync offline-first (1 semana)

Arquivos:
- `desktop-app/src/stores/sync.store.ts`
- `desktop-app/electron/services/sync-service.ts`
- `desktop-app/electron/ipc/sync-handlers.ts`

Tarefas:
- [ ] Push/pull incremental com fila local.
- [ ] Detecção de conflito (`updatedAt + hash`).
- [ ] Estratégias de resolução (`keep-local`, `keep-remote`, `duplicate-local`).
- [ ] Indicadores de status no UI.

DoD:
- [ ] Offline edita normal; reconexão sincroniza sem perda.

---

## Fase 10 — UX de simplicidade máxima (3-4 dias)

Arquivos:
- `desktop-app/src/components/project/generate/QuickCreatePanel.tsx`
- `desktop-app/src/components/project/generate/AdvancedOptionsDrawer.tsx`

Tarefas:
- [ ] Modo padrão = "Rápido" (1 prompt).
- [ ] Modo "Avançado" colapsado por padrão.
- [ ] Presets de objetivo (promoção, institucional, agenda, oferta).
- [ ] Presets de tom de copy por segmento.
- [ ] Indicador discreto "Contexto do projeto aplicado" com opção "ver/editar dados usados".
- [ ] Botão "Atualizar base" para abrir diretamente a tela de Base de Conhecimento do projeto.

DoD:
- [ ] Tempo médio para primeira arte < 60s em rede estável.

---

## QA de Aceite Final
- [ ] 1 prompt gera Story pronto para aprovação.
- [ ] 1 prompt + referências gera fundo IA coerente.
- [ ] 1 prompt "happy hour" puxa automaticamente informações válidas da base de conhecimento.
- [ ] Variações entram em fila sem travar formulário.
- [ ] Reedição no Konva funciona em arte automatizada.
- [ ] Aprovação salva local + web + histórico.
- [ ] Feed e carrossel exportam no tamanho correto.

---

## Comandos de verificação
```bash
npm --prefix desktop-app run typecheck
npm --prefix desktop-app run typecheck:electron
npm --prefix desktop-app run dev:electron
```
