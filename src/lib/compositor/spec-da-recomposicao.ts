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
import type { Layer } from '@/types/template'
import { blocosLidosDasCamadas, blocosParaOCompositor, type CopyAutoral } from '@/lib/copy-autoral'

import { validarSpec, type SpecDePeca } from './spec'

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

export type ContratoLidoParaRecompor = { contrato: CopyAutoral; motivo: null } | { contrato: null; motivo: string }

/**
 * O contrato com que a peça é COMPOSTA quando o histórico da copy está CHEIO
 * (PR10-04 e PR10-05, revisão FINAL do Codex sobre 1d18e983, 21/09/2026).
 *
 * `tentarAplicarRevisao` recusa a 201ª revisão ANTES de validar o conteúdo, e a
 * recomposição caía no caminho SEM contrato — que reconstrói a spec pela página
 * e perde exatamente o que só o contrato carrega: a divisão da segunda voz (a
 * regra legada punha "na brasa" na voz 2 de uma manchete que nasceu inteira na
 * voz 1), a ordem autoral das linhas de um bloco repartido, o vínculo de cada
 * camada com o seu bloco, a declaração do prefixo, e o grupo de leitura que
 * junta um bloco comum e um extra (a spec sem contrato não o representa e morre
 * em SPEC_INVALIDA). E não conferia o texto: a linha de 301 caracteres chegava
 * ao compositor e o slide ficava com a arte antiga.
 *
 * Aqui a peça é composta com o contrato COMO A PÁGINA O MOSTRA: os blocos lidos
 * das camadas pela MESMA leitura da copy efetiva (`blocosLidosDasCamadas`),
 * sobre o contrato gravado — só a revisão que registraria a mudança fica de
 * fora, porque ela não cabe. A composição sai idêntica à de um histórico livre.
 *
 * 🔴 Este contrato NUNCA é gravado como contrato da copy — nem na página, nem no
 * `copyAutoral` da arte: os blocos dele mudaram sem revisão, e contrato com
 * mudança sem autor é o que o histórico existe para impedir. (A spec gravada na
 * arte o leva, porque ela é o registro do que foi COMPOSTO.)
 *
 * Devolve `contrato: null`, com o motivo, quando a página não é representável
 * pelas decisões do contrato — nunca recompor com decisão inventada:
 *  - a leitura criou bloco que o contrato não tem (um texto que nenhum bloco
 *    originou; na página sem o vínculo declarado, o extra COM FUNÇÃO cai aqui e
 *    viraria serviço comum, sem a herança);
 *  - a spec reconstruída não passa em `validarSpec` (linha acima de 300
 *    caracteres, mais de 12 linhas…). Quem chama re-renderiza a peça com extra
 *    como a página está.
 * A atribuição pela ORDEM de leitura (`vincularExtras`, passo 4) não precisa de
 * guarda própria: ela só alcança bloco livre SEM herança, que `validarSpec`
 * recusa quando tem texto.
 */
export function contratoLidoParaRecompor(contrato: CopyAutoral, camadas: Layer[], spec: SpecDePeca): ContratoLidoParaRecompor {
  const lida = blocosLidosDasCamadas(contrato, camadas)
  const ids = new Set(contrato.blocos.map((b) => b.id))
  const inventados = lida.blocos.filter((b) => !ids.has(b.id)).map((b) => `"${b.id}"`)
  if (inventados.length > 0) return { contrato: null, motivo: `a página tem texto que nenhum bloco do contrato originou (${inventados.join(', ')})` }
  const lido: CopyAutoral = { ...contrato, blocos: lida.blocos }
  const v = validarSpec(specDaRecomposicao(spec, lido))
  return v.spec ? { contrato: lido, motivo: null } : { contrato: null, motivo: v.problemas.join('; ') }
}
