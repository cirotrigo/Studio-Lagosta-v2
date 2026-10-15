/**
 * CP4 — o EXECUTOR com a medida INJETADA (`_medir`): a catraca das tolerâncias (cada candidata também é comparada
 * com o estado de ENTRADA), o lote só de recusas estruturais que não mede nada, o autofix dito no aplicado e o
 * `TEXTO_NAO_CABE` por ajuste. O banco e o autofix são falsos; a medida é uma função das camadas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const autofix = vi.hoisted(() => ({ modo: 'identidade' as 'identidade' | 'encolhe' | 'nao-cabe' }))
vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ assinatura: null, textAutofixEnabled: true }) },
    generation: { findMany: async () => [] },
    page: { findUnique: async () => null },
  },
}))
vi.mock('@/lib/creatives/text-autofix', () => ({
  aplicarAutofixOuFalhar: async (a: { layers: Array<Record<string, any>> }) => {
    if (autofix.modo === 'nao-cabe') {
      const { CreativeError } = await import('@/lib/creatives/errors')
      throw new CreativeError('TEXTO_NAO_CABE', 'a manchete não cabe', 422)
    }
    if (autofix.modo === 'encolhe') {
      return {
        layers: a.layers.map((l) => (l.id === 'headline' ? { ...l, style: { ...l.style, fontSize: 60 } } : l)),
        autocorrecao: { necessaria: true, aplicada: true, iteracoes: 1, ajustes: [{ camada: 'headline', layerId: 'headline', propriedade: 'fontSize', de: 84, para: 60, motivo: 'colisão' }], pendencias: [] },
        avisos: [],
      }
    }
    return { layers: a.layers, autocorrecao: { necessaria: false, aplicada: false, iteracoes: 0, ajustes: [], pendencias: [] }, avisos: [] }
  },
}))

import type { Layer } from '@/types/template'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import type { Ajuste, RelatorioDaRevisao } from '../contrato'
import { aplicarAjustesSemPiorar } from '../ajustar-sem-piorar'
import type { MedidaComparavel } from '../nao-piora'

const CANVAS = { width: 1080, height: 1920 }
const texto = (id: string, y: number): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 1, content: id, position: { x: 92, y }, size: { width: 896, height: 100 }, style: { fontSize: 84 } }) as Layer
const page = { id: 'p', name: 'Peça', width: 1080, height: 1920, tags: ['story'], background: '#FFFFFF', layers: '[]' }
const cobertura = Object.fromEntries(
  ['fonte-nao-carregada', 'texto-cortado', 'tinta-fora-da-caixa', 'colisao', 'fora-da-area-segura', 'logo-sobre-texto', 'logo-sem-leitura', 'texto-sem-leitura', 'gradiente-forte-demais', 'titulo-grande', 'entrelinha-grande', 'texto-pequeno', 'palavra-orfa', 'texto-sobre-assunto', 'tratamento-piorou-leitura'].map((r) => [r, { estado: 'avaliada' }]),
) as RelatorioDaRevisao['cobertura']
const relatorio: RelatorioDaRevisao = { versaoDasRegras: 'revisao-v1', achados: [], ajustes: [], cobertura: { ...cobertura, visao: { estado: 'nao-avaliada', motivo: 'sem visão' } }, resumo: 'sintético' }

/** A leitura do serviço piora 0,15 por px subido: 10 px = 1,5 (dentro da tolerância 2 por passo), 30 px = 4,5 (fora). */
const medidaSintetica = async (camadas: Layer[]): Promise<MedidaComparavel> => {
  const servico = camadas.find((l) => l.id === 'servico')!
  const com = 140 + (1700 - servico.position.y) * 0.15
  const contraste: ContrasteMedido[] = [
    { grupo: 'g', camadas: ['servico'], sentido: 'claro', alvo: 139, p98SemHalo: 200, p98ComHalo: com, tinta: 0.5, tintaCorrigida: null, gradiente: null, ok: false, textos: [{ camada: 'servico', sentido: 'claro', alvo: 139, p98SemHalo: 200, p98ComHalo: com, ok: false }] } as ContrasteMedido,
  ]
  return { relatorio, contraste, camadas, canvas: CANVAS }
}
const medicoes: Layer[][] = []
const medir = async (camadas: Layer[]) => {
  medicoes.push(camadas)
  return medidaSintetica(camadas)
}
const sobe = (dy: number): Ajuste => ({ tipo: 'mover', camadas: ['servico'], dy: -dy }) as Ajuste
const base = () => [texto('headline', 200), texto('servico', 1700)]

beforeEach(() => {
  autofix.modo = 'identidade'
  medicoes.length = 0
})

describe('o executor (medida injetada)', () => {
  it('a CATRACA: três passos de 10 px, cada um "dentro do ruído" contra o passo anterior — o 2º já é recusado contra o estado de ENTRADA (revisores A e C)', async () => {
    const r = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas: base(), ajustes: [sobe(10), sobe(10), sobe(10)], medir: () => null, _medir: medir })
    expect(r.aplicados.map((a) => a.indice)).toEqual([0])
    expect(r.recusados.map((a) => [a.indice, a.codigo])).toEqual([
      [1, 'AJUSTE_PIOROU_ARTE'],
      [2, 'AJUSTE_PIOROU_ARTE'],
    ])
    expect(r.recusados[0].motivo).toMatch(/pior do que ENTROU/)
    expect(r.recusados[0].comparacao?.contraEntrada?.pioras).toEqual([expect.objectContaining({ propriedade: 'contraste', camadas: ['servico'] })])
    // O estado final tem só o 1º: o serviço 10 px acima.
    expect(r.camadas.find((l) => l.id === 'servico')!.position.y).toBe(1690)
    // Medidas: a entrada + uma por candidata (3) — a 3ª candidata foi medida sobre o estado COM o 1º (1680), não sobre o 2º recusado.
    expect(medicoes.map((c) => c.find((l) => l.id === 'servico')!.position.y)).toEqual([1700, 1690, 1680, 1680])
  })

  it('um lote só de recusas ESTRUTURAIS (camada inexistente, campo inválido) não mede nada: nem contexto, nem medida', async () => {
    const r = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas: base(), ajustes: [{ tipo: 'mover', camadas: ['nao-existe'], dy: -10 } as Ajuste, { tipo: 'mover', camadas: ['servico'], dy: 0 } as Ajuste], medir: () => null, _medir: medir })
    expect(r.aplicados).toEqual([])
    expect(r.recusados.map((a) => a.indice)).toEqual([0, 1])
    expect(medicoes).toEqual([])
  })

  it('o que o autofix mexeu na cópia aceita é DITO no aplicado (`autocorrecao`), nunca em silêncio (revisores A e C)', async () => {
    autofix.modo = 'encolhe'
    const r = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas: base(), ajustes: [sobe(10)], medir: () => null, _medir: medir })
    expect(r.aplicados[0].autocorrecao).toEqual([expect.objectContaining({ layerId: 'headline', propriedade: 'fontSize', de: 84, para: 60 })])
    expect(r.camadas.find((l) => l.id === 'headline')!.style?.fontSize).toBe(60)
  })

  it('Codex R1 — `mover` numa camada SEM métrica é NÃO MEDIDO (as tocadas vêm da diferença real, não do que o ajuste declara); o `achado` sobrevive ao índice > 0', async () => {
    const semMetrica = async (camadas: Layer[]) => ({ ...(await medidaSintetica(camadas)), semMetrica: ['servico'] })
    const r = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas: base(), ajustes: [{ ...sobe(0), camadas: ['headline'], dy: -5, achado: 'visao-x:T1' } as Ajuste, { ...sobe(10), achado: 'visao-y:T2' } as Ajuste], medir: () => null, _medir: semMetrica })
    expect(r.aplicados.map((a) => [a.indice, a.achado])).toEqual([[0, 'visao-x:T1']])
    expect(r.recusados.map((a) => [a.indice, a.codigo, a.achado])).toEqual([[1, 'AJUSTE_NAO_MEDIDO', 'visao-y:T2']])
    expect(r.recusados[0].comparacao?.naoMedidas).toEqual([expect.objectContaining({ propriedade: 'geometria', motivo: expect.stringMatching(/servico/) })])
    // Recusa estrutural em índice > 0 também guarda o `achado`.
    const e = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas: base(), ajustes: [sobe(10), { tipo: 'mover', camadas: ['nao-existe'], dy: -10, achado: 'texto-cortado:x' } as Ajuste], medir: () => null, _medir: medir })
    expect(e.recusados.map((a) => [a.indice, a.codigo, a.achado])).toEqual([[1, 'CAMADA_INEXISTENTE', 'texto-cortado:x']])
  })

  it('decisão do owner — esconder texto com conteúdo é recusa ESTRUTURAL: nenhuma medida; o lote segue com os válidos; o decorativo pode ser escondido', async () => {
    const gradiente = { id: 'veu', name: 'Véu', type: 'gradient', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 600 }, style: {} } as Layer
    const camadas = [gradiente, ...base()]
    const r = await aplicarAjustesSemPiorar({
      projectId: 1,
      page,
      camadas,
      ajustes: [{ tipo: 'visibilidade', camadas: ['headline'], visivel: false, achado: 'texto-cortado:headline' } as Ajuste, sobe(10), { tipo: 'visibilidade', camadas: ['veu'], visivel: false } as Ajuste],
      medir: () => null,
      _medir: medir,
    })
    expect(r.recusados.map((a) => [a.indice, a.codigo, a.achado])).toEqual([[0, 'CONTEUDO_NAO_PODE_SER_OCULTADO', 'texto-cortado:headline']])
    expect(r.aplicados.map((a) => a.indice)).toEqual([1, 2])
    expect(r.camadas.find((l) => l.id === 'headline')!.visible).not.toBe(false)
    expect(r.camadas.find((l) => l.id === 'veu')!.visible).toBe(false)
    // A recusa estrutural não custou medida: a entrada + uma por candidata medida (2).
    expect(medicoes).toHaveLength(3)
    // Só estruturais → nada medido.
    medicoes.length = 0
    const so = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas, ajustes: [{ tipo: 'visibilidade', camadas: ['headline', 'veu'], visivel: false } as Ajuste], medir: () => null, _medir: medir })
    expect(so.recusados.map((a) => a.codigo)).toEqual(['CONTEUDO_NAO_PODE_SER_OCULTADO'])
    expect(medicoes).toEqual([])
  })

  it('texto que não cabe depois do ajuste recusa SÓ aquele ajuste (TEXTO_NAO_CABE por ajuste), com o índice do lote', async () => {
    autofix.modo = 'nao-cabe'
    const r = await aplicarAjustesSemPiorar({ projectId: 1, page, camadas: base(), ajustes: [{ tipo: 'mover', camadas: ['nao-existe'], dy: -10 } as Ajuste, sobe(10)], medir: () => null, _medir: medir })
    expect(r.recusados.map((a) => [a.indice, a.codigo])).toEqual([
      [0, 'CAMADA_INEXISTENTE'],
      [1, 'TEXTO_NAO_CABE'],
    ])
    expect(r.aplicados).toEqual([])
  })
})
