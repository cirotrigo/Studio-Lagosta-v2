import { describe, expect, it } from 'vitest'
import { arteEntregue, paginaDoPostEHistorica, textosDaPeca } from '../textos-da-peca'
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
  it('a SEQUÊNCIA é a do render (R23): as camadas saem pelo `order` (ausente = 0), empate mantém a ordem do array — na página viva e no snapshot, com duplicatas', () => {
    const foraDeOrdem = [
      { id: 'a', name: 'apoio', type: 'text', content: 'segundo', order: 2 },
      { id: 'b', name: 'headline', type: 'text', content: 'primeiro', order: 1 },
      { id: 'c', name: 'cta', type: 'text', content: 'sem order' },
      { id: 'd', name: 'servico', type: 'text', content: 'segundo' , order: 2 },
    ]
    expect(textosDaPeca({ ...viva, slotValues: null }, { camadas: foraDeOrdem }).textos).toEqual(['sem order', 'primeiro', 'segundo', 'segundo'])
    const entregueSnap = textosDaPeca({ pageId: null, status: 'POSTED', laterPostId: null, mediaUrls: ['u1'], generationId: null, slotValues: null }, { slides: [{ url: 'u1', arte: { layersSnapshot: foraDeOrdem } }] })
    expect(entregueSnap.textos).toEqual(['sem order', 'primeiro', 'segundo', 'segundo'])
  })
  it('sem página nem arte: a copy do post; sem nada, lista vazia sem alegação', () => {
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: { headline: 'Solta' } })).toEqual({ textos: ['Solta'], origem: 'copy-do-post' })
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: null })).toEqual({ textos: [] })
  })
  it('camadas ilegíveis sem copy no post: indisponível, nunca erro; com copy, cai na copy — dita PARCIAL, com a nota (R28)', () => {
    expect(textosDaPeca({ ...viva, slotValues: null }, { camadas: '{nao é json' }).indisponiveis).toMatch(/não puderam ser lidas/)
    const soHeadline = textosDaPeca({ ...viva, slotValues: { headline: 'Da copy' } }, { camadas: '{nao é json' })
    expect(soHeadline).toEqual({ textos: ['Da copy'], origem: 'copy-do-post', parcial: true, nota: expect.stringMatching(/não puderam ser lidas.*só os campos que o post sobrescreveu/) })
    // a cópia registrada (`_copiaDaPagina`) numa peça VIVA sem página legível: leitura que PRESERVA a URL de camada, parcial, com a nota
    const registrada = textosDaPeca({ ...viva, slotValues: { _copiaDaPagina: true, headline: 'Da cópia', link: 'https://exemplo.com/x' } }, { camadas: '{nao é json' })
    expect(registrada.textos).toEqual(['Da cópia', 'https://exemplo.com/x'])
    expect(registrada).toMatchObject({ origem: 'copy-registrada', parcial: true, nota: expect.stringMatching(/não puderam ser lidas.*cópia da página registrada/) })
    // sem página nenhuma (pageId null) a cópia registrada continua parcial por natureza, e a nota não fala em ilegível
    const semPagina = textosDaPeca({ ...viva, pageId: null, slotValues: { _copiaDaPagina: true, headline: 'Da cópia' } })
    expect(semPagina).toMatchObject({ textos: ['Da cópia'], origem: 'copy-registrada', parcial: true })
    expect(semPagina.nota).not.toMatch(/não puderam ser lidas/)
  })
  it('R30: pageId preenchido e página NÃO carregada (de outro projeto, ou apagada) não é "sem página": copy do post parcial com a nota; cópia registrada parcial; sem copy, indisponível', () => {
    const soHeadline = textosDaPeca({ ...viva, slotValues: { headline: 'Da copy' } })
    expect(soHeadline).toEqual({ textos: ['Da copy'], origem: 'copy-do-post', parcial: true, nota: expect.stringMatching(/não pôde ser carregada.*só os campos/) })
    const registrada = textosDaPeca({ ...viva, slotValues: { _copiaDaPagina: true, headline: 'Da cópia' } })
    expect(registrada).toMatchObject({ origem: 'copy-registrada', parcial: true, nota: expect.stringMatching(/não pôde ser carregada/) })
    expect(textosDaPeca({ ...viva, slotValues: null }).indisponiveis).toMatch(/não pôde ser carregada/)
    // peça realmente SEM página continua sendo a leitura inteira do que existe
    expect(textosDaPeca({ ...viva, pageId: null, slotValues: { headline: 'Solta' } })).toEqual({ textos: ['Solta'], origem: 'copy-do-post' })
  })
  it('R32: MÍDIA ÚNICA (sem pageId) cuja arte não afirma texto — página da arte fora do projeto/apagada, sem snapshot — é fonte INDISPONÍVEL, não "sem página": sem copy declara; copy própria e cópia registrada voltam PARCIAIS com a nota', () => {
    const unica = { ...viva, pageId: null, mediaUrls: ['u1'] }
    const slides = [{ url: 'u1', arte: { pageId: 'pagina-de-outro', layersSnapshot: null } }]
    expect(textosDaPeca({ ...unica, slotValues: null }, { slides })).toEqual({ textos: [], indisponiveis: expect.stringMatching(/a arte desta peça não afirma texto \(a arte desta mídia não guardou as camadas/) })
    const propria = textosDaPeca({ ...unica, slotValues: { headline: 'Da copy' } }, { slides })
    expect(propria).toEqual({ textos: ['Da copy'], origem: 'copy-do-post', parcial: true, nota: expect.stringMatching(/a arte desta peça não afirma texto.*só os campos que o post sobrescreveu/) })
    const registrada = textosDaPeca({ ...unica, slotValues: { _copiaDaPagina: true, headline: 'Da cópia' } }, { slides })
    expect(registrada).toMatchObject({ textos: ['Da cópia'], origem: 'copy-registrada', parcial: true, nota: expect.stringMatching(/a arte desta peça não afirma texto/) })
    // sem arte NENHUMA registrada para a mídia, a mesma declaração; e a arte que AFIRMA (snapshot legível) continua definitiva
    expect(textosDaPeca({ ...unica, slotValues: null }, { slides: [{ url: 'u1', arte: null }] }).indisponiveis).toMatch(/nenhuma arte registrada/)
    expect(textosDaPeca({ ...unica, slotValues: { headline: 'Da copy' } }, { slides: [{ url: 'u1', arte: { layersSnapshot: [{ id: 'l1', type: 'text', content: 'Do snapshot' }] } }] })).toEqual({ textos: ['Do snapshot'], origem: 'arte' })
    // peça ENTREGUE de mídia única continua no caminho de entregue (passo 3), sem a declaração da viva
    expect(textosDaPeca({ ...unica, status: 'POSTED', slotValues: null }, { slides }).indisponiveis).toMatch(/já foi entregue/)
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
    expect(r12).toMatchObject({ textos: ['B registrado'], origem: 'copy-registrada-na-entrega', parcial: true })
    // R13: URL casa, mas a arte foi re-renderizada por cima do snapshot da composição anterior
    const r13 = textosDaPeca({ pageId: 'p1', status: 'POSTED', laterPostId: null, mediaUrls: ['https://blob/B.png'], generationId: 'gA', slotValues: { headline: 'B registrado', _copiaDaPagina: true } }, { slides: [{ url: 'https://blob/B.png', arte: { layersSnapshot: snap('A antigo'), pageId: 'p1', reRenderizada: true } }] })
    expect(r13).toMatchObject({ textos: ['B registrado'], origem: 'copy-registrada-na-entrega', parcial: true })
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
    expect(unica).toMatchObject({ textos: ['Cópia A da página'], origem: 'copy-registrada-na-entrega', parcial: true })
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
  it('carrossel EDITÁVEL sem nenhum slide legível declara por slide também (R20), com ou sem copy no post — a copy global não cobre as mídias', () => {
    const slides = [{ url: 'u1', arte: null }, { url: 'u2', arte: { layersSnapshot: '{ilegivel', pageId: 'p9' }, camadasDaPagina: '{ilegivel' }]
    for (const status of ['DRAFT', 'SCHEDULED']) {
      for (const slotValues of [null, { headline: 'Copy do post' }]) {
        const r = textosDaPeca({ pageId: null, status, laterPostId: null, mediaUrls: ['u1', 'u2'], generationId: null, slotValues }, { slides })
        expect(r.textos).toEqual([])
        expect(r.origem).toBeUndefined()
        expect(r.indisponiveis).toMatch(/carrossel sem página legível/)
        expect(r.slides?.length).toBe(2)
        expect(r.slides?.every((s) => s.textos.length === 0 && typeof s.indisponiveis === 'string')).toBe(true)
        expect(JSON.stringify(r)).not.toContain('Copy do post')
      }
    }
  })
  it('R36: arte de `post-schedule` (MODELO + copy do post) nunca devolve o texto cru do modelo — vale a copy registrada na arte, PARCIAL; a cópia da página cai na leitura normal', () => {
    const base = { pageId: null, laterPostId: null, mediaUrls: ['u1'], generationId: 'g1', slotValues: null }
    const modelo = [{ id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo' }, { id: 'l2', name: 'apoio', type: 'text', content: 'Apoio do modelo' }]
    // R47: a arte carrega o REGISTRO das camadas que o render desenhou — sem ele, nada se afirma (ver o teste de R47)
    const arte = { pageId: 'tpl', source: 'post-schedule', slotValues: { headline: 'Costela no bafo' }, layersSnapshot: modelo }
    // reagendado por generationId, VIVO: a página da arte (o modelo) está carregada e mesmo assim não é lida
    const vivo = textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte, camadasDaPagina: modelo }] })
    expect(vivo.textos).toEqual(['Costela no bafo'])
    expect(vivo.origem).toBe('arte')
    expect(vivo.parcial).toBe(true)
    expect(JSON.stringify(vivo)).not.toContain('Título do modelo')
    // ENTREGUE: pelo registro das camadas desenhadas, a copy que o render aplicou (parcial)
    const entregue = textosDaPeca({ ...base, status: 'POSTED' }, { slides: [{ url: 'u1', arte, camadasDaPagina: modelo }] })
    expect(entregue).toMatchObject({ textos: ['Costela no bafo'], origem: 'arte', parcial: true })
    // duas mídias com copies DISTINTAS sobre o MESMO modelo: cada slide com a sua
    const duas = textosDaPeca({ ...base, mediaUrls: ['u1', 'u2'], status: 'DRAFT' }, {
      slides: [
        { url: 'u1', arte, camadasDaPagina: modelo },
        { url: 'u2', arte: { ...arte, slotValues: { headline: 'Picanha na brasa', apoio: 'Sexta é dia' } }, camadasDaPagina: modelo },
      ],
    })
    expect(duas.slides?.map((s) => s.textos)).toEqual([['Costela no bafo'], ['Picanha na brasa', 'Sexta é dia']])
    expect(duas.slides?.every((s) => s.parcial === true && s.origem === 'arte')).toBe(true)
    expect(duas.parcial).toBe(true)
    expect(JSON.stringify(duas)).not.toContain('Título do modelo')
    // a CÓPIA da página (`_copiaDaPagina`) não é copy própria: a página da arte É a peça, e a leitura é a normal
    const copia = textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: { ...arte, slotValues: { headline: 'Texto velho', _copiaDaPagina: true } }, camadasDaPagina: modelo }] })
    expect(copia).toEqual({ textos: ['Título do modelo', 'Apoio do modelo'], origem: 'pagina' })
    // procedência que NÃO é post-schedule com slotValues (o compositor grava a copy também): a página/snapshot continuam mandando
    const compositor = textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: { pageId: 'p1', source: 'compositor', slotValues: { headline: 'Costela no bafo' }, layersSnapshot: snap('S') }, camadasDaPagina: snap('P') }] })
    expect(compositor).toEqual({ textos: ['P'], origem: 'pagina' })
    // R37: a arte de post-schedule RE-RENDERIZADA não afirma a copy antiga (o PNG novo é a página atual, sem ela):
    // viva → a página B; entregue → o fallback permitido (cópia registrada) ou indisponível — nunca A. Mídia única e carrossel.
    const reRender = { ...arte, slotValues: { headline: 'Copy A antiga' }, reRenderizada: true }
    const paginaB = [{ id: 'l1', name: 'headline', type: 'text', content: 'Texto B da página' }]
    expect(textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: reRender, camadasDaPagina: paginaB }] })).toEqual({ textos: ['Texto B da página'], origem: 'pagina' })
    const entregueRR = textosDaPeca({ ...base, status: 'POSTED', slotValues: { headline: 'B registrado', _copiaDaPagina: true } }, { slides: [{ url: 'u1', arte: reRender, camadasDaPagina: paginaB }] })
    expect(entregueRR).toMatchObject({ textos: ['B registrado'], origem: 'copy-registrada-na-entrega', parcial: true })
    expect(JSON.stringify(entregueRR)).not.toContain('Copy A antiga')
    const entregueSemRegistro = textosDaPeca({ ...base, status: 'POSTED' }, { slides: [{ url: 'u1', arte: reRender, camadasDaPagina: paginaB }] })
    expect(entregueSemRegistro.textos).toEqual([])
    expect(entregueSemRegistro.indisponiveis).toBeTruthy()
    expect(JSON.stringify(entregueSemRegistro)).not.toContain('Copy A antiga')
    const carrosselRR = textosDaPeca({ ...base, mediaUrls: ['u1', 'u2'], status: 'DRAFT' }, { slides: [{ url: 'u1', arte: reRender, camadasDaPagina: paginaB }, { url: 'u2', arte, camadasDaPagina: modelo }] })
    expect(carrosselRR.slides?.map((s) => s.textos)).toEqual([['Texto B da página'], ['Costela no bafo']])
    expect(JSON.stringify(carrosselRR)).not.toContain('Copy A antiga')
    // arte de modelo SEM copy registrada: declarada, nunca o texto do modelo
    const semCopy = textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: { pageId: 'tpl', source: 'post-schedule', slotValues: {} }, camadasDaPagina: modelo }] })
    expect(semCopy).toEqual({ textos: ['Título do modelo', 'Apoio do modelo'], origem: 'pagina' })
  })

  it('R46: na arte de `post-schedule` o id vence o nome como no render — valor que o render descartou nunca é texto da mídia (viva, entregue, carrossel); sem camadas legíveis do modelo, indisponível sem a copy bruta', () => {
    const base = { pageId: null, laterPostId: null, mediaUrls: ['u1'], generationId: 'g1', slotValues: null }
    // a fixture de R36 com id e nome CONFLITANTES: a camada `l1` se chama "headline" — o render aplica `l1` e descarta `headline`;
    // fora de ordem no array (vale `order`), com caixa do render no apoio e uma camada oculta que também recebe slot
    const modelo = [
      { id: 'l2', name: 'apoio', type: 'text', content: 'Apoio do modelo', order: 2, style: { textTransform: 'uppercase' } },
      { id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', order: 1 },
      { id: 'l3', name: 'oculta', type: 'text', content: 'Placeholder escondido', order: 3, visible: false },
    ]
    const slots = { l1: 'Picanha', headline: 'Costela', apoio: 'sexta é dia', oculta: 'Não desenhado' }
    const arte = { pageId: 'tpl', source: 'post-schedule', slotValues: slots, layersSnapshot: modelo }
    const semRegistro = { pageId: 'tpl', source: 'post-schedule', slotValues: slots }
    // o que o render desenha, pela MESMA função
    expect(aplicarSlotNaCamada(modelo[1], slots).content).toBe('Picanha')
    const esperado = ['Picanha', aplicarCaixa('sexta é dia', 'uppercase')]
    const semDescartado = (r: unknown) => {
      const j = JSON.stringify(r)
      for (const proibido of ['Costela', 'Não desenhado', 'Título do modelo', 'Apoio do modelo', 'Placeholder escondido']) expect(j).not.toContain(proibido)
    }
    // peça VIVA e ENTREGUE (publicada e no publicador), pelo registro das camadas desenhadas (a página carregada não conta — R47)
    for (const peca of [{ status: 'DRAFT' }, { status: 'POSTED' }, { status: 'SCHEDULED', laterPostId: 'zernio-1' }]) {
      const r = textosDaPeca({ ...base, ...peca }, { slides: [{ url: 'u1', arte, camadasDaPagina: modelo }] })
      expect(r).toMatchObject({ textos: esperado, origem: 'arte', parcial: true })
      semDescartado(r)
    }
    // entregue sem a página, mas com o snapshot confiável da arte: a mesma precedência sobre ele
    const peloSnapshot = textosDaPeca({ ...base, status: 'POSTED' }, { slides: [{ url: 'u1', arte: { ...arte, layersSnapshot: modelo } }] })
    expect(peloSnapshot).toMatchObject({ textos: esperado, origem: 'arte', parcial: true })
    semDescartado(peloSnapshot)
    // CARROSSEL vivo e entregue: `textosPorSlide` slide a slide, sem o valor descartado
    const outra = { ...arte, slotValues: { headline: 'Linguiça da casa' } }
    for (const status of ['DRAFT', 'POSTED']) {
      const r = textosDaPeca({ ...base, mediaUrls: ['u1', 'u2'], status }, { slides: [{ url: 'u1', arte, camadasDaPagina: modelo }, { url: 'u2', arte: outra, camadasDaPagina: modelo }] })
      expect(r.slides?.map((s) => s.textos)).toEqual([esperado, ['Linguiça da casa']])
      expect(r.slides?.every((s) => s.origem === 'arte' && s.parcial === true)).toBe(true)
      expect(r.textos).toEqual([...esperado, 'Linguiça da casa'])
      semDescartado(r)
    }

    // SEM registro legível das camadas desenhadas (a página, carregada ou não, não conta — R47; registro ilegível): indisponível, e a copy bruta NÃO vai à mídia
    const semValores = (r: unknown) => {
      semDescartado(r)
      expect(JSON.stringify(r)).not.toContain('Picanha')
      expect(JSON.stringify(r)).not.toContain('sexta é dia')
    }
    const vivaSemPagina = textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: semRegistro }] })
    expect(vivaSemPagina.textos).toEqual([])
    expect(vivaSemPagina.origem).toBeUndefined()
    expect(vivaSemPagina.indisponiveis).toMatch(/a arte desta peça não afirma texto \(arte desenhada de um modelo sem registro das camadas que o render usou.*id da camada vence o nome/)
    semValores(vivaSemPagina)
    const entregueSemPagina = textosDaPeca({ ...base, status: 'POSTED' }, { slides: [{ url: 'u1', arte: semRegistro }] })
    expect(entregueSemPagina.textos).toEqual([])
    expect(entregueSemPagina.indisponiveis).toBeTruthy()
    semValores(entregueSemPagina)
    const ilegivel = textosDaPeca({ ...base, status: 'DRAFT' }, { slides: [{ url: 'u1', arte: { ...semRegistro, layersSnapshot: '{nao é json' }, camadasDaPagina: modelo }] })
    expect(ilegivel.textos).toEqual([])
    expect(ilegivel.indisponiveis).toMatch(/as camadas registradas desta arte de modelo não puderam ser lidas/)
    semValores(ilegivel)
    // carrossel com um slide sem página: aquele slide declara, o outro responde, a leitura é parcial
    const carrosselSemPagina = textosDaPeca({ ...base, mediaUrls: ['u1', 'u2'], status: 'POSTED' }, { slides: [{ url: 'u1', arte: semRegistro, camadasDaPagina: modelo }, { url: 'u2', arte: outra, camadasDaPagina: modelo }] })
    expect(carrosselSemPagina.slides?.[0]).toMatchObject({ textos: [], indisponiveis: expect.stringMatching(/sem registro das camadas/) })
    expect(carrosselSemPagina.slides?.[1].textos).toEqual(['Linguiça da casa'])
    expect(carrosselSemPagina).toMatchObject({ textos: ['Linguiça da casa'], origem: 'arte', parcial: true })
    semValores(carrosselSemPagina)
  })

  it('R47: a estrutura ATUAL do modelo nunca diz o que a arte desenhou — sem o registro das camadas da versão renderizada, indisponível em qualquer estado (vivo, publicado, no publicador, falhou, carrossel), e a copy que o post herdou dessa arte não é afirmada', () => {
    const base = { pageId: null, laterPostId: null, mediaUrls: ['u1'], generationId: 'g1', slotValues: null }
    // o que o render DESENHOU: a camada `l1` chamada "headline"; slots endereçando a mesma camada por id e por nome
    const renderizado = [{ id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', order: 1 }]
    const slots = { l1: 'Picanha', headline: 'Costela' }
    expect(aplicarSlotNaCamada(renderizado[0], slots).content).toBe('Picanha')
    // DEPOIS da entrega a camada foi apagada e recriada com outro id e o mesmo nome — e a caixa, a visibilidade e a
    // ordem também mudam em outras edições. Aplicar os slots na página de hoje daria o valor que o render descartou.
    const recriado = [{ id: 'l2', name: 'headline', type: 'text', content: 'Título do modelo', order: 1 }]
    expect(aplicarSlotNaCamada(recriado[0], slots).content).toBe('Costela')
    const caixaEOrdemTrocadas = [
      { id: 'lx', name: 'apoio', type: 'text', content: 'Apoio novo', order: 0 },
      { id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', order: 5, style: { textTransform: 'uppercase' } },
    ]
    const oculto = [{ ...renderizado[0], visible: false }]
    const semRegistro = { pageId: 'tpl', source: 'post-schedule', slotValues: slots }
    const comRegistro = { ...semRegistro, layersSnapshot: renderizado }
    const nuncaCostela = (r: unknown) => expect(JSON.stringify(r)).not.toContain('Costela')

    for (const peca of [{ status: 'DRAFT' }, { status: 'POSTED' }, { status: 'SCHEDULED', laterPostId: 'zernio-1' }, { status: 'FAILED' }]) {
      for (const paginaDeHoje of [recriado, caixaEOrdemTrocadas, oculto]) {
        // sem registro, com a página de hoje carregada: indisponível — nem "Costela", nem "Picanha"
        const r = textosDaPeca({ ...base, ...peca }, { slides: [{ url: 'u1', arte: semRegistro, camadasDaPagina: paginaDeHoje }] })
        expect(r.textos).toEqual([])
        expect(r.origem).toBeUndefined()
        expect(r.indisponiveis).toMatch(/sem registro das camadas que o render usou/)
        nuncaCostela(r)
        expect(JSON.stringify(r)).not.toContain('Picanha')
        // com o registro: exatamente o que o render aplicou, na caixa e visibilidade registradas, qualquer que seja a página de hoje
        const c = textosDaPeca({ ...base, ...peca }, { slides: [{ url: 'u1', arte: comRegistro, camadasDaPagina: paginaDeHoje }] })
        expect(c).toMatchObject({ textos: ['Picanha'], origem: 'arte', parcial: true })
        nuncaCostela(c)
        // o post sem página própria HERDOU a copy da arte no agendamento: sem registro, ela também não é afirmada
        const h = textosDaPeca({ ...base, ...peca, slotValues: slots }, { slides: [{ url: 'u1', arte: semRegistro, camadasDaPagina: paginaDeHoje }] })
        expect(h.textos).toEqual([])
        expect(h.origem).toBeUndefined()
        expect(h.indisponiveis).toMatch(/herdou dela não diz quais valores chegaram à mídia/)
        nuncaCostela(h)
        expect(JSON.stringify(h)).not.toContain('Picanha')
        // herdada e COM registro: o slide responde pelo registro, e o valor descartado continua fora
        const hc = textosDaPeca({ ...base, ...peca, slotValues: slots }, { slides: [{ url: 'u1', arte: comRegistro, camadasDaPagina: paginaDeHoje }] })
        expect(hc).toMatchObject({ textos: ['Picanha'], origem: 'arte' })
        nuncaCostela(hc)
      }
      // CARROSSEL no mesmo estado: o slide sem registro declara, o com registro responde pelo registro
      const outraComRegistro = { ...comRegistro, slotValues: { l1: 'Linguiça', headline: 'Costela' } }
      const k = textosDaPeca({ ...base, ...peca, mediaUrls: ['u1', 'u2'] }, { slides: [{ url: 'u1', arte: semRegistro, camadasDaPagina: recriado }, { url: 'u2', arte: outraComRegistro, camadasDaPagina: recriado }] })
      expect(k.slides?.[0]).toMatchObject({ textos: [], indisponiveis: expect.stringMatching(/sem registro das camadas/) })
      expect(k.slides?.[1]).toMatchObject({ textos: ['Linguiça'], origem: 'arte', parcial: true })
      expect(k).toMatchObject({ textos: ['Linguiça'], origem: 'arte', parcial: true })
      nuncaCostela(k)
    }
    // a página de caixa/ordem trocadas NÃO muda a leitura do registro: sem caixa alta, só a camada registrada
    const semCaixa = textosDaPeca({ ...base, status: 'POSTED' }, { slides: [{ url: 'u1', arte: comRegistro, camadasDaPagina: caixaEOrdemTrocadas }] })
    expect(semCaixa.textos).toEqual(['Picanha'])
    expect(JSON.stringify(semCaixa)).not.toContain('PICANHA')
    expect(JSON.stringify(semCaixa)).not.toContain('Apoio novo')
  })

  it('R49: o registro PRESENTE que não resolve o slide (nenhum valor aplicado, ou ilegível) não libera o fallback da copy herdada — em nenhum estado', () => {
    const base = { pageId: null, laterPostId: null, mediaUrls: ['u1'], generationId: 'g1' }
    const renderizado = [{ id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', order: 1 }]
    // o render aplica o conteúdo VAZIO pelo id e descarta "Costela"; `agendarPost` filtra o vazio e o post herda { headline: 'Costela' }
    const slots = { l1: { content: '' }, headline: 'Costela' }
    expect(aplicarSlotNaCamada(renderizado[0], slots).content).toBe('')
    const herdada = { headline: 'Costela' }
    const semAplicado = { pageId: 'tpl', source: 'post-schedule', slotValues: slots, layersSnapshot: renderizado }
    const ilegivel = { pageId: 'tpl', source: 'post-schedule', slotValues: { l1: 'Picanha', headline: 'Costela' }, layersSnapshot: '{nao é json' }
    for (const peca of [{ status: 'DRAFT' }, { status: 'POSTED' }, { status: 'SCHEDULED', laterPostId: 'zernio-1' }, { status: 'FAILED' }]) {
      for (const arte of [semAplicado, ilegivel]) {
        const r = textosDaPeca({ ...base, ...peca, slotValues: herdada }, { slides: [{ url: 'u1', arte, camadasDaPagina: renderizado }] })
        expect(r.textos).toEqual([])
        expect(r.origem).toBeUndefined()
        expect(r.indisponiveis).toMatch(/não resolve o texto da mídia|nada a afirmar/)
        expect(JSON.stringify(r)).not.toContain('Costela')
        expect(JSON.stringify(r)).not.toContain('Picanha')
      }
    }
    // controle: com um valor APLICADO pelo registro, o slide responde — e o descartado continua fora
    const aplicado = { ...semAplicado, slotValues: { l1: 'Picanha', headline: 'Costela' } }
    const c = textosDaPeca({ ...base, status: 'POSTED', slotValues: herdada }, { slides: [{ url: 'u1', arte: aplicado }] })
    expect(c).toMatchObject({ textos: ['Picanha'], origem: 'arte', parcial: true })
    expect(JSON.stringify(c)).not.toContain('Costela')
  })

  it('R50: o post que MANTÉM pageId e cuja arte entregue é de modelo sem leitura do slide não devolve a copy bruta pelo fallback — sem registro, ilegível ou nenhum valor aplicado; controles: página viva legível e registro válido', () => {
    const base = { pageId: 'tpl', mediaUrls: ['u1'], generationId: 'g1' }
    const renderizado = [{ id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', order: 1 }]
    const slots = { l1: 'Picanha', headline: 'Costela' }
    expect(aplicarSlotNaCamada(renderizado[0], slots).content).toBe('Picanha')
    const semRegistro = { pageId: 'tpl', source: 'post-schedule', slotValues: slots }
    const ilegivel = { ...semRegistro, layersSnapshot: '{nao é json' }
    const vazioPeloId = { pageId: 'tpl', source: 'post-schedule', slotValues: { l1: { content: '' }, headline: 'Costela' }, layersSnapshot: renderizado }
    const entregues = [{ status: 'POSTED', laterPostId: null }, { status: 'POSTING', laterPostId: null }, { status: 'FAILED', laterPostId: null }, { status: 'SCHEDULED', laterPostId: 'zernio-1' }]
    for (const peca of entregues) {
      for (const [arte, sv] of [[semRegistro, slots], [ilegivel, slots], [vazioPeloId, { headline: 'Costela' }]] as const) {
        const r = textosDaPeca({ ...base, ...peca, slotValues: sv }, { slides: [{ url: 'u1', arte, camadasDaPagina: renderizado }] })
        expect(r.textos).toEqual([])
        expect(r.origem).toBeUndefined()
        expect(r.indisponiveis).toMatch(/nada a afirmar/)
        expect(JSON.stringify(r)).not.toContain('Costela')
      }
    }
    // controle: peça VIVA com a página legível responde pela página, aplicando os slots como o render (id vence nome)
    const viva = textosDaPeca({ ...base, status: 'DRAFT', laterPostId: null, slotValues: slots }, { camadas: renderizado, slides: [{ url: 'u1', arte: semRegistro, camadasDaPagina: renderizado }] })
    expect(viva.textos).toEqual(['Picanha'])
    expect(JSON.stringify(viva)).not.toContain('Costela')
    // controle: entregue com registro válido responde pelo registro
    const comRegistro = textosDaPeca({ ...base, status: 'POSTED', laterPostId: null, slotValues: slots }, { slides: [{ url: 'u1', arte: { ...semRegistro, layersSnapshot: renderizado } }] })
    expect(comRegistro).toMatchObject({ textos: ['Picanha'], origem: 'arte', parcial: true })
    expect(JSON.stringify(comRegistro)).not.toContain('Costela')
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
  it('a cópia registrada na entrega mantém a URL de camada de texto e é declarada PARCIAL (sem a caixa do render nem a ordem) — R19; publicado sem registro nenhum declara a indisponibilidade', () => {
    const r = textosDaPeca({ ...entregue, slotValues: { headline: 'Texto A registrado', cta: 'https://cliente.com/reservas', apoio: 'Apoio registrado', _copiaDaPagina: true } }, { camadas: [], slides: [{ url: 'https://blob/arte-1.png', arte: null }] })
    expect(r.textos.sort()).toEqual(['Apoio registrado', 'Texto A registrado', 'https://cliente.com/reservas'])
    expect(r.origem).toBe('copy-registrada-na-entrega')
    expect(r.parcial).toBe(true)
    expect(r.nota).toMatch(/ANTES da caixa/)
    const semNada = textosDaPeca({ ...entregue, status: 'POSTED', laterPostId: null, generationId: null, slotValues: null }, { camadas })
    expect(semNada.textos).toEqual([])
    expect(semNada.indisponiveis).toMatch(/já foi entregue/)
  })
})

describe('R42 — a copy herdada da arte com que o post foi agendado cai quando essa arte é RE-RENDERIZADA depois', () => {
  const snapA = [{ id: 'l1', name: 'headline', type: 'text', content: 'Copy A antiga' }]
  const semPagina = { pageId: null, generationId: 'gA', mediaUrls: ['https://blob/B.png'], slotValues: { headline: 'Copy A herdada' } }
  const arteRR = { layersSnapshot: snapA, pageId: 'p1', source: 'post-schedule', slotValues: { headline: 'Copy A herdada' }, reRenderizada: true }
  it('entregue: a copy do post NÃO é atribuída à mídia re-renderizada — indisponível, com o porquê', () => {
    for (const status of ['POSTED', 'POSTING', 'FAILED']) {
      const r = textosDaPeca({ ...semPagina, status, laterPostId: null }, { slides: [{ url: 'https://blob/B.png', arte: arteRR }] })
      expect(r.textos).toEqual([])
      expect(r.indisponiveis).toMatch(/re-renderizada e o post \(sem página própria\) não guarda registro textual confiável/)
      // R45: a nota não afirma cronologia (antes/depois do agendamento) nem copy guardada que os dados não comprovam
      expect(r.indisponiveis).not.toMatch(/DEPOIS do agendamento|versão anterior/)
      expect(JSON.stringify(r)).not.toContain('Copy A')
    }
    const noPublicador = textosDaPeca({ ...semPagina, status: 'SCHEDULED', laterPostId: 'zernio-1' }, { slides: [{ url: 'https://blob/B.png', arte: arteRR }] })
    expect(noPublicador.indisponiveis).toMatch(/não guarda registro textual confiável/)
  })
  it('viva com a página da arte ilegível: também não cai na copy do post (nem parcial)', () => {
    const r = textosDaPeca({ ...semPagina, status: 'DRAFT', laterPostId: null }, { slides: [{ url: 'https://blob/B.png', arte: arteRR, camadasDaPagina: '{{ilegível' }] })
    expect(r.textos).toEqual([])
    expect(r.origem).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('Copy A')
  })
  it('viva com a página da arte legível: a mídia É a página atual — vale ela (passo 2), a copy A herdada some', () => {
    const r = textosDaPeca({ ...semPagina, status: 'DRAFT', laterPostId: null }, { slides: [{ url: 'https://blob/B.png', arte: arteRR, camadasDaPagina: [{ id: 'l1', name: 'headline', type: 'text', content: 'Página atual B' }] }] })
    expect(r.textos).toEqual(['Página atual B'])
    expect(r.origem).toBe('pagina')
  })
  it('controle: a MESMA arte não re-renderizada mantém a copy legítima (parcial, origem arte); e post COM página própria não é alcançado pela regra', () => {
    const ctl = textosDaPeca({ ...semPagina, status: 'POSTED', laterPostId: null }, { slides: [{ url: 'https://blob/B.png', arte: { ...arteRR, reRenderizada: false } }] })
    expect(ctl.textos).toEqual(['Copy A herdada'])
    expect(ctl.origem).toBe('arte')
    expect(ctl.parcial).toBe(true)
    const comPagina = textosDaPeca({ ...semPagina, pageId: 'p9', status: 'POSTED', laterPostId: null, slotValues: { headline: 'Sobrescrito', _copiaDaPagina: true } }, { slides: [{ url: 'https://blob/B.png', arte: arteRR }] })
    expect(comPagina.origem).toBe('copy-registrada-na-entrega')
  })
})

describe('copy visual REGRAVADA no re-render (marcador do PR 0): vale para a mídia; sem o marcador, R13/R37/R42 como antes', () => {
  const snapA = [{ id: 'l1', name: 'headline', type: 'text', content: 'Copy A antiga' }]
  const semPagina = { pageId: null, generationId: 'gA', mediaUrls: ['https://blob/B.png'], slotValues: { headline: 'Copy A herdada' } }
  const regravada = { layersSnapshot: snapA, pageId: 'p1', source: 'ajuste-arte', slotValues: { headline: 'Copy B regravada', 'headline#2': 'Até 15h' }, reRenderizada: true, copyVisualRegravada: true }
  const semMarca = { ...regravada, copyVisualRegravada: false }

  it('entregue, post sem página (o caso do R42): a copy REGRAVADA da arte é afirmada — nunca a herdada A nem o snapshot A; sem o marcador, indisponível como antes', () => {
    const estados: Array<[string, string | null]> = [['POSTED', null], ['POSTING', null], ['FAILED', null], ['SCHEDULED', 'zernio-1']]
    for (const [status, laterPostId] of estados) {
      const r = textosDaPeca({ ...semPagina, status, laterPostId }, { slides: [{ url: 'https://blob/B.png', arte: regravada }] })
      expect(r).toMatchObject({ textos: ['Copy B regravada', 'Até 15h'], origem: 'arte', parcial: true })
      expect(r.nota).toMatch(/copy visual regravada junto do PNG/)
      expect(JSON.stringify(r)).not.toContain('Copy A')
      const controle = textosDaPeca({ ...semPagina, status, laterPostId }, { slides: [{ url: 'https://blob/B.png', arte: semMarca }] })
      expect(controle.textos).toEqual([])
      expect(controle.origem).toBeUndefined()
      expect(controle.indisponiveis).toMatch(/re-renderizada e o post \(sem página própria\) não guarda registro textual confiável/)
      expect(JSON.stringify(controle)).not.toContain('Copy')
    }
  })

  it('viva: a página legível manda (é a fonte do render); página ilegível ou não carregada → a copy regravada, nunca a herdada; sem o marcador, nada', () => {
    const vivo = { ...semPagina, status: 'DRAFT', laterPostId: null }
    const pagina = [{ id: 'l1', name: 'headline', type: 'text', content: 'Página atual C' }]
    expect(textosDaPeca(vivo, { slides: [{ url: 'https://blob/B.png', arte: regravada, camadasDaPagina: pagina }] })).toEqual({ textos: ['Página atual C'], origem: 'pagina' })
    for (const camadasDaPagina of ['{{ilegível', undefined]) {
      const r = textosDaPeca(vivo, { slides: [{ url: 'https://blob/B.png', arte: regravada, camadasDaPagina }] })
      expect(r).toMatchObject({ textos: ['Copy B regravada', 'Até 15h'], origem: 'arte', parcial: true })
      expect(JSON.stringify(r)).not.toContain('Copy A')
      const controle = textosDaPeca(vivo, { slides: [{ url: 'https://blob/B.png', arte: semMarca, camadasDaPagina }] })
      expect(controle.textos).toEqual([])
      expect(JSON.stringify(controle)).not.toContain('Copy')
    }
  })

  it('regravada VAZIA (`{}`: a página desenhada não tinha texto visível) é leitura definitiva — nem a herdada, nem o snapshot', () => {
    const r = textosDaPeca({ ...semPagina, status: 'POSTED', laterPostId: null }, { slides: [{ url: 'https://blob/B.png', arte: { ...regravada, slotValues: {} } }] })
    expect(r).toEqual({ textos: [], origem: 'arte' })
  })

  it('carrossel: o slide re-renderizado com a copy regravada entra com a nota DELE, separada da nota da arte de modelo; sem o marcador o slide fica indisponível', () => {
    const modelo = { pageId: 'tpl', source: 'post-schedule', slotValues: { headline: 'Costela no bafo' }, layersSnapshot: [{ id: 'l9', name: 'headline', type: 'text', content: 'Título do modelo' }] }
    const post = { pageId: null, generationId: null, mediaUrls: ['https://blob/B.png', 'https://blob/C.png'], slotValues: null, status: 'POSTED', laterPostId: null }
    const r = textosDaPeca(post, { slides: [{ url: 'https://blob/B.png', arte: regravada }, { url: 'https://blob/C.png', arte: modelo }] })
    expect(r.textos).toEqual(['Copy B regravada', 'Até 15h', 'Costela no bafo'])
    expect(r).toMatchObject({ origem: 'arte', parcial: true })
    expect(r.nota).toMatch(/mídia\(s\) 1: arte re-renderizada com a copy visual regravada/)
    expect(r.nota).toMatch(/mídia\(s\) 2: arte desenhada de um MODELO/)
    expect(r.slides?.[0]).toMatchObject({ slide: 1, origem: 'arte', parcial: true })
    const controle = textosDaPeca(post, { slides: [{ url: 'https://blob/B.png', arte: semMarca }, { url: 'https://blob/C.png', arte: modelo }] })
    expect(controle.textos).toEqual(['Costela no bafo'])
    expect(controle.slides?.[0].indisponiveis).toMatch(/re-renderizada/)
    expect(controle.nota).toMatch(/1 de 2 mídia\(s\) sem arte registrada/)
    expect(controle.nota).not.toMatch(/regravada/)
    expect(JSON.stringify(controle)).not.toContain('Copy')
  })

  it('arte de `post-schedule` re-renderizada COM o marcador: a copy regravada é o texto da página desenhada — não volta à leitura de modelo (R37) e não reabre R47–R50', () => {
    const modeloRR = { layersSnapshot: [{ id: 'l1', name: 'headline', type: 'text', content: 'Registro antigo' }], pageId: 'tpl', source: 'post-schedule', slotValues: { headline: 'Título do modelo' }, reRenderizada: true, copyVisualRegravada: true }
    const semPag = textosDaPeca({ ...semPagina, status: 'POSTED', laterPostId: null, slotValues: { headline: 'Costela herdada' } }, { slides: [{ url: 'https://blob/B.png', arte: modeloRR }] })
    expect(semPag).toMatchObject({ textos: ['Título do modelo'], origem: 'arte', parcial: true })
    expect(semPag.nota).toMatch(/copy visual regravada/)
    expect(semPag.nota).not.toMatch(/MODELO/)
    expect(JSON.stringify(semPag)).not.toMatch(/Costela herdada|Registro antigo/)
    const comPagina = textosDaPeca({ ...semPagina, pageId: 'p9', status: 'POSTED', laterPostId: null, slotValues: { headline: 'Costela herdada' } }, { slides: [{ url: 'https://blob/B.png', arte: modeloRR }] })
    expect(comPagina).toMatchObject({ textos: ['Título do modelo'], origem: 'arte' })
    // controle: sem o marcador, o mesmo post sem página segue indisponível (R42) e o com página segue indisponível (R50 não é alcançado: é R37)
    const semMarcaSemPag = textosDaPeca({ ...semPagina, status: 'POSTED', laterPostId: null, slotValues: { headline: 'Costela herdada' } }, { slides: [{ url: 'https://blob/B.png', arte: { ...modeloRR, copyVisualRegravada: false } }] })
    expect(semMarcaSemPag.textos).toEqual([])
    expect(JSON.stringify(semMarcaSemPag)).not.toMatch(/Costela herdada|Registro antigo|Título do modelo/)
  })

  it('o marcador sem `reRenderizada` não muda nada: a arte não re-renderizada segue pelo snapshot confiável', () => {
    const r = textosDaPeca({ ...semPagina, status: 'POSTED', laterPostId: null }, { slides: [{ url: 'https://blob/B.png', arte: { ...regravada, reRenderizada: false } }] })
    expect(r).toEqual({ textos: ['Copy A antiga'], origem: 'arte' })
  })
})

describe('R51 — página do post que ficou só como vínculo histórico', () => {
  const pagina = [{ id: 'l1', name: 'headline', type: 'text', content: 'Texto da página A' }]
  const B = 'https://blob/B.png'
  it('NOT_NEEDED com a mídia de OUTRA arte: a página não é lida — a peça se resolve pela mídia', () => {
    const post = { ...viva, pageId: 'pA', renderStatus: 'NOT_NEEDED', mediaUrls: [B], slotValues: null }
    const r = textosDaPeca(post, { camadas: pagina, slides: [{ url: B, arte: { pageId: 'pB', reRenderizada: true } }] })
    expect(r.textos).toEqual([])
    expect(r.origem).toBeUndefined()
    expect(r.indisponiveis).toBeTruthy()
    expect(paginaDoPostEHistorica(post, { pageId: 'pB' })).toBe(true)
  })
  it('NOT_NEEDED com a mídia que É a arte da própria página, e RENDERED: a página continua sendo a fonte', () => {
    expect(textosDaPeca({ ...viva, pageId: 'pA', renderStatus: 'NOT_NEEDED', mediaUrls: [B], slotValues: null }, { camadas: pagina, slides: [{ url: B, arte: { pageId: 'pA' } }] })).toEqual({ textos: ['Texto da página A'], origem: 'pagina' })
    expect(textosDaPeca({ ...viva, pageId: 'pA', renderStatus: 'RENDERED', mediaUrls: [B], slotValues: null }, { camadas: pagina, slides: [{ url: B, arte: null }] })).toEqual({ textos: ['Texto da página A'], origem: 'pagina' })
  })
})
