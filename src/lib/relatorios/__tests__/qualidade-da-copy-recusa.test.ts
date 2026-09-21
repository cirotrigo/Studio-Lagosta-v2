/**
 * PR15-04 da revisão final do Codex (18/09/2026): a recusa do compositor, do
 * jeito que o PRODUTOR de hoje a grava. `registrarRecusa` (recompor.ts) põe a
 * recusa em `fieldValues.recusaDaRecomposicao` desde C6-01 e deixa
 * `recomposicao` como o registro do último render; a métrica lia só
 * `recomposicao.estado === 'recusada'` e a recusa atual não entrava em
 * `correcoes.compositor`. Aqui a recusa sai da função REAL (o banco é o dublê
 * do harness de `copy-visual-regravada-marcador.test.ts`: o merge do jsonb é
 * capturado e aplicado como o Postgres o aplicaria) e vai à medida como o
 * serviço a projeta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ sql: [] as Array<{ sql: string; valores: unknown[] }> }))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    postLog: { create: async ({ data }: { data: Record<string, any> }) => data },
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push({ sql: partes.join('?'), valores })
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test', renderPageAndRegister: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: vi.fn() }))
vi.mock('@/lib/ai/generation-queue', () => ({ marcarForcaAtendida: vi.fn(), marcarForcaEmExecucao: vi.fn(), marcarRenderComoEsta: vi.fn(), pedirNovaTentativa: vi.fn() }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))

import { registrarRecusa } from '@/lib/compositor/recompor'
import { CreativeError } from '@/lib/creatives/errors'
import { medirPeca, montarPecas, type ArteLida } from '../qualidade-da-copy-contrato'

const original = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', em: '2026-09-08T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia', 'de churrasco'] },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] },
  ],
  revisoes: [],
}

/** O `fieldValues` depois do merge raso que o Postgres faz (`||` do jsonb). */
async function fieldValuesDepoisDaRecusa(antes: Record<string, unknown>, code: string): Promise<Record<string, unknown>> {
  await registrarRecusa({ pageId: 'p', generationId: 'g1', postIds: [], erro: new CreativeError(code, 'A linha não cabe na coluna.', 422) })
  const merge = banco.sql.find((q) => q.sql.includes('||'))!
  expect(merge.valores.at(-1)).toBe('g1')
  return { ...antes, ...(JSON.parse(String(merge.valores[0])) as Record<string, unknown>) }
}

/** A arte como `lerSemanaDoCliente` a projeta de `fieldValues`. */
function arteLida(fv: Record<string, unknown>): ArteLida {
  return {
    id: 'g1',
    pageId: 'p',
    resultUrl: 'u1',
    createdAt: '2026-09-08T10:00:00.000Z',
    source: 'compositor',
    canal: null,
    copyAutoral: fv.copyAutoral ?? null,
    revisao: null,
    ajustes: null,
    avisos: [],
    recomposicao: fv.recomposicao ?? null,
    recusaDaRecomposicao: fv.recusaDaRecomposicao ?? null,
    vozNaEscrita: null,
  }
}

function compositorDa(fv: Record<string, unknown>, congelado = false): number {
  const situacao = congelado ? { status: 'POSTED', laterPostId: 'zernio-1' } : { status: 'SCHEDULED', laterPostId: null }
  const [peca] = montarPecas({
    posts: [{ id: 'slide', pageId: null, generationId: 'g1', createdAt: '2026-09-08T12:00:00.000Z', mediaUrls: ['u1'], ...situacao, slotValues: null }],
    artes: [arteLida(fv)],
    paginas: [{ id: 'p', copyAutoral: original, layers: '[]' }],
    itens: [],
    sinais: [],
  })
  return medirPeca(peca).correcoes.compositor
}

beforeEach(() => {
  banco.sql.length = 0
})

describe('PR15-04 · a recusa gravada por `registrarRecusa` entra em correcoes.compositor', () => {
  const RE_RENDER = { estado: 're-renderizada', em: '2026-09-08T10:30:00.000Z', copyVisualRegravada: true, urlsAnteriores: [] }

  it('TEXTO_NAO_CABE_NA_COLUNA depois de um re-render: uma recusa do compositor', async () => {
    const fv = await fieldValuesDepoisDaRecusa({ copyAutoral: { original, efetiva: original, comparavel: true }, recomposicao: RE_RENDER }, 'TEXTO_NAO_CABE_NA_COLUNA')
    // O produtor não toca o registro do render (C6-01) — a recusa mora na chave própria.
    expect(fv.recomposicao).toEqual(RE_RENDER)
    expect(compositorDa(fv)).toBe(1)
  })

  it('a recusa antiga (`recomposicao.estado: recusada`) que continua na arte conta junto — uma vez, não duas', async () => {
    const legado = { estado: 'recusada', errorCode: 'TEXTO_NAO_CABE_NA_COLUNA', em: '2026-09-01T10:00:00.000Z' }
    expect(compositorDa({ copyAutoral: { original, efetiva: original, comparavel: true }, recomposicao: legado })).toBe(1)
    const fv = await fieldValuesDepoisDaRecusa({ copyAutoral: { original, efetiva: original, comparavel: true }, recomposicao: legado }, 'TEXTO_NAO_CABE_NA_COLUNA')
    expect(compositorDa(fv)).toBe(1)
  })

  it('PR15-07 · a recusa que o produtor grava DEPOIS do PNG publicado não entra no congelado; no vivo, entra', async () => {
    // `registrarRecusa` data a recusa com o relógio; o PNG publicado é o do re-render das 10h30.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-08T11:00:00.000Z'))
    try {
      const fv = await fieldValuesDepoisDaRecusa({ copyAutoral: { original, efetiva: original, comparavel: true }, recomposicao: RE_RENDER }, 'TEXTO_NAO_CABE_NA_COLUNA')
      expect((fv.recusaDaRecomposicao as { em: string }).em).toBe('2026-09-08T11:00:00.000Z')
      expect(compositorDa(fv, true)).toBe(0)
      expect(compositorDa(fv)).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recusa que não é de texto (a página mudou durante) não é correção do compositor', async () => {
    const fv = await fieldValuesDepoisDaRecusa({ copyAutoral: { original, efetiva: original, comparavel: true }, recomposicao: RE_RENDER }, 'PAGINA_MUDOU_DURANTE')
    expect(compositorDa(fv)).toBe(0)
  })
})
