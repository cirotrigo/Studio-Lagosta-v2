/**
 * A recomposição por zona (17/11/2026): com o gerador que edita sem redesenhar
 * a imagem inteira, o que mudou fica e o resto é a origem pixel por pixel.
 * Peças sintéticas: uma "foto" texturizada, letras em barras, e uma "geração"
 * em outro tamanho (como o Nano Banana devolve) com ruído leve na foto.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { geradorDaMelhoria } from '../gerador-da-melhoria'
import { mudancaNaoEntrou, PISO_DE_MUDANCA, recomporPorZona } from '../recompor-por-zona'

const W = 432
const H = 768

/** Ruído determinístico em 0..1. */
function ruido(x: number, y: number, semente: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + semente * 37.719) * 43758.5453
  return v - Math.floor(v)
}

/** Fundo escuro com um "prato" texturizado no meio. `semente` muda só um ruído leve, como o gerador que mantém a foto. */
function foto(semente: number): Buffer {
  const raw = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const noPrato = (x - W / 2) ** 2 + (y - H / 2) ** 2 < 130 ** 2
      const grosso = ruido(Math.floor(x / 9), Math.floor(y / 9), 1) * 150
      const v = (noPrato ? 60 + grosso : 30) + ruido(x, y, semente) * 6
      raw[i] = Math.min(255, v + (noPrato ? 40 : 0))
      raw[i + 1] = Math.min(255, v)
      raw[i + 2] = Math.min(255, v * 0.6)
    }
  }
  return raw
}

type Cor = [number, number, number]
const BRANCO: Cor = [255, 255, 255]
/** Fora de qualquer paleta de marca: o filtro de tinta do caminho antigo recusaria. */
const ROXO: Cor = [150, 60, 200]

function pintar(raw: Buffer, x0: number, y0: number, x1: number, y1: number, cor: Cor): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) raw.set(cor, (y * W + x) * 3)
}

/** "Letras": barras verticais de 3px, em duas linhas. */
function escrever(raw: Buffer, x0: number, y0: number, cor: Cor): void {
  for (const linha of [0, 34]) for (let x = x0; x < x0 + 220; x += 7) pintar(raw, x, y0 + linha, x + 3, y0 + linha + 22, cor)
}

/** Elemento gráfico novo e FINO: barras de 2px com alturas variadas, espaçadas (onda sonora). Preenche ~15% da própria caixa. */
function ondaSonora(raw: Buffer, x0: number, y0: number, cor: Cor): void {
  for (let k = 0; k < 18; k++) {
    const altura = 10 + ((k * 7) % 5) * 8
    pintar(raw, x0 + k * 12, y0 - altura / 2, x0 + k * 12 + 2, y0 + altura / 2, cor)
  }
}

const png = (raw: Buffer) => sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
/** Como o Nano Banana: 2K, proporção quase igual (0,8% mais alta). */
const pngEmOutroTamanho = (raw: Buffer) =>
  sharp(raw, { raw: { width: W, height: H, channels: 3 } }).resize(Math.round(W * 1.42), Math.round(H * 1.42 * 1.008), { fit: 'fill' }).png().toBuffer()
const cru = (buf: Buffer) => sharp(buf).removeAlpha().raw().toBuffer()

/** Pixels de uma caixa em que a saída difere da referência por mais que `tolerancia`. */
function difere(saida: Buffer, referencia: Buffer, x0: number, y0: number, x1: number, y1: number, tolerancia = 0): number {
  let n = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3
      if (Math.abs(saida[i] - referencia[i]) > tolerancia || Math.abs(saida[i + 1] - referencia[i + 1]) > tolerancia || Math.abs(saida[i + 2] - referencia[i + 2]) > tolerancia) n++
    }
  return n
}

describe('recomporPorZona', () => {
  it('preserva o elemento gráfico novo e fino, sem cor de tinta', async () => {
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, BRANCO)
    const geradaRaw = foto(2)
    escrever(geradaRaw, 60, 40, BRANCO)
    ondaSonora(geradaRaw, 60, 150, ROXO)

    const r = await recomporPorZona(await png(origemRaw), await pngEmOutroTamanho(geradaRaw))
    const saida = await cru(r.buffer)

    expect(r.zonas).toBeGreaterThan(0)
    expect(mudancaNaoEntrou(r.fracaoDasZonas)).toBe(false)
    // As barras roxas estão na saída: nas colunas da onda, pixel arroxeado.
    let roxos = 0
    for (let y = 125; y < 175; y++)
      for (let x = 60; x < 280; x++) {
        const i = (y * W + x) * 3
        if (saida[i + 2] > 120 && saida[i + 2] > saida[i + 1] + 50) roxos++
      }
    expect(roxos).toBeGreaterThan(300)
  })

  it('fora das zonas a foto é a da origem, pixel por pixel', async () => {
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, BRANCO)
    const geradaRaw = foto(2)
    escrever(geradaRaw, 60, 40, BRANCO)
    ondaSonora(geradaRaw, 60, 150, ROXO)

    const r = await recomporPorZona(await png(origemRaw), await pngEmOutroTamanho(geradaRaw))
    const saida = await cru(r.buffer)

    // O prato inteiro (a comida) e o texto que não mudou.
    expect(difere(saida, origemRaw, 0, 250, W, H)).toBe(0)
    expect(difere(saida, origemRaw, 40, 30, 300, 100)).toBe(0)
    expect(r.diferencaFora).toBe(0)
    // A peça gerada diferia da origem (ruído e reamostragem) antes de recompor.
    expect(r.diferencaForaAntes).toBeGreaterThan(0)
    expect(r.fracaoDasZonas).toBeLessThan(0.15)
  })

  it('texto que mudou de lugar: sai o antigo, entra o novo', async () => {
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, BRANCO)
    const geradaRaw = foto(2)
    escrever(geradaRaw, 110, 650, BRANCO)

    const saida = await cru((await recomporPorZona(await png(origemRaw), await png(geradaRaw))).buffer)
    const branco = (x: number, y: number) => saida[(y * W + x) * 3] > 230 && saida[(y * W + x) * 3 + 2] > 230
    expect(branco(111, 660)).toBe(true)
    expect(branco(61, 50)).toBe(false)
  })

  it('a mudança pedida não entrou: a peça gerada é a origem com ruído', async () => {
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, BRANCO)
    const geradaRaw = foto(2)
    escrever(geradaRaw, 60, 40, BRANCO)

    const r = await recomporPorZona(await png(origemRaw), await pngEmOutroTamanho(geradaRaw))
    expect(r.zonas).toBe(0)
    expect(r.fracaoDasZonas).toBeLessThan(PISO_DE_MUDANCA)
    expect(mudancaNaoEntrou(r.fracaoDasZonas)).toBe(true)
    expect(difere(await cru(r.buffer), origemRaw, 0, 0, W, H)).toBe(0)
  })
})

describe('a logo é a da origem', () => {
  const [LW, LH] = [120, 60]
  /** Logo com desenho por dentro: placa vermelha arredondada com letras brancas. `borrada` estraga as letras, como o gerador faz. */
  function logo(borrada = false): Buffer {
    const raw = Buffer.alloc(LW * LH * 4)
    for (let y = 0; y < LH; y++)
      for (let x = 0; x < LW; x++) {
        const dentro = Math.hypot(Math.max(0, Math.abs(x - LW / 2) - LW / 2 + 18), Math.max(0, Math.abs(y - LH / 2) - LH / 2 + 18)) < 18
        if (!dentro) continue
        // Um "R" grosseiro e um traço: desenho sem período, para não casar com as barras do texto.
        const letra = borrada
          ? (x + y) % 9 < 3 && y > 18 && y < 44
          : (x > 22 && x < 30 && y > 14 && y < 46) || (x >= 30 && x < 52 && ((y > 14 && y < 21) || (y > 27 && y < 34))) || (x > 46 && x < 54 && y > 14 && y < 34) || (Math.abs(x - 36 - (y - 34)) < 4 && y >= 34 && y < 46) || (x > 64 && x < 100 && y > 36 && y < 44)
        raw.set(letra ? [255, 255, 255, 255] : [200, 20, 30, 255], (y * LW + x) * 4)
      }
    return raw
  }
  function colar(raw: Buffer, l: Buffer, x0: number, y0: number): void {
    for (let y = 0; y < LH; y++)
      for (let x = 0; x < LW; x++) {
        const p = (y * LW + x) * 4
        if (l[p + 3]) raw.set([l[p], l[p + 1], l[p + 2]], ((y0 + y) * W + x0 + x) * 3)
      }
  }

  it('a logo que o gerador estragou volta a ser a da origem; a mudança ao lado fica', async () => {
    const arquivo = await sharp(logo(), { raw: { width: LW, height: LH, channels: 4 } }).png().toBuffer()
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, BRANCO)
    colar(origemRaw, logo(), 280, 680)
    const geradaRaw = foto(2)
    escrever(geradaRaw, 60, 40, BRANCO)
    ondaSonora(geradaRaw, 60, 150, ROXO)
    colar(geradaRaw, logo(true), 280, 680)

    const [origem, gerada] = [await png(origemRaw), await png(geradaRaw)]
    const sem = await recomporPorZona(origem, gerada)
    const com = await recomporPorZona(origem, gerada, { logo: arquivo })

    expect(com.logo?.protegida).toBe(true)
    expect(difere(await cru(com.buffer), origemRaw, 270, 670, 410, 750)).toBe(0)
    // Sem o arquivo da logo, a versão estragada passaria.
    expect(difere(await cru(sem.buffer), origemRaw, 270, 670, 410, 750, 40)).toBeGreaterThan(100)
    // A onda sonora, longe da logo, continua vindo da peça gerada.
    expect(difere(await cru(com.buffer), origemRaw, 60, 125, 280, 175, 40)).toBeGreaterThan(300)
  })

  it('zona de texto não passa por logo', async () => {
    const arquivo = await sharp(logo(), { raw: { width: LW, height: LH, channels: 4 } }).png().toBuffer()
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, BRANCO)
    const geradaRaw = foto(2)
    escrever(geradaRaw, 110, 650, BRANCO)
    const r = await recomporPorZona(await png(origemRaw), await png(geradaRaw), { logo: arquivo })
    expect(r.logo?.protegida).toBe(false)
  })
})

describe('geradorDaMelhoria', () => {
  it('o padrão é openai: só `gemini` troca', () => {
    expect(geradorDaMelhoria(undefined)).toBe('openai')
    expect(geradorDaMelhoria('')).toBe('openai')
    expect(geradorDaMelhoria('nano-banana')).toBe('openai')
    expect(geradorDaMelhoria(' Gemini ')).toBe('gemini')
  })
})
