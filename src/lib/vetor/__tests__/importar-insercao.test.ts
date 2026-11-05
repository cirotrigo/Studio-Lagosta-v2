/**
 * CP-V6 rodada 1 — INTEGRAÇÃO REAL: a proposta do importador (curadoria completa) passa pela inserção de verdade
 * (`camadaDoElemento`, com papéis resolvidos pela marca) e a camada resultante é desenhada pelo renderer do servidor.
 * Diferente de `importar-pixel.test.ts`, que prova só a NORMALIZAÇÃO (camada montada à mão com as cores de origem).
 */
import { describe, expect, it } from 'vitest'
import { createDefaultLayer } from '@/contexts/template-editor-context'
import type { ShapeDefinition } from '@/lib/assets/shapes-library'
import { resolverCorDaMarca, type DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import { camadaDoElemento } from '@/lib/editor/camada-do-elemento'
import { importarSvg, type Curadoria, type PropostaDeVetor } from '../importar'
import { problemasDoVetor } from '../validar-camada'
import { pixelsDoServidor } from './suporte/konva-no-node'

const NS = 'xmlns="http://www.w3.org/2000/svg"'
/** A mesma marca dos testes da inserção: escuro = #0F2027, destaque = #C0392B, claro = Creme #F5EBDC. */
const MARCA: DadosDaMarca = {
  paleta: [
    { name: 'Preto', hexCode: '#1A1A1A' },
    { name: 'Creme', hexCode: '#F5EBDC' },
    { name: 'Laranja', hexCode: '#E8590C' },
  ],
  assinaturaCrua: { fundo: '#0F2027', destaque: { fill: '#C0392B' } },
}
const CURADORIA: Curadoria = { id: 'importado-teste', label: 'Importado', category: 'formas', keywords: ['teste'] }

function proposta(vb: string, corpo: string, curadoria: Curadoria): PropostaDeVetor {
  const r = importarSvg(`<svg ${NS} viewBox="${vb}">${corpo}</svg>`, curadoria)
  if (r.ok === false) throw new Error(`recusado: ${(r as { codigo: string }).codigo}`)
  const p = (r as Extract<typeof r, { ok: true }>).proposta
  expect(p.pendencias).toEqual([])
  return p
}
const inserir = (p: PropostaDeVetor, canvas: { width: number; height: number }) =>
  camadaDoElemento(p.entrada as ShapeDefinition, { base: createDefaultLayer('shape'), canvas, marca: MARCA })

const finitoPositivo = (n: number) => Number.isFinite(n) && n > 0
const finitoNaoNegativo = (n: number) => Number.isFinite(n) && n >= 0

describe('importar → camadaDoElemento (inserção real) → renderer do servidor', () => {
  it.each([
    ['1:100 (alto)', '0 0 1 100', { width: 1080, height: 1920 }, { width: 356, height: 35600 }],
    ['100:1 (largo)', '0 0 100 1', { width: 1080, height: 1920 }, { width: 356, height: 4 }],
    ['100:1 num canvas pequeno', '0 0 100 1', { width: 100, height: 100 }, { width: 33, height: 1 }],
    ['9:16 story', '0 0 9 16', { width: 1080, height: 1920 }, { width: 356, height: 633 }],
    ['2:1 feed', '0 0 200 100', { width: 1080, height: 1080 }, { width: 356, height: 178 }],
    ['1:3 (antes saía aspect 0,33)', '0 0 1 3', { width: 1080, height: 1920 }, { width: 356, height: 1068 }],
  ])('P2-1: %s dá tamanho e posição finitos e positivos', (_n, vb, canvas, tamanho) => {
    const [, , w, h] = vb.split(' ').map(Number)
    const p = proposta(vb, `<rect width="${w}" height="${h}" fill="#000"/>`, { ...CURADORIA, slots: { '#000': { id: 'forma', papelPadrao: 'escuro' } } })
    const c = inserir(p, canvas)
    expect(c.size).toEqual(tamanho)
    expect(finitoPositivo(c.size.width) && finitoPositivo(c.size.height)).toBe(true)
    expect(finitoNaoNegativo(c.position.x) && finitoNaoNegativo(c.position.y)).toBe(true)
    expect(problemasDoVetor(c)).toEqual([])
  })

  it('P2-1: a inserção nunca dá altura 0 nem infinita, mesmo com aspect fora do que o importador emite', () => {
    const base = proposta('0 0 10 10', '<rect width="10" height="10" fill="#000"/>', { ...CURADORIA, slots: { '#000': { id: 'forma', papelPadrao: 'escuro' } } })
    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 4096, 1 / 4096]) {
      const c = inserir({ ...base, entrada: { ...base.entrada, aspect } }, { width: 1080, height: 1920 })
      expect([aspect, finitoPositivo(c.size.width) && finitoPositivo(c.size.height) && finitoNaoNegativo(c.position.y)]).toEqual([aspect, true])
    }
  })

  it('multicor com curadoria completa: a camada leva as cores da MARCA (nunca as de origem) e desenha com elas', async () => {
    const p = proposta(
      '0 0 400 100',
      '<rect y="50" width="400" height="50" fill="#1e3a8a"/><circle cx="200" cy="50" r="40" fill="#f97316"/><line x1="10" y1="10" x2="390" y2="10" stroke="#10b981" stroke-width="6"/>',
      { ...CURADORIA, slots: { '#1e3a8a': { id: 'fundo', papelPadrao: 'escuro' }, '#f97316': { id: 'disco', papelPadrao: 'destaque' }, '#10b981': { id: 'fio', papelPadrao: 'claro' } } },
    )
    const canvas = { width: 1080, height: 1080 }
    const c = inserir(p, canvas)
    const hex = (papel: 'escuro' | 'destaque' | 'claro') => resolverCorDaMarca(papel, MARCA).hex
    expect(c.style!.vetor!.cores).toEqual({ fundo: hex('escuro'), disco: hex('destaque'), fio: hex('claro') })
    expect(c.style!.vetor!.papeis).toEqual({ fundo: 'escuro', disco: 'destaque', fio: 'claro' })
    expect(JSON.stringify(c.style)).not.toMatch(/1e3a8a|f97316|10b981/i)
    expect(c.style!.strokeWidth).toBe(6)
    expect(problemasDoVetor(c)).toEqual([])

    const px = await pixelsDoServidor(canvas.width, canvas.height, '#ffffff', [c])
    // caixa 356 × 89 centrada; viewBox 400 × 100 em "meet": escala 0,89
    const noCanvas = (vx: number, vy: number) => [Math.round(c.position.x + vx * 0.89), Math.round(c.position.y + vy * 0.89)]
    const cor = (vx: number, vy: number) => {
      const [x, y] = noCanvas(vx, vy)
      const i = (y * px.largura + x) * 4
      return `#${[0, 1, 2].map((k) => px.dados[i + k].toString(16).padStart(2, '0')).join('')}`
    }
    expect(cor(40, 80)).toBe(hex('escuro').toLowerCase())
    expect(cor(200, 50)).toBe(hex('destaque').toLowerCase())
    expect(cor(200, 10)).toBe(hex('claro').toLowerCase())
    expect(cor(40, 30)).toBe('#ffffff')
  })
})
