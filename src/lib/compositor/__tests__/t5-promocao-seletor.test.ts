/**
 * T5 (24/10/2026) — a variante PROMOVIDA nasce fora do rodízio: o seletor a acha quando pedida (id, nome,
 * `varianteOriginal`) e nunca a escolhe sozinho. A marca é a tag literal `fora-do-rodizio` (de propósito sem importar
 * o módulo novo: estes casos rodam também contra a fonte de antes, como controle negativo).
 *
 * S1 é uma TABELA antes/depois: com `T5_TABELA_S1=<arquivo>` o teste grava as escolhas sem promovida, e as duas
 * gravações (fonte de antes e de depois) são comparadas fora do teste.
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { escolherVariante, type CandidataAVariante } from '../assinatura'
import type { Formato, Papel } from '../spec'

const MARCA = 'fora-do-rodizio'
const pag = (id: string, formato: 'story' | 'feed', extra: Partial<CandidataAVariante> = {}): CandidataAVariante => ({
  id,
  name: id,
  tags: [],
  width: 1080,
  height: formato === 'story' ? 1920 : 1350,
  papeis: ['headline', 'apoio'],
  ...extra,
})
const promovida = (id: string, formato: 'story' | 'feed', extra: Partial<CandidataAVariante> = {}) => pag(id, formato, { tags: [MARCA, formato], ...extra })

const base = [
  pag('story-clara', 'story', { tags: ['clara'] }),
  pag('story-escura', 'story', { tags: ['escura'] }),
  pag('story-funcionamento', 'story', { name: 'Funcionamento', papeis: ['headline', 'apoio', 'servico'] }),
  pag('story-neutra', 'story'),
  pag('feed-1', 'feed'),
  pag('feed-2', 'feed', { tags: ['clara'] }),
]
const chaves = Array.from({ length: 40 }, (_, i) => `peca-${i}`)
const temas = [null, 'funcionamento da casa']
const luzes = [null, 40, 220]
const papeisDaPeca: Papel[][] = [['headline', 'apoio'], ['headline', 'servico']]

function tabela(paginas: CandidataAVariante[]) {
  const linhas: Array<{ entrada: string; pagina: string | null; motivo: string }> = []
  for (const formato of ['story', 'feed'] as Formato[])
    for (const tema of temas)
      for (const luzDaFoto of luzes)
        for (const papeis of papeisDaPeca)
          for (const chave of chaves) {
            const r = escolherVariante(paginas, { formato, tema, luzDaFoto, papeis, chave })
            linhas.push({ entrada: `${formato}|${tema}|${luzDaFoto}|${papeis.join(',')}|${chave}`, pagina: r.pagina?.id ?? null, motivo: r.motivo })
          }
  return linhas
}

describe('T5 · seletor com variante promovida', () => {
  it('S1: sem promovida, a tabela de escolhas (480 entradas) é gravada para o antes/depois', () => {
    const t = tabela(base)
    expect(t).toHaveLength(2 * temas.length * luzes.length * papeisDaPeca.length * chaves.length)
    if (process.env.T5_TABELA_S1) writeFileSync(process.env.T5_TABELA_S1, JSON.stringify(t, null, 1))
  })

  it('S2: com promovidas em qualquer posição, NENHUMA escolha automática muda', () => {
    const sem = tabela(base)
    const posicoes = [
      [promovida('promo-story', 'story'), promovida('promo-feed', 'feed'), ...base],
      [...base.slice(0, 3), promovida('promo-story', 'story', { tags: [MARCA, 'story', 'clara'] }), ...base.slice(3)],
      [...base, promovida('promo-feed', 'feed', { name: 'Funcionamento feed', papeis: ['headline', 'apoio', 'servico'] })],
    ]
    for (const paginas of posicoes) {
      const com = tabela(paginas)
      const mudaram = com.filter((l, i) => l.pagina !== sem[i].pagina || l.motivo !== sem[i].motivo)
      expect(mudaram).toEqual([])
    }
  })

  it('S3: promovida como a PRIMEIRA de feed — feed automático segue nas de story; pedido por nome de story continua achado', () => {
    const soStories = base.filter((p) => p.height === 1920)
    const comFeedPromovido = [promovida('promo-feed', 'feed'), ...soStories]
    for (const chave of chaves) {
      const sem = escolherVariante(soStories, { formato: 'feed', chave })
      const com = escolherVariante(comFeedPromovido, { formato: 'feed', chave })
      expect(com.pagina?.id).toBe(sem.pagina?.id)
      expect(com.motivo).toBe(sem.motivo)
    }
    expect(escolherVariante(comFeedPromovido, { formato: 'feed', variante: 'funcionamento' })).toMatchObject({ pagina: { id: 'story-funcionamento' }, motivo: 'pedida' })
  })

  it('S4: pedido pelo id acha a promovida (fixada por id), de story e de feed', () => {
    const paginas = [...base, promovida('promo-story', 'story'), promovida('promo-feed', 'feed')]
    expect(escolherVariante(paginas, { formato: 'story', variante: 'promo-story' })).toMatchObject({ pagina: { id: 'promo-story' }, motivo: 'fixada por id' })
    expect(escolherVariante(paginas, { formato: 'feed', variante: 'promo-feed' })).toMatchObject({ pagina: { id: 'promo-feed' }, motivo: 'fixada por id' })
    // A peça de feed pede uma story promovida pelo id, como já pedia uma story comum.
    expect(escolherVariante(paginas, { formato: 'feed', variante: 'promo-story' })).toMatchObject({ pagina: { id: 'promo-story' }, motivo: 'fixada por id' })
  })

  it('S5: varianteOriginal = promovida → fixada por id, para todas as chaves', () => {
    const paginas = [...base, promovida('promo-story', 'story')]
    for (const chave of chaves) {
      expect(escolherVariante(paginas, { formato: 'story', chave, varianteOriginal: 'promo-story' })).toMatchObject({ pagina: { id: 'promo-story' }, motivo: 'fixada por id' })
    }
  })

  it('S6: pedido por nome que só a promovida tem → pedida', () => {
    const paginas = [...base, promovida('promo-story', 'story', { name: 'Convite do chef' })]
    expect(escolherVariante(paginas, { formato: 'story', variante: 'convite do chef' })).toMatchObject({ pagina: { id: 'promo-story' }, motivo: 'pedida' })
  })

  it('S7: pedido por nome que já achava uma antiga continua na antiga, mesmo com a promovida antes no array', () => {
    const paginas = [promovida('promo-story', 'story', { name: 'Funcionamento novo' }), ...base]
    expect(escolherVariante(paginas, { formato: 'story', variante: 'funcionamento' })).toMatchObject({ pagina: { id: 'story-funcionamento' }, motivo: 'pedida' })
  })

  it('S8: a marca não é seletor — `variante: fora-do-rodizio` não escolhe a promovida', () => {
    const paginas = [...base, promovida('promo-story', 'story')]
    const r = escolherVariante(paginas, { formato: 'story', variante: MARCA })
    expect(r.pagina?.id).not.toBe('promo-story')
    expect(r).toMatchObject({ pagina: null, motivo: 'variante pedida não encontrada' })
  })

  it('S9: só promovidas e nenhum pedido → sem página, com o motivo (sem sorteio)', () => {
    const paginas = [promovida('promo-story', 'story'), promovida('promo-feed', 'feed')]
    for (const formato of ['story', 'feed'] as Formato[]) {
      for (const chave of chaves) {
        const r = escolherVariante(paginas, { formato, chave })
        expect(r.pagina).toBeNull()
        expect(r.motivo).toMatch(/fora do rodízio/)
      }
    }
    // …e o pedido explícito continua valendo.
    expect(escolherVariante(paginas, { formato: 'story', variante: 'promo-story' }).pagina?.id).toBe('promo-story')
  })

  it('S11: nenhuma página → "sem página", como hoje', () => {
    expect(escolherVariante([], { formato: 'story', chave: 'x' })).toEqual({ pagina: null, formatoDaPagina: null, motivo: 'sem página' })
  })

  it('R2: a promovida apagada → a recomposição diz "não existe mais" e a escolha automática segue', () => {
    const r = escolherVariante(base, { formato: 'story', chave: 'peca-3', varianteOriginal: 'promo-story' })
    expect(r.pagina).not.toBeNull()
    expect(r.motivo).toMatch(/não existe mais/)
  })
})
