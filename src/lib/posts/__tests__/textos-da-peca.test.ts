import { describe, expect, it } from 'vitest'
import { arteEntregue, textosDaPeca } from '../textos-da-peca'

const camadas = [
  { id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', visible: true },
  { id: 'l2', name: 'apoio', type: 'text', content: 'Apoio do modelo' },
  { id: 'l3', name: 'oculta', type: 'text', content: 'Placeholder escondido', visible: false },
  { id: 'l4', name: 'foto', type: 'image', fileUrl: 'https://x/y.png' },
]
const viva = { pageId: 'p1', status: 'DRAFT', laterPostId: null, mediaUrls: [] as string[], generationId: null }

describe('textosDaPeca — a mesma precedência do render', () => {
  it('dois posts sobre a MESMA página com copy própria voltam com as suas headlines, não com o texto do modelo', () => {
    const a = textosDaPeca({ ...viva, slotValues: { headline: 'Costela no bafo' } }, { camadas })
    const b = textosDaPeca({ ...viva, slotValues: { l1: { content: 'Picanha na brasa' }, apoio: 'Sexta é dia' } }, { camadas })
    expect(a).toEqual({ textos: ['Costela no bafo', 'Apoio do modelo'], origem: 'pagina-com-copy-do-post' })
    expect(b).toEqual({ textos: ['Picanha na brasa', 'Sexta é dia'], origem: 'pagina-com-copy-do-post' })
  })
  it('a cópia da página (_copiaDaPagina) NÃO sobrepõe a página — a peça é a página, camada oculta fora', () => {
    const r = textosDaPeca({ ...viva, slotValues: { headline: 'Texto velho', apoio: 'Apoio velho', _copiaDaPagina: true } }, { camadas })
    expect(r).toEqual({ textos: ['Título do modelo', 'Apoio do modelo'], origem: 'pagina' })
  })
  it('sem página vale a copy do post (as chaves _ e URLs ficam de fora); sem nada, lista vazia sem alegação', () => {
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: { headline: 'Solta', _imageUrl: 'https://x/y.png', foto: 'https://x/z.png' } })).toEqual({ textos: ['Solta'], origem: 'copy-do-post' })
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: null })).toEqual({ textos: [] })
  })
  it('camadas ilegíveis sem copy no post: indisponível, nunca erro; com copy, cai na copy', () => {
    expect(textosDaPeca({ ...viva, slotValues: null }, { camadas: '{nao é json' }).indisponiveis).toMatch(/não puderam ser lidas/)
    expect(textosDaPeca({ ...viva, slotValues: { headline: 'Da copy' } }, { camadas: '{nao é json' })).toEqual({ textos: ['Da copy'], origem: 'copy-do-post' })
  })
})

describe('textosDaPeca — arte já entregue não segue a página', () => {
  const entregue = { pageId: 'p1', status: 'SCHEDULED', laterPostId: 'zernio-1', mediaUrls: ['https://blob/arte-1.png'], generationId: 'g1' }
  const snapshot = [{ id: 'l1', name: 'headline', type: 'text', content: 'Texto A, o que foi ao ar' }]

  it('arteEntregue: no publicador, publicada, publicando ou falhou', () => {
    expect(arteEntregue({ status: 'SCHEDULED', laterPostId: 'x' })).toBe(true)
    expect(arteEntregue({ status: 'POSTED', laterPostId: null })).toBe(true)
    expect(arteEntregue({ status: 'FAILED', laterPostId: null })).toBe(true)
    expect(arteEntregue({ status: 'SCHEDULED', laterPostId: null })).toBe(false)
    expect(arteEntregue({ status: 'DRAFT', laterPostId: null })).toBe(false)
  })
  it('a página editada para B depois da entrega NÃO é atribuída à publicação: vale o snapshot da arte que o post carrega', () => {
    const paginaEditada = [{ id: 'l1', name: 'headline', type: 'text', content: 'Texto B, editado depois' }]
    const r = textosDaPeca({ ...entregue, slotValues: { headline: 'Texto A, o que foi ao ar', _copiaDaPagina: true } }, { camadas: paginaEditada, arte: { resultUrl: 'https://blob/arte-1.png', layersSnapshot: snapshot } })
    expect(r).toEqual({ textos: ['Texto A, o que foi ao ar'], origem: 'arte-entregue' })
  })
  it('snapshot de uma arte que NÃO é a que o post carrega não conta; sobra a cópia registrada na entrega', () => {
    const r = textosDaPeca({ ...entregue, slotValues: { headline: 'Texto A registrado', _copiaDaPagina: true } }, { camadas: [], arte: { resultUrl: 'https://blob/outra.png', layersSnapshot: snapshot } })
    expect(r).toEqual({ textos: ['Texto A registrado'], origem: 'copy-registrada-na-entrega' })
  })
  it('copy própria do post vence a cópia registrada; publicado sem registro nenhum declara a indisponibilidade', () => {
    expect(textosDaPeca({ ...entregue, status: 'POSTED', laterPostId: null, slotValues: { headline: 'Própria' } })).toEqual({ textos: ['Própria'], origem: 'copy-do-post' })
    const semNada = textosDaPeca({ ...entregue, status: 'POSTED', laterPostId: null, generationId: null, slotValues: null }, { camadas })
    expect(semNada.textos).toEqual([])
    expect(semNada.indisponiveis).toMatch(/já foi entregue/)
  })
})
