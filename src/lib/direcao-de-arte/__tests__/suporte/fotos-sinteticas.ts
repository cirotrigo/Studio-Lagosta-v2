/**
 * Piloto sintético (§ 1.2 do contrato) — as FOTOS SINTÉTICAS com assunto POR CONSTRUÇÃO. Determinísticas por semente (PRNG
 * próprio), geradas em memória com `sharp` a partir de um raster RGB: nenhuma foto de cliente entra no lote.
 *
 *  A1 assunto forte localizado (região de alto contraste/textura, caixa CONHECIDA) · A2 assunto de BAIXO contraste (a estimativa
 *  tende a errar — o caso que a decisão 1 precisa) · B textura difusa sem região forte (`naoSeAplica` esperado) · C fundo liso
 *  claro · D fundo liso escuro · E gradiente vertical claro → escuro · F ruído em toda a área (o pior caso da régua).
 *
 * `assuntoVerdade` é a caixa da região construída (A1/A2) ou `null` — é a VERDADE do `texto-sobre-assunto` para os juízes e
 * para a leitura pareada da decisão 1. A falha de leitura (caso D do § 4.2) NÃO é uma foto: é o modo G do harness.
 */
import sharp from 'sharp'
import type { Rect } from '@/lib/creatives/halo/halo'

export type CasoDaFoto = 'A1' | 'A2' | 'B' | 'C' | 'D' | 'E' | 'F'
export const CASOS_DA_FOTO: readonly CasoDaFoto[] = ['A1', 'A2', 'B', 'C', 'D', 'E', 'F']
/** Versão da GERAÇÃO das fotos sintéticas: entra no `loteId`; suba quando a função mudar os pixels. */
export const VERSAO_DAS_FOTOS_SINTETICAS = 1
export type FormatoDaFoto = 'story' | 'feed'
export const DIMENSOES_DA_FOTO: Record<FormatoDaFoto, { width: number; height: number }> = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }

export interface FotoSintetica {
  id: string
  caso: CasoDaFoto
  formato: FormatoDaFoto
  width: number
  height: number
  png: Buffer
  dataUrl: string
  /** A caixa do assunto construído (A1/A2) ou `null` (B–F). */
  assuntoVerdade: Rect | null
  descricao: string
}

/** mulberry32 — determinístico e rápido o bastante para ~2 M de amostras. */
export function prng(semente: number) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sementeDe = (caso: CasoDaFoto, formato: FormatoDaFoto, semente: number) => {
  let h = 2166136261 ^ semente
  for (const c of `${caso}:${formato}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

const DESCRICAO: Record<CasoDaFoto, string> = {
  A1: 'assunto forte localizado: região de alto contraste e textura sobre fundo médio pouco texturizado',
  A2: 'assunto de BAIXO contraste: a mesma região, ±12 níveis sobre o fundo (a estimativa tende a errar)',
  B: 'textura difusa em toda a área, sem região forte (não se aplica esperado)',
  C: 'fundo liso claro',
  D: 'fundo liso escuro',
  E: 'gradiente vertical claro → escuro',
  F: 'ruído forte em toda a área (o pior caso da régua)',
}

/** A caixa do assunto construído: 40 % da largura × 25 % da altura, no terço inferior, deslocada à direita. */
export function caixaDoAssunto(formato: FormatoDaFoto): Rect {
  const { width, height } = DIMENSOES_DA_FOTO[formato]
  const w = Math.round(width * 0.4)
  const h = Math.round(height * 0.25)
  return { x: Math.round(width * 0.5), y: Math.round(height * 0.58), width: w, height: h }
}

export async function fotoSintetica(caso: CasoDaFoto, formato: FormatoDaFoto, semente = 1): Promise<FotoSintetica> {
  const { width, height } = DIMENSOES_DA_FOTO[formato]
  const rnd = prng(sementeDe(caso, formato, semente))
  const raw = Buffer.alloc(width * height * 3)
  const assunto = caso === 'A1' || caso === 'A2' ? caixaDoAssunto(formato) : null
  const dentro = (x: number, y: number) => !!assunto && x >= assunto.x && x < assunto.x + assunto.width && y >= assunto.y && y < assunto.y + assunto.height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v: number
      switch (caso) {
        case 'C':
          v = 235
          break
        case 'D':
          v = 32
          break
        case 'E':
          v = Math.round(235 - (203 * y) / (height - 1))
          break
        case 'F':
          v = Math.round(40 + rnd() * 175)
          break
        case 'B':
          v = Math.round(120 + (rnd() - 0.5) * 36)
          break
        case 'A1':
        case 'A2': {
          const fundo = 128 + (rnd() - 0.5) * 10
          if (dentro(x, y)) {
            // Textura em xadrez de 24 px: forte (A1) ou fraca (A2) em relação ao fundo.
            const xadrez = (Math.floor(x / 24) + Math.floor(y / 24)) % 2 === 0
            const amplitude = caso === 'A1' ? 95 : 12
            v = Math.round(128 + (xadrez ? amplitude : -amplitude) + (rnd() - 0.5) * 6)
          } else v = Math.round(fundo)
          break
        }
      }
      const i = (y * width + x) * 3
      const c = Math.max(0, Math.min(255, v))
      raw[i] = c
      raw[i + 1] = c
      raw[i + 2] = c
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer()
  return { id: `foto-${caso}-${formato}`, caso, formato, width, height, png, dataUrl: `data:image/png;base64,${png.toString('base64')}`, assuntoVerdade: assunto, descricao: DESCRICAO[caso] }
}

export async function fotosDoLote(formato: FormatoDaFoto, semente = 1): Promise<FotoSintetica[]> {
  const fotos: FotoSintetica[] = []
  for (const caso of CASOS_DA_FOTO) fotos.push(await fotoSintetica(caso, formato, semente))
  return fotos
}
