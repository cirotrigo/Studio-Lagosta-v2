/**
 * CP3 — a medida PURA da legibilidade da logo, as variantes autorizadas e a
 * escolha determinística. Rasters sintéticos em memória; sem banco, sem rede.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { CreativeError } from '@/lib/creatives/errors'
import {
  ALFA_VISIVEL_DA_LOGO,
  LIMIAR_DE_CONTRASTE_DA_LOGO,
  LOGO_INDISPONIVEL,
  PERCENTIL_DA_LOGO,
  bytesDaLogo,
  escolherLogoLegivel,
  luz709,
  medirLegibilidadeDaLogo,
  medirLogoNoFundo,
  rasterDaLogo,
  razaoDoArquivo,
  variantesAutorizadasDaLogo,
  type AvaliacaoDaLogo,
  type RasterRGB,
  type RasterRGBA,
  type VarianteDaLogo,
} from '../legibilidade-da-logo'

/** Fundo uniforme (ou por função) em RGB, resolução cheia. */
function fundo(largura: number, altura: number, cor: (x: number, y: number) => [number, number, number]): RasterRGB {
  const data = Buffer.alloc(largura * altura * 3)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [r, g, b] = cor(x, y)
      const p = (y * largura + x) * 3
      data[p] = r
      data[p + 1] = g
      data[p + 2] = b
    }
  }
  return { data, width: largura, height: altura, channels: 3 }
}

const cinza = (v: number): [number, number, number] => [v, v, v]

/**
 * Logo RGBA: `tinta(x, y)` dá a cor (ou `null` = transparente). O desenho
 * padrão é o mesmo da `logoSintetica` do CP0: um anel e uma barra opacos.
 */
function logo(largura: number, altura: number, tinta: (x: number, y: number) => [number, number, number, number] | null): RasterRGBA {
  const data = Buffer.alloc(largura * altura * 4)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const t = tinta(x, y)
      const p = (y * largura + x) * 4
      if (!t) continue
      data[p] = t[0]
      data[p + 1] = t[1]
      data[p + 2] = t[2]
      data[p + 3] = t[3]
    }
  }
  return { data, width: largura, height: altura, channels: 4 }
}

const anelEBarra = (x: number, y: number) => {
  const d = Math.hypot(x - 40, y - 40)
  return (d < 36 && d > 22) || (x > 90 && x < 150 && y > 30 && y < 50)
}
const logoLisa = (v: number, alfa = 255) => logo(160, 80, (x, y) => (anelEBarra(x, y) ? [v, v, v, alfa] : null))

describe('o contrato', () => {
  it('as constantes são as do owner: alfa 128, limiar 45, p10', () => {
    expect(ALFA_VISIVEL_DA_LOGO).toBe(128)
    expect(LIMIAR_DE_CONTRASTE_DA_LOGO).toBe(45)
    expect(PERCENTIL_DA_LOGO).toBe(0.1)
    expect(luz709(255, 255, 255)).toBeCloseTo(255)
    expect(luz709(0, 0, 0)).toBe(0)
  })
})

describe('medirLegibilidadeDaLogo', () => {
  const F = fundo(400, 300, () => cinza(0))

  it('1. logo clara sobre fundo escuro passa', () => {
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 10, y: 10 }, fundo: fundo(400, 300, () => cinza(20)) })!
    expect(m.legivel).toBe(true)
    expect(m.contrasteP10).toBeCloseTo(220)
    expect(m.proporcaoAcima45).toBe(1)
  })

  it('2. logo escura sobre fundo claro passa', () => {
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(20), posicao: { x: 10, y: 10 }, fundo: fundo(400, 300, () => cinza(235)) })!
    expect(m.legivel).toBe(true)
    expect(m.contrasteP10).toBeCloseTo(215)
  })

  it('3. clara sobre claro falha', () => {
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 10, y: 10 }, fundo: fundo(400, 300, () => cinza(215)) })!
    expect(m.legivel).toBe(false)
    expect(m.contrasteP10).toBeCloseTo(25)
  })

  it('4. escura sobre escuro falha', () => {
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(30), posicao: { x: 10, y: 10 }, fundo: fundo(400, 300, () => cinza(45)) })!
    expect(m.legivel).toBe(false)
    expect(m.contrasteP10).toBeCloseTo(15)
  })

  it('18. cinza sobre cinza é detectado', () => {
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(128), posicao: { x: 10, y: 10 }, fundo: fundo(400, 300, () => cinza(128)) })!
    expect(m.legivel).toBe(false)
    expect(m.contrasteP10).toBe(0)
    expect(m.contrasteMedio).toBe(0)
    expect(m.proporcaoAcima45).toBe(0)
  })

  it('5. uma margem transparente grande não altera a medida; pixel com alfa abaixo de 128 não conta', () => {
    const justa = medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 10, y: 10 }, fundo: F })!
    // A mesma logo num arquivo 4× maior, com o desenho no canto e o resto transparente.
    const folgada = logo(640, 320, (x, y) => (anelEBarra(x, y) ? [240, 240, 240, 255] : [0, 0, 0, 0]))
    const m = medirLegibilidadeDaLogo({ logo: folgada, posicao: { x: 10, y: 10 }, fundo: F })!
    expect(m).toEqual(justa)
    // Alfa 127 é transparente para a medida: a "margem" com alfa fraco também não entra.
    const comMargemFraca = logo(640, 320, (x, y) => (anelEBarra(x, y) ? [240, 240, 240, 255] : [240, 240, 240, 127]))
    expect(medirLegibilidadeDaLogo({ logo: comMargemFraca, posicao: { x: 10, y: 10 }, fundo: F })).toEqual(justa)
    // Alfa 128 já conta.
    const comMargemVisivel = logo(640, 320, (x, y) => (anelEBarra(x, y) ? [240, 240, 240, 255] : [240, 240, 240, 128]))
    // (a logo de 640×320 pousada em (10,10) sai do fundo de 400×300: só os 390×290 pixels dentro contam)
    expect(medirLegibilidadeDaLogo({ logo: comMargemVisivel, posicao: { x: 10, y: 10 }, fundo: F })!.pixelsAvaliados).toBe(390 * 290)
  })

  it('6. média boa e p10 ruim REPROVA: a média não salva a logo', () => {
    // 85% dos pixels visíveis com contraste 200; 15% com contraste 10 (a parte da logo que some no fundo).
    const l = logo(200, 100, (x, y) => (x < 170 ? [255, 255, 255, 255] : [10, 10, 10, 255]))
    const m = medirLegibilidadeDaLogo({ logo: l, posicao: { x: 0, y: 0 }, fundo: fundo(200, 100, () => cinza(0)) })!
    expect(m.contrasteMedio).toBeGreaterThan(LIMIAR_DE_CONTRASTE_DA_LOGO)
    expect(m.proporcaoAcima45).toBeCloseTo(0.85)
    expect(m.contrasteP10).toBe(10)
    expect(m.legivel).toBe(false)
  })

  it('o fundo é lido no MESMO pixel: a metade da logo sobre a metade clara do fundo é o que decide', () => {
    const F2 = fundo(400, 300, (x) => cinza(x < 90 ? 0 : 240))
    // Logo clara em x 10..170: a parte sobre o fundo claro (x ≥ 90) não lê.
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 10, y: 10 }, fundo: F2 })!
    expect(m.legivel).toBe(false)
    expect(m.proporcaoAcima45).toBeGreaterThan(0.3)
    expect(m.proporcaoAcima45).toBeLessThan(0.7)
  })

  it('logo fora do fundo ou toda transparente: sem o que medir (null), não "ilegível"', () => {
    expect(medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 1000, y: 1000 }, fundo: F })).toBeNull()
    expect(medirLegibilidadeDaLogo({ logo: logoLisa(240, 0), posicao: { x: 10, y: 10 }, fundo: F })).toBeNull()
  })

  it('a posição é arredondada e o recorte na borda do fundo conta só os pixels dentro', () => {
    const m = medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 300.4, y: 250.6 }, fundo: F })!
    const inteira = medirLegibilidadeDaLogo({ logo: logoLisa(240), posicao: { x: 10, y: 10 }, fundo: F })!
    expect(m.pixelsAvaliados).toBeLessThan(inteira.pixelsAvaliados)
    expect(m.pixelsAvaliados).toBeGreaterThan(0)
  })
})

describe('variantesAutorizadasDaLogo (10)', () => {
  it('a explícita vem primeiro; depois só as linhas isProjectLogo; sem repetir arquivo; nada fabricado', () => {
    const v = variantesAutorizadasDaLogo({
      explicita: { origem: 'pagina', url: 'https://blob/pagina.png' },
      doProjeto: [
        { fileUrl: 'https://blob/parceiro.png', isProjectLogo: false },
        { fileUrl: 'https://blob/principal.png', isProjectLogo: true },
        { fileUrl: 'https://blob/pagina.png', isProjectLogo: true },
        { fileUrl: 'https://blob/campanha.png', isProjectLogo: false },
      ],
    })
    expect(v).toEqual([
      { origem: 'pagina', url: 'https://blob/pagina.png' },
      { origem: 'projeto', url: 'https://blob/principal.png' },
    ])
  })

  it('sem página e sem principal, nenhuma variante — uma linha sem a marca nunca entra', () => {
    expect(variantesAutorizadasDaLogo({ explicita: null, doProjeto: [{ fileUrl: 'https://blob/x.png', isProjectLogo: false }] })).toEqual([])
    expect(variantesAutorizadasDaLogo({ explicita: null, doProjeto: [{ fileUrl: 'https://blob/x.png' }] })).toEqual([{ origem: 'projeto', url: 'https://blob/x.png' }])
  })
})

describe('escolherLogoLegivel', () => {
  const V1 = { origem: 'pagina' as const, url: 'a' }
  const V2 = { origem: 'projeto' as const, url: 'b' }
  const R = { x: 0, y: 0, width: 10, height: 10 }
  const av = (variante: VarianteDaLogo, canto: AvaliacaoDaLogo['canto'], estado: AvaliacaoDaLogo['estado'], p10 = 0): AvaliacaoDaLogo => ({
    variante,
    canto,
    posicao: R,
    estado,
    medida: estado === 'legivel' || estado === 'ilegivel' ? { pixelsAvaliados: 100, contrasteP10: p10, contrasteMedio: p10, proporcaoAcima45: p10 >= 45 ? 1 : 0, luzDaLogo: 0, luzDoFundo: 0, legivel: p10 >= 45 } : null,
  })

  it('7. a explícita que passa é mantida mesmo com outra de p10 maior', () => {
    const r = escolherLogoLegivel([av(V1, 'inferior-direito', 'legivel', 50), av(V2, 'inferior-direito', 'legivel', 200)])
    expect(r.escolha?.variante).toEqual(V1)
  })

  it('8. a explícita falha e a alternativa autorizada passa: a alternativa', () => {
    const r = escolherLogoLegivel([av(V1, 'inferior-direito', 'ilegivel', 20), av(V2, 'inferior-direito', 'legivel', 90)])
    expect(r.escolha?.variante).toEqual(V2)
  })

  it('9. nenhuma passa: sem escolha; indisponível NÃO conta como "nenhuma lê"', () => {
    const r = escolherLogoLegivel([av(V1, 'inferior-direito', 'ilegivel', 20), av(V2, 'inferior-direito', 'ilegivel', 30)])
    expect(r.escolha).toBeNull()
    expect(r.indisponiveis).toEqual([])
    const r2 = escolherLogoLegivel([av(V1, 'inferior-direito', 'ilegivel', 20), av(V2, 'inferior-direito', 'indisponivel')])
    expect(r2.escolha).toBeNull()
    expect(r2.indisponiveis).toEqual([V2])
  })

  it('11. a ordem elimina antes de preferir: o canto preferido (primeiro) ilegível não vence o segundo legível', () => {
    const r = escolherLogoLegivel([av(V1, 'inferior-esquerdo', 'ilegivel', 10), av(V1, 'superior-direito', 'legivel', 80)])
    expect(r.escolha?.canto).toBe('superior-direito')
  })
})

describe('E/S', () => {
  it('rasterDaLogo estica para a caixa como o render (sem letterbox) e preserva o alfa', async () => {
    const png = await sharp(logoLisa(240).data, { raw: { width: 160, height: 80, channels: 4 } }).png().toBuffer()
    const r = await rasterDaLogo(png, { width: 320, height: 80 })
    expect([r.width, r.height, r.channels]).toEqual([320, 80, 4])
    // O anel (x≈40 no arquivo) agora está em x≈80 e a barra (x 90..150) em x 180..300.
    const alfaEm = (x: number, y: number) => r.data[(y * r.width + x) * 4 + 3]
    expect(alfaEm(80 + 58, 40)).toBeGreaterThan(200)
    expect(alfaEm(240, 40)).toBeGreaterThan(200)
    expect(alfaEm(10, 10)).toBe(0)
    expect(await razaoDoArquivo(png)).toBe(0.5)
  })

  it('medirLogoNoFundo = rasterDaLogo + medida pura', async () => {
    const png = await sharp(logoLisa(240).data, { raw: { width: 160, height: 80, channels: 4 } }).png().toBuffer()
    const m = await medirLogoNoFundo({ bytes: png, rect: { x: 10, y: 10, width: 160, height: 80 }, fundo: fundo(400, 300, () => cinza(20)) })
    expect(m?.legivel).toBe(true)
  })

  it('16. asset quebrado é LOGO_INDISPONIVEL (etapa decodificação), nunca "sem contraste"', async () => {
    await expect(rasterDaLogo(Buffer.from('isto não é uma imagem'), { width: 10, height: 10 }, 'https://blob/x.png')).rejects.toMatchObject({ code: LOGO_INDISPONIVEL, status: 503, details: { etapa: 'decodificacao', url: 'https://blob/x.png' } })
    await expect(razaoDoArquivo(Buffer.from('nada'))).rejects.toMatchObject({ code: LOGO_INDISPONIVEL })
    await expect(bytesDaLogo('data:image/png')).rejects.toMatchObject({ code: LOGO_INDISPONIVEL, details: { etapa: 'download' } })
    const erro = await bytesDaLogo('http://127.0.0.1:9/logo.png').catch((e) => e)
    expect(erro).toBeInstanceOf(CreativeError)
    expect(erro.code).toBe(LOGO_INDISPONIVEL)
  })

  it('bytesDaLogo decodifica data URL em base64 sem rede', async () => {
    const png = await sharp(logoLisa(240).data, { raw: { width: 160, height: 80, channels: 4 } }).png().toBuffer()
    const bytes = await bytesDaLogo(`data:image/png;base64,${png.toString('base64')}`)
    expect(bytes.equals(png)).toBe(true)
  })
})
