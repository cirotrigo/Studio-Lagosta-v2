# Prompt para nova conversa — Implementação Konva-Only + Base de Conhecimento

Use este prompt na próxima conversa:

---

Quero que você implemente a solução **Konva-only** do desktop-app, seguindo estritamente as specs abaixo e evoluindo por fases com commits pequenos e documentação contínua.

## Documentos obrigatórios (leia antes de codar)
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`
4. `.qoder/specs/andamento-implementacao-konva-only.md`
5. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz de documentação técnica
- Ao implementar bibliotecas/frameworks (Konva, Electron, Zustand, etc.), **use context7** para confirmar API atualizada.

## Objetivo principal
- Remover dependência de HTML/DS no fluxo de geração.
- Usar apenas motor Konva + JSON.
- Injetar base de conhecimento do projeto no pipeline de geração (RAG), para evitar repetição de dados como horários/happy hour/cardápio.
- Permitir microajuste no Konva antes da aprovação.

## Regras obrigatórias de execução
1. Implementar **fase por fase** (sem pular).
2. Não iniciar a próxima fase sem concluir a fase atual com validação e commit.
3. Ao final de **cada fase concluída**:
   - executar:
     - `npm --prefix desktop-app run typecheck`
     - `npm --prefix desktop-app run typecheck:electron`
   - corrigir erros antes de avançar;
   - fazer commit com padrão:
     - `feat(konva-fase-X): <resumo objetivo>`
   - atualizar os dois arquivos:
     - `.qoder/specs/andamento-implementacao-konva-only.md`
     - `.qoder/specs/checklist-implementacao-konva-only.md`
4. Em caso de bloqueio:
   - registrar no arquivo de andamento (seção de bloqueios),
   - propor workaround técnico,
   - commitar o estado parcial com mensagem clara.
5. Não usar comandos destrutivos de git.
6. Não reintroduzir pipeline HTML/DS como motor de geração.

## Ordem de execução (obrigatória)
1. Fase 1 — Contratos e schema v2
2. Fase 2 — Storage JSON no main + IPC
3. Fase 3 — Editor Konva core
4. Fase 4 — Multi-page + formatos
5. Fase 5 — Prompt-only + RAG (base de conhecimento)
6. Fase 6 — Fundo IA + referências
7. Fase 7 — Aprovação por variação + reedição
8. Fase 8 — Export single/batch
9. Fase 9 — Sync offline-first
10. Fase 10 — UX de simplicidade máxima

## Requisito crítico de RAG (fase 5)
- Integrar geração de copy com contexto da base de conhecimento por `projectId`.
- Priorizar categorias:
  1. `CAMPANHAS`
  2. `HORARIOS`
  3. `CARDAPIO`
  4. `DIFERENCIAIS`
- Cenário obrigatório de aceite:
  - Prompt: `crie variações sobre happy hour com essa foto`
  - Resultado deve aproveitar dias/horários da base sem o usuário repetir manualmente.

## Critérios de aceite mínimos
- Prompt único gera arte válida no modo rápido.
- Variações processam em fila sem travar o formulário.
- Preview e export têm fidelidade visual (Konva único).
- Reedição no Konva funciona em artes geradas automaticamente.
- Aprovação salva no histórico e sincroniza com web.

## Formato obrigatório da resposta ao final de cada fase
1. Resumo do que foi implementado na fase.
2. Lista de arquivos alterados (paths absolutos ou relativos).
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada em:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`
6. Próxima fase sugerida.

Comece pela Fase 1 agora.

---
