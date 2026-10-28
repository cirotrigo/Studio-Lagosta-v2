/**
 * T5 (preflight, 24/10/2026) — CARACTERIZAÇÃO do rodízio de variantes de hoje, que o contrato de "promover layout a
 * variante" vai precisar mudar. Não é comportamento novo: fixa o atual para o T5 ter um ponto de partida medido.
 *
 * 1. Qualquer página que entra no template "Assinatura" vira candidata do rodízio na hora — e muda a variante de
 *    peças NOVAS cuja chave antes caía noutra (é o "muda as levas existentes do cliente" da proposta).
 * 2. A recomposição (`varianteOriginal`) e o pedido explícito por id NÃO dependem do rodízio: uma exclusão futura do
 *    rodízio precisa acontecer DEPOIS do `porId`, nunca no carregamento (senão a peça fixada perde a variante).
 */
import { describe, expect, it } from 'vitest'
import { escolherVariante, type CandidataAVariante } from '../assinatura'

const story = (id: string): CandidataAVariante => ({ id, name: id, tags: [], width: 1080, height: 1920, papeis: ['headline', 'apoio'] })
const criterios = (chave: string, extra: Record<string, unknown> = {}) => ({ formato: 'story' as const, papeis: ['headline' as const, 'apoio' as const], chave, ...extra })
const chaves = Array.from({ length: 40 }, (_, i) => `peca-${i}`)

describe('T5 · caracterização do rodízio de variantes (comportamento atual)', () => {
  const antes = [story('a-variante-1'), story('a-variante-2')]
  const depois = [...antes, story('layout-promovido')]

  it('a página nova no template entra no rodízio e troca a variante de peças novas que antes caíam noutra', () => {
    const trocadas = chaves.filter((c) => escolherVariante(antes, criterios(c)).pagina?.id !== escolherVariante(depois, criterios(c)).pagina?.id)
    expect(trocadas.length).toBeGreaterThan(0)
    expect(chaves.some((c) => escolherVariante(depois, criterios(c)).pagina?.id === 'layout-promovido')).toBe(true)
    expect(escolherVariante(depois, criterios(trocadas[0])).motivo).toMatch(/rodízio entre 3/)
  })

  it('a recomposição (varianteOriginal) e o pedido por id ficam onde estavam, com ou sem a página nova', () => {
    for (const c of chaves) {
      expect(escolherVariante(depois, criterios(c, { varianteOriginal: 'a-variante-2' })).pagina?.id).toBe('a-variante-2')
    }
    expect(escolherVariante(depois, criterios('x', { variante: 'layout-promovido' }))).toMatchObject({ pagina: { id: 'layout-promovido' }, motivo: 'fixada por id' })
  })

  it('a página que SAI da lista carregada (exclusão no carregamento) faz a peça fixada perder a variante', () => {
    const r = escolherVariante(antes, criterios('peca-0', { varianteOriginal: 'layout-promovido' }))
    expect(r.pagina?.id).not.toBe('layout-promovido')
    expect(r.motivo).toMatch(/não existe mais/)
  })
})
