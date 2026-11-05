/** Piloto sintético — o lote é DITO: determinístico, com exclusões registradas, amostra com cobertura mínima e denominadores. */
import { describe, expect, it } from 'vitest'
import { COPIES, ENTRADAS_DE_FOTO, arquetiposDoLote, specsDoLote } from './suporte/lote-do-piloto'

const clientes = [
  { id: 'cliente-00', formatos: ['story', 'feed'] as const },
  { id: 'cliente-01', formatos: ['story'] as const },
].map((c) => ({ id: c.id, formatos: [...c.formatos] }))

describe('lote do piloto', () => {
  it('toda copy traz apoio (o mínimo que todo arquétipo aceita); o catálogo tem os três arquétipos e diz qual está indisponível', () => {
    for (const blocos of Object.values(COPIES)) expect(blocos.map((b) => b.papel)).toEqual(expect.arrayContaining(['headline', 'apoio', 'servico']))
    const arqs = arquetiposDoLote()
    expect(arqs.map((a) => a.id).sort()).toEqual(['minimal-fb-base-esquerda', 'minimal-fb-centro-optico', 'minimal-fb-topo-esquerda'])
    expect(arqs.find((a) => a.id === 'minimal-fb-base-esquerda')?.disponivel).toBe(false)
  })

  it('elegíveis e exclusões: "sem" sempre; arquétipo só no formato que aceita e só com foto com assunto; indisponível vira exclusão', () => {
    const { elegiveis, excluidos, denominadores } = specsDoLote({ clientes, amostra: 'completo' })
    const semArq = elegiveis.filter((e) => e.arquetipo === 'sem')
    const entradasStory = ENTRADAS_DE_FOTO.filter((f) => f.formatos.includes('story')).length
    const entradasFeed = ENTRADAS_DE_FOTO.filter((f) => f.formatos.includes('feed')).length
    expect(semArq.length).toBe((entradasStory * 2 + entradasFeed) * Object.keys(COPIES).length)
    expect(elegiveis.filter((e) => e.arquetipo !== 'sem').every((e) => ENTRADAS_DE_FOTO.find((f) => f.id === e.foto)!.temAssunto)).toBe(true)
    expect(excluidos.some((x) => x.motivo === 'arquetipo-indisponivel' && x.arquetipo === 'minimal-fb-base-esquerda')).toBe(true)
    expect(excluidos.some((x) => x.motivo === 'arquetipo-exige-assunto')).toBe(true)
    expect(denominadores.elegiveis).toBe(elegiveis.length)
    expect(denominadores.amostra).toBe(elegiveis.length)
    // Determinístico: a mesma entrada dá o mesmo loteId e a mesma ordem.
    const outra = specsDoLote({ clientes, amostra: 'completo' })
    expect(outra.loteId).toBe(specsDoLote({ clientes, amostra: 'completo' }).loteId)
    expect(outra.elegiveis.map((e) => e.chave)).toEqual(elegiveis.map((e) => e.chave))
  })

  it('amostra 1/6 determinística com cobertura mínima de 3 por valor de cada eixo (quando o eixo tem ≥ 3 elegíveis)', () => {
    const a = specsDoLote({ clientes, amostra: 1 / 6 })
    const b = specsDoLote({ clientes, amostra: 1 / 6 })
    expect(a.amostra.map((e) => e.chave)).toEqual(b.amostra.map((e) => e.chave))
    expect(a.amostra.length).toBeLessThan(a.elegiveis.length)
    for (const eixo of ['cliente', 'formato', 'foto', 'copy', 'arquetipo'] as const) {
      for (const [valor, n] of Object.entries(a.denominadores.porEixo[eixo])) {
        const elegiveisDoValor = a.elegiveis.filter((e) => e[eixo] === valor).length
        expect(n, `${eixo}=${valor}`).toBeGreaterThanOrEqual(Math.min(3, elegiveisDoValor))
      }
    }
    // Nenhuma chave repetida na amostra.
    expect(new Set(a.amostra.map((e) => e.chave)).size).toBe(a.amostra.length)
  })
})
