/**
 * O lote durável (PR 11): `enfileirarPeca` com identidade `{ loteId, itemId }`,
 * com o banco falso e a reserva, a fila e o caminho do plano de produção.
 *
 * O banco falso modela as duas garantias do Postgres de que a reserva depende:
 * a chave única composta (o segundo `create` com a mesma chave toma P2002) e a
 * trava da linha (as transações se serializam — a trava real é por linha; esta
 * é global, mais grossa, e por isso não esconde corrida nenhuma). Transação que
 * lança volta atrás inteira.
 *
 * Revisão R04: a trava global serializa a TRANSAÇÃO inteira, e por isso não
 * consegue reproduzir duas decisões tomadas sob travas de linhas DIFERENTES
 * antes de a trava do item de plano ser disputada. `travasPorLinha` liga o
 * modelo fiel: a transação não trava ao começar; cada `SELECT … FOR UPDATE`
 * trava a linha dele (`ItemDeLote` ou `ItemDePlano`) até o fim da transação, e o
 * rollback desfaz só o que ELA escreveu (diário de imagens anteriores).
 * `antesDaTravaDoPlano` é a barreira: roda antes de disputar a trava do item.
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
  travasPorLinha: false,
  travas: new Map<string, Promise<void>>(),
  antesDaTravaDoPlano: null as null | (() => Promise<void>),
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
  type Diario = Array<[Tabela, string, Record<string, unknown> | undefined]>
  const gravar = (tabela: Tabela, id: string, linha: Record<string, unknown>, naTransacao: boolean, diario?: Diario) => {
    diario?.push([tabela, id, banco[tabela].has(id) ? structuredClone(banco[tabela].get(id)) : undefined])
    banco[tabela].set(id, linha)
    if (!naTransacao && banco.emTransacao > 0) {
      const copia = structuredClone(linha)
      banco.foraDaTransacao.push(() => banco[tabela].set(id, structuredClone(copia)))
    }
  }

  const delegados = (naTransacao: boolean, diario?: Diario) => {
    const novoJob = (data: Record<string, unknown>) => {
      if (banco.falharJobs > 0) {
        banco.falharJobs--
        throw new Error('queda do banco ao criar o job')
      }
      const id = `job-${++banco.seq}`
      gravar('jobs', id, { id, status: 'PENDING', attempts: 0, ...data }, naTransacao, diario)
      return { id }
    }
    return {
      project: { findUnique: async ({ where }: { where: { id: number } }) => ({ id: where.id, name: 'Espeto Gaúcho', userId: 'dono-interno' }) },
      generation: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const id = `gen-${++banco.seq}`
          gravar('generations', id, { id, ...data }, naTransacao, diario)
          return { id }
        },
        findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const g = banco.generations.get(where.id)
          return g ? escolher(g, select) : null
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          gravar('generations', where.id, { ...banco.generations.get(where.id), ...data }, naTransacao, diario)
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
          gravar('jobs', where.id, { ...j, ...data }, naTransacao, diario)
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
          gravar('itensDeLote', id, linha, naTransacao, diario)
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
          gravar('itensDeLote', where.id, { ...l, ...resto, ...(tentativas ? { tentativas: Number(l.tentativas) + tentativas.increment } : {}) }, naTransacao, diario)
          return { count: 1 }
        },
      },
      itemDePlano: {
        findFirst: async ({ where }: { where: { id: string; projectId: number; planoId?: string } }) => {
          const i = banco.itensDePlano.get(where.id)
          return i && i.projectId === where.projectId && (!where.planoId || i.planoId === where.planoId) ? i : null
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          gravar('itensDePlano', where.id, { ...banco.itensDePlano.get(where.id), ...data }, naTransacao, diario)
        },
        updateMany: async () => ({ count: 0 }),
      },
    }
  }

  const $transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    if (banco.travasPorLinha) {
      const diario: Diario = []
      const minhas: Array<() => void> = []
      const $queryRaw = async (partes: TemplateStringsArray, ...valores: unknown[]) => {
        const tabela = /FROM "(\w+)"/.exec(partes.join('?'))?.[1] ?? '?'
        if (tabela === 'ItemDePlano' && banco.antesDaTravaDoPlano) await banco.antesDaTravaDoPlano()
        const chave = `${tabela}|${String(valores[0])}`
        while (banco.travas.has(chave)) await banco.travas.get(chave)
        let liberar!: () => void
        banco.travas.set(chave, new Promise<void>((r) => {
          liberar = () => {
            banco.travas.delete(chave)
            r()
          }
        }))
        minhas.push(liberar)
        return []
      }
      try {
        return await run({ ...delegados(true, diario), $queryRaw })
      } catch (erro) {
        for (const [tabela, id, antes] of diario.reverse()) {
          if (antes === undefined) banco[tabela].delete(id)
          else banco[tabela].set(id, antes)
        }
        throw erro
      } finally {
        for (const liberar of minhas) liberar()
      }
    }
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

// O R06 edita a copy pelo SERVIÇO de verdade (`atualizarItem`). O plano-service
// importa `Prisma` de '@prisma/client' (o cliente gerado não existe no
// worktree) e `parseBRT` de agendar.ts (que arrasta Blob e persist): os dois
// são trocados só pelo que o serviço usa aqui.
vi.mock('@prisma/client', () => ({ Prisma: { DbNull: 'DbNull', JsonNull: 'JsonNull' } }))
vi.mock('@/lib/creatives/agendar', () => ({ parseBRT: (valor: string) => new Date(valor) }))

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
import { mesmaSpecDaPeca } from '@/lib/planos/enfileirar-composicao'
import { VERSAO_DO_CONTRATO } from '@/lib/copy-autoral/contrato'

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
  banco.travasPorLinha = false
  banco.travas.clear()
  banco.antesDaTravaDoPlano = null
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

describe('correção da revisão (R03, R04)', () => {
  const criarItemDoPlano = (extra: Record<string, unknown> = {}) =>
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08'), ...extra })
  const marcar = (tabela: 'generations' | 'jobs' | 'itensDePlano', id: string, extra: Record<string, unknown>) => banco[tabela].set(id, { ...banco[tabela].get(id), ...extra })
  const retrato = () => structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDePlano: banco.itensDePlano })

  /** A copy autoral com os carimbos de relógio — o que muda quando o modelo remonta a mesma chamada. */
  const contrato = (em: string, cta = 'Vem pra cá') => ({
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em, superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Rodízio completo'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: [cta] },
    ],
    revisoes: [{ em, autor: 'equipe', motivo: 'trocou o CTA', blocos: ['cta'] }],
  })
  const specAutoral = (em: string, cta?: string) => ({
    projectId: 6, formato: 'story', nome: 'Peça 1', quando: '2026-09-11T18:00:00.000Z',
    copyAutoral: contrato(em, cta), itemDePlanoId: 'item-1', planoId: 'plano-1',
  })
  const AS_10H = '2026-09-12T10:00:00.000Z'
  const AS_10H07 = '2026-09-12T10:07:31.000Z'

  describe('R03 — a retomada compara specs pela normalização do lote', () => {
    it('mesmaSpecDaPeca: com lote, os carimbos não são diferença; conteúdo e projeto são; sem lote, a comparação crua de sempre', () => {
      const a = validarSpec(specAutoral(AS_10H)).spec!
      const b = validarSpec(specAutoral(AS_10H07)).spec!
      const outraCopy = validarSpec(specAutoral(AS_10H07, 'Reserve já')).spec!
      const gravadaA = JSON.parse(JSON.stringify(a))
      expect(mesmaSpecDaPeca(gravadaA, b, true)).toBe(true)
      expect(mesmaSpecDaPeca(gravadaA, outraCopy, true)).toBe(false)
      expect(mesmaSpecDaPeca({ ...gravadaA, projectId: 7 }, a, true)).toBe(false)
      expect(mesmaSpecDaPeca(undefined, a, true)).toBe(false)
      expect(mesmaSpecDaPeca(gravadaA, a, false)).toBe(true)
      expect(mesmaSpecDaPeca(gravadaA, b, false)).toBe(false)
    })

    it('job FAILED, só os carimbos mudaram: nova Generation e novo job, sem ITEM_EXECUCAO_CONCORRENTE', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lote('seg-19h'))
      marcar('jobs', primeira.jobId, { status: 'FAILED' })

      const segunda = await enfileirarPeca(specAutoral(AS_10H07), lote('seg-19h'))
      expect(segunda.generationId).not.toBe(primeira.generationId)
      expect(segunda.jobId).not.toBe(primeira.jobId)
      expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
      expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
      expect((await enfileirarPeca(specAutoral(AS_10H), lote('seg-19h'))).lote?.desfecho).toBe('reaproveitado')
      expect(banco.generations.size).toBe(2)
      expect(banco.jobs.size).toBe(2)
    })

    it('job removido, só os carimbos mudaram: SÓ um job novo, na mesma Generation', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lote('seg-19h'))
      banco.jobs.delete(primeira.jobId)

      const segunda = await enfileirarPeca(specAutoral(AS_10H07), lote('seg-19h'))
      expect(segunda.generationId).toBe(primeira.generationId)
      expect(segunda.jobId).not.toBe(primeira.jobId)
      expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
      expect(banco.generations.size).toBe(1)
      expect(banco.jobs.size).toBe(1)
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: primeira.generationId })
    })

    it('outra identidade de lote que só muda os carimbos reaproveita a peça do item (o reaproveitamento também compara como o lote)', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lote('seg-19h'))
      const outra = await enfileirarPeca(specAutoral(AS_10H07), { lote: { loteId: 'semana-refeita', itemId: 'seg-19h' } })
      expect(outra).toMatchObject({ generationId: primeira.generationId, jobId: primeira.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
      expect(banco.generations.size).toBe(1)
      expect(banco.jobs.size).toBe(1)
    })

    it('mudança REAL de conteúdo continua recusada: mesma chave é conflito; outra chave com o item em voo é ITEM_EXECUCAO_CONCORRENTE; spec gravada de outro conteúdo também', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lote('seg-19h'))
      marcar('jobs', primeira.jobId, { status: 'FAILED' })
      const antes = retrato()

      await expect(enfileirarPeca(specAutoral(AS_10H07, 'Reserve já'), lote('seg-19h'))).rejects.toMatchObject({ code: 'LOTE_ITEM_CONFLITO' })
      marcar('jobs', primeira.jobId, { status: 'PENDING' })
      const vivo = retrato()
      await expect(enfileirarPeca(specAutoral(AS_10H07, 'Reserve já'), { lote: { loteId: 'outra-semana', itemId: 'seg-19h' } })).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
      expect(retrato()).toEqual(vivo)
      marcar('jobs', primeira.jobId, { status: 'FAILED' })
      expect(retrato()).toEqual(antes)

      // Job removido e a Generation guardando OUTRO conteúdo: a guarda pela Generation segue de pé.
      banco.jobs.delete(primeira.jobId)
      const g = banco.generations.get(primeira.generationId)!
      const fv = g.fieldValues as { spec: { copyAutoral: { blocos: Array<{ id: string; linhas: string[] }> } } }
      marcar('generations', primeira.generationId, { fieldValues: { ...fv, spec: { ...fv.spec, copyAutoral: { ...fv.spec.copyAutoral, blocos: fv.spec.copyAutoral.blocos.map((b) => (b.id === 'cta' ? { ...b, linhas: ['Outro CTA'] } : b)) } } } })
      const semJob = retrato()
      await expect(enfileirarPeca(specAutoral(AS_10H07), lote('seg-19h'))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
      expect(retrato()).toEqual(semJob)
    })

    it('sem identidade de lote nada muda: a bancada que só muda os carimbos com o item em voo continua recusada', async () => {
      criarItemDoPlano()
      await enfileirarPeca(specAutoral(AS_10H))
      await expect(enfileirarPeca(specAutoral(AS_10H07))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
      expect(banco.generations.size).toBe(1)
    })
  })

  describe('R04 — a retomada é re-decidida sob a trava do item de plano', () => {
    const specDoPlano = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
    const LOTE_A = { lote: { loteId: 'semana-a', itemId: 'seg-19h' } }
    const LOTE_B = { lote: { loteId: 'semana-b', itemId: 'seg-19h' } }

    /** Duas linhas de lote DIFERENTES ligadas à mesma Generation do item — pelo reaproveitamento que já existe. */
    async function duasLinhasNaMesmaPeca() {
      criarItemDoPlano()
      const a = await enfileirarPeca(specDoPlano, LOTE_A)
      const b = await enfileirarPeca(specDoPlano, LOTE_B)
      expect(b).toMatchObject({ generationId: a.generationId, jobId: a.jobId, lote: { desfecho: 'reaproveitado' } })
      expect(new Set([...banco.itensDeLote.values()].map((l) => l.generationId))).toEqual(new Set([a.generationId]))
      return a
    }

    /**
     * A barreira: cada chamada para ANTES de disputar a trava do item e só segue
     * quando as duas chegaram — ou seja, as duas já decidiram, sob a trava da
     * PRÓPRIA linha, que a peça precisa ser retomada. Com `segurarASegunda`, a
     * segunda só segue quando o teste mandar.
     */
    function barreira({ segurarASegunda = false } = {}) {
      let chegadas = 0
      let abrir!: () => void
      const aberta = new Promise<void>((r) => (abrir = r))
      let liberarSegunda!: () => void
      const segunda = new Promise<void>((r) => (liberarSegunda = r))
      banco.travasPorLinha = true
      banco.antesDaTravaDoPlano = async () => {
        const n = ++chegadas
        if (n === 2) abrir()
        await aberta
        if (n === 2 && segurarASegunda) await segunda
      }
      return { chegadas: () => chegadas, liberarSegunda: () => liberarSegunda() }
    }

    it('job removido, duas linhas decidem "falta job" antes da trava do item: a Generation original, UM job novo e os dois lotes com os mesmos ids', async () => {
      const original = await duasLinhasNaMesmaPeca()
      banco.jobs.delete(original.jobId)
      const b = barreira()

      const [ra, rb] = await Promise.all([enfileirarPeca(specDoPlano, LOTE_A), enfileirarPeca(specDoPlano, LOTE_B)])
      expect(b.chegadas()).toBe(2)
      expect(ra.generationId).toBe(original.generationId)
      expect(rb.generationId).toBe(original.generationId)
      expect(ra.jobId).toBe(rb.jobId)
      expect(ra.jobId).not.toBe(original.jobId)
      expect([ra.lote!.desfecho, rb.lote!.desfecho].sort()).toEqual(['reaproveitado', 'retomado'])
      expect(banco.generations.size).toBe(1)
      expect(banco.jobs.size).toBe(1)
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: original.generationId })
      for (const linha of banco.itensDeLote.values()) expect(linha).toMatchObject({ generationId: original.generationId, jobId: ra.jobId, situacao: 'enfileirado' })
    })

    it.each(['pronto', 'na-fila'])('a peça ficou PRONTA entre a decisão e a trava (item "%s"): a segunda chamada reaproveita a peça pronta, sem Generation nova', async (statusDepois) => {
      const original = await duasLinhasNaMesmaPeca()
      banco.jobs.delete(original.jobId)
      const b = barreira({ segurarASegunda: true })

      const pa = enfileirarPeca(specDoPlano, LOTE_A)
      const pb = enfileirarPeca(specDoPlano, LOTE_B)
      const primeira = await Promise.race([pa, pb])
      expect(b.chegadas()).toBe(2)
      expect(await rodarComoOCron(primeira.jobId)).toBe('DONE')
      marcar('itensDePlano', 'item-1', { status: statusDepois })
      b.liberarSegunda()

      const [ra, rb] = await Promise.all([pa, pb])
      const segunda = ra.jobId === primeira.jobId && ra.lote!.desfecho === 'retomado' ? rb : ra
      expect(segunda).toMatchObject({ generationId: original.generationId, jobId: primeira.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pronta' } })
      expect(banco.generations.size).toBe(1)
      expect(banco.jobs.size).toBe(1)
      for (const linha of banco.itensDeLote.values()) expect(linha).toMatchObject({ generationId: original.generationId, jobId: primeira.jobId })
    })

    it('job FAILED, duas linhas decidem "refazer tudo" antes da trava do item: UMA Generation nova e UM job novo, as duas linhas nela', async () => {
      const original = await duasLinhasNaMesmaPeca()
      marcar('jobs', original.jobId, { status: 'FAILED' })
      const b = barreira()

      const [ra, rb] = await Promise.all([enfileirarPeca(specDoPlano, LOTE_A), enfileirarPeca(specDoPlano, LOTE_B)])
      expect(b.chegadas()).toBe(2)
      expect(ra.generationId).not.toBe(original.generationId)
      expect(rb.generationId).toBe(ra.generationId)
      expect(rb.jobId).toBe(ra.jobId)
      expect(banco.generations.size).toBe(2)
      expect(banco.jobs.size).toBe(2)
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: ra.generationId })
      for (const linha of banco.itensDeLote.values()) expect(linha).toMatchObject({ generationId: ra.generationId, jobId: ra.jobId })
    })

    it('o modo de travas por linha desfaz só o que a transação que lançou escreveu', async () => {
      criarItemDoPlano()
      banco.travasPorLinha = true
      banco.falharJobs = 1
      await expect(enfileirarPeca(specDoPlano, LOTE_A)).rejects.toThrow('queda do banco')
      expect(banco.generations.size).toBe(0)
      expect(banco.jobs.size).toBe(0)
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'proposto' })
      expect([...banco.itensDeLote.values()][0]).toMatchObject({ situacao: 'reservado', generationId: null })
      expect(banco.travas.size).toBe(0)
    })
  })
})

describe('correção da revisão final (R05, R06): a tabela única sob a trava do item, pelo caminho real', () => {
  const specDoPlano = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
  const criarItem = (extra: Record<string, unknown> = {}) =>
    banco.itensDePlano.set('item-1', {
      id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', ordem: 0, updatedAt: new Date('2026-09-08'),
      plano: { id: 'plano-1', status: 'ativo', inicio: new Date('2026-09-07'), fim: new Date('2026-09-13') },
      ...extra,
    })
  const marcar = (tabela: 'generations' | 'jobs' | 'itensDePlano', id: string, extra: Record<string, unknown>) => banco[tabela].set(id, { ...banco[tabela].get(id), ...extra })
  const retrato = () => structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })
  const linhaDoLote = (loteId = 'semana-2026-09-07') => [...banco.itensDeLote.values()].find((l) => l.loteId === loteId)

  beforeEach(() => {
    banco.travasPorLinha = true
  })

  it('R05 — peça enfileirada SEM lote que perdeu o job: a primeira chamada COM lote refaz só o job na mesma Generation, liga a linha, e a repetição reaproveita', async () => {
    criarItem()
    const pelaBancada = await enfileirarPeca(specDoPlano)
    const revisao = (banco.jobs.get(pelaBancada.jobId)!.payload as { planoRevisao: string }).planoRevisao
    banco.jobs.delete(pelaBancada.jobId)

    const r = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(r.generationId).toBe(pelaBancada.generationId)
    expect(r.jobId).not.toBe(pelaBancada.jobId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', kind: 'COMPOR', generationId: pelaBancada.generationId, payload: { generationId: pelaBancada.generationId, planoRevisao: revisao } })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: pelaBancada.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: pelaBancada.generationId, jobId: r.jobId, situacao: 'enfileirado' })

    const repetida = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(repetida).toMatchObject({ generationId: pelaBancada.generationId, jobId: r.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(banco.jobs.size).toBe(1)
    expect(await rodarComoOCron(r.jobId)).toBe('DONE')
    expect(banco.generations.get(pelaBancada.generationId)?.status).toBe('COMPLETED')
  })

  it('R05, a mesma linha da tabela sem lote: a bancada que repete o item em voo sem job também refaz só o job', async () => {
    criarItem()
    const primeira = await enfileirarPeca(specDoPlano)
    banco.jobs.delete(primeira.jobId)
    const segunda = await enfileirarPeca(specDoPlano)
    expect(segunda.generationId).toBe(primeira.generationId)
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: primeira.generationId })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
  })

  it('linha fresca diante de uma peça cujo job morreu: Generation e job NOVOS (antes devolvia o job FAILED como reaproveitado)', async () => {
    criarItem()
    const pelaBancada = await enfileirarPeca(specDoPlano)
    marcar('jobs', pelaBancada.jobId, { status: 'FAILED' })
    const r = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(r.generationId).not.toBe(pelaBancada.generationId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', generationId: r.generationId })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: r.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: r.generationId, jobId: r.jobId })
  })

  it('R06 — a peça falhou, a copy foi editada pelo SERVIÇO e a chamada original da leva é repetida sem ficha: 409, e nada muda em Generations, jobs, linha do lote ou item', async () => {
    criarItem()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })

    const { atualizarItem } = await import('@/lib/planos/plano-service')
    await atualizarItem({ projectId: 6, planoId: 'plano-1', itemId: 'item-1', patch: { copyProposta: ['Costela no bafo', 'Vem pra cá'] } })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'editado', generationId: primeira.generationId, copyProposta: ['Costela no bafo', 'Vem pra cá'] })

    const antes = retrato()
    await expect(enfileirarPeca(specDoPlano, lote('seg-19h'))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE', status: 409, details: { motivo: 'revisado' } })
    expect(retrato()).toEqual(antes)
    expect(banco.travas.size).toBe(0)
  })

  it('R06, o controle: sem a edição a mesma retomada continua — Generation e job novos, item na fila, linha religada', async () => {
    criarItem()
    const primeira = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })

    const segunda = await enfileirarPeca(specDoPlano, lote('seg-19h'))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, tentativas: 2 })
  })
})
