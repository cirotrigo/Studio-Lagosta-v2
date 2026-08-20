/**
 * Em STORY o canto superior ESQUERDO é do Instagram — avatar e nome do perfil.
 * A logo composta do TERO saiu DUAS vezes ali, sob o avatar (17/08/2026),
 * porque o compositor media os quatro cantos com margem de 5,5% da LARGURA nos
 * dois eixos (~3% da altura no 9:16). O superior DIREITO pode (decisão do Ciro
 * em 20/08/2026): com a margem vertical de 1/8, a logo fica abaixo dos
 * controles de fechar/menu.
 */
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { comporLogo } from '../logo-compositor'

/** Uma arte 9:16 com o TOPO liso e claro — o canto que o bug escolhia. */
async function arteComTopoCalmo(): Promise<Buffer> {
  const ruido = Buffer.alloc(1088 * 968 * 3)
  for (let i = 0; i < ruido.length; i++) ruido[i] = Math.floor((i * 2654435761) % 200)
  const base = sharp({ create: { width: 1088, height: 1936, channels: 3, background: '#f0f0f0' } })
  const metade = await sharp(ruido, { raw: { width: 1088, height: 968, channels: 3 } }).png().toBuffer()
  return base.composite([{ input: metade, top: 968, left: 0 }]).png().toBuffer()
}

/** Logo escura sólida — contraste alto contra qualquer canto do teste. */
function logo(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 160, channels: 4, background: '#1a1a1a' } })
    .png()
    .toBuffer()
}

describe('comporLogo em story', () => {
  it('🔴 nunca escolhe o topo ESQUERDO, nem quando ele é o mais calmo — o topo direito pode', async () => {
    const r = await comporLogo(await arteComTopoCalmo(), await logo(), {
      cornerReservado: 'bottom-right',
      formato: 'story',
    })
    expect(r.corner).not.toBe('top-left')
    // O topo inteiro é o mais calmo desta arte; com o esquerdo fora da
    // disputa, o direito vence — é a prova de que ele segue concorrendo.
    expect(r.corner).toBe('top-right')
  })

  it('sem o formato (feed, legado), os quatro cantos seguem concorrendo', async () => {
    const r = await comporLogo(await arteComTopoCalmo(), await logo(), {
      cornerReservado: 'bottom-right',
    })
    // O topo liso e claro vence por calma+contraste — comportamento antigo.
    expect(r.corner.startsWith('top')).toBe(true)
  })
})
