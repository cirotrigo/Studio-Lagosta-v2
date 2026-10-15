/**
 * APLICAR AJUSTES SEM PIORAR (CP4, 15/10/2026): o executor que mede cada ajuste
 * ANTES e DEPOIS, em memória, e só deixa passar o que não piora nenhuma
 * propriedade medida.
 *
 *   estadoAtual = as camadas da página
 *   medidaAtual = medir(estadoAtual)
 *   para cada ajuste, na ordem:
 *     1. aplicar o ajuste SOZINHO numa cópia (`aplicarAjustes`, puro);
 *     2. passar a cópia pelo autofix geométrico (o que seria gravado);
 *     3. medir a cópia (a MESMA medição do revisor: `medirCamadasDaPeca`);
 *     4. comparar com a medida atual, propriedade a propriedade (`compararNaoPiora`);
 *     5. aceito → a cópia vira o estado atual (e a medida também);
 *        recusado → descartada, dita (código, antes/depois, motivo);
 *   no fim: UM estado — quem chama grava uma vez.
 *
 * Nunca: escrever → medir → desfazer. Nunca pontuação global. O que não foi
 * medido não aprova. O ajuste que declara um achado mensurável tem de o
 * resolver ou melhorar.
 *
 * Parcialidade: 1 bom, 2 ruim, 3 bom → 1 e 3 aplicados (o 3 é medido sobre o
 * estado com o 1), 2 recusado; `resultadoDosAjustes = 'parcial'` em quem chama.
 */

import type { Layer } from '@/types/template'
import type { MeasureLayerHeight } from '@/lib/combo-stack-reflow'
import { CreativeError } from '@/lib/creatives/errors'
import { aplicarAutofixOuFalhar } from '@/lib/creatives/text-autofix'
import { aplicarAjustes, type AjusteAplicado, type AjusteRecusado, type ComparacaoDoAjuste, type ResultadoDosAjustes } from './aplicar-ajustes'
import type { Ajuste } from './contrato'
import { compararNaoPiora, motivoDaComparacao, type ComparacaoDeNaoPiora, type MedidaComparavel } from './nao-piora'
import { avaliarPeca } from './regras'
import { contextoDaMedicao, medirCamadasDaPeca, type ContextoDaMedicao } from './revisar-arte'

export interface ArgsDoAjusteSemPiorar {
  projectId: number
  page: { id: string; name: string; width: number; height: number; tags: string[]; background: string | null; layers: unknown }
  /** As camadas de partida (já com textos/foto desta chamada aplicados e refluídas). */
  camadas: Layer[]
  ajustes: Ajuste[]
  medir: MeasureLayerHeight
  /** Injeção para testes: a medição de um estado. */
  _medir?: (camadas: Layer[], ctx: ContextoDaMedicao) => Promise<MedidaComparavel>
}

export interface ResultadoSemPiorar extends ResultadoDosAjustes {
  /** A medida da peça como ENTROU e como SAIU (o estado final), para o diagnóstico. */
  medidas: { antes: ResumoDaMedida; depois: ResumoDaMedida }
}

export interface ResumoDaMedida {
  achados: number
  problemas: number
  naoAvaliadas: string[]
}

const compacta = (c: ComparacaoDeNaoPiora): ComparacaoDoAjuste => ({
  pioras: c.pioras,
  naoMedidas: c.naoMedidas,
  melhoras: c.melhoras,
  ...(c.achadoAlvo ? { achadoAlvo: c.achadoAlvo } : {}),
})

const resumo = (m: MedidaComparavel): ResumoDaMedida => ({
  achados: m.relatorio.achados.length,
  problemas: m.relatorio.achados.filter((a) => a.severidade === 'problema').length,
  naoAvaliadas: Object.entries(m.relatorio.cobertura)
    .filter(([, c]) => c?.estado === 'nao-avaliada')
    .map(([regra]) => regra),
})

async function medidaDe(camadas: Layer[], ctx: ContextoDaMedicao): Promise<MedidaComparavel> {
  const medida = await medirCamadasDaPeca(camadas, ctx)
  return { relatorio: avaliarPeca(medida), contraste: medida.contraste, camadas, canvas: ctx.canvas }
}

export async function aplicarAjustesSemPiorar(args: ArgsDoAjusteSemPiorar): Promise<ResultadoSemPiorar> {
  const canvas = { width: args.page.width, height: args.page.height }
  const ctx = await contextoDaMedicao({ projectId: args.projectId, page: args.page, camadas: args.camadas })
  const medir = args._medir ?? medidaDe
  let estado = args.camadas
  let medidaAtual = await medir(estado, ctx)
  const antes = resumo(medidaAtual)
  const aplicados: AjusteAplicado[] = []
  const recusados: AjusteRecusado[] = []
  const alteradas = new Set<string>()

  for (const [indice, ajuste] of args.ajustes.entries()) {
    const comAchado = typeof ajuste.achado === 'string' ? { achado: ajuste.achado } : {}
    // 1. O ajuste SOZINHO, numa cópia (o executor puro já recusa o estrutural: campo, camada, faixa).
    const um = aplicarAjustes(estado, [ajuste], { canvas, medir: args.medir })
    if (um.recusados.length > 0) {
      recusados.push({ ...um.recusados[0], indice })
      continue
    }
    // 2. O autofix geométrico sobre a cópia — é o que seria gravado. Texto que não cabe recusa SÓ este ajuste.
    let candidata = um.camadas
    try {
      const fix = await aplicarAutofixOuFalhar({ projectId: args.projectId, layers: candidata, canvas, changedLayerIds: um.alteradas })
      candidata = fix.layers as Layer[]
    } catch (erro) {
      if (erro instanceof CreativeError && erro.code === 'TEXTO_NAO_CABE') {
        recusados.push({ indice, tipo: String(ajuste.tipo), codigo: 'TEXTO_NAO_CABE', motivo: `o ajuste deixa texto que não cabe: ${erro.message}`, ...comAchado })
        continue
      }
      throw erro
    }
    // 3–4. Medir a cópia e comparar com o estado atual.
    const medidaDepois = await medir(candidata, ctx)
    const comparacao = compararNaoPiora(medidaAtual, medidaDepois, { achadoAlvo: ajuste.achado ?? null })
    if (comparacao.veredito !== 'aceito') {
      recusados.push({ indice, tipo: String(ajuste.tipo), codigo: comparacao.veredito, motivo: motivoDaComparacao(comparacao), ...comAchado, comparacao: compacta(comparacao) })
      continue
    }
    // 5. Aceito: a cópia vira o estado; o próximo ajuste é medido sobre ela.
    aplicados.push({ ...um.aplicados[0], indice, comparacao: compacta(comparacao) })
    for (const id of um.alteradas) alteradas.add(id)
    estado = candidata
    medidaAtual = medidaDepois
  }

  return { camadas: estado, aplicados, recusados, alteradas: [...alteradas], medidas: { antes, depois: resumo(medidaAtual) } }
}
