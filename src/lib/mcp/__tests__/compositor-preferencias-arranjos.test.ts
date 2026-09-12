import { describe, expect, it } from 'vitest'
import { toolsDoCompositor } from '../catalogo/compositor'

/**
 * R14 da revisão de 4413e0a1: `comoFixar` mandava `preferencias.arranjos`, mas
 * o schema público de `preferencias` não o declarava — a porta faz
 * `safeParse` e o objeto zod aninhado DESCARTA a chave desconhecida, então o
 * compositor recebia só a variante. O que se prova aqui é o que a porta faz:
 * o campo sobrevive ao parse nas duas tools, nas duas formas.
 */
describe('compor-arte e compor-leva aceitam preferencias.arranjos (por grupo e no legado)', () => {
  const tool = (nome: string) => toolsDoCompositor.find((t) => t.nome === nome)!
  const arranjos = [{ grupo: 'g-topo', arranjo: 'combinacao:a' }, 'pagina-x:g-rodape']
  it('compor-arte', () => {
    const r = tool('compor-arte').schema.safeParse({ projectId: 6, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Oi'] }], preferencias: { variante: 'p6', arranjos } })
    expect(r.success).toBe(true)
    expect((r.success ? (r.data as { preferencias?: { arranjos?: unknown } }) : null)?.preferencias?.arranjos).toEqual(arranjos)
  })
  it('compor-leva', () => {
    const r = tool('compor-leva').schema.safeParse({ projectId: 6, itens: [{ formato: 'story', blocos: [{ papel: 'headline', linhas: ['Oi'] }], preferencias: { variante: 'p6', arranjos } }] })
    expect(r.success).toBe(true)
    const itens = (r.success ? (r.data as { itens?: Array<{ preferencias?: { arranjos?: unknown } }> }) : null)?.itens
    expect(itens?.[0]?.preferencias?.arranjos).toEqual(arranjos)
  })
  it('mais de 8 arranjos, ou grupo sem id, é recusado', () => {
    expect(tool('compor-arte').schema.safeParse({ projectId: 6, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Oi'] }], preferencias: { arranjos: Array.from({ length: 9 }, (_, i) => `a${i}`) } }).success).toBe(false)
    expect(tool('compor-arte').schema.safeParse({ projectId: 6, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Oi'] }], preferencias: { arranjos: [{ grupo: 'g' }] } }).success).toBe(false)
  })
})
