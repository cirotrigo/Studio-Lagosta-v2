/**
 * PR #238, revisão R2 do Codex (18/10/2026): com as fontes padrão incompletas, `familiasNaoCarregadas` já recusava
 * a medida, mas os OUTROS dois que perguntam "a fonte está no servidor?" seguiam só no registro do napi-rs: o
 * predicado do `medirCopyDoProjeto` e a conferência de fontes do revisor (`fontesQueFaltam`, que vira
 * `fontesAusentes` → regra `fonte-nao-carregada` do gate). Os três leem agora o mesmo estado
 * (`fontes-padrao-estado`): incompleto = nenhuma família conta como presente.
 *
 * O addon é o REAL (a Montserrat empacotada registra de verdade); o estado é marcado como o `garantirFontesPadrao`
 * marca. `vi.resetModules` dá a cada teste um estado novo.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'

vi.mock('@/lib/db', () => ({ db: {} }))

const texto = (id: string, fontFamily: string): Layer =>
  ({ id, name: id, type: 'text', visible: true, locked: false, order: 1, content: 'ALMOÇO', position: { x: 92, y: 300 }, size: { width: 896, height: 100 }, style: { fontSize: 60, fontFamily } }) as Layer

async function consumidores(estado: 'completo' | 'incompleto' | 'nao-tentado') {
  vi.resetModules()
  const { garantirFontesPadrao } = await import('@/lib/canvas-renderer')
  expect(garantirFontesPadrao().completo).toBe(true) // o registro real, neste processo, completa
  const { marcarFontesPadrao } = await import('@/lib/fontes-padrao-estado')
  if (estado !== 'completo') marcarFontesPadrao(false)
  const { predicadoDeFonteCarregada } = await import('@/lib/compositor/medir-copy-service')
  const { fontesQueFaltam } = await import('@/lib/creatives/revisao/revisar-arte')
  return { carregada: await predicadoDeFonteCarregada(), fontesQueFaltam }
}

describe('fontes padrão incompletas: medir-copy e a conferência do revisor/gate recusam como familiasNaoCarregadas', () => {
  it('completas: Montserrat está carregada para o medir-copy e não falta para o revisor', async () => {
    const { carregada, fontesQueFaltam } = await consumidores('completo')
    expect(carregada('Montserrat')).toBe(true)
    expect(await fontesQueFaltam([texto('t1', 'Montserrat'), texto('t2', 'sans-serif'), texto('t3', '')])).toEqual([])
  })

  it('incompletas: nenhuma família conta como carregada no medir-copy e TODA família pedida falta para o revisor', async () => {
    const { carregada, fontesQueFaltam } = await consumidores('incompleto')
    expect(carregada('Montserrat')).toBe(false)
    expect(carregada('sans-serif')).toBe(false)
    const faltas = await fontesQueFaltam([texto('t1', 'Montserrat'), texto('t2', 'sans-serif'), texto('t3', '')])
    // A genérica e a camada sem família desenham no fallback padrão — o que está incompleto.
    expect(faltas.map((f) => ({ familia: f.familia, camadas: f.camadas }))).toEqual([
      { familia: 'Montserrat', camadas: ['t1'] },
      { familia: 'sans-serif', camadas: ['t2', 't3'] },
    ])
  })
})
