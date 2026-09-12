/**
 * O contrato da copy autoral no BANCO — a única casa do módulo que importa o
 * Prisma. A regra de revisão mora em `revisar-pagina.ts` (puro): quem grava as
 * camadas da página põe a revisão NA MESMA ESCRITA (o PATCH do editor,
 * `ajustarArte`, `reverterCamadasDaArte`, a recomposição). Esta função é o
 * caminho para quem só tem o `pageId` e as camadas já gravadas — auditoria
 * tardia, nunca lança.
 */

import { db } from '@/lib/db'
import type { Autor, CopyAutoral } from './contrato'
import { revisaoDaPaginaComCamadas, type RevisaoDaPagina } from './revisar-pagina'

export { copyAutoralDaPagina } from './revisar-pagina'

export interface RevisaoRegistrada {
  estado: RevisaoDaPagina['estado'] | 'erro'
  copy?: CopyAutoral
  blocos?: string[]
}

/**
 * Registra no contrato da página a revisão que as camadas dadas representam
 * (as camadas já gravadas). Compare-and-set no contrato lido: se outra escrita
 * mudou o contrato no meio, nada é gravado por cima — quem escreve camadas
 * DEVE levar a revisão na própria escrita; isto é só o caminho tardio.
 */
export async function registrarRevisaoDaPagina(args: {
  pageId: string
  camadas: unknown
  quem: { autor: Autor; motivo: string; superficie: string }
}): Promise<RevisaoRegistrada> {
  try {
    const page = await db.page.findUnique({ where: { id: args.pageId }, select: { copyAutoral: true } })
    if (!page) return { estado: 'sem-contrato' }
    const r = revisaoDaPaginaComCamadas(page.copyAutoral, args.camadas, args.quem)
    if (r.estado !== 'registrada' || !r.copy) return { estado: r.estado, ...(r.copy ? { copy: r.copy } : {}) }
    const gravada = await db.page.updateMany({
      where: { id: args.pageId, copyAutoral: { equals: page.copyAutoral as never } },
      data: { copyAutoral: r.copy as never },
    })
    if (gravada.count === 0) return { estado: 'erro' }
    return { estado: 'registrada', copy: r.copy, blocos: r.blocos }
  } catch (erro) {
    console.warn('[copy-autoral] revisão da página não registrada:', erro instanceof Error ? erro.message : erro)
    return { estado: 'erro' }
  }
}
