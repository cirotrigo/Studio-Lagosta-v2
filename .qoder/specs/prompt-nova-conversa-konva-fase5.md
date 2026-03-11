# Prompt para nova conversa — Konva-Only (Fase 5)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 5** da solução Konva-only: **Prompt-only pipeline + RAG da base de conhecimento**.

## Pré-condição
- Fases 1, 2, 3, 4 e 4.1 já concluídas, commitadas e documentadas.
- Antes de codar, valide o estado atual do repositório e os commits das fases anteriores.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`
4. `.qoder/specs/andamento-implementacao-konva-only.md`
5. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar bibliotecas/frameworks e APIs, use `context7` para validar sintaxe e comportamento atual.

## Escopo estrito desta conversa (Fase 5)

### A) Modo Rápido (1 prompt)
Entregar fluxo funcional com campos mínimos:
- prompt único
- formato (`STORY`, `FEED_PORTRAIT`, `SQUARE`)
- fundo: usar foto ou gerar com IA (apenas orquestração; integração Nano Banana 2 fica na Fase 6)
- referências (até 5 no UX)
- variações (`1|2|4`)

### B) Prompt Orchestrator
Implementar orquestrador de pipeline em `desktop-app/src/lib/automation/prompt-orchestrator.ts`:
1. receber input (prompt, formato, mídia, refs, projectId, templateId opcional)
2. recuperar contexto da base de conhecimento do projeto (RAG)
3. montar prompt final com contexto
4. chamar geração de copy estruturada (JSON)
5. selecionar template automaticamente (ou usar template manual quando informado)
6. aplicar slots no template Konva
7. devolver variações para fila

### C) RAG obrigatório por projeto
Integrar contexto da base de conhecimento usando `projectId`, priorizando:
1. `CAMPANHAS`
2. `HORARIOS`
3. `CARDAPIO`
4. `DIFERENCIAIS`

Regras:
- isolamento por `projectId`
- fallback gracioso se não houver contexto
- não inventar dados críticos (horário/preço/endereço)
- em conflito entre prompt e base, priorizar pedido do usuário e sinalizar revisão

### D) Slot binder Konva
Implementar/ajustar `desktop-app/src/lib/automation/slot-binder.ts` para:
- mapear copy estruturada em layers com `slot bindings`
- aplicar constraints do template (`maxLines`, `overflowBehavior`, `min/maxFontSize`)
- preservar fidelidade visual do preview

### E) Fila assíncrona
Garantir fila por variação no store de geração:
- estados por job: `queued | processing | ready | error`
- formulário continua editável durante processamento
- UI com feedback claro por variação

### F) Auto-seleção de template
Quando usuário não selecionar template manualmente:
- escolher automaticamente template baseado em objetivo do prompt + densidade de texto + formato
- permitir override manual

## Arquivos alvo mínimos
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
- `desktop-app/src/lib/automation/prompt-orchestrator.ts`
- `desktop-app/src/lib/automation/slot-binder.ts`
- `desktop-app/src/stores/generation.store.ts`
- `src/app/api/tools/generate-ai-text/route.ts` (web)
- `src/lib/knowledge/search.ts` (web)

## Fora de escopo desta conversa
- Integração definitiva de geração de fundo com `Nano Banana 2` e fallback (Fase 6)
- Aprovação final/reedição como fase dedicada (Fase 7)
- Export batch final (Fase 8)
- Sync offline-first (Fase 9)

## Critérios de aceite (obrigatórios)
1. Usuário gera arte válida com 1 prompt e 1 clique em `Gerar Artes`.
2. Pipeline usa contexto da base automaticamente quando disponível.
3. Cenário: prompt `crie variações sobre happy hour com essa foto` traz dia/horário da base, sem o usuário repetir.
4. Variações rodam em fila sem travar UI.
5. Copy aplicada em slots Konva com constraints sem quebrar layout.
6. Sem regressão no fluxo de geração dentro do editor (Fase 4.1).
7. Typecheck web/electron sem erro.

## Regras de execução
1. Implementar somente Fase 5.
2. Executar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-5): pipeline prompt-only com RAG e slot binding`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Riscos remanescentes.
7. Próximo passo sugerido (Fase 6).

Comece agora pela Fase 5.

---
