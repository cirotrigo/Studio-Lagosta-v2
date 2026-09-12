import { describe, expect, it } from 'vitest'
import { arteEntregue, textosDaPeca } from '../textos-da-peca'
import { aplicarSlotNaCamada } from '../page-to-design-data'
import { aplicarCaixa } from '../caixa-do-texto'

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
  it('slot vazio tem a semântica do render (R11): "" mantém o texto da camada; { content: "" } o apaga; id vence nome mesmo quando o id vem vazio', () => {
    const pagina = [
      { id: 'l1', name: 'headline', type: 'text', content: 'Preço sob consulta' },
      { id: 'l2', name: 'apoio', type: 'text', content: 'Apoio' },
    ]
    expect(textosDaPeca({ ...viva, slotValues: { headline: '' } }, { camadas: pagina }).textos).toEqual(['Preço sob consulta', 'Apoio'])
    expect(textosDaPeca({ ...viva, slotValues: { headline: { content: '' } } }, { camadas: pagina }).textos).toEqual(['Apoio'])
    expect(textosDaPeca({ ...viva, slotValues: { l1: '', headline: 'pelo nome' } }, { camadas: pagina }).textos).toEqual(['Preço sob consulta', 'Apoio'])
    expect(textosDaPeca({ ...viva, slotValues: { l1: 'pelo id', headline: 'pelo nome' } }, { camadas: pagina }).textos).toEqual(['pelo id', 'Apoio'])
    // a MESMA função do render, com o mesmo resultado
    expect(aplicarSlotNaCamada(pagina[0], { headline: '' }).content).toBe('Preço sob consulta')
    expect(aplicarSlotNaCamada(pagina[0], { headline: { content: '' } }).content).toBe('')
    expect(aplicarSlotNaCamada(pagina[0], { l1: { fileUrl: 'https://x' } }).content).toBe('Preço sob consulta')
  })
  it('o texto de camada volta INTEIRO e na multiplicidade em que existe (R10): URL numa camada é texto; frase repetida conta duas vezes; acento e quebra de linha ficam', () => {
    const pagina = [
      { id: 'a', name: 'cta', type: 'text', content: 'https://cliente.com/reservas' },
      { id: 'b', name: 'apoio', type: 'text', content: 'Sexta é dia de churrasco' },
      { id: 'c', name: 'apoio-2', type: 'text', content: 'Sexta é dia de churrasco' },
      { id: 'd', name: 'headline', type: 'text', content: 'Costela\nno bafo' },
    ]
    expect(textosDaPeca({ ...viva, slotValues: null }, { camadas: pagina }).textos).toEqual([
      'https://cliente.com/reservas',
      'Sexta é dia de churrasco',
      'Sexta é dia de churrasco',
      'Costela\nno bafo',
    ])
    // só o fallback por slotValues (sem tipo de camada) descarta valor com cara de URL
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: { headline: 'Solta', _imageUrl: 'https://x/y.png', foto: 'https://x/z.png', outro: 'Solta' } })).toEqual({ textos: ['Solta', 'Solta'], origem: 'copy-do-post' })
  })
  it('sem página nem arte: a copy do post; sem nada, lista vazia sem alegação', () => {
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: { headline: 'Solta' } })).toEqual({ textos: ['Solta'], origem: 'copy-do-post' })
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: null })).toEqual({ textos: [] })
  })
  it('camadas ilegíveis sem copy no post: indisponível, nunca erro; com copy, cai na copy', () => {
    expect(textosDaPeca({ ...viva, slotValues: null }, { camadas: '{nao é json' }).indisponiveis).toMatch(/não puderam ser lidas/)
    expect(textosDaPeca({ ...viva, slotValues: { headline: 'Da copy' } }, { camadas: '{nao é json' })).toEqual({ textos: ['Da copy'], origem: 'copy-do-post' })
  })
})

describe('textosDaPeca — carrossel: slide a slide, pela arte que cada mídia é (R8)', () => {
  const snap = (texto: string) => [{ id: 'l1', name: 'headline', type: 'text', content: texto }]
  it('peça ENTREGUE com duas mídias e snapshots: os textos dos dois slides, em ordem; um terceiro sem arte é declarado e a leitura é parcial', () => {
    const post = { pageId: null, status: 'POSTED', laterPostId: null, mediaUrls: ['u1', 'u2', 'u3'], generationId: 'g1', slotValues: null }
    const r = textosDaPeca(post, {
      slides: [
        { url: 'u1', arte: { layersSnapshot: snap('Slide um') } },
        { url: 'u2', arte: { layersSnapshot: snap('Slide dois') } },
        { url: 'u3', arte: null },
      ],
    })
    expect(r.textos).toEqual(['Slide um', 'Slide dois'])
    expect(r.origem).toBe('arte')
    expect(r.parcial).toBe(true)
    expect(r.slides?.map((s) => [s.slide, s.textos, s.origem ?? s.indisponiveis])).toEqual([
      [1, ['Slide um'], 'arte'],
      [2, ['Slide dois'], 'arte'],
      [3, [], 'nenhuma arte registrada para esta mídia'],
    ])
  })
  it('carrossel VIVO: cada slide é lido da PÁGINA da sua arte (a edição que o re-render vai desenhar), não do snapshot velho; sem página, o snapshot', () => {
    const post = { pageId: null, status: 'SCHEDULED', laterPostId: null, mediaUrls: ['u1', 'u2'], generationId: 'g1', slotValues: null }
    const r = textosDaPeca(post, {
      slides: [
        { url: 'u1', arte: { layersSnapshot: snap('Velho'), pageId: 'p1' }, camadasDaPagina: snap('Editado agora') },
        { url: 'u2', arte: { layersSnapshot: snap('Slide dois') } },
      ],
    })
    expect(r.textos).toEqual(['Editado agora', 'Slide dois'])
    expect(r.slides?.map((s) => s.origem)).toEqual(['pagina', 'arte'])
    expect(r.parcial).toBeUndefined()
  })
  it('leitura legível VAZIA é definitiva (R14): a única camada apagada pelo slot, todas as camadas ocultas num slide, snapshot válido sem texto — nada ressuscita copy antiga', () => {
    const umaSo = [{ id: 'l1', name: 'headline', type: 'text', content: 'Texto antigo' }]
    const apagada = textosDaPeca({ ...viva, mediaUrls: ['u1'], slotValues: { headline: { content: '' } } }, { camadas: umaSo, slides: [{ url: 'u1', arte: { layersSnapshot: snap('Texto antigo'), pageId: 'p1' } }] })
    expect(apagada).toEqual({ textos: [], origem: 'pagina-com-copy-do-post' })
    const ocultas = textosDaPeca({ pageId: null, status: 'DRAFT', laterPostId: null, mediaUrls: ['u1', 'u2'], generationId: null, slotValues: null }, {
      slides: [
        { url: 'u1', arte: { layersSnapshot: snap('Velho'), pageId: 'p1' }, camadasDaPagina: [{ id: 'l1', name: 'headline', type: 'text', content: 'Escondido', visible: false }] },
        { url: 'u2', arte: { layersSnapshot: snap('Slide dois') } },
      ],
    })
    expect(ocultas.textos).toEqual(['Slide dois'])
    expect(ocultas.slides?.[0]).toEqual({ slide: 1, textos: [], origem: 'pagina' })
    expect(ocultas.parcial).toBeUndefined()
    const semTexto = textosDaPeca({ pageId: null, status: 'POSTED', laterPostId: null, mediaUrls: ['u1'], generationId: null, slotValues: { headline: 'registrado', _copiaDaPagina: true } }, { slides: [{ url: 'u1', arte: { layersSnapshot: [{ id: 'f', type: 'image', fileUrl: 'https://x' }] } }] })
    expect(semTexto).toEqual({ textos: [], origem: 'arte' })
  })
  it('a arte casa SÓ pela URL (R12) e o snapshot de arte RE-RENDERIZADA não afirma texto (R13): sobra a cópia registrada, nunca o texto de outra versão', () => {
    // R12: a mídia B não casa com a Generation A do generationId — o chamador não a passa como arte do slide; vale a cópia registrada B
    const r12 = textosDaPeca({ pageId: 'p1', status: 'POSTED', laterPostId: null, mediaUrls: ['https://blob/B.png'], generationId: 'gA', slotValues: { headline: 'B registrado', _copiaDaPagina: true } }, { slides: [{ url: 'https://blob/B.png', arte: null }] })
    expect(r12).toEqual({ textos: ['B registrado'], origem: 'copy-registrada-na-entrega' })
    // R13: URL casa, mas a arte foi re-renderizada por cima do snapshot da composição anterior
    const r13 = textosDaPeca({ pageId: 'p1', status: 'POSTED', laterPostId: null, mediaUrls: ['https://blob/B.png'], generationId: 'gA', slotValues: { headline: 'B registrado', _copiaDaPagina: true } }, { slides: [{ url: 'https://blob/B.png', arte: { layersSnapshot: snap('A antigo'), pageId: 'p1', reRenderizada: true } }] })
    expect(r13).toEqual({ textos: ['B registrado'], origem: 'copy-registrada-na-entrega' })
    const r13SemRegistro = textosDaPeca({ pageId: null, status: 'POSTED', laterPostId: null, mediaUrls: ['https://blob/B.png', 'https://blob/C.png'], generationId: null, slotValues: null }, { slides: [{ url: 'https://blob/B.png', arte: { layersSnapshot: snap('A antigo'), reRenderizada: true } }, { url: 'https://blob/C.png', arte: { layersSnapshot: snap('C') } }] })
    expect(r13SemRegistro.textos).toEqual(['C'])
    expect(r13SemRegistro.parcial).toBe(true)
    expect(r13SemRegistro.slides?.[0].indisponiveis).toMatch(/re-renderizada/)
  })
  it('CARROSSEL entregue sem slide confiável: nem a cópia da página nem a copy própria provam o que foi ao ar — indisponível, slide a slide (R15)', () => {
    const post = { pageId: null, status: 'POSTED', laterPostId: null, mediaUrls: ['https://blob/B-re-render.png', 'https://blob/C.png'], generationId: 'gA', slotValues: { headline: 'Cópia A da página', _copiaDaPagina: true } }
    const r = textosDaPeca(post, { slides: [{ url: 'https://blob/B-re-render.png', arte: { layersSnapshot: snap('A antigo'), pageId: 'p1', reRenderizada: true } }, { url: 'https://blob/C.png', arte: null }] })
    expect(r.textos).toEqual([])
    expect(r.origem).toBeUndefined()
    expect(r.indisponiveis).toMatch(/carrossel já entregue/)
    expect(JSON.stringify(r)).not.toContain('Cópia A')
    expect(r.slides?.map((s) => [s.slide, s.indisponiveis?.slice(0, 20)])).toEqual([[1, 'a arte desta mídia f'], [2, 'nenhuma arte registr']])
    // mídia ÚNICA entregue continua com a cópia registrada (o render de post a mantém em dia)
    const unica = textosDaPeca({ ...post, mediaUrls: ['https://blob/B.png'] }, { slides: [{ url: 'https://blob/B.png', arte: null }] })
    expect(unica).toEqual({ textos: ['Cópia A da página'], origem: 'copy-registrada-na-entrega' })
  })
  it('a CAIXA é a do render (textTransform), aplicada depois do slot: uppercase, lowercase, capitalize e none, com acento e quebra de linha (R16)', () => {
    const pagina = [
      { id: 'a', name: 'headline', type: 'text', content: 'Almoço executivo', style: { textTransform: 'uppercase' } },
      { id: 'b', name: 'apoio', type: 'text', content: 'De SEGUNDA a Sexta', style: { textTransform: 'lowercase' } },
      { id: 'c', name: 'cta', type: 'text', content: 'vem pra cá\nhoje', style: { textTransform: 'capitalize' } },
      { id: 'd', name: 'servico', type: 'text', content: 'Rua Ação, 12', style: { textTransform: 'none' } },
      { id: 'e', name: 'pre', type: 'text', content: 'Sem estilo' },
    ]
    expect(textosDaPeca({ ...viva, slotValues: null }, { camadas: pagina }).textos).toEqual(['ALMOÇO EXECUTIVO', 'de segunda a sexta', 'Vem Pra Cá\nHoje', 'Rua Ação, 12', 'Sem estilo'])
    expect(textosDaPeca({ ...viva, slotValues: { headline: 'costela no bafo' } }, { camadas: pagina }).textos[0]).toBe('COSTELA NO BAFO')
    // a MESMA função do render
    expect(aplicarCaixa('Almoço executivo', 'uppercase')).toBe('ALMOÇO EXECUTIVO')
    expect(aplicarCaixa('vem pra cá\nhoje', 'capitalize')).toBe('Vem Pra Cá\nHoje')
    expect(aplicarCaixa('X', undefined)).toBe('X')
  })
  it('mídia única sem página: a arte casada pela URL responde (peça viva pela página da arte; entregue pelo snapshot)', () => {
    const base = { pageId: null, laterPostId: null, mediaUrls: ['u1'], generationId: null, slotValues: null }
    expect(textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: { layersSnapshot: snap('S'), pageId: 'p1' }, camadasDaPagina: snap('P') }] })).toEqual({ textos: ['P'], origem: 'pagina' })
    expect(textosDaPeca({ ...base, status: 'POSTED' }, { slides: [{ url: 'u1', arte: { layersSnapshot: snap('S'), pageId: 'p1' }, camadasDaPagina: snap('P') }] })).toEqual({ textos: ['S'], origem: 'arte' })
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
    const r = textosDaPeca(
      { ...entregue, slotValues: { headline: 'Texto A, o que foi ao ar', _copiaDaPagina: true } },
      { camadas: paginaEditada, slides: [{ url: 'https://blob/arte-1.png', arte: { layersSnapshot: snapshot, pageId: 'p1' }, camadasDaPagina: paginaEditada }] },
    )
    expect(r).toEqual({ textos: ['Texto A, o que foi ao ar'], origem: 'arte' })
  })
  it('sem snapshot, a copy PRÓPRIA do post é PARCIAL e dita assim (R9): só o título sobrescrito, sem completar pela página atual', () => {
    const paginaComPreco = [
      { id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo' },
      { id: 'l2', name: 'preco', type: 'text', content: 'R$ 39,90' },
    ]
    const antes = textosDaPeca({ ...entregue, status: 'DRAFT', laterPostId: null, slotValues: { headline: 'Meu título' } }, { camadas: paginaComPreco })
    expect(antes).toEqual({ textos: ['Meu título', 'R$ 39,90'], origem: 'pagina-com-copy-do-post' })
    const depois = textosDaPeca({ ...entregue, status: 'POSTED', laterPostId: null, slotValues: { headline: 'Meu título' } }, { camadas: paginaComPreco, slides: [{ url: 'https://blob/arte-1.png', arte: { pageId: 'p1' } }] })
    expect(depois.textos).toEqual(['Meu título'])
    expect(depois.origem).toBe('copy-do-post')
    expect(depois.parcial).toBe(true)
    expect(depois.nota).toMatch(/só os campos que o post sobrescreveu/)
  })
  it('a cópia registrada na entrega é inteira; publicado sem registro nenhum declara a indisponibilidade', () => {
    const r = textosDaPeca({ ...entregue, slotValues: { headline: 'Texto A registrado', apoio: 'Apoio registrado', _copiaDaPagina: true } }, { camadas: [], slides: [{ url: 'https://blob/arte-1.png', arte: null }] })
    expect(r).toEqual({ textos: ['Texto A registrado', 'Apoio registrado'], origem: 'copy-registrada-na-entrega' })
    const semNada = textosDaPeca({ ...entregue, status: 'POSTED', laterPostId: null, generationId: null, slotValues: null }, { camadas })
    expect(semNada.textos).toEqual([])
    expect(semNada.indisponiveis).toMatch(/já foi entregue/)
  })
})
