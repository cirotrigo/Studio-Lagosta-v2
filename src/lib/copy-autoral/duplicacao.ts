/**
 * DUPLICAR AS CAMADAS de uma página — a transformação de
 * `POST /api/templates/[id]/pages/[pageId]/duplicate`, fora da rota para ser
 * testada contra o leitor real (`copyEfetivaDasCamadas`).
 *
 * Os ids das camadas são regenerados (overrides por layerId — agendamento,
 * editor — assumem ids únicos por página) e o `parentId` acompanha a troca.
 * ANTES da troca, o vínculo de parte que só o id antigo dava (`servico`,
 * `servico-2` numa página legada) vira a marca `parte` (R22,
 * `marcarPartesLegadas`) — sem ela a releitura da cópia reunia só uma parte no
 * bloco autoral e a outra virava um segundo serviço comum.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { marcarPartesLegadas } from './efetiva'

export interface CamadasDuplicadas {
  camadas: unknown[]
  /** id da camada original → id da cópia (é o que `renomearExtrasDuplicados` recebe). */
  idsDeCamada: Map<string, string>
}

export function duplicarCamadasDaPagina(originais: unknown[], novoId: () => string): CamadasDuplicadas {
  const idsDeCamada = new Map<string, string>()
  for (const camada of originais as Array<Partial<Layer>>) {
    if (camada?.id != null && !idsDeCamada.has(String(camada.id))) idsDeCamada.set(String(camada.id), novoId())
  }
  const camadas = (marcarPartesLegadas(originais) as Array<Partial<Layer>>).map((camada) => ({
    ...camada,
    id: camada?.id != null ? idsDeCamada.get(String(camada.id)) : camada?.id,
    // parentId referencia outra layer da mesma página (agrupamento)
    parentId: camada?.parentId ? idsDeCamada.get(String(camada.parentId)) ?? camada.parentId : camada?.parentId,
  }))
  return { camadas, idsDeCamada }
}
