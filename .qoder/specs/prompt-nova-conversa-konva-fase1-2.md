# Prompt para nova conversa — Konva-Only (Fases 1 e 2)

Use este prompt na próxima conversa:

---

Quero que você implemente **somente as Fases 1 e 2** da solução Konva-only no desktop-app, com qualidade de produção e sem pular etapas.

## Documentos obrigatórios (leia antes de codar)
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz de documentação técnica
- Ao implementar bibliotecas/frameworks (Electron, Zustand, Konva, etc.), **use context7** para confirmar API atualizada.

## Escopo estrito desta conversa
- **Fase 1 — Contratos e schema v2**
- **Fase 2 — Storage JSON no main + IPC**

Não iniciar Fase 3 nesta conversa.

## Objetivo técnico das 2 fases
- Consolidar base Konva-only:
  - contratos de dados v2,
  - contratos IPC,
  - persistência local JSON robusta no main process,
  - fluxo mínimo de salvar/carregar/listar template via IPC.

## Regras obrigatórias
1. Executar Fase 1 completa, validar, commitar e documentar.
2. Só depois executar Fase 2 completa, validar, commitar e documentar.
3. Ao final de cada fase, executar:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
4. Commit por fase com padrão:
   - `feat(konva-fase-X): <resumo objetivo>`
5. Atualizar após cada fase os arquivos:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`
6. Não usar comandos destrutivos de git.
7. Não reintroduzir HTML/DS no motor de geração.

## Critérios de aceite da Fase 1
- Tipos/schema v2 definidos e compilando.
- Contratos IPC tipados e claros.
- Sem quebrar typecheck.

## Critérios de aceite da Fase 2
- Storage JSON com escrita atômica (`tmp + rename`).
- Handlers IPC de template funcionando (save/get/list).
- Tratamento de erro básico + logs úteis.
- Sem quebrar typecheck.

## Formato obrigatório da resposta ao final de cada fase
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. O que foi atualizado no andamento/checklist.
6. Próximo passo.

## Encerramento desta conversa
Após concluir a Fase 2:
- pare a execução,
- traga um resumo final,
- proponha prompt para abrir a próxima conversa iniciando da Fase 3.

Comece agora pela Fase 1.

---
