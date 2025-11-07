import type { RichTextStyle } from './template'

/**
 * Rich Text Types
 *
 * Sistema de tipagem para suporte a texto com múltiplos estilos (rich text) no Konva.
 * Permite aplicar diferentes cores, fontes e formatações em trechos específicos do texto.
 *
 * @see /prompts/plano-texto-konva.md para documentação completa
 */

/**
 * Representa um segmento de texto com estilo específico
 * Usado internamente para renderização de rich text
 */
export interface TextStyleSegment {
  text: string
  start: number
  end: number
  style: RichTextStyle
  // Posição calculada para renderização
  x?: number
  y?: number
  width?: number
  height?: number
}

/**
 * Configuração do editor de rich text
 * Gerencia estado de edição e seleção de trechos
 */
export interface RichTextEditorConfig {
  // Seleção atual do usuário no texto
  selectionStart: number
  selectionEnd: number

  // Modo de edição
  mode: 'select' | 'edit'

  // Estilo a ser aplicado na próxima digitação ou trecho selecionado
  pendingStyle?: Partial<RichTextStyle>

  // Histórico para undo/redo
  history?: RichTextStyle[][]
  historyIndex?: number
}

/**
 * Resultado do parsing de texto com estilos
 * Retornado pelas funções de parsing de rich text
 */
export interface ParsedRichText {
  segments: TextStyleSegment[]
  totalLength: number
  bounds: {
    width: number
    height: number
  }
}

/**
 * Opções para renderização de rich text
 * Configurações de layout e performance
 */
export interface RichTextRenderOptions {
  // Layout
  maxWidth?: number
  lineHeight: number
  textAlign: 'left' | 'center' | 'right'

  // Wrapping (quebra de linha)
  wrap: boolean
  breakMode: 'word' | 'char' | 'hybrid'

  // Performance
  useCache: boolean
  pixelRatio: number

  // Padding interno
  padding?: number
}

/**
 * Linha de texto renderizada
 * Usada para cálculo de layout multi-linha
 */
export interface TextLine {
  segments: TextStyleSegment[]
  y: number
  width: number
  height: number
}

/**
 * Configuração de alinhamento de linha
 */
export interface LineAlignment {
  offsetX: number
  textAlign: 'left' | 'center' | 'right'
}

/**
 * Resultado do cálculo de layout
 * Posições finais de todos os segments
 */
export interface LayoutResult {
  segments: TextStyleSegment[]
  lines: TextLine[]
  bounds: {
    width: number
    height: number
  }
}

/**
 * Opções para merge de estilos sobrepostos
 */
export interface StyleMergeOptions {
  // Como lidar com conflitos (último tem prioridade)
  conflictResolution: 'last-wins' | 'first-wins' | 'merge'

  // Remover estilos redundantes
  removeRedundant: boolean

  // Combinar estilos adjacentes idênticos
  combineAdjacent: boolean
}

/**
 * Evento de mudança de seleção no editor
 */
export interface SelectionChangeEvent {
  start: number
  end: number
  selectedText: string
  currentStyles: RichTextStyle[]
}

/**
 * Preset de estilo rápido
 * Templates de formatação pré-definidos
 */
export interface StylePreset {
  id: string
  name: string
  description?: string
  style: Partial<RichTextStyle>
  icon?: string
}

/**
 * Configuração de conversão HTML para rich text
 * Usado na Fase 05 (HTML to Canvas)
 */
export interface HtmlToRichTextConfig {
  // Preservar formatação HTML complexa
  preserveHtml: boolean

  // Gerar imagem via html2canvas
  generateImage: boolean

  // Qualidade da imagem gerada (1-2)
  imageQuality: number

  // Formato da imagem
  imageFormat: 'png' | 'jpeg'
}
