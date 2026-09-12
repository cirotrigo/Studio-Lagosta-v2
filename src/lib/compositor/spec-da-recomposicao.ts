/**
 * A spec que a RECOMPOSIÇÃO entrega ao compositor.
 *
 * Puro de propósito: é a decisão que mais precisa ser conferida sozinha, e
 * `recompor.ts` importa o banco.
 *
 * R15 da revisão do Codex sobre o PR 9 (12/09/2026): quando a recomposição
 * adota o CONTRATO atual da página, ela trocava `copyAutoral` e rederivava
 * `blocos`, mas o espalhamento da spec antiga preservava `camadasExtras` — as
 * camadas extras com o texto de ANTES da edição. `validarSpec` (contrato
 * canônico, R05) comparava "Hoje" nos extras com "Amanhã" no contrato e
 * recusava a spec: a página mostrava o texto novo e o slide agendado ficava
 * com a arte antiga, em toda tentativa.
 *
 * A regra: com contrato, TUDO o que sai do contrato é tirado da spec antiga —
 * `copyAutoral`, `blocos` e `camadasExtras` — e rederivado dele. Os blocos
 * saem por `blocosParaOCompositor` (a única conversão sancionada) e os extras
 * são rederivados por `validarSpec`, que monta `camadasExtras` a partir dos
 * blocos livres do contrato, com id, herança, grupos e ordem. Sem contrato
 * (página legada) a spec segue com os extras que tinha — nada canônico para
 * rederivar.
 */
import { blocosParaOCompositor, type CopyAutoral } from '@/lib/copy-autoral'

import type { SpecDePeca } from './spec'

export function specDaRecomposicao(spec: SpecDePeca, contratoAtual: CopyAutoral | null): SpecDePeca {
  const { copyAutoral: _contratoVelho, ...semContrato } = spec
  if (!contratoAtual) return semContrato
  const { camadasExtras: _extrasVelhos, blocos: _blocosVelhos, ...semNadaDoContrato } = semContrato
  return {
    ...semNadaDoContrato,
    copyAutoral: contratoAtual,
    blocos: blocosParaOCompositor(contratoAtual).blocos as unknown as SpecDePeca['blocos'],
  }
}
