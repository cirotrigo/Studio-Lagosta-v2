/**
 * Guardas das MUTAÇÕES que o perfil draft-only pode chamar (H4 do Dot, 13/10/2026).
 *
 * A allowlist (`registro/perfil.ts`) decide QUAIS tools existem para o perfil.
 * Estas guardas garantem que mesmo as permitidas nunca alcancem uma peça
 * APROVADA: post SCHEDULED, POSTING, POSTED (e FAILED, que é publicação que
 * deu errado e é da recuperação), ou já entregue ao publicador (`laterPostId`).
 * Para o perfil, só o rascunho que ninguém aprovou é dele.
 *
 * Fail-closed: erro de leitura propaga e a tool recusa. "Não deu para
 * conferir" nunca vira "pode editar".
 */

import { db } from '@/lib/db';
import { CreativeError } from '@/lib/creatives/errors';
import { urlsAnterioresDe } from '@/lib/compositor/recompor';

export const CODIGO_POST_APROVADO = 'POST_APROVADO_INTOCAVEL';

/** Só rascunho que não foi entregue ao publicador é do perfil draft-only. */
export function postAprovado(p: {
  status: string;
  laterPostId: string | null;
}): boolean {
  return p.status !== 'DRAFT' || !!p.laterPostId;
}

function recusa(onde: string): CreativeError {
  return new CreativeError(
    CODIGO_POST_APROVADO,
    `${onde} está num post aprovado (agendado, publicando, publicado, falhou ou entregue ao publicador). Este perfil só trabalha em rascunho: nada foi alterado.`,
    409
  );
}

/**
 * A página só pode ser ajustada pelo perfil se NENHUM post ligado a ela estiver
 * aprovado. Ligação conta por qualquer caminho:
 * - o `pageId` do post;
 * - uma Generation da página (`fieldValues.pageId`) no `generationId` do post
 *   ou nas `mediaUrls` dele (o slide de carrossel não tem `pageId`);
 * - o post do item de lote ou do item de plano da página.
 *
 * Ajustar a página re-renderiza os posts dela: um agendado sairia com conteúdo
 * que ninguém aprovou.
 */
export async function assertPaginaSoEmRascunho(
  pageId: string,
  projectId: number
): Promise<void> {
  const artes = await db.generation.findMany({
    where: { projectId, fieldValues: { path: ['pageId'], equals: pageId } },
    select: { id: true, resultUrl: true, fieldValues: true },
  });
  const geracoes = artes.map((a) => a.id);
  // As URLs que a página JÁ TEVE contam: um post aprovado pode seguir com uma delas (a recomposição guarda o rastro).
  const urls = [...new Set(artes.flatMap((a) => [a.resultUrl, ...urlsAnterioresDe(a.fieldValues)]).filter((u): u is string => !!u))]

  const [porVinculo, doLote, doPlano] = await Promise.all([
    db.socialPost.findMany({
      where: {
        projectId,
        OR: [
          { pageId },
          ...(geracoes.length ? [{ generationId: { in: geracoes } }] : []),
          ...(urls.length ? [{ mediaUrls: { hasSome: urls } }, { renderedImageUrl: { in: urls } }] : []),
        ],
      },
      select: { status: true, laterPostId: true, mediaUrls: true },
    }),
    geracoes.length
      ? db.itemDeLote.findMany({
          where: {
            projectId,
            generationId: { in: geracoes },
            postId: { not: null },
          },
          select: { postId: true },
        })
      : Promise.resolve([] as Array<{ postId: string | null }>),
    db.itemDePlano.findMany({
      where: {
        projectId,
        postId: { not: null },
        OR: [
          { pageId },
          ...(geracoes.length ? [{ generationId: { in: geracoes } }] : []),
        ],
      },
      select: { postId: true },
    }),
  ]);
  if (porVinculo.some(postAprovado)) throw recusa('A página desta arte');
  // Slide de carrossel: a mudança só chega ao post pela recomposição, que o perfil não pede (ela alcança agendados).
  // Carrossel não é do loop do agente; ajustar o slide é de gente.
  if (porVinculo.some((p) => (p.mediaUrls ?? []).length > 1)) {
    throw new CreativeError(
      'CARROSSEL_FORA_DO_PERFIL',
      'Esta arte é slide de um carrossel na agenda. Ajustar slide de carrossel é com a equipe neste perfil: nada foi alterado.',
      409,
    );
  }

  const outros = [...doLote, ...doPlano]
    .map((l) => l.postId)
    .filter((id): id is string => !!id);
  if (outros.length) {
    const ligados = await db.socialPost.findMany({
      where: { id: { in: outros } },
      select: { status: true, laterPostId: true },
    });
    // Vínculo cujo post não existe mais não trava nada: o post foi apagado.
    if (ligados.some(postAprovado)) throw recusa('A página desta arte');
  }
}

/**
 * Os itens da leva cuja identidade (loteId, itemId) JÁ virou post aprovado.
 * Recompor ou retomar uma peça dessas devolveria à produção um conteúdo que já
 * foi aprovado. O perfil não toca. Devolve os itemIds a recusar.
 */
export async function itensDeLoteJaAprovados(
  projectId: number,
  loteId: string,
  itemIds: string[]
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const linhas = await db.itemDeLote.findMany({
    where: {
      projectId,
      loteId,
      itemId: { in: itemIds },
      postId: { not: null },
    },
    select: { itemId: true, postId: true },
  });
  if (linhas.length === 0) return new Set();
  const posts = await db.socialPost.findMany({
    where: { id: { in: linhas.map((l) => l.postId!) } },
    select: { id: true, status: true, laterPostId: true },
  });
  const aprovados = new Set(posts.filter(postAprovado).map((p) => p.id));
  return new Set(
    linhas.filter((l) => aprovados.has(l.postId!)).map((l) => l.itemId)
  );
}
