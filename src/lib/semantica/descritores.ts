/**
 * DESCOBERTA dos alvos de uma página: antes de editar semanticamente, um agente
 * precisa saber o que existe. Um descriptor por camada — identidade, papel,
 * slot e a expectativa de cardinalidade frente ao observado.
 *
 * `cardinalidadeEsperada` é INFORMATIVA: dois logos numa página dão
 * `ocorrenciasDoPapel: 2` e `ambiguous: true`, nunca erro. `ambiguous` diz só
 * que endereçar aquele papel sozinho vai falhar em `resolverAlvo`.
 *
 * Sem conteúdo da página (texto, URL): o trecho para o agente entra na camada
 * MCP, depois de o acesso à página estar autorizado (PR B).
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { lerSemanticRole, lerSlotId, type LeituraDoPapel, type LeituraDoSlot } from './ler'
import { cardinalidadeEsperada, type Cardinalidade, type CardinalidadeDoTemplate, type SemanticRole } from './papeis'

export interface DescritorDeAlvo {
  layerId: string
  indice: number
  type: string
  name: string
  visible: boolean
  papel: LeituraDoPapel
  slot: LeituraDoSlot
  cardinalidadeEsperada: Cardinalidade | null
  ocorrenciasDoPapel: number
  ambiguous: boolean
}

export function descreverAlvos(camadas: readonly Layer[], opcoes: { cardinalidadeEsperada?: CardinalidadeDoTemplate } = {}): DescritorDeAlvo[] {
  const papeis = camadas.map((c) => lerSemanticRole(c))
  const contagem = new Map<SemanticRole, number>()
  for (const p of papeis) if (p.status === 'valido') contagem.set(p.papel, (contagem.get(p.papel) ?? 0) + 1)

  return camadas.map((camada, indice) => {
    const papel = papeis[indice]
    const ocorrencias = papel.status === 'valido' ? (contagem.get(papel.papel) ?? 0) : 0
    return {
      layerId: camada.id,
      indice,
      type: camada.type,
      name: camada.name,
      visible: camada.visible !== false,
      papel,
      slot: lerSlotId(camada),
      cardinalidadeEsperada: papel.status === 'valido' ? cardinalidadeEsperada(papel.papel, opcoes.cardinalidadeEsperada) : null,
      ocorrenciasDoPapel: ocorrencias,
      ambiguous: ocorrencias > 1,
    }
  })
}
