/**
 * Entrelinha de camada de texto — escrita nos dois campos.
 *
 * O valor mora em `style.lineHeight` e em `textboxConfig.autoWrap.lineHeight`.
 * O editor (Konva) desenha pelo primeiro; o render server-side (RenderEngine)
 * resolve como `autoWrap.lineHeight ?? style.lineHeight ?? 1.2`, ou seja, o
 * segundo ganha.
 *
 * Enquanto os controles escreviam só no `style`, todo ajuste de entrelinha
 * feito no editor **não chegava à arte agendada** — e o download do editor,
 * que é `stage.toDataURL()`, mostrava o valor certo, escondendo a divergência.
 * Eram 1.092 camadas assim quando isto foi descoberto.
 *
 * Use este helper em qualquer lugar que altere entrelinha. Escrever num campo
 * só volta a criar a divergência.
 */
import type { Layer } from '@/types/template'

export function patchLineHeight(layer: Layer, lineHeight: number): Partial<Layer> {
  const autoWrap = layer.textboxConfig?.autoWrap

  return {
    style: { ...layer.style, lineHeight },
    textboxConfig: {
      ...layer.textboxConfig,
      autoWrap: {
        breakMode: autoWrap?.breakMode ?? 'word',
        autoExpand: autoWrap?.autoExpand ?? false,
        ...autoWrap,
        lineHeight,
      },
    },
  }
}
