/**
 * MEDIR A COPY antes de compor (PR 8 de "Marca simples, copy melhor", F2,
 * 12/09/2026) — módulo PURO, sem Prisma, sem sharp.
 *
 * Quem escreve a copy no chat precisava de uma medida VERIFICÁVEL antes de
 * gastar uma composição: até aqui o único jeito de saber se a manchete cabia
 * era compor e ler a recusa (`TEXTO_NAO_CABE_NA_COLUNA`). Aqui a copy passa
 * pela MESMA régua da composição — `montarBloco` e `medirLinha`, com o mesmo
 * medidor do render (o napi-rs no servidor; uma régua falsa no teste) — e volta
 * com três verdades, ditas pelo que são:
 *
 *  - a MEDIDA EXATA com o texto (largura por linha, escala necessária até o
 *    piso de 80%, caixa final, linhas), quando a fonte do papel está carregada;
 *  - "NÃO MEDIDO" quando a fonte não está no servidor: o medidor caiu na fonte
 *    de fallback e o número não vale — nunca se finge que mediu;
 *  - "APROXIMADO" quando há palavra entre [colchetes]: o destaque troca a
 *    família do trecho e a largura extra é estimada trecho a trecho (o medidor
 *    do servidor não mede rich text).
 *
 * E o ORÇAMENTO antes do texto (`orcamentoDaVariante`): quantos caracteres
 * cabem numa linha de cada papel, no tamanho da assinatura, medidos com uma
 * amostra em português — é o número que a instrução do conector dava de cabeça
 * ("headline até ~18 caracteres") e que muda de marca para marca.
 */

import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { AssinaturaDaMarca, EstiloDePapel } from './assinatura'
import { camadaDoPapel, medirLinha, montarBloco, PISO_DE_ESCALA, type OrcamentoDeLinha } from './blocos'
import { destaqueDoPapel } from './destaques'
import { familiasDaCamada } from './medidas'
import { dividirManchete } from './segunda-voz'
import { DIMENSOES, type Formato, type Papel } from './spec'

/** Amostra em português para o orçamento por caracteres (a largura média de uma letra da marca). */
export const AMOSTRA_DO_ORCAMENTO = 'Sexta é dia de churrasco com a família no salão'

export interface AreaUtil {
  formato: Formato
  larguraDoCanvas: number
  alturaDoCanvas: number
  margemH: number
  safeTopo: number
  safeRodape: number
  /** A largura entre as margens — a coluna em que cada linha tem de caber. */
  colunaUtil: number
  /** A altura entre a safe area do topo e a do rodapé. */
  alturaUtil: number
  /** Multiplicador dos tamanhos da página de assinatura para este formato (1 quando a página é do formato). */
  escalaDoFormato: number
}

export function areaUtilDe(assinatura: AssinaturaDaMarca, formato: Formato): AreaUtil {
  const canvas = DIMENSOES[formato]
  const geo = assinatura.numeros.geometria[formato]
  const escalaDoFormato = assinatura.origem.formatoDaPagina === formato ? 1 : geo.escalaDeFonte
  return {
    formato,
    larguraDoCanvas: canvas.width,
    alturaDoCanvas: canvas.height,
    margemH: geo.margemH,
    safeTopo: geo.safeTopo,
    safeRodape: geo.safeRodape,
    colunaUtil: canvas.width - 2 * geo.margemH,
    alturaUtil: canvas.height - geo.safeTopo - geo.safeRodape,
    escalaDoFormato,
  }
}

export interface OrcamentoDoPapel {
  papel: Papel
  fonte: string
  /** O corpo com que o papel sai neste formato (px). */
  fontSize: number
  /** A coluna do papel (a coluna útil, menos a largura máxima da assinatura quando ela limita). */
  coluna: number
  /** Quantos caracteres cabem numa linha, aproximado pela largura média de uma letra da amostra. */
  caracteresPorLinha: number | null
  /** Quantas linhas do papel cabem na altura útil (só o corpo × entrelinha; sem contar os outros blocos). */
  linhasNaAlturaUtil: number | null
  naoMedido: boolean
}

function estiloComEscala(estilo: EstiloDePapel, escala: number): EstiloDePapel {
  return { ...estilo, fontSize: estilo.fontSize * escala }
}

/**
 * O orçamento ANTES do texto, papel a papel: quantos caracteres cabem numa
 * linha e quantas linhas cabem na altura útil. Aproximado por construção — a
 * largura de uma linha depende das letras que ela tem — e dito assim.
 */
export function orcamentoDaVariante(args: {
  assinatura: AssinaturaDaMarca
  formato: Formato
  medir: MeasureTextBox
  fontesNaoCarregadas: ReadonlySet<string>
}): OrcamentoDoPapel[] {
  const area = areaUtilDe(args.assinatura, args.formato)
  const saida: OrcamentoDoPapel[] = []
  for (const [papel, estilo] of Object.entries(args.assinatura.papeis) as Array<[Papel, EstiloDePapel]>) {
    const coluna = Math.floor(area.colunaUtil * (estilo.larguraMaxima ?? 1))
    const naoMedido = args.fontesNaoCarregadas.has(estilo.fontFamily)
    const base = camadaDoPapel({ papel, linhas: [AMOSTRA_DO_ORCAMENTO], estilo, escala: area.escalaDoFormato, width: coluna, textAlign: 'left', groupId: 'orcamento', corDaMancha: args.assinatura.numeros.mancha })
    const m = naoMedido ? null : medirLinha(args.medir, base, AMOSTRA_DO_ORCAMENTO, coluna)
    const fontSize = Number(base.style?.fontSize ?? Math.round(estilo.fontSize * area.escalaDoFormato))
    const alturaDaLinha = fontSize * estilo.lineHeight
    saida.push({
      papel,
      fonte: estilo.fontFamily,
      fontSize,
      coluna,
      caracteresPorLinha: m && m.largura > 0 ? Math.max(1, Math.floor((AMOSTRA_DO_ORCAMENTO.length * coluna) / m.largura)) : null,
      linhasNaAlturaUtil: naoMedido ? null : Math.max(1, Math.floor(area.alturaUtil / alturaDaLinha)),
      naoMedido,
    })
  }
  return saida
}

export interface MedidaDeLinha {
  linha: string
  /** Largura da tinta no tamanho da assinatura (antes de qualquer redução), px. */
  largura: number | null
  coluna: number
  cabe: boolean | null
  /** Quantos caracteres caberiam nesta linha, na mesma fonte e tamanho. */
  caracteresQueCabem: number | null
}

export type SituacaoDoBloco = 'cabe' | 'cabe-reduzido' | 'nao-cabe' | 'papel-ausente'

export interface MedidaDeBloco {
  papel: Papel
  id: string
  situacao: SituacaoDoBloco
  fonte: string | null
  /** A escala aplicada para caber (1 = tamanho da assinatura; até 0,8). */
  escala: number | null
  /** O corpo final (px), a caixa e as linhas do bloco como ele sairia. */
  fontSize: number | null
  width: number | null
  height: number | null
  linhas: number
  /** A fonte do papel não está no servidor: os números saíram na fonte de fallback e não valem. */
  naoMedido: boolean
  /** Há destaque entre [colchetes]: a largura extra do trecho é estimada (o medidor não mede rich text). */
  aproximado: boolean
  linhasMedidas: MedidaDeLinha[]
  /** Só quando não cabe: o orçamento por linha que a composição devolveria. */
  orcamento?: OrcamentoDeLinha[]
  avisos: string[]
}

export interface MedicaoDaCopy {
  areaUtil: AreaUtil
  blocos: MedidaDeBloco[]
  /** Todo bloco coube (na escala que fosse) e nenhum papel falta. */
  cabeTudo: boolean
  papeisAusentes: Papel[]
  /** Algum bloco saiu na fonte de fallback. */
  naoMedido: boolean
  aproximado: boolean
  fontesNaoCarregadas: string[]
  /** A altura somada dos blocos que couberam, sem os vãos — contra a altura útil. */
  alturaDosBlocos: number
  /** De onde saiu a divisão da manchete em duas vozes. */
  segundaVoz: 'contrato' | 'legado' | 'nenhuma'
  avisos: string[]
}

/**
 * Mede a copy contra UMA assinatura (a variante já escolhida), papel a papel,
 * com a mesma régua da composição.
 */
export function medirCopy(args: {
  blocos: Array<{ papel: Papel; linhas: string[] }>
  assinatura: AssinaturaDaMarca
  formato: Formato
  medir: MeasureTextBox
  /** As famílias cadastradas no projeto (o destaque "pesado" escolhe entre elas). */
  familias: string[]
  fontesNaoCarregadas: ReadonlySet<string>
  /** A divisão da manchete: com contrato, as linhas declaradas na voz 2; sem, a regra legada. */
  comContrato?: boolean
  linhasNaVoz2?: number[] | null
}): MedicaoDaCopy {
  const area = areaUtilDe(args.assinatura, args.formato)
  const avisos: string[] = []
  const medidas: MedidaDeBloco[] = []
  const papeisAusentes: Papel[] = []
  const fontesUsadasSemCarregar = new Set<string>()
  let segundaVoz: MedicaoDaCopy['segundaVoz'] = 'nenhuma'

  // A manchete com segunda voz vira DOIS papéis — a mesma divisão da composição.
  const temSegundaVoz = Boolean(args.assinatura.papeis.headline2)
  const expandidos = args.blocos.flatMap((b) => {
    if (b.papel !== 'headline') return [b]
    const d = dividirManchete(b.linhas, { temSegundaVoz, comContrato: Boolean(args.comContrato), declaradas: args.linhasNaVoz2 ?? null })
    if (d.aviso) avisos.push(`headline: ${d.aviso}`)
    segundaVoz = d.origem
    if (d.voz2.length === 0) return [b]
    const partes: Array<{ papel: Papel; linhas: string[] }> = []
    if (d.voz1.length > 0) partes.push({ papel: 'headline', linhas: d.voz1 })
    partes.push({ papel: 'headline2' as Papel, linhas: d.voz2 })
    return partes
  })

  for (const b of expandidos) {
    const estilo = args.assinatura.papeis[b.papel]
    if (!estilo) {
      papeisAusentes.push(b.papel)
      medidas.push({ papel: b.papel, id: b.papel, situacao: 'papel-ausente', fonte: null, escala: null, fontSize: null, width: null, height: null, linhas: b.linhas.length, naoMedido: false, aproximado: false, linhasMedidas: [], avisos: [`a variante não tem o papel "${b.papel}"`] })
      continue
    }
    const coluna = Math.floor(area.colunaUtil * (estilo.larguraMaxima ?? 1))
    const r = montarBloco({
      papel: b.papel,
      linhas: b.linhas,
      estilo,
      escalaDoFormato: area.escalaDoFormato,
      colunaUtil: area.colunaUtil,
      textAlign: 'left',
      groupId: 'medicao',
      corDaMancha: args.assinatura.numeros.mancha,
      medir: args.medir,
      destaque: destaqueDoPapel({ daPagina: estilo.destaque, padrao: args.assinatura.numeros.destaque, corDoPapel: estilo.color, familiaDoPapel: estilo.fontFamily, familias: args.familias }),
    })
    // Linha a linha, no tamanho da assinatura (sem o prefixo do CTA, que a
    // composição acrescenta; a recusa dela já vem com ele).
    const base = camadaDoPapel({ papel: b.papel, linhas: b.linhas.map(semColchetes), estilo, escala: area.escalaDoFormato, width: coluna, textAlign: 'left', groupId: 'medicao', corDaMancha: args.assinatura.numeros.mancha })
    const familias = r.bloco ? familiasDaCamada(r.bloco.layer) : [estilo.fontFamily]
    const naoMedido = familias.some((f) => args.fontesNaoCarregadas.has(f))
    for (const f of familias) if (args.fontesNaoCarregadas.has(f)) fontesUsadasSemCarregar.add(f)
    const linhasMedidas: MedidaDeLinha[] = b.linhas.map((linha) => {
      const limpa = semColchetes(linha)
      const m = naoMedido ? null : medirLinha(args.medir, base, limpa, coluna)
      return {
        linha,
        largura: m ? Math.round(m.largura) : null,
        coluna,
        cabe: m ? m.largura <= coluna : null,
        caracteresQueCabem: m && m.largura > 0 ? Math.max(1, Math.floor((limpa.length * coluna) / m.largura)) : null,
      }
    })
    if (r.bloco) {
      const escala = r.bloco.escala
      medidas.push({
        papel: b.papel,
        id: r.bloco.layer.id,
        situacao: escala < 1 ? 'cabe-reduzido' : 'cabe',
        fonte: estilo.fontFamily,
        escala,
        fontSize: Number(r.bloco.layer.style?.fontSize ?? null),
        width: r.bloco.width,
        height: r.bloco.height,
        linhas: b.linhas.length,
        naoMedido,
        aproximado: Boolean(r.bloco.destacado),
        linhasMedidas,
        avisos: [...r.avisos, ...(escala < 1 ? [`fonte reduzida a ${Math.round(escala * 100)}% para caber na coluna (piso ${Math.round(PISO_DE_ESCALA * 100)}%)`] : [])],
      })
    } else {
      medidas.push({
        papel: b.papel,
        id: b.papel,
        situacao: 'nao-cabe',
        fonte: estilo.fontFamily,
        escala: null,
        fontSize: null,
        width: null,
        height: null,
        linhas: b.linhas.length,
        naoMedido,
        aproximado: b.linhas.some((l) => /\[[^\]]+\]/.test(l)),
        linhasMedidas,
        orcamento: r.recusa.orcamento,
        avisos: [...r.avisos, `linha maior que a coluna (${coluna}px) mesmo a ${Math.round(PISO_DE_ESCALA * 100)}% da fonte: reescreva com o orçamento`],
      })
    }
  }

  const alturaDosBlocos = medidas.reduce((s, m) => s + (m.height ?? 0), 0)
  if (alturaDosBlocos > area.alturaUtil) avisos.push(`os blocos somam ${alturaDosBlocos}px de altura, mais que a altura útil (${area.alturaUtil}px): a peça não tem onde pousar tudo sem reduzir`)
  return {
    areaUtil: area,
    blocos: medidas,
    cabeTudo: papeisAusentes.length === 0 && medidas.every((m) => m.situacao === 'cabe' || m.situacao === 'cabe-reduzido'),
    papeisAusentes,
    naoMedido: medidas.some((m) => m.naoMedido),
    aproximado: medidas.some((m) => m.aproximado),
    fontesNaoCarregadas: [...fontesUsadasSemCarregar],
    alturaDosBlocos,
    segundaVoz,
    avisos,
  }
}

function semColchetes(linha: string): string {
  return linha.replace(/\[([^\]]+)\]/g, '$1')
}
