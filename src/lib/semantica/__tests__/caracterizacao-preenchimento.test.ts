/**
 * CARACTERIZAÇÃO dos dois caminhos de preenchimento legados — `bakeLayers`
 * (criação e ajuste) e `aplicarSlotNaCamada` (render agendado e a leitura do
 * que o render desenha) — ANTES da adoção do endereçamento semântico (B1c/B1d).
 *
 * Fixa o comportamento de hoje, inclusive a divergência do `""` entre os dois.
 * Se um PR posterior mudar algo aqui, a mudança precisa ser deliberada.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bakeLayers } from '@/lib/creatives/bake-layers'
import { aplicarSlotNaCamada, applySlotValues } from '@/lib/posts/page-to-design-data'
import { textosDaPeca } from '@/lib/posts/textos-da-peca'
import type { DesignData } from '@/types/template'

const texto = (id: string, name: string, content: string, extra: Record<string, unknown> = {}): Record<string, any> => ({ id, name, type: 'text', content, visible: true, ...extra })
const imagem = (id: string, extra: Record<string, unknown> = {}): Record<string, any> => ({ id, name: id, type: 'image', visible: true, ...extra })

afterEach(() => vi.restoreAllMocks())

describe('casamento: id antes de nome', () => {
  it('bakeLayers e aplicarSlotNaCamada: a chave pelo id vence a chave pelo nome', () => {
    const l = texto('l1', 'headline', 'Modelo')
    expect(bakeLayers([l], { l1: 'pelo id', headline: 'pelo nome' }, null).layers[0].content).toBe('pelo id')
    expect(aplicarSlotNaCamada(l, { l1: 'pelo id', headline: 'pelo nome' }).content).toBe('pelo id')
  })

  it('sem chave pelo id, o nome casa nos dois', () => {
    const l = texto('l1', 'headline', 'Modelo')
    expect(bakeLayers([l], { headline: 'pelo nome' }, null).layers[0].content).toBe('pelo nome')
    expect(aplicarSlotNaCamada(l, { headline: 'pelo nome' }).content).toBe('pelo nome')
  })
})

describe('string vazia — a divergência legada entre os dois caminhos', () => {
  const l = texto('l1', 'headline', 'Modelo')

  it('bakeLayers: "" TROCA o conteúdo por vazio', () => {
    expect(bakeLayers([l], { l1: '' }, null).layers[0].content).toBe('')
  })

  it('aplicarSlotNaCamada: "" MANTÉM a camada', () => {
    expect(aplicarSlotNaCamada(l, { l1: '' }).content).toBe('Modelo')
  })

  it('id com "" continua impedindo o fallback para o nome, nos dois', () => {
    expect(bakeLayers([l], { l1: '', headline: 'pelo nome' }, null).layers[0].content).toBe('')
    expect(aplicarSlotNaCamada(l, { l1: '', headline: 'pelo nome' }).content).toBe('Modelo')
  })
})

describe('valor objeto', () => {
  const l = texto('l1', 'headline', 'Modelo')

  it('content troca; content vazio apaga (nos dois)', () => {
    expect(bakeLayers([l], { l1: { content: 'Novo' } }, null).layers[0].content).toBe('Novo')
    expect(bakeLayers([l], { l1: { content: '' } }, null).layers[0].content).toBe('')
    expect(aplicarSlotNaCamada(l, { l1: { content: 'Novo' } }).content).toBe('Novo')
    expect(aplicarSlotNaCamada(l, { l1: { content: '' } }).content).toBe('')
  })

  it('fileUrl troca a imagem (nos dois)', () => {
    const img = imagem('i1', { fileUrl: 'https://velha' })
    expect(bakeLayers([img], { i1: { fileUrl: 'https://nova' } }, null).layers[0].fileUrl).toBe('https://nova')
    expect(aplicarSlotNaCamada(img, { i1: { fileUrl: 'https://nova' } }).fileUrl).toBe('https://nova')
  })

  it('hidden: só bakeLayers entende (esconde a camada)', () => {
    expect(bakeLayers([l], { l1: { hidden: true } }, null).layers[0].visible).toBe(false)
    expect(aplicarSlotNaCamada(l, { l1: { hidden: true } } as never)).toEqual(l)
  })

  it('papel e bloco: só bakeLayers grava as marcas em metadata.compositor', () => {
    const r = bakeLayers([l], { l1: { content: 'X', papel: 'cta', bloco: 'b1' } }, null).layers[0]
    expect(r.metadata).toEqual({ compositor: { papel: 'cta', bloco: 'b1' } })
    expect(aplicarSlotNaCamada(l, { l1: { content: 'X', papel: 'cta', bloco: 'b1' } }).metadata).toBeUndefined()
  })
})

describe('bakeLayers: a foto (imageUrl)', () => {
  it('vai para a primeira imagem dinâmica VAZIA', () => {
    const r = bakeLayers([imagem('a', { isDynamic: true, fileUrl: 'https://ja' }), imagem('b', { isDynamic: true })], {}, 'https://foto')
    expect(r.layers.map((x) => x.fileUrl)).toEqual(['https://ja', 'https://foto'])
    expect(r.imageApplied).toBe(true)
  })

  it('sem dinâmica vazia, substitui a primeira dinâmica (fallback)', () => {
    const r = bakeLayers([imagem('a', { isDynamic: true, fileUrl: 'https://ja' })], {}, 'https://foto')
    expect(r.layers[0].fileUrl).toBe('https://foto')
  })

  it('a camada de id bg-img também é alvo', () => {
    expect(bakeLayers([imagem('bg-img')], {}, 'https://foto').layers[0].fileUrl).toBe('https://foto')
  })

  it('fileUrl explícito no slot vence a imageUrl: a camada não é alvo da foto', () => {
    const r = bakeLayers([imagem('a', { isDynamic: true })], { a: { fileUrl: 'https://explicita' } }, 'https://foto')
    expect(r.layers[0].fileUrl).toBe('https://explicita')
    expect(r.imageApplied).toBe(false)
  })

  it('sem alvo, a foto não é aplicada', () => {
    expect(bakeLayers([imagem('a')], {}, 'https://foto').imageApplied).toBe(false)
  })
})

describe('bakeLayers: changedTextIds', () => {
  it('registra só camadas de tipo "text" — rich-text recebe o conteúdo mas não entra', () => {
    const r = bakeLayers([texto('t', 't', 'a'), texto('r', 'r', 'b', { type: 'rich-text' })], { t: 'X', r: 'Y' }, null)
    expect(r.layers.map((x) => x.content)).toEqual(['X', 'Y'])
    expect(r.changedTextIds).toEqual(['t'])
  })
})

describe('applySlotValues: chave sem camada', () => {
  it('avisa e continua aplicando o resto', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const design = { canvas: { width: 1080, height: 1920 }, layers: [texto('l1', 'headline', 'Modelo')] } as unknown as DesignData
    const r = applySlotValues(design, { headline: 'Novo', inexistente: 'perdido' })
    expect(r.layers[0].content).toBe('Novo')
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(String(aviso.mock.calls[0][0])).toContain('inexistente')
  })
})

describe('paridade: a leitura do que o render desenha (textosDaPeca) usa a mesma regra', () => {
  const camadas = [texto('l1', 'headline', 'Modelo'), texto('l2', 'apoio', 'Apoio')]
  const viva = { pageId: 'p1', status: 'DRAFT', laterPostId: null, mediaUrls: [] as string[], generationId: null }

  for (const [nome, slots] of [
    ['string', { headline: 'Novo' }],
    ['"" mantém', { headline: '' }],
    ['content vazio apaga', { l1: { content: '' } }],
    ['id com "" bloqueia o nome', { l1: '', headline: 'pelo nome' }],
  ] as Array<[string, Record<string, unknown>]>) {
    it(nome, () => {
      const desenhado = camadas.map((c) => aplicarSlotNaCamada(c, slots)).map((c) => (typeof c.content === 'string' ? c.content : '')).filter(Boolean)
      expect(textosDaPeca({ ...viva, slotValues: slots }, { camadas, paginaEhModelo: true }).textos).toEqual(desenhado)
    })
  }
})

describe('a fronteira antes da adoção: _slots e _papeis são IGNORADOS pelo legado', () => {
  const camadas = [texto('l1', 'headline', 'Modelo', { metadata: { compositor: { papel: 'headline' }, slot: { id: 'titulo' } } })]
  const semantico = { _slots: { titulo: 'Pelo slot' }, _papeis: { headline: 'Pelo papel' } }

  it('bakeLayers não aplica', () => {
    expect(bakeLayers(camadas, semantico, null).layers[0].content).toBe('Modelo')
  })

  it('aplicarSlotNaCamada não aplica', () => {
    expect(aplicarSlotNaCamada(camadas[0], semantico).content).toBe('Modelo')
  })

  it('applySlotValues não aplica nem avisa (chaves _ são de controle)', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const design = { canvas: { width: 1080, height: 1920 }, layers: camadas } as unknown as DesignData
    expect(applySlotValues(design, semantico).layers[0].content).toBe('Modelo')
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('o casamento legado NÃO exclui chaves com "_" (isControlKey só serve ao diagnóstico)', () => {
  it('layer com id começando com "_" casa pelo id, nos dois caminhos', () => {
    const l = texto('_x', 'nome', 'Modelo')
    expect(bakeLayers([l], { _x: 'pelo id' }, null).layers[0].content).toBe('pelo id')
    expect(aplicarSlotNaCamada(l, { _x: 'pelo id' }).content).toBe('pelo id')
  })

  it('layer com name começando com "_" casa pelo nome, nos dois caminhos', () => {
    const l = texto('l1', '_n', 'Modelo')
    expect(bakeLayers([l], { _n: 'pelo nome' }, null).layers[0].content).toBe('pelo nome')
    expect(aplicarSlotNaCamada(l, { _n: 'pelo nome' }).content).toBe('pelo nome')
  })

  it('id presente vence o nome também com "_"', () => {
    const l = texto('_x', '_n', 'Modelo')
    expect(bakeLayers([l], { _x: 'id', _n: 'nome' }, null).layers[0].content).toBe('id')
    expect(aplicarSlotNaCamada(l, { _x: 'id', _n: 'nome' }).content).toBe('id')
  })

  it('id com null/undefined deixa cair para o nome (a regra ??)', () => {
    const l = texto('l1', 'headline', 'Modelo')
    expect(bakeLayers([l], { l1: null, headline: 'nome' }, null).layers[0].content).toBe('nome')
    expect(aplicarSlotNaCamada(l, { l1: undefined, headline: 'nome' }).content).toBe('nome')
  })
})
