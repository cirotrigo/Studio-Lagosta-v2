import { describe, expect, it } from 'vitest'
import { janelaEfetiva, type Janela } from '../../corte-da-foto'
import { candidatasDoAssunto, janelaDoAssunto, type ArgsDaJanela, type JanelaAssistida } from '../janela-do-assunto'

const STORY = { width: 1080, height: 1920 }
const FOTO = { width: 2160, height: 3840 }
const certa = (args: ArgsDaJanela) => janelaDoAssunto(args) as JanelaAssistida
const contem = (j: Janela, a: { x0: number; y0: number; x1: number; y1: number }) => j.x <= a.x0 + 1e-9 && j.y <= a.y0 + 1e-9 && j.x + j.width >= a.x1 - 1e-9 && j.y + j.height >= a.y1 - 1e-9

describe('janelaDoAssunto', () => {
  it('(i) alvo alcançável: posição e ocupação dentro da tolerância, sem ajustes', () => {
    const r = certa({ alvo: { x: 0.3, y: 0.2, w: 0.4, h: 0.1 }, assunto: { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.5 }, foto: FOTO, caixa: STORY })
    expect(r.ajustes).toEqual([])
    expect(Math.abs(r.erro.dx)).toBeLessThanOrEqual(0.005)
    expect(Math.abs(r.erro.dy)).toBeLessThanOrEqual(0.005)
    expect(Math.abs(r.erro.ocupacao)).toBeLessThanOrEqual(0.1)
    expect(r.zoom).toBeGreaterThan(1)
    expect(r.zoom).toBeLessThan(1.6)
  })

  it('(ii) assunto maior que a janela desejada → zoom-minimo, inteiro', () => {
    const assunto = { x0: 0.1, y0: 0.4, x1: 0.9, y1: 0.5 }
    const r = certa({ alvo: { x: 0.1, y: 0.3, w: 0.8, h: 0.3 }, assunto, foto: FOTO, caixa: STORY })
    expect(r.ajustes).toContain('zoom-minimo')
    expect(contem(r.janela, assunto)).toBe(true)
    expect(r.janela.width * FOTO.width).toBeCloseTo(0.8 * FOTO.width, 6)
  })

  it('(iii) ocupação que pediria zoom além do teto → zoom-maximo, no teto', () => {
    const r = certa({ alvo: { x: 0.3, y: 0.3, w: 0.4, h: 0.25 }, assunto: { x0: 0.4, y0: 0.4, x1: 0.5, y1: 0.55 }, foto: FOTO, caixa: STORY })
    expect(r.ajustes).toEqual(['zoom-maximo'])
    expect(r.zoom).toBeCloseTo(1.6, 9)
    expect(r.erro.ocupacao).toBeLessThan(-0.1)
  })

  it('(iv) o contraexemplo do Codex: 625², x = 375, assunto inteiro, zoom-maximo + deslizada, dx = −0,38', () => {
    const assunto = { x0: 0.4, y0: 0.45, x1: 1, y1: 0.55 }
    const r = certa({ alvo: { x: 0.8, y: 0.1, w: 0.2, h: 0.8 }, assunto, foto: { width: 1000, height: 1000 }, caixa: { width: 1000, height: 1000 } })
    expect(r.janela.width).toBeCloseTo(0.625, 9)
    expect(r.janela.height).toBeCloseTo(0.625, 9)
    expect(r.janela.x).toBeCloseTo(0.375, 9)
    expect(r.ajustes).toEqual(['zoom-maximo', 'deslizada'])
    expect(contem(r.janela, assunto)).toBe(true)
    expect(r.erro.dx).toBeCloseTo(-0.38, 9)
    expect(r.obtido.ocupacao).toBeCloseTo(0.1536, 9)
  })

  it('(v) o assunto não cabe no cover: recusa', () => {
    expect(janelaDoAssunto({ alvo: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, assunto: { x0: 0.05, y0: 0.4, x1: 0.8, y1: 0.6 }, foto: { width: 4000, height: 2000 }, caixa: STORY })).toEqual({ ok: false, motivo: 'assunto-nao-cabe-no-cover' })
  })

  it('(vi) o panorama no story: o mínimo do renderer não cabe no cover', () => {
    expect(janelaDoAssunto({ alvo: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, assunto: { x0: 0.5, y0: 0.4, x1: 0.501, y1: 0.6 }, foto: { width: 100000, height: 1000 }, caixa: STORY })).toEqual({ ok: false, motivo: 'minimo-do-renderer' })
  })

  it('(vii) assunto colado à borda: a diferença numérica do clamp é aceita, e a janela sai canônica', () => {
    for (let width = 1001; width <= 1400; width++) {
      const r = certa({ alvo: { x: 0.7, y: 0.4, w: 0.3, h: 0.2 }, assunto: { x0: 0.8, y0: 0.4, x1: 1, y1: 0.5 }, foto: { width, height: 1777 }, caixa: STORY })
      expect(r.ok).toBe(true)
      expect(janelaEfetiva(r.janela)).toEqual(r.janela)
    }
  })

  it('(viii) alvo inalcançável na cobertura inteira: deslizada, com o erro dito', () => {
    const r = certa({ alvo: { x: 0.8, y: 0.4, w: 0.15, h: 0.2 }, assunto: { x0: 0.1, y0: 0.4, x1: 0.8, y1: 0.8 }, foto: { width: 1080, height: 1920 }, caixa: STORY })
    expect(r.ajustes).toEqual(expect.arrayContaining(['deslizada']))
    expect(Math.abs(r.erro.dx)).toBeGreaterThan(0.1)
  })

  it('(ix) cada fator recalcula tamanho, posição e deslize; a mesma janela não se repete', () => {
    const args = { alvo: { x: 0.3, y: 0.2, w: 0.4, h: 0.1 }, assunto: { x0: 0.4, y0: 0.4, x1: 0.65, y1: 0.51 }, foto: FOTO, caixa: STORY }
    const { candidatas } = candidatasDoAssunto(args)
    expect(candidatas.map((c) => c.fator)).toEqual([1, 0.85, 1.15])
    expect(new Set(candidatas.map((c) => c.chave)).size).toBe(3)
    expect(candidatas[1].janela.height / candidatas[0].janela.height).toBeCloseTo(0.85, 6)
    expect(candidatas[1].janela).toEqual(certa({ ...args, fatorDosLados: 0.85 }).janela)
    expect(candidatas[1].janela.y).not.toBe(candidatas[0].janela.y)
    // O assunto que enche o cover: os três fatores caem na mesma janela.
    const cheia = candidatasDoAssunto({ ...args, assunto: { x0: 0, y0: 0, x1: 1, y1: 1 } })
    expect(cheia.candidatas.map((c) => c.fator)).toEqual([1])
    expect(cheia.candidatas[0].ajustes).toContain('cover')
    // Nenhuma viável: o motivo vem junto.
    expect(candidatasDoAssunto({ ...args, foto: { width: 4000, height: 2000 }, assunto: { x0: 0.05, y0: 0.4, x1: 0.8, y1: 0.6 } })).toEqual({ candidatas: [], motivo: 'assunto-nao-cabe-no-cover' })
  })

  it('(x) domínio inválido', () => {
    const base = { alvo: { x: 0.3, y: 0.2, w: 0.4, h: 0.1 }, assunto: { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.5 }, foto: FOTO, caixa: STORY }
    const invalidos: ArgsDaJanela[] = [
      { ...base, fatorDosLados: 0 },
      { ...base, fatorDosLados: Number.NaN },
      { ...base, zoomMaximo: 0.5 },
      { ...base, zoomMaximo: Number.POSITIVE_INFINITY },
      { ...base, alvo: { ...base.alvo, x: 0.7 } },
      { ...base, alvo: { ...base.alvo, w: 0 } },
      { ...base, foto: { width: 0, height: 10 } },
      { ...base, caixa: { width: 10, height: Number.NaN } },
      { ...base, assunto: { x0: 0.6, y0: 0.4, x1: 0.4, y1: 0.5 } },
    ]
    for (const a of invalidos) expect(janelaDoAssunto(a)).toEqual({ ok: false, motivo: 'dominio-invalido' })
  })
})
