/**
 * C6-13 da pré-revisão do HEAD a821c0aa (12/09/2026): o registro do crivo em
 * `Generation.fieldValues.crivo` mescla NO BANCO e não ressuscita o registro de
 * outra versão da mídia — a mesma classe do C6-02 (espelho do feedback).
 *
 * Caminho real: `avaliarCrivo` com o modelo, o DNA e a base falsos, até
 * `registrarNaGeneration`. O banco falso aplica o merge raso de
 * `mesclarFieldValuesDaArte` (`fieldValues || patch`) e uma escrita concorrente
 * (o re-render da mesma arte) que cai DEPOIS de qualquer leitura da linha e
 * ANTES de qualquer merge — quem lê-e-regrava fica com o valor velho na mão.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generations: new Map<string, Record<string, unknown>>(),
  merges: [] as Array<Record<string, unknown>>,
  escritaConcorrente: null as null | (() => void),
}))

function dispararEscritaConcorrente() {
  const escrever = banco.escritaConcorrente
  banco.escritaConcorrente = null
  escrever?.()
}

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const fv = banco.generations.get(where.id)
        const lido = fv ? { id: where.id, fieldValues: structuredClone(fv) } : null
        dispararEscritaConcorrente()
        return lido
      },
      update: async ({ where, data }: { where: { id: string }; data: { fieldValues: Record<string, unknown> } }) => {
        banco.generations.set(where.id, data.fieldValues)
        return { id: where.id }
      },
    },
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join('?')
      if (!sql.includes('||')) throw new Error(`SQL inesperado no teste: ${sql}`)
      dispararEscritaConcorrente()
      const id = String(valores[valores.length - 1])
      const patch = JSON.parse(String(valores[0])) as Record<string, unknown>
      banco.merges.push(patch)
      const atual = banco.generations.get(id)
      if (!atual) return 0
      banco.generations.set(id, { ...atual, ...patch })
      return 1
    },
  },
}))
vi.mock('ai', () => ({ generateObject: async () => ({ object: { itens: [] } }) }))
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'modelo-falso' }))
vi.mock('@/lib/knowledge/search', () => ({ getProjectPromptKnowledgeContext: async () => ({ context: '', warnings: [] }) }))
vi.mock('@/lib/brand/brand-context', () => ({
  loadBrandContext: async () => ({
    projectName: 'Lagosta Criativa',
    fonts: [],
    colors: [],
    dna: {
      approvalChecklist: 'A arte está sem emoji?\nO preço confere com a base?',
      toneOfVoice: null,
      contentRules: null,
      composition: null,
      visualStyle: null,
      photoDirection: null,
    },
  }),
}))

import { avaliarCrivo } from '../crivo-avaliacao'

const ARTE = 'gen-crivo'

beforeEach(() => {
  banco.generations = new Map()
  banco.merges = []
  banco.escritaConcorrente = null
})

describe('crivo — o registro na Generation é merge no banco (C6-13)', () => {
  it('um re-render que chega no meio do registro sobrevive: o marcador, a copy e a trava da versão anterior NÃO voltam', async () => {
    const DEPOIS_DO_RE_RENDER = { estado: 're-renderizada', em: 'C', avisos: ['Camadas da página ilegíveis: a copy visual da arte foi mantida como estava.'] }
    banco.generations.set(ARTE, {
      source: 'ajuste-arte',
      pageId: 'p9',
      prompt: 'registro atômico da run',
      slotValues: { headline: 'Copy B' },
      recomposicao: { estado: 're-renderizada', em: 'B', copyVisualRegravada: true },
      somenteReRender: { desde: 'B', motivo: 'trava do revisor' },
    })
    banco.escritaConcorrente = () => {
      const fv = banco.generations.get(ARTE) as Record<string, unknown>
      banco.generations.set(ARTE, { ...fv, recomposicao: DEPOIS_DO_RE_RENDER, somenteReRender: { desde: 'C', motivo: 'trava nova' } })
    }

    const resultado = await avaliarCrivo(8, { copy: ['Almoço executivo'], quando: '2026-10-01 11:00', formato: 'story', generationId: ARTE })

    expect(resultado.degradado).toBe(false)
    expect(resultado.itens).toHaveLength(2)
    expect(banco.escritaConcorrente).toBeNull()
    const fv = banco.generations.get(ARTE) as Record<string, any>
    expect(fv.recomposicao).toEqual(DEPOIS_DO_RE_RENDER)
    expect('copyVisualRegravada' in fv.recomposicao).toBe(false)
    expect(fv.somenteReRender).toEqual({ desde: 'C', motivo: 'trava nova' })
    expect(fv.slotValues).toEqual({ headline: 'Copy B' })
    expect(fv.prompt).toBe('registro atômico da run')
    expect(fv.crivo).toMatchObject({ avaliadoEm: resultado.avaliadoEm, degradado: false })
    expect(fv.crivo.itens).toHaveLength(2)
  })

  it('o patch leva só a chave `crivo`; sem generationId, não escreve nada', async () => {
    banco.generations.set(ARTE, { source: 'arte-ia', prompt: 'p' })
    await avaliarCrivo(8, { copy: ['Almoço executivo'], generationId: ARTE })
    expect(banco.merges).toHaveLength(1)
    expect(Object.keys(banco.merges[0])).toEqual(['crivo'])

    banco.merges = []
    await avaliarCrivo(8, { copy: ['Almoço executivo'], generationId: null })
    expect(banco.merges).toHaveLength(0)
  })
})
