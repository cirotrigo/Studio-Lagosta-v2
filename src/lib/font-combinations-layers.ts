/**
 * Converte os elementos de uma combinação tipográfica em camadas.
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
  caixaDoOrnamento,
  camadaDoOrnamento,
  estimateComboElementHeight,
  resolveComboFontFamily,
  type FontComboElement,
  type FontComboPair,
} from '@/lib/font-combinations'
import { estilosDoRichText, lerDestaques, type EstiloDeDestaque, type TrechoDestacado } from '@/lib/compositor/destaques'
import type { Layer, RichTextStyle } from '@/types/template'

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
  /** Substitui o texto de um elemento, por id, por label ou pelo papel do compositor */
  textOverrides?: Record<string, string>
}

/**
 * O conteúdo final de um texto. Palavra entre [colchetes] vira trecho de rich
 * text no estilo de destaque do elemento; sem estilo de destaque, os colchetes
 * só saem (marcação nunca aparece na arte).
 */
export function conteudoDoElemento(
  texto: string,
  element: Pick<FontComboElement, 'destaque' | 'effects'>,
): { content: string; richTextStyles: RichTextStyle[] | null } {
  const linhas = texto.split('\n').map(lerDestaques)
  const content = linhas.map((l) => l.texto).join('\n')
  const temTrecho = linhas.some((l) => l.trechos.length > 0)
  const temEstilo = Boolean(element.destaque && Object.values(element.destaque).some(Boolean))
  if (!temTrecho || !temEstilo) return { content, richTextStyles: null }

  const trechos: TrechoDestacado[] = []
  let inicioDaLinha = 0
  for (const linha of linhas) {
    for (const t of linha.trechos) trechos.push({ inicio: inicioDaLinha + t.inicio, fim: inicioDaLinha + t.fim })
    inicioDaLinha += linha.texto.length + 1
  }
  // O rich text só desenha sombra por trecho: a sombra do texto vai junto
  const shadow = element.effects?.shadow
  const sombra = shadow?.enabled
    ? { color: shadow.shadowColor, blur: shadow.shadowBlur, offsetY: shadow.shadowOffsetY, opacity: shadow.shadowOpacity }
    : null
  return {
    content,
    richTextStyles: estilosDoRichText({ conteudo: content, trechos, destaque: element.destaque as EstiloDeDestaque, sombra }),
  }
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

  return elements.flatMap((element, index) => {
    const bruto =
      textOverrides?.[element.id] ??
      textOverrides?.[element.label] ??
      (element.papel ? textOverrides?.[element.papel] : undefined) ??
      element.text
    const { content, richTextStyles } = conteudoDoElemento(bruto, element)

    const camadaTexto = {
      id: createId(),
      type: richTextStyles ? 'rich-text' : 'text',
      name: `${comboName} - ${element.label}`,
      visible: true,
      locked: false,
      order: 0,
      content,
      ...(richTextStyles ? { richTextStyles } : {}),
      position: {
        x: Math.round(element.x * canvasWidth),
        y: Math.round(element.y * canvasHeight),
      },
      size: {
        width: Math.round(element.width * canvasWidth),
        height: element.height
          ? Math.round(element.height * canvasHeight)
          : estimateComboElementHeight({ ...element, text: content }, escala),
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
        // O texto encosta no topo da caixa e cresce para baixo; o reflow da
        // pilha (combo-stack-reflow) arrasta o que vem depois.
        anchor: 'top',
        // A entrelinha precisa ser a MESMA nos dois campos: o render
        // server-side prefere `autoWrap.lineHeight` sobre `style.lineHeight`,
        // então o 1 fixo que estava aqui apertava toda combinação do catálogo
        // (1.02 a 1.5) na arte agendada, enquanto o editor mostrava o valor
        // certo. `autoExpand` ligado: a altura passa a ser derivada do texto
        // (a altura salva na combinação vira só o chute inicial — texto de IA
        // maior que o exemplo era truncado por linhas inteiras no render).
        autoWrap: { lineHeight: element.lineHeight, breakMode: 'word', autoExpand: true },
      },
      ...(element.rotation ? { rotation: element.rotation } : {}),
      ...(element.effects ? { effects: element.effects } : {}),
      metadata: {
        presetId: comboId,
        presetName: comboName,
        elementId: element.id,
        elementLabel: element.label,
        groupId: grupo,
        stackOrder: index,
        // O papel sobrevive a salvar de novo e é o que o compositor lê
        ...(element.papel ? { compositor: { papel: element.papel } } : {}),
      },
    } as Layer

    const camadas: Layer[] = [camadaTexto]

    // O ícone mora no mesmo grupo e na mesma posição da pilha do seu texto:
    // quando um texto de cima cresce, o reflow empurra os dois juntos.
    if (element.icon) {
      camadas.push({
        id: createId(),
        type: 'image',
        name: `${comboName} - ${element.label} (ícone)`,
        visible: true,
        locked: false,
        order: 0,
        fileUrl: element.icon.url,
        position: {
          x: Math.round(element.x * canvasWidth + element.icon.offsetX * escala),
          y: Math.round(element.y * canvasHeight + element.icon.offsetY * escala),
        },
        size: {
          width: Math.round(element.icon.width * escala),
          height: Math.round(element.icon.height * escala),
        },
        style: { objectFit: 'contain' },
        metadata: {
          presetId: comboId,
          presetName: comboName,
          elementId: `${element.id}:icone`,
          elementLabel: `${element.label} (ícone)`,
          groupId: grupo,
          stackOrder: index,
          iconeDe: element.id,
        },
      } as Layer)
    }

    // Os outros elementos presos ao texto (filete, selo, a logo), na mesma
    // regra de grupo e pilha
    const caixaDoTexto = { ...camadaTexto.position, ...camadaTexto.size }
    ;(element.ornamentos ?? []).forEach((ornamento, i) => {
      camadas.push(
        camadaDoOrnamento(ornamento, caixaDoOrnamento(ornamento, caixaDoTexto, escala), escala, {
          id: createId(),
          name: `${comboName} - ${element.label} (elemento ${i + 1})`,
          metadata: {
            presetId: comboId,
            presetName: comboName,
            elementId: `${element.id}:elemento-${i + 1}`,
            elementLabel: `${element.label} (elemento)`,
            groupId: grupo,
            stackOrder: index,
            ornamentoDe: element.id,
          },
        }),
      )
    })

    return camadas
  })
}
