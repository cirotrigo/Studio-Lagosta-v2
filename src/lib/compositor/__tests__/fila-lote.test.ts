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
 *
 * Pré-revisão C11-1: `aposLer` roda depois de cada leitura de Generation ou de
 * job — é como o teste põe o runner terminando a peça ENTRE as duas leituras.
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
  aposLer: null as null | ((tabela: 'generations' | 'jobs') => void),
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
          const lida = g ? escolher(g, select) : null
          banco.aposLer?.('generations')
          return lida
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
          const lido = j ? escolher(j, select) : null
          banco.aposLer?.('jobs')
          return lido
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
          const linha = { ...banco.itensDePlano.get(where.id), ...data }
          gravar('itensDePlano', where.id, linha, naTransacao, diario)
          return linha
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
import { revisaoDoItem } from '@/lib/planos/revisao-do-item'
import { VERSAO_DO_CONTRATO } from '@/lib/copy-autoral/contrato'

const peca = (n: number) => ({
  projectId: 6,
  formato: 'story',
  nome: `Peça ${n}`,
  quando: `2026-09-1${n}T18:00:00.000Z`,
  blocos: [{ papel: 'headline', linhas: [`Manchete ${n}`] }, { papel: 'cta', linhas: ['Vem pra cá'] }],
})
const lote = (itemId: string) => ({ lote: { loteId: 'semana-2026-09-07', itemId } })
/** A leitura do plano que monta a peça: a itemRevisao do item AGORA, como o ver-plano a devolve (C11-1a). */
const leitura = (itemId = 'item-1') => revisaoDoItem(banco.itensDePlano.get(itemId)!)
/** A identidade de lote de uma peça de item de plano, com a revisão que a chamada declara ter lido. */
const lotePlano = (itemId: string, itemRevisao: string) => ({ ...lote(itemId), itemRevisao })

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
  banco.aposLer = null
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
    const r = await enfileirarPeca(spec, lotePlano('seg-19h', leitura()))
    expect(r.lote?.desfecho).toBe('criado')
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: r.generationId })
    expect((await enfileirarPeca(spec, lotePlano('seg-19h', leitura()))).generationId).toBe(r.generationId)
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
  })

  it('item de plano já enfileirado sem identidade: a primeira chamada COM identidade liga a linha à peça existente e diz reaproveitado', async () => {
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08') })
    const spec = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
    const pelaBancada = await enfileirarPeca(spec)
    const pelaLeva = await enfileirarPeca(spec, lotePlano('seg-19h', leitura()))
    expect(pelaLeva).toMatchObject({ generationId: pelaBancada.generationId, jobId: pelaBancada.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(banco.generations.size).toBe(1)
    expect([...banco.itensDeLote.values()][0]).toMatchObject({ generationId: pelaBancada.generationId, tentativas: 0 })
  })
})

describe('correção da revisão (R01, R02)', () => {
  const specDoPlano = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
  /** A revisão que a leva leu ao montar a peça — a da criação do item (repetir depois de uma edição manda a mesma). */
  let lido = ''
  const criarItemDoPlano = (extra: Record<string, unknown> = {}) => {
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08'), ...extra })
    lido = leitura()
  }
  const linhaDoLote = () => [...banco.itensDeLote.values()][0]
  const revisaoDoJob = (jobId: string) => (banco.jobs.get(jobId)!.payload as { planoRevisao: string }).planoRevisao
  const marcar = (tabela: 'generations' | 'jobs' | 'itensDePlano', id: string, extra: Record<string, unknown>) => banco[tabela].set(id, { ...banco[tabela].get(id), ...extra })

  it.each(['na-fila', 'gerando'])('R01 — job FAILED com a Generation aberta (item "%s"): nova Generation e novo job PENDING, plano e lote apontam para ela, e a terceira chamada reaproveita', async (statusDoItem) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    const revisao = revisaoDoJob(primeira.jobId)
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: statusDoItem })

    const segunda = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.jobId).not.toBe(primeira.jobId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.generations.get(segunda.generationId)).toMatchObject({ status: 'PROCESSING' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId, payload: { planoRevisao: revisao } })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, situacao: 'enfileirado', tentativas: 2 })

    const terceira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(terceira).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(banco.generations.size).toBe(2)
    expect(banco.jobs.size).toBe(2)
    // O job novo é executável: o cron o roda e fecha a peça.
    expect(await rodarComoOCron(segunda.jobId)).toBe('DONE')
    expect(banco.generations.get(segunda.generationId)?.status).toBe('COMPLETED')
  })

  it.each(['erro', 'na-fila'])('R01 — Generation FAILED com item de plano (item "%s"): nova peça ligada ao plano e ao lote, a que falhou fica como histórico', async (statusDoItem) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: statusDoItem })

    const segunda = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
    expect(banco.generations.get(primeira.generationId)?.status).toBe('FAILED')
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, tentativas: 2 })
    expect((await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))).lote?.desfecho).toBe('reaproveitado')
    expect(banco.generations.size).toBe(2)
    expect(banco.jobs.size).toBe(2)
  })

  it('R02 — job removido: mesma Generation, novo job executável com planoRevisao, vínculos atualizados, sem duplicar', async () => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    const revisao = revisaoDoJob(primeira.jobId)
    banco.jobs.delete(primeira.jobId)

    const r = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(r.generationId).toBe(primeira.generationId)
    expect(r.jobId).not.toBe(primeira.jobId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', kind: 'COMPOR', generationId: primeira.generationId, payload: { generationId: primeira.generationId, planoRevisao: revisao } })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: primeira.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: primeira.generationId, jobId: r.jobId, situacao: 'enfileirado', tentativas: 1 })

    const repetida = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(repetida).toMatchObject({ generationId: primeira.generationId, jobId: r.jobId, lote: { desfecho: 'reaproveitado' } })
    expect(banco.jobs.size).toBe(1)
    expect(await rodarComoOCron(r.jobId)).toBe('DONE')
  })

  it.each([
    ['só a Generation', false],
    ['a Generation e o job', true],
  ])('R02 — Generation desaparecida (%s) com o item ainda "na-fila": nova Generation e novo job, sem ITEM_EXECUCAO_CONCORRENTE', async (_caso, apagarJob) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    banco.generations.delete(primeira.generationId)
    if (apagarJob) banco.jobs.delete(primeira.jobId)

    const segunda = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.jobId).not.toBe(primeira.jobId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, tentativas: 2 })
    expect((await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))).lote?.desfecho).toBe('reaproveitado')
    expect(banco.generations.size).toBe(1)
  })

  it.each([
    ['job FAILED', (g: { generationId: string; jobId: string }) => marcar('jobs', g.jobId, { status: 'FAILED' })],
    ['job removido', (g: { generationId: string; jobId: string }) => banco.jobs.delete(g.jobId)],
    ['Generation apagada, job mantido', (g: { generationId: string; jobId: string }) => banco.generations.delete(g.generationId)],
  ])('a guarda de revisão continua (%s): item revisado depois da peça que morreu é recusado sem escrever nada', async (_caso, matar) => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    matar(primeira)
    marcar('itensDePlano', 'item-1', { tema: 'Revisado por fora' })
    const antes = structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })

    await expect(enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE', status: 409 })
    expect({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano }).toEqual(antes)
  })

  it('a ficha de concorrência continua valendo na retomada do item executável, e item reprovado não é refeito', async () => {
    criarItemDoPlano()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })
    await expect(enfileirarPeca(specDoPlano, { ...lotePlano('seg-19h', lido), itemAtualizadoEm: new Date('2026-09-01') })).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })

    marcar('itensDePlano', 'item-1', { status: 'reprovado' })
    await expect(enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(linhaDoLote()).toMatchObject({ generationId: primeira.generationId, jobId: primeira.jobId, tentativas: 1 })
  })
})

describe('correção da revisão (R03, R04)', () => {
  /** A revisão que a leva leu ao montar a peça — a da criação do item (repetir depois de uma edição manda a mesma). */
  let lido = ''
  const criarItemDoPlano = (extra: Record<string, unknown> = {}) => {
    banco.itensDePlano.set('item-1', { id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', updatedAt: new Date('2026-09-08'), ...extra })
    lido = leitura()
  }
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
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lotePlano('seg-19h', lido))
      marcar('jobs', primeira.jobId, { status: 'FAILED' })

      const segunda = await enfileirarPeca(specAutoral(AS_10H07), lotePlano('seg-19h', lido))
      expect(segunda.generationId).not.toBe(primeira.generationId)
      expect(segunda.jobId).not.toBe(primeira.jobId)
      expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
      expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
      expect((await enfileirarPeca(specAutoral(AS_10H), lotePlano('seg-19h', lido))).lote?.desfecho).toBe('reaproveitado')
      expect(banco.generations.size).toBe(2)
      expect(banco.jobs.size).toBe(2)
    })

    it('job removido, só os carimbos mudaram: SÓ um job novo, na mesma Generation', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lotePlano('seg-19h', lido))
      banco.jobs.delete(primeira.jobId)

      const segunda = await enfileirarPeca(specAutoral(AS_10H07), lotePlano('seg-19h', lido))
      expect(segunda.generationId).toBe(primeira.generationId)
      expect(segunda.jobId).not.toBe(primeira.jobId)
      expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
      expect(banco.generations.size).toBe(1)
      expect(banco.jobs.size).toBe(1)
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: primeira.generationId })
    })

    it('outra identidade de lote que só muda os carimbos reaproveita a peça do item (o reaproveitamento também compara como o lote)', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lotePlano('seg-19h', lido))
      const outra = await enfileirarPeca(specAutoral(AS_10H07), { lote: { loteId: 'semana-refeita', itemId: 'seg-19h' }, itemRevisao: lido })
      expect(outra).toMatchObject({ generationId: primeira.generationId, jobId: primeira.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
      expect(banco.generations.size).toBe(1)
      expect(banco.jobs.size).toBe(1)
    })

    it('mudança REAL de conteúdo continua recusada: mesma chave é conflito; outra chave com o item em voo é ITEM_EXECUCAO_CONCORRENTE; spec gravada de outro conteúdo também', async () => {
      criarItemDoPlano()
      const primeira = await enfileirarPeca(specAutoral(AS_10H), lotePlano('seg-19h', lido))
      marcar('jobs', primeira.jobId, { status: 'FAILED' })
      const antes = retrato()

      await expect(enfileirarPeca(specAutoral(AS_10H07, 'Reserve já'), lotePlano('seg-19h', lido))).rejects.toMatchObject({ code: 'LOTE_ITEM_CONFLITO' })
      marcar('jobs', primeira.jobId, { status: 'PENDING' })
      const vivo = retrato()
      await expect(enfileirarPeca(specAutoral(AS_10H07, 'Reserve já'), { lote: { loteId: 'outra-semana', itemId: 'seg-19h' }, itemRevisao: lido })).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
      expect(retrato()).toEqual(vivo)
      marcar('jobs', primeira.jobId, { status: 'FAILED' })
      expect(retrato()).toEqual(antes)

      // Job removido e a Generation guardando OUTRO conteúdo: a guarda pela Generation segue de pé.
      banco.jobs.delete(primeira.jobId)
      const g = banco.generations.get(primeira.generationId)!
      const fv = g.fieldValues as { spec: { copyAutoral: { blocos: Array<{ id: string; linhas: string[] }> } } }
      marcar('generations', primeira.generationId, { fieldValues: { ...fv, spec: { ...fv.spec, copyAutoral: { ...fv.spec.copyAutoral, blocos: fv.spec.copyAutoral.blocos.map((b) => (b.id === 'cta' ? { ...b, linhas: ['Outro CTA'] } : b)) } } } })
      const semJob = retrato()
      await expect(enfileirarPeca(specAutoral(AS_10H07), lotePlano('seg-19h', lido))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE' })
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
      const a = await enfileirarPeca(specDoPlano, { ...LOTE_A, itemRevisao: lido })
      const b = await enfileirarPeca(specDoPlano, { ...LOTE_B, itemRevisao: lido })
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

      const [ra, rb] = await Promise.all([enfileirarPeca(specDoPlano, { ...LOTE_A, itemRevisao: lido }), enfileirarPeca(specDoPlano, { ...LOTE_B, itemRevisao: lido })])
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

      const pa = enfileirarPeca(specDoPlano, { ...LOTE_A, itemRevisao: lido })
      const pb = enfileirarPeca(specDoPlano, { ...LOTE_B, itemRevisao: lido })
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

      const [ra, rb] = await Promise.all([enfileirarPeca(specDoPlano, { ...LOTE_A, itemRevisao: lido }), enfileirarPeca(specDoPlano, { ...LOTE_B, itemRevisao: lido })])
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
      await expect(enfileirarPeca(specDoPlano, { ...LOTE_A, itemRevisao: lido })).rejects.toThrow('queda do banco')
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
    const lido = leitura()
    const pelaBancada = await enfileirarPeca(specDoPlano)
    const revisao = (banco.jobs.get(pelaBancada.jobId)!.payload as { planoRevisao: string }).planoRevisao
    banco.jobs.delete(pelaBancada.jobId)

    const r = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(r.generationId).toBe(pelaBancada.generationId)
    expect(r.jobId).not.toBe(pelaBancada.jobId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', kind: 'COMPOR', generationId: pelaBancada.generationId, payload: { generationId: pelaBancada.generationId, planoRevisao: revisao } })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: pelaBancada.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: pelaBancada.generationId, jobId: r.jobId, situacao: 'enfileirado' })

    const repetida = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(repetida).toMatchObject({ generationId: pelaBancada.generationId, jobId: r.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(banco.jobs.size).toBe(1)
    expect(await rodarComoOCron(r.jobId)).toBe('DONE')
    expect(banco.generations.get(pelaBancada.generationId)?.status).toBe('COMPLETED')
  })

  it('R05, a mesma linha da tabela sem lote: a bancada que repete o item em voo sem job também refaz só o job', async () => {
    criarItem()
    const lido = leitura()
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
    const lido = leitura()
    const pelaBancada = await enfileirarPeca(specDoPlano)
    marcar('jobs', pelaBancada.jobId, { status: 'FAILED' })
    const r = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(r.generationId).not.toBe(pelaBancada.generationId)
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(r.jobId)).toMatchObject({ status: 'PENDING', generationId: r.generationId })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: r.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: r.generationId, jobId: r.jobId })
  })

  it('R06 — a peça falhou, a copy foi editada pelo SERVIÇO e a chamada original da leva é repetida sem ficha: 409, e nada muda em Generations, jobs, linha do lote ou item', async () => {
    criarItem()
    const lido = leitura()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })

    const { atualizarItem } = await import('@/lib/planos/plano-service')
    await atualizarItem({ projectId: 6, planoId: 'plano-1', itemId: 'item-1', patch: { copyProposta: ['Costela no bafo', 'Vem pra cá'] } })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'editado', generationId: primeira.generationId, copyProposta: ['Costela no bafo', 'Vem pra cá'] })

    const antes = retrato()
    await expect(enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))).rejects.toMatchObject({ code: 'ITEM_EXECUCAO_CONCORRENTE', status: 409, details: { motivo: 'chamada-vencida' } })
    expect(retrato()).toEqual(antes)
    expect(banco.travas.size).toBe(0)
  })

  it('R06, o controle: sem a edição a mesma retomada continua — Generation e job novos, item na fila, linha religada', async () => {
    criarItem()
    const lido = leitura()
    const primeira = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    marcar('generations', primeira.generationId, { status: 'FAILED' })
    marcar('jobs', primeira.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })

    const segunda = await enfileirarPeca(specDoPlano, lotePlano('seg-19h', lido))
    expect(segunda.generationId).not.toBe(primeira.generationId)
    expect(segunda.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(segunda.jobId)).toMatchObject({ status: 'PENDING', generationId: segunda.generationId })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: segunda.generationId })
    expect(linhaDoLote()).toMatchObject({ generationId: segunda.generationId, jobId: segunda.jobId, tentativas: 2 })
  })
})

describe('pré-revisões C11-1 e C11-1a…1b: a revisão declarada pela chamada, pelo caminho real com travas por linha', () => {
  const L = 'semana-2026-09-07'
  const L2 = 'semana-2026-09-07-v2'
  const chave = (loteId: string, itemRevisao: string, itemId = 'seg') => ({ lote: { loteId, itemId }, itemRevisao })
  const specV1 = { ...peca(1), itemDePlanoId: 'item-1', planoId: 'plano-1' }
  const specV2 = { ...specV1, blocos: [{ papel: 'headline', linhas: ['Costela no bafo'] }, { papel: 'cta', linhas: ['Vem pra cá'] }] }
  const COPY_V2 = ['Costela no bafo', 'Vem pra cá']
  const criarItem = () =>
    banco.itensDePlano.set('item-1', {
      id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', ordem: 0, updatedAt: new Date('2026-09-08'),
      copyProposta: ['Manchete 1', 'Vem pra cá'],
      plano: { id: 'plano-1', status: 'ativo', inicio: new Date('2026-09-07'), fim: new Date('2026-09-13') },
    })
  const marcar = (tabela: 'generations' | 'jobs' | 'itensDePlano', id: string, extra: Record<string, unknown>) => banco[tabela].set(id, { ...banco[tabela].get(id), ...extra })
  const retrato = () => structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })
  const semLotes = () => structuredClone({ generations: banco.generations, jobs: banco.jobs, itensDePlano: banco.itensDePlano })
  const linha = (loteId: string, itemId = 'seg') => [...banco.itensDeLote.values()].find((l) => l.loteId === loteId && l.itemId === itemId)
  const revisaoDoJob = (jobId: string) => (banco.jobs.get(jobId)!.payload as { planoRevisao: string }).planoRevisao
  const linhasDoJob = (jobId: string) => (banco.jobs.get(jobId)!.payload as { spec: { blocos: Array<{ linhas: string[] }> } }).spec.blocos.map((b) => b.linhas)
  /** A fila: Generation e job FAILED, item em `erro` apontando a mesma peça. */
  const falhar = (p: { generationId: string; jobId: string }) => {
    marcar('generations', p.generationId, { status: 'FAILED' })
    marcar('jobs', p.jobId, { status: 'FAILED' })
    marcar('itensDePlano', 'item-1', { status: 'erro' })
  }
  const editar = async (patch: Record<string, unknown>) => {
    const { atualizarItem } = await import('@/lib/planos/plano-service')
    await atualizarItem({ projectId: 6, planoId: 'plano-1', itemId: 'item-1', patch })
  }
  const vencida = { code: 'ITEM_EXECUCAO_CONCORRENTE', status: 409, details: { motivo: 'chamada-vencida' } }

  beforeEach(() => {
    banco.travasPorLinha = true
  })

  it('a linha nasce com a revisão DECLARADA pela chamada, e o job da peça é carimbado com a mesma', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    expect(linha(L)).toMatchObject({ generationId: g1.generationId, planoRevisao: t1 })
    expect(revisaoDoJob(g1.jobId)).toBe(t1)
  })

  it('sem a itemRevisao (ou só com espaços), a peça de item de plano com lote é recusada ANTES de reservar, e nada é escrito', async () => {
    criarItem()
    await expect(enfileirarPeca(specV1, { lote: { loteId: L, itemId: 'seg' } })).rejects.toMatchObject({ code: 'ITEM_REVISAO_OBRIGATORIA', status: 400 })
    await expect(enfileirarPeca(specV1, chave(L, '   '))).rejects.toMatchObject({ code: 'ITEM_REVISAO_OBRIGATORIA', status: 400 })
    expect(banco.itensDeLote.size + banco.generations.size + banco.jobs.size + banco.pastas).toBe(0)
  })

  it('C11-1a, cenário A: o chat lê o item (v1), a equipe edita (v2) ANTES de a chamada chegar, e a leva com a spec v1 é recusada — a linha nasce com a revisão da CHAMADA, nenhuma peça; relida, a peça v2 com outro itemId sai', async () => {
    criarItem()
    const t1 = leitura() // 1. o chat lê o plano e monta a spec v1
    await editar({ copyProposta: COPY_V2 }) // 2. a equipe edita
    const t2 = leitura()
    expect(t2).not.toBe(t1)

    const antes = semLotes()
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida) // 3. a leva chega
    expect(semLotes()).toEqual(antes)
    expect(linha(L)).toMatchObject({ generationId: null, situacao: 'reservado', planoRevisao: t1 })

    const nova = await enfileirarPeca(specV2, chave(L, t2, 'seg-v2'))
    expect(banco.jobs.get(nova.jobId)).toMatchObject({ status: 'PENDING', generationId: nova.generationId, payload: { planoRevisao: t2 } })
    expect(linhasDoJob(nova.jobId)).toEqual([['Costela no bafo'], ['Vem pra cá']])
    expect(linha(L, 'seg-v2')).toMatchObject({ generationId: nova.generationId, planoRevisao: t2 })
  })

  it.each(['falha', 'é reprovada'])('C11-1a, cenário B: com o estado que a revisão lida pelo servidor deixava (linha e peça v1 carimbadas com v2), a peça v2 da bancada %s e a leva repetida com a chamada ORIGINAL é recusada sem escrever nada', async (desfecho) => {
    criarItem()
    const t1 = leitura()
    await editar({ copyProposta: COPY_V2 })
    const t2 = leitura()
    // O que 2c1dfba8 gravava: a linha nascia com a revisão do servidor (t2) e a peça v1 saía carimbada com ela.
    const g1 = await enfileirarPeca(specV1, chave(L, t2))
    expect(revisaoDoJob(g1.jobId)).toBe(t2)
    expect(linhasDoJob(g1.jobId)).toEqual([['Manchete 1'], ['Vem pra cá']])
    falhar(g1)
    const g2 = await enfileirarPeca(specV2) // a bancada, com o item v2
    if (desfecho === 'falha') {
      falhar(g2)
    } else {
      expect(await rodarComoOCron(g2.jobId)).toBe('DONE')
      // A fila reaponta o item para `pronto` com a peça (o banco falso não aplica o updateMany condicional dela).
      marcar('itensDePlano', 'item-1', { status: 'pronto', generationId: g2.generationId, pageId: 'page-1' })
      const { regenerarItem } = await import('@/lib/planos/regenerar')
      await regenerarItem({ projectId: 6, planoId: 'plano-1', itemId: 'item-1', motivo: 'A foto não combina com a copy.', voltarPara: 'aprovado' })
      expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'aprovado', generationId: g2.generationId })
    }

    const antes = retrato()
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida)
    expect(retrato()).toEqual(antes)
    expect(banco.travas.size).toBe(0)
  })

  it('C11-1a, variante sem concorrência: a primeira leva acaba antes de chegar ao item, a equipe edita, e a repetição da leva inteira cria a linha com a revisão da CHAMADA e recusa a peça', async () => {
    criarItem()
    const t1 = leitura()
    const levaL = [
      { itemId: 'abre', spec: peca(2) as Record<string, unknown>, itemRevisao: undefined as string | undefined },
      { itemId: 'seg', spec: specV1 as Record<string, unknown>, itemRevisao: t1 as string | undefined },
    ]
    const rodar = async (itens: typeof levaL) => {
      const saida: Array<{ itemId: string; r?: Awaited<ReturnType<typeof enfileirarPeca>>; erro?: unknown }> = []
      for (const i of itens) {
        try {
          saida.push({ itemId: i.itemId, r: await enfileirarPeca(i.spec, { lote: { loteId: L, itemId: i.itemId }, ...(i.itemRevisao ? { itemRevisao: i.itemRevisao } : {}) }) })
        } catch (erro) {
          saida.push({ itemId: i.itemId, erro })
        }
      }
      return saida
    }
    await rodar(levaL.slice(0, 1)) // a invocação acabou antes do item de plano
    expect(linha(L)).toBeUndefined()
    await editar({ copyProposta: COPY_V2 })
    expect(leitura()).not.toBe(t1)

    const repetida = await rodar(levaL)
    expect(repetida[0].r?.lote).toMatchObject({ desfecho: 'reaproveitado' })
    expect(repetida[1].erro).toMatchObject(vencida)
    expect(linha(L)).toMatchObject({ generationId: null, situacao: 'reservado', planoRevisao: t1 })
    expect(banco.generations.size).toBe(1)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'editado' })
    expect(banco.itensDePlano.get('item-1')?.generationId ?? null).toBeNull()
  })

  it('C11-1 (5a, a peça nova sai SEM lote): G1 do lote L falha, a copy é editada, G2 sai pela bancada e falha, e a leva L repetida com a chamada original é 409 sem escrever nada', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1)) // 1
    falhar(g1) // 2
    await editar({ copyProposta: COPY_V2 }) // 3
    const g2 = await enfileirarPeca(specV2) // 4
    expect(revisaoDoJob(g2.jobId)).not.toBe(t1)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: g2.generationId })
    falhar(g2) // 5a

    const antes = retrato()
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida) // 6
    expect(retrato()).toEqual(antes)
    expect(linha(L)).toMatchObject({ generationId: g1.generationId, planoRevisao: t1 })
    expect(banco.travas.size).toBe(0)
  })

  it('C11-1 (5a, por OUTRA chave, relida): a leva L vencida é 409 e as duas linhas ficam como estão; o controle — repetir L2 com a revisão nova — produz', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    falhar(g1)
    await editar({ copyProposta: COPY_V2 })
    const t2 = leitura()
    const g2 = await enfileirarPeca(specV2, chave(L2, t2))
    expect(linha(L2)).toMatchObject({ generationId: g2.generationId, planoRevisao: t2 })
    falhar(g2)

    const antes = retrato()
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida)
    expect(retrato()).toEqual(antes)

    const g3 = await enfileirarPeca(specV2, chave(L2, t2))
    expect(g3.generationId).not.toBe(g2.generationId)
    expect(g3.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(g3.jobId)).toMatchObject({ status: 'PENDING', generationId: g3.generationId, payload: { planoRevisao: t2 } })
    expect(linhasDoJob(g3.jobId)).toEqual([['Costela no bafo'], ['Vem pra cá']])
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: g3.generationId })
    expect(linha(L2)).toMatchObject({ generationId: g3.generationId, planoRevisao: t2, tentativas: 2 })
    expect(linha(L)).toMatchObject({ generationId: g1.generationId, planoRevisao: t1, tentativas: 1 })
  })

  it('a reserva ÓRFÃ de um item editado depois dela é 409 sem escrever nada; relida, outra reserva órfã é retomada', async () => {
    criarItem()
    const t1 = leitura()
    banco.falharJobs = 1
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toThrow('queda do banco ao criar o job')
    expect(linha(L)).toMatchObject({ generationId: null, situacao: 'reservado', planoRevisao: t1 })
    expect(banco.generations.size).toBe(0)

    await editar({ copyProposta: COPY_V2 })
    const antes = retrato()
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida)
    expect(retrato()).toEqual(antes)

    const t2 = leitura()
    banco.falharJobs = 1
    await expect(enfileirarPeca(specV2, chave(L2, t2))).rejects.toThrow('queda do banco ao criar o job')
    const r = await enfileirarPeca(specV2, chave(L2, t2))
    expect(r.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(linha(L2)).toMatchObject({ generationId: r.generationId, planoRevisao: t2 })
  })

  it('C11-1b: a recusa diz como sair, a mesma chamada continua recusada, e o caminho que ela indica (itemId NOVO com a revisão atual) produz — mesmo com o pedido IGUAL ao da peça de outra revisão, que a antiga linha 14 recusava', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    falhar(g1)
    await editar({ tema: 'Rodízio' }) // muda a revisão; a spec que o chat monta não muda
    const t2 = leitura()
    expect(t2).not.toBe(t1)

    const erro = await enfileirarPeca(specV1, chave(L, t1)).catch((e: unknown) => e)
    expect(erro).toMatchObject(vencida)
    expect((erro as Error).message).toContain('ver-plano')
    expect((erro as Error).message).toContain('itemId NOVO')
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida)

    const nova = await enfileirarPeca(specV1, chave(L, t2, 'seg-2'))
    expect(nova.generationId).not.toBe(g1.generationId)
    expect(banco.jobs.get(nova.jobId)).toMatchObject({ status: 'PENDING', generationId: nova.generationId, payload: { planoRevisao: t2 } })
    expect(linhasDoJob(nova.jobId)).toEqual(linhasDoJob(g1.jobId))
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: nova.generationId })
    expect(linha(L, 'seg-2')).toMatchObject({ generationId: nova.generationId, planoRevisao: t2 })
  })

  it('Ciro 13/09 — peça superada no plano pela TABELA: a peça do lote falhou, o item foi refeito com a copy editada e ficou pronto, e a leva antiga repetida é recusada como superada, com a arte atual e o próximo passo, sem escrever nada', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    falhar(g1)
    await editar({ copyProposta: COPY_V2 })
    const t2 = leitura()
    const g2 = await enfileirarPeca(specV2, chave(L, t2, 'seg-v2'))
    marcar('generations', g2.generationId, { status: 'COMPLETED', resultUrl: 'https://blob/v2.png', createdAt: new Date('2026-09-12T13:00:00.000Z') })
    marcar('jobs', g2.jobId, { status: 'DONE' })
    marcar('itensDePlano', 'item-1', { status: 'pronto', pageId: 'page-v2' })

    const antes = retrato()
    const erro = await enfileirarPeca(specV1, chave(L, t1)).catch((e: unknown) => e)
    expect(erro).toMatchObject({
      code: 'ITEM_EXECUCAO_CONCORRENTE',
      status: 409,
      details: { motivo: 'superada', arteAtualDoItem: { generationId: g2.generationId, pageId: 'page-v2', feitaEm: '2026-09-12T13:00:00.000Z', feitaEmBrasilia: '12/09/2026, 10:00', situacao: 'pronta' } },
    })
    expect((erro as Error).message).toContain('Conte à pessoa')
    expect((erro as Error).message).toContain('pergunte')
    expect((erro as Error).message).toContain('ver-plano')
    expect(retrato()).toEqual(antes)
  })

  it('Ciro 13/09 — peça superada no plano pela RESERVA: a repetição reaproveita a peça pronta deste pedido, mas o item já aponta outra arte (refeita pela bancada) — lote.superada diz qual, e nada muda', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    marcar('generations', g1.generationId, { status: 'COMPLETED', resultUrl: 'https://blob/v1.png' })
    marcar('jobs', g1.jobId, { status: 'DONE' })
    // O controle: sem outra arte no item, a repetição reaproveitada não avisa nada.
    expect((await enfileirarPeca(specV1, chave(L, t1))).lote).toEqual({ loteId: L, itemId: 'seg', desfecho: 'reaproveitado', situacao: 'pronta' })

    marcar('itensDePlano', 'item-1', { status: 'aprovado' }) // reaberto para refazer
    const g2 = await enfileirarPeca(specV2) // a bancada refaz, sem lote
    expect(g2.generationId).not.toBe(g1.generationId)
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'na-fila', generationId: g2.generationId })

    const antes = retrato()
    const r = await enfileirarPeca(specV1, chave(L, t1))
    expect(r).toMatchObject({ generationId: g1.generationId, lote: { desfecho: 'reaproveitado', situacao: 'pronta', superada: { generationId: g2.generationId, situacao: 'em produção', pageId: null } } })
    expect(retrato()).toEqual(antes)
  })

  it('C11-1b: a legenda não entra na revisão — a equipe muda só a legenda e a leva repetida retoma a peça pela MESMA chave', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    falhar(g1)
    await editar({ legenda: 'Hoje tem costela no bafo.' })
    expect(banco.itensDePlano.get('item-1')).toMatchObject({ status: 'editado', legenda: 'Hoje tem costela no bafo.' })
    expect(leitura()).toBe(t1)

    const g2 = await enfileirarPeca(specV1, chave(L, t1))
    expect(g2.generationId).not.toBe(g1.generationId)
    expect(g2.lote).toMatchObject({ desfecho: 'retomado', situacao: 'pendente' })
    expect(banco.jobs.get(g2.jobId)).toMatchObject({ status: 'PENDING', payload: { planoRevisao: t1 } })
  })

  it('a linha sem revisão gravada (anterior à coluna) não trava a chave: quem decide é a revisão da chamada', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    falhar(g1)
    const l = linha(L)!
    banco.itensDeLote.set(l.id as string, { ...l, planoRevisao: null })
    const g2 = await enfileirarPeca(specV1, chave(L, t1))
    expect(g2.generationId).not.toBe(g1.generationId)
    expect(linha(L)).toMatchObject({ generationId: g2.generationId, planoRevisao: t1 })
  })

  it('o vínculo grava a revisão DECLARADA: a chamada original adota a peça viva da bancada (reaproveitar não produz), mas não a refaz quando ela falha; relida com a revisão nova, a MESMA chave refaz', async () => {
    criarItem()
    const t1 = leitura()
    const g1 = await enfileirarPeca(specV1, chave(L, t1))
    falhar(g1)
    await editar({ tema: 'Rodízio' })
    const t2 = leitura()
    const g2 = await enfileirarPeca(specV1) // a bancada, sob a revisão nova, com o mesmo pedido
    expect(revisaoDoJob(g2.jobId)).toBe(t2)

    const adotada = await enfileirarPeca(specV1, chave(L, t1))
    expect(adotada).toMatchObject({ generationId: g2.generationId, jobId: g2.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pendente' } })
    expect(linha(L)).toMatchObject({ generationId: g2.generationId, jobId: g2.jobId, planoRevisao: t1 })

    falhar(g2)
    await expect(enfileirarPeca(specV1, chave(L, t1))).rejects.toMatchObject(vencida)
    const g3 = await enfileirarPeca(specV1, chave(L, t2))
    expect(g3.generationId).not.toBe(g2.generationId)
    expect(banco.jobs.get(g3.jobId)).toMatchObject({ status: 'PENDING', generationId: g3.generationId, payload: { planoRevisao: t2 } })
    expect(linha(L)).toMatchObject({ generationId: g3.generationId, planoRevisao: t2 })
  })

  it('o job é lido ANTES da Generation no caminho do plano: a peça que o runner fecha entre as duas leituras é reaproveitada, nunca refeita como "job terminado"', async () => {
    criarItem()
    const g = await enfileirarPeca(specV1)
    marcar('jobs', g.jobId, { status: 'RUNNING' })
    let terminou = false
    banco.aposLer = () => {
      if (terminou) return
      terminou = true
      // O runner: fecha a Generation e só depois o job.
      marcar('generations', g.generationId, { status: 'COMPLETED', resultUrl: 'https://blob/peca.png' })
      marcar('jobs', g.jobId, { status: 'DONE' })
    }
    const r = await enfileirarPeca(specV1)
    expect(terminou).toBe(true)
    expect(r).toMatchObject({ generationId: g.generationId, jobId: g.jobId })
    expect(banco.generations.size).toBe(1)
    expect(banco.jobs.size).toBe(1)
  })

  it('e na decisão sem trava da reserva: a repetição de uma peça que fica pronta entre as duas leituras é reaproveitada sem escrever nada (nem a pasta)', async () => {
    const r = await enfileirarPeca(peca(1), lote('seg-19h'))
    marcar('jobs', r.jobId, { status: 'RUNNING' })
    const pastas = banco.pastas
    let terminou = false
    banco.aposLer = () => {
      if (terminou) return
      terminou = true
      marcar('generations', r.generationId, { status: 'COMPLETED', resultUrl: 'https://blob/peca.png' })
      marcar('jobs', r.jobId, { status: 'DONE' })
    }
    const repetida = await enfileirarPeca(peca(1), lote('seg-19h'))
    expect(terminou).toBe(true)
    expect(repetida).toMatchObject({ generationId: r.generationId, jobId: r.jobId, lote: { desfecho: 'reaproveitado', situacao: 'pronta' } })
    expect(banco.pastas).toBe(pastas)
    expect(banco.generations.size).toBe(1)
  })
})
