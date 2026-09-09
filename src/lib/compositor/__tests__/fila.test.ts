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
  interromperJob: false,
  antesDoCallback: null as (() => void) | null,
}))

vi.mock('@/lib/db', () => {
  const mockDb = {
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
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (banco.interromperJob) throw new Error('interrupção antes do job')
        const id = `job-${++banco.seq}`
        banco.jobs.set(id, { id, status: 'PENDING', attempts: 0, ...data })
        return { id }
      },
      upsert: async ({ where, create }: { where: { generationId: string }; create: Record<string, unknown> }) => {
        const existente = [...banco.jobs.values()].find((j) => j.generationId === where.generationId)
        if (existente) return { id: existente.id }
        const id = `job-${++banco.seq}`
        banco.jobs.set(id, { id, status: 'PENDING', attempts: 0, ...create })
        return { id }
      },
      findUnique: async ({ where }: { where: { id?: string; generationId?: string } }) => where.id ? banco.jobs.get(where.id) ?? null : [...banco.jobs.values()].find((j) => j.generationId === where.generationId) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
        const j = banco.jobs.get(where.id)
        if (!j || (where.status && j.status !== where.status)) return { count: 0 }
        banco.jobs.set(where.id, { ...j, ...data })
        return { count: 1 }
      },
    },
    itemDePlano: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        banco.antesDoCallback?.()
        const item = banco.itens.get(where.id as string)
        if (!item || Object.entries(where).some(([key, value]) => item[key] !== value)) return { count: 0 }
        banco.itens.set(where.id as string, { ...item, ...data })
        return { count: 1 }
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        banco.itens.set(where.id, { ...banco.itens.get(where.id), ...data })
      },
      findFirst: async ({ where }: { where: { id: string; projectId: number; planoId?: string } }) => {
        const i = banco.itens.get(where.id)
        if (!i || i.projectId !== where.projectId || (where.planoId && i.planoId !== where.planoId)) return null
        return i
      },
    },
  }
  return { db: { ...mockDb, $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
    const snapshot = structuredClone({ generations: banco.generations, jobs: banco.jobs, itens: banco.itens })
    try { return await run({ ...mockDb, $queryRaw: async () => [] }) } catch (error) {
      banco.generations = snapshot.generations; banco.jobs = snapshot.jobs; banco.itens = snapshot.itens
      throw error
    }
  } } }
})

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
  modo: 'ok' as 'ok' | 'duplica' | 'texto-nao-cabe' | 'infra' | 'sem-combinacao' | 'selecao-indisponivel',
}))
vi.mock('../compor', () => ({
  comporPeca: async (spec: unknown, opcoes: Record<string, unknown>) => {
    compositor.chamadas.push({ spec, opcoes })
    const { CreativeError } = await import('@/lib/creatives/errors')
    if (compositor.modo === 'texto-nao-cabe') throw new CreativeError('TEXTO_NAO_CABE_NA_COLUNA', 'A manchete não cabe na coluna', 422)
    if (compositor.modo === 'sem-combinacao') throw new CreativeError('SEM_COMBINACAO', 'Escolha outra foto', 422)
    if (compositor.modo === 'selecao-indisponivel') throw new CreativeError('SELECAO_INDISPONIVEL', 'Foto indisponível', 422)
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
  banco.interromperJob = false
  banco.antesDoCallback = null
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
    // Caminho validado; desfecho publicado atomicamente, sem estado intermediário.
    expect(transicoes).toHaveLength(0)
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
    await expect(enfileirarPeca(spec)).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
    expect(banco.generations.size).toBe(0)
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

 describe('retomada por item', () => {
  it('resposta perdida após commit reutiliza o job, inclusive depois de pronto', async () => {
    const primeira = await enfileirarPeca(spec)
    expect(await enfileirarPeca(spec)).toEqual(primeira)
    await rodarComoOCron(primeira.jobId)
    expect(await enfileirarPeca(spec)).toEqual(primeira)
    expect(banco.generations.size).toBe(1)
    expect(banco.itens.get('item-1')?.status).toBe('pronto')
  })
  it('falha parcial não refaz o item pronto e permite continuar o segundo aprovado', async () => {
    const primeira = await enfileirarPeca(spec)
    await rodarComoOCron(primeira.jobId)
    banco.itens.set('item-2', { id: 'item-2', planoId: 'plano-1', projectId: 6, status: 'aprovado' })
    const segundaSpec = { ...spec, itemDePlanoId: 'item-2' }
    const segunda = await enfileirarPeca(segundaSpec)
    compositor.modo = 'texto-nao-cabe'
    await rodarComoOCron(segunda.jobId)
    compositor.modo = 'ok'
    const retomada = await enfileirarPeca(segundaSpec)
    expect(retomada.generationId).not.toBe(segunda.generationId)
    await rodarComoOCron(retomada.jobId)
    expect(await enfileirarPeca(spec)).toEqual(primeira)
    expect(banco.itens.get('item-2')?.status).toBe('pronto')
  })
  it('revisão alterada durante preparação recusa antes de criar geração', async () => {
    banco.itens.set('item-1', { ...banco.itens.get('item-1'), updatedAt: new Date('2026-09-09'), status: 'editado' })
    await expect(enfileirarPeca(spec, { itemAtualizadoEm: new Date('2026-09-08') })).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
    expect(banco.generations.size).toBe(0)
  })
})

it('interrupção antes do commit não deixa geração órfã e permite retomar', async () => {
  banco.interromperJob = true
  await expect(enfileirarPeca(spec)).rejects.toThrow('interrupção')
  expect(banco.generations.size).toBe(0)
  expect(banco.jobs.size).toBe(0)
  expect(banco.itens.get('item-1')?.status).toBe('proposto')
  banco.interromperJob = false
  await enfileirarPeca(spec)
  expect(banco.generations.size).toBe(1)
})
it('mudança de campanha exige outra revisão mesmo com a mesma spec', async () => {
  const primeira = await enfileirarPeca(spec)
  await rodarComoOCron(primeira.jobId)
  banco.itens.set('item-1', { ...banco.itens.get('item-1'), status: 'editado', campaignId: 'nova' })
  const nova = await enfileirarPeca(spec)
  expect(nova.generationId).not.toBe(primeira.generationId)
})

it('conclusão atrasada não sobrescreve escolha humana ou vínculo de outra revisão', async () => {
  const antiga = await enfileirarPeca(spec)
  banco.itens.set('item-1', { ...banco.itens.get('item-1'), status: 'editado', generationId: 'nova-revisao' })
  await rodarComoOCron(antiga.jobId)
  expect(banco.itens.get('item-1')).toMatchObject({ status: 'editado', generationId: 'nova-revisao' })
})


it('callback perde a disputa se houver edição entre leitura e escrita', async () => {
  const r = await enfileirarPeca(spec)
  banco.antesDoCallback = () => banco.itens.set('item-1', { ...banco.itens.get('item-1'), status: 'editado', generationId: 'outra' })
  await rodarComoOCron(r.jobId)
  expect(banco.itens.get('item-1')).toMatchObject({ status: 'editado', generationId: 'outra' })
})

it('callback também protege edição de conteúdo que mantém estado e geração', async () => {
  const r = await enfileirarPeca(spec)
  banco.antesDoCallback = () => banco.itens.set('item-1', { ...banco.itens.get('item-1'), updatedAt: new Date('2026-09-10'), tema: 'novo' })
  await rodarComoOCron(r.jobId)
  expect(banco.itens.get('item-1')).toMatchObject({ status: 'na-fila', tema: 'novo' })
})

it('candidatas e preferências atravessam a fila e a retomada usa a spec do job', async () => {
  const entrada = { ...spec, selecaoExperimental: true, fotosCandidatas: ['a', 'b'], preferencias: { variante: 'assinatura-aprovada', tratamentoDeTexto: 'gradiente-suave-topo' } }
  const r = await enfileirarPeca(entrada)
  await rodarComoOCron(r.jobId)
  expect(compositor.chamadas[0].spec).toMatchObject({ selecaoExperimental: true, fotosCandidatas: ['a', 'b'], preferencias: entrada.preferencias })
  const g = banco.generations.get(r.generationId)!
  banco.generations.set(r.generationId, { ...g, fieldValues: { spec: { ...entrada, fotosCandidatas: undefined, foto: { driveFileId: 'b' } } } })
  expect(await enfileirarPeca(entrada)).toEqual(r)
  expect(banco.generations.size).toBe(1)
})

it('mudança das candidatas constitui nova revisão', async () => {
  const r = await enfileirarPeca({ ...spec, fotosCandidatas: ['a'] })
  await rodarComoOCron(r.jobId)
  banco.itens.set('item-1', { ...banco.itens.get('item-1'), status: 'editado', fotoCandidatas: [{ driveFileId: 'b' }] })
  expect((await enfileirarPeca({ ...spec, fotosCandidatas: ['b'] })).generationId).not.toBe(r.generationId)
})

it('não repete rejeição determinística de seleção, mas retoma indisponibilidade', async () => {
  compositor.modo = 'sem-combinacao'
  const r = await enfileirarPeca(spec)
  expect(await rodarComoOCron(r.jobId)).toBe('FAILED')
  compositor.modo = 'selecao-indisponivel'
  const nova = await enfileirarPeca(spec)
  expect(await rodarComoOCron(nova.jobId)).toBe('REENFILEIRADO')
})

it('opt-in constitui outra revisão; false reutiliza o default', async () => {
  const r = await enfileirarPeca({ ...spec, selecaoExperimental: false })
  expect(await enfileirarPeca(spec)).toEqual(r)
  await rodarComoOCron(r.jobId)
  banco.itens.set('item-1', { ...banco.itens.get('item-1'), status: 'editado' })
  expect((await enfileirarPeca({ ...spec, selecaoExperimental: true })).generationId).not.toBe(r.generationId)
})
