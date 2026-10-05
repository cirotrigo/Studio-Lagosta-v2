/**
 * As MEDIDAS FINAIS dos textos de uma peça composta — depois do autofix, que
 * pode ter encolhido a fonte e refeito a pilha. É o que `ver-geracao` e o
 * `medir-copy` da F2 leem: corpo, entrelinha, caixa e número de linhas de cada
 * bloco COMO ELE FOI GRAVADO, e se a medida vale ("não medido" quando a fonte
 * do papel não carregou no servidor e o medidor caiu na fonte de fallback).
 *
 * Módulo PURO, com teste.
 */
import type { Layer } from '@/types/template'

export interface MedidaFinal {
  id: string
  papel: string
  fontFamily: string | null
  fontSize: number | null
  lineHeight: number | null
  width: number
  height: number
  linhas: number
  /** A fonte do papel não carregou: a caixa foi medida na fonte de fallback. */
  naoMedido: boolean
  /** O prefixo que a assinatura desenha antes da primeira linha (o "→ " do CTA), quando há. */
  prefixo?: string
}

/**
 * As famílias que a camada USA: a do estilo e as dos trechos de rich text — o
 * destaque costuma estar na versão pesada da família, e é com ela que a largura
 * extra é medida. Qualquer uma ausente no servidor invalida a medida (R02).
 */
export function familiasDaCamada(l: Layer): string[] {
  const s = (l.style ?? {}) as Record<string, unknown>
  const base = typeof s.fontFamily === 'string' && s.fontFamily.trim() ? [s.fontFamily] : []
  const trechos = (Array.isArray(l.richTextStyles) ? l.richTextStyles : [])
    .map((t) => (t as { fontFamily?: unknown } | null)?.fontFamily)
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
  return [...new Set([...base, ...trechos])]
}

function papelDe(l: Layer): string | null {
  const meta = l.metadata as { compositor?: { papel?: unknown } } | undefined
  return typeof meta?.compositor?.papel === 'string' ? meta.compositor.papel : null
}

export function medidasFinaisDasCamadas(layers: Layer[], fontesNaoCarregadas: ReadonlySet<string> = new Set()): MedidaFinal[] {
  const saida: MedidaFinal[] = []
  for (const l of layers) {
    if ((l.type !== 'text' && l.type !== 'rich-text') || l.visible === false) continue
    const papel = papelDe(l)
    if (!papel) continue
    const s = (l.style ?? {}) as Record<string, unknown>
    const autoWrap = (l.textboxConfig as { autoWrap?: { lineHeight?: number } } | undefined)?.autoWrap
    const fontFamily = typeof s.fontFamily === 'string' ? s.fontFamily : null
    const meta = l.metadata as { compositor?: { prefixo?: unknown } } | undefined
    const prefixo = typeof meta?.compositor?.prefixo === 'string' ? meta.compositor.prefixo : undefined
    saida.push({
      id: l.id,
      papel,
      fontFamily,
      fontSize: typeof s.fontSize === 'number' ? s.fontSize : null,
      lineHeight: typeof autoWrap?.lineHeight === 'number' ? autoWrap.lineHeight : typeof s.lineHeight === 'number' ? s.lineHeight : null,
      width: Math.round(l.size?.width ?? 0),
      height: Math.round(l.size?.height ?? 0),
      linhas: String(l.content ?? '').split('\n').length,
      naoMedido: (() => {
        const familias = familiasDaCamada(l)
        return familias.length ? familias.some((f) => fontesNaoCarregadas.has(f)) : true
      })(),
      ...(prefixo ? { prefixo } : {}),
    })
  }
  return saida
}
