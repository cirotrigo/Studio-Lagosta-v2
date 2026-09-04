/**
 * A fila COMPOR de ponta a ponta, com o banco falso e o compositor falso.
 *
 * O que se pina é o defeito de 04/09/2026 (Espeto Gaúcho, `compor-leva` com
 * 20 itens de plano): o runner tem de entregar ao `comporPeca` a Generation
 * que a fila criou, o job tem de terminar DONE com essa Generation COMPLETED
 * (sem nascer uma segunda), e o item da leva tem de sair `pronto` com
 * `generationId`/`pageId` — sem ninguém ligar na mão.
 *
 * `comporPeca` é falso, mas o contrato dele é o real: fecha a Generation que
 * recebe em `opcoes.generationId` (é o que `persistAndRenderCreative` faz
 * quando o id vem — pinado em `persistencia.test.ts`). `enfileirarComposicao`,
 * `fecharJob` e `caminhoAte` são os de produção.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generations: new Map<string, Record<string, unknown>>(),
  jobs: new Map<string, Record<string, unknown>>(),
  itens: new Map<string, Record<string, unknown>>(),
  seq: 0,
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findUnique: async () => ({ id: 6, name: 'Espeto Gaúcho', userId: 'dono-interno' }),
    },
    generation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `gen-${++banco.seq}`
        banco.generations.set(id, { id, ...data })
        return { id }
      },
      findUnique: async ({ where }: { where: { id: string } }) => banco.generations.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const atual = banco.generations.get(where.id)
        if (!atual) throw new Error('not found')
        banco.generations.set(where.id, { ...atual, ...data })
        return { id: where.id }
      },
    },
    generationJob: {
      upsert: async ({ where, create }: { where: { generationId: string }; create: Record<string, unknown> }) => {
        const existente = [...banco.jobs.values()].find((j) => j.generationId === where.generationId)
        if (existente) return { id: existente.id }
        const id = `job-${++banco.seq}`
        banco.jobs.set(id, { id, status: 'PENDING', attempts: 0, ...create })
        return { id }
      },
      findUnique: async ({ where }: { where: { id: string } }) => banco.jobs.get(where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
        const j = banco.jobs.get(where.id)
        if (!j || (where.status && j.status !== where.status)) return { count: 0 }
        banco.jobs.set(where.id, { ...j, ...data })
        return { count: 1 }
      },
    },
    itemDePlano: {
      findFirst: async ({ where }: { where: { id: string; projectId: number; planoId?: string } }) => {
        const i = banco.itens.get(where.id)
        if (!i || i.projectId !== where.projectId || (where.planoId && i.planoId !== where.planoId)) return null
        return { id: i.id, planoId: i.planoId, status: i.status }
      },
    },
  },
}))

vi.mock('../pastas', () => ({
  garantirPasta: async () => ({ id: 42, name: 'Semana 07/09' }),
}))

// O transicionarItem de produção valida a tabela; aqui a validação é a mesma
// (`transicaoPermitida`), e o que se grava é o que o serviço gravaria.
const transicoes = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('@/lib/planos/plano-service', async () => {
  const { transicaoPermitida, normalizarStatusDoItem } = await import('@/lib/planos/vocabulario')
  return {
    transicionarItem: async (input: Record<string, unknown>) => {
      const item = banco.itens.get(input.itemId as string)
      if (!item) throw new Error('item não existe')
      const de = normalizarStatusDoItem(item.status) ?? 'proposto'
      const para = normalizarStatusDoItem(input.para)
      if (!para || !transicaoPermitida(de, para)) throw new Error(`TRANSICAO_INVALIDA ${de} → ${input.para}`)
      transicoes.push({ ...input })
      banco.itens.set(item.id as string, {
        ...item,
        status: para,
        ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
        ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
        ...(input.erro !== undefined ? { erro: input.erro } : {}),
      })
      return banco.itens.get(item.id as string)
    },
  }
})

const compositor = vi.hoisted(() => ({
  chamadas: [] as Array<{ spec: unknown; opcoes: Record<string, unknown> }>,
  modo: 'ok' as 'ok' | 'duplica' | 'texto-nao-cabe' | 'infra',
}))
vi.mock('../compor', () => ({
  comporPeca: async (spec: unknown, opcoes: Record<string, unknown>) => {
    compositor.chamadas.push({ spec, opcoes })
    const { CreativeError } = await import('@/lib/creatives/errors')
    if (compositor.modo === 'texto-nao-cabe') throw new CreativeError('TEXTO_NAO_CABE_NA_COLUNA', 'A manchete não cabe na coluna', 422)
    if (compositor.modo === 'infra') throw new Error('fonte não carregou')
    // O contrato do persist: com generationId, FECHA aquela linha; sem, cria.
    let generationId = opcoes.generationId as string | null
    if (compositor.modo === 'duplica' || !generationId) {
      generationId = `gen-${++banco.seq}`
      banco.generations.set(generationId, { id: generationId, status: 'COMPLETED' })
    } else {
      const g = banco.generations.get(generationId)
      banco.generations.set(generationId, { ...g, status: 'COMPLETED', resultUrl: 'https://blob/peca.png' })
    }
    return {
      persistido: { generationId, pageId: 'page-1', url: 'https://blob/peca.png' },
      prova: null,
      layers: [],
      diagnostico: { posicao: { ancora: 'rodape', alinha: 'esquerda', crop: 'center' }, avisos: [] },
    }
  },
}))

import { enfileirarPeca, processarComposicaoEmBackground, reapontarItemDoPlano } from '../fila'
import { fecharJob } from '@/lib/ai/generation-queue'

const spec = {
  projectId: 6,
  formato: 'story',
  blocos: [{ papel: 'headline', linhas: ['Sexta é dia de churrasco'] }],
  itemDePlanoId: 'item-1',
  planoId: 'plano-1',
  quando: '2026-09-11T18:00:00.000Z',
}

/** O que o cron faz com um job COMPOR: roda o runner e fecha o job pela Generation. */
async function rodarComoOCron(jobId: string) {
  const job = banco.jobs.get(jobId)!
  banco.jobs.set(jobId, { ...job, status: 'RUNNING', attempts: Number(job.attempts) + 1 })
  await processarComposicaoEmBackground({ ...(job.payload as Record<string, unknown>), queueJobId: jobId } as never)
  return fecharJob(jobId, job.generationId as string)
}

beforeEach(() => {
  banco.generations.clear()
  banco.jobs.clear()
  banco.itens.clear()
  banco.seq = 0
  transicoes.length = 0
  compositor.chamadas.length = 0
  compositor.modo = 'ok'
  banco.itens.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fila COMPOR', () => {
  it('enfileirar põe o item do plano na fila, apontando para a Generation criada', async () => {
    const r = await enfileirarPeca(spec, { decididoPor: 'u1' })
    expect(banco.generations.get(r.generationId)?.status).toBe('PROCESSING')
    expect(banco.jobs.get(r.jobId)?.kind).toBe('COMPOR')
    expect(banco.itens.get('item-1')).toMatchObject({ status: 'na-fila', generationId: r.generationId })
  })

  it('o job termina DONE, a Generation da fila vira COMPLETED sem nascer outra, e o item sai pronto', async () => {
    const r = await enfileirarPeca(spec, { decididoPor: 'u1', autor: 'u1' })
    const desfecho = await rodarComoOCron(r.jobId)

    // O runner entregou ao compositor a Generation da FILA (o fio que faltava).
    expect(compositor.chamadas).toHaveLength(1)
    expect(compositor.chamadas[0].opcoes).toMatchObject({ generationId: r.generationId, decididoPor: 'u1', autor: 'u1' })

    expect(desfecho).toBe('DONE')
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'DONE' })
    expect(banco.generations.get(r.generationId)?.status).toBe('COMPLETED')
    expect(banco.generations.size).toBe(1)

    expect(banco.itens.get('item-1')).toMatchObject({ status: 'pronto', generationId: r.generationId, pageId: 'page-1' })
    // Caminhou pela tabela (`na-fila` → `gerando` → `pronto`), sem atalho.
    expect(transicoes.map((t) => t.para)).toEqual(['na-fila', 'gerando', 'pronto'])
    // Os vínculos só acompanham o passo final.
    expect(transicoes[1]).not.toHaveProperty('pageId')
    expect(transicoes[2]).toMatchObject({ generationId: r.generationId, pageId: 'page-1', planoId: 'plano-1', projectId: 6 })
  })

  it('REGRESSÃO 04/09: peça gravada em OUTRA Generation deixa a da fila aberta, e o job FAILED diz isso', async () => {
    compositor.modo = 'duplica'
    const r = await enfileirarPeca(spec)
    const desfecho = await rodarComoOCron(r.jobId)
    expect(desfecho).toBe('FAILED')
    expect(banco.generations.get(r.generationId)?.status).toBe('PROCESSING')
    expect(banco.generations.size).toBe(2)
    // Antes o job morria sem `lastError` — o sintoma parecia falha de render.
    expect(String(banco.jobs.get(r.jobId)?.lastError)).toMatch(/sem fechar a Generation .*PROCESSING/)
  })

  it('erro determinístico marca a Generation FAILED com o motivo e o item em erro', async () => {
    compositor.modo = 'texto-nao-cabe'
    const r = await enfileirarPeca(spec)
    const desfecho = await rodarComoOCron(r.jobId)
    expect(desfecho).toBe('FAILED')
    expect(banco.generations.get(r.generationId)).toMatchObject({ status: 'FAILED' })
    expect((banco.generations.get(r.generationId)?.fieldValues as Record<string, unknown>).errorCode).toBe('TEXTO_NAO_CABE_NA_COLUNA')
    expect(banco.jobs.get(r.jobId)?.lastError).toBe('A manchete não cabe na coluna')
    expect(banco.itens.get('item-1')).toMatchObject({ status: 'erro', erro: 'A manchete não cabe na coluna' })
  })

  it('erro de infra volta para a fila e NÃO mexe no item nem na Generation', async () => {
    compositor.modo = 'infra'
    const r = await enfileirarPeca(spec)
    const desfecho = await rodarComoOCron(r.jobId)
    expect(desfecho).toBe('REENFILEIRADO')
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', lastError: 'fonte não carregou' })
    expect(banco.generations.get(r.generationId)?.status).toBe('PROCESSING')
    expect(banco.itens.get('item-1')?.status).toBe('na-fila')
  })

  it('peça sem item de plano não toca em item nenhum', async () => {
    const { itemDePlanoId: _i, planoId: _p, ...avulsa } = spec
    const r = await enfileirarPeca(avulsa)
    await rodarComoOCron(r.jobId)
    expect(transicoes).toHaveLength(0)
    expect(banco.itens.get('item-1')?.status).toBe('proposto')
  })

  it('item que já foi para a agenda não é movido, e isso não derruba a peça', async () => {
    banco.itens.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'agendado' })
    const r = await enfileirarPeca(spec)
    expect(await rodarComoOCron(r.jobId)).toBe('DONE')
    expect(banco.itens.get('item-1')?.status).toBe('agendado')
    expect(transicoes).toHaveLength(0)
  })

  it('reapontar item de outro projeto ou inexistente é no-op', async () => {
    expect(await reapontarItemDoPlano({ ...spec, projectId: 7 } as never, 'pronto', { generationId: 'g', pageId: 'p' })).toBeNull()
    expect(await reapontarItemDoPlano({ ...spec, itemDePlanoId: 'nao-existe' } as never, 'pronto')).toBeNull()
    expect(await reapontarItemDoPlano(null, 'pronto')).toBeNull()
    expect(banco.itens.get('item-1')?.status).toBe('proposto')
  })
})
