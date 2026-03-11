# Prompt para nova conversa — Konva-Only (Fases 3 e 4)

Use este prompt na próxima conversa:

---

Quero que você implemente **somente as Fases 3 e 4** da solução Konva-only no desktop-app, com foco em estabilidade e continuidade do que foi feito nas Fases 1 e 2.

## Pré-condição
- Considere que as Fases 1 e 2 já foram concluídas, commitadas e documentadas.
- Antes de iniciar, valide o estado atual do repositório e confirme os commits das fases anteriores.

## Documentos obrigatórios (leia antes de codar)
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`
5. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`

## Diretriz de documentação técnica
- Ao implementar bibliotecas/frameworks (Konva, React-Konva, Electron, Zustand, etc.), **use context7** para confirmar API atualizada.

## Escopo estrito desta conversa
- **Fase 3 — Editor Konva core**
- **Fase 4 — Multi-page + formatos**

Não iniciar Fase 5 nesta conversa.

## Objetivo técnico das 2 fases
- Entregar editor Konva funcional para microajuste real:
  - stage, seleção, transform, camadas e propriedades.
- Entregar estrutura multipágina para carrossel e variações:
  - navegação de páginas,
  - criação/remoção/reordenação,
  - formatos STORY (1080x1920), FEED_PORTRAIT (1080x1350), SQUARE (1080x1080).

## Regras obrigatórias
1. Executar Fase 3 completa, validar, commitar e documentar.
2. Só depois executar Fase 4 completa, validar, commitar e documentar.
3. Ao final de cada fase, executar:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
4. Commit por fase com padrão:
   - `feat(konva-fase-X): <resumo objetivo>`
5. Atualizar após cada fase os arquivos:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`
6. Não usar comandos destrutivos de git.
7. Não reintroduzir pipeline HTML/DS no motor de geração.
8. Não quebrar contratos/schema definidos na Fase 1.

## Critérios de aceite da Fase 3
- Canvas Konva renderiza com documento v2.
- Seleção e transformação de layer funcionam.
- Painel de layers e propriedades com edição mínima funcional.
- Edição de texto e imagem no preview sem divergência crítica.
- Sem quebrar typecheck.

## Critérios de aceite da Fase 4
- Suporte multipágina funcional (adicionar/remover/navegar/reordenar).
- Troca de formato preserva integridade do documento.
- Story/Feed Portrait/Square aplicam dimensões corretas.
- Estado de página atual e miniaturas básicas funcionam.
- Sem quebrar typecheck.

## Formato obrigatório da resposta ao final de cada fase
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. O que foi atualizado no andamento/checklist.
6. Próximo passo.

## Encerramento desta conversa
Após concluir a Fase 4:
- pare a execução,
- traga um resumo final,
- proponha prompt para abrir a próxima conversa iniciando da Fase 5 (Prompt-only + RAG).

Comece agora pela Fase 3.

---
