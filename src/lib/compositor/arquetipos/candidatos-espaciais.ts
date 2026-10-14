/**
 * A GEOMETRIA DA BUSCA ESPACIAL (CP2B, 14/10/2026): as faixas do arquétipo, o intervalo de `dy` em que cada faixa
 * cabe na zona efetiva e os poucos candidatos dentro dele — e as combinações (um candidato por faixa) que o
 * orquestrador avalia pela foto. Não olha a foto: só a geometria da peça já materializada na referência.
 *
 * SÓ VERTICAL: o alinhamento estrutural ancora uma LINHA (a margem esquerda no topo-esquerda, o eixo central no
 * centro-óptico); um `dx` moveria essa linha e reinventaria o modelo. Nenhum candidato aqui desloca na horizontal.
 *
 * Puro: sem banco, sem render.
 */
import {
  LIMITES_DA_BUSCA,
  PASSO_MINIMO_PX,
  ROTULOS_DO_DESLOCAMENTO,
  type CandidatoDaFaixa,
  type Combinacao,
  type FaixaDeBusca,
  type MembroDaFaixa,
} from './busca-espacial-tipos'
import { materializarUnidades, type UnidadeDoArquetipo } from './no-compositor'
import type { GeometriaEfetiva, Materializacao, PapelMaterializado, ProblemaDeMaterializacao } from './materializar'
import type { ArquetipoDeLayout, FormatoDoArquetipo, PapelDeTexto, Zona } from './tipos'

type Ornamentos = { esquerda: number; direita: number; topo: number; base: number }

/**
 * A FOLGA DO ARREDONDAMENTO. As entradas são as da `Materializacao`, arredondadas ao pixel; a materialização
 * deslocada confere nos valores EXATOS, com ½ px de tolerância. O topo (y da zona e y da caixa) erra até ½ px cada:
 * falta até ½ px além da tolerância. A base (y + altura, de cada lado) erra até 1 px cada: falta até 1½ px. Sem a
 * folga, a candidata extrema caía por fração de pixel (feed, topo-esquerda: o pré-título em y 148,5 contra a zona em
 * 120,15 dava dy −29, e a materialização o recusava por 0,15 px).
 */
const FOLGA_DO_TOPO = 0.5
const FOLGA_DA_BASE = 1.5
/** A tolerância da materialização (½ px), na conferência horizontal. */
const TOLERANCIA_HORIZONTAL = 0.5

/**
 * As FAIXAS do arquétipo num formato: os papéis com referência e zona (a logo automática fica fora) cujas ZONAS se
 * sobrepõem na vertical, por fecho transitivo. Faixas na ordem do primeiro membro na leitura; membros na leitura.
 */
export function faixasDoArquetipo(arquetipo: ArquetipoDeLayout, formato: FormatoDoArquetipo): MembroDaFaixa[][] {
  const ordem = new Map(arquetipo.papeis.map((p) => [p.papel, p.ordemDeLeitura]))
  const porOrdem = (a: MembroDaFaixa, b: MembroDaFaixa) => (ordem.get(a) ?? 99) - (ordem.get(b) ?? 99)
  const zonas = new Map<MembroDaFaixa, Zona>()
  for (const [papel, pos] of Object.entries(arquetipo.formatos[formato].papeis)) {
    if (pos && 'zona' in pos) zonas.set(papel as MembroDaFaixa, pos.zona)
  }
  const sobrepoem = (a: MembroDaFaixa, b: MembroDaFaixa) => zonas.get(a)!.yMin < zonas.get(b)!.yMax && zonas.get(b)!.yMin < zonas.get(a)!.yMax
  let faixas: MembroDaFaixa[][] = []
  // União incremental: cada membro funde todas as faixas que toca (o fecho transitivo).
  for (const m of [...zonas.keys()].sort(porOrdem)) {
    const tocadas = faixas.filter((f) => f.some((o) => sobrepoem(o, m)))
    faixas = [...faixas.filter((f) => !tocadas.includes(f)), [...tocadas.flat(), m].sort(porOrdem)]
  }
  return faixas.sort((a, b) => porOrdem(a[0], b[0]))
}

/**
 * As faixas de busca de uma peça medida na REFERÊNCIA: só os membros presentes (texto na peça; logo de referência
 * fixa materializada), o intervalo de `dy` em que todos cabem (caixa real + ornamentos presos) na zona efetiva de cada
 * um, e os candidatos dentro dele.
 *
 * A referência é PREFERÊNCIA, não obrigação: quando a área segura do projeto a corta (`foraDaZona`), o intervalo não
 * contém 0 e a busca RESGATA a faixa na vertical — a primeira candidata passa a ser a posição válida mais perto da
 * referência. Faixa sem posição vertical nenhuma (intervalo vazio, ou caixa que passa da zona na HORIZONTAL, que o
 * `dy` não conserta) sai com `candidatos: []` e `semPosicao`: recusa estrutural.
 */
export function candidatosDasFaixas(args: {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  papeis: Partial<Record<MembroDaFaixa, Pick<PapelMaterializado, 'zonaEfetiva' | 'posicao'>>>
  ornamentos: Partial<Record<PapelDeTexto, Ornamentos>>
  /** Os membros cuja caixa, na referência, sai da zona efetiva (a materialização conferida os acusou). */
  foraDaZona?: ReadonlySet<MembroDaFaixa>
}): FaixaDeBusca[] {
  const presentes = faixasDoArquetipo(args.arquetipo, args.formato)
    .map((f) => f.filter((m) => args.papeis[m]))
    .filter((f) => f.length > 0)
  if (presentes.length > LIMITES_DA_BUSCA.faixas) throw new Error(`busca espacial: ${presentes.length} faixas passam do limite de ${LIMITES_DA_BUSCA.faixas}`)

  return presentes.map((membros, indice) => {
    let maxLo = -Infinity
    let minHi = Infinity
    let semPosicao: FaixaDeBusca['semPosicao']
    for (const m of membros) {
      const { zonaEfetiva: z, posicao: p } = args.papeis[m]!
      const o = (m !== 'logo' && args.ornamentos[m]) || { esquerda: 0, direita: 0, topo: 0, base: 0 }
      maxLo = Math.max(maxLo, z.y - (p.y - o.topo))
      minHi = Math.min(minHi, z.y + z.height - (p.y + p.height + o.base))
      // Na horizontal o x é do alinhamento: caixa que passa da zona de lado não tem conserto vertical.
      if (!semPosicao && (p.x - o.esquerda < z.x - TOLERANCIA_HORIZONTAL || p.x + p.width + o.direita > z.x + z.width + TOLERANCIA_HORIZONTAL)) {
        semPosicao = { membro: m, motivo: `a caixa de ${m} (x ${Math.round(p.x - o.esquerda)}–${Math.round(p.x + p.width + o.direita)}) passa da zona efetiva na horizontal (x ${Math.round(z.x)}–${Math.round(z.x + z.width)}); o alinhamento fixa o x e a busca só move na vertical` }
      }
    }
    const referenciaValida = !membros.some((m) => args.foraDaZona?.has(m))
    // Para DENTRO (descontada a folga do arredondamento); com a referência válida, sempre com o 0 (ela materializou).
    const lo = Math.ceil(maxLo + FOLGA_DO_TOPO)
    const hi = Math.floor(minHi - FOLGA_DA_BASE)
    const intervalo = referenciaValida ? { min: Math.min(0, lo), max: Math.max(0, hi) } : { min: lo, max: hi }
    if (!semPosicao && intervalo.min > intervalo.max) {
      semPosicao = { membro: membros[0], motivo: `nenhuma posição vertical da faixa (${membros.join(', ')}) cabe na zona efetiva: o espaço que a zona dá é menor que a caixa real` }
    }
    if (semPosicao) return { indice, membros, intervalo, referenciaValida, candidatos: [], semPosicao }

    // Os rótulos dizem ONDE no intervalo: o topo, o meio do caminho para cima, o meio do caminho para baixo e a base.
    // Com a referência válida, o "meio" é rumo à referência (0); sem ela, o meio do intervalo.
    const meio = Math.trunc((intervalo.min + intervalo.max) / 2)
    const dys: Record<(typeof ROTULOS_DO_DESLOCAMENTO)[number], number | null> = {
      referencia: referenciaValida ? 0 : null,
      acima: intervalo.min,
      'meio-acima': referenciaValida ? Math.trunc(intervalo.min / 2) : meio,
      'meio-abaixo': referenciaValida ? Math.trunc(intervalo.max / 2) : null,
      abaixo: intervalo.max,
    }
    // A PARTIDA primeiro: a referência, ou (resgate) a posição válida mais perto dela.
    const partida: CandidatoDaFaixa = referenciaValida
      ? { rotulo: 'referencia', dy: 0 }
      : Math.abs(intervalo.min) <= Math.abs(intervalo.max)
        ? { rotulo: 'acima', dy: intervalo.min }
        : { rotulo: 'abaixo', dy: intervalo.max }
    // Os 5 rótulos são o teto de `candidatosPorFaixa`; passo pequeno e repetido não são alternativa.
    const candidatos: CandidatoDaFaixa[] = [partida]
    for (const rotulo of ROTULOS_DO_DESLOCAMENTO) {
      const dy = dys[rotulo]
      if (dy === null || candidatos.some((c) => Math.abs(c.dy - dy) < PASSO_MINIMO_PX)) continue
      candidatos.push({ rotulo, dy })
    }
    return { indice, membros, intervalo, referenciaValida, candidatos }
  })
}

/**
 * O produto cartesiano dos candidatos, em ordem lexicográfica (a faixa 0 varia mais devagar): o índice 0 é a peça
 * inteira na referência, e o índice é o desempate final. Os deslocamentos vão por MEMBRO (todos, também os de dy 0).
 */
export function combinacoesDasFaixas(faixas: FaixaDeBusca[]): Combinacao[] {
  const total = faixas.reduce((n, f) => n * f.candidatos.length, 1)
  if (total > LIMITES_DA_BUSCA.combinacoesPorCorte) throw new Error(`busca espacial: ${total} combinações passam do limite de ${LIMITES_DA_BUSCA.combinacoesPorCorte} por corte`)
  let todas: Array<Combinacao['escolhas']> = [[]]
  for (const f of faixas) todas = todas.flatMap((e) => f.candidatos.map((c) => [...e, { faixa: f.indice, rotulo: c.rotulo, dy: c.dy }]))
  return todas.map((escolhas, indice) => ({
    indice,
    escolhas,
    deslocamentos: Object.fromEntries(escolhas.flatMap((e, k) => faixas[k].membros.map((m) => [m, e.dy]))),
  }))
}

/** A posição de PARTIDA do arquétipo numa peça, ou a recusa estrutural (o que nenhuma posição da foto conserta). */
export type PartidaNoArquetipo =
  | {
      ok: true
      /** Onde cada caixa pousaria na referência, sem conferir a zona (é daí que saem os intervalos). */
      naReferencia: Extract<Materializacao, { ok: true }>
      faixas: FaixaDeBusca[]
      /** O `dy` de partida de cada membro (0 na referência válida; o resgate mais perto dela, sem). */
      deslocamentos: Combinacao['deslocamentos']
      /** A materialização CONFERIDA na partida. */
      materializacao: Extract<Materializacao, { ok: true }>
      /** Os membros cuja referência saiu da zona efetiva e foram resgatados na vertical. */
      resgatados: MembroDaFaixa[]
    }
  | { ok: false; problemas: ProblemaDeMaterializacao[] }

/**
 * O PORTÃO ESTRUTURAL do arquétipo (CP2B) — o MESMO no compor e no medir-copy: a capacidade de cada referência, a
 * logo, a zona vazia e a existência de uma posição VERTICAL em que cada faixa cabe na zona efetiva. A referência é a
 * partida quando cabe; quando a área segura do projeto a corta, a partida é a posição válida mais perto dela (resgate,
 * dito em `resgatados`). Recusa: os problemas no formato da materialização (código, papel, referência, zona, medida,
 * motivo, orçamento).
 */
export function partidaNoArquetipo(args: {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  canvas: { width: number; height: number }
  geometria: GeometriaEfetiva
  unidades: UnidadeDoArquetipo[]
  logo: { razao: number } | null
}): PartidaNoArquetipo {
  const base = { arquetipo: args.arquetipo, formato: args.formato, canvas: args.canvas, geometria: args.geometria, unidades: args.unidades, logo: args.logo }
  const naReferencia = materializarUnidades({ ...base, conferirZona: false })
  if ('problemas' in naReferencia) return { ok: false, problemas: naReferencia.problemas }
  const conferida = materializarUnidades(base)
  const problemasDeZona = 'problemas' in conferida ? conferida.problemas : []
  const foraDaZona = new Set(problemasDeZona.map((p) => p.papel as MembroDaFaixa))
  const ornamentos = Object.fromEntries(args.unidades.map((u) => [u.papel, u.ornamentos]))
  const faixas = candidatosDasFaixas({ arquetipo: args.arquetipo, formato: args.formato, papeis: naReferencia.papeis, ornamentos, foraDaZona })
  const semPosicao = faixas.filter((f) => f.candidatos.length === 0)
  if (semPosicao.length > 0) {
    const problemas = semPosicao.flatMap((f): ProblemaDeMaterializacao[] => {
      const daFaixa = problemasDeZona.filter((p) => f.membros.includes(p.papel as MembroDaFaixa))
      const m = f.semPosicao!.membro
      const papel = naReferencia.papeis[m]!
      const motivo = `${f.semPosicao!.motivo} — nenhuma posição da busca pela foto conserta isso`
      return daFaixa.length > 0
        ? daFaixa.map((p) => ({ ...p, motivo: `${p.motivo}; ${motivo}` }))
        : [{ codigo: 'ARQUETIPO_FORA_DA_ZONA', papel: m, referencia: papel.referencia, zonaEfetiva: papel.zonaEfetiva, medida: { width: Math.round(papel.posicao.width), height: Math.round(papel.posicao.height) }, motivo }]
    })
    return { ok: false, problemas }
  }
  const deslocamentos: Combinacao['deslocamentos'] = Object.fromEntries(faixas.flatMap((f) => f.membros.map((m) => [m, f.candidatos[0].dy])))
  const materializacao = materializarUnidades({ ...base, deslocamentos })
  if ('problemas' in materializacao) return { ok: false, problemas: materializacao.problemas }
  return { ok: true, naReferencia, faixas, deslocamentos, materializacao, resgatados: [...foraDaZona] }
}
