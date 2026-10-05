import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VozCompacta } from '../voz'

/**
 * PR7-R9-01 e PR7-R9-02 (revisão final do Codex, 20/09/2026): a confirmação de
 * uma regra no DNA de texto e a MIGRAÇÃO para a voz decidem coisas opostas
 * sobre o mesmo cliente, e quem as serializava era um `FOR UPDATE` na linha de
 * `BrandVoice` — que pode NÃO EXISTIR. Aqui o banco em memória tem uma trava de
 * verdade na linha do `Project`: `$queryRaw` do lock só volta quando o dono
 * anterior fecha a transação. É isso que torna a intercalação observável.
 *
 * Os testes anteriores (`virar-regra-destino.test.ts`) SEMPRE começam com uma
 * voz gravada, inclusive o controle legado — por isso o defeito passou.
 */

const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Fala de dono de churrascaria: direto, caloroso.',
  tratamento: 'você',
  exemplos: ['Costela no bafo, doze horas de fogo baixo.'],
  antesDepois: [],
  termos: ['Costela no Bafo'],
  proibicoes: [],
  regras: [],
}

const estado = vi.hoisted(() => ({
  voz: null as null | { id: number; projectId: number; versao: number; voz: unknown; migradaEm: Date | null; dnaArquivado: unknown; updatedAt: Date },
  dna: null as null | Record<string, unknown>,
  /** A linha do tempo do que foi ESCRITO: é ela que denuncia a ordem inválida. */
  ordem: [] as string[],
  upserts: 0,
  projetoExiste: true,
  /** Roda DENTRO da transação, logo depois de a trava do projeto ser tomada. */
  aposATrava: null as null | (() => Promise<void> | void),
  /**
   * Roda ANTES de a linha do DNA ser escrita. É o ponto de intercalação que
   * existe COM e SEM a trava — por isso a mutação (tirar `travarProjeto`) muda
   * a ORDEM das escritas em vez de simplesmente não disparar o gancho.
   */
  antesDeGravarODna: null as null | (() => Promise<void> | void),
}))

vi.mock('@/lib/knowledge/entries', () => ({ criarEntradaBase: vi.fn() }))
vi.mock('@/lib/db', () => {
  // Fila de espera da linha do Project: cada transação espera a anterior soltar.
  let fila: Promise<void> = Promise.resolve()
  async function tomarATrava(): Promise<() => void> {
    const anterior = fila
    let liberar!: () => void
    fila = new Promise<void>((resolve) => { liberar = resolve })
    await anterior
    return liberar
  }

  const brandVoice = {
    findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => {
      if (!estado.voz) return null
      return select ? Object.fromEntries(Object.keys(select).map((k) => [k, (estado.voz as never)[k]])) : { ...estado.voz }
    }),
    create: vi.fn(async ({ data }: { data: { projectId: number; versao: number; voz: unknown } }) => {
      estado.voz = { id: 1, projectId: data.projectId, versao: data.versao, voz: data.voz, migradaEm: null, dnaArquivado: null, updatedAt: new Date() }
      estado.ordem.push('voz-criada')
      return { versao: data.versao }
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { versao?: number; migradaEm?: unknown }; data: { voz?: unknown; migradaEm?: Date; dnaArquivado?: unknown } }) => {
      const v = estado.voz
      if (!v) return { count: 0 }
      if (where.versao != null && v.versao !== where.versao) return { count: 0 }
      if (where.migradaEm === null && v.migradaEm !== null) return { count: 0 }
      if (data.migradaEm) { v.migradaEm = data.migradaEm; v.dnaArquivado = data.dnaArquivado; estado.ordem.push('migrou') }
      if (data.voz) { v.voz = data.voz; v.versao += 1 }
      return { count: 1 }
    }),
  }
  const brandDNA = {
    findUnique: vi.fn(async () => (estado.dna ? { ...estado.dna } : null)),
    upsert: vi.fn(async ({ update }: { update: Record<string, unknown> }) => {
      if (estado.antesDeGravarODna) { const gancho = estado.antesDeGravarODna; estado.antesDeGravarODna = null; await gancho() }
      estado.upserts += 1
      estado.dna = { ...(estado.dna ?? {}), ...update, updatedAt: new Date('2026-09-20T12:00:00.000Z') }
      estado.ordem.push('dna')
      return estado.dna
    }),
  }

  return {
    db: {
      brandVoice,
      brandDNA,
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => {
        const trava = { liberar: null as null | (() => void) }
        const tx = {
          brandVoice,
          brandDNA,
          $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
            if (!partes.join('?').includes('"Project"')) return []
            trava.liberar = await tomarATrava()
            if (estado.aposATrava) { const gancho = estado.aposATrava; estado.aposATrava = null; await gancho() }
            return estado.projetoExiste ? [{ id: valores[0] }] : []
          },
        }
        try { return await fn(tx) } finally { trava.liberar?.() }
      }),
    },
  }
})

const { virarRegra } = await import('../brand-context')
const { gravarVoz, migrarParaVoz } = await import('../voz-service')

const regra = 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo'
const motivo = 'o Ciro liberou para o evento'
const tick = () => new Promise((r) => setTimeout(r, 0))

async function codigoDe(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null } catch (e) { return (e as { code?: string }).code ?? String(e) }
}

describe('a trava que existe sempre: a linha do Project (PR7-R9-01/02)', () => {
  beforeEach(() => {
    estado.voz = null
    estado.dna = { projectId: 7, toneOfVoice: 'Direto.', contentRules: 'Nunca usar "Vem pro fogo".', updatedAt: new Date('2026-09-10T00:00:00.000Z') }
    estado.ordem = []
    estado.upserts = 0
    estado.projetoExiste = true
    estado.aposATrava = null
    estado.antesDeGravarODna = null
  })

  it('SEM voz: a voz é criada e migrada enquanto o DNA é confirmado — ordem serial válida, nunca DNA depois da migração', async () => {
    let migracao: Promise<unknown> = Promise.resolve()
    estado.antesDeGravarODna = async () => {
      // A outra execução: cria a voz (sem trava, como o serviço faz) e MIGRA.
      await gravarVoz({ projectId: 7, voz })
      migracao = migrarParaVoz({ projectId: 7, versaoEsperada: 1 })
      await tick()
      await tick()
    }

    const r = await virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', confirmado: true })
    await migracao

    expect(r.gravado).toBe(true)
    // Sem a trava, a migração termina DENTRO do gancho e a ordem sai invertida.
    expect(estado.ordem).toEqual(['voz-criada', 'dna', 'migrou'])
    expect(String(estado.dna!.contentRules)).toContain(regra)
    // A regra confirmada está no DNA que a migração arquivou: o DNA governava quando ela foi gravada.
    expect(String((estado.voz!.dnaArquivado as { contentRules: string }).contentRules)).toContain(regra)
  })

  it('SEM voz: a migração em curso SEGURA a confirmação, que relê e recusa em vez de gravar no DNA', async () => {
    await gravarVoz({ projectId: 7, voz })
    estado.ordem = []
    let confirmacao: Promise<string | null> = Promise.resolve(null)
    // A migração toma a trava primeiro; a confirmação chega com o ramo do DNA
    // já escolhido (ainda não migrado) e espera aqui.
    estado.aposATrava = async () => {
      confirmacao = codigoDe(virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', confirmado: true }))
      await tick()
      await tick()
    }

    await migrarParaVoz({ projectId: 7, versaoEsperada: 1 })
    const codigo = await confirmacao

    expect(codigo).toBe('REGRA_DESTINO_MUDOU')
    expect(estado.upserts).toBe(0)
    expect(estado.ordem).toEqual(['migrou'])
  })

  it('o snapshot arquivado é lido DENTRO da trava: traz o DNA vigente, campo a campo (PR7-R9-02)', async () => {
    estado.voz = { id: 1, projectId: 7, versao: 3, voz: structuredClone(voz), migradaEm: null, dnaArquivado: null, updatedAt: new Date() }
    let migracao: Promise<unknown> = Promise.resolve()
    estado.antesDeGravarODna = async () => {
      migracao = migrarParaVoz({ projectId: 7, versaoEsperada: 3 })
      await tick()
      await tick()
    }

    await virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', confirmado: true })
    await migracao

    expect(estado.ordem).toEqual(['dna', 'migrou'])
    const arquivado = estado.voz!.dnaArquivado as { arquivadoEm: string; toneOfVoice: string; contentRules: string; dnaAtualizadoEm: string }
    expect(Object.keys(arquivado).sort()).toEqual(['arquivadoEm', 'contentRules', 'dnaAtualizadoEm', 'toneOfVoice'])
    expect(arquivado.toneOfVoice).toBe('Direto.')
    expect(arquivado.contentRules).toBe(estado.dna!.contentRules)
    expect(arquivado.contentRules).toContain(regra)
    expect(arquivado.dnaAtualizadoEm).toBe('2026-09-20T12:00:00.000Z')
    expect(Number.isNaN(Date.parse(arquivado.arquivadoEm))).toBe(false)
  })

  it('projeto inexistente: a trava não travou nada, então nada é gravado', async () => {
    estado.projetoExiste = false

    const codigo = await codigoDe(virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', confirmado: true }))

    expect(codigo).toBe('PROJECT_NOT_FOUND')
    expect(estado.upserts).toBe(0)
    expect(await codigoDe(migrarParaVoz({ projectId: 7, versaoEsperada: 1 }))).toBe('PROJECT_NOT_FOUND')
  })
})
