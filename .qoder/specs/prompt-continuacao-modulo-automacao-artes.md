## Prompt de continuidade (nova conversa)

Continue a implementacao do modulo de automacao de artes no Electron a partir da Fase 2, considerando que a Fase 1 ja foi concluida.

Contexto obrigatorio:

1. Spec principal: `.qoder/specs/spec-modulo-automacao-artes-instagram.md`
2. Fase 1 concluida (ja implementado):
   - backend copy estruturada: `src/app/api/tools/generate-ai-text/route.ts`
   - IPC main: `desktop-app/electron/main.ts` (`generate-ai-text`)
   - preload: `desktop-app/electron/preload.ts` (`generateAIText`)
   - fallback de modelo de imagem por env: `src/app/api/tools/generate-art/route.ts`
   - limite de referencias em 5 (UI + backend + IPC sanitizacao)

Objetivo desta conversa:

1. Implementar Fase 2 (Preview editavel) completa:
   - registry HTML dos templates DS (S1-S6/F1-F3) em modulo dedicado;
   - renderer de preview HTML/DOM com two-way data binding;
   - bloco WYSIWYG com edicao em tempo real por variacao (contenteditable + painel lateral).
2. Conectar o contrato `generate-ai-text` ao fluxo de "Visualizar Artes" para alimentar os templates com `variacoes[]`.
3. Garantir aprovacao por variacao:
   - status inicial `Em revisao`;
   - `Aprovar variacao` e `Aprovar todas`;
   - se editar depois de aprovada, voltar para `Em revisao`.
4. Preservar regras de visualizacao sem corte:
   - `object-fit: contain` no preview de resultados aprovados;
   - manter aspect ratio real por formato (`STORY 1080x1920`, `FEED_PORTRAIT 1080x1350`, `SQUARE 1080x1080`).
5. Nao regredir regras ja acordadas:
   - formulario continua livre (fila nao bloqueia);
   - imagens geradas por IA entram em `Geradas com IA`;
   - artes aprovadas sobem para web/Vercel e aparecem no Historico.

Entrega esperada:

1. Codigo implementado.
2. Typecheck/validacoes executadas e reportadas.
3. Spec atualizada com status da Fase 2.
