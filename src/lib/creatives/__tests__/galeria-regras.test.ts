import { describe, expect, it, vi } from 'vitest'
import { CreativeError } from '../errors'
import {
  apagarArte,
  impedimentosDeApagar,
  itemDaGaleria,
  nomeDaArte,
  periodoDaLista,
  postsQueUsam,
  type ArteDaGaleria,
  type DepsDeApagarArte,
  type PaginaDaArte,
  type PostDaAgenda,
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
  ...extra,
})

function deps(extra: Partial<DepsDeApagarArte> = {}) {
  const apagar = vi.fn(async (_a: ArteDaGaleria, o: { manterBlob: boolean }) => ({
    drive: 'apagado' as const,
    blob: o.manterBlob ? ('mantido' as const) : ('apagado' as const),
  }))
  const d: DepsDeApagarArte = {
    lerArte: async () => arte(),
    lerPostsDaArte: async () => [],
    lerPagina: async () => pagina(),
    contarOutrasArtesComAImagem: async () => 0,
    estaNoBlob: (url) => url.includes('blob.vercel-storage.com'),
    apagar,
    appUrl: 'https://studio.test',
    agora: AGORA,
    ...extra,
  }
  return { d, apagar }
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
      drive: 'apagado',
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
