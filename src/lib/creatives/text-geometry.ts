/**
 * Validação geométrica das camadas de texto — determinística, sem IA.
 *
 * Mede a caixa REAL de cada texto (mesma quebra e fonte do render, via
 * RenderEngine.measureTextLayerBox) e aponta:
 *  - overflow: o texto não cabe na caixa gravada (altura ou largura);
 *  - colisão: os GLIFOS de duas camadas de texto se sobrepõem;
 *  - fora-da-area-segura: texto invade as margens do story (CANVAS_MARGIN,
 *    as guias azuis do editor).
 *
 * Duas sutilezas aprendidas no repro do By Rock (template 140, Layout 2):
 *  - As CAIXAS de um template podem se interceptar por design (Subtitulo
 *    h=100 sobre Rodape-1) e funcionar, porque o conteúdo original é 1 linha.
 *    Por isso a colisão compara a área dos GLIFOS (descontado o padding de 6px
 *    do desenho), com tolerância — comparar caixas gravadas dispararia falso
 *    positivo em todo render do template.
 *  - O reflow pós-preenchimento CRESCE a caixa do texto solto (autoExpand):
 *    o problema não aparece como overflow da própria caixa, e sim como
 *    colisão com a camada de baixo.
 *
 * As fontes do projeto PRECISAM estar registradas antes de medir.
 */
import type { Layer } from '@/types/template'
import { CANVAS_MARGIN } from '@/lib/canvas-margin'

export type MeasureTextBox = (layer: Layer) => {
  height: number
  maxLineWidth: number
  lineCount: number
  /** Folga entre a caixa-fórmula e a tinta real dos glifos (borda de cima/baixo). */
  inkTopSlack?: number
  inkBottomSlack?: number
} | null

export interface TextGeometryIssue {
  tipo: 'overflow' | 'colisao' | 'fora-da-area-segura'
  /** Nomes das camadas envolvidas (1 para overflow/safe-area, 2 para colisão). */
  camadas: string[]
  layerIds: string[]
  /** Magnitude em px — o quanto estoura/sobrepõe. Métrica da autocorreção. */
  px: number
  detalhe: string
}

export interface TextLayerMetrics {
  layerId: string
  name: string
  /** Caixa gravada na camada. */
  box: { x: number; y: number; width: number; height: number }
  /** Extensão real do texto (quebra na largura da caixa, sem corte). */
  realHeight: number
  maxLineWidth: number
  lineCount: number
  /** Faixa vertical ocupada pelos glifos (descontado o padding do desenho). */
  glyphTop: number
  glyphBottom: number
  fontSize: number
  /** Altura de UM line-box (fontSize × lineHeight) — base do truncamento do render. */
  lineBox: number
  /** Com autoExpand o render desenha além da caixa; sem, trunca por linhas inteiras. */
  autoExpand: boolean
}

/** Padding interno do desenho de texto do render-engine. */
export const TEXT_DRAW_PADDING = 6

const OVERFLOW_TOLERANCE_PX = 2
const COLLISION_TOLERANCE_PX = 4
const SAFE_AREA_TOLERANCE_PX = 2

function isMeasurableText(layer: Layer): boolean {
  return layer.type === 'text' && layer.visible !== false
}

export function measureTextLayers(layers: Layer[], measure: MeasureTextBox): TextLayerMetrics[] {
  const metrics: TextLayerMetrics[] = []
  for (const layer of layers) {
    if (!isMeasurableText(layer)) continue
    const measured = measure(layer)
    if (!measured) continue
    const x = layer.position?.x ?? 0
    const y = layer.position?.y ?? 0
    const width = layer.size?.width ?? 0
    const height = layer.size?.height ?? 0
    metrics.push({
      layerId: layer.id,
      name: layer.name ?? layer.id,
      box: { x, y, width, height },
      realHeight: measured.height,
      maxLineWidth: measured.maxLineWidth,
      lineCount: measured.lineCount,
      // Tinta real, não caixa-fórmula: headline empilhado tem caixas que se
      // tocam por design e só a folga dos glifos evita o falso positivo.
      glyphTop: y + TEXT_DRAW_PADDING + (measured.inkTopSlack ?? 0),
      glyphBottom: y + measured.height - TEXT_DRAW_PADDING - (measured.inkBottomSlack ?? 0),
      fontSize: (layer.style?.fontSize as number | undefined) ?? 16,
      lineBox:
        ((layer.style?.fontSize as number | undefined) ?? 16) *
        (layer.textboxConfig?.autoWrap?.lineHeight ?? layer.style?.lineHeight ?? 1.2),
      autoExpand: layer.textboxConfig?.autoWrap?.autoExpand === true,
    })
  }
  return metrics
}

/**
 * Roda os checks sobre as métricas. Ordem de severidade no retorno:
 * colisão > overflow > área segura.
 */
export function checkTextGeometry(
  layers: Layer[],
  canvas: { width: number; height: number },
  measure: MeasureTextBox,
): { issues: TextGeometryIssue[]; metricas: TextLayerMetrics[] } {
  const metricas = measureTextLayers(layers, measure)
  const colisoes: TextGeometryIssue[] = []
  const overflows: TextGeometryIssue[] = []
  const foraDaArea: TextGeometryIssue[] = []

  // a) overflow da própria caixa (vertical e horizontal). O critério vertical
  //    é PARIDADE COM O TRUNCAMENTO do render: sem autoExpand, ele descarta
  //    linhas inteiras que não cabem (floor(altura/lineBox)) — caixa um pouco
  //    menor que a fórmula com a MESMA contagem de linhas desenha certinho e
  //    não é defeito (o modelo Domingo do By Rock é assim por design). Com
  //    autoExpand não há truncamento: o dano possível é colisão/área segura,
  //    já cobertos pelos outros checks.
  for (const m of metricas) {
    const linhasQueCabem = Math.max(1, Math.floor((m.box.height + 0.001) / m.lineBox))
    const linhasCortadas = m.autoExpand ? 0 : m.lineCount - linhasQueCabem
    if (linhasCortadas > 0) {
      overflows.push({
        tipo: 'overflow',
        camadas: [m.name],
        layerIds: [m.layerId],
        px: Math.round(linhasCortadas * m.lineBox),
        detalhe: `${m.name} tem ${m.lineCount} linha${m.lineCount > 1 ? 's' : ''} mas a caixa só mostra ${linhasQueCabem} — ${linhasCortadas} linha${linhasCortadas > 1 ? 's seriam cortadas' : ' seria cortada'} no render`,
      })
    }
    const larguraUtil = m.box.width - TEXT_DRAW_PADDING * 2
    const estouroH = m.maxLineWidth - larguraUtil
    if (estouroH > OVERFLOW_TOLERANCE_PX) {
      overflows.push({
        tipo: 'overflow',
        camadas: [m.name],
        layerIds: [m.layerId],
        px: Math.round(estouroH),
        detalhe: `${m.name} tem linha de ${Math.ceil(m.maxLineWidth)}px numa caixa de ${Math.round(larguraUtil)}px úteis (palavra indivisível transborda)`,
      })
    }
  }

  // b) colisão glifo-a-glifo entre camadas de texto. A tolerância vertical
  //    escala com o corpo: em headline grande, ponta de cedilha e ascendente
  //    ocupam o mesmo RETÂNGULO sem os pixels se tocarem (estão em x
  //    diferentes) — 11px de interseção em fs77 é roçar de pontas, 25px em
  //    fs38 é texto sobre texto.
  for (let i = 0; i < metricas.length; i++) {
    for (let j = i + 1; j < metricas.length; j++) {
      const a = metricas[i]
      const b = metricas[j]
      const overlapV =
        Math.min(a.glyphBottom, b.glyphBottom) - Math.max(a.glyphTop, b.glyphTop)
      const overlapH =
        Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x)
      const toleranciaV = Math.max(COLLISION_TOLERANCE_PX, 0.18 * Math.max(a.fontSize, b.fontSize))
      if (overlapV > toleranciaV && overlapH > COLLISION_TOLERANCE_PX) {
        colisoes.push({
          tipo: 'colisao',
          camadas: [a.name, b.name],
          layerIds: [a.layerId, b.layerId],
          px: Math.round(overlapV),
          detalhe: `${a.name} e ${b.name} se sobrepõem em ${Math.round(overlapV)}px na vertical`,
        })
      }
    }
  }

  // c) área segura do story (margens assimétricas das guias do editor),
  //    escaladas pela largura do canvas. Só texto: logo na borda é decisão de
  //    layout, não defeito.
  const escala = canvas.width / 1080
  const limites = {
    top: CANVAS_MARGIN.top * escala,
    bottom: canvas.height - CANVAS_MARGIN.bottom * escala,
    left: CANVAS_MARGIN.left * escala,
    right: canvas.width - CANVAS_MARGIN.right * escala,
  }
  for (const m of metricas) {
    const excessos: string[] = []
    let maiorExcesso = 0
    if (m.glyphTop < limites.top - SAFE_AREA_TOLERANCE_PX) {
      excessos.push('topo')
      maiorExcesso = Math.max(maiorExcesso, limites.top - m.glyphTop)
    }
    if (m.glyphBottom > limites.bottom + SAFE_AREA_TOLERANCE_PX) {
      excessos.push('base')
      maiorExcesso = Math.max(maiorExcesso, m.glyphBottom - limites.bottom)
    }
    if (m.box.x < limites.left - SAFE_AREA_TOLERANCE_PX) {
      excessos.push('esquerda')
      maiorExcesso = Math.max(maiorExcesso, limites.left - m.box.x)
    }
    if (m.box.x + m.box.width > limites.right + SAFE_AREA_TOLERANCE_PX) {
      excessos.push('direita')
      maiorExcesso = Math.max(maiorExcesso, m.box.x + m.box.width - limites.right)
    }
    if (excessos.length > 0) {
      foraDaArea.push({
        tipo: 'fora-da-area-segura',
        camadas: [m.name],
        layerIds: [m.layerId],
        px: Math.round(maiorExcesso),
        detalhe: `${m.name} invade a margem de segurança (${excessos.join(', ')}) em ${Math.round(maiorExcesso)}px`,
      })
    }
  }

  return { issues: [...colisoes, ...overflows, ...foraDaArea], metricas }
}
