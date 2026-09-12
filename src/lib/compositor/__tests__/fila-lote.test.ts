/**
 * O lote durável (PR 11): `enfileirarPeca` com identidade `{ loteId, itemId }`,
 * com o banco falso e a reserva, a fila e o caminho do plano de produção.
 *
 * O banco falso modela as duas garantias do Postgres de que a reserva depende:
 * a chave única composta (o segundo `create` com a mesma chave toma P2002) e a
 * trava da linha (as transações se serializam — a trava real é por linha; esta
 * é global, mais grossa, e por isso não esconde corrida nenhuma). Transação que
 * lança volta atrás inteira.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generations: new Map<string, Record<string, unknown>>(),
  jobs: new Map<string, Record<string, unknown>>(),
  itensDeLote: new Map<string, Record<string, unknown>>(),
  itensDePlano: new Map<string, Record<string, unknown>>(),
  seq: 0,
  violacoesDeUnicidade: 0,
  pastas: 0,
  /** Quantas criações de job ainda devem lançar (a falha no meio da leva). */
  falharJobs: 0,
  trava: Promise.resolve() as Promise<void>,
  emTransacao: 0,
  foraDaTransacao: [] as Array<() => void>,
}))

vi.mock('@/lib/db', () => {
  type Tabela = 'generations' | 'jobs' | 'itensDeLote' | 'itensDePlano'
  const escolher = (linha: Record<string, unknown>, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, linha[k] ?? null])) : linha
  const chaveDoLote = (d: Record<string, unknown>) => `${d.projectId}|${d.loteId}|${d.itemId}`

  /**
   * Toda escrita passa por aqui. A que NÃO veio pela transação e acontece com
   * uma transação aberta sobrevive ao rollback dela — é o que separa "gravado
   * no mesmo commit" de "gravado por fora", e sem isso uma escrita fora da
   * transação passaria nos testes como se fosse atômica.
   */
  const gravar = (tabela: Tabela, id: string, linha: Record<string, unknown>, naTransacao: boolean) => {
    banco[tabela].set(id, linha)
    if (!naTransacao && banco.emTransacao > 0) {
      const copia = structuredClone(linha)
      banco.foraDaTransacao.push(() => banco[tabela].set(id, structuredClone(copia)))
    }
  }

  const delegados = (naTransacao: boolean) => {
    const novoJob = (data: Record<string, unknown>) => {
      if (banco.falharJobs > 0) {
        banco.falharJobs--
        throw new Error('queda do banco ao criar o job')
      }
      const id = `job-${++banco.seq}`
      gravar('jobs', id, { id, status: 'PENDING', attempts: 0, ...data }, naTransacao)
      return { id }
    }
    return {
      project: { findUnique: async ({ where }: { where: { id: number } }) => ({ id: where.id, name: 'Espeto Gaúcho', userId: 'dono-interno' }) },
      generation: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const id = `gen-${++banco.seq}`
          gravar('generations', id, { id, ...data }, naTransacao)
          return { id }
        },
        findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const g = banco.generations.get(where.id)
          return g ? escolher(g, select) : null
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          gravar('generations', where.id, { ...banco.generations.get(where.id), ...data }, naTransacao)
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
          return j ? escolher(j, select) : null
        },
        updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
          const j = banco.jobs.get(where.id)
          if (!j || (where.status && j.status !== where.status)) return { count: 0 }
          gravar('jobs', where.id, { ...j, ...data }, naTransacao)
          return { count: 1 }
        },
      },
      itemDeLote: {
        create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
          if ([...banco.itensDeLote.values()].some((l) => chaveDoLote(l) === chaveDoLote(data))) {
            banco.violacoesDeUnicidade++
            throw Object.assign(new Error('Unique constraint failed on the fields: (`projectId`,`loteId`,`itemId`)'), { code: 'P2002' })
          }
          const id = `lote-${++banco.seq}`
          const linha = { id, generationId: null, jobId: null, tentativas: 0, situacao: 'reservado', ...data }
          gravar('itensDeLote', id, linha, naTransacao)
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
          gravar('itensDeLote', where.id, { ...l, ...resto, ...(tentativas ? { tentativas: Number(l.tentativas) + tentativas.increment } : {}) }, naTransacao)
          return { count: 1 }
        },
      },
      itemDePlano: {
        findFirst: async ({ where }: { where: { id: string; projectId: number; planoId?: string } }) => {
          const i = banco.itensDePlano.get(where.id)
          return i && i.projectId === where.projectId && (!where.planoId || i.planoId === where.planoId) ? i : null
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          gravar('itensDePlano', where.id, { ...banco.itensDePlano.get(where.id), ...data }, naTransacao)
        },
        updateMany: async () => ({ count: 0 }),
      },
    }
  }

  const $transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    const anterior = banco.trava
    let liberar!: () => void
    banco.trava = new Promise<void>((r) => {
      liberar = r
    })
    await anterior
    const foto = structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })
    banco.emTransacao++
    banco.foraDaTransacao = []
    try {
      return await run({ ...delegados(true), $queryRaw: async () => [] })
    } catch (erro) {
      Object.assign(banco, foto)
      for (const reaplicar of banco.foraDaTransacao) reaplicar()
      throw erro
    } finally {
      banco.emTransacao--
      banco.foraDaTransacao = []
      liberar()
    }
  }
  return { db: { ...delegados(false), $transaction } }
})

vi.mock('../pastas', () => ({
  garantirPasta: async () => {
    banco.pastas++
    return { id: 42, name: 'Stories · Semana 7 a 13/09' }
  },
}))

const compositor = vi.hoisted(() => ({ chamadas: 0 }))
vi.mock('../compor', () => ({
  comporPeca: async (_spec: unknown, opcoes: { generationId: string }) => {
    compositor.chamadas++
    banco.generations.set(opcoes.generationId, { ...banco.generations.get(opcoes.generationId), status: 'COMPLETED', resultUrl: 'https://blob/peca.png' })
    return {
      persistido: { generationId: opcoes.generationId, pageId: 'page-1', url: 'https://blob/peca.png' },
      prova: null,
      layers: [],
      diagnostico: { posicao: { ancora: 'rodape', alinha: 'esquerda', crop: 'center' }, avisos: [] },
    }
  },
}))

import { enfileirarPeca, processarComposicaoEmBackground } from '../fila'
import { validarSpec } from '../spec'
import { fecharJob } from '@/lib/ai/generation-queue'
import { hashDoPayload, payloadParaHash } from '@/lib/lotes/identidade'

const peca = (n: number) => ({
  projectId: 6,
  formato: 'story',
  nome: `Peça ${n}`,
  quando: `2026-09-1${n}T18:00:00.000Z`,
  blocos: [{ papel: 'headline', linhas: [`Manchete ${n}`] }, { papel: 'cta', linhas: ['Vem pra cá'] }],
})
const lote = (itemId: string) => ({ lote: { loteId: 'semana-2026-09-07', itemId } })

/** O laço de `compor-leva`: em série, e a falha de um item não derruba os outros. */
async function rodarLeva(itens: Array<{ spec: unknown; itemId: string; antes?: () => void }>) {
  const saida: Array<{ itemId: string; r?: Awaited<ReturnType<typeof enfileirarPeca>>; erro?: unknown }> = []
  for (const { spec, itemId, antes } of itens) {
    antes?.()
    try {
      saida.push({ itemId, r: await enfileirarPeca(spec, { decididoPor: 'u1', ...lote(itemId) }) })
    } catch (erro) {
      saida.push({ itemId, erro })
    }
  }
  return saida
}

async function rodarComoOCron(jobId: string) {
  const job = banco.jobs.get(jobId)!
  banco.jobs.set(jobId, { ...job, status: 'RUNNING', attempts: Number(job.attempts) + 1 })
  await processarComposicaoEmBackground({ ...(job.payload as Record<string, unknown>), queueJobId: jobId } as never)
  return fecharJob(jobId, job.generationId as string)
}

beforeEach(() => {
  banco.generations.clear()
  banco.jobs.clear()
  banco.itensDeLote.clear()
  banco.itensDePlano.clear()
  banco.seq = 0
  banco.violacoesDeUnicidade = 0
  banco.pastas = 0
  banco.falharJobs = 0
  banco.trava = Promise.resolve()
  banco.emTransacao = 0
  banco.foraDaTransacao = []
  compositor.chamadas = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('lote durável — repetição', () => {
  it('(a) a mesma chave com o mesmo payload não cria segunda Generation nem segundo job, e não escreve nada', async () => {
    const primeira = await enfileirarPeca(peca(1), { decididoPor: 'u1', ...lote('seg-19h') })
    expect(primeira.lote).toEqual({ loteId: 'semana-2026-09-07', itemId: 'seg-19h', desfecho: 'criado', situacao: 'pendente' })

    // Chaves em outra ordem, outro decisor, outro canal: o mesmo pedido.
    const { blocos, ...resto } = peca(1)
    const repetida = await enfileirarPeca({ blocos: blocos.map((b) => ({ linhas: b.linhas, papel: b.papel })), ...resto }, { decididoPor: 'u2', canal: 'claude-ai', ...lote('seg-19h') })

    expect(repetida.generationId).toBe(primeira.generationId)
    expect(repetida.jobId).toBe(primeira.jobId)
    expect(repetida.lote).toMatchObject({ desfecho: 'reaproveitado', situacao: 'pendente' })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(banco.itensDeLote.size).toBe(1)
    // A repetição passou pela unicidade e não chegou a criar: nem a pasta.
    expect(banco.violacoesDeUnicidade).toBe(1)
    expect(banco.pastas).toBe(1)
    expect([...banco.itensDeLote.values()][0]).toMatchObject({ situacao: 'enfileirado', generationId: primeira.generationId, jobId: primeira.jobId, tentativas: 1 })
  })

  it('(a) depois de a peça ficar pronta, a repetição devolve a MESMA peça, pronta, sem compor de novo', async () => {
    const primeira = await enfileirarPeca(peca(1), lote('seg-19h'))
    expect(await rodarComoOCron(primeira.jobId)).toBe('DONE')
    const repetida = await enfileirarPeca(peca(1), lote('seg-19h'))
    expect(repetida).toMatchObject({ generationId: primeira.generationId, jobId: primeira.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pronta' } })
    expect(compositor.chamadas).toBe(1)
    expect(banco.jobs.size).toBe(1)
  })

  it('(b) payload diferente sob a mesma chave é CONFLITO 409, com o que difere, sem escrever nada', async () => {
    const primeira = await enfileirarPeca(peca(1), lote('seg-19h'))
    const linhaAntes = structuredClone([...banco.itensDeLote.values()][0])
    const outra = { ...peca(1), nome: 'Outro nome', blocos: [{ papel: 'headline', linhas: ['Outra manchete'] }, { papel: 'cta', linhas: ['Vem pra cá'] }] }

    await expect(enfileirarPeca(outra, lote('seg-19h'))).rejects.toMatchObject({
      code: 'LOTE_ITEM_CONFLITO',
      status: 409,
      details: { loteId: 'semana-2026-09-07', itemId: 'seg-19h', diferencas: ['blocos[headline].linhas', 'nome'], generationId: primeira.generationId },
    })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect([...banco.itensDeLote.values()][0]).toEqual(linhaAntes)
    expect(banco.pastas).toBe(1)
  })

  it('(b) o conflito vale também para a reserva órfã: outro payload não completa a reserva de ninguém', async () => {
    banco.falharJobs = 1
    await expect(enfileirarPeca(peca(1), lote('seg-19h'))).rejects.toThrow('queda do banco')
    await expect(enfileirarPeca(peca(2), lote('seg-19h'))).rejects.toMatchObject({ code: 'LOTE_ITEM_CONFLITO' })
    expect(banco.generations.size).toBe(0)
    expect(banco.jobs.size).toBe(0)
  })

  it('(c) duas chamadas concorrentes com a mesma chave: a segunda reserva toma a unicidade e as duas terminam com UMA Generation', async () => {
    const [a, b] = await Promise.all([enfileirarPeca(peca(1), lote('seg-19h')), enfileirarPeca(peca(1), lote('seg-19h'))])
    expect(banco.violacoesDeUnicidade).toBe(1)
    expect(a.generationId).toBe(b.generationId)
    expect(a.jobId).toBe(b.jobId)
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect([a.lote!.desfecho, b.lote!.desfecho]).toContain('reaproveitado')
    expect([...banco.itensDeLote.values()][0]).toMatchObject({ tentativas: 1, generationId: a.generationId })
  })

  it('(c) dez chamadas concorrentes, dois itens: uma Generation e um job por item', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => enfileirarPeca(peca(i % 2 ? 1 : 2), lote(i % 2 ? 'seg-19h' : 'ter-19h'))))
    expect(new Set(rs.map((r) => r.generationId)).size).toBe(2)
    expect(banco.generations.size).toBe(2)
    expect(banco.jobs.size).toBe(2)
    expect(banco.violacoesDeUnicidade).toBe(8)
  })
})

describe('lote durável — retomada', () => {
  it('(d) reserva órfã (o processo morreu entre reservar e criar) é retomada criando só o que falta', async () => {
    const payload = payloadParaHash(validarSpec(peca(1)).spec)
    banco.itensDeLote.set('lote-orfa', {
      id: 'lote-orfa', projectId: 6, loteId: 'semana-2026-09-07', itemId: 'seg-19h', situacao: 'reservado',
      hashDoPayload: hashDoPayload(payload), payload, generationId: null, jobId: null, tentativas: 0,
    })
    const r = await enfileirarPeca(peca(1), lote('seg-19h'))
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(banco.itensDeLote.size).toBe(1)
    expect(banco.itensDeLote.get('lote-orfa')).toMatchObject({ situacao: 'enfileirado', generationId: r.generationId, jobId: r.jobId, tentativas: 1 })
    // Repetir agora reaproveita.
    expect((await enfileirarPeca(peca(1), lote('seg-19h'))).lote?.desfecho).toBe('reaproveitado')
    expect(banco.jobs.size).toBe(1)
  })

  it('(d) Generation aberta que perdeu o job: recria SÓ o job, na mesma Generation', async () => {
    const primeira = await enfileirarPeca(peca(1), lote('seg-19h'))
    banco.jobs.delete(primeira.jobId)
    const r = await enfileirarPeca(peca(1), lote('seg-19h'))
    expect(r.generationId).toBe(primeira.generationId)
    expect(r.jobId).not.toBe(primeira.jobId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect([...banco.itensDeLote.values()][0]).toMatchObject({ jobId: r.jobId, tentativas: 1 })
  })

  it('(d) peça que falhou: a repetição cria outra Generation e a que falhou fica como histórico', async () => {
    const primeira = await enfileirarPeca(peca(1), lote('seg-19h'))
    banco.generations.set(primeira.generationId, { ...banco.generations.get(primeira.generationId), status: 'FAILED' })
    banco.jobs.set(primeira.jobId, { ...banco.jobs.get(primeira.jobId), status: 'FAILED' })
    const r = await enfileirarPeca(peca(1), lote('seg-19h'))
    expect(r.generationId).not.toBe(primeira.generationId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.generations.get(primeira.generationId)?.status).toBe('FAILED')
    expect(banco.generations.size).toBe(2)
    expect([...banco.itensDeLote.values()][0]).toMatchObject({ generationId: r.generationId, tentativas: 2 })
  })

  it('(e) leva com falha no meio (o item 2 lança) e repetição da leva inteira: exatamente um job por item', async () => {
    const itens = [1, 2, 3].map((n) => ({ spec: peca(n), itemId: `item-${n}` }))

    // Primeira passada: o job do item 2 cai; a transação dele volta atrás inteira.
    const primeira = await rodarLeva(itens.map((item, i) => ({ ...item, antes: () => { banco.falharJobs = i === 1 ? 1 : 0 } })))
    expect(primeira.map((s) => (s.erro ? 'falhou' : s.r!.lote!.desfecho))).toEqual(['criado', 'falhou', 'criado'])
    expect(banco.generations.size).toBe(2)
    expect(banco.jobs.size).toBe(2)
    expect([...banco.itensDeLote.values()].find((l) => l.itemId === 'item-2')).toMatchObject({ situacao: 'reservado', generationId: null, jobId: null })

    // Repetição da leva inteira, idêntica.
    const segunda = await rodarLeva(itens)
    expect(segunda.map((s) => s.r?.lote?.desfecho)).toEqual(['reaproveitado', 'retomado', 'reaproveitado'])
    expect(banco.generations.size).toBe(3)
    expect(banco.jobs.size).toBe(3)
    const jobsPorGeracao = new Map<string, number>()
    for (const j of banco.jobs.values()) jobsPorGeracao.set(j.generationId as string, (jobsPorGeracao.get(j.generationId as string) ?? 0) + 1)
    expect([...jobsPorGeracao.values()]).toEqual([1, 1, 1])
    const porItem = new Map([...banco.itensDeLote.values()].map((l) => [l.itemId, l]))
    expect(new Set([...porItem.values()].map((l) => l.generationId)).size).toBe(3)
    for (const s of segunda) expect(porItem.get(s.itemId)).toMatchObject({ generationId: s.r!.generationId, jobId: s.r!.jobId, situacao: 'enfileirado' })

    // Uma terceira repetição não muda nada.
    const terceira = await rodarLeva(itens)
    expect(terceira.every((s) => s.r?.lote?.desfecho === 'reaproveitado')).toBe(true)
    expect(banco.jobs.size).toBe(3)
  })
})

describe('lote durável — bordas', () => {
  it('sem identidade o comportamento é o de sempre: duas chamadas, duas peças', async () => {
    const a = await enfileirarPeca(peca(1))
    const b = await enfileirarPeca(peca(1))
    expect(a.generationId).not.toBe(b.generationId)
    expect(a.lote).toBeUndefined()
    expect(banco.itensDeLote.size).toBe(0)
  })

  it('identidade inválida é recusada antes de qualquer escrita', async () => {
    await expect(enfileirarPeca(peca(1), { lote: { loteId: '', itemId: 'x' } })).rejects.toMatchObject({ code: 'LOTE_IDENTIDADE_INVALIDA', status: 400 })
    expect(banco.itensDeLote.size + banco.generations.size + banco.jobs.size + banco.pastas).toBe(0)
  })

  it('a mesma chave em OUTRO projeto é outro item', async () => {
    const a = await enfileirarPeca(peca(1), lote('seg-19h'))
    const b = await enfileirarPeca({ ...peca(1), projectId: 7 }, lote('seg-19h'))
    expect(a.generationId).not.toBe(b.generationId)
    expect(banco.itensDeLote.size).toBe(2)
  })

  it('item de plano: a linha é ligada à Generation que o caminho do plano cria, na mesma transação', async () => {
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08') })
    const spec = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
    const r = await enfileirarPeca(spec, lote('seg-19h'))
    expect(r.lote?.desfecho).toBe('criado')
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: r.generationId })
    expect((await enfileirarPeca(spec, lote('seg-19h'))).generationId).toBe(r.generationId)
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
  })

  it('item de plano já enfileirado sem identidade: a primeira chamada COM identidade liga a linha à peça existente e diz reaproveitado', async () => {
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08') })
    const spec = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
    const pelaBancada = await enfileirarPeca(spec)
    const pelaLeva = await enfileirarPeca(spec, lote('seg-19h'))
    expect(pelaLeva).toMatchObject({ generationId: pelaBancada.generationId, jobId: pelaBancada.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(banco.generations.size).toBe(1)
    expect([...banco.itensDeLote.values()][0]).toMatchObject({ generationId: pelaBancada.generationId, tentativas: 0 })
  })
})

describe('correção da revisão (R01, R02)', () => {
  const specDoPlano = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
  const criarItemDoPlano = (extra: Record<string, unknown> = {}) =>
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08'), ...extra })
  const linhaDoLote = () => [...banco.itensDeLote.values()][0]
  const revisaoDoJob = (jobId: string) => (banco.jobs.get(jobId)!.payload as { planoRevisao: string }).planoRevisao
  const marcar = (tabela: 'generations' | 'jobs' | 'itensDePlano', id: string, extra: Record<string, unknown>) => banco[tabela].set(id, { ...banco[tabela].get(id), ...extra })

  it.each(['na-fila', 'gerando'])('R01 — job FAILED com a Generation aberta (item "%s"): nova Generation e novo job PENDING, plano e lote apontam para ela, e a terceira chamada reaproveita', async (statusDoItem) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    const revisao = revisaoDoJob(primeira.jobId)
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: statusDoItem })

    const segunda = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.jobId).not.toBe(primeira.jobId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.generations.get(segunda.generationId)).toMatchObject({ status: 'PROCESSING' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId, payload: { planoRevisao: revisao } })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, situacao: 'enfileirado', tentativas: 2 })

    const terceira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(terceira).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(banco.generations.size).toBe(2)
    expect(banco.jobs.size).toBe(2)
    // O job novo é executável: o cron o roda e fecha a peça.
    expect(await rodarComoOCron(segunda.jobId)).toBe('DONE')
    expect(banco.generations.get(segunda.generationId)?.status).toBe('COMPLETED')
  })

  it.each(['erro', 'na-fila'])('R01 — Generation FAILED com item de plano (item "%s"): nova peça ligada ao plano e ao lote, a que falhou fica como histórico', async (statusDoItem) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: statusDoItem })

    const segunda = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
    expect(banco.generations.get(primeira.generationId)?.status).toBe('FAILED')
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, tentativas: 2 })
    expect((await enfileirarPeca(specDoPlano, lote('seg-19h'))).lote?.desfecho).toBe('reaproveitado')
    expect(banco.generations.size).toBe(2)
    expect(banco.jobs.size).toBe(2)
  })

  it('R02 — job removido: mesma Generation, novo job executável com planoRevisao, vínculos atualizados, sem duplicar', async () => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    const revisao = revisaoDoJob(primeira.jobId)
    banco.jobs.delete(primeira.jobId)

    const r = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(r.generationId).toBe(primeira.generationId)
    expect(r.jobId).not.toBe(primeira.jobId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', kind: 'COMPOR', generationId: primeira.generationId, payload: { generationId: primeira.generationId, planoRevisao: revisao } })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: primeira.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: primeira.generationId, jobId: r.jobId, situacao: 'enfileirado', tentativas: 1 })

    const repetida = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(repetida).toMatchObject({ generationId: primeira.generationId, jobId: r.jobId, lote: { desfecho: 'reaproveitado' } })
    expect(banco.jobs.size).toBe(1)
    expect(await rodarComoOCron(r.jobId)).toBe('DONE')
  })

  it.each([
    ['só a Generation', false],
    ['a Generation e o job', true],
  ])('R02 — Generation desaparecida (%s) com o item ainda "na-fila": nova Generation e novo job, sem ITEM_EXECUCAO_CONCORRENTE', async (_caso, apagarJob) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    banco.generations.delete(primeira.generationId)
    if (apagarJob) banco.jobs.delete(primeira.jobId)

    const segunda = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.jobId).not.toBe(primeira.jobId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, tentativas: 2 })
    expect((await enfileirarPeca(specDoPlano, lote('seg-19h'))).lote?.desfecho).toBe('reaproveitado')
    expect(banco.generations.size).toBe(1)
  })

  it.each([
    ['job FAILED', (g: { generationId: string; jobId: string }) => marcar('jobs', g.jobId, { status: 'FAILED' })],
    ['job removido', (g: { generationId: string; jobId: string }) => banco.jobs.delete(g.jobId)],
    ['Generation apagada, job mantido', (g: { generationId: string; jobId: string }) => banco.generations.delete(g.generationId)],
  ])('a guarda de revisão continua (%s): item revisado depois da peça que morreu é recusado sem escrever nada', async (_caso, matar) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    matar(primeira)
    marcar('itensDePlano', 'item-1', { tema: 'Revisado por fora' })
    const antes = structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })

    await expect(enfileirarPeca(specDoPlano, lote('seg-19h'))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE', status: 409 })
    expect({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano }).toEqual(antes)
  })

  it('a ficha de concorrência continua valendo na retomada do item executável, e item reprovado não é refeito', async () => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })
    await expect(enfileirarPeca(specDoPlano, { ...lote('seg-19h'), itemAtualizadoEm: new Date('2026-09-01') })).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })

    marcar('itensDePlano', 'item-1', { status: 'reprovado' })
    await expect(enfileirarPeca(specDoPlano, lote('seg-19h'))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(linhaDoLote()).toMatchObject({ generationId: primeira.generationId, jobId: primeira.jobId, tentativas: 1 })
  })
})
