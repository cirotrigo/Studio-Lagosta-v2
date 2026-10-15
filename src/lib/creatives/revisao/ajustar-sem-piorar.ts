/**
 * APLICAR AJUSTES SEM PIORAR (CP4, 15/10/2026): o executor que mede cada ajuste
 * ANTES e DEPOIS, em memória, e só deixa passar o que não piora nenhuma
 * propriedade medida.
 *
 *   estadoAtual = as camadas da página (já com os textos/foto desta chamada e o autofix deles)
 *   medidaInicial = medidaAtual = medir(estadoAtual)
 *   para cada ajuste, na ordem:
 *     1. aplicar o ajuste SOZINHO numa cópia (`aplicarAjustes`, puro);
 *     2. passar a cópia pelo autofix geométrico (o que seria gravado) — o que ele mexeu é DITO no aplicado;
 *     3. medir a cópia (a MESMA medição do revisor, `medirCamadasDaPeca`, SEM a correção hipotética da régua);
 *     4. comparar com a medida atual E com a medida inicial, propriedade a propriedade (`compararNaoPiora`);
 *     5. aceito → a cópia vira o estado atual (e a medida também);
 *        recusado → descartada, dita (código, antes/depois, motivo);
 *   no fim: UM estado — quem chama grava uma vez.
 *
 * Nunca: escrever → medir → desfazer. Nunca pontuação global. O que não foi
 * medido não aprova. O ajuste que declara um achado mensurável tem de o
 * resolver ou melhorar. A comparação com a medida INICIAL fecha a catraca das
 * tolerâncias: N passos de 1 px "dentro do ruído" não somam 30 px (revisores A e C).
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
import { AJUSTE_PIOROU_ARTE, compararNaoPiora, motivoDaComparacao, type ComparacaoDeNaoPiora, type MedidaComparavel } from './nao-piora'
import { avaliarPeca } from './regras'
import { contextoDaMedicao, medirCamadasDaPeca, type ContextoDaMedicao } from './revisar-arte'

export interface ArgsDoAjusteSemPiorar {
  projectId: number
  page: { id: string; name: string; width: number; height: number; tags: string[]; background: string | null; layers: unknown }
  /** As camadas de partida (já com textos/foto desta chamada aplicados, refluídas e com o autofix delas). */
  camadas: Layer[]
  ajustes: Ajuste[]
  medir: MeasureLayerHeight
  /** O conteúdo dos textos como a página os tinha ANTES desta chamada (id → content): ver `aplicarAjustes`. */
  conteudoAnterior?: ReadonlyMap<string, string>
  /** Injeção para testes: a medição de um estado. */
  _medir?: (camadas: Layer[], ctx: ContextoDaMedicao) => Promise<MedidaComparavel>
}

export type ResultadoSemPiorar = ResultadoDosAjustes

const compacta = (c: ComparacaoDeNaoPiora, contraEntrada?: ComparacaoDeNaoPiora): ComparacaoDoAjuste => ({
  pioras: c.pioras,
  naoMedidas: c.naoMedidas,
  melhoras: c.melhoras,
  ...(c.achadoAlvo ? { achadoAlvo: c.achadoAlvo } : {}),
  ...(c.naoAplicaveis.length > 0 ? { naoAplicaveis: c.naoAplicaveis.map((n) => ({ propriedade: n.propriedade, motivo: n.motivo })) } : {}),
  ...(contraEntrada && contraEntrada.pioras.length > 0 ? { contraEntrada: { pioras: contraEntrada.pioras } } : {}),
})

/** A medida comparável de um estado: relatório, régua SEM correção, camadas e o que a geometria não mediu. */
export async function medidaDe(camadas: Layer[], ctx: ContextoDaMedicao): Promise<MedidaComparavel> {
  const medida = await medirCamadasDaPeca(camadas, ctx, { corrigir: false })
  const semMetrica = [
    ...medida.fontesAusentes.flatMap((f) => f.camadas),
    ...(medida.textosSemMetrica ?? []),
    ...medida.medidasAproximadas,
    // A logo que não foi medida (não carregou, fora do contrato, sem pixels): mexer nela é "não medido".
    ...(medida.leituraDaLogo ?? []).filter((l) => l.estado !== 'medida').map((l) => l.camada),
  ]
  return { relatorio: avaliarPeca(medida), contraste: medida.contraste, camadas, canvas: ctx.canvas, semMetrica }
}

/** Os ids das camadas que diferem entre dois estados (acrescentadas, removidas ou mudadas em qualquer campo). */
export function camadasQueMudaram(antes: Layer[], depois: Layer[]): string[] {
  const porId = new Map(antes.map((l) => [l.id, JSON.stringify(l)]))
  const mudaram = new Set<string>()
  for (const l of depois) {
    if (porId.get(l.id) !== JSON.stringify(l)) mudaram.add(l.id)
    porId.delete(l.id)
  }
  for (const id of porId.keys()) mudaram.add(id)
  return [...mudaram]
}

export async function aplicarAjustesSemPiorar(args: ArgsDoAjusteSemPiorar): Promise<ResultadoSemPiorar> {
  const canvas = { width: args.page.width, height: args.page.height }
  const medir = args._medir ?? medidaDe
  let estado = args.camadas
  const aplicados: AjusteAplicado[] = []
  const recusados: AjusteRecusado[] = []
  const alteradas = new Set<string>()

  // 0. A pré-checagem ESTRUTURAL de todo o lote (campo, camada, faixa) é pura e barata: o que cai aqui não custa uma
  //    medida — e um lote só de recusas estruturais não mede nada (revisor A).
  const estruturais = new Map<number, AjusteRecusado>()
  for (const [indice, ajuste] of args.ajustes.entries()) {
    const um = aplicarAjustes(estado, [ajuste], { canvas, medir: args.medir, indiceBase: indice, conteudoAnterior: args.conteudoAnterior })
    if (um.recusados.length > 0) estruturais.set(indice, um.recusados[0])
  }
  if (estruturais.size === args.ajustes.length) return { camadas: estado, aplicados, recusados: [...estruturais.values()], alteradas: [] }

  const ctx = await contextoDaMedicao({ projectId: args.projectId, page: args.page, camadas: args.camadas })
  const medidaInicial = await medir(estado, ctx)
  let medidaAtual = medidaInicial

  for (const [indice, ajuste] of args.ajustes.entries()) {
    const comAchado = typeof ajuste.achado === 'string' ? { achado: ajuste.achado } : {}
    const estrutural = estruturais.get(indice)
    if (estrutural) {
      recusados.push(estrutural)
      continue
    }
    // 1. O ajuste SOZINHO, numa CÓPIA do estado (nenhuma camada compartilhada por referência — o contrato do owner;
    //    o puro pode recusar aqui o que só é inválido agora).
    const um = aplicarAjustes(structuredClone(estado), [ajuste], { canvas, medir: args.medir, indiceBase: indice, conteudoAnterior: args.conteudoAnterior })
    if (um.recusados.length > 0) {
      recusados.push(um.recusados[0])
      continue
    }
    // 2. O autofix geométrico sobre a cópia — é o que seria gravado. Texto que não cabe recusa SÓ este ajuste; o que o
    //    autofix mexeu (fonte, entrelinha, caixa) vai DITO no aplicado.
    let candidata = um.camadas
    let autocorrecao: AjusteAplicado['autocorrecao']
    try {
      const fix = await aplicarAutofixOuFalhar({ projectId: args.projectId, layers: candidata, canvas, changedLayerIds: um.alteradas })
      candidata = fix.layers as Layer[]
      if (fix.autocorrecao.aplicada) autocorrecao = fix.autocorrecao.ajustes.map((a) => ({ layerId: a.layerId, propriedade: a.propriedade, de: a.de, para: a.para, motivo: a.motivo }))
    } catch (erro) {
      if (erro instanceof CreativeError && erro.code === 'TEXTO_NAO_CABE') {
        recusados.push({ indice, tipo: String(ajuste.tipo), codigo: 'TEXTO_NAO_CABE', motivo: `o ajuste deixa texto que não cabe: ${erro.message}`, ...comAchado })
        continue
      }
      throw erro
    }
    // 3–4. Medir a cópia e comparar com o estado atual E com o de entrada (a catraca). As camadas TOCADAS vêm da
    //    diferença real entre o estado e a candidata (ajuste + autofix + reflow), não do que o ajuste declarou:
    //    `mover`/`visibilidade` não entram em `alteradas` do puro, e a camada sem métrica tocada é "não medida" (Codex R1).
    const medidaDepois = await medir(candidata, ctx)
    const tocadas = camadasQueMudaram(estado, candidata)
    const opcoes = { achadoAlvo: ajuste.achado ?? null, alteradas: tocadas, permiteOcultar: ajuste.tipo === 'visibilidade' }
    const comparacao = compararNaoPiora(medidaAtual, medidaDepois, opcoes)
    if (comparacao.veredito !== 'aceito') {
      recusados.push({ indice, tipo: String(ajuste.tipo), codigo: comparacao.veredito, motivo: motivoDaComparacao(comparacao), ...comAchado, comparacao: compacta(comparacao) })
      continue
    }
    const contraEntrada = aplicados.length > 0 ? compararNaoPiora(medidaInicial, medidaDepois, { alteradas: tocadas, permiteOcultar: opcoes.permiteOcultar }) : null
    if (contraEntrada && contraEntrada.pioras.length > 0) {
      recusados.push({
        indice,
        tipo: String(ajuste.tipo),
        codigo: AJUSTE_PIOROU_ARTE,
        motivo: `somado aos ajustes anteriores, o ajuste deixa a peça pior do que ENTROU: ${contraEntrada.pioras.map((p) => `${p.propriedade} em ${p.camadas.join(', ')} (${p.motivo})`).join('; ')}`,
        ...comAchado,
        comparacao: compacta(comparacao, contraEntrada),
      })
      continue
    }
    // 5. Aceito: a cópia vira o estado; o próximo ajuste é medido sobre ela.
    aplicados.push({ ...um.aplicados[0], comparacao: compacta(comparacao, contraEntrada ?? undefined), ...(autocorrecao ? { autocorrecao } : {}) })
    for (const id of um.alteradas) alteradas.add(id)
    estado = candidata
    medidaAtual = medidaDepois
  }

  return { camadas: estado, aplicados, recusados, alteradas: [...alteradas] }
}
