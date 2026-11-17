import { describe, expect, it, vi } from 'vitest'
import { CreativeError } from '../errors'
import {
  apagarArte,
  impedimentosDeApagar,
  itemDaGaleria,
  limparGaleria,
  motivoDeProteger,
  motivoDeManterOBlob,
  nomeDaArte,
  periodoDaLista,
  postsQueUsam,
  type ArteDaGaleria,
  type CandidataAFaxina,
  type DepsDeApagarArte,
  type PaginaDaArte,
  type PostDaAgenda,
  type UsoDaPagina,
} from '../galeria-regras'

/**
 * As regras de `apagar-arte` e `listar-artes` SEM banco: as leituras e a exclusão entram por dublê
 * (`DepsDeApagarArte`). O que se prova aqui é que nenhuma recusa chega a chamar `apagar`.
 */

const URL_DA_ARTE = 'https://x.public.blob.vercel-storage.com/arte-rapida/7/pg1-1.png'
const AGORA = new Date('2026-11-17T15:00:00.000Z')

const arte = (extra: Partial<ArteDaGaleria> = {}): ArteDaGaleria => ({
  id: 'gen1',
  projectId: 7,
  status: 'COMPLETED',
  createdAt: new Date('2026-11-17T12:00:00.000Z'),
  resultUrl: URL_DA_ARTE,
  fileName: 'Story teste.png',
  templateName: 'Semana 47',
  googleDriveFileId: 'drive1',
  fieldValues: { pageId: 'pg1' },
  carouselGroupId: null,
  styleRefAt: null,
  ...extra,
})

const post = (extra: Partial<PostDaAgenda> = {}): PostDaAgenda => ({
  id: 'post1',
  status: 'DRAFT',
  postType: 'STORY',
  scheduledDatetime: new Date('2026-11-18T14:30:00.000Z'),
  laterPostId: null,
  generationId: 'gen1',
  mediaUrls: [URL_DA_ARTE],
  renderedImageUrl: null,
  ...extra,
})

const pagina = (extra: Partial<PaginaDaArte> = {}): PaginaDaArte => ({
  id: 'pg1',
  name: 'Story teste',
  templateId: 570,
  thumbnail: 'https://x.public.blob.vercel-storage.com/outra-miniatura.png',
  isTemplate: false,
  order: 3,
  ...extra,
})

const paginaLivre: UsoDaPagina = { posts: 0, outrasArtes: 0, itensDePlano: 0, referenciaAprovada: false, paginasNaPasta: 5 }

function deps(extra: Partial<DepsDeApagarArte> = {}) {
  const apagar = vi.fn(async (_a: ArteDaGaleria, o: { manterBlob: boolean }) => ({
    drive: 'na-lixeira' as const,
    blob: o.manterBlob ? ('mantido' as const) : ('apagado' as const),
  }))
  const d: DepsDeApagarArte = {
    lerArte: async () => arte(),
    lerPostsDaArte: async () => [],
    lerPagina: async () => pagina(),
    contarOutrasArtesComAImagem: async () => 0,
    estaNoBlob: (url) => url.includes('blob.vercel-storage.com'),
    apagar,
    lerUsoDaPagina: vi.fn(async () => paginaLivre),
    apagarPagina: vi.fn(async () => undefined),
    appUrl: 'https://studio.test',
    agora: AGORA,
    ...extra,
  }
  return { d, apagar, apagarPagina: d.apagarPagina as ReturnType<typeof vi.fn>, lerUsoDaPagina: d.lerUsoDaPagina as ReturnType<typeof vi.fn> }
}

async function recusa(promessa: Promise<unknown>): Promise<CreativeError> {
  const erro = await promessa.then(
    () => null,
    (e) => e,
  )
  expect(erro).toBeInstanceOf(CreativeError)
  return erro as CreativeError
}

describe('apagar-arte: o caminho feliz', () => {
  it('arte sem post apaga Drive, blob e linha, e a página fica', async () => {
    const { d, apagar } = deps()
    const r = await apagarArte({ projectId: 7, generationId: 'gen1' }, d)
    expect(apagar).toHaveBeenCalledTimes(1)
    expect(apagar).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen1' }), { manterBlob: false })
    expect(r).toMatchObject({
      apagada: true,
      drive: 'na-lixeira',
      blob: 'apagado',
      arte: { generationId: 'gen1', nome: 'Story teste' },
      pagina: { pageId: 'pg1', mantida: true, editUrl: 'https://studio.test/templates/570/editor?pageId=pg1' },
    })
    expect((r as { avisos: string[] }).avisos.join(' ')).toContain('NÃO é apagada')
  })

  it('post de OUTRA arte na agenda não segura esta', async () => {
    const { d, apagar } = deps({
      lerPostsDaArte: async () => [post({ generationId: 'gen2', mediaUrls: ['https://x/outra.png'] })],
    })
    await apagarArte({ projectId: 7, generationId: 'gen1' }, d)
    expect(apagar).toHaveBeenCalledTimes(1)
  })

  it('arte sem página apaga sem bloco de página', async () => {
    const { d } = deps({ lerArte: async () => arte({ fieldValues: {} }), lerPagina: async () => null })
    const r = await apagarArte({ projectId: 7, generationId: 'gen1' }, d)
    expect(r).not.toHaveProperty('pagina')
  })
})

describe('apagar-arte: as recusas nunca chegam à exclusão', () => {
  it('arte de outro cliente responde como inexistente', async () => {
    const { d, apagar } = deps({ lerArte: async () => arte({ projectId: 9 }) })
    const erro = await recusa(apagarArte({ projectId: 7, generationId: 'gen1' }, d))
    expect(erro.code).toBe('ARTE_NAO_ENCONTRADA')
    expect(erro.status).toBe(404)
    expect(erro.message).not.toContain('9')
    expect(apagar).not.toHaveBeenCalled()
  })

  it('arte que não existe: ARTE_NAO_ENCONTRADA, também na simulação', async () => {
    const { d, apagar } = deps({ lerArte: async () => null })
    expect((await recusa(apagarArte({ projectId: 7, generationId: 'x' }, d))).code).toBe('ARTE_NAO_ENCONTRADA')
    expect((await recusa(apagarArte({ projectId: 7, generationId: 'x', simular: true }, d))).code).toBe('ARTE_NAO_ENCONTRADA')
    expect(apagar).not.toHaveBeenCalled()
  })

  it.each([
    ['DRAFT', 'rascunho'],
    ['SCHEDULED', 'agendado'],
    ['POSTING', 'publicando'],
    ['POSTED', 'publicado'],
    ['FAILED', 'falhou'],
  ])('post %s na agenda segura a arte (%s)', async (status, situacao) => {
    const { d, apagar } = deps({ lerPostsDaArte: async () => [post({ status })] })
    const erro = await recusa(apagarArte({ projectId: 7, generationId: 'gen1' }, d))
    expect(erro.code).toBe('ARTE_EM_USO_NA_AGENDA')
    expect(erro.status).toBe(409)
    expect(erro.message).toContain(situacao)
    expect(erro.details?.impedimentos).toEqual([expect.objectContaining({ postId: 'post1', situacao })])
    expect(apagar).not.toHaveBeenCalled()
  })

  it('post que já foi para o Zernio é intocável, e esse código vem primeiro', async () => {
    const { d, apagar } = deps({
      lerPostsDaArte: async () => [post({ id: 'rascunho' }), post({ id: 'no-zernio', status: 'SCHEDULED', laterPostId: 'later_1' })],
    })
    const erro = await recusa(apagarArte({ projectId: 7, generationId: 'gen1' }, d))
    expect(erro.code).toBe('ARTE_EM_POST_NO_ZERNIO')
    expect((erro.details?.impedimentos as Array<{ codigo: string }>).map((i) => i.codigo)).toEqual([
      'ARTE_EM_POST_NO_ZERNIO',
      'ARTE_EM_USO_NA_AGENDA',
    ])
    expect(apagar).not.toHaveBeenCalled()
  })

  it('post que usa a IMAGEM da arte (sem o vínculo) também segura', async () => {
    const soPelaUrl = post({ generationId: 'gen-do-primeiro-slide' })
    const peloRender = post({ generationId: null, mediaUrls: [], renderedImageUrl: URL_DA_ARTE })
    expect(postsQueUsam(arte(), [soPelaUrl, peloRender])).toHaveLength(2)
    const { d, apagar } = deps({ lerPostsDaArte: async () => [soPelaUrl] })
    expect((await recusa(apagarArte({ projectId: 7, generationId: 'gen1' }, d))).code).toBe('ARTE_EM_USO_NA_AGENDA')
    expect(apagar).not.toHaveBeenCalled()
  })

  it('publicado não tem saída; rascunho aponta cancelar-post e trocar-arte-do-post', () => {
    const [publicado] = impedimentosDeApagar(arte(), [post({ status: 'POSTED' })], AGORA)
    const [rascunho] = impedimentosDeApagar(arte(), [post()], AGORA)
    expect(publicado.comoResolver).toContain('não se apaga')
    expect(rascunho.comoResolver).toContain('cancelar-post')
    expect(rascunho.comoResolver).toContain('trocar-arte-do-post')
  })

  it('foto de cena do acervo não é arte da galeria', async () => {
    const { d, apagar } = deps({ lerArte: async () => arte({ fieldValues: { track: 'imagem' } }) })
    expect((await recusa(apagarArte({ projectId: 7, generationId: 'gen1' }, d))).code).toBe('NAO_E_ARTE_DA_GALERIA')
    expect(apagar).not.toHaveBeenCalled()
  })

  it('arte ainda sendo gerada espera; PROCESSING velha (fila que morreu) pode sair', async () => {
    const recente = arte({ status: 'PROCESSING', createdAt: new Date(AGORA.getTime() - 2 * 60_000) })
    const velha = arte({ status: 'PROCESSING', createdAt: new Date(AGORA.getTime() - 60 * 60_000) })
    const a = deps({ lerArte: async () => recente })
    expect((await recusa(apagarArte({ projectId: 7, generationId: 'gen1' }, a.d))).code).toBe('ARTE_EM_ANDAMENTO')
    expect(a.apagar).not.toHaveBeenCalled()
    const b = deps({ lerArte: async () => velha })
    await apagarArte({ projectId: 7, generationId: 'gen1' }, b.d)
    expect(b.apagar).toHaveBeenCalledTimes(1)
  })
})

describe('apagar-arte: simular não grava', () => {
  it('sem impedimento: diz o que sairia e não apaga', async () => {
    const { d, apagar } = deps()
    const r = await apagarArte({ projectId: 7, generationId: 'gen1', simular: true }, d)
    expect(apagar).not.toHaveBeenCalled()
    expect(r).toMatchObject({
      simulacao: true,
      podeApagar: true,
      apagaria: { arteNaGaleria: true, arquivoNoDrive: true, imagemNoArmazenamento: true },
      impedimentos: [],
      pagina: { pageId: 'pg1', mantida: true },
    })
  })

  it('arte que mora só no Drive: não promete apagar imagem do armazenamento', async () => {
    const { d } = deps({ lerArte: async () => arte({ resultUrl: 'https://lh3.googleusercontent.com/d/abc' }) })
    const r = await apagarArte({ projectId: 7, generationId: 'gen1', simular: true }, d)
    expect(r).toMatchObject({ podeApagar: true, apagaria: { arquivoNoDrive: true, imagemNoArmazenamento: false } })
  })

  it('com impedimento: devolve o motivo em vez de lançar', async () => {
    const { d, apagar } = deps({ lerPostsDaArte: async () => [post({ status: 'SCHEDULED', laterPostId: 'later_1' })] })
    const r = await apagarArte({ projectId: 7, generationId: 'gen1', simular: true }, d)
    expect(apagar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ simulacao: true, podeApagar: false, impedimentos: [{ codigo: 'ARTE_EM_POST_NO_ZERNIO', postId: 'post1' }] })
  })
})

describe('apagar-arte: a imagem que ainda serve a alguém fica', () => {
  it('imagem que é a miniatura da página: o blob é mantido e a resposta avisa', async () => {
    const { d, apagar } = deps({ lerPagina: async () => pagina({ thumbnail: URL_DA_ARTE }) })
    const r = await apagarArte({ projectId: 7, generationId: 'gen1' }, d)
    expect(apagar).toHaveBeenCalledWith(expect.anything(), { manterBlob: true })
    expect(r).toMatchObject({ apagada: true, blob: 'mantido' })
    expect((r as { avisos: string[] }).avisos.join(' ')).toContain('miniatura da página')
  })

  it('outra arte com o mesmo arquivo: o blob é mantido', async () => {
    const { d, apagar } = deps({ contarOutrasArtesComAImagem: async () => 1 })
    await apagarArte({ projectId: 7, generationId: 'gen1' }, d)
    expect(apagar).toHaveBeenCalledWith(expect.anything(), { manterBlob: true })
  })

  it('a simulação já diz que a imagem fica', async () => {
    const { d } = deps({ lerPagina: async () => pagina({ thumbnail: URL_DA_ARTE }) })
    const r = await apagarArte({ projectId: 7, generationId: 'gen1', simular: true }, d)
    expect(r).toMatchObject({ apagaria: { imagemNoArmazenamento: false } })
  })
})

describe('apagar-arte: a página só sai a pedido, e só quando ninguém depende dela', () => {
  it('sem apagarPagina a página nem é consultada', async () => {
    const { d, apagarPagina, lerUsoDaPagina } = deps()
    const r = await apagarArte({ projectId: 7, generationId: 'gen1' }, d)
    expect(lerUsoDaPagina).not.toHaveBeenCalled()
    expect(apagarPagina).not.toHaveBeenCalled()
    expect(r).toMatchObject({ pagina: { mantida: true } })
  })

  it('apagarPagina com a página livre: a arte sai, depois a página, e a miniatura não segura mais o blob', async () => {
    const ordem: string[] = []
    const { d, apagar, apagarPagina } = deps({ lerPagina: async () => pagina({ thumbnail: URL_DA_ARTE }) })
    apagar.mockImplementation(async () => (ordem.push('arte'), { drive: 'na-lixeira' as const, blob: 'apagado' as const }))
    apagarPagina.mockImplementation(async () => void ordem.push('pagina'))
    const r = await apagarArte({ projectId: 7, generationId: 'gen1', apagarPagina: true }, d)
    expect(ordem).toEqual(['arte', 'pagina'])
    expect(apagar).toHaveBeenCalledWith(expect.anything(), { manterBlob: false })
    expect(apagarPagina).toHaveBeenCalledWith(expect.objectContaining({ id: 'pg1', templateId: 570, order: 3 }))
    expect(r).toMatchObject({ apagada: true, pagina: { pageId: 'pg1', apagada: true } })
    expect((r as { pagina: object }).pagina).not.toHaveProperty('mantida')
  })

  it.each([
    ['modelo do cliente', { isTemplate: true }, {}, 'MODELO'],
    ['post da agenda aponta a página', {}, { posts: 1 }, 'post(s) da agenda'],
    ['referência de layout aprovada', {}, { referenciaAprovada: true }, 'referência de layout'],
    ['item de plano aponta a página', {}, { itensDePlano: 2 }, 'plano de conteúdo'],
    ['outra arte nasceu da página', {}, { outrasArtes: 1 }, 'arte(s) da galeria'],
    ['última página da pasta', {}, { paginasNaPasta: 1 }, 'última página'],
  ])('%s: a página fica com o motivo, e a arte sai do mesmo jeito', async (_caso, daPagina, uso, trecho) => {
    const { d, apagar, apagarPagina } = deps({
      lerPagina: async () => pagina({ thumbnail: URL_DA_ARTE, ...daPagina }),
      lerUsoDaPagina: async () => ({ ...paginaLivre, ...uso }),
    })
    const r = (await apagarArte({ projectId: 7, generationId: 'gen1', apagarPagina: true }, d)) as {
      pagina: { mantida?: boolean; motivoDeManter?: string }
      avisos: string[]
    }
    expect(apagarPagina).not.toHaveBeenCalled()
    // A página fica, então a miniatura dela continua segurando o blob.
    expect(apagar).toHaveBeenCalledWith(expect.anything(), { manterBlob: true })
    expect(r.pagina.mantida).toBe(true)
    expect(r.pagina.motivoDeManter).toContain(trecho)
    expect(r.avisos[0]).toContain('NÃO é apagada, mesmo com apagarPagina')
  })

  it('arte presa a post: nem a arte nem a página saem', async () => {
    const { d, apagar, apagarPagina } = deps({ lerPostsDaArte: async () => [post()] })
    expect((await recusa(apagarArte({ projectId: 7, generationId: 'gen1', apagarPagina: true }, d))).code).toBe('ARTE_EM_USO_NA_AGENDA')
    expect(apagar).not.toHaveBeenCalled()
    expect(apagarPagina).not.toHaveBeenCalled()
  })

  it('simular com apagarPagina diz que a página sairia e não apaga nada', async () => {
    const { d, apagar, apagarPagina } = deps()
    const r = await apagarArte({ projectId: 7, generationId: 'gen1', apagarPagina: true, simular: true }, d)
    expect(r).toMatchObject({ simulacao: true, apagaria: { pagina: true }, pagina: { apagada: true } })
    expect(apagar).not.toHaveBeenCalled()
    expect(apagarPagina).not.toHaveBeenCalled()
  })

  it('a exclusão da página falha depois de a arte sair: a resposta diz, não finge', async () => {
    const { d, apagarPagina } = deps()
    apagarPagina.mockRejectedValueOnce(new Error('banco fora'))
    const r = (await apagarArte({ projectId: 7, generationId: 'gen1', apagarPagina: true }, d)) as {
      apagada: boolean
      pagina: { mantida?: boolean }
      avisos: string[]
    }
    expect(r.apagada).toBe(true)
    expect(r.pagina.mantida).toBe(true)
    expect(r.avisos[0]).toContain('A arte foi apagada, mas a página')
  })

  it('arte sem página: apagarPagina vira aviso', async () => {
    const { d, apagarPagina } = deps({ lerArte: async () => arte({ fieldValues: {} }), lerPagina: async () => null })
    const r = (await apagarArte({ projectId: 7, generationId: 'gen1', apagarPagina: true }, d)) as { avisos: string[] }
    expect(apagarPagina).not.toHaveBeenCalled()
    expect(r.avisos.join(' ')).toContain('não tem página')
  })
})

describe('o blob que ainda serve a alguém fica (a regra das rotas do app e do conector)', () => {
  it('mídia de post, miniatura de página e outra arte seguram; sem ninguém, sai', () => {
    const a = { resultUrl: URL_DA_ARTE }
    expect(motivoDeManterOBlob(a, null, 0, 2)).toContain('post(s) da agenda')
    expect(motivoDeManterOBlob(a, { name: 'P', thumbnail: URL_DA_ARTE }, 0)).toContain('miniatura')
    expect(motivoDeManterOBlob(a, { name: 'P', thumbnail: 'https://x/outra.png' }, 1)).toContain('outra(s) 1 arte')
    expect(motivoDeManterOBlob(a, { name: 'P', thumbnail: null }, 0, 0)).toBeNull()
    expect(motivoDeManterOBlob({ resultUrl: null }, null, 3, 3)).toBeNull()
  })
})

describe('listar-artes: o item', () => {
  it('traz nome, página, link do editor e o uso pela agenda', () => {
    const item = itemDaGaleria({
      arte: arte(),
      formato: 'story',
      pagina: pagina(),
      posts: [post({ status: 'SCHEDULED', laterPostId: 'later_1' }), post({ id: 'alheio', generationId: 'gen2', mediaUrls: [] })],
      appUrl: 'https://studio.test',
      agora: AGORA,
    })
    expect(item).toMatchObject({
      generationId: 'gen1',
      nome: 'Story teste',
      formato: 'story',
      situacao: 'pronta',
      criadaEmISO: '2026-11-17T12:00:00.000Z',
      url: URL_DA_ARTE,
      pageId: 'pg1',
      editUrl: 'https://studio.test/templates/570/editor?pageId=pg1',
      emUso: true,
      posts: [{ postId: 'post1', situacao: 'agendado', tipo: 'STORY', noZernio: true }],
      podeApagar: false,
    })
  })

  it('arte livre: emUso false e podeApagar true; página apagada é dita', () => {
    const item = itemDaGaleria({ arte: arte(), formato: null, pagina: null, posts: [], appUrl: 'https://studio.test', agora: AGORA })
    expect(item).toMatchObject({ emUso: false, posts: [], podeApagar: true, pageId: 'pg1', paginaApagada: true })
    expect(item).not.toHaveProperty('editUrl')
  })

  it('nome: página, depois arquivo (nunca o caminho do blob), depois modelo', () => {
    expect(nomeDaArte(arte(), pagina({ name: 'Renomeada' }))).toBe('Renomeada')
    expect(nomeDaArte(arte())).toBe('Story teste')
    expect(nomeDaArte(arte({ fileName: 'ai/7/abc.png' }))).toBe('Semana 47')
    expect(nomeDaArte(arte({ fileName: null, templateName: null }))).toBe('Arte sem nome')
  })

  it('período: "AAAA-MM-DD" é o dia inteiro de Brasília; data torta é recusada', () => {
    expect(periodoDaLista('2026-11-17', '2026-11-17')).toEqual({
      gte: new Date('2026-11-17T03:00:00.000Z'),
      lte: new Date('2026-11-18T02:59:59.999Z'),
    })
    expect(periodoDaLista()).toEqual({})
    expect(() => periodoDaLista('ontem')).toThrow(CreativeError)
  })
})

describe('limpar-galeria: a faxina das artes nunca usadas', () => {
  const candidata = (id: string, extra: Partial<CandidataAFaxina> = {}): CandidataAFaxina => ({
    id,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    fileName: `${id}.png`,
    templateName: 'Semana 36',
    resultUrl: `https://x.public.blob.vercel-storage.com/${id}.png`,
    canal: 'claude-code',
    foraDoBlob: false,
    paginaEmPost: false,
    refDeEstilo: false,
    gostei: false,
    emPlano: false,
    carrosselEmUso: false,
    origemDeMelhoriaEmUso: false,
    video: false,
    ...extra,
  })
  const faxina = (lista: CandidataAFaxina[]) => {
    const lerNuncaUsadas = vi.fn(async (_projectId: number, _corte: Date) => lista)
    const apagarUma = vi.fn(async (_id: string): Promise<{ pagina?: { apagada?: true } }> => ({}))
    return { lerNuncaUsadas, apagarUma, deps: { lerNuncaUsadas, apagarUma, agora: AGORA } }
  }

  it.each([
    [{ foraDoBlob: true }, 'historico-fora-do-armazenamento'],
    [{ paginaEmPost: true }, 'pagina-em-post'],
    [{ refDeEstilo: true }, 'referencia-de-estilo'],
    [{ gostei: true }, 'gostei'],
    [{ emPlano: true }, 'item-de-plano'],
    [{ carrosselEmUso: true }, 'carrossel-em-uso'],
    [{ origemDeMelhoriaEmUso: true }, 'origem-de-melhoria-em-uso'],
    [{ video: true }, 'video'],
  ] as const)('%o protege a arte nunca usada', (fato, motivo) => {
    expect(motivoDeProteger(candidata('a', fato))).toBe(motivo)
  })

  it('sem fato nenhum a arte sai', () => {
    expect(motivoDeProteger(candidata('a'))).toBeNull()
  })

  it('arte que mora só no Drive é histórico e vence qualquer outro motivo: pode ter ido ao ar', () => {
    expect(motivoDeProteger(candidata('a', { foraDoBlob: true, gostei: true, video: true }))).toBe('historico-fora-do-armazenamento')
  })

  it('sem confirmar é SIMULAÇÃO: dá a conta, a amostra e não apaga nada', async () => {
    const f = faxina([
      candidata('a'),
      candidata('b', { gostei: true }),
      candidata('c', { refDeEstilo: true }),
      candidata('d', { canal: null }),
      candidata('e', { foraDoBlob: true }),
    ])
    const r = await limparGaleria({ projectId: 7 }, f.deps)
    expect(f.apagarUma).not.toHaveBeenCalled()
    expect(r).toMatchObject({
      simulacao: true,
      nuncaUsadas: 5,
      apagaria: 2,
      porOrigem: { 'claude-code': 1, 'sem-canal': 1 },
      protegidas: { total: 3, porMotivo: { gostei: 1, 'referencia-de-estilo': 1, 'historico-fora-do-armazenamento': 1 } },
      criterio: { dias: 30 },
    })
    expect((r as { amostra: Array<{ generationId: string }> }).amostra.map((a) => a.generationId)).toEqual(['a', 'd'])
  })

  it('confirmar: "true" (texto) ou qualquer coisa que não seja o literal true continua simulação', async () => {
    const f = faxina([candidata('a')])
    await limparGaleria({ projectId: 7, confirmar: 'true' as unknown as boolean }, f.deps)
    await limparGaleria({ projectId: 7, confirmar: false }, f.deps)
    expect(f.apagarUma).not.toHaveBeenCalled()
  })

  it('o corte é de 30 dias por padrão e nunca menos de 7', async () => {
    const f = faxina([])
    await limparGaleria({ projectId: 7 }, f.deps)
    await limparGaleria({ projectId: 7, dias: 2 }, f.deps)
    await limparGaleria({ projectId: 7, dias: 90 }, f.deps)
    const cortes = f.lerNuncaUsadas.mock.calls.map((c) => Math.round((AGORA.getTime() - c[1].getTime()) / 86_400_000))
    expect(cortes).toEqual([30, 7, 90])
  })

  it('confirmar: true apaga só as desprotegidas, das mais antigas, até o limite, e diz quantas restam', async () => {
    const f = faxina([candidata('a'), candidata('b', { emPlano: true }), candidata('c'), candidata('d'), candidata('e')])
    f.apagarUma.mockResolvedValueOnce({ pagina: { apagada: true } })
    const r = await limparGaleria({ projectId: 7, confirmar: true, limite: 2 }, f.deps)
    expect(f.apagarUma.mock.calls.map((c) => c[0])).toEqual(['a', 'c'])
    expect(r).toMatchObject({ apagadas: 2, paginasApagadas: 1, puladas: [], restantes: 2, protegidas: { total: 1 } })
  })

  it('arte que entrou num post entre a leitura e a exclusão é pulada com o motivo, e a faxina segue', async () => {
    const f = faxina([candidata('a'), candidata('b')])
    f.apagarUma.mockRejectedValueOnce(new CreativeError('ARTE_EM_USO_NA_AGENDA', 'A arte está em uso pelo post p1.', 409))
    const r = (await limparGaleria({ projectId: 7, confirmar: true }, f.deps)) as {
      apagadas: number
      puladas: Array<{ generationId: string; motivo: string }>
      restantes: number
    }
    expect(r.apagadas).toBe(1)
    expect(r.puladas).toEqual([{ generationId: 'a', motivo: 'ARTE_EM_USO_NA_AGENDA: A arte está em uso pelo post p1.' }])
    expect(r.restantes).toBe(0)
  })

  it('o limite tem teto de 40 por chamada', async () => {
    const f = faxina(Array.from({ length: 60 }, (_, i) => candidata(`a${i}`)))
    const r = await limparGaleria({ projectId: 7, confirmar: true, limite: 500 }, f.deps)
    expect(f.apagarUma).toHaveBeenCalledTimes(40)
    expect(r).toMatchObject({ apagadas: 40, restantes: 20 })
  })
})
