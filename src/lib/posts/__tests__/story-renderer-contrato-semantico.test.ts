/**
 * B1d — o contrato semântico novo pelo caminho REAL do render (`renderStoryImage`), com banco, fontes, Blob e
 * canvas falsos.
 *
 * Checkpoint a caracterizou o gap (o contrato era ignorado em silêncio); checkpoint d o fecha: com
 * `_slots`/`_papeis`, o render usa `aplicarValoresDoPost` sobre a página ATUAL (página modelo) ou recusa
 * (página de conteúdo / contrato que não casa mais) com `ErroRenderSemantico` — ANTES de fontes, canvas e
 * upload. O legado segue exatamente como antes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ pagina: null as any, desenhado: null as any, efeitos: [] as string[] }))

vi.mock('@/lib/db', () => ({ db: { page: { findUnique: vi.fn(async () => estado.pagina) } } }))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (caminho: string) => {
    estado.efeitos.push('upload')
    return { url: `https://blob.test/${caminho}` }
  }),
}))
vi.mock('../register-project-fonts', () => ({ registerProjectFonts: vi.fn(async () => void estado.efeitos.push('fontes')) }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextMeasurer: vi.fn(async () => () => 100) }))
vi.mock('@/lib/combo-stack-reflow', () => ({
  // O reflow muda a geometria de quem cresceu — a prova tem de carregar a geometria FINAL.
  reflowLayersAfterFill: vi.fn((layers: any[], ids: string[]) => {
    estado.efeitos.push(`reflow:${ids.join(',')}`)
    return layers.map((l) => (ids.includes(l.id) ? { ...l, size: { ...l.size, height: 999 } } : l))
  }),
}))
vi.mock('@/lib/canvas-renderer', () => ({
  CanvasRenderer: class {
    constructor() {
      estado.efeitos.push('canvas')
    }
    async renderDesign(design: unknown) {
      estado.desenhado = design
      return Buffer.from('png')
    }
  },
}))

import { renderStoryImage } from '../story-renderer'
import { ErroRenderSemantico } from '../erro-render-semantico'

const texto = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'text', content: `modelo ${id}`, visible: true, order: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, ...extra })
const declarada = (papel: string, slot?: string) => ({ metadata: { compositor: { papel }, ...(slot ? { slot: { id: slot } } : {}) } })
const pagina = (isTemplate: boolean, layers: unknown[] = [texto('t-h', { name: 'Título', ...declarada('headline', 'manchete') })]) => ({ id: 'p1', name: 'P', width: 1080, height: 1920, layers, background: '#000', audio: null, isTemplate, Template: { projectId: 8 } })
const desenhado = (id: string) => estado.desenhado.layers.find((l: any) => l.id === id)

beforeEach(() => {
  estado.desenhado = null
  estado.efeitos = []
})

async function recusa(slotValues: Record<string, unknown>, motivo: string, codigo?: string) {
  const e = await renderStoryImage('p1', 'post-1', slotValues).then(
    () => null,
    (erro: unknown) => erro,
  )
  expect(e).toBeInstanceOf(ErroRenderSemantico)
  expect(e).toMatchObject({ motivo, pageId: 'p1' })
  if (codigo) expect((e as ErroRenderSemantico).erros[0]).toMatchObject({ codigo })
  expect(estado.efeitos).toEqual([]) // nada de fontes, canvas, render ou upload
  return e as ErroRenderSemantico
}

describe('A–B. página MODELO + contrato válido: a camada certa chega ao render', () => {
  it('A. `_slots`', async () => {
    estado.pagina = pagina(true)
    const r = await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Noite do vinho' } })
    expect(desenhado('t-h').content).toBe('Noite do vinho')
    expect(r.aplicouSlots).toBe(true)
  })

  it('B. `_papeis` (papel declarado e único)', async () => {
    estado.pagina = pagina(true)
    await renderStoryImage('p1', 'post-1', { _papeis: { headline: 'Por papel' } })
    expect(desenhado('t-h').content).toBe('Por papel')
  })
})

describe('C–G. a página mudou depois do agendamento: falha semântica, antes de qualquer efeito', () => {
  it('C. slot removido da página → ALVO_NAO_RESOLVIDO', async () => {
    estado.pagina = pagina(true, [texto('t-h', { name: 'Título', ...declarada('headline') })])
    await recusa({ _slots: { manchete: 'X' } }, 'CONTRATO_INVALIDO', 'ALVO_NAO_RESOLVIDO')
  })

  it('D. papel deixou de ser declarado → PAPEL_NAO_DECLARADO', async () => {
    estado.pagina = pagina(true, [texto('headline')])
    await recusa({ _papeis: { headline: 'X' } }, 'CONTRATO_INVALIDO', 'PAPEL_NAO_DECLARADO')
  })

  it('E. camada ficou oculta → CAMADA_OCULTA', async () => {
    estado.pagina = pagina(true, [texto('t-h', { visible: false, ...declarada('headline', 'manchete') })])
    await recusa({ _slots: { manchete: 'X' } }, 'CONTRATO_INVALIDO', 'CAMADA_OCULTA')
  })

  it('F. valor incompatível com a camada → VALOR_INCOMPATIVEL_COM_CAMADA', async () => {
    estado.pagina = pagina(true)
    await recusa({ _slots: { manchete: { fileUrl: 'https://x' } } }, 'CONTRATO_INVALIDO', 'VALOR_INCOMPATIVEL_COM_CAMADA')
  })

  it('G. `_slots: null` persistido → ENTRADA_INVALIDA (nunca cai no legado)', async () => {
    estado.pagina = pagina(true)
    await recusa({ _slots: null }, 'CONTRATO_INVALIDO', 'ENTRADA_INVALIDA')
  })

  it('os erros não carregam o texto nem a URL pedidos', async () => {
    estado.pagina = pagina(true)
    const e = await recusa({ 't-h': 'segredo-A', _slots: { manchete: 'segredo-B' } }, 'CONTRATO_INVALIDO', 'VALOR_CONFLITANTE')
    expect(JSON.stringify({ m: e.message, r: e.paraRenderError() })).not.toMatch(/segredo/)
  })
})

describe('M. página de CONTEÚDO com contrato já salvo: recusa no render, não ignora', () => {
  it('fecha o gap caracterizado no checkpoint a', async () => {
    estado.pagina = pagina(false)
    await recusa({ _slots: { manchete: 'Noite do vinho' } }, 'PAGINA_DE_CONTEUDO')
  })
})

describe('J–K. reflow e ordem', () => {
  it('J. o texto semântico entra no reflow, depois das fontes (a aplicação é a fonte da verdade)', async () => {
    estado.pagina = pagina(true, [texto('t-h', { name: 'Título', ...declarada('headline', 'manchete') }), { id: 'img', name: 'Foto', type: 'image', fileUrl: 'antiga', visible: true, metadata: { slot: { id: 'foto' } } }])
    await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Um texto bem maior que o do modelo', foto: { fileUrl: 'https://nova' } } })
    expect(estado.efeitos).toEqual(['fontes', 'reflow:t-h', 'canvas', 'upload'])
    expect(desenhado('img').fileUrl).toBe('https://nova')
  })

  it('K. A (order 20) antes de B (order 1): o slot de A cai em A, aplicado antes da ordenação do render', async () => {
    estado.pagina = pagina(true, [texto('a', { order: 20, metadata: { slot: { id: 'sa' } } }), texto('b', { order: 1, metadata: { slot: { id: 'sb' } } })])
    await renderStoryImage('p1', 'post-1', { _slots: { sa: 'Para A' } })
    expect(desenhado('a').content).toBe('Para A')
    expect(desenhado('b').content).toBe('modelo b')
  })
})

describe('L. legado pelo caminho real do render: intacto', () => {
  it('página MODELO: por id e por nome aplica, e o reflow recebe as camadas de hoje', async () => {
    estado.pagina = pagina(true)
    await renderStoryImage('p1', 'post-1', { 't-h': 'Por id' })
    expect(desenhado('t-h').content).toBe('Por id')
    expect(estado.efeitos).toEqual(['fontes', 'reflow:t-h', 'canvas', 'upload'])
    await renderStoryImage('p1', 'post-1', { Título: 'Por nome' })
    expect(desenhado('t-h').content).toBe('Por nome')
  })

  it('"" mantém e { content: "" } esvazia, como hoje', async () => {
    estado.pagina = pagina(true)
    await renderStoryImage('p1', 'post-1', { 't-h': '' })
    expect(desenhado('t-h').content).toBe('modelo t-h')
    await renderStoryImage('p1', 'post-1', { 't-h': { content: '' } })
    expect(desenhado('t-h').content).toBe('')
  })

  it('página de CONTEÚDO: a página manda, os slots legados não voltam para a arte e não há reflow', async () => {
    estado.pagina = pagina(false)
    const r = await renderStoryImage('p1', 'post-1', { 't-h': 'cópia antiga' })
    expect(desenhado('t-h').content).toBe('modelo t-h')
    expect(r.aplicouSlots).toBe(false)
    expect(estado.efeitos).toEqual(['fontes', 'canvas', 'upload'])
  })
})

describe('checkpoint e: camadasEfetivas = exatamente o que o canvas recebeu (a matéria da prova)', () => {
  it('B/C. semântico: content FINAL e geometria FINAL (depois do reflow), iguais às camadas entregues ao renderDesign', async () => {
    estado.pagina = pagina(true)
    const r = await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Noite do vinho' } })
    const efetiva = r.camadasEfetivas.find((l: any) => l.id === 't-h') as any
    expect(efetiva.content).toBe('Noite do vinho')
    expect(efetiva.size.height).toBe(999)
    expect(r.camadasEfetivas).toEqual(estado.desenhado.layers)
  })

  it('legado também devolve as camadas efetivas (a prova vale para todo render canônico)', async () => {
    estado.pagina = pagina(true)
    const r = await renderStoryImage('p1', 'post-1', { 't-h': 'Por id' })
    expect(r.camadasEfetivas).toEqual(estado.desenhado.layers)
    expect((r.camadasEfetivas.find((l: any) => l.id === 't-h') as any).content).toBe('Por id')
  })

  it('é uma CÓPIA: o que o renderer fizer com o objeto depois não reescreve a prova', async () => {
    estado.pagina = pagina(true)
    const r = await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'X' } })
    estado.desenhado.layers[0].content = 'mexido depois'
    expect((r.camadasEfetivas[0] as any).content).toBe('X')
  })
})
