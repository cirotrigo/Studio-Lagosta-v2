/**
 * O contrato da copy autoral no BANCO — a única casa do módulo que importa o
 * Prisma. A regra de revisão mora em `revisar-pagina.ts` (puro): quem grava as
 * camadas da página põe a revisão NA MESMA ESCRITA. `gravarCamadasComRevisao`
 * é a porta comum para isso (o PATCH de camada, o PUT do template e
 * `reverterCamadasDaArte`); o PATCH do editor, `ajustarArte` e a recomposição
 * têm a mesma regra escrita no próprio laço. `registrarRevisaoDaPagina` é o
 * caminho para quem só tem o `pageId` e as camadas já gravadas — auditoria
 * tardia, nunca lança.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { lerCamadas } from '@/lib/posts/page-layers'
import { reconciliarMarcasDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import type { Autor, CopyAutoral } from './contrato'
import { recusaDaRevisao, revisaoDaPaginaComCamadas, type RevisaoDaPagina } from './revisar-pagina'

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
    const page = await db.page.findUnique({ where: { id: args.pageId }, select: { copyAutoral: true, layers: true } })
    if (!page) return { estado: 'sem-contrato' }
    // Caminho TARDIO: as camadas já foram gravadas, então `page.layers` são as novas — não há "anteriores" para reconciliar aqui.
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

/** O cliente que grava a página: o `db` ou a transação de quem chama. */
export type ClienteDaPagina = Pick<typeof db, 'page'>

export interface CamadasGravadas {
  /** As camadas gravadas (string JSON, a forma da coluna). */
  camadas: string
  /**
   * A página COMO ESTAVA no banco quando a escrita valeu — contra ela a
   * diferença e a revisão foram medidas. Os campos VISUAIS (`background`,
   * `width`, `height`) vêm junto porque quem decide efeito colateral ("o visual
   * mudou?") tem de comparar com a base EFETIVAMENTE substituída, nunca com a
   * leitura do começo do handler (PR3-R9-01).
   */
  base: { updatedAt: Date; layers: unknown; copyAutoral: unknown; background: string | null; width: number; height: number }
  revisao: RevisaoDaPagina
  /** Recusa do contrato (histórico cheio, copy que não cabe): as camadas foram gravadas e o contrato ficou como estava. */
  aviso: string | null
}

/**
 * Grava camadas de uma página COM a revisão do contrato da copy, na MESMA
 * escrita e condicionada à versão LIDA (compare-and-set em `updatedAt`) —
 * revisão final do Codex sobre abac9b34, 18/09/2026:
 *  - PR3-F01: a reversão lia o contrato fora da escrita; um PATCH no meio
 *    deixava camadas X com contrato Y (e apagava o histórico concorrente);
 *  - PR3-F03: o PATCH de CAMADA e o PUT do TEMPLATE gravavam camadas sem
 *    revisar o contrato — a página passava a mostrar outro texto que o do
 *    contrato, e a edição seguinte ganhava a autoria errada.
 *
 * `camadas` é calculada sobre a página relida a cada volta (o PATCH de camada
 * funde a camada editada na página ATUAL, não na da leitura inicial).
 * `humana` reconcilia a marca "escondida pelo revisor" contra essa mesma base
 * (C3-02/C3-11) antes de medir a revisão. Recusa do contrato nunca derruba a
 * escrita: as camadas vão, o contrato fica, o aviso volta. Perdida a corrida
 * `voltas` vezes, nada é gravado e sai `PAGINA_MUDOU_DURANTE` (409).
 * `null` quando a página não existe.
 */
export async function gravarCamadasComRevisao(
  cliente: ClienteDaPagina,
  args: {
    pageId: string
    camadas: (base: { layers: unknown }) => string
    quem: { autor: Autor; motivo: string; superficie: string }
    humana?: boolean
    /** Reconcilia o contrato com as camadas RELIDAS antes da escrita como revisão do sistema (PR5-06). */
    reconciliarComAnteriores?: boolean
    dados?: Record<string, unknown>
    voltas?: number
  },
): Promise<CamadasGravadas | null> {
  for (let volta = 0; volta < (args.voltas ?? 4); volta++) {
    const base = await cliente.page.findUnique({ where: { id: args.pageId }, select: { updatedAt: true, layers: true, copyAutoral: true, background: true, width: true, height: true } })
    if (!base) return null
    let camadas = args.camadas(base)
    if (args.humana) {
      const novas = lerCamadas(camadas)
      if (novas.legivel) {
        camadas = JSON.stringify(reconciliarMarcasDoRevisor(lerCamadas(base.layers).camadas as Array<{ id: string; visible?: unknown }>, novas.camadas as Array<{ id: string; [chave: string]: unknown }>))
      }
    }
    const revisao = revisaoDaPaginaComCamadas(base.copyAutoral, camadas, args.quem, args.reconciliarComAnteriores ? { camadasAnteriores: base.layers } : {})
    const gravada = await cliente.page.updateMany({
      where: { id: args.pageId, updatedAt: base.updatedAt },
      data: { ...(args.dados ?? {}), layers: camadas, ...(revisao.estado === 'registrada' && revisao.copy ? { copyAutoral: revisao.copy as never } : {}) },
    })
    if (gravada.count > 0) return { camadas, base, revisao, aviso: recusaDaRevisao(revisao) }
  }
  throw new CreativeError('PAGINA_MUDOU_DURANTE', 'A página foi editada ao mesmo tempo por outro caminho e esta escrita não foi gravada. Veja a página como está e repita se ainda fizer sentido.', 409)
}
