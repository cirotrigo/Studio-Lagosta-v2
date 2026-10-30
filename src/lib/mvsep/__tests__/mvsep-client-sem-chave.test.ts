import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { update } = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { musicStemJob: { update } } }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))

import { checkMvsepJobStatus, startStemSeparation } from '../mvsep-client'

describe('MVSEP sem MVSEP_API_KEY', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('MVSEP_API_KEY', '')
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    update.mockReset()
    fetchMock.mockReset()
  })

  it('não inicia a separação: o job continua pendente e nada é chamado', async () => {
    await startStemSeparation({ id: 'j1', musicId: 1, music: { blobUrl: 'https://x' } } as any)
    expect(update).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('não consulta o status: o job em andamento fica como está', async () => {
    await checkMvsepJobStatus({ id: 'j1', mvsepJobHash: 'h' } as any)
    expect(update).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('com a chave, segue para o MVSEP (controle)', async () => {
    vi.stubEnv('MVSEP_API_KEY', 'chave-de-teste')
    fetchMock.mockResolvedValue(new Response('{}'))
    await checkMvsepJobStatus({ id: 'j1', mvsepJobHash: 'h' } as any)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
