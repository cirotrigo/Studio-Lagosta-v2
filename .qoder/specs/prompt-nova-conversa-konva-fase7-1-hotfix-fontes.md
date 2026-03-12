# Prompt para nova conversa — Konva-Only (Fase 7.1: hotfix de fontes na reedição)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 7.1** para corrigir regressões da reedição no editor após a Fase 7.

## Problemas atuais
1. Ao abrir `Editar no Konva` (draft da variação), não consigo ajustar `fontSize` dos textos.
2. As fontes do projeto não carregam corretamente no editor de microajuste.
3. A copy está chegando com `<br>` legado e o texto aparece literal no canvas (não quebra linha).

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.

## Escopo estrito desta conversa (Fase 7.1)

### A) Carregamento de fontes do projeto no draft
- Ao abrir variação via `Editar no Konva`, carregar identidade do projeto incluindo fontes.
- Garantir registro/disponibilidade das fontes antes da renderização final do stage.
- Se fonte falhar, aplicar fallback controlado e aviso não-bloqueante.

### B) Edição de tipografia no draft
- Garantir que propriedades tipográficas continuem editáveis no draft:
  - `fontFamily`
  - `fontSize`
  - `lineHeight`
  - `letterSpacing`
- Corrigir qualquer lock indevido no `PropertiesPanel` para layers de texto/rich-text.

### B.1) Normalização de quebra de linha legada (HTML -> Konva)
- Converter `<br>`/`<br/>` para `\\n` antes de aplicar texto em layers Konva.
- Sanitizar/remover markup HTML residual (`<p>`, tags soltas) para não aparecer literal no canvas.
- Aplicar essa normalização no ponto central do pipeline (slot binder/orchestrator) para valer em preview, aprovação e reedição.

### C) Sem regressão no fluxo principal
- Não quebrar edição de templates normais (fora de draft).
- Não quebrar fluxo de aprovação/reprovação já entregue na Fase 7.

## Arquivos alvo mínimos
- `desktop-app/src/pages/EditorPage.tsx`
- `desktop-app/src/components/editor/EditorShell.tsx`
- `desktop-app/src/components/editor/PropertiesPanel.tsx`
- `desktop-app/src/components/editor/LayerFactory.tsx`
- `desktop-app/src/stores/editor.store.ts`
- módulos de carregamento de fonte (`hooks/lib` equivalentes)

## Critérios de aceite (obrigatórios)
1. Em `Editar no Konva`, o usuário consegue alterar `fontSize` normalmente.
2. Fontes do projeto são aplicadas no draft quando disponíveis.
3. `<br>` não aparece literal no canvas; as quebras são renderizadas corretamente.
4. Em falha de fonte, fallback explícito sem quebrar a edição.
5. Fluxos não-draft continuam funcionando sem regressão.
6. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas Fase 7.1.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `fix(konva-fase-7.1): corrige fontes e fontSize na reediçao`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi corrigido.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Riscos remanescentes.
7. Próximo passo sugerido (Fase 8).

Comece agora pela Fase 7.1.

---
