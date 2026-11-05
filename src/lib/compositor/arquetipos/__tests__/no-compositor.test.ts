/**
 * T1a — a unidade do arquétipo, pura: a ordem é a da copy, o vão é o ritmo da
 * casa, a pilha que pousa é a dos textos, e os ornamentos de QUALQUER texto da
 * unidade (também o do meio) entram na conferência da zona.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import type { BlocoPreparado } from '../../preparar-blocos'
import { verArquetipo } from '../catalogo'
import { ajusteFinalNecessario, camadasNaReferencia, materializarUnidades, unidadesDoArquetipo } from '../no-compositor'

const TOPO = verArquetipo('minimal-fb-topo-esquerda', 1)!
const piso = () => {
  const { margemH, safeTopo, safeRodape } = NUMEROS_PADRAO.geometria.story
  return { margemH, safeTopo, safeRodape }
}
const bloco = (papel: string, indice: number, extra: Record<string, unknown> = {}) =>
  ({
    papel,
    layer: { id: papel, name: papel, type: 'text', content: 'x', position: { x: 0, y: 0 }, size: { width: 600, height: 104 }, style: { fontSize: 90, lineHeight: 1 }, metadata: { groupId: 'g-pagina', compositor: { encaixe: 12 } } },
    width: 600,
    height: 104,
    escala: 1,
    cor: '#FFFFFF',
    chave: 'g-pagina',
    linhasDaCopy: ['x'],
    indicesDoBloco: [indice],
    vaoAntes: -40,
    familiasMedidas: [],
    ...extra,
  }) as unknown as BlocoPreparado

describe('T1a · a unidade do arquétipo', () => {
  it('ordem da copy (voz 2 depois da manchete, mesmo vinda antes), vão da casa, sem encaixe, groupId da unidade', () => {
    const [u] = unidadesDoArquetipo(TOPO, [bloco('headline2', 1), bloco('headline', 0)], 14)
    expect(u.blocos.map((b) => b.layer.id)).toEqual(['headline', 'headline2'])
    expect(u.pilha.offsets).toEqual([0, 104])
    expect(u.blocos.every((b) => (b.layer.metadata as { groupId: string }).groupId === 'grupo-arq-headline')).toBe(true)
    expect(u.blocos.every((b) => (b.layer.metadata as { compositor: Record<string, unknown> }).compositor.encaixe === undefined)).toBe(true)
  })

  it('o ornamento do texto do MEIO que desce além do último entra na conferência da zona (e não desloca a pilha)', () => {
    const fileteSobAManchete = { lado: 'abaixo', eixo: 'inicio', offsetX: 0, offsetY: 250, width: 200, height: 4 }
    const unidades = unidadesDoArquetipo(TOPO, [bloco('headline', 0, { elementos: [fileteSobAManchete], escalaDosElementos: 1 }), bloco('headline2', 1)], 14)
    expect(unidades[0].pilha.height).toBe(208)
    expect(unidades[0].ornamentos).toEqual({ esquerda: 0, direita: 0, topo: 0, base: 150 })
    const m = materializarUnidades({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: piso(), unidades, logo: null })
    expect('problemas' in m ? m.problemas.map((p) => [p.codigo, p.papel, /ornamentos/.test(p.motivo)]) : []).toEqual([['ARQUETIPO_FORA_DA_ZONA', 'headline', true]])
  })

  it('as camadas na referência e a conferência do ajuste final (a mesma no compor e no medir-copy)', () => {
    const unidades = unidadesDoArquetipo(TOPO, [bloco('headline', 0), bloco('headline2', 1)], 14)
    const m = materializarUnidades({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: piso(), unidades, logo: null })
    expect('papeis' in m).toBe(true)
    const [{ camadas }] = camadasNaReferencia(unidades, 'papeis' in m ? m.papeis : {}, 'esquerda')
    expect(camadas.map((c) => [c.id, c.position])).toEqual([
      ['headline', { x: 92, y: 298 }],
      ['headline2', { x: 92, y: 402 }],
    ])
    // Medidor que cabe: nada a ajustar. Medidor que transborda a caixa: o ajuste final seria necessário — recusa.
    const cabe = () => ({ height: 100, maxLineWidth: 300, lineCount: 1, linhas: [] })
    expect(ajusteFinalNecessario(camadas, DIMENSOES.story, cabe)).toEqual([])
    const transborda = () => ({ height: 300, maxLineWidth: 300, lineCount: 3, linhas: [] })
    expect(ajusteFinalNecessario(camadas, DIMENSOES.story, transborda).map((i) => i.tipo)).toContain('overflow')
  })
})

describe('CP2B · as unidades deslocadas', () => {
  it('materializarUnidades repassa os deslocamentos: as camadas pousam na posição candidata', () => {
    const unidades = unidadesDoArquetipo(TOPO, [bloco('headline', 0), bloco('headline2', 1)], 14)
    const m = materializarUnidades({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: piso(), unidades, logo: null, deslocamentos: { headline: 40 } })
    expect('papeis' in m).toBe(true)
    const [{ camadas }] = camadasNaReferencia(unidades, 'papeis' in m ? m.papeis : {}, 'esquerda')
    expect(camadas.map((c) => [c.id, c.position])).toEqual([
      ['headline', { x: 92, y: 338 }],
      ['headline2', { x: 92, y: 442 }],
    ])
    // Além da zona (a pilha de 208 px em 297,6 + 200 passa de 639,36): recusa, dita na posição candidata.
    const fora = materializarUnidades({ arquetipo: TOPO, formato: 'story', canvas: DIMENSOES.story, geometria: piso(), unidades, logo: null, deslocamentos: { headline: 200 } })
    expect('problemas' in fora ? fora.problemas.map((p) => [p.codigo, p.papel, p.motivo.startsWith('na posição candidata (dy=200px)')]) : []).toEqual([['ARQUETIPO_FORA_DA_ZONA', 'headline', true]])
  })
})

describe('o vão INTERNO da unidade é o gap da marca, não o da pilha (30/10/2026, revisão do Codex P2)', () => {
  it('serviço repartido em duas camadas: o segundo bloco fica a `gap × 1,6` do primeiro; GAP_DA_PILHA (0) só vale ENTRE papéis', () => {
    const dois = [bloco('headline', 0), bloco('servico', 1), bloco('servico', 2, { layer: { ...bloco('servico', 2).layer, id: 'servico-2' } })]
    const com14 = unidadesDoArquetipo(TOPO, dois, 14).find((u) => u.papel === 'servico')!
    const com0 = unidadesDoArquetipo(TOPO, dois, 0).find((u) => u.papel === 'servico')!
    expect(com14.blocos).toHaveLength(2)
    // O vão interno é o ritmo da casa (`gap × 1,6`, como entre grupos): 22 com o gap 14 — o que o Codex mediu.
    expect(com14.pilha.offsets[1] - com14.pilha.offsets[0]).toBe(104 + Math.round(14 * 1.6))
    expect(com0.pilha.offsets[1] - com0.pilha.offsets[0]).toBe(104)
  })
})
