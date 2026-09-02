/**
 * Os BLOCOS de texto da peça — um `Layer` por papel, medido antes de existir.
 *
 * A copy chega dividida por linha; aqui cada linha é medida com a fonte real
 * (o medidor é injetado: no servidor é o napi-rs, no teste é uma régua falsa)
 * e o bloco só nasce quando TODAS as linhas cabem na coluna útil. Quando não
 * cabem, o compositor tenta encolher a fonte até 80% (o mesmo piso do
 * autofix) e, se ainda não couber, devolve o ORÇAMENTO — quantos caracteres
 * cabem naquele papel — para quem escreve reescrever. É o `cabe()` do
 * `gerar.py`, com uma diferença: aqui a recusa vem com o número.
 *
 * Módulo puro (sem Prisma, sem sharp).
 */

import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'

import type { EstiloDePapel } from './assinatura'
import type { Papel } from './spec'

/** Piso do encolhimento — o mesmo do autofix geométrico. */
export const PISO_DE_ESCALA = 0.8
const PASSO_DE_ESCALA = 0.04

export interface BlocoMontado {
  papel: Papel
  layer: Layer
  width: number
  height: number
  /** A escala aplicada à fonte da assinatura (1 = tamanho de assinatura). */
  escala: number
  /** Cor do texto — quem calibra o halo precisa dela. */
  cor: string
}

export interface OrcamentoDeLinha {
  papel: Papel
  linha: string
  /** Largura medida no tamanho de assinatura. */
  largura: number
  coluna: number
  /** Quantos caracteres caberiam, na mesma fonte e tamanho. */
  caracteresQueCabem: number
}

export interface RecusaDeBloco {
  papel: Papel
  orcamento: OrcamentoDeLinha[]
}

export type ResultadoDoBloco = { bloco: BlocoMontado; recusa: null } | { bloco: null; recusa: RecusaDeBloco }

function aplicarPrefixo(linhas: string[], prefixo: string | undefined): string[] {
  if (!prefixo || linhas.length === 0) return linhas
  const primeira = linhas[0]
  return primeira.startsWith(prefixo.trim()) ? linhas : [`${prefixo}${primeira}`, ...linhas.slice(1)]
}

/** A camada de texto de um papel, ainda sem posição (x/y = 0). */
export function camadaDoPapel(args: {
  papel: Papel
  linhas: string[]
  estilo: EstiloDePapel
  escala: number
  width: number
  textAlign: 'left' | 'center' | 'right'
  groupId: string
  corDaMancha: string
}): Layer {
  const { estilo } = args
  const fontSize = Math.max(8, Math.round(estilo.fontSize * args.escala))
  const sombra = estilo.sombra ?? { color: args.corDaMancha, blur: 10, offsetY: 1, opacity: 0.65 }
  return {
    id: `${args.papel}`,
    name: args.papel,
    type: 'text',
    visible: true,
    locked: false,
    order: 0,
    isDynamic: true,
    position: { x: 0, y: 0 },
    size: { width: Math.round(args.width), height: fontSize },
    rotation: 0,
    content: aplicarPrefixo(args.linhas, estilo.prefixo).join('\n'),
    style: {
      fontFamily: estilo.fontFamily,
      ...(estilo.fontWeight ? { fontWeight: estilo.fontWeight } : {}),
      fontSize,
      lineHeight: estilo.lineHeight,
      letterSpacing: Math.round(estilo.letterSpacing * args.escala * 100) / 100,
      ...(estilo.textTransform ? { textTransform: estilo.textTransform } : {}),
      color: estilo.color,
      textAlign: args.textAlign,
    },
    textboxConfig: {
      textMode: 'auto-wrap-fixed',
      anchor: 'top',
      autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: estilo.lineHeight },
    },
    effects: {
      shadow: {
        enabled: true,
        shadowColor: sombra.color,
        shadowBlur: sombra.blur,
        shadowOffsetX: 0,
        shadowOffsetY: sombra.offsetY,
        shadowOpacity: sombra.opacity,
      },
    },
    metadata: { groupId: args.groupId, compositor: { papel: args.papel } },
  }
}

/**
 * Mede uma linha sozinha, numa caixa larga o bastante para não quebrar.
 * Devolve a largura da tinta e a altura da linha.
 */
function medirLinha(medir: MeasureTextBox, base: Layer, linha: string, colunaUtil: number) {
  const m = medir({
    ...base,
    content: linha,
    size: { width: colunaUtil * 4 + PADDING_DE_DESENHO * 2, height: base.size.height },
  })
  return m ? { largura: m.maxLineWidth, altura: m.height, linhas: m.lineCount } : null
}

/**
 * Monta o bloco de um papel. `colunaUtil` é a largura entre as margens
 * (menos a largura máxima do papel, quando a assinatura a limita).
 */
export function montarBloco(args: {
  papel: Papel
  linhas: string[]
  estilo: EstiloDePapel
  escalaDoFormato: number
  colunaUtil: number
  textAlign: 'left' | 'center' | 'right'
  groupId: string
  corDaMancha: string
  medir: MeasureTextBox
}): ResultadoDoBloco {
  const coluna = Math.floor(args.colunaUtil * (args.estilo.larguraMaxima ?? 1))
  const linhas = aplicarPrefixo(args.linhas, args.estilo.prefixo)

  for (let escala = args.escalaDoFormato; escala >= args.escalaDoFormato * PISO_DE_ESCALA - 1e-9; escala -= PASSO_DE_ESCALA) {
    const base = camadaDoPapel({ ...args, escala, width: coluna + PADDING_DE_DESENHO * 2 })
    let larguraMaxima = 0
    let cabe = true
    for (const linha of linhas) {
      const m = medirLinha(args.medir, base, linha, coluna)
      if (!m) continue
      larguraMaxima = Math.max(larguraMaxima, m.largura)
      if (m.largura > coluna || m.linhas > 1) cabe = false
    }
    if (!cabe) continue

    const width = Math.min(coluna, Math.ceil(larguraMaxima)) + PADDING_DE_DESENHO * 2 + 2
    const layer = camadaDoPapel({ ...args, escala, width })
    const medida = args.medir(layer)
    // A caixa gravada é a altura MEDIDA (ceil, nunca round — o Konva descarta
    // a linha inteira que não cabe por fração de pixel).
    const height = medida ? Math.ceil(medida.height) : layer.size.height * linhas.length
    return {
      bloco: {
        papel: args.papel,
        layer: { ...layer, size: { width, height } },
        width,
        height,
        escala: Number((escala / args.escalaDoFormato).toFixed(3)),
        cor: args.estilo.color,
      },
      recusa: null,
    }
  }

  // Nada coube nem a 80%: devolve o orçamento medido no tamanho de assinatura.
  const base = camadaDoPapel({ ...args, escala: args.escalaDoFormato, width: coluna + PADDING_DE_DESENHO * 2 })
  const orcamento: OrcamentoDeLinha[] = linhas
    .map((linha) => {
      const m = medirLinha(args.medir, base, linha, coluna)
      if (!m || m.largura <= coluna) return null
      return {
        papel: args.papel,
        linha,
        largura: Math.round(m.largura),
        coluna,
        caracteresQueCabem: Math.max(1, Math.floor((linha.length * coluna) / m.largura)),
      }
    })
    .filter((o): o is OrcamentoDeLinha => o !== null)
  return { bloco: null, recusa: { papel: args.papel, orcamento } }
}

/** Vão vertical entre dois papéis consecutivos (o ritmo do `gerar.py`). */
export function vaoEntre(anterior: Papel | null, proximo: Papel, gapPadrao: number): number {
  if (!anterior) return 0
  if (proximo === 'headline') return Math.round(gapPadrao * 0.5)
  if (proximo === 'cta') return Math.round(gapPadrao * 1.3)
  if (proximo === 'servico') return Math.round(gapPadrao * 1.6)
  return gapPadrao
}

/** Empilha os blocos (já com largura/altura) e devolve a caixa do conjunto. */
export function empilhar(blocos: BlocoMontado[], gapPadrao: number): { width: number; height: number; offsets: number[] } {
  let y = 0
  let anterior: Papel | null = null
  const offsets: number[] = []
  let width = 0
  for (const b of blocos) {
    y += vaoEntre(anterior, b.papel, gapPadrao)
    offsets.push(y)
    y += b.height
    width = Math.max(width, b.width)
    anterior = b.papel
  }
  return { width, height: y, offsets }
}
