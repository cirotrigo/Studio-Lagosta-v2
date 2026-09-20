import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VozCompacta } from '../voz'

/**
 * PR7-FINAL-01 (revisão final do Codex, 18/09/2026): a proposta de "virar
 * regra" nasceu na VOZ (substitui + versaoDaVoz) e a migração foi desfeita
 * antes da confirmação — o ramo legado acrescentava a regra ao DNA, outra
 * operação que a aprovada. E o estado da migração pode mudar ENTRE a escolha
 * do ramo e a escrita, nos dois sentidos. Banco em memória: a lógica real de
 * `virarRegra` / `virarRegraNaVoz` / `gravarVoz` roda inteira.
 */

const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Fala de dono de churrascaria: direto, caloroso.',
  tratamento: 'você',
  exemplos: ['Costela no bafo, doze horas de fogo baixo.'],
  antesDepois: [],
  termos: ['Costela no Bafo'],
  proibicoes: [],
  regras: [{ id: 'regra-2026-09-06-1', texto: 'Nunca usar "Vem pro fogo" como CTA', motivo: 'o Ciro reprovou', em: '2026-09-06', escopo: 'copy', ativa: true }],
}

const estado = vi.hoisted(() => ({
  voz: null as null | { id: number; projectId: number; versao: number; voz: unknown; migradaEm: Date | null; dnaArquivado: unknown; updatedAt: Date },
  dna: null as null | Record<string, unknown>,
  upserts: 0,
  vozUpdates: 0,
  /** Gancho de corrida: roda antes da próxima leitura/escrita marcada. */
  antesDoLerRegistro: null as null | (() => void),
  antesDaTrava: null as null | (() => void),
  antesDoUpdateDaVoz: null as null | (() => void),
}))

vi.mock('@/lib/knowledge/entries', () => ({ criarEntradaBase: vi.fn() }))
vi.mock('@/lib/db', () => {
  let leiturasDaVoz = 0
  const brandVoice = {
    findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => {
      leiturasDaVoz += 1
      // A 2ª leitura é a de `lerRegistroDaVoz` (a 1ª é a escolha do ramo em virarRegra).
      if (leiturasDaVoz === 2 && estado.antesDoLerRegistro) { estado.antesDoLerRegistro(); estado.antesDoLerRegistro = null }
      if (!estado.voz) return null
      return select ? Object.fromEntries(Object.keys(select).map((k) => [k, (estado.voz as never)[k]])) : { ...estado.voz }
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { versao: number; migradaEm?: { not: null } }; data: { voz: unknown } }) => {
      if (estado.antesDoUpdateDaVoz) { estado.antesDoUpdateDaVoz(); estado.antesDoUpdateDaVoz = null }
      const v = estado.voz
      if (!v || v.versao !== where.versao) return { count: 0 }
      if (where.migradaEm && v.migradaEm === null) return { count: 0 }
      v.voz = data.voz; v.versao += 1; estado.vozUpdates += 1
      return { count: 1 }
    }),
  }
  const brandDNA = {
    findUnique: vi.fn(async () => (estado.dna ? { ...estado.dna } : null)),
    upsert: vi.fn(async ({ update }: { update: Record<string, unknown> }) => { estado.upserts += 1; estado.dna = { ...(estado.dna ?? {}), ...update }; return estado.dna }),
  }
  const tx = {
    brandDNA,
    brandVoice,
    // A trava é a linha do PROJECT (PR7-R9-01): ela existe mesmo sem voz. O
    // estado da migração é RELIDO depois dela, por `tx.brandVoice`.
    $queryRaw: vi.fn(async () => {
      if (estado.antesDaTrava) { estado.antesDaTrava(); estado.antesDaTrava = null }
      return [{ id: 7 }]
    }),
  }
  return {
    db: {
      brandVoice,
      brandDNA,
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __zerar: () => { leiturasDaVoz = 0 },
    },
  }
})

const { db } = (await import('@/lib/db')) as unknown as { db: { __zerar: () => void } }
const { virarRegra } = await import('../brand-context')

const regra = 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo'
const motivo = 'o Ciro liberou para o evento'

function migrado(migradaEm: Date | null) {
  estado.voz = { id: 1, projectId: 7, versao: 3, voz: structuredClone(voz), migradaEm, dnaArquivado: null, updatedAt: new Date() }
}

async function codigoDe(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null } catch (e) { return (e as { code?: string }).code ?? String(e) }
}

describe('virar regra: a confirmação não troca de destino no meio do caminho (PR7-FINAL-01)', () => {
  beforeEach(() => {
    db.__zerar()
    estado.dna = { projectId: 7, toneOfVoice: 'Direto.', contentRules: 'Nunca usar "Vem pro fogo".' }
    estado.upserts = 0; estado.vozUpdates = 0
    estado.antesDoLerRegistro = null; estado.antesDaTrava = null; estado.antesDoUpdateDaVoz = null
  })

  it('prévia na voz → migração desfeita → confirmação com substitui e versaoDaVoz é RECUSADA, sem tocar DNA nem voz', async () => {
    migrado(new Date('2026-09-12'))
    const previa = await virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', escopo: 'copy', substitui: 'regra-2026-09-06-1' })
    expect(previa.destino).toBe('voz')
    estado.voz!.migradaEm = null // desfazerMigracao
    db.__zerar()
    const dnaAntes = JSON.stringify(estado.dna)
    const codigo = await codigoDe(virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', escopo: 'copy', substitui: 'regra-2026-09-06-1', versaoDaVoz: (previa as { versaoLida: number }).versaoLida, confirmado: true }))
    expect(codigo).toBe('REGRA_DESTINO_MUDOU')
    expect(estado.upserts).toBe(0)
    expect(JSON.stringify(estado.dna)).toBe(dnaAntes)
    expect(estado.vozUpdates).toBe(0)
  })

  it('migração desfeita ENTRE a escolha do ramo da voz e a leitura do registro: recusa, nada gravado', async () => {
    migrado(new Date('2026-09-12'))
    estado.antesDoLerRegistro = () => { estado.voz!.migradaEm = null }
    const codigo = await codigoDe(virarRegra({ projectId: 7, regra, motivo, escopo: 'copy', substitui: 'regra-2026-09-06-1', versaoDaVoz: 3, confirmado: true }))
    expect(codigo).toBe('REGRA_DESTINO_MUDOU')
    expect(estado.vozUpdates).toBe(0)
    expect(estado.upserts).toBe(0)
  })

  it('migração desfeita ENTRE a leitura e a escrita da voz: o CAS exige migrada e recusa', async () => {
    migrado(new Date('2026-09-12'))
    estado.antesDoUpdateDaVoz = () => { estado.voz!.migradaEm = null }
    const codigo = await codigoDe(virarRegra({ projectId: 7, regra, motivo, escopo: 'copy', substitui: 'regra-2026-09-06-1', versaoDaVoz: 3, confirmado: true }))
    expect(codigo).toBe('REGRA_DESTINO_MUDOU')
    expect(estado.vozUpdates).toBe(0)
    expect(estado.upserts).toBe(0)
  })

  it('migração LIGADA entre a escolha do ramo do DNA e a escrita: a trava da transação recusa', async () => {
    migrado(null)
    estado.antesDaTrava = () => { estado.voz!.migradaEm = new Date('2026-09-18') }
    const codigo = await codigoDe(virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', confirmado: true }))
    expect(codigo).toBe('REGRA_DESTINO_MUDOU')
    expect(estado.upserts).toBe(0)
  })

  it('controle: cliente não migrado, confirmação legítima do DNA, grava como sempre', async () => {
    migrado(null)
    const r = await virarRegra({ projectId: 7, regra, motivo, secao: 'contentRules', confirmado: true })
    expect(r.destino).toBe('dna')
    expect(estado.upserts).toBe(1)
    expect(String(estado.dna!.contentRules)).toContain(regra)
  })

  it('controle: cliente migrado, confirmação com a versão da prévia grava na voz', async () => {
    migrado(new Date('2026-09-12'))
    const r = await virarRegra({ projectId: 7, regra, motivo, escopo: 'copy', substitui: 'regra-2026-09-06-1', versaoDaVoz: 3, confirmado: true })
    expect(r.destino).toBe('voz')
    expect(estado.vozUpdates).toBe(1)
    expect(estado.upserts).toBe(0)
  })
})
