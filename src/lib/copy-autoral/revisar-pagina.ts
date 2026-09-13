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
 *    autoria é trocada;
 *  - 🔴 a camada que o REVISOR escondeu (ajuste `visibilidade`, marca
 *    `metadata.revisao.ocultaPeloRevisor` gravada pelo PR 0) é lida como
 *    PRESENTE (`camadasParaDecisao`): esconder por ajuste mecânico não é quem
 *    assina a revisão (`claude`/`equipe`) apagando o texto. Sem isso o bloco
 *    saía vazio numa revisão AUTORAL, e mostrar a camada de novo virava uma
 *    adição autoral. Camada escondida SEM a marca continua sendo remoção de
 *    quem escreveu. A copy EFETIVA da arte (`copyEfetivaDasCamadas` sobre as
 *    camadas cruas) segue dizendo o que foi DESENHADO — revisão do sistema.
 */

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import { camadasParaDecisao } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import type { Autor, CopyAutoral } from './contrato'
import { tentarCopyEfetivaDasCamadas } from './efetiva'
import { HistoricoDaCopyCheio } from './revisao'
import { lerCopyAutoral } from './serializar'

export interface RevisaoDaPagina {
  /**
   * `historico-cheio`: as camadas mudaram a copy, mas o contrato já tem o
   * máximo de revisões (`HistoricoDaCopyCheio`, PR2-02) — a mudança NÃO entra
   * no contrato. Quem grava as camadas grava-as mesmo assim, mantém o contrato
   * como estava (nunca grava `copy`, que é `null`) e repassa `aviso`.
   */
  estado: 'registrada' | 'sem-mudanca' | 'sem-contrato' | 'ilegivel' | 'historico-cheio' | 'copy-invalida'
  /** O contrato que a página deve passar a ter (`registrada`) ou tem (`sem-mudanca`); `null` nos outros estados. */
  copy: CopyAutoral | null
  blocos: string[]
  lacunas: string[]
  /** Só em `historico-cheio` e `copy-invalida`: o que aconteceu (e o que fazer), em português, para a resposta e o log. */
  aviso?: string
}

/**
 * A revisão foi RECUSADA pelo contrato — `historico-cheio` (200 revisões) ou `copy-invalida` (a copy lida das camadas
 * não cabe: linha acima de 300, mais de 12 linhas, mais de 40 blocos — `RevisaoDaCopyInvalida`, `9238098f`)? Devolve o
 * aviso; `null` quando não houve recusa. Quem grava as camadas grava-as mesmo assim e mantém o contrato como estava.
 */
export function recusaDaRevisao(r: RevisaoDaPagina): string | null {
  if (r.estado !== 'historico-cheio' && r.estado !== 'copy-invalida') return null
  return r.aviso ?? 'a mudança não entrou no contrato da copy, que ficou como estava'
}

/**
 * As camadas como a AUTORIA as lê: a escondida pelo revisor conta como presente
 * (ver o cabeçalho). Nunca use para medir o que a arte mostra.
 */
function lerCamadasParaAutoria(cru: unknown): ReturnType<typeof lerCamadas> {
  const lidas = lerCamadas(cru)
  return lidas.legivel ? { ...lidas, camadas: camadasParaDecisao(lidas.camadas as Array<{ visible?: unknown; metadata?: unknown; [chave: string]: unknown }>) as typeof lidas.camadas } : lidas
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
  const lidas = lerCamadasParaAutoria(camadas)
  if (!lidas.legivel) return { estado: 'ilegivel', copy: null, blocos: [], lacunas: [] }
  const lida = tentarCopyEfetivaDasCamadas(atual, lidas.camadas as unknown as Layer[], { superficie: quem.superficie, ...(quem.em ? { em: quem.em } : {}) })
  if (lida.ok === false) {
    return { estado: lida.recusa instanceof HistoricoDaCopyCheio ? 'historico-cheio' : 'copy-invalida', copy: null, blocos: lida.recusa.mudancas.map((m) => m.id), lacunas: [], aviso: lida.aviso }
  }
  const { efetiva, mudancas, lacunas } = lida.leitura
  if (mudancas.length === 0) return { estado: 'sem-mudanca', copy: atual, blocos: [], lacunas }
  const ultima = efetiva.revisoes[efetiva.revisoes.length - 1]
  const revisada: CopyAutoral = {
    ...efetiva,
    revisoes: [...efetiva.revisoes.slice(0, -1), { ...ultima, autor: quem.autor, motivo: quem.motivo, superficie: quem.superficie }],
  }
  return { estado: 'registrada', copy: revisada, blocos: mudancas.map((m) => m.id), lacunas }
}
