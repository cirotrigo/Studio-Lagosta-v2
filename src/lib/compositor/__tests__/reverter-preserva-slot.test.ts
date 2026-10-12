/**
 * PR B0: reverter volta o VISUAL do snapshot, mas a identidade lógica das
 * camadas (`metadata.slot`) vem da página RELIDA dentro do compare-and-set de
 * `gravarCamadasComRevisao` — o slot posto depois da composição sobrevive, e o
 * que um PATCH concorrente gravou no meio também.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as any,
  arte: null as any,
  relogio: 1_000,
  escritas: 0,
  antesDaEscrita: {} as Record<number, () => void>,
}))

vi.mock('@/lib/db', () => {
  const antes = () => {
    const n = ++banco.escritas
    const fn = banco.antesDaEscrita[n]
    delete banco.antesDaEscrita[n]
    fn?.()
  }
  const db: Record<string, any> = {
    generation: { findUnique: async () => structuredClone(banco.arte) },
    page: {
      findUnique: async () => structuredClone(banco.pagina),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        antes()
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return structuredClone(banco.pagina)
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        antes()
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('../recompor', () => ({ pedirRecomposicaoDaArteCongelada: vi.fn(async () => undefined) }))

import { reverterCamadasDaArte } from '../reverter'
import { VERSAO_DO_CONTRATO, copyAutoralDaPagina, revisaoDaPaginaComCamadas, type CopyAutoral } from '@/lib/copy-autoral'

function texto(id: string, y: number, content: string, metadata: Record<string, unknown> = {}) {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id }, ...metadata } }
}

const contratoX: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
    { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
  ],
  revisoes: [],
}
const snapshotX = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')]
const comSlotNoApoio = (content: string, extra: Record<string, unknown> = {}) => [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, content, { slot: { id: 'apoio-principal' }, ...extra })]

const camadasGravadas = () => JSON.parse(banco.pagina.layers) as Array<Record<string, any>>
const slots = () => camadasGravadas().map((l) => l.metadata?.slot)
function contratoDescreveAsCamadas() {
  return revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, banco.pagina.layers, { autor: 'sistema', motivo: 'conferência', superficie: 'teste' }).estado === 'sem-mudanca'
}

beforeEach(() => {
  banco.escritas = 0
  banco.antesDaEscrita = {}
  banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: snapshotX } }
})

describe('reverter preserva metadata.slot (PR B0)', () => {
  it('slot posto depois do snapshot sobrevive, e o conteúdo volta ao snapshot', async () => {
    const editada = comSlotNoApoio('Sábado também')
    const r = revisaoDaPaginaComCamadas(contratoX, editada, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(editada), copyAutoral: r.copy, updatedAt: new Date(banco.relogio) }
    await reverterCamadasDaArte('gen-1')
    expect(camadasGravadas()[1].content).toBe('Sexta é dia')
    expect(slots()).toEqual([undefined, { id: 'apoio-principal' }])
  })

  it('usa a base RELIDA pelo compare-and-set: o slot que um PATCH gravou no meio não se perde', async () => {
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(snapshotX), copyAutoral: contratoX, updatedAt: new Date(banco.relogio) }
    banco.antesDaEscrita[1] = () => {
      banco.pagina = { ...banco.pagina, layers: JSON.stringify(comSlotNoApoio('Sexta é dia')), updatedAt: new Date(++banco.relogio) }
    }
    await reverterCamadasDaArte('gen-1')
    expect(banco.escritas).toBeGreaterThan(1)
    expect(slots()).toEqual([undefined, { id: 'apoio-principal' }])
  })

  it('conflito de bloco: o slot não vai para outra camada nem fica na divergente', async () => {
    const snapshotComBloco = [texto('headline', 200, 'Milk-shake', { compositor: { papel: 'headline', bloco: 'headline' } }), texto('apoio', 400, 'Sexta é dia', { compositor: { papel: 'apoio', bloco: 'apoio' } })]
    banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: snapshotComBloco } }
    const pagina = [texto('headline', 200, 'Milk-shake', { compositor: { papel: 'headline', bloco: 'headline' } }), texto('apoio', 400, 'Sexta é dia', { compositor: { papel: 'apoio', bloco: 'outro' }, slot: { id: 'apoio-principal' } })]
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(pagina), copyAutoral: contratoX, updatedAt: new Date(banco.relogio) }
    const r = await reverterCamadasDaArte('gen-1')
    expect(slots()).toEqual([undefined, undefined])
    expect(r.avisos?.some((a) => a.includes('apoio-principal'))).toBe(true)
  })

  it('o contrato da copy continua revisado como antes (revisão do sistema, reverter-arte)', async () => {
    const editada = comSlotNoApoio('Sábado também')
    const r = revisaoDaPaginaComCamadas(contratoX, editada, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(editada), copyAutoral: r.copy, updatedAt: new Date(banco.relogio) }
    await reverterCamadasDaArte('gen-1')
    expect(contratoDescreveAsCamadas()).toBe(true)
    const c = copyAutoralDaPagina(banco.pagina.copyAutoral)!
    expect(c.revisoes.map((x) => x.autor)).toEqual(['equipe', 'sistema'])
    expect(c.revisoes[1].superficie).toBe('reverter-arte')
  })

  it('página sem slot: as camadas gravadas são exatamente as do snapshot', async () => {
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(snapshotX), copyAutoral: contratoX, updatedAt: new Date(banco.relogio) }
    await reverterCamadasDaArte('gen-1')
    expect(camadasGravadas()).toEqual(snapshotX)
  })
})

describe('reverter: a identidade vem da página, não do snapshot (codex review B0)', () => {
  const snapshotComSlot = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia', { slot: { id: 'slot-velho' } })]

  it('o slot do snapshot não vence o slot atual da página', async () => {
    banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: snapshotComSlot } }
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(comSlotNoApoio('Sexta é dia')), copyAutoral: contratoX, updatedAt: new Date(banco.relogio) }
    await reverterCamadasDaArte('gen-1')
    expect(slots()).toEqual([undefined, { id: 'apoio-principal' }])
  })

  it('slot removido da página não ressuscita pelo snapshot', async () => {
    banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: snapshotComSlot } }
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(snapshotX), copyAutoral: contratoX, updatedAt: new Date(banco.relogio) }
    await reverterCamadasDaArte('gen-1')
    expect(slots()).toEqual([undefined, undefined])
  })
})
