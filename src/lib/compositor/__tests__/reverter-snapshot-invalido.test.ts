/**
 * `validarCamadas` NUNCA descarta em silêncio — e quem lê o resultado também
 * não: o snapshot com camada que o contrato recusa (`type` fora de
 * `TIPOS_DE_CAMADA`, clipe fora do intervalo) não reverte pela metade. A
 * recusa leva os problemas e a página fica como estava.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ pagina: null as any, arte: null as any, relogio: 1_000, escritas: 0 }))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    generation: { findUnique: async () => structuredClone(banco.arte) },
    page: {
      findUnique: async () => structuredClone(banco.pagina),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.escritas++
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

function texto(id: string, y: number, content: string) {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } } }
}
const snapshot = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')]
const editada = [texto('headline', 200, 'Milk-shake em dobro'), texto('apoio', 400, 'Sexta é dia')]

function arteCom(layersSnapshot?: unknown) {
  banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', ...(layersSnapshot === undefined ? {} : { layersSnapshot }) } }
}

beforeEach(() => {
  banco.escritas = 0
  banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(editada), copyAutoral: null, updatedAt: new Date(banco.relogio) }
})

describe('reverter com snapshot fora do contrato', () => {
  it('camada com type fora de TIPOS_DE_CAMADA: recusa SNAPSHOT_COM_CAMADAS_INVALIDAS com o problema e não grava', async () => {
    arteCom([...snapshot, { ...texto('vetor', 600, ''), type: 'svg-path' }])
    const erro = await reverterCamadasDaArte('gen-1').catch((e) => e)
    expect(erro).toMatchObject({ code: 'SNAPSHOT_COM_CAMADAS_INVALIDAS', status: 422 })
    expect(erro.details.problemas).toEqual([expect.stringContaining('camada vetor: type')])
    expect(erro.message).toContain('camada vetor: type')
    expect(banco.escritas).toBe(0)
    expect(JSON.parse(banco.pagina.layers)).toEqual(editada)
  })

  it('snapshot todo válido: reverte como antes', async () => {
    arteCom(snapshot)
    const r = await reverterCamadasDaArte('gen-1')
    expect(r.camadas).toBe(2)
    expect(JSON.parse(banco.pagina.layers)).toEqual(snapshot)
  })

  it('arte sem snapshot continua SEM_SNAPSHOT (ausente não é inválido)', async () => {
    arteCom()
    await expect(reverterCamadasDaArte('gen-1')).rejects.toMatchObject({ code: 'SEM_SNAPSHOT' })
  })
})
