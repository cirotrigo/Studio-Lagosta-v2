/**
 * T1a — a materialização na posição de REFERÊNCIA: sem busca na zona, sem
 * clamp; o que não cabe é recusado com papel, referência, zona e medida.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { caixasMaximas, excedeAlturaDaReferencia, materializarArquetipo, referenciaDoPapel, referenciaEfetiva, zonaEfetiva, type Materializacao, type ProblemaDeMaterializacao } from '../materializar'
import { materializarUnidades, unidadesDoArquetipo } from '../no-compositor'
import { montarBloco } from '../../blocos'
import type { BlocoPreparado } from '../../preparar-blocos'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'

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

  it('17. o piso da marca vence na horizontal (opção A, 29/10/2026): margem 96 contra a referência do catálogo em x 92 recolhe a caixa para dentro do piso, dos dois lados', () => {
    // O caso das 19 páginas "[Rever margem]" de 28/10: `Project.assinatura` com margemH 96 (o catálogo põe a referência em
    // x .085 = 91,8 px). Antes, recusa de todo papel ("a área segura do projeto corta a referência"); agora a referência
    // efetiva é a do catálogo ∩ o piso: o texto à esquerda pousa em 96 e a logo, rente à direita, recolhe para 984.
    const medidas = { pre: { width: 300, height: 50 }, headline: { width: 600, height: 200 }, servico: { width: 300, height: 60 } }
    const geo96 = { ...geo('story'), margemH: 96 }
    const m = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: geo96, medidas, logo: { razao: 0.5 } })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.papeis.pre!.posicao).toEqual({ x: 96, y: 230, width: 300, height: 50 })
    expect(m.papeis.headline!.posicao).toEqual({ x: 96, y: 298, width: 600, height: 200 })
    expect(m.papeis.servico!.posicao.x).toBe(96)
    // A referência efetiva perde só o lado cortado: 91,8 + 756 → 96 … 847,8 (largura 751,8 → 752 ao pixel).
    expect(m.papeis.headline!.referencia).toEqual({ x: 96, y: 298, width: 752, height: 230 })
    // A logo em contain na referência efetiva (799,2 … 984): 184,8 × 92,4, rente à direita do piso.
    expect(m.papeis.logo!.posicao).toEqual({ x: 799, y: 1576, width: 185, height: 92 })
    // A coluna do medidor é a MESMA caixa: 751 contra 756 do catálogo.
    expect(caixasMaximas(TOPO, 'story', DIMENSOES.story, geo96).headline).toEqual({ largura: 751, altura: 230 })
    expect(caixasMaximas(TOPO, 'story', DIMENSOES.story).headline).toEqual({ largura: 756, altura: 230 })
    // Piso que engole a referência não inventa posição: com margem 300 a coluna efetiva da manchete é 480 (300 … 780)
    // e a caixa de 600 não cabe — recusa por capacidade, como a escada do medidor também veria.
    const longe = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: { ...geo('story'), margemH: 300 }, medidas, logo: null })
    expect(longe.ok).toBe(false)
    expect(problemas(longe).find((p) => p.papel === 'headline')).toMatchObject({ codigo: 'ARQUETIPO_TEXTO_NAO_CABE', referencia: { x: 300, width: 480 } })
  })

  it('17b. no piso padrão (92) a referência efetiva É a do catálogo: coluna e caixas byte a byte iguais, em todo o catálogo', () => {
    // 91,8 contra 92 está dentro da tolerância de ½ px: nada é recolhido (a prova pedida pelo Codex na triagem de 29/10).
    for (const a of listarArquetipos()) {
      for (const f of ['story', 'feed'] as const) {
        expect(caixasMaximas(a, f, DIMENSOES[f], geo(f))).toEqual(caixasMaximas(a, f, DIMENSOES[f]))
      }
    }
    expect(referenciaEfetiva({ x: 91.8, y: 0, width: 756, height: 10 }, { x: 92, y: 0, width: 896, height: 10 })).toEqual({ x: 91.8, y: 0, width: 756, height: 10 })
    const esq = referenciaEfetiva({ x: 91.8, y: 0, width: 756, height: 10 }, { x: 96, y: 0, width: 888, height: 10 })
    expect([esq.x, esq.y, esq.height]).toEqual([96, 0, 10])
    expect(esq.width).toBeCloseTo(751.8, 9)
    const dir = referenciaEfetiva({ x: 799.2, y: 0, width: 189, height: 10 }, { x: 670, y: 0, width: 314, height: 10 })
    expect([dir.x, dir.y, dir.height]).toEqual([799.2, 0, 10])
    expect(dir.width).toBeCloseTo(184.8, 9)
  })

  it('17c. no piso padrão a referência de TODO papel (logo fixa incluída) é a do catálogo ao pixel, em todo o catálogo', () => {
    // Pedido da revisão do Codex (29/10): a prova de posição, não só de coluna — nenhum x/largura é recolhido no padrão.
    for (const a of listarArquetipos()) {
      for (const f of ['story', 'feed'] as const) {
        const canvas = DIMENSOES[f]
        for (const [papel, pos] of Object.entries(a.formatos[f].papeis)) {
          if (!pos || !('referencia' in pos)) continue
          const r = pos.referencia
          const esperada = { x: Math.round(r.x * canvas.width), y: Math.round(r.y * canvas.height), width: Math.round(r.w * canvas.width), height: Math.round(r.h * canvas.height) }
          expect(referenciaDoPapel(a, f, canvas, geo(f), papel as 'logo' | 'headline')?.referencia, `${a.id}@${a.versao} ${f} ${papel}`).toEqual(esperada)
        }
      }
    }
  })

  it('18. empilhar como a assinatura (29/10/2026): na faixa do topo, pré, manchete e apoio encostam com o gap da marca; serviço e logo ficam', () => {
    const medidas = { pre: { width: 300, height: 48 }, headline: { width: 600, height: 164 }, apoio: { width: 500, height: 48 }, servico: { width: 300, height: 52 } }
    const solto = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 } })
    const pilha = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 }, empilhar: { gap: 14 } })
    expect(solto.ok && pilha.ok).toBe(true)
    if (!solto.ok || !pilha.ok) return
    // Solto (a saída de sempre): cada papel na própria referência — 230, 298 e 547, com 20 e 85 px de vão.
    expect([solto.papeis.pre!.posicao.y, solto.papeis.headline!.posicao.y, solto.papeis.apoio!.posicao.y]).toEqual([230, 298, 547])
    // Pilha: o pré (âncora topo) fica em 230; a manchete em 230 + 48 + 14 = 292; o apoio em 292 + 164 + 14 = 470.
    expect([pilha.papeis.pre!.posicao.y, pilha.papeis.headline!.posicao.y, pilha.papeis.apoio!.posicao.y]).toEqual([230, 292, 470])
    // Só o y muda: x, largura e referência são os mesmos; a outra faixa (serviço + logo) e a logo não se mexem.
    for (const p of ['pre', 'headline', 'apoio'] as const) {
      expect([pilha.papeis[p]!.posicao.x, pilha.papeis[p]!.posicao.width, pilha.papeis[p]!.referencia]).toEqual([solto.papeis[p]!.posicao.x, solto.papeis[p]!.posicao.width, solto.papeis[p]!.referencia])
    }
    // A âncora (o pré) guarda a própria zona — é ela que segura a identidade na busca; os que a seguem ganham o CASCO
    // das zonas da faixa na vertical (as zonas por papel foram desenhadas em volta das referências soltas e brigariam
    // com a pilha); a horizontal segue a de cada papel.
    expect(pilha.papeis.pre!.zonaEfetiva).toEqual(solto.papeis.pre!.zonaEfetiva)
    const casco = { y: Math.min(...['pre', 'headline', 'apoio'].map((p) => solto.papeis[p as 'pre']!.zonaEfetiva.y)), base: Math.max(...['pre', 'headline', 'apoio'].map((p) => solto.papeis[p as 'pre']!.zonaEfetiva.y + solto.papeis[p as 'pre']!.zonaEfetiva.height)) }
    for (const p of ['headline', 'apoio'] as const) {
      const z = pilha.papeis[p]!.zonaEfetiva
      expect([z.x, z.width, z.y, z.y + z.height]).toEqual([solto.papeis[p]!.zonaEfetiva.x, solto.papeis[p]!.zonaEfetiva.width, casco.y, casco.base])
    }
    expect([pilha.papeis.servico, pilha.papeis.logo]).toEqual([solto.papeis.servico, solto.papeis.logo])
    // O ornamento preso à manchete (o fio, 24 px abaixo) e o dy da busca contam na pilha.
    const comFio = materializarArquetipo({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 }, empilhar: { gap: 14 }, ornamentos: { headline: { esquerda: 0, direita: 0, topo: 0, base: 24 } }, deslocamentos: { pre: -10, headline: -10, apoio: -10 } })
    expect(comFio.ok).toBe(true)
    if (!comFio.ok) return
    expect([comFio.papeis.pre!.posicao.y, comFio.papeis.headline!.posicao.y, comFio.papeis.apoio!.posicao.y]).toEqual([220, 282, 484])
  })

  it('18b. âncora no rodapé: o último papel fica na referência e os outros sobem; âncora no meio e lista não empilham', () => {
    const BASE = verArquetipo('minimal-fb-base-esquerda', 1)!
    const medidas = { headline: { width: 600, height: 164 }, apoio: { width: 500, height: 48 }, servico: { width: 300, height: 52 } }
    const solto = materializarArquetipo({ arquetipo: BASE, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 } })
    const pilha = materializarArquetipo({ arquetipo: BASE, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 }, empilhar: { gap: 14 } })
    expect(solto.ok && pilha.ok).toBe(true)
    if (!solto.ok || !pilha.ok) return
    const s = solto.papeis.servico!.posicao
    expect(pilha.papeis.servico!.posicao).toEqual(s)
    expect(pilha.papeis.apoio!.posicao.y).toBe(s.y - 14 - 48)
    expect(pilha.papeis.headline!.posicao.y).toBe(s.y - 14 - 48 - 14 - 164)
    expect(pilha.papeis.logo).toEqual(solto.papeis.logo)
    // #16 (âncora meio) e #15 (lista) saem iguais com ou sem o gap: os vãos são da receita.
    for (const [id, versao] of [['minimal-tipografico-convite', 2], ['minimal-tipografico-lista', 1]] as const) {
      const a = verArquetipo(id, versao)!
      const m = Object.fromEntries(a.papeis.filter((p) => p.papel !== 'logo').map((p) => [p.papel, { width: 300, height: 40 }]))
      const x = materializarArquetipo({ arquetipo: a, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas: m, logo: { razao: 0.5 } })
      const y = materializarArquetipo({ arquetipo: a, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas: m, logo: { razao: 0.5 }, empilhar: { gap: 14 } })
      expect(y, id).toEqual(x)
    }
  })

  it('18c. só empilha na mesma coluna: no título-gigante o apoio (direita) não desce sobre o serviço (esquerda), mesmo na mesma faixa pela logo', () => {
    const GIGANTE = verArquetipo('minimal-titulo-gigante', 1)!
    const medidas = { headline: { width: 880, height: 300 }, apoio: { width: 320, height: 86 }, servico: { width: 440, height: 49 } }
    const solto = materializarArquetipo({ arquetipo: GIGANTE, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 } })
    const pilha = materializarArquetipo({ arquetipo: GIGANTE, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), medidas, logo: { razao: 0.5 }, empilhar: { gap: 14 } })
    expect(solto.ok && pilha.ok).toBe(true)
    if (!solto.ok || !pilha.ok) return
    expect(pilha.papeis).toEqual(solto.papeis)
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

describe('CP2B · materialização deslocada (dy da busca espacial)', () => {
  const base = {
    arquetipo: TOPO,
    formato: 'story' as const,
    canvas: DIMENSOES.story,
    geometria: geo('story'),
    medidas: { pre: { width: 300, height: 50 }, headline: { width: 700, height: 200 }, servico: { width: 400, height: 60 } },
    logo: { razao: 0.5 },
  }

  it('a posição parte da referência transladada; a referência, a zona e a capacidade não mudam', () => {
    const naReferencia = materializarArquetipo(base)
    const m = materializarArquetipo({ ...base, deslocamentos: { pre: -40, headline: -40, servico: -100, logo: -100 } })
    expect(m.ok).toBe(true)
    if (!m.ok || !naReferencia.ok) return
    expect(m.papeis.pre!.posicao).toEqual({ x: 92, y: 190, width: 300, height: 50 })
    expect(m.papeis.headline!.posicao).toEqual({ x: 92, y: 258, width: 700, height: 200 })
    expect(m.papeis.servico!.posicao).toEqual({ x: 92, y: 1455, width: 400, height: 60 })
    // A logo em contain na referência TRANSLADADA (1575 − 100), com a mesma caixa.
    expect(m.papeis.logo!.posicao).toEqual({ x: 799, y: 1475, width: 189, height: 95 })
    for (const p of ['pre', 'headline', 'servico', 'logo'] as const) {
      expect(m.papeis[p]!.referencia).toEqual(naReferencia.papeis[p]!.referencia)
      expect(m.papeis[p]!.zonaEfetiva).toEqual(naReferencia.papeis[p]!.zonaEfetiva)
    }
    // A capacidade é a da referência: a caixa maior que ela continua recusada, deslocada ou não.
    const grande = materializarArquetipo({ ...base, medidas: { ...base.medidas, headline: { width: 700, height: 260 } }, deslocamentos: { headline: 100 } })
    expect(problemas(grande).map((p) => [p.codigo, p.papel])).toEqual([['ARQUETIPO_TEXTO_NAO_CABE', 'headline']])
  })

  it('o deslocamento que passa da zona efetiva é FORA_DA_ZONA, dito na posição candidata', () => {
    // O pré-título em y 230,4 − 60 = 170,4 sai da zona (topo em 188,16).
    const m = materializarArquetipo({ ...base, deslocamentos: { pre: -60 } })
    expect(problemas(m)).toHaveLength(1)
    expect(problemas(m)[0]).toMatchObject({ codigo: 'ARQUETIPO_FORA_DA_ZONA', papel: 'pre', referencia: { x: 92, y: 230 }, zonaEfetiva: { y: 188 } })
    expect(problemas(m)[0].motivo).toBe('na posição candidata (dy=-60px), a caixa real (92,170 300×50) sai da zona efetiva (92,188 610×157)')
  })

  it('o ornamento é conferido na posição deslocada', () => {
    const ornamentos = { pre: { esquerda: 0, direita: 0, topo: 30, base: 0 } }
    // Na referência: o ornamento começa em 200,4, dentro da zona.
    expect(materializarArquetipo({ ...base, ornamentos }).ok).toBe(true)
    // Com dy −20 o texto (210,4) ainda cabe, mas o ornamento (180,4) sai.
    const m = materializarArquetipo({ ...base, ornamentos, deslocamentos: { pre: -20 } })
    expect(problemas(m).map((p) => [p.codigo, p.papel])).toEqual([['ARQUETIPO_FORA_DA_ZONA', 'pre']])
    expect(problemas(m)[0].motivo).toMatch(/^com o texto na posição candidata \(dy=-20px\), os ornamentos .* ocupam 92,180 /)
  })

  it('sem o parâmetro, com {} ou com dy 0: a saída é a de hoje, byte a byte (também nas recusas)', () => {
    const zeros = { pre: 0, headline: 0, apoio: 0, servico: 0, logo: 0 }
    const casos = [
      base,
      { ...base, geometria: { ...geo('story'), safeTopo: 250 } },
      { ...base, ornamentos: { headline: { esquerda: 0, direita: 0, topo: 0, base: 400 } } },
      { ...base, logo: { razao: 0 } },
    ]
    for (const args of casos) {
      const hoje = JSON.stringify(materializarArquetipo(args))
      expect(JSON.stringify(materializarArquetipo({ ...args, deslocamentos: {} }))).toBe(hoje)
      expect(JSON.stringify(materializarArquetipo({ ...args, deslocamentos: zeros }))).toBe(hoje)
    }
    expect(problemas(materializarArquetipo({ ...casos[1], deslocamentos: zeros }))[0].motivo).toMatch(/^na referência, .* — a área segura do projeto corta a referência$/)
  })
})

describe('régua física de altura e orçamento transitório', () => {
  // Medidores injetados: com a fração (altura natural 175,3 → caixa ceil 176) e o contrato antigo (só `height`).
  const comFracao: MeasureTextBox = () => ({ height: 176, naturalHeight: 175.3, maxLineWidth: 300, lineCount: 1, linhas: [{ texto: 'Linha', largura: 300 }] })
  const semFracao: MeasureTextBox = () => ({ height: 176, maxLineWidth: 300, lineCount: 1, linhas: [{ texto: 'Linha', largura: 300 }] })
  const ESTILO = { fontFamily: 'Inter', fontSize: 80, lineHeight: 1, color: '#000000', fontWeight: '700' } as never
  const argsDoBloco = (medir: MeasureTextBox) => ({ papel: 'headline' as const, linhas: ['Linha'], estilo: ESTILO, escalaDoFormato: 1, colunaUtil: 800, textAlign: 'left' as const, groupId: 'g', corDaMancha: '#fff', medir, alturaMaxima: 175 })
  const bloco = (h: number, orcamento: number) =>
    ({ papel: 'headline', layer: { id: 'headline', name: 'headline', type: 'text', content: 'x', position: { x: 0, y: 0 }, size: { width: 600, height: h }, style: { fontSize: 90, lineHeight: 1 }, metadata: { groupId: 'g' } }, width: 600, height: h, escala: 1, cor: '#fff', chave: 'g', linhasDaCopy: ['x'], indicesDoBloco: [0], familiasMedidas: [], orcamentoDeAltura: orcamento }) as unknown as BlocoPreparado
  const topoComReferencia = (h: number) => {
    const a = structuredClone(TOPO) as any
    a.formatos.story.papeis.headline.referencia.h = h / DIMENSOES.story.height
    return a
  }
  const materializa = (arquetipo: any, blocos: BlocoPreparado[]) => {
    const unidades = unidadesDoArquetipo(arquetipo, blocos, 14)
    return { unidades, m: materializarUnidades({ arquetipo, formato: 'story', canvas: DIMENSOES.story, geometria: geo('story'), unidades, logo: null }) }
  }

  it('referência 175,49/176 recusa, 175,5/176 aceita, 177 recusa', () => {
    const casos: Array<[number, number]> = [[175.49, 176], [175.5, 176], [175.5, 177]]
    const vistos = casos.map(([ref, alt]) => {
      const a = topoComReferencia(ref)
      const { m } = materializa(a, [bloco(alt, Math.min(alt, Math.floor(ref)))])
      return ['problemas' in m, excedeAlturaDaReferencia(alt, a.formatos.story.papeis.headline.referencia, DIMENSOES.story)]
    })
    expect(vistos).toEqual([[true, true], [false, false], [true, true]])
  })

  it('orçamento menor não autoriza altura física excessiva', () => {
    const { unidades, m } = materializa(topoComReferencia(175.49), [bloco(176, 175)])
    expect([unidades[0].pilha.height, unidades[0].alturaDoOrcamento]).toEqual([176, 175])
    expect('problemas' in m).toBe(true)
    // Duas vozes ceil somam +2 na pilha física; o orçamento só decide a escala.
    const b2 = { ...bloco(85, 84), papel: 'headline2', layer: { ...bloco(85, 84).layer, id: 'headline2' }, indicesDoBloco: [1] } as unknown as BlocoPreparado
    const [u] = unidadesDoArquetipo(TOPO, [bloco(85, 84), b2], 14)
    expect(u.pilha.height).toBe(u.pilha.offsets[1] + 85)
    expect(u.pilha.height - u.alturaDoOrcamento).toBe(2)
  })

  it('medidor sem naturalHeight mantém o contrato (recusa sem fração)', () => {
    expect(montarBloco(argsDoBloco(semFracao)).bloco).toBeNull()
  })

  it('orçamento decide o degrau e fica fora do Layer', () => {
    const { bloco: b } = montarBloco(argsDoBloco(comFracao))
    expect(b && [b.height, b.layer.size.height, b.orcamentoDeAltura, 'orcamentoDeAltura' in b.layer]).toEqual([176, 176, 175, false])
  })
})
