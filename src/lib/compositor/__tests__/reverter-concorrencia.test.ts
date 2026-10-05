/**
 * PR3-F01 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): a reversão
 * calcula a revisão do contrato sobre a página RELIDA na escrita e grava
 * condicionada a ela. O serviço real (`reverterCamadasDaArte`) com o banco em
 * memória; o PATCH concorrente cai entre a leitura e a escrita.
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

function texto(id: string, y: number, content: string) {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } } }
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
const camadasX = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')]
const camadasY = [texto('headline', 200, 'Milk-shake em dobro'), texto('apoio', 400, 'Sexta é dia')]

/** O PATCH do editor gravando Y com a revisão da equipe (como o handler grava). */
function patchDaEquipeGravaY() {
  const r = revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, camadasY, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
  banco.pagina = { ...banco.pagina, layers: JSON.stringify(camadasY), copyAutoral: r.copy, updatedAt: new Date(++banco.relogio) }
}

/** O contrato descreve as camadas gravadas? (a releitura não acharia mudança nenhuma) */
function contratoDescreveAsCamadas() {
  return revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, banco.pagina.layers, { autor: 'sistema', motivo: 'conferência', superficie: 'teste' }).estado === 'sem-mudanca'
}

beforeEach(() => {
  banco.escritas = 0
  banco.antesDaEscrita = {}
  banco.arte = { id: 'gen-1', projectId: 8, fieldValues: { pageId: 'p1', layersSnapshot: camadasX } }
})

describe('reverter-arte com um PATCH no meio (PR3-F01)', () => {
  it('ramo `sem-mudanca`: a reversão lê X = snapshot, o PATCH grava Y no meio — o contrato acompanha as camadas X e guarda a revisão da equipe', async () => {
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(camadasX), copyAutoral: contratoX, updatedAt: new Date(banco.relogio) }
    banco.antesDaEscrita[1] = patchDaEquipeGravaY
    await reverterCamadasDaArte('gen-1')
    expect(JSON.parse(banco.pagina.layers)[0].content).toBe('Milk-shake')
    expect(contratoDescreveAsCamadas()).toBe(true)
    const c = copyAutoralDaPagina(banco.pagina.copyAutoral)!
    expect(c.revisoes.map((r) => r.autor)).toEqual(['equipe', 'sistema'])
    expect(c.revisoes[1].superficie).toBe('reverter-arte')
  })

  it('ramo `registrada`: a página tinha Y; outro PATCH grava Z no meio — a revisão dele não é apagada', async () => {
    const rY = revisaoDaPaginaComCamadas(contratoX, camadasY, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(camadasY), copyAutoral: rY.copy, updatedAt: new Date(banco.relogio) }
    banco.antesDaEscrita[1] = () => {
      const camadasZ = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sábado também')]
      const r = revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, camadasZ, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat' })
      banco.pagina = { ...banco.pagina, layers: JSON.stringify(camadasZ), copyAutoral: r.copy, updatedAt: new Date(++banco.relogio) }
    }
    await reverterCamadasDaArte('gen-1')
    expect(contratoDescreveAsCamadas()).toBe(true)
    expect(copyAutoralDaPagina(banco.pagina.copyAutoral)!.revisoes.map((r) => r.autor)).toEqual(['equipe', 'claude', 'sistema'])
  })

  it('controle sem concorrência: reverter Y → X registra a revisão do sistema', async () => {
    const rY = revisaoDaPaginaComCamadas(contratoX, camadasY, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    banco.pagina = { id: 'p1', isTemplate: false, layers: JSON.stringify(camadasY), copyAutoral: rY.copy, updatedAt: new Date(banco.relogio) }
    await reverterCamadasDaArte('gen-1')
    expect(contratoDescreveAsCamadas()).toBe(true)
    expect(copyAutoralDaPagina(banco.pagina.copyAutoral)!.revisoes.map((r) => r.autor)).toEqual(['equipe', 'sistema'])
  })
})
