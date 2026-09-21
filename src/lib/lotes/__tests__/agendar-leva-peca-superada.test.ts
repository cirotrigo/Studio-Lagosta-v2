/**
 * O laço `superada` → `PECA_AUSENTE` (restack do PR 12 sobre o PR 11, 21/09/2026),
 * pelo caminho real: a compor-leva de produção (`enfileirarPeca`, com a reserva
 * e a tabela do plano) recusa o pedido como SUPERADO, e o `agendarItensDoLote`
 * de produção roda sobre a MESMA linha do lote. Antes, a linha sem peça (ou com
 * a peça que falhou) respondia "componha com compor-leva antes de agendar" — e
 * compor de novo devolvia `superada` de novo. Agora a resposta é a da peça
 * superada (decisão do Ciro, 13/09/2026): diz qual é a arte atual e manda
 * perguntar, sem criar nada.
 *
 * O banco falso é o do `fila-lote.test.ts` (PR 11) no modo de trava global,
 * com o que o agendamento lê a mais: `generation.findFirst` e o post, que aqui
 * nunca pode nascer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generations: new Map<string, Record<string, unknown>>(),
  jobs: new Map<string, Record<string, unknown>>(),
  itensDeLote: new Map<string, Record<string, unknown>>(),
  itensDePlano: new Map<string, Record<string, unknown>>(),
  seq: 0,
  falharJobs: 0,
  postsCriados: 0,
  trava: Promise.resolve() as Promise<void>,
  /** Roda depois de cada leitura de Generation ou de job, com o id da Generation — é o runner terminando entre as duas leituras. */
  aposLer: null as null | ((generationId: string) => void),
}))

vi.mock('@/lib/db', () => {
  type Tabela = 'generations' | 'jobs' | 'itensDeLote' | 'itensDePlano'
  const escolher = (linha: Record<string, unknown>, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, linha[k] ?? null])) : linha
  const chaveDoLote = (d: Record<string, unknown>) => `${d.projectId}|${d.loteId}|${d.itemId}`
  const gravar = (tabela: Tabela, id: string, linha: Record<string, unknown>) => banco[tabela].set(id, linha)

  const delegados = () => {
    const novoJob = (data: Record<string, unknown>) => {
      if (banco.falharJobs > 0) {
        banco.falharJobs--
        throw new Error('queda do banco ao criar o job')
      }
      const id = `job-${++banco.seq}`
      gravar('jobs', id, { id, status: 'PENDING', attempts: 0, ...data })
      return { id }
    }
    return {
      project: { findUnique: async ({ where }: { where: { id: number } }) => ({ id: where.id, name: 'Espeto Gaúcho', userId: 'dono-interno' }) },
      generation: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const id = `gen-${++banco.seq}`
          gravar('generations', id, { id, ...data })
          return { id }
        },
        findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const g = banco.generations.get(where.id)
          return g ? escolher(g, select) : null
        },
        findFirst: async ({ where, select }: { where: { id: string; projectId?: number }; select?: Record<string, boolean> }) => {
          const g = banco.generations.get(where.id)
          const lida = g && (where.projectId === undefined || g.projectId === where.projectId) ? escolher(g, select) : null
          banco.aposLer?.(where.id)
          return lida
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          gravar('generations', where.id, { ...banco.generations.get(where.id), ...data })
          return { id: where.id }
        },
      },
      generationJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => novoJob(data),
        upsert: async ({ where, create }: { where: { generationId: string }; create: Record<string, unknown> }) => {
          const existente = [...banco.jobs.values()].find((j) => j.generationId === where.generationId)
          return existente ? { id: existente.id } : novoJob(create)
        },
        findUnique: async ({ where, select }: { where: { id?: string; generationId?: string }; select?: Record<string, boolean> }) => {
          const j = where.id ? banco.jobs.get(where.id) : [...banco.jobs.values()].find((x) => x.generationId === where.generationId)
          const lido = j ? escolher(j, select) : null
          banco.aposLer?.(where.generationId ?? String(j?.generationId ?? ''))
          return lido
        },
        updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
          const j = banco.jobs.get(where.id)
          if (!j || (where.status && j.status !== where.status)) return { count: 0 }
          gravar('jobs', where.id, { ...j, ...data })
          return { count: 1 }
        },
      },
      itemDeLote: {
        create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
          if ([...banco.itensDeLote.values()].some((l) => chaveDoLote(l) === chaveDoLote(data))) {
            throw Object.assign(new Error('Unique constraint failed on the fields: (`projectId`,`loteId`,`itemId`)'), { code: 'P2002' })
          }
          const id = `lote-${++banco.seq}`
          const linha = { id, generationId: null, jobId: null, postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null, tentativas: 0, situacao: 'reservado', ...data }
          gravar('itensDeLote', id, linha)
          return escolher(linha, select)
        },
        findUnique: async ({ where, select }: { where: { id?: string; projectId_loteId_itemId?: Record<string, unknown> }; select?: Record<string, boolean> }) => {
          const l = where.id
            ? banco.itensDeLote.get(where.id)
            : [...banco.itensDeLote.values()].find((x) => chaveDoLote(x) === chaveDoLote(where.projectId_loteId_itemId!))
          return l ? escolher(l, select) : null
        },
        updateMany: async ({ where, data }: { where: { id: string; generationId?: string | null }; data: Record<string, unknown> }) => {
          const l = banco.itensDeLote.get(where.id)
          if (!l || ('generationId' in where && (l.generationId ?? null) !== where.generationId)) return { count: 0 }
          const { tentativas, ...resto } = data as { tentativas?: { increment: number } }
          gravar('itensDeLote', where.id, { ...l, ...resto, ...(tentativas ? { tentativas: Number(l.tentativas) + tentativas.increment } : {}) })
          return { count: 1 }
        },
      },
      itemDePlano: {
        findFirst: async ({ where }: { where: { id: string; projectId: number; planoId?: string } }) => {
          const i = banco.itensDePlano.get(where.id)
          return i && i.projectId === where.projectId && (!where.planoId || i.planoId === where.planoId) ? i : null
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const linha = { ...banco.itensDePlano.get(where.id), ...data }
          gravar('itensDePlano', where.id, linha)
          return linha
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const i = banco.itensDePlano.get(String(where.id))
          const soVersao = Object.keys(where).every((k) => k === 'id' || k === 'updatedAt') && where.updatedAt instanceof Date
          if (!i || !soVersao || (i.updatedAt as Date | undefined)?.getTime() !== (where.updatedAt as Date).getTime()) return { count: 0 }
          gravar('itensDePlano', String(where.id), { ...i, ...data })
          return { count: 1 }
        },
      },
      // O agendamento desta suíte nunca chega à página nem ao post: tocar num post é o defeito.
      page: { findUnique: async () => null },
      socialPost: {
        findMany: async () => [],
        findUnique: async () => null,
        create: async () => {
          banco.postsCriados++
          throw new Error('nenhum post pode nascer nesta suíte')
        },
      },
    }
  }

  // Trava global e rollback inteiro: a transação que lança volta atrás.
  const $transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    const anterior = banco.trava
    let liberar!: () => void
    banco.trava = new Promise<void>((r) => {
      liberar = r
    })
    await anterior
    const foto = structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })
    try {
      return await run({ ...delegados(), $queryRaw: async () => [] })
    } catch (erro) {
      Object.assign(banco, foto)
      throw erro
    } finally {
      liberar()
    }
  }
  return { db: { ...delegados(), $transaction } }
})

vi.mock('@/lib/compositor/pastas', () => ({
  garantirPasta: async () => ({ id: 42, name: 'Stories · Semana 7 a 13/09' }),
  formatoDaPagina: () => 'story',
  refilarPaginasDoPost: async () => ({ movidas: 0, falhou: false }),
}))
vi.mock('@prisma/client', () => ({ Prisma: { DbNull: 'DbNull', JsonNull: 'JsonNull' } }))
// O agendamento de verdade não pode chegar a criar post aqui: qualquer um destes é o defeito.
const naoAgenda = vi.hoisted(() => () => {
  throw new Error('o agendamento não deveria chegar a criar o post')
})
vi.mock('@/lib/creatives/agendar', () => ({
  parseBRT: (valor: string) => new Date(valor),
  resolverAgendamento: naoAgenda,
  criarPostDoAgendamento: naoAgenda,
  efeitosDoAgendamento: naoAgenda,
  contextoDosEfeitos: naoAgenda,
}))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: naoAgenda }))

import { enfileirarPeca } from '@/lib/compositor/fila'
import { agendarItensDoLote } from '../agendar-itens'
import { MOTIVO_ARTE_MAIS_NOVA } from '../agendamento'
import { revisaoDoItem } from '@/lib/planos/revisao-do-item'

const L = 'semana-2026-09-07'
const specV1 = {
  projectId: 6,
  formato: 'story',
  nome: 'Segunda',
  quando: '2026-09-14T18:00:00.000Z',
  blocos: [{ papel: 'headline', linhas: ['Manchete 1'] }, { papel: 'cta', linhas: ['Vem pra cá'] }],
  itemDePlanoId: 'item-1',
  planoId: 'plano-1',
}
const specV2 = { ...specV1, blocos: [{ papel: 'headline', linhas: ['Costela no bafo'] }, { papel: 'cta', linhas: ['Vem pra cá'] }] }
const specOutraCopy = { ...specV1, blocos: [{ papel: 'headline', linhas: ['Picanha na brasa'] }, { papel: 'cta', linhas: ['Vem pra cá'] }] }

const criarItem = () =>
  banco.itensDePlano.set('item-1', {
    id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', ordem: 0, updatedAt: new Date('2026-09-08'),
    copyProposta: ['Manchete 1', 'Vem pra cá'],
    plano: { id: 'plano-1', status: 'ativo', inicio: new Date('2026-09-07'), fim: new Date('2026-09-13') },
  })
const leitura = () => revisaoDoItem(banco.itensDePlano.get('item-1')! as never)
const chave = (itemRevisao: string, itemId = 'seg') => ({ decididoPor: 'u1', lote: { loteId: L, itemId }, itemRevisao })
const marcar = (tabela: 'generations' | 'jobs' | 'itensDePlano', id: string, extra: Record<string, unknown>) => banco[tabela].set(id, { ...banco[tabela].get(id), ...extra })
const linha = (itemId: string) => [...banco.itensDeLote.values()].find((l) => l.loteId === L && l.itemId === itemId)
const pronta = (g: { generationId: string; jobId: string }, pageId: string, url: string) => {
  marcar('generations', g.generationId, { status: 'COMPLETED', resultUrl: url, createdAt: new Date('2026-09-12T13:00:00.000Z') })
  marcar('jobs', g.jobId, { status: 'DONE' })
  marcar('itensDePlano', 'item-1', { status: 'pronto', pageId })
}
/** A fila: Generation e job FAILED, item em `erro` apontando a mesma peça. */
const falhar = (g: { generationId: string; jobId: string }) => {
  marcar('generations', g.generationId, { status: 'FAILED' })
  marcar('jobs', g.jobId, { status: 'FAILED' })
  marcar('itensDePlano', 'item-1', { status: 'erro' })
}
const editar = async (patch: Record<string, unknown>) => {
  const { atualizarItem } = await import('@/lib/planos/plano-service')
  await atualizarItem({ projectId: 6, planoId: 'plano-1', itemId: 'item-1', patch })
}
const agendar = (itemId: string, simular = false) => agendarItensDoLote({ projectId: 6, loteId: L, itens: [{ itemId }], simular, superficie: 'chat' })
const superada = { code: 'ITEM_EXECUCAO_CONCORRENTE', status: 409, details: { motivo: 'superada' } }

beforeEach(() => {
  banco.generations.clear()
  banco.jobs.clear()
  banco.itensDeLote.clear()
  banco.itensDePlano.clear()
  banco.seq = 0
  banco.falharJobs = 0
  banco.postsCriados = 0
  banco.trava = Promise.resolve()
  banco.aposLer = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('agendar-leva sobre a linha que a compor-leva recusou como SUPERADA', () => {
  it('linha SEM peça (a compor-leva recusou um pedido novo para um item já pronto): responde a peça superada com a arte atual — não manda compor de novo, não cria post', async () => {
    criarItem()
    const t1 = leitura()
    const g0 = await enfileirarPeca(specV1, chave(t1))
    pronta(g0, 'page-v1', 'https://blob/v1.png')

    // A leva pede OUTRO texto para o mesmo item, com outro itemId e a revisão de agora: a tabela recusa (linha 4a).
    await expect(enfileirarPeca(specOutraCopy, chave(t1, 'seg-b'))).rejects.toMatchObject(superada)
    expect(linha('seg-b')).toMatchObject({ generationId: null, situacao: 'reservado' })

    for (const simular of [true, false]) {
      const r = await agendar('seg-b', simular)
      expect(r.resumo).toEqual({ concluidos: 0, pendentes: 0, falhas: 1 })
      expect(r.itens[0]).toMatchObject({
        itemId: 'seg-b',
        situacao: 'falhou',
        codigo: 'PECA_SUPERADA_NO_PLANO',
        motivo: MOTIVO_ARTE_MAIS_NOVA,
        arteAtualDoItem: { generationId: g0.generationId, pageId: 'page-v1', situacao: 'pronta', feitaEm: '2026-09-12T13:00:00.000Z', feitaEmBrasilia: '12/09/2026, 10:00' },
      })
      expect(r.itens[0].motivo).not.toContain('antes de agendar')
    }
    // O controle da mesma linha pelo outro lado: a compor-leva repetida continua recusando — é por isso que "componha de novo" era beco.
    await expect(enfileirarPeca(specOutraCopy, chave(t1, 'seg-b'))).rejects.toMatchObject(superada)
    expect(banco.postsCriados).toBe(0)
  })

  it('linha com a peça que FALHOU (o item foi refeito com a copy editada e ficou pronto): a leva antiga é superada pela compor-leva, e o agendamento dela diz qual é a arte atual', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(t1))
    falhar(g1)
    await editar({ copyProposta: ['Costela no bafo', 'Vem pra cá'] })
    const t2 = leitura()
    const g2 = await enfileirarPeca(specV2, chave(t2, 'seg-v2'))
    pronta(g2, 'page-v2', 'https://blob/v2.png')

    await expect(enfileirarPeca(specV1, chave(t1))).rejects.toMatchObject(superada)
    const r = await agendar('seg')
    expect(r.itens[0]).toMatchObject({
      situacao: 'falhou',
      codigo: 'PECA_SUPERADA_NO_PLANO',
      motivo: MOTIVO_ARTE_MAIS_NOVA,
      generationId: g1.generationId,
      arteAtualDoItem: { generationId: g2.generationId, pageId: 'page-v2', situacao: 'pronta' },
    })
    expect(banco.postsCriados).toBe(0)
  })

  it('a arte do item ainda em produção conta pelo JOB: viva (job na fila) é superada; com o job terminado sem fechar a Generation, a compor-leva não diria superada e vale PECA_FALHOU', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(t1))
    falhar(g1)
    await editar({ copyProposta: ['Costela no bafo', 'Vem pra cá'] })
    const g2 = await enfileirarPeca(specV2, chave(leitura(), 'seg-v2'))
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: g2.generationId })

    const viva = await agendar('seg')
    expect(viva.itens[0]).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO', arteAtualDoItem: { generationId: g2.generationId, situacao: 'em produção' } })

    marcar('jobs', g2.jobId, { status: 'DONE' })
    const semJobVivo = await agendar('seg')
    expect(semJobVivo.itens[0]).toMatchObject({ codigo: 'PECA_FALHOU' })
    expect(semJobVivo.itens[0].arteAtualDoItem).toBeUndefined()
    expect(banco.postsCriados).toBe(0)
  })

  it('o JOB é lido antes da Generation: a peça do item que fica pronta ENTRE as duas leituras é a arte pronta que supera esta — nunca um job terminado com a Generation aberta', async () => {
    criarItem()
    const g1 = await enfileirarPeca(specV1, chave(leitura()))
    falhar(g1)
    await editar({ copyProposta: ['Costela no bafo', 'Vem pra cá'] })
    const g2 = await enfileirarPeca(specV2, chave(leitura(), 'seg-v2'))

    // O runner fecha a Generation e só depois o job — os dois de uma vez, logo depois da PRIMEIRA leitura da peça do item.
    let terminou = false
    banco.aposLer = (generationId) => {
      if (terminou || generationId !== g2.generationId) return
      terminou = true
      marcar('generations', g2.generationId, { status: 'COMPLETED', resultUrl: 'https://blob/v2.png' })
      marcar('jobs', g2.jobId, { status: 'DONE' })
    }
    const r = await agendar('seg')
    expect(terminou).toBe(true)
    expect(r.itens[0]).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO', arteAtualDoItem: { generationId: g2.generationId, situacao: 'pronta' } })
  })
})

describe('os controles: a peça ausente ou falha de verdade continua com a resposta dela', () => {
  it('peça ausente de verdade (a reserva ficou órfã, sem item de plano): PECA_AUSENTE manda compor, e compor de novo resolve', async () => {
    banco.falharJobs = 1
    await expect(enfileirarPeca({ ...specV1, itemDePlanoId: undefined, planoId: undefined }, { decididoPor: 'u1', lote: { loteId: L, itemId: 'solta' } })).rejects.toThrow('queda do banco')
    expect(linha('solta')).toMatchObject({ generationId: null })

    const r = await agendar('solta')
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PECA_AUSENTE' })
    expect(r.itens[0].motivo).toContain('componha com compor-leva antes de agendar')
    expect(r.itens[0].arteAtualDoItem).toBeUndefined()
    // É instrução que leva a algum lugar: a mesma chamada da compor-leva retoma a peça.
    const retomada = await enfileirarPeca({ ...specV1, itemDePlanoId: undefined, planoId: undefined }, { decididoPor: 'u1', lote: { loteId: L, itemId: 'solta' } })
    expect(retomada.lote).toMatchObject({ desfecho: 'retomado' })
  })

  it('item de plano EXECUTÁVEL com arte antiga e a reserva órfã: não é superada (a compor-leva produz) — PECA_AUSENTE', async () => {
    criarItem()
    const t1 = leitura()
    const g0 = await enfileirarPeca(specV1, chave(t1))
    pronta(g0, 'page-v1', 'https://blob/v1.png')
    marcar('itensDePlano', 'item-1', { status: 'editado' }) // reaberto, ainda apontando a arte antiga

    banco.falharJobs = 1
    await expect(enfileirarPeca(specOutraCopy, chave(leitura(), 'seg-b'))).rejects.toThrow('queda do banco')
    expect(linha('seg-b')).toMatchObject({ generationId: null })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'editado', generationId: g0.generationId })

    const r = await agendar('seg-b')
    expect(r.itens[0]).toMatchObject({ codigo: 'PECA_AUSENTE' })
    const refeita = await enfileirarPeca(specOutraCopy, chave(leitura(), 'seg-b'))
    expect(refeita.generationId).not.toBe(g0.generationId)
  })

  it('peça que falhou num item que continua executável (erro): PECA_FALHOU — a compor-leva repetida refaz', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(t1))
    falhar(g1)

    const r = await agendar('seg')
    expect(r.itens[0]).toMatchObject({ codigo: 'PECA_FALHOU', generationId: g1.generationId })
    const refeita = await enfileirarPeca(specV1, chave(t1))
    expect(refeita.lote).toMatchObject({ desfecho: 'retomado' })
  })
})
