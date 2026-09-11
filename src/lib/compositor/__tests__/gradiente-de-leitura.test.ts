import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { gradientesDoProjeto, GRADIENTS_LIBRARY } from '@/lib/assets/gradients-library'
import {
  alturaDaFaixa,
  comForca,
  configDaCamada,
  corQueContrasta,
  CURVA_DE_LEITURA,
  forcaPelaNecessidade,
  GRADIENTE_PADRAO,
  inserirAcimaDaFoto,
  montarGradientes,
  opacidadeNaCurva,
} from '../gradiente-de-leitura'

const W = 1080
const H = 1920
const cfg = { ...GRADIENTE_PADRAO, cor: '#283D36' }

describe('gradiente de leitura', () => {
  it('texto no topo e no rodapé ganham DOIS gradientes independentes, cada um nascendo na sua borda', () => {
    const r = montarGradientes({
      W,
      H,
      cfg,
      grupos: [
        { rect: { x: 96, y: 188, width: 700, height: 260 }, ancora: 'topo', necessidade: 0.2 },
        { rect: { x: 96, y: 1600, width: 600, height: 96 }, ancora: 'rodape', necessidade: 0.8 },
      ],
    })
    expect(r.map((g) => g.borda)).toEqual(['topo', 'rodape'])
    const [topo, rodape] = r
    expect(topo.layer.id).not.toBe(rodape.layer.id)
    expect(topo.layer.position).toEqual({ x: 0, y: 0 })
    expect(rodape.layer.position.y).toBe(H - rodape.altura)
    expect(topo.layer.style).toMatchObject({ gradientStartY: 0, gradientEndY: 1 })
    expect(rodape.layer.style).toMatchObject({ gradientStartY: 1, gradientEndY: 0 })
    // Cada borda com a força que a foto pede sob o SEU texto
    expect(topo.forca).toBeLessThan(rodape.forca)
    // Uma cor só em todas as paradas: cor diferente numa ponta acinzenta o meio
    const cores = new Set((rodape.layer.style?.gradientStops ?? []).map((s) => s.color))
    expect([...cores]).toEqual(['#283D36'])
  })

  it('blocos da mesma borda dividem UMA camada: alcance do mais distante, força do mais exigente', () => {
    const r = montarGradientes({
      W,
      H,
      cfg,
      grupos: [
        { rect: { x: 96, y: 1500, width: 700, height: 200 }, ancora: 'rodape', necessidade: 0.1 },
        { rect: { x: 96, y: 1740, width: 600, height: 60 }, ancora: 'rodape', necessidade: 0.6 },
      ],
    })
    expect(r).toHaveLength(1)
    expect(r[0].alcance).toBe(H - 1500)
    expect(r[0].forca).toBe(forcaPelaNecessidade(0.6, cfg))
  })

  it('sem âncora, a borda é o lado do centro do texto', () => {
    const [g] = montarGradientes({ W, H, cfg, grupos: [{ rect: { x: 0, y: 1100, width: 500, height: 100 }, necessidade: 0 }] })
    expect(g.borda).toBe('rodape')
  })

  it('a faixa vai só um pouco além do texto — presa entre o mínimo e o máximo', () => {
    // O rodapé da combinação da Real: texto a 24% da altura a partir da borda
    expect(alturaDaFaixa(461, H, cfg)).toBe(876)
    // Texto colado na borda ainda ganha a faixa mínima
    expect(alturaDaFaixa(80, H, cfg)).toBe(Math.round(0.3 * H))
    // O teto segura o véu (0,62 × 1920)…
    expect(alturaDaFaixa(900, H, cfg)).toBe(Math.round(0.62 * H))
    // …mas nunca termina antes do texto: bloco que passa do teto ganha folga própria
    expect(alturaDaFaixa(1100, H, cfg)).toBe(Math.round(1100 * 1.15))
  })

  it('a força anda dentro da faixa pela necessidade medida', () => {
    expect(forcaPelaNecessidade(0, cfg)).toBe(0.45)
    expect(forcaPelaNecessidade(1, cfg)).toBe(0.9)
    expect(forcaPelaNecessidade(2, cfg)).toBe(0.9)
    expect(forcaPelaNecessidade(Number.NaN, cfg)).toBe(0.45)
  })

  it('a curva interpola entre as paradas', () => {
    expect(opacidadeNaCurva(CURVA_DE_LEITURA, 0)).toBe(1)
    expect(opacidadeNaCurva(CURVA_DE_LEITURA, 1)).toBe(0)
    expect(opacidadeNaCurva(CURVA_DE_LEITURA, 0.495)).toBeCloseTo(0.535, 2)
  })

  it('lê cor e curva do gradiente que a Roberta mediu para a Real', () => {
    const verde = gradientesDoProjeto(1).daMarca.find((g) => g.id === 'real-verde-rodape')!
    const camada = { id: 'g', type: 'gradient', visible: true, style: { gradientStops: verde.gradientStops } } as unknown as Layer
    const lida = configDaCamada(camada)!
    expect(lida.cor).toBe('#283D36')
    expect(lida.forcaMaxima).toBe(1)
    // Normalizada para a faixa, bate com a curva padrão da casa
    const curva = lida.curva!
    expect(curva[0]).toEqual([0, 1])
    expect(curva[curva.length - 1]).toEqual([1, 0])
    for (const [p, o] of CURVA_DE_LEITURA) expect(opacidadeNaCurva(curva, p)).toBeCloseTo(o, 1)
  })

  it('gradiente com o lado forte no fim também é lido a partir da borda', () => {
    const baixo = GRADIENTS_LIBRARY.find((g) => g.gradientAngle === 0) ?? GRADIENTS_LIBRARY[0]
    const invertido = { id: 'g', type: 'gradient', visible: true, style: { gradientStops: [...baixo.gradientStops].map((s) => ({ ...s, position: 1 - s.position })) } } as unknown as Layer
    const lida = configDaCamada(invertido)!
    expect(lida.curva![0][1]).toBe(1)
  })

  it('camada oculta ou que não é gradiente não vira configuração', () => {
    expect(configDaCamada({ id: 'x', type: 'text', visible: true } as Layer)).toBeNull()
    expect(configDaCamada({ id: 'x', type: 'gradient', visible: false, style: { gradientStops: [] } } as unknown as Layer)).toBeNull()
  })

  it('trocar a força mantém a curva', () => {
    const [g] = montarGradientes({ W, H, cfg, grupos: [{ rect: { x: 0, y: 1700, width: 500, height: 80 }, ancora: 'rodape', necessidade: 0 }] })
    const forte = comForca(g.layer, 0.8)
    const ops = (forte.style?.gradientStops ?? []).map((s) => s.opacity)
    expect(ops[0]).toBe(0.8)
    expect(ops[ops.length - 1]).toBe(0)
    expect(forte.metadata?.forca).toBe(0.8)
  })

  it('entre os gradientes da marca vale o que contrasta com o texto', () => {
    expect(corQueContrasta(['#283D36', '#F3EADC'], ['#F6F0E4'])).toBe('#283D36')
    expect(corQueContrasta(['#283D36', '#F3EADC'], ['#283D36'])).toBe('#F3EADC')
    expect(corQueContrasta([], ['#FFFFFF'])).toBeNull()
  })

  it('o gradiente entra logo acima da foto, abaixo do texto e da logo', () => {
    const camada = (id: string, order: number) => ({ id, order }) as Layer
    const [g] = montarGradientes({ W, H, cfg, grupos: [{ rect: { x: 0, y: 1700, width: 500, height: 80 }, ancora: 'rodape', necessidade: 0 }] })
    const saida = inserirAcimaDaFoto([camada('logo', 5), camada('bg-foto', 0), camada('headline', 2)], [g.layer])
    expect(saida.map((l) => l.id)).toEqual(['bg-foto', 'gradiente-leitura-rodape', 'headline', 'logo'])
    expect(saida.map((l) => l.order)).toEqual([0, 1, 2, 3])
  })
})
