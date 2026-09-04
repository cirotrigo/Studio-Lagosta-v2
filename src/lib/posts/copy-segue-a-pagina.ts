/**
 * A copy do post SEGUE a página quando era a copy da própria página.
 *
 * `SocialPost.slotValues` tem duas origens com semânticas opostas:
 *
 * - Na via de TEMPLATE (plan-week, create-post, later-scheduler) a página é um
 *   LAYOUT compartilhado com texto de espelho, e cada post carrega a sua copy
 *   em `slotValues`. O render aplica `slotValues` por cima da página — e é
 *   isso que faz N posts saírem de UMA página. Ali a página NÃO manda.
 * - Na via de CONTEÚDO (compositor, arte-rapida, arte-enviada, agendar por
 *   pageId) a página É a peça, e `agendarPost` grava em `slotValues` uma
 *   CÓPIA do texto da página no momento do agendamento — para o corpus de
 *   aprendizado. O render aplicava essa cópia por cima da página, então
 *   reescrever a copy no editor era desfeito no re-render seguinte: a página
 *   dizia "ALMOÇO E JANTAR", a agenda publicava "FERIADO É DIA DE ESPETO"
 *   (Espeto Gaúcho, 03/09/2026 — o Ciro editou três peças e nenhuma mudou).
 *
 * Não dá para distinguir as duas pela página (`isTemplate` é false nas duas —
 * `create-page` cria conteúdo por default desde 10/08) nem pelo post. O que
 * as distingue é a RELAÇÃO: o post cuja copy era IGUAL ao texto que a página
 * tinha ANTES da edição estava carregando a copy da página — então ele
 * segue a página. O post com copy própria (diferente da página) é da via de
 * template e fica como está.
 *
 * Chamado no PATCH da página, dentro da MESMA transação que invalida os
 * renders: o render que a invalidação dispara tem de ler a copy nova.
 */
// Só import de TIPO: o módulo é testado sem o client do Prisma gerado, como
// os outros puros da casa (`page-layers.ts`, `diff-copy.ts`).
import type { Prisma } from '@prisma/client'

type DbClient = Prisma.TransactionClient | { socialPost: Prisma.TransactionClient['socialPost'] }

/** Só os valores de TEXTO de um `slotValues` (string, ou objeto com `content`). */
export function textosDoSlot(slotValues: unknown): Record<string, string> | null {
  if (!slotValues || typeof slotValues !== 'object' || Array.isArray(slotValues)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(slotValues as Record<string, unknown>)) {
    // `_driveImageId` e afins são metadado do slot, não texto de camada.
    if (k.startsWith('_')) continue
    if (typeof v === 'string') out[k] = v
    else if (v && typeof v === 'object' && typeof (v as { content?: unknown }).content === 'string') {
      out[k] = (v as { content: string }).content
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function normalizar(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * A copy do post é a copy da página? Mesmas chaves de texto, mesmos textos
 * (espaço em branco colapsado). Chave que só um dos lados tem já é diferença:
 * um post que carrega um slot a mais tem copy própria.
 */
export function copyIgual(
  a: Record<string, string> | null,
  b: Record<string, string> | null,
): boolean {
  if (!a || !b) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && normalizar(a[k]) === normalizar(b[k]))
}

/**
 * O `slotValues` novo: os textos passam a ser os da página; o que não é
 * texto (`_driveImageId`, objeto com `fileUrl`) fica como estava. Texto cujo
 * papel sumiu da página sai junto — slot sem camada é aviso no render.
 */
export function slotValuesSeguindo(
  slotValues: unknown,
  copyDepois: Record<string, string>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  if (slotValues && typeof slotValues === 'object' && !Array.isArray(slotValues)) {
    for (const [k, v] of Object.entries(slotValues as Record<string, unknown>)) {
      const ehTexto =
        !k.startsWith('_') &&
        (typeof v === 'string' ||
        (v && typeof v === 'object' && typeof (v as { content?: unknown }).content === 'string'))
      if (!ehTexto) base[k] = v
    }
  }
  return { ...base, ...copyDepois }
}

export interface SeguirCopyInput {
  pageId: string
  /** Texto da página ANTES da edição (`copyDeCamadas` das camadas antigas). */
  copyAntes: Record<string, string> | null
  /** Texto da página DEPOIS da edição. */
  copyDepois: Record<string, string> | null
}

/**
 * Atualiza `slotValues` dos posts desta página que carregavam a copy dela.
 * Devolve quantos seguiram. Post já entregue ao publicador (`laterPostId`)
 * não muda — a arte dele está congelada de qualquer forma.
 */
export async function seguirCopyDaPagina(client: DbClient, input: SeguirCopyInput): Promise<number> {
  if (!input.copyAntes || !input.copyDepois) return 0
  const posts = await client.socialPost.findMany({
    where: {
      pageId: input.pageId,
      status: { in: ['DRAFT', 'SCHEDULED'] },
      laterPostId: null,
    },
    select: { id: true, slotValues: true },
  })
  let seguiram = 0
  for (const post of posts) {
    if (!copyIgual(textosDoSlot(post.slotValues), input.copyAntes)) continue
    await client.socialPost.update({
      where: { id: post.id },
      data: { slotValues: slotValuesSeguindo(post.slotValues, input.copyDepois) as Prisma.InputJsonValue },
    })
    seguiram += 1
  }
  return seguiram
}
