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
- [x] Add/remove/duplicar página.
- [x] Reorder por drag.
- [x] Presets de formato Instagram.
- [x] Geração de thumbnail por página.

DoD:
- [x] Story, Feed e Square com dimensões corretas.

---

## Fase 4.1 — Refino de texto + geração dentro do editor (2-3 dias)

Arquivos:
- `desktop-app/src/components/editor/PropertiesPanel.tsx`
- `desktop-app/src/components/editor/EditorShell.tsx`
- `desktop-app/src/components/editor/EditorGenerateArtModal.tsx`
- `desktop-app/src/components/editor/EditorGenerationQueue.tsx`
- `desktop-app/src/stores/editor-generation.store.ts`
- `desktop-app/src/lib/editor/text-layout.ts`
- `desktop-app/src/lib/editor/render-page.ts`
- `desktop-app/src/lib/editor/generation.ts`

Tarefas:
- [x] Persistir microtipografia no layer de texto (`lineHeight`, `letterSpacing`, `textTransform`, `maxLines`, `overflowBehavior`, `min/maxFontSize`).
- [x] Suportar alinhamento horizontal/vertical e ancoragem por safe-area no editor Konva.
- [x] Priorizar paleta de cores do projeto no seletor de cor de texto.
- [x] Permitir seleção de logos cadastradas no projeto para layers de logo.
- [x] Adicionar botão `Gerar Arte` ao lado de `Salvar template`.
- [x] Implementar modal com seleção de páginas, página atual pré-selecionada e variações `1|2|4`.
- [x] Reaproveitar fontes de imagem existentes do projeto (`Upload local` + `Drive`).
- [x] Criar fila assíncrona local no editor sem travar o canvas.
- [x] Aplicar imagem de fundo em `cover`, ocupando o canvas inteiro da página alvo.

DoD:
- [x] Microajustes de texto salvam no JSON e refletem no preview.
- [x] Geração por páginas selecionadas entra em fila e produz variações locais acessíveis no editor.

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
- [x] Criar modo "Rápido" com campos mínimos:
  - prompt único
  - formato (story/feed/quadrado)
  - imagem de fundo: `usar foto` ou `gerar com IA` (orquestração com fallback visual nesta fase)
  - referências (até 5)
- [x] Injetar contexto da base de conhecimento do projeto por padrão no pipeline de copy:
  - usar `projectId` para isolamento
  - priorizar categorias `CAMPANHAS`, `HORARIOS`, `CARDAPIO`, `DIFERENCIAIS`
  - fallback gracioso quando não houver contexto
- [x] Orquestrar pipeline:
  1. recuperar contexto RAG do projeto
  2. gerar copy estruturada
  3. gerar/escolher fundo
  4. aplicar slots no template Konva
  5. produzir variações em fila
- [x] Auto-seleção de template por objetivo + tamanho do texto.

DoD:
- [x] Usuário consegue gerar arte válida com 1 prompt e 1 clique em "Gerar".
- [x] Cenário "happy hour" funciona sem usuário repetir dia/horário quando isso estiver cadastrado na base.

---

## Fase 6 — Geração de fundo IA + referências (3-4 dias)

Arquivos:
- `desktop-app/electron/ipc/generation-handlers.ts`
- `desktop-app/src/lib/automation/background-service.ts`

Tarefas:
- [x] Integrar motor primário `Nano Banana 2`.
- [x] Fallback automático para versão anterior em erro.
- [x] Suporte a referências (até 5 no UX; backend pode aceitar mais).
- [x] Persistir imagens geradas em "Geradas com IA".

DoD:
- [x] Retry/fallback e mensagens de erro claras.

---

## Fase 6.1 — Análise de imagem opcional para contexto de copy (2-3 dias)

Arquivos:
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
- `desktop-app/src/components/editor/EditorGenerateArtModal.tsx`
- `desktop-app/src/lib/automation/prompt-orchestrator.ts`
- `desktop-app/src/lib/automation/image-context-analyzer.ts`
- `desktop-app/src/stores/generation.store.ts`
- `src/app/api/tools/generate-ai-text/route.ts` (web)

Tarefas:
- [x] Adicionar toggle `Analisar imagem para contexto` no modo de geração (`default = false`).
- [x] Quando ativo, executar análise da imagem enviada antes da etapa de copy.
- [x] Produzir metadados estruturados da imagem (`dishNameCandidates`, `sceneType`, `ingredientsHints`, `confidence`).
- [x] Cruzar metadados da imagem com base de conhecimento do projeto (`CARDAPIO`, `CAMPANHAS`) para sugerir prato/descrição.
- [x] Injetar contexto visual no prompt final da LLM sem sobrepor o pedido textual do usuário.
- [x] Exibir transparência no UI: badge `Análise de imagem aplicada` + resumo do que foi inferido.
- [x] Em baixa confiança, manter geração padrão sem inventar prato.

DoD:
- [x] Toggle vem desmarcado por padrão.
- [x] Prompt exemplo `Crie variações com essa foto para divulgar o almoço executivo de quinta-feira` usa a análise da foto para associar prato do cardápio quando houver match.
- [x] Se não houver match confiável, fluxo não quebra e segue com copy genérica contextualizada.

---

## Fase 7 — Aprovação por variação + reedição (4-5 dias)

Arquivos:
- `desktop-app/src/components/project/generate/ResultImageCard.tsx`
- `desktop-app/src/components/project/generate/ApprovalPanel.tsx`
- `desktop-app/src/pages/EditorPage.tsx`

Tarefas:
- [x] Aprovação individual por variação.
- [x] Abrir variação no Konva para microajuste.
- [x] "Salvar como novo template" após edição.
- [x] Aprovação envia ao web/histórico corretamente.

DoD:
- [x] Arte aprovada mantém fidelidade visual entre preview e arquivo final.

---

## Fase 7.1 — Estabilização da reedição no editor (fontes + tipografia) (1-2 dias)

Arquivos:
- `desktop-app/src/pages/EditorPage.tsx`
- `desktop-app/src/components/editor/EditorShell.tsx`
- `desktop-app/src/components/editor/PropertiesPanel.tsx`
- `desktop-app/src/components/editor/LayerFactory.tsx`
- `desktop-app/src/stores/editor.store.ts`
- `desktop-app/src/lib/fonts/*` (ou módulo equivalente de carregamento)
- `desktop-app/src/hooks/use-project-fonts.ts` (se aplicável)

Tarefas:
- [x] Garantir carregamento das fontes do projeto ao abrir variação em `Editar no Konva` (draft via `location.state`).
- [x] Garantir que `fontFamily` e `fontSize` fiquem editáveis para layers de texto no draft.
- [x] Normalizar quebras de linha legadas: converter `<br>` para `\\n` antes de aplicar texto no Konva.
- [x] Sanitizar texto para não exibir markup HTML literal no canvas (ex.: `<br>`, `<p>`).
- [x] Resolver fallback de fonte quando a fonte do projeto não estiver disponível localmente.
- [x] Evitar regressão no fluxo de templates normais (sem draft).
- [x] Exibir aviso não-bloqueante quando uma fonte de projeto falhar ao carregar.

DoD:
- [x] Em microajuste, usuário consegue alterar tamanho de fonte normalmente.
- [x] Texto renderiza com fonte do projeto quando disponível.
- [x] `<br>` não aparece literal no canvas; quebra de linha renderiza corretamente.
- [x] Com fonte indisponível, fallback explícito sem quebrar edição.

---

## Fase 8 — Export single/batch (3-4 dias)

Arquivos:
- `desktop-app/electron/ipc/export-handlers.ts`
- `desktop-app/src/lib/export/konva-exporter.ts`

Tarefas:
- [x] Export PNG/JPEG por página.
- [x] Export batch para variações e carrossel.
- [x] Naming padronizado por projeto/campanha.
- [x] Garantir fidelidade visual do export em relação ao preview Konva (sem redução inesperada de texto/logo).
- [x] Garantir dimensões exatas por formato (`STORY 1080x1920`, `FEED_PORTRAIT 1080x1350`, `SQUARE 1080x1080`).
- [x] Evitar corte/faixa preta/letterbox no export final.
- [x] Definir padrão de nome com índice para batch/carrossel (`..._v01_p01` etc.).

DoD:
- [x] Sem corte indevido; dimensão final correta.
- [x] Export single e batch reprodutíveis com naming consistente.
- [x] QA manual validando preview vs arquivo final em story/feed/square.

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
