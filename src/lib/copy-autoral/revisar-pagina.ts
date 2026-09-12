/**
 * A REVISÃO do contrato de uma página a partir das camadas que vão ser (ou
 * acabaram de ser) gravadas — módulo PURO, para a revisão entrar na MESMA
 * escrita das camadas (R02 da revisão do Codex sobre o PR 3, 12/09/2026:
 * calculada num `after()`, dois autosaves fora de ordem deixavam a página com
 * as camadas B e o contrato de A).
 *
 * Regras:
 *  - página SEM contrato não ganha um por inferência (`sem-contrato`);
 *  - camadas ilegíveis não revisam nada (`ilegivel`) — ilegível nunca vira
 *    "nada mudou" nem "tudo mudou";
 *  - o diff é EXATO (`copyEfetivaDasCamadas` + `aplicarRevisao`); sem mudança
 *    não há revisão (`sem-mudanca`);
 *  - a revisão é assinada por quem escreveu as camadas (`quem`), nunca pelo
 *    sistema — a leitura das camadas assina como sistema por padrão e aqui a
 *    autoria é trocada.
 */

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import type { Autor, CopyAutoral } from './contrato'
import { copyEfetivaDasCamadas } from './efetiva'
import { lerCopyAutoral } from './serializar'

export interface RevisaoDaPagina {
  estado: 'registrada' | 'sem-mudanca' | 'sem-contrato' | 'ilegivel'
  /** O contrato que a página deve passar a ter (`registrada`) ou tem (`sem-mudanca`); `null` nos outros estados. */
  copy: CopyAutoral | null
  blocos: string[]
  lacunas: string[]
}

/** O contrato gravado na página, validado; `null` quando não há ou não passa. */
export function copyAutoralDaPagina(gravado: unknown): CopyAutoral | null {
  if (gravado == null) return null
  return lerCopyAutoral(gravado).copy
}

export function revisaoDaPaginaComCamadas(
  gravado: unknown,
  camadas: unknown,
  quem: { autor: Autor; motivo: string; superficie: string; em?: string },
): RevisaoDaPagina {
  const atual = copyAutoralDaPagina(gravado)
  if (!atual) return { estado: 'sem-contrato', copy: null, blocos: [], lacunas: [] }
  const lidas = lerCamadas(camadas)
  if (!lidas.legivel) return { estado: 'ilegivel', copy: null, blocos: [], lacunas: [] }
  const { efetiva, mudancas, lacunas } = copyEfetivaDasCamadas(atual, lidas.camadas as unknown as Layer[], { superficie: quem.superficie, ...(quem.em ? { em: quem.em } : {}) })
  if (mudancas.length === 0) return { estado: 'sem-mudanca', copy: atual, blocos: [], lacunas }
  const ultima = efetiva.revisoes[efetiva.revisoes.length - 1]
  const revisada: CopyAutoral = {
    ...efetiva,
    revisoes: [...efetiva.revisoes.slice(0, -1), { ...ultima, autor: quem.autor, motivo: quem.motivo, superficie: quem.superficie }],
  }
  return { estado: 'registrada', copy: revisada, blocos: mudancas.map((m) => m.id), lacunas }
}
