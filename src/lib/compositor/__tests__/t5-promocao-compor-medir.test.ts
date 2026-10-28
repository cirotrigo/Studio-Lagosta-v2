/**
 * T5 (24/10/2026) — `comporPeca` e `medirCopyDoProjeto` REAIS até a escolha da variante (o `carregarAssinatura` e o
 * `escolherVariante` reais, espiados), com o banco em memória. Dublados: banco, registro de fontes, medidor do servidor,
 * combinações salvas e a medição da copy (`medirCopy`) — a régua de fonte não é o que se prova aqui.
 *
 * S9 · só promovidas e sem pedido → os dois recusam ASSINATURA_INCOMPLETA com o motivo.
 * C2 · `outrasVariantes` do medir não traz a promovida; pedida pelo id, é ela a medida.
 * C4 · `descreverVariantes` lista a promovida com `foraDoRodizio` e sem a marca nas tags.
 * C6 · compor e medir escolhem a MESMA variante para a mesma spec, com e sem promovida.
 * R1 · a peça fixada na promovida lê a página VIVA: editar a variante muda o que a recomposição carrega.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MARCA = 'fora-do-rodizio'
type Pagina = { id: string; name: string; tags: string[]; width: number; height: number; layers: string; background: string; order: number; templateId: number }
const banco = vi.hoisted(() => ({ paginas: [] as Pagina[] }))
const escolhas = vi.hoisted(() => ({ ids: [] as Array<string | null> }))

vi.mock('@/lib/db', () => {
  const casa = (p: Pagina, w: Record<string, any>) =>
    (w.templateId === undefined || p.templateId === w.templateId) &&
    (w.id === undefined || (typeof w.id === 'string' ? p.id === w.id : w.id.not !== undefined ? p.id !== w.id.not : w.id.in.includes(p.id)))
  return {
    db: {
      project: { findUnique: async () => ({ id: 3, name: 'Marca', userId: 'u', assinatura: null, Logo: [] }) },
      template: { findFirst: async () => ({ id: 10 }) },
      page: { findMany: async ({ where }: any) => structuredClone(banco.paginas.filter((p) => casa(p, where)).sort((a, b) => a.order - b.order)) },
    },
  }
})
vi.mock('@/lib/posts/register-project-fonts', async (orig) => ({ ...(await orig<object>()), registerProjectFonts: async () => undefined, familiasNaoCarregadas: async () => new Set<string>() }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextBoxMeasurer: async () => () => ({ height: 80, maxLineWidth: 300, lineCount: 1 }) }))
vi.mock('../compor', async (orig) => ({ ...(await orig<object>()), arranjosDasCombinacoes: async () => [], familiasDoProjeto: async () => [] }))
vi.mock('../medir-copy', async (orig) => ({
  ...(await orig<object>()),
  medirCopy: async () => ({ avisos: [], fundo: '#111111', cabeTudo: true, papeisAusentes: [], naoMedido: false, blocos: [], arranjos: [] }),
  orcamentoDaVariante: () => [],
}))
vi.mock('../assinatura', async (orig) => {
  const real = await orig<typeof import('../assinatura')>()
  return {
    ...real,
    escolherVariante: (...args: Parameters<typeof real.escolherVariante>) => {
      const r = real.escolherVariante(...args)
      escolhas.ids.push((r.pagina as { id?: string } | null)?.id ?? null)
      return r
    },
  }
})

import { comporPeca, carregarAssinatura } from '../compor'
import { descreverVariantes, medirCopyDoProjeto } from '../medir-copy-service'

const camadas = (fonte = 'Inter') =>
  JSON.stringify([
    { id: 'headline', name: 'headline', type: 'text', visible: true, position: { x: 100, y: 1300 }, size: { width: 800, height: 200 }, content: 'Manchete', style: { fontFamily: fonte, fontSize: 80, color: '#ffffff' } },
    { id: 'apoio', name: 'apoio', type: 'text', visible: true, position: { x: 100, y: 1550 }, size: { width: 800, height: 100 }, content: 'Apoio', style: { fontFamily: fonte, fontSize: 40, color: '#ffffff' } },
  ])
const pagina = (id: string, order: number, tags: string[] = [], name = id): Pagina => ({ id, name, tags, width: 1080, height: 1920, layers: camadas(), background: '#000000', order, templateId: 10 })
const blocos = [{ papel: 'headline', linhas: ['Quarta no Quintal'] }, { papel: 'apoio', linhas: ['Feijoada'] }]

beforeEach(() => {
  escolhas.ids = []
  banco.paginas = [pagina('a', 0), pagina('b', 1), pagina('c', 2)]
})

describe('T5 · compor e medir-copy com a variante promovida', () => {
  it('S9: só promovidas, sem pedido → compor e medir recusam ASSINATURA_INCOMPLETA com o motivo', async () => {
    banco.paginas = [pagina('promo', 0, [MARCA, 'story'])]
    await expect(comporPeca({ projectId: 3, formato: 'story', blocos })).rejects.toMatchObject({ code: 'ASSINATURA_INCOMPLETA', message: expect.stringMatching(/fora do rodízio/), details: { motivo: expect.stringMatching(/fora do rodízio/) } })
    await expect(medirCopyDoProjeto({ projectId: 3, formato: 'story', blocos } as never)).rejects.toMatchObject({ code: 'ASSINATURA_INCOMPLETA', message: expect.stringMatching(/fora do rodízio/) })
    // Sem template nenhum, a mensagem de sempre.
    banco.paginas = []
    await expect(comporPeca({ projectId: 3, formato: 'story', blocos })).rejects.toMatchObject({ code: 'ASSINATURA_INCOMPLETA', message: expect.stringMatching(/não tem página de assinatura/) })
  })

  it('C2: outrasVariantes não traz a promovida; pedida pelo id, a promovida é a medida', async () => {
    banco.paginas.push(pagina('promo', 3, [MARCA, 'story']))
    const r = await medirCopyDoProjeto({ projectId: 3, formato: 'story', blocos } as never)
    expect([r.variante.id, ...r.outrasVariantes.map((v) => v.id)].sort()).toEqual(['a', 'b', 'c'])
    const pedida = await medirCopyDoProjeto({ projectId: 3, formato: 'story', blocos, variante: 'promo' } as never)
    expect(pedida.variante.id).toBe('promo')
    expect(pedida.outrasVariantes.map((v) => v.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('C4: descreverVariantes lista a promovida com foraDoRodizio e sem a marca nas tags', async () => {
    banco.paginas.push(pagina('promo', 3, [MARCA, 'story']))
    const { variantes } = await descreverVariantes(3, 'story')
    expect(variantes.map((v) => [v.id, v.foraDoRodizio, v.tags])).toEqual([
      ['a', false, []],
      ['b', false, []],
      ['c', false, []],
      ['promo', true, ['story']],
    ])
  })

  it('C6: compor e medir escolhem a mesma variante para a mesma spec, com e sem promovida', async () => {
    const comparar = async () => {
      for (const nome of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
        escolhas.ids = []
        await comporPeca({ projectId: 3, formato: 'story', blocos, nome }, { somenteAvaliar: true }).catch(() => undefined)
        const doCompor = escolhas.ids[0]
        escolhas.ids = []
        const m = await medirCopyDoProjeto({ projectId: 3, formato: 'story', blocos, nome } as never)
        expect(doCompor).toBeDefined()
        expect(m.variante.id).toBe(doCompor)
        expect(doCompor).not.toBe('promo')
      }
    }
    await comparar()
    banco.paginas.splice(1, 0, pagina('promo', 1, [MARCA, 'story']))
    await comparar()
  })

  it('R1: a peça fixada na promovida carrega a página VIVA — a edição da variante chega à recomposição', async () => {
    banco.paginas.push(pagina('promo', 3, [MARCA, 'story']))
    const antes = await carregarAssinatura(3, 'story', { varianteOriginal: 'promo' })
    expect(antes.origem).toMatchObject({ pageId: 'promo', motivoDaVariante: 'fixada por id' })
    expect(antes.papeis.headline?.fontFamily).toBe('Inter')
    banco.paginas.find((p) => p.id === 'promo')!.layers = camadas('Georgia')
    const depois = await carregarAssinatura(3, 'story', { varianteOriginal: 'promo' })
    expect(depois.papeis.headline?.fontFamily).toBe('Georgia')
    // Apagada, a recomposição diz "não existe mais" e segue a escolha automática (R2).
    banco.paginas = banco.paginas.filter((p) => p.id !== 'promo')
    const apagada = await carregarAssinatura(3, 'story', { varianteOriginal: 'promo' })
    expect(apagada.origem.pageId).not.toBe('promo')
    expect(apagada.origem.motivoDaVariante).toMatch(/não existe mais/)
  })
})
