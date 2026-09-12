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
 * Palavra marcada com [colchetes] na copy sai DESTACADA (11/09/2026): o bloco
 * vira camada rich-text com o estilo de destaque da marca, e a largura da linha
 * é medida já com a família mais pesada do trecho — senão a linha que "cabia"
 * transbordava a coluna depois de destacada.
 *
 * Módulo puro (sem Prisma, sem sharp).
 */

import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'

import type { EstiloDePapel } from './assinatura'
import { extensoesDosElementos, type ElementoDoArranjo } from './combinacoes'
import { estilosDoRichText, lerDestaques, type EstiloDeDestaque, type TrechoDestacado } from './destaques'
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
  /** Cor do texto — quem calibra o gradiente precisa dela. */
  cor: string
  /** O bloco saiu com palavra destacada (camada rich-text). Ausente = não. */
  destacado?: boolean
  /**
   * O vão antes deste texto (px) como o arranjo o desenhou — a página de
   * assinatura ou a combinação. Ausente = o ritmo da casa (`vaoEntre`).
   */
  vaoAntes?: number
  /**
   * O recuo do texto a partir da borda em que o grupo alinha no arranjo (px) —
   * a linha de serviço ao lado do ícone. Só vale em `empilhar` com `lado`.
   */
  recuo?: number
  /** Os elementos presos ao texto (ícone, filete, selo), relativos à tinta. */
  elementos?: ElementoDoArranjo[]
  /** A escala dos elementos em relação à base 1080 (a do formato × a da fonte). */
  escalaDosElementos?: number
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

export type ResultadoDoBloco =
  | { bloco: BlocoMontado; recusa: null; avisos: string[] }
  | { bloco: null; recusa: RecusaDeBloco; avisos: string[] }

function aplicarPrefixo(linhas: string[], prefixo: string | undefined): string[] {
  if (!prefixo || linhas.length === 0) return linhas
  const primeira = linhas[0]
  return primeira.startsWith(prefixo.trim()) ? linhas : [`${prefixo}${primeira}`, ...linhas.slice(1)]
}

export interface DestaqueDoBloco {
  estilo: EstiloDeDestaque
  /** Trechos por linha, em offsets da linha SEM prefixo e sem colchetes. */
  trechosPorLinha: TrechoDestacado[][]
}

/** A camada de texto de um papel, ainda sem posição (x/y = 0). */
export function camadaDoPapel(args: {
  papel: Papel
  /** Id e nome da camada — o papel, ou `servico-2` quando o arranjo tem dois textos do mesmo papel. */
  id?: string
  /** As linhas JÁ sem colchetes. */
  linhas: string[]
  estilo: EstiloDePapel
  escala: number
  width: number
  textAlign: 'left' | 'center' | 'right'
  groupId: string
  corDaMancha: string
  destaque?: DestaqueDoBloco | null
}): Layer {
  const { estilo } = args
  const fontSize = Math.max(8, Math.round(estilo.fontSize * args.escala))
  // `undefined` = a assinatura não disse nada (default da casa); `null` = a
  // página de assinatura está SEM sombra, e a peça respeita.
  const sombra = estilo.sombra === undefined ? { color: args.corDaMancha, blur: 10, offsetY: 1, opacity: 0.65 } : estilo.sombra
  const linhasFinais = aplicarPrefixo(args.linhas, estilo.prefixo)
  const conteudo = linhasFinais.join('\n')
  const id = args.id ?? args.papel
  const camada: Layer = {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 0,
    isDynamic: true,
    position: { x: 0, y: 0 },
    size: { width: Math.round(args.width), height: fontSize },
    rotation: 0,
    content: conteudo,
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
    effects: sombra
      ? {
          shadow: {
            enabled: true,
            shadowColor: sombra.color,
            shadowBlur: sombra.blur,
            shadowOffsetX: 0,
            shadowOffsetY: sombra.offsetY,
            shadowOpacity: sombra.opacity,
          },
        }
      : {},
    metadata: { groupId: args.groupId, compositor: { papel: args.papel } },
  }

  const trechosPorLinha = args.destaque?.trechosPorLinha ?? []
  if (!args.destaque || trechosPorLinha.every((t) => !t || t.length === 0)) return camada

  // Offsets no conteúdo FINAL: o prefixo empurra a primeira linha, e cada
  // quebra de linha conta um caractere.
  const deslocamentoDoPrefixo = Math.max(0, (linhasFinais[0]?.length ?? 0) - (args.linhas[0]?.length ?? 0))
  const trechos: TrechoDestacado[] = []
  let inicioDaLinha = 0
  linhasFinais.forEach((linha, i) => {
    const extra = i === 0 ? deslocamentoDoPrefixo : 0
    for (const t of trechosPorLinha[i] ?? []) trechos.push({ inicio: inicioDaLinha + extra + t.inicio, fim: inicioDaLinha + extra + t.fim })
    inicioDaLinha += linha.length + 1
  })
  return {
    ...camada,
    type: 'rich-text',
    richTextStyles: estilosDoRichText({ conteudo, trechos, destaque: args.destaque.estilo, sombra: sombra ?? null }),
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

/** Quanto os trechos destacados alargam a linha quando ganham a família mais pesada. */
function larguraExtraDoDestaque(medir: MeasureTextBox, base: Layer, linha: string, trechos: TrechoDestacado[], familia: string | undefined, colunaUtil: number): number {
  if (!familia || familia === base.style?.fontFamily || trechos.length === 0) return 0
  const pesada: Layer = { ...base, style: { ...(base.style ?? {}), fontFamily: familia, fontWeight: undefined } }
  let extra = 0
  for (const t of trechos) {
    const trecho = linha.slice(t.inicio, t.fim)
    if (!trecho.trim()) continue
    const normal = medirLinha(medir, base, trecho, colunaUtil)
    const destacado = medirLinha(medir, pesada, trecho, colunaUtil)
    if (normal && destacado) extra += Math.max(0, destacado.largura - normal.largura)
  }
  return extra
}

/**
 * Monta o bloco de um papel. `colunaUtil` é a largura entre as margens
 * (menos a largura máxima do papel, quando a assinatura a limita).
 */
export function montarBloco(args: {
  papel: Papel
  /** Id da camada; ausente = o papel. */
  id?: string
  /** As linhas como vieram da copy — podem trazer [colchetes]. */
  linhas: string[]
  estilo: EstiloDePapel
  escalaDoFormato: number
  colunaUtil: number
  textAlign: 'left' | 'center' | 'right'
  groupId: string
  corDaMancha: string
  medir: MeasureTextBox
  /** O estilo de destaque da marca para este papel; sem ele, [colchetes] saem como texto comum. */
  destaque?: EstiloDeDestaque | null
}): ResultadoDoBloco {
  const avisos: string[] = []
  const lidas = args.linhas.map(lerDestaques)
  for (const l of lidas) {
    if (l.problema) avisos.push(`${args.papel}: ${l.problema} em "${l.texto}" — o trecho saiu sem destaque`)
  }
  const linhasLimpas = lidas.map((l) => l.texto)
  const pediuDestaque = lidas.some((l) => l.trechos.length > 0)
  const temEstilo = Boolean(args.destaque && Object.values(args.destaque).some(Boolean))
  const destaque: DestaqueDoBloco | null = pediuDestaque && temEstilo ? { estilo: args.destaque!, trechosPorLinha: lidas.map((l) => l.trechos) } : null
  if (pediuDestaque && !temEstilo) {
    avisos.push(`${args.papel}: a copy marcou destaque, mas a marca não tem estilo de destaque (página de assinatura ou Project.assinatura.destaque) — saiu sem destaque`)
  }

  const coluna = Math.floor(args.colunaUtil * (args.estilo.larguraMaxima ?? 1))
  const linhas = aplicarPrefixo(linhasLimpas, args.estilo.prefixo)
  const semDestaque = { ...args, linhas: linhasLimpas, destaque: null }

  for (let escala = args.escalaDoFormato; escala >= args.escalaDoFormato * PISO_DE_ESCALA - 1e-9; escala -= PASSO_DE_ESCALA) {
    const base = camadaDoPapel({ ...semDestaque, escala, width: coluna + PADDING_DE_DESENHO * 2 })
    let larguraMaxima = 0
    let cabe = true
    linhas.forEach((linha, i) => {
      const m = medirLinha(args.medir, base, linha, coluna)
      if (!m) return
      const extra = destaque ? larguraExtraDoDestaque(args.medir, base, linhasLimpas[i], destaque.trechosPorLinha[i] ?? [], destaque.estilo.fontFamily, coluna) : 0
      const largura = m.largura + extra
      larguraMaxima = Math.max(larguraMaxima, largura)
      if (largura > coluna || m.linhas > 1) cabe = false
    })
    if (!cabe) continue

    const width = Math.min(coluna, Math.ceil(larguraMaxima)) + PADDING_DE_DESENHO * 2 + 2
    const simples = camadaDoPapel({ ...semDestaque, escala, width })
    // A medida é sempre a do texto SIMPLES: o medidor do servidor não mede rich
    // text, e o destaque não muda corpo nem entrelinha — a altura é a mesma.
    const medida = args.medir(simples)
    // A caixa gravada é a altura MEDIDA (ceil, nunca round — o Konva descarta
    // a linha inteira que não cabe por fração de pixel).
    const height = medida ? Math.ceil(medida.height) : simples.size.height * linhas.length
    const layer = destaque ? camadaDoPapel({ ...args, linhas: linhasLimpas, escala, width, destaque }) : simples
    return {
      bloco: {
        papel: args.papel,
        layer: { ...layer, size: { width, height } },
        width,
        height,
        escala: Number((escala / args.escalaDoFormato).toFixed(3)),
        cor: args.estilo.color,
        destacado: Boolean(destaque),
      },
      recusa: null,
      avisos,
    }
  }

  // Nada coube nem a 80%: devolve o orçamento medido no tamanho de assinatura.
  const base = camadaDoPapel({ ...semDestaque, escala: args.escalaDoFormato, width: coluna + PADDING_DE_DESENHO * 2 })
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
  return { bloco: null, recusa: { papel: args.papel, orcamento }, avisos }
}

/** Vão vertical entre dois papéis consecutivos (o ritmo do `gerar.py`). */
export function vaoEntre(anterior: Papel | null, proximo: Papel, gapPadrao: number): number {
  if (!anterior) return 0
  // A segunda voz encosta na primeira: é o mesmo lockup.
  if (proximo === 'headline2') return 0
  if (proximo === 'headline') return Math.round(gapPadrao * 0.5)
  if (proximo === 'cta') return Math.round(gapPadrao * 1.3)
  if (proximo === 'servico') return Math.round(gapPadrao * 1.6)
  return gapPadrao
}

export interface PilhaDeBlocos {
  /** Largura do conjunto, contando o que os elementos passam da coluna de tinta. */
  width: number
  /** Altura do conjunto, contando o elemento acima do primeiro texto e abaixo do último. */
  height: number
  /** O topo de cada bloco dentro do conjunto (px). */
  offsets: number[]
  /** Quanto os elementos passam da coluna de tinta à esquerda e à direita (px). */
  esquerda: number
  direita: number
  /** O recuo de cada bloco a partir da borda de alinhamento (px), no `lado` pedido. Ausente = todos rentes. */
  recuos?: number[]
  lado?: 'esquerda' | 'direita'
}

/**
 * Empilha os blocos (já com largura/altura) e devolve a caixa do conjunto. O
 * vão antes de cada bloco é o do arranjo quando ele o traz, e o ritmo da casa
 * quando não; os elementos presos aos textos entram na caixa.
 *
 * Com `lado`, o RECUO que o arranjo desenhou entra na conta: cada texto começa
 * `recuo` px para dentro da borda em que o grupo alinha, e o ícone que mora no
 * recuo (ao lado da linha de serviço) já não empurra a coluna inteira para
 * dentro. Sem nenhum recuo, a pilha sai exatamente como sem `lado`.
 */
export function empilhar(blocos: BlocoMontado[], gapPadrao: number, lado?: 'esquerda' | 'direita'): PilhaDeBlocos {
  const extensoes = blocos.map((b) =>
    b.elementos?.length
      ? extensoesDosElementos(
          b.elementos,
          { width: Math.max(1, b.width - 2 * PADDING_DE_DESENHO - 2), height: b.height },
          b.escalaDosElementos ?? 1,
        )
      : { esquerda: 0, direita: 0, topo: 0, base: 0 },
  )
  let y = extensoes[0]?.topo ?? 0
  let anterior: Papel | null = null
  const offsets: number[] = []
  let largura = 0
  let esquerda = 0
  let direita = 0
  blocos.forEach((b, i) => {
    if (i > 0) y += typeof b.vaoAntes === 'number' ? b.vaoAntes : vaoEntre(anterior, b.papel, gapPadrao)
    offsets.push(y)
    y += b.height
    largura = Math.max(largura, b.width)
    esquerda = Math.max(esquerda, extensoes[i].esquerda)
    direita = Math.max(direita, extensoes[i].direita)
    anterior = b.papel
  })
  const base = extensoes[extensoes.length - 1]?.base ?? 0
  const height = Math.ceil(y + base)
  const recuos = blocos.map((b) => (lado ? Math.max(0, Math.round(b.recuo ?? 0)) : 0))
  if (!lado || recuos.every((r) => r === 0)) {
    return { width: Math.ceil(largura + esquerda + direita), height, offsets, esquerda: Math.ceil(esquerda), direita: Math.ceil(direita) }
  }
  // Medido a partir da borda de alinhamento, crescendo para dentro da coluna: o
  // texto ocupa [recuo, recuo + largura], e os elementos passam dele para fora
  // (o lado da borda) e para dentro.
  const paraFora = (i: number) => (lado === 'esquerda' ? extensoes[i].esquerda : extensoes[i].direita)
  const paraDentro = (i: number) => (lado === 'esquerda' ? extensoes[i].direita : extensoes[i].esquerda)
  const conteudo = Math.max(...blocos.map((b, i) => recuos[i] + b.width))
  const sobraFora = Math.max(0, ...blocos.map((_, i) => paraFora(i) - recuos[i]))
  const sobraDentro = Math.max(0, ...blocos.map((b, i) => recuos[i] + b.width + paraDentro(i) - conteudo))
  return {
    width: Math.ceil(sobraFora + conteudo + sobraDentro),
    height,
    offsets,
    esquerda: Math.ceil(lado === 'esquerda' ? sobraFora : sobraDentro),
    direita: Math.ceil(lado === 'esquerda' ? sobraDentro : sobraFora),
    recuos,
    lado,
  }
}
