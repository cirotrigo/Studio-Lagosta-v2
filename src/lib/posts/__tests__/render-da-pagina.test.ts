import { describe, expect, it } from 'vitest'

import { renderDaPaginaCobreAMidia } from '../render-da-pagina'

describe('renderDaPaginaCobreAMidia', () => {
  it('post sem mídia ou com uma só é coberto pelo render da página', () => {
    expect(renderDaPaginaCobreAMidia([])).toBe(true)
    expect(renderDaPaginaCobreAMidia(null)).toBe(true)
    expect(renderDaPaginaCobreAMidia(undefined)).toBe(true)
    expect(renderDaPaginaCobreAMidia(['https://blob/posts/rendered/p-1.png'])).toBe(true)
  })

  it('o carrossel de sexta da Real (4 fotos) nunca volta para a fila de render', () => {
    expect(
      renderDaPaginaCobreAMidia([
        'https://blob/1789062427450-WhatsApp.jpeg',
        'https://blob/google-drive/image-06.jpg',
        'https://blob/post-media/enquadrado-1.jpg',
        'https://blob/post-media/enquadrado-2.jpg',
      ]),
    ).toBe(false)
  })
})
