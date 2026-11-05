/**
 * Harness do CP-X2a (navegador): para cada texto de cor, o que o Chromium diz (`CSS.supports` e a cor
 * computada), o que o `lerCor` lê e o que o campo de cor da UI gravaria (`corDigitadaParaGravar` com o
 * `CSS.supports` real). Sem rede, sem React, sem banco.
 */
import { lerCor, type CorLida } from '@/lib/vetor/cor'
import { corDigitadaParaGravar } from '@/lib/shape-style'

export interface Avaliacao {
  entrada: string
  suportada: boolean
  /** `getComputedStyle(...).color`, como o navegador resolve (só quando suportada). */
  computada: string | null
  leitura: CorLida
  /** O que a UI gravaria (opacidade 1), ou null se a UI recusa. */
  uiGrava: string | null
  uiGravadaLida: CorLida | undefined
}

declare global {
  interface Window {
    __avaliarCores: (entradas: string[]) => Avaliacao[]
  }
}

const ehCorCss = (c: string) => CSS.supports('color', c)

window.__avaliarCores = (entradas) => {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return entradas.map((entrada) => {
    const suportada = ehCorCss(entrada)
    let computada: string | null = null
    if (suportada) {
      div.style.color = ''
      div.style.color = entrada
      computada = getComputedStyle(div).color
    }
    const uiGrava = corDigitadaParaGravar(entrada, 1, '#2563eb', ehCorCss)
    return { entrada, suportada, computada, leitura: lerCor(entrada), uiGrava, uiGravadaLida: uiGrava === null ? undefined : lerCor(uiGrava) }
  })
}
