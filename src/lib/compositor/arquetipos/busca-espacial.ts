/**
 * O ORQUESTRADOR da busca espacial do arquétipo (CP2B, 14/10/2026). Puro: o compositor lê a foto em cada corte e
 * materializa cada combinação (geometria, independente do corte); aqui cada combinação é avaliada em cada corte
 * (`avaliarCombinacao`), as avaliações são ordenadas (`ordenarAvaliacoes`) e o diagnóstico compacto é montado — o
 * vencedor, até duas alternativas relevantes e o resumo das recusas. O contrato está em `busca-espacial-tipos.ts`.
 *
 * Sem solução: o compositor decide entre SEM_COMBINACAO e PREFERENCIA_INVIAVEL com `motivoDaFalta` — só depois de
 * esgotar cortes × posições × tratamentos permitidos.
 */
import { createHash } from 'node:crypto'

import type { Rect } from '@/lib/creatives/halo/halo'
import { CreativeError } from '@/lib/creatives/errors'
import type { CropPosition } from '@/lib/image-crop-utils'
import { bordaDoGrupo, type Borda } from '../gradiente-de-leitura'
import type { Ancora } from '../spec'
import { combinacoesDasFaixas, type PartidaNoArquetipo } from './candidatos-espaciais'
import { jsonCanonico } from './impressao'
import type { GeometriaEfetiva, Materializacao, ProblemaDeMaterializacao } from './materializar'
import { camadasNaReferencia, grupoDaUnidade, materializarUnidades, type UnidadeDoArquetipo } from './no-compositor'
import { avaliarCombinacao, motivoDaVitoria, ordenarAvaliacoes, resumirAvaliacao } from './pontuacao-espacial'
import { chaveDoArquetipo, type ArquetipoDeLayout, type FormatoDoArquetipo } from './tipos'
import {
  LIMITES_DA_BUSCA,
  MODO_BUSCA_ESPACIAL,
  ROTULOS_DO_DESLOCAMENTO,
  type AvaliacaoDaCombinacao,
  type Combinacao,
  type CombinacaoMaterializada,
  type DiagnosticoDaBuscaEspacial,
  type Eliminacao,
  type EscolhaEspacial,
  type FaixaDeBusca,
  type LeituraDoCorte,
  type MotivoDeEliminacao,
  type PlanejamentoDoTratamento,
  type UnidadeDaCombinacao,
} from './busca-espacial-tipos'

type MaterializacaoOk = Extract<Materializacao, { ok: true }>

/**
 * A borda do tratamento de uma unidade, pela posição de REFERÊNCIA: a mesma conta do T1a (o centro da pilha decide a
 * âncora; no meio, o lado de H/2) — mas fixada na referência, para o `dy` da busca não virar a borda (no centro-óptico
 * a zona da manchete atravessa H/2: virar a borda saltaria o plano do CP2A). Com `dy = 0` é a borda do T1a.
 */
export function bordaNaReferencia(rectNaReferencia: Rect, H: number): Borda {
  const centro = (rectNaReferencia.y + rectNaReferencia.height / 2) / H
  const ancora: Ancora = centro > 0.55 ? 'rodape' : centro < 0.45 ? 'topo' : 'meio'
  return bordaDoGrupo(rectNaReferencia, ancora, H)
}

/** O problema da materialização deslocada como eliminação da busca. */
function eliminacaoDoProblema(p: ProblemaDeMaterializacao): Eliminacao {
  const motivo: MotivoDeEliminacao =
    p.codigo === 'ARQUETIPO_ZONA_EFETIVA_VAZIA'
      ? 'FORA_DA_AREA_SEGURA'
      : p.codigo === 'ARQUETIPO_FORA_DA_ZONA'
        ? /ornamento/.test(p.motivo)
          ? 'ORNAMENTO_FORA_DA_ZONA'
          : 'FORA_DA_ZONA'
        : 'LIMITE_GEOMETRICO'
  return { motivo, detalhe: `${p.papel}: ${p.motivo}`, papel: p.papel }
}

/** As unidades como o compositor as desenharia nesta materialização: as camadas, a caixa e a borda de cada papel. */
export function unidadesDaCombinacao(args: {
  unidades: UnidadeDoArquetipo[]
  materializacao: MaterializacaoOk
  arquetipo: ArquetipoDeLayout
  deslocamentos: Combinacao['deslocamentos']
  faixas: FaixaDeBusca[]
  H: number
}): UnidadeDaCombinacao[] {
  const ordem = new Map(args.arquetipo.papeis.map((p) => [p.papel, p.ordemDeLeitura]))
  return camadasNaReferencia(args.unidades, args.materializacao.papeis, args.arquetipo.preferencias.alinha).map(({ unidade: u, rect, camadas }) => {
    const dy = args.deslocamentos[u.papel] ?? 0
    const o = u.ornamentos
    const rectNaReferencia = { ...rect, y: rect.y - dy }
    return {
      papel: u.papel,
      ordemDeLeitura: ordem.get(u.papel) ?? 99,
      faixa: args.faixas.find((f) => f.membros.includes(u.papel))?.indice ?? -1,
      rect,
      rectComOrnamentos: { x: rect.x - o.esquerda, y: rect.y - o.topo, width: rect.width + o.esquerda + o.direita, height: rect.height + o.topo + o.base },
      rectNaReferencia,
      borda: bordaNaReferencia(rectNaReferencia, args.H),
      // O compositor tira a caixa de fundo (o halo) dos textos antes de desenhar: nenhum texto lê contra caixa própria.
      textos: camadas.map((c) => ({ camada: c.id, grupo: grupoDaUnidade(u.papel), cor: String(c.style?.color ?? '#FFFFFF'), rect: { x: c.position.x, y: c.position.y, width: c.size.width, height: c.size.height }, caixaDeFundo: false })),
    }
  })
}

export interface ResultadoDaBusca {
  /** Todas as avaliações, a vencedora primeiro (ver `ordenarAvaliacoes`). */
  ordenadas: AvaliacaoDaCombinacao[]
  vencedora: AvaliacaoDaCombinacao | null
  avaliadas: number
}

/** Cada combinação em cada corte. A eliminada pela geometria vale para todos os cortes (é a mesma caixa). */
export function buscarNaFoto(args: {
  materializadas: CombinacaoMaterializada[]
  cortes: LeituraDoCorte[]
  faixas: FaixaDeBusca[]
  energiaDeReferencia: number
  planejamento: PlanejamentoDoTratamento
  canvas: { width: number; height: number }
}): ResultadoDaBusca {
  if (args.cortes.length > LIMITES_DA_BUSCA.cortes) throw new Error(`busca espacial: ${args.cortes.length} cortes passam do limite (${LIMITES_DA_BUSCA.cortes})`)
  const total = args.cortes.length * args.materializadas.length
  if (total > LIMITES_DA_BUSCA.avaliacoes) throw new Error(`busca espacial: ${total} avaliações passam do limite (${LIMITES_DA_BUSCA.avaliacoes})`)
  const avaliacoes: AvaliacaoDaCombinacao[] = []
  for (const corte of args.cortes) {
    for (const m of args.materializadas) {
      avaliacoes.push(
        m.eliminada
          ? { crop: corte.crop, combinacao: m.combinacao, eliminada: m.eliminada }
          : avaliarCombinacao({ corte, energiaDeReferencia: args.energiaDeReferencia, materializada: m, faixas: args.faixas, planejamento: args.planejamento, canvas: args.canvas }),
      )
    }
  }
  const ordenadas = ordenarAvaliacoes(avaliacoes)
  const vencedora = ordenadas[0] && ordenadas[0].eliminada.length === 0 ? ordenadas[0] : null
  return { ordenadas, vencedora, avaliadas: avaliacoes.length }
}

/** A identidade de uma foto na escolha: a impressão da URL que a peça desenha (curta; nunca a URL, que pode ser `data:`). */
export function chaveDaFoto(url: string | null | undefined): string | null {
  return url ? `foto-${createHash('sha1').update(url).digest('hex').slice(0, 16)}` : null
}

/** A impressão de uma escolha (foto, corte, deslocamentos): a mesma escolha tem o mesmo id — e a reproduzida também. */
export function idDaEscolha(escolha: EscolhaEspacial): string {
  const { modo, foto, corte, deslocamentos } = escolha
  return `be1-${createHash('sha1').update(jsonCanonico({ modo, foto, corte, deslocamentos })).digest('hex').slice(0, 12)}`
}

/** Quantas avaliações caíram em cada motivo (uma avaliação conta uma vez por motivo distinto). */
export function contarRecusas(avaliacoes: AvaliacaoDaCombinacao[]): Partial<Record<MotivoDeEliminacao, number>> {
  const contagem: Partial<Record<MotivoDeEliminacao, number>> = {}
  for (const a of avaliacoes) for (const motivo of new Set(a.eliminada.map((e) => e.motivo))) contagem[motivo] = (contagem[motivo] ?? 0) + 1
  return contagem
}

/**
 * Sem nenhuma combinação válida: o motivo estruturado da falta. Quando todas caem no MESMO motivo do tratamento do
 * CP2A (ex.: polaridade incompatível na mesma borda), é ele — o detalhe que o CP0 espera em SEM_COMBINACAO; senão, o
 * motivo de eliminação mais frequente.
 */
export function motivoDaFalta(avaliacoes: AvaliacaoDaCombinacao[]): string | null {
  if (avaliacoes.length === 0) return null
  const doTratamento = new Set(avaliacoes.map((a) => a.eliminada.find((e) => e.motivoDoTratamento)?.motivoDoTratamento ?? null))
  if (doTratamento.size === 1 && [...doTratamento][0]) return [...doTratamento][0]!
  const contagem = Object.entries(contarRecusas(avaliacoes)).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  return contagem[0]?.[0] ?? null
}

/** Até 6 exemplos de recusa: um por motivo primeiro, na ordem em que aparecem. */
function exemplosDeRecusa(avaliacoes: AvaliacaoDaCombinacao[]): DiagnosticoDaBuscaEspacial['exemplosDeRecusa'] {
  const eliminadas = avaliacoes.filter((a) => a.eliminada.length > 0)
  const vistos = new Set<string>()
  const primeiros = eliminadas.filter((a) => {
    const m = a.eliminada[0].motivo
    if (vistos.has(m)) return false
    vistos.add(m)
    return true
  })
  const resto = eliminadas.filter((a) => !primeiros.includes(a))
  return [...primeiros, ...resto].slice(0, 6).map((a) => ({ crop: a.crop, escolhas: a.combinacao.escolhas, eliminada: a.eliminada }))
}

/**
 * As alternativas RELEVANTES (até 2): a referência no corte central, quando ela não venceu (é o que mostra por que a
 * peça saiu dela — válida ou eliminada), e a melhor válida depois da vencedora.
 */
function alternativas(ordenadas: AvaliacaoDaCombinacao[], vencedora: AvaliacaoDaCombinacao | null): AvaliacaoDaCombinacao[] {
  const saida: AvaliacaoDaCombinacao[] = []
  const referencia =
    ordenadas.find((a) => a.combinacao.indice === 0 && a.crop === 'center-middle') ?? ordenadas.find((a) => a.combinacao.indice === 0)
  if (referencia && referencia !== vencedora) saida.push(referencia)
  const segunda = ordenadas.find((a) => a !== vencedora && a !== referencia && a.eliminada.length === 0)
  if (segunda) saida.push(segunda)
  return saida.slice(0, 2)
}

const num = (v: number) => v.toFixed(2).replace('.', ',')

/**
 * Por que a peça SAIU da referência (no corte central), quando saiu: eliminada (e por quê), mais tratamento, ou
 * perdendo na pontuação. `null` quando a vencedora é a própria referência.
 */
export function motivoContraAReferencia(ordenadas: AvaliacaoDaCombinacao[], vencedora: AvaliacaoDaCombinacao): string | null {
  const referencia = ordenadas.find((a) => a.combinacao.indice === 0 && a.crop === 'center-middle') ?? ordenadas.find((a) => a.combinacao.indice === 0)
  if (!referencia || referencia === vencedora) return null
  const onde = referencia.crop === vencedora.crop ? 'a referência' : `a referência no corte ${referencia.crop}`
  if (referencia.eliminada.length > 0) return `${onde} caía em ${[...new Set(referencia.eliminada.map((e) => e.motivo))].join(', ')}`
  const r = referencia.componentes!
  const v = vencedora.componentes!
  if (r.custoDoTratamento > v.custoDoTratamento + 0.05) {
    const veus = (referencia.tratamento ?? []).filter((t) => t.estado === 'tratado').map((t) => `${t.borda} ${num(t.forca ?? 0)}`)
    return `${onde} precisava de véu (${veus.join(', ')})${v.custoDoTratamento === 0 ? '; aqui lê sem tratamento' : ''}`
  }
  return `${onde} perdia na pontuação (${num(referencia.pontuacao ?? 0)} contra ${num(vencedora.pontuacao ?? 0)})`
}

/** O diagnóstico compacto da busca (vai em `fieldValues.composicao.arquetipo.buscaEspacial`). */
export function diagnosticoDaBusca(args: {
  escolha: EscolhaEspacial
  resultado: ResultadoDaBusca
  faixas: FaixaDeBusca[]
  cortesAvaliados: LeituraDoCorte['crop'][]
  reproduzida?: { de: string }
}): DiagnosticoDaBuscaEspacial {
  const { ordenadas, vencedora } = args.resultado
  const alts = alternativas(ordenadas, vencedora)
  const segunda = ordenadas.find((a) => a !== vencedora && a.eliminada.length === 0)
  return {
    versao: MODO_BUSCA_ESPACIAL,
    id: idDaEscolha(args.escolha),
    escolha: args.escolha,
    ...(args.reproduzida ? { reproduzida: args.reproduzida } : {}),
    cortesAvaliados: args.cortesAvaliados,
    combinacoesAvaliadas: args.resultado.avaliadas,
    limite: LIMITES_DA_BUSCA.avaliacoes,
    faixas: args.faixas.map((f) => ({ membros: f.membros, intervalo: f.intervalo, candidatos: f.candidatos })),
    vencedor: vencedora ? resumirAvaliacao(vencedora) : null,
    alternativas: alts.map(resumirAvaliacao),
    recusas: contarRecusas(ordenadas),
    exemplosDeRecusa: exemplosDeRecusa(ordenadas),
    motivo: args.reproduzida
      ? 'posição reproduzida da escolha gravada (recomposição): a busca não roda de novo'
      : vencedora
        ? ((contra) => (contra ? `${contra}; ${motivoDaVitoria(vencedora, segunda).replace(/^a foto não distingue: /, 'entre as equivalentes, ')}` : motivoDaVitoria(vencedora, segunda)))(
            motivoContraAReferencia(ordenadas, vencedora),
          )
        : 'nenhuma combinação válida',
  }
}

// ─── A seleção no compositor ─────────────────────────────────────────────────

export interface ArgsDaSelecao {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  canvas: { width: number; height: number }
  geometria: GeometriaEfetiva
  unidades: UnidadeDoArquetipo[]
  logo: { razao: number } | null
  /** O portão estrutural já passado (`partidaNoArquetipo`): as faixas, os candidatos e a posição de partida. */
  partida: Extract<PartidaNoArquetipo, { ok: true }>
  /** A foto em cada corte candidato (vazio sem foto). */
  cortes: LeituraDoCorte[]
  planejamento: PlanejamentoDoTratamento
  /** A foto da peça: a URL que ela desenha (ver `EscolhaEspacial.foto`). */
  foto: string | null
  /** A escolha gravada a REPRODUZIR (recomposição) — a busca não roda. */
  reproduzir?: EscolhaEspacial | null
}

export type SelecaoNoArquetipo =
  | { ok: true; materializacao: MaterializacaoOk; crop: CropPosition; escolha: EscolhaEspacial; diagnostico: DiagnosticoDaBuscaEspacial; avisos: string[] }
  | { ok: false; resultado: ResultadoDaBusca; faixas: FaixaDeBusca[]; motivo: string | null }

const materializarCom = (args: ArgsDaSelecao, deslocamentos: Combinacao['deslocamentos']): Materializacao =>
  materializarUnidades({ arquetipo: args.arquetipo, formato: args.formato, canvas: args.canvas, geometria: args.geometria, unidades: args.unidades, logo: args.logo, deslocamentos })

/** A combinação que reproduz deslocamentos dados (a escolha gravada, ou a referência). */
function combinacaoDosDeslocamentos(faixas: FaixaDeBusca[], deslocamentos: Combinacao['deslocamentos']): Combinacao {
  return {
    indice: 0,
    escolhas: faixas.map((f) => {
      const dy = deslocamentos[f.membros[0]] ?? 0
      const rotulo = f.candidatos.find((c) => c.dy === dy)?.rotulo ?? (dy === 0 ? ROTULOS_DO_DESLOCAMENTO[0] : dy < 0 ? 'acima' : 'abaixo')
      return { faixa: f.indice, rotulo, dy }
    }),
    deslocamentos,
  }
}

/**
 * A POSIÇÃO do arquétipo pela foto (CP2B): a busca pequena (faixas × candidatos × cortes) — ou, na recomposição, a
 * escolha gravada reproduzida sem buscar (a copy nova que não cabe nela é RECUSADA, nunca movida). Sem foto, a
 * referência no corte central. Sem nenhuma combinação válida, `ok: false` — quem chama decide entre
 * SEM_COMBINACAO e PREFERENCIA_INVIAVEL.
 */
export function selecionarNoArquetipo(args: ArgsDaSelecao): SelecaoNoArquetipo {
  const faixas = args.partida.faixas
  const H = args.canvas.height

  // Reprodução (ou sem foto): uma combinação só, avaliada para o diagnóstico — a foto não elimina, só avisa.
  // Cópia: o compositor completa o canto da logo automática na escolha que grava.
  const fixa: EscolhaEspacial | null = args.reproduzir
    ? { ...args.reproduzir, deslocamentos: { ...args.reproduzir.deslocamentos } }
    : args.cortes.length === 0
      ? { modo: MODO_BUSCA_ESPACIAL, foto: args.foto, corte: 'center-middle', deslocamentos: { ...args.partida.deslocamentos } }
      : null
  if (fixa) {
    const combinacao = combinacaoDosDeslocamentos(faixas, fixa.deslocamentos)
    const m = materializarCom(args, fixa.deslocamentos)
    if ('problemas' in m) {
      throw new CreativeError(
        'ARQUETIPO_POSICAO_CONGELADA_NAO_CABE',
        `${chaveDoArquetipo(args.arquetipo)}: a posição desta peça foi escolhida pela foto e está congelada (corte ${fixa.corte}); na posição congelada, ${m.problemas.map((p) => `${p.papel} — ${p.motivo}`).join('; ')}. Nada foi movido: encurte o texto ou peça uma nova composição da peça.`,
        422,
        { arquetipo: chaveDoArquetipo(args.arquetipo), formato: args.formato, escolha: fixa, problemas: m.problemas },
      )
    }
    const corte = args.cortes.find((c) => c.crop === fixa.corte)
    const unidades = unidadesDaCombinacao({ unidades: args.unidades, materializacao: m, arquetipo: args.arquetipo, deslocamentos: fixa.deslocamentos, faixas, H })
    const avaliacao: AvaliacaoDaCombinacao = corte
      ? avaliarCombinacao({ corte, energiaDeReferencia: Math.max(1, corte.mapa.energiaMaxima), materializada: { combinacao, unidades }, faixas, planejamento: args.planejamento, canvas: args.canvas })
      : { crop: fixa.corte, combinacao, eliminada: [] }
    const resultado: ResultadoDaBusca = { ordenadas: [avaliacao], vencedora: avaliacao, avaliadas: corte ? 1 : 0 }
    const avisos =
      args.reproduzir && avaliacao.eliminada.length > 0
        ? [`A posição congelada da peça (escolhida pela foto) agora cai em: ${[...new Set(avaliacao.eliminada.map((e) => e.motivo))].join(', ')} — mantida assim (a recomposição não move a peça).`]
        : []
    const diagnostico = diagnosticoDaBusca({ escolha: fixa, resultado, faixas, cortesAvaliados: corte ? [corte.crop] : [], ...(args.reproduzir ? { reproduzida: { de: idDaEscolha(fixa) } } : {}) })
    if (!args.reproduzir) diagnostico.motivo = 'sem foto para ler: ficou a posição de partida (a referência, ou o resgate mais perto dela) no corte central'
    return { ok: true, materializacao: m, crop: fixa.corte, escolha: fixa, diagnostico, avisos }
  }

  const combinacoes = combinacoesDasFaixas(faixas)
  const porIndice = new Map<number, MaterializacaoOk>()
  const materializadas: CombinacaoMaterializada[] = combinacoes.map((combinacao) => {
    const m = materializarCom(args, combinacao.deslocamentos)
    if ('problemas' in m) return { combinacao, eliminada: m.problemas.map(eliminacaoDoProblema) }
    porIndice.set(combinacao.indice, m)
    return { combinacao, unidades: unidadesDaCombinacao({ unidades: args.unidades, materializacao: m, arquetipo: args.arquetipo, deslocamentos: combinacao.deslocamentos, faixas, H }) }
  })
  const energiaDeReferencia = Math.max(1, ...args.cortes.map((c) => c.mapa.energiaMaxima))
  const resultado = buscarNaFoto({ materializadas, cortes: args.cortes, faixas, energiaDeReferencia, planejamento: args.planejamento, canvas: args.canvas })
  if (!resultado.vencedora) return { ok: false, resultado, faixas, motivo: motivoDaFalta(resultado.ordenadas) }
  const v = resultado.vencedora
  const escolha: EscolhaEspacial = { modo: MODO_BUSCA_ESPACIAL, foto: args.foto, corte: v.crop, deslocamentos: v.combinacao.deslocamentos }
  const diagnostico = diagnosticoDaBusca({ escolha, resultado, faixas, cortesAvaliados: args.cortes.map((c) => c.crop) })
  return { ok: true, materializacao: porIndice.get(v.combinacao.indice)!, crop: v.crop, escolha, diagnostico, avisos: [] }
}
