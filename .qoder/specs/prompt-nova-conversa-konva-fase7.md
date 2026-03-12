# Prompt para nova conversa — Konva-Only (Fase 7)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 7**: aprovação por variação + reedição no Konva + salvar como novo template.

## Pré-condição
- Fases 1, 2, 3, 4, 4.1, 5, 6 e 6.1 concluídas, commitadas e documentadas.
- Antes de codar, validar o estado atual do repositório e os commits anteriores.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`
4. `.qoder/specs/andamento-implementacao-konva-only.md`
5. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.

## Escopo estrito desta conversa (Fase 7)

### A) Aprovação por variação (card-level)
Implementar ações por card de variação:
- `Aprovar`
- `Rejeitar`
- `Editar no Konva`

Regras:
- aprovação é individual (não bloquear outras variações);
- status por variação: `pending | approved | rejected`;
- UI deve refletir status em tempo real.

### B) Reedição da variação no Konva
Ao clicar `Editar no Konva`:
- abrir a variação no editor com estado completo;
- permitir microajustes visuais/textuais;
- manter dimensões corretas do formato da variação;
- salvar revisão sem perda de dados de origem (prompt, template, metadados).

### C) Salvar como novo template
No editor da variação revisada:
- ação `Salvar como novo template`;
- criar novo template Konva no projeto atual;
- manter vínculo de origem (`sourceVariationId`/metadata) para rastreabilidade.

### D) Persistência e envio ao web/histórico
Na aprovação:
- persistir arte aprovada localmente no histórico;
- enviar para o web (endpoint já adotado no projeto) sem regressão;
- manter item visível na aba de histórico após refresh.

### E) Fidelidade preview vs arquivo aprovado
Garantir que a versão aprovada:
- preserve proporção e enquadramento;
- preserve escala de texto/logo;
- não introduza cortes/faixas/encolhimento após aprovação.

## Arquivos alvo mínimos
- `desktop-app/src/components/project/generate/ResultImageCard.tsx`
- `desktop-app/src/components/project/generate/ApprovalPanel.tsx`
- `desktop-app/src/pages/EditorPage.tsx`
- `desktop-app/src/stores/generation.store.ts`
- `desktop-app/src/stores/editor.store.ts`
- `desktop-app/electron/ipc/generation-handlers.ts`
- `desktop-app/electron/main.ts`

## Fora de escopo
- Export batch final dedicado (Fase 8)
- Sync offline-first (Fase 9)
- Ajustes de UX macro (Fase 10)

## Critérios de aceite (obrigatórios)
1. Aprovar/rejeitar funciona por variação e não trava as demais.
2. `Editar no Konva` abre a variação certa com estado completo.
3. `Salvar como novo template` cria template reutilizável no projeto.
4. Aprovação envia corretamente para web e salva no histórico local.
5. Preview e arte aprovada mantêm fidelidade visual (sem encolhimento/corte indevido).
6. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas Fase 7.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-7): aprovacao por variacao com reediçao no konva`
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
7. Próximo passo sugerido (Fase 8).

Comece agora pela Fase 7.

---
