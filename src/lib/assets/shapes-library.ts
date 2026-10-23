/**
 * Biblioteca de formas do editor.
 *
 * Formas novas entram como `shapeType: 'svg-path'` com `pathData` normalizado
 * em viewBox 0 0 100 100 — uma forma nova é UMA entrada de dados, sem case
 * novo no editor nem no render (os dois lados desenham o path escalado para a
 * caixa da camada; ver ShapeNode e RenderEngine.renderShape).
 *
 * Os sete tipos legados (rectangle/circle/…) continuam existindo para as
 * camadas antigas já persistidas.
 */
import type { PapelDaMarca } from '@/lib/brand/papeis-de-cor'
import type { SlotDeCor } from '@/lib/vetor/tipos'

export interface ShapeDefinition {
  id: string
  label: string
  shapeType: 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line' | 'svg-path'
  category: 'basicas' | 'setas' | 'linhas' | 'decorativas'
  keywords?: string[]
  fill: string
  strokeColor?: string
  strokeWidth?: number
  /** SVG path d em viewBox 0 0 100 100 (apenas shapeType 'svg-path') */
  pathData?: string
  pathFillRule?: 'nonzero' | 'evenodd'
  /** Apenas shapeType 'line' */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  lineStartCap?: 'none' | 'arrow'
  lineEndCap?: 'none' | 'arrow'
  /** Proporção sugerida ao inserir (largura/altura). Default 1. */
  aspect?: number
  /** Versão do desenho: muda quando o desenho muda (a camada guarda a que copiou, `style.vetor.asset`). */
  versao?: number
  /** `travado`: a proporção fica presa ao redimensionar (`style.manterProporcao`); `livre`: estica (fio, moldura). */
  ajuste?: 'travado' | 'livre'
  /** Os canais de cor do item, com o papel da marca de cada um na inserção (CP-V2b; a inserção é do V2c). */
  slots?: SlotDeCor[]
  /** Pontas do traço (`style.tracoPontas`). Apenas shapeType 'svg-path'. */
  tracoPontas?: 'butt' | 'round'
  /** Raio do canto em px (`style.border.radius`); os dois renderers o limitam a min(largura, altura) / 2. */
  raio?: number
}

const AZUL = '#2563eb'
const CINZA = '#374151'

export const SHAPES_LIBRARY: ShapeDefinition[] = [
  // ── Básicas (legadas + novas) ───────────────────────────────────────────
  { id: 'rectangle', label: 'Retângulo', shapeType: 'rectangle', category: 'basicas', keywords: ['quadrado', 'caixa'], fill: AZUL },
  { id: 'rounded', label: 'Retângulo Arredondado', shapeType: 'rounded-rectangle', category: 'basicas', keywords: ['caixa', 'cartao'], fill: AZUL },
  { id: 'circle', label: 'Círculo', shapeType: 'circle', category: 'basicas', keywords: ['bola', 'redondo'], fill: AZUL },
  { id: 'triangle', label: 'Triângulo', shapeType: 'triangle', category: 'basicas', fill: AZUL },
  { id: 'star', label: 'Estrela', shapeType: 'star', category: 'basicas', keywords: ['favorito'], fill: AZUL },
  { id: 'diamond', label: 'Losango', shapeType: 'svg-path', category: 'basicas', keywords: ['diamante'], fill: AZUL, pathData: 'M50 0 L100 50 L50 100 L0 50 Z' },
  { id: 'pentagon', label: 'Pentágono', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M50 0 L97.6 34.5 L79.4 90.5 L20.6 90.5 L2.4 34.5 Z' },
  { id: 'hexagon', label: 'Hexágono', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z' },
  { id: 'octagon', label: 'Octógono', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M29 0 H71 L100 29 V71 L71 100 H29 L0 71 V29 Z' },
  { id: 'trapezoid', label: 'Trapézio', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M20 0 H80 L100 100 H0 Z' },
  { id: 'parallelogram', label: 'Paralelogramo', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M25 0 H100 L75 100 H0 Z' },
  { id: 'semicircle', label: 'Semicírculo', shapeType: 'svg-path', category: 'basicas', keywords: ['meia lua', 'arco'], fill: AZUL, pathData: 'M0 100 A50 50 0 0 1 100 100 Z', aspect: 2 },
  { id: 'ring', label: 'Anel', shapeType: 'svg-path', category: 'basicas', keywords: ['circulo vazado', 'donut'], fill: AZUL, pathFillRule: 'evenodd', pathData: 'M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M50 25 A25 25 0 1 1 50 75 A25 25 0 1 1 50 25 Z' },
  { id: 'cross', label: 'Cruz', shapeType: 'svg-path', category: 'basicas', keywords: ['mais', 'soma'], fill: AZUL, pathData: 'M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z' },

  // ── Setas ───────────────────────────────────────────────────────────────
  { id: 'arrow', label: 'Seta (fina)', shapeType: 'arrow', category: 'setas', fill: CINZA, aspect: 1.8 },
  { id: 'arrow-right', label: 'Seta direita', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M0 35 H60 V15 L100 50 L60 85 V65 H0 Z', aspect: 1.6 },
  { id: 'arrow-left', label: 'Seta esquerda', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M100 35 H40 V15 L0 50 L40 85 V65 H100 Z', aspect: 1.6 },
  { id: 'arrow-up', label: 'Seta cima', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M35 100 V40 H15 L50 0 L85 40 H65 V100 Z', aspect: 0.7 },
  { id: 'arrow-down', label: 'Seta baixo', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M35 0 V60 H15 L50 100 L85 60 H65 V0 Z', aspect: 0.7 },
  { id: 'chevron-right', label: 'Chevron', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M0 0 H60 L100 50 L60 100 H0 L40 50 Z', aspect: 1.4 },

  // ── Linhas ──────────────────────────────────────────────────────────────
  { id: 'line', label: 'Linha', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, aspect: 6 },
  { id: 'line-dashed', label: 'Linha tracejada', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineStyle: 'dashed', aspect: 6 },
  { id: 'line-dotted', label: 'Linha pontilhada', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineStyle: 'dotted', aspect: 6 },
  { id: 'line-arrow', label: 'Linha com seta', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineEndCap: 'arrow', aspect: 6 },
  { id: 'line-arrow-both', label: 'Linha com 2 setas', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineStartCap: 'arrow', lineEndCap: 'arrow', aspect: 6 },

  // ── Decorativas ─────────────────────────────────────────────────────────
  { id: 'heart', label: 'Coração', shapeType: 'svg-path', category: 'decorativas', keywords: ['amor', 'like'], fill: '#e11d48', pathData: 'M50 92 L15 57 A22 22 0 1 1 50 26 A22 22 0 1 1 85 57 Z' },
  { id: 'sparkle', label: 'Brilho', shapeType: 'svg-path', category: 'decorativas', keywords: ['estrela 4', 'shine'], fill: '#f59e0b', pathData: 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z' },
  { id: 'burst', label: 'Explosão', shapeType: 'svg-path', category: 'decorativas', keywords: ['selo', 'promo', 'splash'], fill: '#f59e0b', pathData: 'M50 0 L59 32 L85 15 L68 41 L100 50 L68 59 L85 85 L59 68 L50 100 L41 68 L15 85 L32 59 L0 50 L32 41 L15 15 L41 32 Z' },
  { id: 'bolt', label: 'Raio', shapeType: 'svg-path', category: 'decorativas', keywords: ['energia', 'flash'], fill: '#f59e0b', pathData: 'M60 0 L15 55 H40 L35 100 L85 40 H55 Z' },
  { id: 'drop', label: 'Gota', shapeType: 'svg-path', category: 'decorativas', keywords: ['agua', 'pingo'], fill: '#0ea5e9', pathData: 'M50 0 Q85 45 85 65 A35 35 0 1 1 15 65 Q15 45 50 0 Z' },
  { id: 'pin', label: 'Pin de local', shapeType: 'svg-path', category: 'decorativas', keywords: ['mapa', 'endereco', 'localizacao'], fill: '#e11d48', pathData: 'M50 0 A35 35 0 0 1 85 35 Q85 60 50 100 Q15 60 15 35 A35 35 0 0 1 50 0 Z', aspect: 0.75 },
  { id: 'speech', label: 'Balão de fala', shapeType: 'svg-path', category: 'decorativas', keywords: ['comentario', 'chat'], fill: AZUL, pathData: 'M15 5 H85 Q95 5 95 15 V60 Q95 70 85 70 H45 L25 90 V70 H15 Q5 70 5 60 V15 Q5 5 15 5 Z', aspect: 1.2 },
  { id: 'cloud', label: 'Nuvem', shapeType: 'svg-path', category: 'decorativas', fill: '#94a3b8', pathData: 'M25 80 A18 18 0 0 1 20 45 A22 22 0 0 1 60 30 A18 18 0 0 1 92 55 A15 15 0 0 1 80 80 Z', aspect: 1.5 },
  { id: 'blob', label: 'Blob orgânico', shapeType: 'svg-path', category: 'decorativas', keywords: ['organico', 'mancha'], fill: '#a855f7', pathData: 'M83 20 Q100 40 92 63 Q84 86 58 93 Q32 100 16 80 Q0 60 10 37 Q20 14 47 8 Q70 3 83 20 Z' },
  { id: 'shield', label: 'Escudo', shapeType: 'svg-path', category: 'decorativas', keywords: ['seguro', 'protecao'], fill: '#10b981', pathData: 'M50 0 L95 15 V45 Q95 80 50 100 Q5 80 5 45 V15 Z' },
  { id: 'tag', label: 'Etiqueta', shapeType: 'svg-path', category: 'decorativas', keywords: ['preco', 'oferta'], fill: '#f97316', pathData: 'M0 0 H55 L100 45 L55 100 L0 55 Z M22 22 A8 8 0 1 0 22 38 A8 8 0 1 0 22 22 Z', pathFillRule: 'evenodd' },
  { id: 'banner', label: 'Faixa', shapeType: 'svg-path', category: 'decorativas', keywords: ['fita', 'ribbon'], fill: '#e11d48', pathData: 'M0 20 H100 V80 H0 L15 50 Z', aspect: 2.2 },
]

export const SHAPE_CATEGORIES: Array<{ id: ShapeDefinition['category']; label: string }> = [
  { id: 'basicas', label: 'Básicas' },
  { id: 'setas', label: 'Setas' },
  { id: 'linhas', label: 'Linhas' },
  { id: 'decorativas', label: 'Decorativas' },
]

/**
 * As máscaras de imagem: os 26 `svg-path` legados, POR ID e nesta ordem, com os mesmos paths do catálogo. A barra de
 * imagem lê só esta lista, então um `svg-path` novo no catálogo não vira recorte de foto sozinho (o path escolhido fica
 * congelado na camada, em `style.mask`).
 */
const IDS_DAS_MASCARAS = [
  'diamond', 'pentagon', 'hexagon', 'octagon', 'trapezoid', 'parallelogram', 'semicircle', 'ring', 'cross',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'chevron-right',
  'heart', 'sparkle', 'burst', 'bolt', 'drop', 'pin', 'speech', 'cloud', 'blob', 'shield', 'tag', 'banner',
]

export const MASCARAS_DE_IMAGEM: ShapeDefinition[] = IDS_DAS_MASCARAS.map((id) => {
  const forma = SHAPES_LIBRARY.find((s) => s.id === id)
  if (forma?.shapeType !== 'svg-path' || !forma.pathData) throw new Error(`máscara sem svg-path no catálogo: ${id}`)
  return forma
})

// ── Catálogo CANDIDATO de elementos (CP-V2b) ──────────────────────────────

/**
 * Os 10 itens do MVP do painel "Elementos", FORA do catálogo vivo. Nem o painel de formas nem a barra de imagem
 * importam este export: ele entra no catálogo que o painel consome só no V2c, no mesmo PR em que a inserção passa a
 * resolver a cor pela marca (preflight do CP-V2, §8.1). A categoria não é trava de exibição.
 *
 * - São 3 presets de forma nativa (`fio-fino`, `moldura-fina`, `pilula-contorno`), 1 cópia de path (`spark-4`, o
 *   desenho do `sparkle`) e 6 `svg-path` novos, todos em viewBox 0 0 100 100 com comandos absolutos M L C Z.
 * - `fill` e `strokeColor` são só vitrine (cinza neutro); a inserção do V2c pinta cada canal pelo papel do slot. Item só
 *   de contorno tem `fill: 'transparent'`.
 * - A `line` pinta com `fill` nos dois renderers: o slot do `fio-fino` é `preenchimento`.
 * - `fio-fino`, `moldura-aberta` (┌) e `spark-4` são ids publicados nos arquétipos (`arquetipos/tipos.ts`):
 *   imutáveis. Desenho novo de um item = `versao` nova, nunca outro desenho na mesma versão.
 */
export type CategoriaDoElemento = 'linhas' | 'formas' | 'organicos' | 'setas' | 'destaques' | 'editorial' | 'ornamentos'

/** Item candidato: os campos novos, opcionais na `ShapeDefinition` dos legados, aqui são obrigatórios. */
export interface ElementoCandidato extends Omit<ShapeDefinition, 'category'> {
  category: CategoriaDoElemento
  keywords: string[]
  versao: number
  ajuste: 'travado' | 'livre'
  slots: SlotDeCor[]
}

const contorno = (papelPadrao: PapelDaMarca): SlotDeCor => ({ canal: 'contorno', papelPadrao, rotulo: 'Contorno' })
const preenchimento = (papelPadrao: PapelDaMarca, rotulo = 'Preenchimento'): SlotDeCor => ({ canal: 'preenchimento', papelPadrao, rotulo })

export const ELEMENTOS_CANDIDATOS: ElementoCandidato[] = [
  { id: 'fio-fino', label: 'Fio fino', shapeType: 'line', category: 'linhas', keywords: ['fio', 'linha fina', 'traco', 'divisor', 'line', 'hairline', 'divider', 'rule'], fill: CINZA, strokeWidth: 2, versao: 1, ajuste: 'livre', slots: [preenchimento('texto', 'Cor da linha')] },
  { id: 'moldura-fina', label: 'Moldura fina', shapeType: 'rectangle', category: 'formas', keywords: ['moldura', 'contorno', 'quadro', 'borda', 'frame', 'border', 'outline'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 2, versao: 1, ajuste: 'livre', slots: [contorno('texto')] },
  { id: 'pilula-contorno', label: 'Pílula (contorno)', shapeType: 'rounded-rectangle', category: 'formas', keywords: ['pilula', 'capsula', 'botao', 'cta', 'pill', 'capsule', 'button'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 2, raio: 9999, aspect: 3, versao: 1, ajuste: 'livre', slots: [contorno('texto')] },
  { id: 'spark-4', label: 'Brilho de 4 pontas', shapeType: 'svg-path', category: 'ornamentos', keywords: ['brilho', 'estrela 4', 'faisca', 'spark', 'sparkle', 'star', 'shine'], fill: CINZA, versao: 1, ajuste: 'travado', slots: [preenchimento('destaque')], pathData: 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z' },
  { id: 'onda-suave', label: 'Onda suave', shapeType: 'svg-path', category: 'organicos', keywords: ['onda', 'ondulada', 'ondulado', 'wave', 'wavy', 'squiggle'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 3, aspect: 10, versao: 1, ajuste: 'livre', slots: [contorno('destaque')], pathData: 'M0 50 C5.56 -16.67 11.11 -16.67 16.67 50 C22.22 116.67 27.78 116.67 33.33 50 C38.89 -16.67 44.44 -16.67 50 50 C55.56 116.67 61.11 116.67 66.67 50 C72.22 -16.67 77.78 -16.67 83.33 50 C88.89 116.67 94.44 116.67 100 50' },
  { id: 'sublinhado-suave', label: 'Sublinhado suave', shapeType: 'svg-path', category: 'destaques', keywords: ['sublinhado', 'grifo', 'destaque', 'underline', 'swoosh', 'highlight'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 4, tracoPontas: 'round', aspect: 10, versao: 1, ajuste: 'livre', slots: [contorno('destaque')], pathData: 'M0 40 C25 100 65 100 100 0' },
  { id: 'pontos', label: 'Três pontos', shapeType: 'svg-path', category: 'ornamentos', keywords: ['pontos', 'reticencias', 'bolinhas', 'dots', 'ellipsis'], fill: CINZA, aspect: 5, versao: 1, ajuste: 'travado', slots: [preenchimento('texto')], pathData: 'M20 50 C20 77.62 15.52 100 10 100 C4.48 100 0 77.62 0 50 C0 22.38 4.48 0 10 0 C15.52 0 20 22.38 20 50 Z M60 50 C60 77.62 55.52 100 50 100 C44.48 100 40 77.62 40 50 C40 22.38 44.48 0 50 0 C55.52 0 60 22.38 60 50 Z M100 50 C100 77.62 95.52 100 90 100 C84.48 100 80 77.62 80 50 C80 22.38 84.48 0 90 0 C95.52 0 100 22.38 100 50 Z' },
  { id: 'moldura-aberta', label: 'Moldura aberta', shapeType: 'svg-path', category: 'editorial', keywords: ['canto', 'moldura aberta', 'fio em l', 'cantoneira', 'corner', 'open frame', 'l shape'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 2, versao: 1, ajuste: 'livre', slots: [contorno('texto')], pathData: 'M0 100 L0 0 L100 0' },
  { id: 'cantoneiras', label: 'Cantoneiras', shapeType: 'svg-path', category: 'editorial', keywords: ['cantoneiras', 'cantos', 'moldura', 'corners', 'corner frame', 'crop marks'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 2, versao: 1, ajuste: 'livre', slots: [contorno('destaque')], pathData: 'M0 25 L0 0 L25 0 M75 0 L100 0 L100 25 M100 75 L100 100 L75 100 M25 100 L0 100 L0 75' },
  { id: 'colchete', label: 'Colchete', shapeType: 'svg-path', category: 'editorial', keywords: ['colchete', 'parentese', 'parenteses', 'bracket', 'parenthesis'], fill: 'transparent', strokeColor: CINZA, strokeWidth: 2, aspect: 0.4, versao: 1, ajuste: 'livre', slots: [contorno('texto')], pathData: 'M100 0 C-33.33 25 -33.33 75 100 100' },
]

export const CATEGORIAS_CANDIDATAS: Array<{ id: CategoriaDoElemento; label: string }> = [
  { id: 'linhas', label: 'Linhas' },
  { id: 'formas', label: 'Formas' },
  { id: 'organicos', label: 'Orgânicos' },
  { id: 'setas', label: 'Setas' },
  { id: 'destaques', label: 'Destaques' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'ornamentos', label: 'Ornamentos' },
]
