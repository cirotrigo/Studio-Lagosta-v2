/**
 * DUPLICAR AS CAMADAS de uma página — a transformação de
 * `POST /api/templates/[id]/pages/[pageId]/duplicate`, fora da rota para ser
 * testada contra o leitor real (`copyEfetivaDasCamadas`).
 *
 * Os ids das camadas são regenerados (overrides por layerId — agendamento,
 * editor — assumem ids únicos por página) e o `parentId` acompanha a troca.
 * ANTES da troca, todo vínculo que a leitura só reconhecia pelo id físico vira
 * marca na camada (`materializarVinculosDoIdFisico`: papel, parte legada e o
 * bloco cujo id é o id da camada — R22, R24), e o contrato acompanha os ids
 * inferidos `extra-<camada>` (`renomearExtrasDuplicados`). Sem contrato, a
 * página duplica como sempre duplicou.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import type { CopyAutoral } from './contrato'
import { materializarVinculosDoIdFisico, renomearExtrasDuplicados } from './efetiva'

export interface CamadasDuplicadas {
  camadas: unknown[]
  /** id da camada original → id da cópia. */
  idsDeCamada: Map<string, string>
  /** O contrato da cópia (ids inferidos renomeados); `null` quando a página não tinha contrato legível. */
  contrato: CopyAutoral | null
}

export function duplicarCamadasDaPagina(originais: unknown[], novoId: () => string, contrato: CopyAutoral | null): CamadasDuplicadas {
  const idsDeCamada = new Map<string, string>()
  for (const camada of originais as Array<Partial<Layer>>) {
    if (camada?.id != null && !idsDeCamada.has(String(camada.id))) idsDeCamada.set(String(camada.id), novoId())
  }
  const marcadas = contrato ? materializarVinculosDoIdFisico(originais, contrato) : originais
  const camadas = (marcadas as Array<Partial<Layer>>).map((camada) => ({
    ...camada,
    id: camada?.id != null ? idsDeCamada.get(String(camada.id)) : camada?.id,
    // parentId referencia outra layer da mesma página (agrupamento)
    parentId: camada?.parentId ? idsDeCamada.get(String(camada.parentId)) ?? camada.parentId : camada?.parentId,
  }))
  return { camadas, idsDeCamada, contrato: contrato ? renomearExtrasDuplicados(contrato, idsDeCamada, originais as Layer[]) : null }
}
