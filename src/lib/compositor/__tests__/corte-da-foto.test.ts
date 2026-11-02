/**
 * F2a — o corte da foto como JANELA: a âncora vira janela pela mesma conta do desenho (retângulos efetivos iguais,
 * não inversão única), a igualdade é por valor, a proporção se confere em px e a expansão é mínima e centrada.
 */
import { describe, expect, it } from 'vitest'
import { calculateImageCrop, type CropPosition } from '@/lib/image-crop-utils'
import { resolveImageSourceRect } from '@/lib/image-fit'
import { chaveDaEscolha, chaveDoCorte, corteDaEscolha, corteDoRotulo, cortesIguais, escalaDaJanela, janelaDoRotulo, janelaEfetiva, janelaEmPx, janelaNaProporcao, lerJanela } from '../corte-da-foto'

const ROTULOS: CropPosition[] = ['left-top', 'center-top', 'right-top', 'left-middle', 'center-middle', 'right-middle', 'left-bottom', 'center-bottom', 'right-bottom']
const STORY = { width: 1080, height: 1920 }
const FEED = { width: 1080, height: 1350 }
const LARGA = { width: 1920, height: 1920 }
const ALTA = { width: 2672, height: 4000 }
const perto = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)

describe('janela ↔ rótulo: o MESMO retângulo-fonte do desenho', () => {
  for (const caixa of [STORY, FEED]) {
    for (const foto of [LARGA, ALTA]) {
      it(`os 9 rótulos numa foto ${foto.width}×${foto.height} em ${caixa.width}×${caixa.height}: janelaEmPx = calculateImageCrop = resolveImageSourceRect(style.crop)`, () => {
        for (const rotulo of ROTULOS) {
          const esperado = calculateImageCrop(foto, caixa, rotulo)
          const janela = janelaDoRotulo(foto, caixa, rotulo)
          const px = janelaEmPx(janela, foto)
          perto(px.cropX, esperado.cropX)
          perto(px.cropY, esperado.cropY)
          perto(px.cropWidth, esperado.cropWidth)
          perto(px.cropHeight, esperado.cropHeight)
          // E o renderizador, dado `style.crop = janela`, desenha o mesmo retângulo (o contrato do editor).
          const desenhado = resolveImageSourceRect(foto, caixa, { objectFit: 'cover', crop: janela })!
          perto(desenhado.cropX, esperado.cropX)
          perto(desenhado.cropWidth, esperado.cropWidth)
          perto(desenhado.cropHeight, esperado.cropHeight)
        }
      })
    }
  }

  it('sem sobra num eixo, vários rótulos dão a mesma janela: a igualdade é do retângulo, não do rótulo', () => {
    // A foto 2672×4000 é mais LARGA que o story (0,668 contra 0,5625): sobra na horizontal, não na vertical.
    const a = janelaDoRotulo(ALTA, STORY, 'center-top')
    const b = janelaDoRotulo(ALTA, STORY, 'center-bottom')
    expect(a).toEqual(b)
    expect(chaveDoCorte({ janela: a })).toBe(chaveDoCorte({ janela: b }))
    expect(chaveDoCorte(corteDoRotulo(ALTA, STORY, 'left-middle'))).toBe('left-middle')
  })
})

describe('igualdade por valor e leitura', () => {
  it('a chave da janela sobrevive à serialização e difere por valor', () => {
    const c = { janela: { x: 0.1773, y: 0.0577, width: 0.6237, height: 0.7415 } }
    expect(chaveDoCorte(JSON.parse(JSON.stringify(c)))).toBe(chaveDoCorte(c))
    expect(cortesIguais(c, JSON.parse(JSON.stringify(c)))).toBe(true)
    expect(cortesIguais(c, { janela: { ...c.janela, x: 0.1774 } })).toBe(false)
    expect(chaveDaEscolha({ corte: 'janela', janela: c.janela })).toBe(chaveDoCorte(c))
    expect(chaveDaEscolha({ corte: 'center-middle' })).toBe('center-middle')
  })

  it('lerJanela RESOLVE o estado existente como o desenho (o clamp de resolveImageSourceRect); null só no que ele também não desenha', () => {
    expect(lerJanela({ x: 0.2, y: 0.1, width: 0.5, height: 0.6 })).toEqual({ x: 0.2, y: 0.1, width: 0.5, height: 0.6 })
    // O crop que o renderer aceita por clamp (Codex, rodada 1, P2 #7): a MESMA faixa que ele mostra, nunca ignorado.
    const foto = { width: 2000, height: 1000 }
    const caixa = { width: 500, height: 500 }
    // Inclusive a faixa na borda abaixo de 1 % depois do clamp (Codex, rodada 2: 10 px de 2000), nos dois eixos.
    for (const cru of [{ x: 0.9, y: 0, width: 0.5, height: 0.5 }, { x: 0.995, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0.998, width: 0.5, height: 0.5 }, { x: 0.2, y: 0.1, width: 0.005, height: 0.6 }, { x: -0.1, y: 0.1, width: 0.5, height: 0.6 }]) {
      const lida = lerJanela(cru)!
      expect(lida).not.toBeNull()
      expect(janelaEmPx(lida, foto)).toEqual(resolveImageSourceRect(foto, caixa, { objectFit: 'cover', crop: cru }))
    }
    expect(lerJanela({ x: 0.9, y: 0, width: 0.5, height: 0.5 })).toEqual({ x: 0.9, y: 0, width: 1 - 0.9, height: 0.5 })
    // Nada sobra depois do clamp (x = 1), lado zero ou negativo: o renderer cai na âncora — aqui, null.
    expect(lerJanela({ x: 1, y: 0.1, width: 0.5, height: 0.6 })).toBeNull()
    expect(lerJanela({ x: 0.2, y: 0.1, width: 0, height: 0.6 })).toBeNull()
    expect(lerJanela({ x: NaN, y: 0.1, width: 0.5, height: 0.6 })).toBeNull()
    expect(lerJanela([0.2, 0.1, 0.5, 0.6])).toBeNull()
    expect(lerJanela('center-middle')).toBeNull()
    const e = janelaEfetiva({ x: 0.99, y: 0, width: 0.5, height: 0.5 })
    expect(e.x).toBe(0.99)
    expect(e.width).toBeCloseTo(0.01, 9)
    expect(e.height).toBe(0.5)
  })

  it('corteDaEscolha: o rótulo gravado vira janela pela caixa; a janela gravada é reproduzida; ilegível é null', () => {
    expect(corteDaEscolha({ corte: 'center-bottom' }, ALTA, STORY)).toEqual(corteDoRotulo(ALTA, STORY, 'center-bottom'))
    const j = { x: 0.177, y: 0.058, width: 0.624, height: 0.742 }
    expect(corteDaEscolha({ corte: 'janela', janela: j }, ALTA, STORY)).toEqual({ janela: j })
    expect(corteDaEscolha({ corte: 'janela' }, ALTA, STORY)).toBeNull()
  })
})

describe('proporção em px', () => {
  it('a janela do Brunch (na proporção do story) passa sem ajuste; uma quadrada é alargada ou alteada ao mínimo, centrada', () => {
    const brunch = { x: 0.177, y: 0.058, width: 0.624, height: 0.742 }
    const r = janelaNaProporcao(brunch, ALTA, STORY)!
    expect(r.ajustada).toBe(false)
    expect(r.janela).toEqual(brunch)
    // Quadrada em px numa foto alta: para o story (9:16) precisa de mais altura → cresce em y, centrada.
    const quadrada = { x: 0.2, y: 0.3, width: 0.5, height: 0.5 * (ALTA.width / ALTA.height) }
    const q = janelaNaProporcao(quadrada, ALTA, STORY)!
    expect(q.ajustada).toBe(true)
    perto((q.janela.width * ALTA.width) / (q.janela.height * ALTA.height), STORY.width / STORY.height, 1e-9)
    expect(q.janela.width).toBe(quadrada.width)
    perto(q.janela.y + q.janela.height / 2, quadrada.y + quadrada.height / 2)
  })

  it('o que não cabe na foto depois da expansão é null; o que só precisa deslizar, desliza', () => {
    // Faixa larga no topo de uma foto quadrada: para o story a altura teria de passar de 1 → null.
    expect(janelaNaProporcao({ x: 0, y: 0, width: 1, height: 0.2 }, LARGA, STORY)).toBeNull()
    // Perto da borda: a expansão centrada sairia da foto, então desliza para dentro.
    const r = janelaNaProporcao({ x: 0.5, y: 0.9, width: 0.5, height: 0.1 }, LARGA, FEED)!
    expect(r.janela.y + r.janela.height).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.janela.x + r.janela.width).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('escalaDaJanela conta a janela-fonte: metade da foto numa caixa do tamanho da foto amplia 2×', () => {
    expect(escalaDaJanela({ x: 0, y: 0, width: 0.5, height: 0.5 }, { width: 1080, height: 1080 }, { width: 1080, height: 1080 })).toBe(2)
  })
})
