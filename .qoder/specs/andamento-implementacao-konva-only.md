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
| 3 | Editor Konva Core | ⬜ Não iniciado | - | - | - |
| 4 | Multi-page + Formatos | ⬜ Não iniciado | - | - | - |
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
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

### Fase 4 — Multi-page + Formatos
- Escopo fechado:
- Decisões:
- Arquivos alterados:
- Testes executados:
- Commit:
- Próximo passo:

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
- Estado atual: Fases 1 e 2 concluídas e validadas com typecheck web/electron.
- Último commit estável: feat(konva-fase-2): implementa storage json atomico e ipc de templates
- Próxima fase recomendada: Fase 3 — Editor Konva Core.
