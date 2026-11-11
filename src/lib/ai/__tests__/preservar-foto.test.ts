/**
 * A melhoria em `rediagramar`/`refinar` não pode trocar a foto (11/11/2026).
 * O gerador redesenha a imagem inteira; a recomposição devolve a origem em
 * tudo o que não é bloco de texto. Peças sintéticas: uma "foto" texturizada,
 * letras brancas em barras finas, e uma "geração" que redesenha a foto toda e
 * muda o texto de lugar.
 */
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
vi.mock('@/lib/db', () => ({ db: { generation: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))

import { deslocamentoDaFoto, preservarFotoDaOrigem, TETO_DA_MASCARA } from '../preservar-foto'

const W = 432
const H = 768

/** Ruído determinístico em 0..1. */
function ruido(x: number, y: number, semente: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + semente * 37.719) * 43758.5453
  return v - Math.floor(v)
}

/** Fundo escuro liso com um "prato" texturizado no meio (a comida). `dy` desloca o prato. */
function foto(semente: number, dy = 0): Buffer {
  const raw = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const noPrato = (x - W / 2) ** 2 + (y - dy - H / 2) ** 2 < 130 ** 2
      // A comida tem a mesma estrutura grossa nas duas versões e textura fina diferente.
      const grosso = ruido(Math.floor(x / 9), Math.floor((y - dy) / 9), 1) * 150
      const fino = ruido(x, y, semente) * 70
      const v = noPrato ? 40 + grosso + fino : 30
      raw[i] = Math.min(255, v + (noPrato ? 40 : 0))
      raw[i + 1] = Math.min(255, v)
      raw[i + 2] = Math.min(255, v * 0.6)
    }
  }
  return raw
}

/** "Letras": barras verticais de 3px, em duas linhas, na cor dada. */
function escrever(raw: Buffer, x0: number, y0: number, cor: [number, number, number]): void {
  for (const linha of [0, 34]) {
    for (let x = x0; x < x0 + 220; x += 7) {
      for (let y = y0 + linha; y < y0 + linha + 22; y++) {
        for (let k = 0; k < 3; k++) {
          const i = (y * W + x + k) * 3
          raw[i] = cor[0]
          raw[i + 1] = cor[1]
          raw[i + 2] = cor[2]
        }
      }
    }
  }
}

const png = (raw: Buffer) => sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
const cru = (buf: Buffer) => sharp(buf).removeAlpha().raw().toBuffer()
const BRANCO: [number, number, number] = [255, 255, 255]

async function cenario() {
  const origemRaw = foto(1)
  escrever(origemRaw, 60, 40, BRANCO)
  const geradaRaw = foto(2) // a comida redesenhada: mesma forma, outra textura
  escrever(geradaRaw, 110, 650, BRANCO) // o texto foi para o rodapé
  return { origemRaw, geradaRaw, origem: await png(origemRaw), gerada: await png(geradaRaw) }
}

describe('preservarFotoDaOrigem', () => {
  it('devolve a foto da origem pixel por pixel fora dos blocos de texto', async () => {
    const { origemRaw, geradaRaw, origem, gerada } = await cenario()
    const r = await preservarFotoDaOrigem(origem, gerada)
    const saida = await cru(r.buffer)

    // A comida inteira (o prato) é a da ORIGEM, e não a que o gerador redesenhou.
    let iguaisAOrigem = 0
    let iguaisAGerada = 0
    let pixels = 0
    for (let y = H / 2 - 120; y < H / 2 + 120; y++) {
      for (let x = W / 2 - 40; x < W / 2 + 40; x++) {
        const i = (y * W + x) * 3
        pixels++
        if (saida[i] === origemRaw[i] && saida[i + 1] === origemRaw[i + 1] && saida[i + 2] === origemRaw[i + 2]) iguaisAOrigem++
        if (saida[i] === geradaRaw[i] && saida[i + 1] === geradaRaw[i + 1]) iguaisAGerada++
      }
    }
    expect(iguaisAOrigem).toBe(pixels)
    expect(iguaisAGerada).toBeLessThan(pixels * 0.05)
    // A geração mexeu na foto toda; depois da recomposição, nada fora da máscara difere.
    expect(r.diferencaForaAntes).toBeGreaterThan(1)
    expect(r.diferencaFora).toBe(0)
    expect(r.fracaoDaMascara).toBeGreaterThan(0.03)
    expect(r.fracaoDaMascara).toBeLessThan(TETO_DA_MASCARA)
  })

  it('leva o texto novo e tira o texto antigo', async () => {
    const { origem, gerada } = await cenario()
    const saida = await cru((await preservarFotoDaOrigem(origem, gerada)).buffer)
    const branco = (x: number, y: number) => saida[(y * W + x) * 3] > 230 && saida[(y * W + x) * 3 + 2] > 230
    expect(branco(111, 660)).toBe(true) // letra nova, no rodapé
    expect(branco(61, 50)).toBe(false) // onde a letra antiga estava, agora é o fundo que o gerador pintou
  })

  it('no rigor estrito, mudança chapada que não tem cor de tinta volta à origem', async () => {
    const { origemRaw, origem } = await cenario()
    const geradaRaw = foto(2)
    escrever(geradaRaw, 110, 650, BRANCO)
    // Uma "tira de queijo" amarela, chapada, que o gerador inventou ao lado do prato.
    for (let y = 300; y < 360; y++) for (let x = 20; x < 70; x++) geradaRaw.set([235, 215, 120], (y * W + x) * 3)
    const gerada = await png(geradaRaw)

    const estrito = await cru((await preservarFotoDaOrigem(origem, gerada)).buffer)
    const folgado = await cru((await preservarFotoDaOrigem(origem, gerada, { folgado: true })).buffer)
    const i = (330 * W + 45) * 3
    expect(estrito[i]).toBe(origemRaw[i])
    expect(folgado[i]).toBeGreaterThan(220) // o casamento de tom mexe um nível
  })

  it('aceita a cor da marca como tinta', async () => {
    const origemRaw = foto(1)
    escrever(origemRaw, 60, 40, [239, 106, 0])
    const geradaRaw = foto(2)
    escrever(geradaRaw, 110, 650, [239, 106, 0])
    const [origem, gerada] = await Promise.all([png(origemRaw), png(geradaRaw)])
    const semMarca = await preservarFotoDaOrigem(origem, gerada)
    const comMarca = await preservarFotoDaOrigem(origem, gerada, { coresDaMarca: ['#EF6A00'] })
    expect(semMarca.blocos).toBe(0)
    expect(comMarca.blocos).toBeGreaterThan(0)
    const saida = await cru(comMarca.buffer)
    expect(saida[(660 * W + 111) * 3]).toBeGreaterThan(220)
  })

  it('sai no tamanho final pedido', async () => {
    const { origem, gerada } = await cenario()
    const r = await preservarFotoDaOrigem(origem, await sharp(gerada).resize(440, 782, { fit: 'fill' }).png().toBuffer(), {
      tamanho: { width: W, height: H },
    })
    const meta = await sharp(r.buffer).metadata()
    expect([meta.width, meta.height]).toEqual([W, H])
    expect(r.diferencaFora).toBe(0)
  })
})

describe('deslocamentoDaFoto', () => {
  it('não acusa a foto que ficou no lugar, mesmo redesenhada e com o texto movido', async () => {
    const { origem, gerada } = await cenario()
    expect((await deslocamentoDaFoto(origem, gerada)).deslocada).toBe(false)
  })

  it('acusa o assunto que desceu no quadro', async () => {
    const origem = await png(foto(1))
    const gerada = await png(foto(2, Math.round(H * 0.07)))
    const d = await deslocamentoDaFoto(origem, gerada)
    expect(d.deslocada).toBe(true)
    expect(d.maior).toBeGreaterThan(0.04)
  })
})

describe('arteDeReferenciaDaFoto', () => {
  beforeEach(() => findUnique.mockReset())
  const elo = (source: string, sourceGenerationId: string | null, extra: Record<string, unknown> = {}) => ({
    resultUrl: `https://blob/${sourceGenerationId ?? 'raiz'}-pai.jpg`,
    sourceGenerationId,
    fieldValues: { source, ...extra },
  })

  it('sobe a cadeia de melhorias até a arte original', async () => {
    const { arteDeReferenciaDaFoto } = await import('../creative-improvement-runner')
    findUnique
      .mockResolvedValueOnce({ ...elo('ai_improvement', 'm1'), resultUrl: 'https://blob/m2.jpg' })
      .mockResolvedValueOnce({ ...elo('ai_improvement', 'raiz'), resultUrl: 'https://blob/m1.jpg' })
      .mockResolvedValueOnce({ ...elo('post-midia', null), resultUrl: 'https://blob/raiz.png' })
    expect(await arteDeReferenciaDaFoto('m2')).toBe('https://blob/raiz.png')
  })

  it('para no elo que mudou a foto de propósito', async () => {
    const { arteDeReferenciaDaFoto } = await import('../creative-improvement-runner')
    findUnique
      .mockResolvedValueOnce({ ...elo('ai_improvement', 'm1'), resultUrl: 'https://blob/m2.jpg' })
      .mockResolvedValueOnce({ ...elo('ai_improvement', 'raiz', { instrucaoImagem: 'uma mão dando uma colherada' }), resultUrl: 'https://blob/m1.jpg' })
    expect(await arteDeReferenciaDaFoto('m2')).toBe('https://blob/m1.jpg')
    expect(findUnique).toHaveBeenCalledTimes(2)
  })
})
