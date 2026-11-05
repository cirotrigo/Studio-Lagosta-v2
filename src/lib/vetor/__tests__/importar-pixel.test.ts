/**
 * CP-V6 — pixel ORIGEM → NORMALIZADO. O SVG original é rasterizado pelo librsvg (sharp), um rasterizador independente
 * do nosso; a entrada que o importador emite é desenhada pelo renderer REAL do servidor (CanvasRenderer, traçado único,
 * multicor V5) no @napi-rs/canvas. Mesma escala (2×), caixa = canvas inteiro.
 *
 * Tolerância: os dois rasterizadores diferem no antisserrilhado da borda (≤ 1 px de faixa), o arco em cúbicas erra
 * ≤ 0,03% do raio e o arredondamento em 2 casas ≤ 0,01 px nesta escala — nada disso muda pixel de miolo. Então:
 * amostras de miolo com delta ≤ 2 e pixels "fortes" (delta > 96, mais que meia borda) ≤ 0,3% do canvas. A junção do
 * contorno (round no renderer × miter no SVG, aviso `JUNCAO_REDONDA`) é medida à parte, não escondida na tolerância.
 *
 * Com IMPORTAR_SAIDA=<dir>, grava os PNGs (origem/normalizado) e as medidas.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { importarSvg, type PropostaDeVetor } from '../importar'
import { pixelsDePng, pixelsDoServidor, pngDe, type Pixels } from './suporte/konva-no-node'

const ESCALA = 2
const NS = 'xmlns="http://www.w3.org/2000/svg"'

interface CasoDePixel {
  id: string
  vb: [number, number]
  corpo: string
  /** Pontos do viewBox no MIOLO de alguma pintura (ou do fundo), onde os dois lados têm de bater. */
  miolo: Array<[number, number]>
}

const CASOS: CasoDePixel[] = [
  {
    id: 'multicor-faixa-anel-traco',
    vb: [200, 100],
    corpo: '<rect y="50" width="200" height="50" fill="#1e3a8a"/><path fill="#f97316" fill-rule="evenodd" d="M110 50 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0 z M130 50 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0 z"/><line x1="10" y1="10" x2="100" y2="10" stroke="#10b981" stroke-width="6"/>',
    miolo: [[20, 90], [150, 85], [150, 60], [150, 50], [118, 50], [50, 10], [50, 30]],
  },
  {
    id: 'primitivas-e-transforms',
    vb: [200, 200],
    corpo: '<g transform="translate(100 100) rotate(30)"><g transform="scale(1.5)"><rect x="-30" y="-20" width="60" height="40" rx="10" fill="#7c3aed"/></g></g><ellipse cx="40" cy="40" rx="30" ry="15" fill="#0ea5e9"/><polygon points="150,20 190,60 150,60" fill="#e11d48"/><path transform="skewX(15)" d="M10 160 h40 v30 h-40 z" fill="#16a34a"/>',
    miolo: [[100, 100], [40, 40], [62, 40], [165, 50], [70, 175], [5, 5], [195, 195]],
  },
  {
    id: 'path-compacto-relativo',
    vb: [120, 60],
    corpo: '<path fill="#0f766e" d="M10 50c0-20 20-40 40-40s40 20 40 40q5-10 10 0t10 0v5H10z"/>',
    miolo: [[50, 40], [95, 53], [5, 5], [60, 5]],
  },
  {
    // P2-3 (rodada 1): rx 40 numa caixa 30 × 180 vira rx 15 / ry 40 (o ry omitido herda o DECLARADO). (12, 24) fica FORA
    // desse canto e DENTRO do canto errado (ry = 15 herdado já limitado) — a amostra separa as duas formas.
    id: 'rect-raio-por-eixo',
    vb: [100, 200],
    corpo: '<rect x="10" y="10" width="30" height="180" rx="40" fill="#b45309"/><rect x="50" y="80" width="45" height="40" ry="30" fill="#4338ca"/>',
    miolo: [[12, 24], [25, 100], [72, 100], [80, 50]],
  },
  {
    id: 'viewbox-deslocado-monocor-evenodd',
    vb: [100, 100],
    corpo: '<path transform="translate(-40 -40)" fill="#111827" fill-rule="evenodd" d="M50 50h80v80h-80z M70 70h40v40h-40z"/>',
    miolo: [[20, 20], [50, 50], [80, 50], [5, 5]],
  },
]

function camadaDaProposta(p: PropostaDeVetor, largura: number, altura: number): Layer {
  const e = p.entrada
  const cores = p.coresDeOrigem
  const slotDaSilhueta = e.partes ? e.partes.find((x) => x.alvo === 'fill')!.slot : Object.keys(cores)[0]
  const traco = e.strokeColor !== undefined
  return {
    id: 'importado', type: 'shape', name: 'importado', visible: true, locked: false, order: 0,
    position: { x: 0, y: 0 }, size: { width: largura, height: altura },
    style: {
      shapeType: 'svg-path',
      pathData: e.pathData,
      pathViewBox: e.pathViewBox,
      pathFillRule: e.pathFillRule,
      fill: traco ? 'transparent' : cores[slotDaSilhueta],
      strokeColor: traco ? cores[slotDaSilhueta] : undefined,
      strokeWidth: (e.strokeWidth ?? 0) * ESCALA,
      opacity: 1,
      ...(e.partes && { vetor: { asset: { id: 'importado', versao: 1 }, partes: e.partes, cores } }),
    },
  } as Layer
}

async function origem(c: CasoDePixel): Promise<Pixels> {
  const [w, h] = c.vb
  const fonte = `<svg ${NS} width="${w * ESCALA}" height="${h * ESCALA}" viewBox="${c.id.startsWith('viewbox') ? '-40 -40' : '0 0'} ${w} ${h}">${c.corpo}</svg>`
  return pixelsDePng(await sharp(Buffer.from(fonte)).flatten({ background: '#ffffff' }).png().toBuffer())
}

function fonteImportada(c: CasoDePixel): string {
  return `<svg ${NS} viewBox="${c.id.startsWith('viewbox') ? '-40 -40' : '0 0'} ${c.vb[0]} ${c.vb[1]}">${c.corpo}</svg>`
}

const delta = (a: Pixels, b: Pixels, i: number) => Math.max(...[0, 1, 2, 3].map((k) => Math.abs(a.dados[i + k] - b.dados[i + k])))

const saida = process.env.IMPORTAR_SAIDA
const medidas: Record<string, unknown> = {}

describe('importarSvg — pixel origem (librsvg) × normalizado (renderer do servidor)', () => {
  it.each(CASOS.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const r = importarSvg(fonteImportada(c))
    expect(r.ok).toBe(true)
    const p = (r as Extract<typeof r, { ok: true }>).proposta
    const a = await origem(c)
    const b = await pixelsDoServidor(a.largura, a.altura, '#ffffff', [camadaDaProposta(p, a.largura, a.altura)])
    let fortes = 0
    let max = 0
    for (let i = 0; i < a.dados.length; i += 4) {
      const d = delta(a, b, i)
      if (d > 96) fortes++
      max = Math.max(max, d)
    }
    const amostras = c.miolo.map(([x, y]) => delta(a, b, (y * ESCALA * a.largura + x * ESCALA) * 4))
    medidas[c.id] = { partes: p.metricas.partes, comandos: p.metricas.comandos, fortes, fracaoForte: fortes / (a.largura * a.altura), maxDelta: max, amostras }
    if (saida) {
      mkdirSync(saida, { recursive: true })
      writeFileSync(join(saida, `${c.id}.origem.png`), pngDe(a))
      writeFileSync(join(saida, `${c.id}.normalizado.png`), pngDe(b))
      writeFileSync(join(saida, 'medidas.json'), JSON.stringify(medidas, null, 2))
    }
    expect(amostras.every((d) => d <= 2)).toBe(true)
    expect(fortes / (a.largura * a.altura)).toBeLessThanOrEqual(0.003)
  })

  it('controle negativo: a mesma métrica pega um erro real (evenodd perdido enche o furo do anel)', async () => {
    const c = CASOS[0]
    const p = structuredClone((importarSvg(fonteImportada(c)) as Extract<ReturnType<typeof importarSvg>, { ok: true }>).proposta)
    delete p.entrada.partes![1].fillRule
    const a = await origem(c)
    const b = await pixelsDoServidor(a.largura, a.altura, '#ffffff', [camadaDaProposta(p, a.largura, a.altura)])
    const furo = delta(a, b, (60 * ESCALA * a.largura + 150 * ESCALA) * 4)
    let fortes = 0
    for (let i = 0; i < a.dados.length; i += 4) if (delta(a, b, i) > 96) fortes++
    medidas.controleNegativo = { furo, fracaoForte: fortes / (a.largura * a.altura) }
    expect(furo).toBeGreaterThan(2)
    expect(fortes / (a.largura * a.altura)).toBeGreaterThan(0.003)
  })

  it('junção do contorno: round (renderer) × miter (SVG) só difere perto do canto — medido, com aviso', async () => {
    const c: CasoDePixel = { id: 'juncao', vb: [100, 100], corpo: '<polyline points="10,90 50,10 90,90" fill="none" stroke="#000000" stroke-width="8"/>', miolo: [[30, 50], [70, 50], [5, 5]] }
    const r = importarSvg(fonteImportada(c))
    const p = (r as Extract<typeof r, { ok: true }>).proposta
    expect(p.avisos.map((x) => x.codigo)).toContain('JUNCAO_REDONDA')
    const a = await origem(c)
    const b = await pixelsDoServidor(a.largura, a.altura, '#ffffff', [camadaDaProposta(p, a.largura, a.altura)])
    // os pixels fortes ficam todos a menos de 2 espessuras do vértice (50, 10)
    let fortes = 0
    let longe = 0
    for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
      if (delta(a, b, (y * a.largura + x) * 4) <= 96) continue
      fortes++
      if (Math.hypot(x / ESCALA - 50, y / ESCALA - 10) > 16) longe++
    }
    medidas.juncao = { fortes, longeDoVertice: longe }
    if (saida) {
      writeFileSync(join(saida, 'juncao.origem.png'), pngDe(a))
      writeFileSync(join(saida, 'juncao.normalizado.png'), pngDe(b))
      writeFileSync(join(saida, 'medidas.json'), JSON.stringify(medidas, null, 2))
    }
    expect(fortes).toBeGreaterThan(0) // a diferença existe (miter tem ponta) e não é escondida
    expect(longe).toBe(0)
  })
})
