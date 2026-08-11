/**
 * A copy de uma arte que já existe: se ela nasceu de uma leva, quem responde
 * por ela é a DICA que a propôs.
 *
 * `fecharDicaDeCopyDoItem` (fatia B2) já sabia fechar a dica — mas só serve a
 * quem tem o `itemDePlanoId` em mãos, que é o caso da BANCADA. As outras
 * superfícies não têm: `ajustar-arte` recebe uma página e o autosave do editor
 * também. Este módulo é a ponte, e nada mais: descobre o item pela ARTE e
 * delega. Toda a lógica de chave, de eco e de comparação continua num lugar só.
 *
 * ⚠️ Nada aqui lança — contrato de `captura.ts`. Registrar aprendizado não pode
 * impedir ninguém de ajustar uma arte.
 */

import { db } from '@/lib/db'
import type { LadoDaCopy } from './diff-copy'
import { valoresDaCopy } from './diff-copy'
import {
  escolherItemDoPlano,
  type ResultadoDaCopyDePlano,
} from './fechar-copy-por-pagina-contrato'
import { fecharDicaDeCopyDoItem } from './sinal-de-copy-do-plano'
import type { Superficie } from './vocabulario'

export { caiNaEscolhaPropria, type ResultadoDaCopyDePlano } from './fechar-copy-por-pagina-contrato'

/** Quantos itens a busca traz antes de escolher. Empate real é raro. */
const TETO_DE_CANDIDATOS = 20

function limpo(valor: string | null | undefined): string | null {
  const t = typeof valor === 'string' ? valor.trim() : ''
  return t === '' ? null : t
}

/**
 * Fecha a dica de copy da arte desta página, quando ela veio de uma leva.
 *
 * Devolve `sem-plano` quando não veio (ou quando o item nunca recebeu dica) —
 * e é SÓ nesse caso que o chamador deve registrar a escolha absoluta, por
 * `caiNaEscolhaPropria`.
 *
 * `pageId` e `generationId` servem a duas coisas ao mesmo tempo: são as chaves
 * de busca do item e os vínculos gravados no sinal. Em `ajustar-arte` a
 * Generation é NOVA (nenhum item aponta para ela), então quem acha o item é a
 * página — e a arte nova entra como vínculo, que é o que se quer.
 *
 * 🔴 A busca NÃO olha `sourcePageId`: aquilo é a página-MODELO do cliente, e
 * editar o modelo no editor não é editar a copy proposta para uma peça — é
 * mexer no espelho de onde todas as peças futuras saem.
 */
export async function fecharDicaDeCopyDaPagina(entrada: {
  projectId: number
  pageId?: string | null
  generationId?: string | null
  /** A copy como ficou. Aceita `Record<campo, texto>` (o editor) ou lista. */
  copyFinal: LadoDaCopy
  /** `User.id` INTERNO (cuid) — NUNCA o clerkId. */
  decididoPor?: string | null
  superficie?: Superficie
  postId?: string | null
}): Promise<ResultadoDaCopyDePlano> {
  try {
    const pageId = limpo(entrada.pageId)
    const generationId = limpo(entrada.generationId)
    if (!pageId && !generationId) return 'sem-plano'

    const candidatos = await db.itemDePlano.findMany({
      where: {
        projectId: entrada.projectId,
        OR: [...(pageId ? [{ pageId }] : []), ...(generationId ? [{ generationId }] : [])],
      },
      select: { id: true, pageId: true, generationId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: TETO_DE_CANDIDATOS,
    })
    if (candidatos.length === 0) return 'sem-plano'

    const item = escolherItemDoPlano(
      candidatos.map((c) => ({
        id: c.id,
        pageId: c.pageId,
        generationId: c.generationId,
        atualizadoEm: c.updatedAt,
      })),
      { pageId, generationId },
    )
    if (!item) return 'sem-plano'

    const resultado = await fecharDicaDeCopyDoItem({
      projectId: entrada.projectId,
      itemDePlanoId: item.id,
      // A conversão passa pelas MESMAS regras do diff (`valoresDaCopy`): quem
      // chama manda a copy por campo, e a dica guarda blocos sem nome.
      copyFinal: valoresDaCopy(entrada.copyFinal),
      decididoPor: entrada.decididoPor ?? null,
      superficie: entrada.superficie,
      generationId,
      postId: entrada.postId ?? null,
    })
    // Item que existe mas nunca recebeu dica é indistinguível, para quem chama,
    // de arte que não veio de leva: nos dois casos a copy não foi proposta.
    return resultado === 'sem-dica' ? 'sem-plano' : resultado
  } catch (erro) {
    console.error('[aprendizado] falha ao fechar a dica de copy da página (seguindo sem ela):', erro)
    return 'erro'
  }
}
