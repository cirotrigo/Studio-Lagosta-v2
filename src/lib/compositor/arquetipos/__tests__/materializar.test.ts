/**
 * T1a — a materialização na posição de REFERÊNCIA: sem busca na zona, sem
 * clamp; o que não cabe é recusado com papel, referência, zona e medida.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import { verArquetipo } from '../catalogo'
import { caixasMaximas, materializarArquetipo, zonaEfetiva, type Materializacao, type ProblemaDeMaterializacao } from '../materializar'

const TOPO = verArquetipo('minimal-fb-topo-esquerda', 1)!
const CENTRO = verArquetipo('minimal-fb-centro-optico', 1)!
/** Sem `strict`, o discriminante `ok` não estreita a união: o teste lê os dois lados por aqui. */
const problemas = (m: Materializacao): ProblemaDeMaterializacao[] => ('problemas' in m ? m.problemas : [])
const geo = (f: 'story' | 'feed') => {
  const { margemH, safeTopo, safeRodape } = NUMEROS_PADRAO.geometria[f]
  return { margemH, safeTopo, safeRodape }
}

describe('T1a · materialização', () => {
  it('a caixa máxima de cada papel é a referência em px (a coluna do medidor e a capacidade)', () => {
    expect(caixasMaximas(TOPO, 'story', DIMENSOES.story)).toEqual({
      pre: { largura: 540, altura: 57 },
      headline: { largura: 756, altura: 230 },
      apoio: { largura: 648, altura: 115 },
      servico: { largura: 594, altura: 134 },
    })
    expect(caixasMaximas(TOPO, 'feed', DIMENSOES.feed).headline).toEqual({ largura: 756, altura: 189 })
    expect(caixasMaximas(CENTRO, 'story', DIMENSOES.story).headline).toEqual({ largura: 648, altura: 192 })
  })

  it('13. topo-esquerda no story: cada papel na referência, rente à esquerda', () => {
    const m = materializarArquetipo({
      arquetipo: TOPO,
      formato: 'story',
      canvas: DIMENSOES.story,
      geometria: geo('story'),
      medidas: { pre: { width: 300, height: 50 }, headline: { width: 700, height: 200 }, servico: { width: 400, height: 60 } },
      logo: { razao: 0.5 },
    })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.papeis.pre!.posicao).toEqual({ x: 92, y: 230, width: 300, height: 50 })
    expect(m.papeis.headline!.posicao).toEqual({ x: 92, y: 298, width: 700, height: 200 })
    expect(m.papeis.servico!.posicao).toEqual({ x: 92, y: 1555, width: 400, height: 60 })
    // O apoio opcional que não veio não ganha posição.
    expect(m.papeis.apoio).toBeUndefined()
    // A logo em contain na referência: a maior caixa com a proporção do arquivo, rente à direita.
    expect(m.papeis.logo!.referencia).toEqual({ x: 799, y: 1555, width: 189, height: 134 })
    expect(m.papeis.logo!.posicao).toEqual({ x: 799, y: 1575, width: 189, height: 95 })
    expect(m.logoAutomatica).toBe(false)
  })

  it('14. topo-esquerda no feed usa a geometria própria do feed', () => {
    const m = materializarArquetipo({
      arquetipo: TOPO,
      formato: 'feed',
      canvas: DIMENSOES.feed,
      geometria: geo('feed'),
      medidas: { headline: { width: 600, height: 150 }, servico: { width: 400, height: 60 } },
      logo: null,
    })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.papeis.headline!.posicao).toEqual({ x: 92, y: 209, width: 600, height: 150 })
    expect(m.papeis.servico!.posicao).toEqual({ x: 92, y: 1134, width: 400, height: 60 })
    expect(m.papeis.logo).toBeUndefined()
  })

  it('15. centro-óptico: headline centrada, serviço embaixo, logo automática', () => {
    const m = materializarArquetipo({
      arquetipo: CENTRO,
      formato: 'story',
      canvas: DIMENSOES.story,
      geometria: geo('story'),
      medidas: { headline: { width: 400, height: 150 }, apoio: { width: 300, height: 60 }, servico: { width: 200, height: 50 } },
      logo: { razao: 0.5 },
    })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.papeis.headline!.posicao).toEqual({ x: 340, y: 854, width: 400, height: 150 })
    expect(m.papeis.headline!.posicao.x + m.papeis.headline!.posicao.width / 2).toBe(540)
    expect(m.papeis.servico!.posicao.y).toBe(1613)
    expect(m.papeis.logo).toBeUndefined()
    expect(m.logoAutomatica).toBe(true)
  })

  it('16. referência fora da área segura EFETIVA do projeto: recusa, não move', () => {
    // O projeto com safeTopo 250 no story corta o pré-título (referência em y 230).
    const m = materializarArquetipo({
      arquetipo: TOPO,
      formato: 'story',
      canvas: DIMENSOES.story,
      geometria: { ...geo('story'), safeTopo: 250 },
      medidas: { pre: { width: 300, height: 50 }, headline: { width: 600, height: 200 }, servico: { width: 300, height: 60 } },
      logo: null,
    })
    expect(m.ok).toBe(false)
    expect(problemas(m)).toHaveLength(1)
    expect(problemas(m)[0]).toMatchObject({ codigo: 'ARQUETIPO_FORA_DA_ZONA', papel: 'pre', referencia: { x: 92, y: 230 }, zonaEfetiva: { y: 250 }, medida: { width: 300, height: 50 } })
    expect(problemas(m)[0].motivo).toMatch(/área segura do projeto/)
    // A zona efetiva é a do arquétipo ∩ o piso do projeto: o topo dela sobe de 188 para 250.
    const zonaDoPre = (TOPO.formatos.story.papeis.pre as { zona: { xMin: number; xMax: number; yMin: number; yMax: number } }).zona
    expect(zonaEfetiva(zonaDoPre, DIMENSOES.story, geo('story'))!.y).toBeCloseTo(188.16, 6)
    expect(zonaEfetiva(zonaDoPre, DIMENSOES.story, { ...geo('story'), safeTopo: 250 })!.y).toBe(250)
  })

  it('caixa maior que a capacidade da referência: recusa com a medida (sem esmagar fonte, sem empurrar)', () => {
    const m = materializarArquetipo({
      arquetipo: TOPO,
      formato: 'story',
      canvas: DIMENSOES.story,
      geometria: geo('story'),
      medidas: { headline: { width: 700, height: 260 }, servico: { width: 300, height: 60 } },
      logo: null,
    })
    expect(m.ok).toBe(false)
    expect(problemas(m)).toEqual([
      expect.objectContaining({ codigo: 'ARQUETIPO_TEXTO_NAO_CABE', papel: 'headline', medida: { width: 700, height: 260 }, referencia: { x: 92, y: 298, width: 756, height: 230 } }),
    ])
  })

  it('logo obrigatória sem proporção legível é recusa, nunca omissão', () => {
    const m = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas: { headline: { width: 600, height: 200 }, servico: { width: 300, height: 60 } }, logo: { razao: 0 } })
    expect(problemas(m).map((p) => [p.codigo, p.papel])).toEqual([['ARQUETIPO_LOGO_SEM_PROPORCAO', 'logo']])
  })

  it('zona efetiva vazia é dita como tal', () => {
    const m = materializarArquetipo({
      arquetipo: TOPO,
      formato: 'story',
      canvas: DIMENSOES.story,
      geometria: { ...geo('story'), safeRodape: 600 },
      medidas: { headline: { width: 600, height: 200 }, servico: { width: 300, height: 60 } },
      logo: null,
    })
    expect(m.ok).toBe(false)
    expect(problemas(m).map((p) => [p.codigo, p.papel])).toEqual([['ARQUETIPO_ZONA_EFETIVA_VAZIA', 'servico']])
  })
})
