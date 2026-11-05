/**
 * G4.2 — o EMISSOR da marca de imagem: o `useGerarCriativoFinalize` REAL (TanStack Query real, host sem DOM) manda
 * `previaDeImagem: 'imagem-v1'` em todo envio do CanvasPreview, sem depender de quem chama. Dublê: só o `api-client`,
 * para ver o corpo que sairia na rede. Não prova o clique no navegador.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

const envios = vi.hoisted(() => [] as Array<{ url: string; corpo: Record<string, unknown> }>)
vi.mock('@/lib/api-client', () => ({
  api: {
    post: async (url: string, corpo: Record<string, unknown>) => {
      envios.push({ url, corpo: JSON.parse(JSON.stringify(corpo)) })
      return { success: true, id: 'g1', pageId: 'nova', resultUrl: 'https://blob.test/c.png' }
    },
  },
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useGerarCriativoFinalize } from '@/hooks/use-gerar-criativo-finalize'
import { emAct, montar } from '@/lib/grades/__tests__/suporte/host-sem-dom'

const sonda: { finalize: ReturnType<typeof useGerarCriativoFinalize> | null } = { finalize: null }
function Sonda() {
  sonda.finalize = useGerarCriativoFinalize()
  return null
}
let desmontar: (() => Promise<void>) | null = null
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  envios.length = 0
})

describe('emissor da marca de imagem (G4.2)', () => {
  it('o envio leva previaDeImagem imagem-v1 junto da marca do vetor e das camadas como vieram', async () => {
    const m = await montar(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(Sonda)))
    desmontar = m.desmontar
    const camada = { id: 'c0', type: 'image', name: 'Grade · foto 1', metadata: { grade: { id: 'g1' }, groupId: 'g1' } }
    await emAct(async () => {
      await sonda.finalize!.mutateAsync({
        templateId: 5, templatePageId: 'pg1', dataUrl: 'data:image/png;base64,aGVsbG8=', images: {}, texts: {},
        layers: [camada] as never, hiddenLayerIds: [], previa: 'vetor-v1',
      })
    })
    expect(envios).toHaveLength(1)
    expect(envios[0].url).toBe('/api/gerar-criativo/finalize')
    expect(envios[0].corpo).toMatchObject({ previa: 'vetor-v1', previaDeImagem: 'imagem-v1', layers: [camada] })
  })
})
