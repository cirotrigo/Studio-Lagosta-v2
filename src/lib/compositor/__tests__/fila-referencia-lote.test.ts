/**
 * F1 — a referência do cliente na LEVA idempotente (rodada 2 do Codex): a chave da reserva é o pedido como veio
 * (`{ id: 'ref-…' }`), a repetição de uma peça viva reaproveita SEM resolver, a retomada reproduz a spec GRAVADA na
 * Generation que a linha aponta (a resolução original, mesmo revogada depois), e só o criar resolve — como pedido
 * novo (revogada é recusa, nada criado). A reserva é fingida: o que se prova é o contrato que a fila lhe entrega.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import brunch from '../arquetipos/__tests__/suporte/emporio-ref02-brunch.json'

const db = {
  project: { findUnique: vi.fn(async () => ({ id: 12, name: 'Empório', userId: 'dono' })) },
  generation: { findUnique: vi.fn(), create: vi.fn(async (_a: any) => ({ id: 'gen-nova' })) },
  referenciaDeLayout: { findMany: vi.fn() },
}
vi.mock('@/lib/db', () => ({ db }))
const reservar = vi.fn()
vi.mock('@/lib/lotes/reserva', () => ({ reservarItemDeLote: (e: unknown) => reservar(e) }))
const enfileirarComposicao = vi.fn(async (_args: any, _tx: unknown) => 'job-novo')
vi.mock('@/lib/ai/generation-queue', async (orig) => ({ ...(await orig<Record<string, unknown>>()), enfileirarComposicao: (a: unknown, tx: unknown) => enfileirarComposicao(a, tx) }))
vi.mock('../pastas', () => ({ garantirPasta: async () => ({ id: 1, name: 'Pasta' }) }))

const { enfileirarPeca } = await import('../fila')
const { compilarReferencia } = await import('../arquetipos/referencia')
const { impressaoDoArquetipo } = await import('../arquetipos/impressao')

const PAGINA = brunch as unknown as { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const def = (versao: number) => {
  const r = compilarReferencia(PAGINA, { pageVersion: `v1:p${versao}`, versao })
  if (!r.ok) throw new Error('fixture')
  return r.definicao
}
const linha = (versao: number, revogada = false) => ({ arquetipoId: def(versao).id, versao, impressao: impressaoDoArquetipo(def(versao)), definicao: def(versao), revogadaEm: revogada ? new Date() : null })
const pedido = { projectId: 12, formato: 'story', foto: { driveFileId: 'x' }, arquetipo: { id: def(1).id }, blocos: [{ papel: 'headline', linhas: ['Café da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }] }
const lote = { loteId: 'leva-1', itemId: 'item-1' }
const resolvidaComo = (versao: number) => ({ id: def(versao).id, versao, impressao: impressaoDoArquetipo(def(versao)) })
/** O banco finge: `findMany` filtra `revogadaEm: null` como o Prisma faria. */
const banco = (...linhas: ReturnType<typeof linha>[]) => db.referenciaDeLayout.findMany.mockImplementation(async ({ where }: { where: { revogadaEm?: null } }) => (where.revogadaEm === null ? linhas.filter((l) => !l.revogadaEm) : linhas))

beforeEach(() => {
  vi.clearAllMocks()
  db.generation.create.mockResolvedValue({ id: 'gen-nova' })
})

describe('a referência na leva', () => {
  it('cria: a chave da reserva é o pedido COMO VEIO ({ id }), e a Generation nasce com a revisão vigente resolvida', async () => {
    banco(linha(1))
    reservar.mockImplementation(async (e) => {
      const c = await e.criar(db, { recuperacao: null })
      return { ...c, loteId: 'leva-1', itemId: 'item-1', desfecho: 'criado', situacao: 'pendente' }
    })
    const r = await enfileirarPeca(pedido, { lote })
    expect(reservar.mock.calls[0][0].payload.arquetipo).toEqual({ id: def(1).id })
    expect(db.generation.create.mock.calls[0][0].data.fieldValues.spec.arquetipo).toEqual(resolvidaComo(1))
    expect(r.spec.arquetipo).toEqual(resolvidaComo(1))
    expect(r.lote?.desfecho).toBe('criado')
  })

  it('repetição com a peça viva reaproveita SEM resolver (revisão nova ou revogada no meio não importa) e responde a spec gravada', async () => {
    banco(linha(1, true), linha(2))
    db.generation.findUnique.mockResolvedValue({ fieldValues: { spec: { ...pedido, arquetipo: resolvidaComo(1) } } })
    reservar.mockResolvedValue({ generationId: 'gen-1', jobId: 'job-1', loteId: 'leva-1', itemId: 'item-1', desfecho: 'reaproveitado', situacao: 'pendente' })
    const r = await enfileirarPeca(pedido, { lote })
    expect(db.referenciaDeLayout.findMany).not.toHaveBeenCalled()
    expect(r.generationId).toBe('gen-1')
    expect(r.spec.arquetipo).toEqual(resolvidaComo(1))
  })

  it('retomada (Generation falhou ou ficou sem job) REPRODUZ a spec gravada — a v1 original, mesmo revogada', async () => {
    banco(linha(1, true), linha(2))
    db.generation.findUnique.mockResolvedValue({ fieldValues: { spec: { ...pedido, arquetipo: resolvidaComo(1) } } })
    reservar.mockImplementation(async (e) => {
      const c = await e.criar(db, { recuperacao: { falta: 'geracao-e-job', generationId: 'gen-morta' } })
      return { ...c, loteId: 'leva-1', itemId: 'item-1', desfecho: 'retomado', situacao: 'pendente' }
    })
    const r = await enfileirarPeca(pedido, { lote })
    expect(db.generation.create.mock.calls[0][0].data.fieldValues.spec.arquetipo).toEqual(resolvidaComo(1))
    expect(r.spec.arquetipo).toEqual(resolvidaComo(1))
    expect(db.referenciaDeLayout.findMany).not.toHaveBeenCalled()
    // Só o job: idem, pela spec da Generation que ficou sem ele.
    reservar.mockImplementation(async (e) => ({ generationId: 'gen-sem-job', jobId: await e.criarJob(db, 'gen-sem-job'), loteId: 'leva-1', itemId: 'item-1', desfecho: 'retomado', situacao: 'pendente' }))
    const r2 = await enfileirarPeca(pedido, { lote })
    expect(enfileirarComposicao.mock.calls[enfileirarComposicao.mock.calls.length - 1][0].spec.arquetipo).toEqual(resolvidaComo(1))
    expect(r2.spec.arquetipo).toEqual(resolvidaComo(1))
  })

  it('retomada sem spec gravada (Generation sumiu) resolve como pedido NOVO: revogada é recusa e nada é criado', async () => {
    banco(linha(1, true))
    db.generation.findUnique.mockResolvedValue(null)
    reservar.mockImplementation(async (e) => {
      const c = await e.criar(db, { recuperacao: { falta: 'geracao-e-job', generationId: 'gen-sumida' } })
      return { ...c, loteId: 'leva-1', itemId: 'item-1', desfecho: 'retomado', situacao: 'pendente' }
    })
    const e = await enfileirarPeca(pedido, { lote }).catch((x) => x)
    expect(e).toBeInstanceOf(CreativeError)
    expect((e as CreativeError).code).toBe('ARQUETIPO_DESCONHECIDO')
    expect(db.generation.create).not.toHaveBeenCalled()
    // Com a v2 vigente, a peça nova nasce dela (é o que o pedido `{ id }` quer dizer hoje).
    banco(linha(1, true), linha(2))
    const r = await enfileirarPeca(pedido, { lote })
    expect(db.generation.create.mock.calls[0][0].data.fieldValues.spec.arquetipo).toEqual(resolvidaComo(2))
    expect(r.spec.arquetipo).toEqual(resolvidaComo(2))
  })

  it('sem identidade de lote, a referência resolve na porta como sempre (revogada é recusa na hora)', async () => {
    banco(linha(1, true))
    const e = await enfileirarPeca(pedido).catch((x) => x)
    expect((e as CreativeError).code).toBe('ARQUETIPO_DESCONHECIDO')
    expect(reservar).not.toHaveBeenCalled()
  })
})
