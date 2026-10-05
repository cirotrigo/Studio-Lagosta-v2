/**
 * A CAIXA do texto como o render a desenha (`textTransform`) — módulo PURO,
 * compartilhado pelo render (`render-engine.ts`) e por quem LÊ a peça
 * (`textos-da-peca.ts`, PR 6): uma camada com `content: "Almoço executivo"` e
 * `textTransform: "uppercase"` mostra "ALMOÇO EXECUTIVO", e a agenda tem de
 * devolver o que a arte mostra. Uma função só, para os dois nunca divergirem.
 */
export type CaixaDoTexto = 'uppercase' | 'lowercase' | 'capitalize' | 'none'

export function aplicarCaixa(texto: string, transform: CaixaDoTexto | string | null | undefined): string {
  switch (transform ?? 'none') {
    case 'uppercase':
      return texto.toUpperCase()
    case 'lowercase':
      return texto.toLowerCase()
    case 'capitalize':
      return texto.replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    default:
      return texto
  }
}
