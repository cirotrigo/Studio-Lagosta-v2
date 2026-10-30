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
import { combinacoesDasFaixas, limiteDaBusca, type PartidaNoArquetipo } from './candidatos-espaciais'
import { jsonCanonico } from './impressao'
import { alinhaDoPapel, type GeometriaEfetiva, type MargemDaPeca, type Materializacao, type ProblemaDeMaterializacao } from './materializar'
import { camadasNaReferencia, grupoDaUnidade, materializarUnidades, type UnidadeDoArquetipo } from './no-compositor'
import type { ReceitaDoAcento } from './acentos'
import { avaliarCombinacao, descreverTratamento, invadeAEstimada, motivoDaVitoria, ordenarAvaliacoes, resumirAvaliacao } from './pontuacao-espacial'
import { chaveDoArquetipo, type ArquetipoDeLayout, type FormatoDoArquetipo } from './tipos'
import {
  LIMITES_DA_BUSCA,
  MODO_BUSCA_ESPACIAL,
  MOTIVOS_DE_ELIMINACAO,
  ROTULOS_DO_DESLOCAMENTO,
  TOLERANCIA_DA_COBERTURA,
  TOLERANCIA_DO_CUSTO,
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
  type ResumoDaBuscaOriginal,
  type UnidadeDaCombinacao,
} from './busca-espacial-tipos'

type MaterializacaoOk = Extract<Materializacao, { ok: true }>

/**
 * A borda do tratamento de uma unidade na posição CANDIDATA: a geométrica (o lado de H/2 do centro da unidade com os
 * ornamentos) — a MESMA que a régua (`bordaDoGrupo(rect, null, H)`) e o revisor usam na peça final. Se a busca fixasse a
 * borda da referência, no centro-óptico (a zona da manchete atravessa H/2) a estimativa e a régua falariam de véus
 * diferentes, e a régua corrigiria o véu errado (revisão adversarial, lente C).
 */
export const bordaDaUnidade = (rectComOrnamentos: Rect, H: number): Borda => bordaDoGrupo(rectComOrnamentos, null, H)

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
  return camadasNaReferencia(args.unidades, args.materializacao.papeis, (p) => alinhaDoPapel(args.arquetipo, p)).map(({ unidade: u, rect, camadas }) => {
    const dy = args.deslocamentos[u.papel] ?? 0
    const o = u.ornamentos
    const rectComOrnamentos = { x: rect.x - o.esquerda, y: rect.y - o.topo, width: rect.width + o.esquerda + o.direita, height: rect.height + o.topo + o.base }
    return {
      papel: u.papel,
      ordemDeLeitura: ordem.get(u.papel) ?? 99,
      faixa: args.faixas.find((f) => f.membros.includes(u.papel))?.indice ?? -1,
      rect,
      rectComOrnamentos,
      rectNaReferencia: { ...rect, y: rect.y - dy },
      borda: bordaDaUnidade(rectComOrnamentos, args.H),
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
  if (args.cortes.length > LIMITES_DA_BUSCA.cortes) throw limiteDaBusca(`${args.cortes.length} cortes passam do limite (${LIMITES_DA_BUSCA.cortes})`)
  const total = args.cortes.length * args.materializadas.length
  if (total > LIMITES_DA_BUSCA.avaliacoes) throw limiteDaBusca(`${total} avaliações passam do limite (${LIMITES_DA_BUSCA.avaliacoes})`)
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
  // Todo corte perde o assunto do catálogo: a FOTO não serve a este formato, qualquer que seja a posição ou o véu.
  if (avaliacoes.every((a) => a.eliminada.some((e) => e.motivo === MOTIVOS_DE_ELIMINACAO.corteSemOAssunto))) return MOTIVOS_DE_ELIMINACAO.corteSemOAssunto
  const doTratamento = new Set(avaliacoes.map((a) => a.eliminada.find((e) => e.motivoDoTratamento)?.motivoDoTratamento ?? null))
  if (doTratamento.size === 1 && [...doTratamento][0]) return [...doTratamento][0]!
  const contagem = Object.entries(contarRecusas(avaliacoes)).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  return contagem[0]?.[0] ?? null
}

/** Até 6 exemplos de recusa: um por motivo primeiro (qualquer motivo da avaliação, não só o primeiro), na ordem em que aparecem. */
export function exemplosDeRecusa(avaliacoes: AvaliacaoDaCombinacao[]): DiagnosticoDaBuscaEspacial['exemplosDeRecusa'] {
  const eliminadas = avaliacoes.filter((a) => a.eliminada.length > 0)
  const vistos = new Set<string>()
  const primeiros = eliminadas.filter((a) => {
    const novos = a.eliminada.map((e) => e.motivo).filter((m) => !vistos.has(m))
    if (novos.length === 0) return false
    for (const m of novos) vistos.add(m)
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
const pct = (v: number) => Math.round(v * 100)
const ehValida = (a: AvaliacaoDaCombinacao) => a.eliminada.length === 0 && !!a.componentes

/**
 * Por que a peça SAIU da referência (a partida, no corte central), quando saiu — na MESMA ordem do filtro sequencial:
 * eliminada (e por quê); cobria a região estimada; pedia mais véu que o mínimo entre as válidas; ou perdia na pontuação.
 * `null` quando a vencedora é a própria partida.
 */
export function motivoContraAReferencia(ordenadas: AvaliacaoDaCombinacao[], vencedora: AvaliacaoDaCombinacao, faixas: FaixaDeBusca[] = []): string | null {
  const referencia = ordenadas.find((a) => a.combinacao.indice === 0 && a.crop === 'center-middle') ?? ordenadas.find((a) => a.combinacao.indice === 0)
  if (!referencia || referencia === vencedora) return null
  const partida = faixas.some((f) => !f.referenciaValida) ? 'a posição de partida (o resgate da referência)' : 'a referência'
  const onde = referencia.crop === vencedora.crop ? partida : `${partida} no corte ${referencia.crop}`
  if (referencia.eliminada.length > 0) return `${onde} caía em ${[...new Set(referencia.eliminada.map((e) => e.motivo))].join(', ')}`
  if (invadeAEstimada(referencia) && !invadeAEstimada(vencedora)) return `${onde} cobria ${pct(referencia.regiaoEstimada!.cobertura)}% da região estimada como assunto`
  const validas = ordenadas.filter(ehValida)
  // O MESMO patamar de `melhorEntre`: sem quem escape da região estimada, ficam as de menor cobertura (com tolerância).
  const cobertura = (a: AvaliacaoDaCombinacao) => a.regiaoEstimada?.cobertura ?? 0
  const menorCobertura = Math.min(...validas.map(cobertura))
  const todasCobrem = !validas.some((a) => !invadeAEstimada(a))
  if (todasCobrem && cobertura(referencia) > menorCobertura + TOLERANCIA_DA_COBERTURA) {
    return `${onde} cobria ${pct(cobertura(referencia))}% da região estimada como assunto; toda posição válida a cobre, e ficaram as de menor cobertura (a mínima ${pct(menorCobertura)}%, tolerância ${pct(TOLERANCIA_DA_COBERTURA)} pontos)`
  }
  const doPatamar = todasCobrem ? validas.filter((a) => cobertura(a) <= menorCobertura + TOLERANCIA_DA_COBERTURA) : validas.filter((a) => !invadeAEstimada(a))
  const menorCusto = Math.min(...doPatamar.map((a) => a.componentes!.custoDoTratamento))
  if (referencia.componentes!.custoDoTratamento > menorCusto + TOLERANCIA_DO_CUSTO) return `${onde} pedia ${descreverTratamento(referencia)}; aqui ${descreverTratamento(vencedora)}`
  return `${onde} perdia na pontuação (${num(referencia.pontuacao ?? 0)} contra ${num(vencedora.pontuacao ?? 0)})`
}

/** Quando a vencedora tem véu: as posições que leriam SEM véu e foram eliminadas — e por quê (o critério que decidiu). */
function semVeuEliminadas(ordenadas: AvaliacaoDaCombinacao[], vencedora: AvaliacaoDaCombinacao): string | null {
  if ((vencedora.componentes?.custoDoTratamento ?? 0) === 0) return null
  const leriam = ordenadas.filter((a) => a.eliminada.length > 0 && (a.tratamento ?? []).length > 0 && a.tratamento!.every((t) => t.estado === 'sem-necessidade'))
  if (leriam.length === 0) return null
  const contagem = Object.entries(contarRecusas(leriam)).map(([m, n]) => `${m} ×${n}`)
  return `as posições que leriam sem véu caíam em ${contagem.join(', ')}`
}

/** O diagnóstico compacto da busca (vai em `fieldValues.composicao.arquetipo.buscaEspacial`). */
export function diagnosticoDaBusca(args: {
  escolha: EscolhaEspacial
  resultado: ResultadoDaBusca
  faixas: FaixaDeBusca[]
  cortesAvaliados: LeituraDoCorte['crop'][]
  reproduzida?: DiagnosticoDaBuscaEspacial['reproduzida']
}): DiagnosticoDaBuscaEspacial {
  const { ordenadas, vencedora } = args.resultado
  const alts = alternativas(ordenadas, vencedora)
  const segunda = ordenadas.find((a) => a !== vencedora && a.eliminada.length === 0)
  const motivoDaBusca = (v: AvaliacaoDaCombinacao) => {
    const contra = motivoContraAReferencia(ordenadas, v, args.faixas)
    const semVeu = semVeuEliminadas(ordenadas, v)
    const daVitoria = motivoDaVitoria(v, segunda, Math.min(...ordenadas.filter(ehValida).map((a) => a.regiaoEstimada?.cobertura ?? 0)))
    return [contra, semVeu, contra || semVeu ? daVitoria.replace(/^a foto não distingue: /, 'entre as válidas, ') : daVitoria].filter(Boolean).join('; ')
  }
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
      ? `posição reproduzida da escolha gravada (recomposição): a busca não roda de novo${args.reproduzida.original ? ` — a escolha original: ${args.reproduzida.original.motivo}` : ''} (os componentes são medidos só no corte reproduzido)`
      : vencedora
        ? motivoDaBusca(vencedora)
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
  /** O gap da marca: os papéis de cada faixa empilham (29/10/2026). */
  gap?: number
  /** `'marca'`: a margem da marca é a margem (29/10/2026); a escolha grava o modo. Ausente = opção A. */
  margem?: MargemDaPeca
  /** As receitas dos acentos que a peça vai desenhar (a reserva do fio na pilha). */
  receitas?: ReadonlyArray<ReceitaDoAcento>
  /** O portão estrutural já passado (`partidaNoArquetipo`): as faixas, os candidatos e a posição de partida. */
  partida: Extract<PartidaNoArquetipo, { ok: true }>
  /** A foto em cada corte candidato (vazio sem foto). */
  cortes: LeituraDoCorte[]
  planejamento: PlanejamentoDoTratamento
  /** A foto da peça: a impressão da URL que ela desenha (ver `EscolhaEspacial.foto`). */
  foto: string | null
  /** A escolha gravada a REPRODUZIR (recomposição) — a busca não roda. */
  reproduzir?: (EscolhaEspacial & { buscaOriginal?: ResumoDaBuscaOriginal }) | null
  /** A reprodução é de uma peça do T1a (a posição é a referência, não uma escolha pela foto) — muda só as mensagens. */
  reproduzirReferencia?: boolean
  /**
   * #8 (foto em caixa): o corte que o compositor escolheu pela CAIXA da foto, para o ramo sem leitura (o texto não pousa
   * na foto, então ela não escolhe posição). Ausente = o corte central de sempre. A reprodução segue usando o gravado.
   */
  corteSemLeitura?: CropPosition
}

export type SelecaoNoArquetipo =
  | { ok: true; materializacao: MaterializacaoOk; crop: CropPosition; escolha: EscolhaEspacial; diagnostico: DiagnosticoDaBuscaEspacial; avisos: string[] }
  | { ok: false; resultado: ResultadoDaBusca; faixas: FaixaDeBusca[]; motivo: string | null }

const materializarCom = (args: ArgsDaSelecao, deslocamentos: Combinacao['deslocamentos']): Materializacao =>
  materializarUnidades({ arquetipo: args.arquetipo, formato: args.formato, canvas: args.canvas, geometria: args.geometria, unidades: args.unidades, logo: args.logo, deslocamentos, ...(args.gap !== undefined ? { gap: args.gap } : {}), ...(args.margem ? { margem: args.margem } : {}), ...(args.receitas ? { receitas: args.receitas } : {}) })

/** A combinação que reproduz deslocamentos dados (a escolha gravada, ou a referência): rótulo `congelado` fora do 0. */
function combinacaoDosDeslocamentos(faixas: FaixaDeBusca[], deslocamentos: Combinacao['deslocamentos']): Combinacao {
  return {
    indice: 0,
    escolhas: faixas.map((f) => {
      const dy = deslocamentos[f.membros[0]] ?? 0
      return { faixa: f.indice, rotulo: dy === 0 ? ROTULOS_DO_DESLOCAMENTO[0] : ('congelado' as const), dy }
    }),
    deslocamentos,
  }
}

/**
 * O `dy` gravado, um por FAIXA, aplicado a todos os membros presentes. Membros de uma faixa que discordam (escolha
 * adulterada, ou de outro arquétipo) não são uma posição: `ARQUETIPO_ESCOLHA_ILEGIVEL`, nunca uma faixa partida. A
 * faixa SEM nenhum deslocamento gravado também é ilegível (a busca grava todos, zero inclusive): assumir 0 a levaria de
 * volta à referência em silêncio (Codex R5). Só a peça do T1a não grava deslocamentos — ela É a referência.
 */
function deslocamentosPorFaixa(args: ArgsDaSelecao, gravados: Combinacao['deslocamentos']): Combinacao['deslocamentos'] {
  const saida: Combinacao['deslocamentos'] = {}
  for (const f of args.partida.faixas) {
    const dys = [...new Set(f.membros.filter((m) => m !== 'logo' && gravados[m] !== undefined).map((m) => gravados[m]!))]
    const daLogo = gravados.logo
    const dy = dys.length > 0 ? dys : daLogo !== undefined && f.membros.includes('logo') ? [daLogo] : args.reproduzirReferencia ? [0] : []
    if (dy.length === 0) {
      throw new CreativeError('ARQUETIPO_ESCOLHA_ILEGIVEL', `${chaveDoArquetipo(args.arquetipo)}: a escolha gravada não traz o deslocamento da faixa (${f.membros.join(', ')}) — a posição não é refeita às cegas. Peça uma nova composição da peça.`, 422, {
        arquetipo: chaveDoArquetipo(args.arquetipo),
        faixa: f.membros,
        deslocamentos: gravados,
      })
    }
    if (dy.length > 1) {
      throw new CreativeError('ARQUETIPO_ESCOLHA_ILEGIVEL', `${chaveDoArquetipo(args.arquetipo)}: a escolha gravada move a faixa (${f.membros.join(', ')}) com deslocamentos diferentes (${dy.join(', ')} px) — não é uma posição do arquétipo.`, 422, {
        arquetipo: chaveDoArquetipo(args.arquetipo),
        faixa: f.membros,
        deslocamentos: gravados,
      })
    }
    for (const m of f.membros) saida[m] = dy[0]
  }
  return saida
}

/** O intervalo de `dy` em que SÓ a logo de referência fixa cabe na zona dela (a logo não é escolha da foto). */
function intervaloDaLogo(args: ArgsDaSelecao): { min: number; max: number } | null {
  const l = args.partida.naReferencia.papeis.logo
  if (!l) return null
  return { min: Math.ceil(l.zonaEfetiva.y - l.posicao.y + 0.5), max: Math.floor(l.zonaEfetiva.y + l.zonaEfetiva.height - (l.posicao.y + l.posicao.height) - 1.5) }
}

/** Os hard constraints que a COPY nova pode violar na posição congelada (a foto é a mesma): na reprodução, recusa. */
const DEPENDEM_DA_COPY = new Set<MotivoDeEliminacao>(['INVADE_REGIAO_PROTEGIDA', 'COLISAO_ENTRE_GRUPOS', 'ORDEM_DE_LEITURA', 'HIERARQUIA_ESTRUTURAL'])

/**
 * A POSIÇÃO do arquétipo pela foto (CP2B): a busca pequena (faixas × candidatos × cortes) — ou, na recomposição, a
 * escolha gravada reproduzida sem buscar (a copy nova que não cabe nela é RECUSADA, nunca movida). Sem foto, a
 * posição de partida no corte central. Sem nenhuma combinação válida, `ok: false` — quem chama decide entre
 * SEM_COMBINACAO e PREFERENCIA_INVIAVEL.
 */
export function selecionarNoArquetipo(args: ArgsDaSelecao): SelecaoNoArquetipo {
  const faixas = args.partida.faixas
  const H = args.canvas.height

  // Reprodução (ou sem foto): uma combinação só. A geometria e o que a copy nova viola recusam; o tratamento avisa.
  if (args.reproduzir || args.cortes.length === 0) {
    // Combinação única (sem foto, ou texto no liso): a escolha nova também grava a pilha com que a peça nasceu (29/10/2026).
    const nova: EscolhaEspacial & { buscaOriginal?: ResumoDaBuscaOriginal } = { modo: MODO_BUSCA_ESPACIAL, foto: args.foto, corte: args.corteSemLeitura ?? ('center-middle' as CropPosition), deslocamentos: args.partida.deslocamentos, ...(args.gap !== undefined ? { pilha: args.gap } : {}), ...(args.margem ? { margem: args.margem } : {}) }
    const { buscaOriginal, ...gravada } = args.reproduzir ?? nova
    const avisos: string[] = []
    const origem = args.reproduzirReferencia ? 'a posição de referência do arquétipo (peça do T1a)' : 'a posição desta peça foi escolhida pela foto e está congelada'
    const recusa = (problemas: unknown[], descricao: string) =>
      new CreativeError(
        'ARQUETIPO_POSICAO_CONGELADA_NAO_CABE',
        `${chaveDoArquetipo(args.arquetipo)}: ${origem} (corte ${gravada.corte}); nela, ${descricao}. Nada foi movido: encurte o texto (menos linhas ou linhas mais curtas) ou peça uma nova composição da peça.`,
        422,
        { arquetipo: chaveDoArquetipo(args.arquetipo), formato: args.formato, escolha: gravada, problemas },
      )
    let deslocamentos = args.reproduzir ? deslocamentosPorFaixa(args, gravada.deslocamentos) : { ...gravada.deslocamentos }
    let m = materializarCom(args, deslocamentos)
    // A logo de referência fixa não é escolha da foto: se a da assinatura mudou de proporção e não cabe mais no dy da
    // faixa, ela vai para o dy válido mais perto (o texto fica onde estava) — dito no aviso, nunca recusa por isso.
    const faixaDaLogo = faixas.find((f) => f.membros.includes('logo'))
    if ('problemas' in m && m.problemas.every((p) => p.papel === 'logo') && faixaDaLogo) {
      const iv = intervaloDaLogo(args)
      if (iv && iv.min <= iv.max) {
        const antes = deslocamentos.logo ?? 0
        const depois = Math.max(iv.min, Math.min(iv.max, antes))
        deslocamentos = { ...deslocamentos, logo: depois }
        m = materializarCom(args, deslocamentos)
        avisos.push(`A logo da assinatura não cabia mais na posição congelada (mudou de proporção?): ela foi ${depois < antes ? 'subida' : 'descida'} ${Math.abs(depois - antes)} px; o texto ficou onde estava.`)
      }
    }
    if ('problemas' in m) throw recusa(m.problemas, m.problemas.map((p) => `${p.papel} — ${p.motivo}`).join('; '))
    const fixa: EscolhaEspacial = { ...gravada, deslocamentos }
    const combinacao = combinacaoDosDeslocamentos(faixas, deslocamentos)
    const corte = args.cortes.find((c) => c.crop === fixa.corte)
    const unidades = unidadesDaCombinacao({ unidades: args.unidades, materializacao: m, arquetipo: args.arquetipo, deslocamentos, faixas, H })
    const avaliacao: AvaliacaoDaCombinacao = corte
      ? avaliarCombinacao({ corte, energiaDeReferencia: Math.max(1, corte.mapa.energiaMaxima), materializada: { combinacao, unidades, logo: m.papeis.logo?.posicao }, faixas, planejamento: args.planejamento, canvas: args.canvas })
      : { crop: fixa.corte, combinacao, eliminada: [] }
    if (args.reproduzir) {
      const daCopy = avaliacao.eliminada.filter((e) => DEPENDEM_DA_COPY.has(e.motivo))
      if (daCopy.length > 0) throw recusa(daCopy, daCopy.map((e) => e.detalhe).join('; '))
      // O corte congelado que agora perde o assunto do catálogo também é hard: recusa sem mover. A busca nunca escolhe um
      // corte que perde o assunto (é inválido sempre), então a anotação da foto mudou depois da composição. Não é a copy:
      // a saída é uma composição nova. A peça do T1a nasceu no corte central COM o aviso de assunto perdido: recusar a
      // edição de texto dela agora seria regressão — segue, e o compositor repete o aviso do corte.
      const doCorte = args.reproduzirReferencia ? [] : avaliacao.eliminada.filter((e) => e.motivo === 'CORTE_PERDE_O_ASSUNTO')
      if (doCorte.length > 0) {
        throw new CreativeError(
          'ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO',
          `${chaveDoArquetipo(args.arquetipo)}: ${origem} (corte ${gravada.corte}); esse corte agora perde o assunto que o catálogo marca na foto (${doCorte[0].detalhe}). Nada foi movido: peça uma nova composição da peça.`,
          422,
          { arquetipo: chaveDoArquetipo(args.arquetipo), formato: args.formato, escolha: gravada, problemas: doCorte },
        )
      }
      const doTratamento = avaliacao.eliminada.filter((e) => e.motivo !== MOTIVOS_DE_ELIMINACAO.corteSemOAssunto)
      if (doTratamento.length > 0) {
        avisos.push(`A posição congelada da peça agora pede outro tratamento (${[...new Set(doTratamento.map((e) => e.motivo))].join(', ')}) — mantida assim: a recomposição não move a peça, e o CP2A julga a leitura.`)
      }
    }
    const resultado: ResultadoDaBusca = { ordenadas: [avaliacao], vencedora: avaliacao, avaliadas: corte ? 1 : 0 }
    const diagnostico = diagnosticoDaBusca({
      escolha: fixa,
      resultado,
      faixas,
      cortesAvaliados: corte ? [corte.crop] : [],
      ...(args.reproduzir ? { reproduzida: { de: idDaEscolha(gravada), ...(buscaOriginal ? { original: buscaOriginal } : {}) } } : {}),
    })
    if (!args.reproduzir) {
      diagnostico.motivo = args.corteSemLeitura
        ? `texto no liso (foto em caixa): a foto não escolhe a posição; ficou a posição de partida (a referência, ou o resgate mais perto dela), com o corte ${args.corteSemLeitura} escolhido pela caixa da foto`
        : 'sem foto para ler: ficou a posição de partida (a referência, ou o resgate mais perto dela) no corte central'
    }
    return { ok: true, materializacao: m, crop: fixa.corte, escolha: fixa, diagnostico, avisos }
  }

  const combinacoes = combinacoesDasFaixas(faixas)
  const porIndice = new Map<number, MaterializacaoOk>()
  const materializadas: CombinacaoMaterializada[] = combinacoes.map((combinacao) => {
    const m = materializarCom(args, combinacao.deslocamentos)
    if ('problemas' in m) return { combinacao, eliminada: m.problemas.map(eliminacaoDoProblema) }
    porIndice.set(combinacao.indice, m)
    return {
      combinacao,
      unidades: unidadesDaCombinacao({ unidades: args.unidades, materializacao: m, arquetipo: args.arquetipo, deslocamentos: combinacao.deslocamentos, faixas, H }),
      ...(m.papeis.logo ? { logo: m.papeis.logo.posicao } : {}),
    }
  })
  const energiaDeReferencia = Math.max(1, ...args.cortes.map((c) => c.mapa.energiaMaxima))
  const resultado = buscarNaFoto({ materializadas, cortes: args.cortes, faixas, energiaDeReferencia, planejamento: args.planejamento, canvas: args.canvas })
  if (!resultado.vencedora) return { ok: false, resultado, faixas, motivo: motivoDaFalta(resultado.ordenadas) }
  const v = resultado.vencedora
  const escolha: EscolhaEspacial = { modo: MODO_BUSCA_ESPACIAL, foto: args.foto, corte: v.crop, deslocamentos: v.combinacao.deslocamentos, ...(args.gap !== undefined ? { pilha: args.gap } : {}), ...(args.margem ? { margem: args.margem } : {}) }
  const diagnostico = diagnosticoDaBusca({ escolha, resultado, faixas, cortesAvaliados: args.cortes.map((c) => c.crop) })
  const menorCobertura = Math.min(...resultado.ordenadas.filter((a) => a.eliminada.length === 0).map((a) => a.regiaoEstimada?.cobertura ?? 0))
  const avisos = invadeAEstimada(v)
    ? [
        `Toda posição válida cobria a região estimada como assunto da foto (teto ${pct(v.regiaoEstimada!.teto)}%): ficaram as de menor cobertura — a mínima ${pct(menorCobertura)}%, com tolerância de ${pct(TOLERANCIA_DA_COBERTURA)} pontos — e entre elas decidiram o tratamento e a pontuação; esta cobre ${pct(v.regiaoEstimada!.cobertura)}%. Sem caixa de assunto no catálogo, a região é estimada pela textura.`,
      ]
    : []
  return { ok: true, materializacao: porIndice.get(v.combinacao.indice)!, crop: v.crop, escolha, diagnostico, avisos }
}
