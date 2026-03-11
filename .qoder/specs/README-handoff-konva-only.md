# Handoff — Implementação Konva-Only (Desktop)

## Objetivo
Pacote de continuidade para implementar o módulo de artes 100% Konva + JSON, com RAG da base de conhecimento do projeto.

## Ordem recomendada de leitura
1. `spec-editor-konva-electron-hibrido-v2.md`
2. `checklist-implementacao-konva-only.md`
3. `prd-ux-modo-rapido-konva-only.md`
4. `andamento-implementacao-konva-only.md`
5. `template-registro-fase-konva-only.md`
6. `prompt-nova-conversa-implementacao-konva-only.md`

## Regras de continuidade (obrigatórias)
- Executar por fase, sem pular.
- Ao final de cada fase:
  - `npm --prefix desktop-app run typecheck`
  - `npm --prefix desktop-app run typecheck:electron`
  - commit com `feat(konva-fase-X): ...`
  - atualizar andamento e checklist.
- Não reintroduzir pipeline HTML/DS no motor de geração.

## Arquivo para copiar e iniciar nova conversa
- `prompt-nova-conversa-implementacao-konva-only.md`

