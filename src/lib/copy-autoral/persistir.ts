/**
 * O contrato da copy autoral no BANCO — a única casa que importa o Prisma.
 *
 * Quem escreve as camadas de uma página e muda o TEXTO passa por aqui para
 * registrar a REVISÃO no contrato da página (`Page.copyAutoral`), com autor,
 * data, motivo e superfície. Três portas hoje: o PATCH do editor (`equipe`),
 * `ajustarArte` (o chat: `claude`; a pessoa no editor via ajuste: `equipe`) e a
 * recomposição (`sistema`, que NÃO muda texto e por isso não revisa).
 *
 * Regras:
 *  - página SEM contrato não ganha um por inferência (a autoria do original
 *    é desconhecida e o histórico não se inventa) — a função sai calada;
 *  - a revisão é calculada pelo diff EXATO do contrato (`aplicarRevisao`),
 *    com a copy efetiva lida das camadas novas; sem mudança, nada é gravado;
 *  - nunca lança: registrar a revisão é auditoria, e falhar aqui não pode
 *    derrubar a escrita da página (mesmo contrato de `captura.ts`).
 */

import type { Layer } from '@/types/template'
import { db } from '@/lib/db'
import { lerCamadas } from '@/lib/posts/page-layers'
import type { Autor, CopyAutoral } from './contrato'
import { copyEfetivaDasCamadas } from './efetiva'
import { lerCopyAutoral } from './serializar'

export interface RevisaoRegistrada {
  estado: 'registrada' | 'sem-mudanca' | 'sem-contrato' | 'ilegivel' | 'erro'
  copy?: CopyAutoral
  blocos?: string[]
}

/** O contrato gravado na página, validado; `null` quando não há ou não passa. */
export function copyAutoralDaPagina(gravado: unknown): CopyAutoral | null {
  if (gravado == null) return null
  return lerCopyAutoral(gravado).copy
}

/**
 * Registra no contrato da página a revisão que as camadas NOVAS representam.
 * `camadas` são as camadas já gravadas (ou prestes a ser) — o texto delas é a
 * verdade do que a peça mostra agora.
 */
export async function registrarRevisaoDaPagina(args: {
  pageId: string
  camadas: unknown
  quem: { autor: Autor; motivo: string; superficie: string }
}): Promise<RevisaoRegistrada> {
  try {
    const page = await db.page.findUnique({ where: { id: args.pageId }, select: { copyAutoral: true } })
    const atual = copyAutoralDaPagina(page?.copyAutoral)
    if (!atual) return { estado: 'sem-contrato' }
    const lidas = lerCamadas(args.camadas)
    if (!lidas.legivel) return { estado: 'ilegivel' }
    const { efetiva, mudancas } = copyEfetivaDasCamadas(atual, lidas.camadas as unknown as Layer[], { superficie: args.quem.superficie })
    if (mudancas.length === 0) return { estado: 'sem-mudanca', copy: atual }
    // A revisão registrada pela LEITURA das camadas é de quem escreveu as
    // camadas — não do sistema: `copyEfetivaDasCamadas` a assina como sistema
    // por padrão, e aqui a autoria é trocada pela de quem mexeu.
    const ultima = efetiva.revisoes[efetiva.revisoes.length - 1]
    const revisada: CopyAutoral = {
      ...efetiva,
      revisoes: [...efetiva.revisoes.slice(0, -1), { ...ultima, autor: args.quem.autor, motivo: args.quem.motivo, superficie: args.quem.superficie }],
    }
    await db.page.update({ where: { id: args.pageId }, data: { copyAutoral: revisada as never } })
    return { estado: 'registrada', copy: revisada, blocos: mudancas.map((m) => m.id) }
  } catch (erro) {
    console.warn('[copy-autoral] revisão da página não registrada:', erro instanceof Error ? erro.message : erro)
    return { estado: 'erro' }
  }
}
