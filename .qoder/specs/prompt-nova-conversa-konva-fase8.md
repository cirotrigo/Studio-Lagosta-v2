# Prompt para nova conversa — Konva-Only (Fase 8)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 8**: export single/batch padronizado no fluxo Konva-only.

## Pré-condição
- Fases 1, 2, 3, 4, 4.1, 5, 6, 6.1, 7 e 7.1 concluídas, commitadas e documentadas.
- Antes de codar, validar o estado atual do repositório e os commits anteriores.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.

## Escopo estrito desta conversa (Fase 8)

### A) Export single
- Exportar página/variação individual em `PNG` e `JPEG`.
- Respeitar formato da arte:
  - `STORY` = `1080x1920`
  - `FEED_PORTRAIT` = `1080x1350`
  - `SQUARE` = `1080x1080`

### B) Export batch
- Exportar lote de variações e/ou páginas (carrossel).
- Preservar ordem correta dos itens no batch.
- Suportar batch de páginas de um template e batch de variações aprovadas.

### C) Naming padronizado
- Implementar naming consistente por projeto/campanha/formato/índice.
- Padrão sugerido:
  - single: `{projectSlug}_{format}_{timestamp}.jpg`
  - batch/carrossel: `{projectSlug}_{format}_{timestamp}_v{variationIndex}_p{pageIndex}.jpg`
- Reaproveitar helper existente (`export-file-name.ts`) quando possível.

### D) Fidelidade visual
- Garantir paridade visual entre preview Konva e arquivo exportado:
  - sem encolhimento inesperado de texto/logo,
  - sem corte indevido,
  - sem faixa preta/letterbox.

### E) Integração com fluxo atual
- Não quebrar aprovação por variação/reedição da Fase 7.
- Não quebrar pipeline prompt-only/RAG da Fase 5/6/6.1.

## Arquivos alvo mínimos
- `desktop-app/electron/ipc/export-handlers.ts`
- `desktop-app/src/lib/export/konva-exporter.ts`
- `desktop-app/src/lib/editor/export-file-name.ts`
- `desktop-app/src/stores/generation.store.ts`
- componentes/telas que disparam export (se necessário)

## Fora de escopo
- Sync offline-first (Fase 9)
- UX macro de simplicidade (Fase 10)

## Critérios de aceite (obrigatórios)
1. Export single funciona em PNG/JPEG com dimensão correta.
2. Export batch funciona para variações e carrossel com ordem correta.
3. Naming final é consistente e previsível para single e batch.
4. Preview e export têm fidelidade visual (sem corte/encolhimento/faixa preta).
5. Typecheck sem regressão.
6. QA manual executado em story/feed/square comparando preview vs arquivo final.

## Regras de execução
1. Implementar apenas Fase 8.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-8): export single e batch com naming padronizado`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Resultado do QA manual de fidelidade visual.
7. Riscos remanescentes.
8. Próximo passo sugerido (Fase 9).

Comece agora pela Fase 8.

---
