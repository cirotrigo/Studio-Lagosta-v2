/**
 * As margens de `margensDoEditor` nas formas que o EDITOR consome (L1 das linhas-guia, 29/10/2026) — módulo puro,
 * sem Konva: os retângulos invisíveis do encaixe ao arrastar, as paradas do encaixe no redimensionar, as linhas azuis
 * da margem da marca, as faixas hachuradas da interface e as distâncias por eixo do "alinhar". Uma conversão só,
 * testada, para o stage, o transformer e o contexto não refazerem a conta cada um do seu jeito.
 */
import type { Layer } from '@/types/template'
import { margensDoEditor, type FaixasDaInterface, type LinhasDaMarca, type MargensDoEditor } from './canvas-margin'
import { formatoDaPaginaGravada } from './compositor/formato'
import { ajusteParaDentro, limitesDaFaixa, type AjusteParaDentro } from './creatives/revisao/para-dentro'
import type { RectInfo } from './konva-smart-guides'

/**
 * As margens da página aberta: o formato sai do TAMANHO do canvas (`formatoDaPaginaGravada`, a decisão única — a
 * máscara M segue `interface !== null`, nunca outra razão de tela) e a assinatura é o JSON cru de `Project.assinatura`.
 */
export function margensDaPagina(assinatura: unknown, canvas: { width: number; height: number }): MargensDoEditor {
  return margensDoEditor({ formato: formatoDaPaginaGravada(canvas), assinatura, largura: canvas.width, altura: canvas.height })
}

/** As quatro linhas da marca como "objetos" de largura ou altura zero: o encaixe ao arrastar gruda nelas. */
export function retangulosDeEncaixe(marca: LinhasDaMarca, largura: number, altura: number): RectInfo[] {
  return [
    { id: 'margin-left', x: marca.esquerda, y: 0, width: 0, height: altura },
    { id: 'margin-right', x: marca.direita, y: 0, width: 0, height: altura },
    { id: 'margin-top', x: 0, y: marca.topo, width: largura, height: 0 },
    { id: 'margin-bottom', x: 0, y: marca.base, width: largura, height: 0 },
  ]
}

/** As paradas do encaixe no redimensionar: x das linhas verticais, y das horizontais. */
export function paradasDeEncaixe(marca: LinhasDaMarca): { v: number[]; h: number[] } {
  return { v: [marca.esquerda, marca.direita], h: [marca.topo, marca.base] }
}

/** As linhas azuis tracejadas, prontas para `<Line points>`. */
export function linhasDaMarca(marca: LinhasDaMarca, largura: number, altura: number): Array<{ id: string; points: [number, number, number, number] }> {
  return [
    { id: 'margem-esquerda', points: [marca.esquerda, 0, marca.esquerda, altura] },
    { id: 'margem-direita', points: [marca.direita, 0, marca.direita, altura] },
    { id: 'margem-topo', points: [0, marca.topo, largura, marca.topo] },
    { id: 'margem-base', points: [0, marca.base, largura, marca.base] },
  ]
}

/** As faixas da interface do Instagram (só Story): a de cima e a de baixo, prontas para `<Rect>`. Vazio fora do Story. */
export function faixasDaInterface(faixa: FaixasDaInterface | null, largura: number, altura: number): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  if (!faixa) return []
  return [
    { id: 'interface-topo', x: 0, y: 0, width: largura, height: faixa.topo },
    { id: 'interface-rodape', x: 0, y: altura - faixa.rodape, width: largura, height: faixa.rodape },
  ]
}

/** As DISTÂNCIAS das bordas num eixo (o que `alignToCanvas` usa): `x` → esquerda/direita, `y` → topo/base. */
export function margensDoEixo(marca: LinhasDaMarca, axis: 'x' | 'y', largura: number, altura: number): { start: number; end: number } {
  return axis === 'x' ? { start: marca.esquerda, end: largura - marca.direita } : { start: marca.topo, end: altura - marca.base }
}

// ─── L3: encaixe pela seleção inteira, resize proporcional e "Trazer para dentro" ───────────────────────────────────

const caixaDaCamada = (l: Layer): RectInfo => ({
  id: l.id,
  x: l.position?.x ?? 0,
  y: l.position?.y ?? 0,
  width: Math.max(1, l.size?.width ?? 0),
  height: Math.max(1, l.size?.height ?? 0),
})

/** A caixa que envolve a seleção VISÍVEL inteira (o encaixe move o conjunto, não só a camada agarrada); `null` sem camada visível. */
export function caixaDaSelecao(layers: Layer[], ids: readonly string[]): RectInfo | null {
  const caixas = layers.filter((l) => ids.includes(l.id) && l.visible !== false).map(caixaDaCamada)
  if (caixas.length === 0) return null
  const x0 = Math.min(...caixas.map((c) => c.x))
  const y0 = Math.min(...caixas.map((c) => c.y))
  const x1 = Math.max(...caixas.map((c) => c.x + c.width))
  const y1 = Math.max(...caixas.map((c) => c.y + c.height))
  return { id: 'selecao', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** As caixas em que a seleção encaixa: as VISÍVEIS que não estão na seleção (a posição antiga do próprio grupo não é alvo). */
export function retangulosDosOutros(layers: Layer[], excluir: readonly string[]): RectInfo[] {
  return layers.filter((l) => !excluir.includes(l.id) && l.visible !== false).map(caixaDaCamada)
}

export interface CaixaDoResize {
  x: number
  y: number
  width: number
  height: number
}

/**
 * O encaixe do resize com PROPORÇÃO TRAVADA (foto, logo, elemento): o canto arrastado encaixa no eixo em que mais
 * anda; o outro eixo segue a proporção da caixa antiga, com o canto oposto (a âncora) parado. `null` = nada a encaixar.
 */
export function encaixeProporcional(
  antiga: CaixaDoResize,
  nova: CaixaDoResize,
  paradas: { v: number[]; h: number[] },
  threshold: number,
  eps = 0.5,
): { caixa: CaixaDoResize; guia: { orientation: 'vertical' | 'horizontal'; position: number; snapType: 'start' | 'end' } } | null {
  if (antiga.width <= 0 || antiga.height <= 0) return null
  const razao = antiga.width / antiga.height
  const esquerdaAnda = Math.abs(nova.x - antiga.x) > eps
  const direitaAnda = Math.abs(nova.x + nova.width - (antiga.x + antiga.width)) > eps
  const topoAnda = Math.abs(nova.y - antiga.y) > eps
  const baseAnda = Math.abs(nova.y + nova.height - (antiga.y + antiga.height)) > eps
  const andaX = esquerdaAnda !== direitaAnda ? Math.abs(nova.width - antiga.width) : 0
  const andaY = topoAnda !== baseAnda ? Math.abs(nova.height - antiga.height) : 0
  if (andaX === 0 && andaY === 0) return null
  const maisPerto = (valor: number, stops: number[]): number | null => {
    let melhor: number | null = null
    let dif = threshold
    for (const s of stops) {
      if (Math.abs(s - valor) < dif) {
        dif = Math.abs(s - valor)
        melhor = s
      }
    }
    return melhor
  }
  // Quem mais anda decide; o outro eixo acompanha pela proporção
  if (andaX >= andaY) {
    const borda = direitaAnda ? nova.x + nova.width : nova.x
    const parada = maisPerto(borda, paradas.v)
    if (parada === null) return null
    const width = direitaAnda ? parada - nova.x : nova.x + nova.width - parada
    if (width <= 0) return null
    const height = width / razao
    const x = direitaAnda ? nova.x : parada
    // a âncora vertical é a borda que NÃO anda (base quando o topo anda; topo caso contrário)
    const y = topoAnda && !baseAnda ? nova.y + nova.height - height : nova.y
    return { caixa: { x, y, width, height }, guia: { orientation: 'vertical', position: parada, snapType: direitaAnda ? 'end' : 'start' } }
  }
  const borda = baseAnda ? nova.y + nova.height : nova.y
  const parada = maisPerto(borda, paradas.h)
  if (parada === null) return null
  const height = baseAnda ? parada - nova.y : nova.y + nova.height - parada
  if (height <= 0) return null
  const width = height * razao
  const y = baseAnda ? nova.y : parada
  const x = esquerdaAnda && !direitaAnda ? nova.x + nova.width - width : nova.x
  return { caixa: { x, y, width, height }, guia: { orientation: 'horizontal', position: parada, snapType: baseAnda ? 'end' : 'start' } }
}

/** Os tipos que o aviso de margem vigia: foto, vídeo e gradiente podem passar por baixo (foto sangra de propósito). */
const VIGIADOS_NA_MARGEM = new Set<Layer['type']>(['text', 'rich-text', 'logo', 'element', 'shape', 'icon'])
/** Na faixa da interface só texto e logo não entram (D2). */
const VIGIADOS_NA_FAIXA = new Set<Layer['type']>(['text', 'rich-text', 'logo'])

export interface AvisoDeMargem {
  layerId: string
  nome: string
  /** `margem` = cruza a margem da marca; `interface` = texto ou logo dentro da faixa do Instagram. */
  tipo: 'margem' | 'interface'
  caixa: RectInfo
  ajuste: AjusteParaDentro
}

/**
 * Os avisos de "fora da margem" da página (L3): pela CAIXA da camada (sem rotação — a girada avisa pela caixa reta,
 * limite registrado), só nas visíveis. Avisa, nunca bloqueia; o botão move `ajuste.dx/dy`. Uma camada com os dois
 * problemas sai com o da interface (o mais grave) e o ajuste dele já a tira da faixa.
 */
export function avisosDeMargem(layers: Layer[], margens: MargensDoEditor, altura: number): AvisoDeMargem[] {
  const avisos: AvisoDeMargem[] = []
  for (const l of layers) {
    if (l.visible === false || !VIGIADOS_NA_MARGEM.has(l.type)) continue
    const caixa = caixaDaCamada(l)
    const naFaixa = margens.interface && VIGIADOS_NA_FAIXA.has(l.type) ? ajusteParaDentro(caixa, limitesDaFaixa(caixa, margens.interface, altura)) : null
    // Texto e logo no Story respeitam a faixa E a margem: o ajuste é contra a mais apertada das duas em cada lado, para
    // UM clique resolver as duas (na Wine, topo 200 da marca × 188 da faixa — sair da faixa ainda deixava fora da margem)
    const lim =
      naFaixa && margens.interface
        ? { ...margens.marca, topo: Math.max(margens.marca.topo, margens.interface.topo), base: Math.min(margens.marca.base, altura - margens.interface.rodape) }
        : margens.marca
    const a = ajusteParaDentro(caixa, lim)
    if (a.lados.length === 0) continue
    avisos.push({ layerId: l.id, nome: l.name, tipo: naFaixa && naFaixa.lados.length > 0 ? 'interface' : 'margem', caixa, ajuste: a })
  }
  return avisos
}
