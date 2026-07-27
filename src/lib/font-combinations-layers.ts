/**
 * Converte os elementos de uma combinação tipográfica em camadas de texto.
 *
 * Fica separado do painel do editor porque o servidor também precisa disso:
 * a geração de arte sem modelo (createArteLivre) monta a página aplicando uma
 * combinação, e o resultado tem que ser idêntico ao que o editor produz.
 *
 * Sem dependência de React — pode ser importado de rotas, libs e do MCP.
 */

import { createId } from '@/lib/id'
import {
  COMBO_BASE_CANVAS_WIDTH,
  estimateComboElementHeight,
  resolveComboFontFamily,
  type FontComboElement,
  type FontComboPair,
} from '@/lib/font-combinations'
import type { Layer } from '@/types/template'

export interface BuildComboLayersOptions {
  elements: FontComboElement[]
  /** Fontes da marca aplicadas conforme o papel (title/body) de cada elemento */
  pair: FontComboPair
  canvasWidth: number
  canvasHeight: number
  /** Identificam a origem das camadas (metadata.presetId/presetName) */
  comboId: string
  comboName: string
  /** Agrupa as camadas criadas numa mesma aplicação */
  groupId?: string
  /** Substitui o texto de um elemento, por id ou por label */
  textOverrides?: Record<string, string>
}

/**
 * As posições da combinação são frações do canvas (0..1), então a mesma
 * combinação serve a qualquer formato. Os tamanhos de fonte estão na base de
 * 1080 de largura e são escalados proporcionalmente.
 */
export function buildComboLayers({
  elements,
  pair,
  canvasWidth,
  canvasHeight,
  comboId,
  comboName,
  groupId,
  textOverrides,
}: BuildComboLayersOptions): Layer[] {
  const escala = canvasWidth / COMBO_BASE_CANVAS_WIDTH
  const grupo = groupId ?? `combo-${createId()}`

  return elements.map((element) => {
    const texto = textOverrides?.[element.id] ?? textOverrides?.[element.label] ?? element.text

    return {
      id: createId(),
      type: 'text',
      name: `${comboName} - ${element.label}`,
      visible: true,
      locked: false,
      order: 0,
      content: texto,
      position: {
        x: Math.round(element.x * canvasWidth),
        y: Math.round(element.y * canvasHeight),
      },
      size: {
        width: Math.round(element.width * canvasWidth),
        height: element.height
          ? Math.round(element.height * canvasHeight)
          : estimateComboElementHeight({ ...element, text: texto }, escala),
      },
      style: {
        fontSize: Math.round(element.fontSize * escala),
        fontFamily: element.fontFamily ?? resolveComboFontFamily(element.role, pair),
        fontWeight: element.fontWeight,
        fontStyle: element.fontStyle ?? 'normal',
        color: element.color ?? '#FFFFFF',
        textAlign: element.textAlign ?? 'center',
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing ? Math.round(element.letterSpacing * escala) : undefined,
        textTransform: element.textTransform ?? 'none',
      },
      textboxConfig: {
        textMode: 'auto-wrap-fixed',
        autoWrap: { lineHeight: 1, breakMode: 'word', autoExpand: false },
      },
      ...(element.rotation ? { rotation: element.rotation } : {}),
      ...(element.effects ? { effects: element.effects } : {}),
      metadata: {
        presetId: comboId,
        presetName: comboName,
        elementId: element.id,
        elementLabel: element.label,
        groupId: grupo,
      },
    } as Layer
  })
}
