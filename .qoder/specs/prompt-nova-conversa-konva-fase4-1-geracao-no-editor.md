# Prompt para nova conversa — Fase 4.1 (Refino de texto + Geração dentro do Editor)

Use este prompt na próxima conversa:

---

Quero implementar a **Fase 4.1** com foco em dois pontos:
1. refino avançado de texto no editor Konva;
2. botão **Gerar Arte** dentro do Editor para gerar variações do template atual (com UX igual ao Studio Web).

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`
5. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`

## Diretriz técnica
- Ao implementar bibliotecas/frameworks (Konva, Electron, Zustand, etc.), use `context7` para validar APIs atuais.

## Escopo obrigatório desta conversa

### A) Refinamento de propriedades de texto (Konva)
Implementar no modelo de layer + painel de propriedades:
- `lineHeight`
- `letterSpacing`
- `textTransform` (`none|uppercase|lowercase|capitalize`)
- `maxLines`
- `overflowBehavior` (`clip|ellipsis|autoScale`)
- `autoScale` com `minFontSize` e `maxFontSize`
- alinhamento horizontal/vertical
- ancoragem por safe-area (top/center/bottom + left/center/right)

Persistir essas propriedades no JSON do template/documento.

### B) Botão `Gerar Arte` dentro do Editor (não é salvar template)
Adicionar no Editor, ao lado de `Salvar Template`, o botão `Gerar Arte`.

Comportamento do botão:
- abre modal de geração do template atual;
- o modal deve listar **todas as páginas do template**;
- a **página atual** do editor deve vir **marcada como padrão** (pré-selecionada), como na versão web;
- permitir selecionar 1, várias ou todas as páginas para geração;
- variações por página: `1`, `2`, `4`;
- fila assíncrona (não travar editor/formulário).

### C) Imagem aplicada no tamanho total do canvas
Ao aplicar imagem de fundo nas páginas selecionadas:
- preencher o canvas inteiro da página alvo;
- respeitar formato da página (STORY 1080x1920, FEED_PORTRAIT 1080x1350, SQUARE 1080x1080);
- usar estratégia consistente de preenchimento (cover), evitando borda preta/faixas.

### D) Fontes de imagem no modal
No modal de geração, incluir:
1. **Upload local**
2. **Drive de fotos do projeto** (pasta já configurada no projeto)

Reaproveitar integração existente do projeto para listar fotos do drive; não criar fluxo paralelo.

### E) Identidade do projeto no painel de propriedades
No editor, integrar propriedades com assets/tokens do projeto:

1. **Propriedade de Logo**
- No layer de logo, oferecer seletor com as logos cadastradas no projeto (assets do projeto web).
- Permitir trocar rapidamente entre logos disponíveis sem upload manual no editor.

2. **Cor de texto com paleta do projeto**
- No seletor de cor de texto, exibir primeiro as cores salvas no projeto (paleta oficial).
- Manter opção de cor customizada, mas priorizar visualmente a paleta do projeto.
- Persistir no documento Konva a cor aplicada normalmente.

## Fora de escopo desta conversa
- Fase 5 completa de RAG/prompt orchestration.
- Sync offline-first.
- Export batch final de produção.

## Critérios de aceite
1. Consigo ajustar microtipografia no editor e salvar no JSON.
2. Botão `Gerar Arte` aparece no editor e abre modal correto.
3. Modal mostra todas as páginas e destaca a página atual como padrão.
4. Geração funciona para páginas selecionadas, com variações em fila.
5. Imagem de fundo ocupa canvas completo sem faixa/corte indevido.
6. Fontes de imagem no modal: Upload local + Drive do projeto.
7. Layer de logo permite selecionar logos já cadastradas no projeto.
8. Cor de texto oferece paleta de cores do projeto.
9. Typecheck passa sem regressão.

## Regras de execução
1. Implementar em pequenos blocos.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-4.1): refino de texto e gerar arte no editor com selecao de paginas`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Próximo passo sugerido.

Comece agora.

---
