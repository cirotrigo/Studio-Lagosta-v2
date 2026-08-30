# Pendência — a revisão não aparece em carrossel (30/08/2026)

Relatado pelo Ciro depois de validar a revisão pela agenda: criou um carrossel
no Bacana e **o card "Revisão da arte" não apareceu**. Uma sessão foi lançada
para investigar e corrigir; este documento guarda o diagnóstico já medido, para
o trabalho não recomeçar do zero se a sessão se perder.

## O que já está medido (sonda em produção, 30/08)

- A barra é montada em `post-detail-view.tsx` guardada por
  `{post.generationId && (…)}` — **só existe com `generationId`**.
- O carrossel do Bacana (DRAFT, 7 mídias, agendado 30/08 14:30) tem
  **`generationId = NULL`** e `pageId` nulo.
- No projeto 5 (Bacana): **326 posts COM** generationId e **580 SEM**
  (CAROUSEL 54 · STORY 509 · POST 10 · REEL 7).
- Conclusão: some por falta de VÍNCULO, não por bug de UI.

## As duas perguntas que a sessão responde

1. **Por que o post nasceu sem vínculo?** `agendarPost`
   (`src/lib/creatives/agendar.ts`) deriva o `generationId` por
   `resultUrl === mediaUrls[0]`; outros caminhos (composer web,
   `colocar-na-agenda`, `upload-creative` do canvas) podem não gravar. As
   Generations das 7 artes provavelmente existem — falta o post apontar.
2. **Como a revisão funciona em carrossel**, onde cada slide é uma arte
   diferente e `SocialPost.generationId` é um só? O caminho natural é a
   revisão seguir o SLIDE visível (o `currentImageIndex` já existe no
   componente, e o `ImproveCreativeModal` no mesmo arquivo já melhora o slide
   atual via `applyToPostMediaIndex`). Assim "Gostei" e os pedidos passam a
   ser por slide, que é como a revisão acontece na prática.

## Balizas dadas à sessão

- Corrigir na ORIGEM quando o caminho de criação puder gravar o vínculo.
- Post sem Generation nenhuma: decidir entre aviso de uma linha ou seguir
  sem barra — nunca inventar feedback sem arte por trás (regra da casa:
  "feedback sem prompt não ensina nada").
- Backfill opcional (`scripts/backfill-generation-id-dos-posts.ts`), dry-run
  por padrão, religando por `resultUrl`.
- Working tree COMPARTILHADA com a frente de sugestão de fotos: conjunto
  disjunto de arquivos, `git pull` antes, commits separados por assunto.

## Contexto do que já está no ar (para quem retomar)

Revisão pela agenda: `docs/SESSAO-2026-08-30-REVISAO-PELA-AGENDA.md`.
Desde 30/08 à tarde o pedido tem ABAS (Geral/Foto/Copy/Design/Horário), cada
uma com o próprio texto, gravadas juntas em `escolhido.pedidos[]`
(`src/lib/aprendizado/feedback-de-arte.ts`), e o seletor de foto confirma em
dois tempos. Testado pelo Ciro: funcionando.
