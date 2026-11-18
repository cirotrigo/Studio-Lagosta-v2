/**
 * O serviço da melhoria de foto, com o banco e as portas vizinhas em dublê:
 * a chave, a validação do pedido, a rota (página × reserva) e as guardas de
 * aplicar (nada muda antes de conferir post e foto; aplicar de novo não repete).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generation: { findFirst: vi.fn(), create: vi.fn() },
  page: { findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  socialPost: { findFirst: vi.fn() },
}))
const portas = vi.hoisted(() => ({
  startImprovement: vi.fn(),
  ajustarArte: vi.fn(),
  aplicarArteMelhoradaAoPost: vi.fn(),
  mesclar: vi.fn(),
  gancho: vi.fn(),
  validarSaldo: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: banco }))
vi.mock('../creative-improvement-service', () => ({ startImprovement: portas.startImprovement }))
vi.mock('../melhoria-de-foto-runner', () => ({ MODELO_DA_FOTO: 'nano-banana-2.1' }))
vi.mock('@/lib/creatives/arte-rapida', () => ({ ajustarArte: portas.ajustarArte }))
vi.mock('@/lib/posts/aplicar-arte-melhorada', () => ({ aplicarArteMelhoradaAoPost: portas.aplicarArteMelhoradaAoPost }))
vi.mock('@/lib/creatives/mesclar-field-values', () => ({ mesclarFieldValuesDaArte: portas.mesclar }))
vi.mock('../foto-melhorada-no-acervo', () => ({ registrarFotoMelhoradaNoAcervo: portas.gancho }))
vi.mock('@/lib/credits/deduct', () => ({ validateCreditsForFeature: portas.validarSaldo, deductCreditsForFeature: portas.validarSaldo }))
vi.mock('@/lib/posts/midia-no-zernio', () => ({
  recusaDeArteNoZernio: (post: { lateStatus?: string }) => (post.lateStatus === 'scheduled-congelado' ? { codigo: 'POST_CONGELADO', mensagem: 'publica em instantes', status: 409 } : null),
}))

import { aplicarOpcaoDeFoto, startMelhoriaDeFoto } from '../melhoria-de-foto-service'

const FOTO = 'https://x.public.blob.vercel-storage.com/foto.jpg'
const camadas = (url = FOTO, crop?: unknown) => [
  { id: 'bg-foto', type: 'image', fileUrl: url, position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, style: { objectFit: 'cover', ...(crop ? { crop } : {}) } },
  { id: 't', type: 'text', content: 'ESTAMOS', position: { x: 100, y: 1000 }, size: { width: 800, height: 100 } },
]
const origem = (fieldValues: Record<string, unknown>) => ({
  id: 'g-origem',
  projectId: 7,
  templateId: 540,
  resultUrl: 'https://x.public.blob.vercel-storage.com/arte.png',
  templateName: 'Capa',
  fieldValues,
  Template: { type: 'FEED', dimensions: '1080x1350' },
})
const pedido = { projectId: 7, generationId: 'g-origem', actorClerkId: 'user_1', receitas: [{ id: 'humanizar' }] }

beforeEach(() => {
  vi.stubEnv('MELHORIA_DE_FOTO', 'true')
  for (const grupo of Object.values(banco)) for (const f of Object.values(grupo)) f.mockReset()
  for (const f of Object.values(portas)) f.mockReset()
  banco.project.findUnique.mockResolvedValue({ name: 'By Rock', googleDriveFolderId: null })
  banco.generation.create.mockResolvedValue({ id: 'g-job' })
  portas.startImprovement.mockResolvedValue({ jobGenerationId: 'g-reserva', reused: false, runnerArgs: { jobGenerationId: 'g-reserva' } })
})
afterEach(() => vi.unstubAllEnvs())

describe('startMelhoriaDeFoto: a porta', () => {
  it('com a chave desligada recusa antes de ler o banco', async () => {
    vi.stubEnv('MELHORIA_DE_FOTO', '')
    await expect(startMelhoriaDeFoto(pedido)).rejects.toMatchObject({ code: 'MELHORIA_DE_FOTO_DESLIGADA' })
    expect(banco.generation.findFirst).not.toHaveBeenCalled()
  })

  it('recusa receita inválida, prompt longo, pedido vazio e opcoes fora de 1 ou 2, sem criar nada', async () => {
    await expect(startMelhoriaDeFoto({ ...pedido, receitas: [{ id: 'postura' }] })).rejects.toMatchObject({ code: 'RECEITAS_INVALIDAS' })
    await expect(startMelhoriaDeFoto({ ...pedido, promptPronto: 'x'.repeat(4001) })).rejects.toMatchObject({ code: 'PROMPT_LONGO' })
    await expect(startMelhoriaDeFoto({ ...pedido, receitas: [] })).rejects.toMatchObject({ code: 'PEDIDO_OBRIGATORIO' })
    await expect(startMelhoriaDeFoto({ ...pedido, opcoes: 3 })).rejects.toMatchObject({ code: 'ENTRADA_INVALIDA' })
    expect(banco.generation.create).not.toHaveBeenCalled()
  })
})

describe('startMelhoriaDeFoto: a rota', () => {
  it('arte com página vai pela página: proposta criada, sem post no runner, sem saldo conferido', async () => {
    banco.generation.findFirst.mockResolvedValue(origem({ source: 'compositor', pageId: 'p1' }))
    banco.page.findFirst.mockResolvedValue({ id: 'p1', isTemplate: false, layers: camadas() })
    const r = await startMelhoriaDeFoto({ ...pedido, opcoes: 2, pedido: 'mão no garfo' })
    expect(r.via).toBe('pagina')
    expect(banco.generation.create.mock.calls[0][0].data).toMatchObject({ status: 'PROCESSING', sourceGenerationId: 'g-origem', fieldValues: { source: 'melhoria-de-foto', alvo: 'foto', opcoesPedidas: 2 } })
    expect(r.runnerArgs).toMatchObject({ applyToPostId: null, foto: { pageId: 'p1', opcoes: 2, pedido: 'mão no garfo', promptPronto: null, receitas: [{ id: 'humanizar' }] } })
    expect(portas.validarSaldo).not.toHaveBeenCalled()
    expect(portas.startImprovement).not.toHaveBeenCalled()
  })

  it.each([
    ['sem página', { source: 'arte-enviada' }, null, 'sem-pagina'],
    ['página-modelo', { source: 'compositor', pageId: 'p1' }, { id: 'p1', isTemplate: true, layers: camadas() }, 'pagina-modelo'],
    ['arte que já é melhoria chapada', { source: 'ai_improvement', pageId: 'p1' }, { id: 'p1', isTemplate: false, layers: camadas() }, 'ja-e-melhoria'],
  ])('%s vai pela reserva, no Nano Banana e sem cobrança', async (_nome, fieldValues, pagina, motivo) => {
    banco.generation.findFirst.mockResolvedValue(origem(fieldValues))
    banco.page.findFirst.mockResolvedValue(pagina)
    const r = await startMelhoriaDeFoto(pedido)
    expect(r).toMatchObject({ via: 'reserva', motivoDaReserva: motivo, jobGenerationId: 'g-reserva' })
    expect(r.avisos[0]).toMatch(/reserva/)
    expect(portas.startImprovement).toHaveBeenCalledWith(expect.objectContaining({ gerador: 'gemini', semCobranca: true, fotoPelaReserva: { receitas: [{ id: 'humanizar' }], promptPronto: null, motivo } }))
    // A reserva nunca aplica ao post sozinha.
    expect(portas.startImprovement.mock.calls[0][0].applyToPostId).toBeUndefined()
    expect(banco.generation.create).not.toHaveBeenCalled()
  })

  it('post que mostra uma melhoria chapada leva a arte DO POST para a reserva', async () => {
    banco.generation.findFirst
      .mockResolvedValueOnce(origem({ source: 'compositor', pageId: 'p1' }))
      .mockResolvedValueOnce({ id: 'g-chapada', resultUrl: 'https://x/c.jpg', fieldValues: { source: 'ai_improvement' } })
    banco.socialPost.findFirst.mockResolvedValue({ status: 'DRAFT', laterPostId: null, generationId: 'g-chapada' })
    banco.page.findFirst.mockResolvedValue({ id: 'p1', isTemplate: false, layers: camadas() })
    const r = await startMelhoriaDeFoto({ ...pedido, postId: 'post1' })
    expect(r).toMatchObject({ via: 'reserva', motivoDaReserva: 'ja-e-melhoria' })
    expect(portas.startImprovement.mock.calls[0][0].generationId).toBe('g-chapada')
  })

  it('post no Zernio dentro da janela de publicação é recusado antes de gastar', async () => {
    banco.generation.findFirst.mockResolvedValue(origem({ source: 'compositor', pageId: 'p1' }))
    banco.socialPost.findFirst.mockResolvedValue({ status: 'SCHEDULED', laterPostId: 'z1', lateStatus: 'scheduled-congelado', generationId: 'g-origem' })
    await expect(startMelhoriaDeFoto({ ...pedido, postId: 'post1' })).rejects.toMatchObject({ code: 'POST_CONGELADO' })
    expect(banco.generation.create).not.toHaveBeenCalled()
  })
})

describe('aplicarOpcaoDeFoto', () => {
  const registro = (extra: Record<string, unknown> = {}) => ({
    trilha: 'foto-melhorada',
    pageId: 'p1',
    camadaId: 'bg-foto',
    fotoDeOrigemUrl: FOTO,
    recorteDeOrigem: null,
    quadro: { width: 1080, height: 1350 },
    receitas: [{ id: 'humanizar' }],
    pedido: '',
    promptDe: 'diretor',
    leitura: null,
    prompt: 'Add a hand',
    riscos: [],
    rostoEmFoco: false,
    opcoes: [{ opcao: 1, fotoUrl: 'https://x/o1.jpg', previaUrl: 'https://x/p1.jpg', avisos: [], custoUsd: 0.05, segundos: 30 }],
    postId: null,
    aplicada: null,
    ...extra,
  })
  const proposta = (r = registro(), status = 'COMPLETED') => ({ id: 'g-job', status, resultUrl: 'https://x/p1.jpg', fieldValues: { source: 'melhoria-de-foto', melhoriaDeFoto: r } })
  const pagina = (layers = camadas()) => ({ id: 'p1', isTemplate: false, width: 1080, height: 1350, background: null, layers, templateId: 540 })
  const chamada = { projectId: 7, melhoriaId: 'g-job', opcao: 1, appUrl: 'https://app' }

  beforeEach(() => {
    portas.ajustarArte.mockResolvedValue({ generationId: 'g-nova', url: 'https://x/nova.png', editUrl: 'https://app/editor', postsInvalidados: 2, avisos: [] })
    portas.gancho.mockResolvedValue(undefined)
  })

  it('troca a foto pela porta de ajustarArte, com o recorte inteiro, registra por merge e chama o gancho', async () => {
    banco.generation.findFirst.mockResolvedValue(proposta())
    banco.page.findFirst.mockResolvedValue(pagina())
    const r = await aplicarOpcaoDeFoto(chamada)
    expect(r).toMatchObject({ aplicada: true, via: 'pagina', generationId: 'g-nova', pageId: 'p1', postsInvalidados: 2 })
    const ajuste = portas.ajustarArte.mock.calls[0][0]
    expect(ajuste).toMatchObject({ projectId: 7, pageId: 'p1' })
    expect(ajuste.versaoEsperada).toMatch(/^v1:/)
    expect(ajuste.camadas).toEqual([{ op: 'definir', camada: 'bg-foto', campos: { fileUrl: 'https://x/o1.jpg', style: { crop: { x: 0, y: 0, width: 1, height: 1 } } } }])
    expect(portas.mesclar.mock.calls[0][1]).toBe('g-job')
    expect(portas.mesclar.mock.calls[0][2].melhoriaDeFoto.aplicada).toMatchObject({ opcao: 1, generationId: 'g-nova' })
    expect(portas.gancho).toHaveBeenCalledWith(expect.objectContaining({ fotoUrl: 'https://x/o1.jpg', fotoDeOrigemUrl: FOTO, generationId: 'g-nova' }))
    expect(portas.aplicarArteMelhoradaAoPost).not.toHaveBeenCalled()
  })

  it('recusa quando a foto ou o recorte da página mudaram desde a proposta, sem ajustar nada', async () => {
    banco.generation.findFirst.mockResolvedValue(proposta())
    banco.page.findFirst.mockResolvedValue(pagina(camadas('https://x/outra.jpg')))
    await expect(aplicarOpcaoDeFoto(chamada)).rejects.toMatchObject({ code: 'FOTO_DA_PAGINA_MUDOU' })
    banco.page.findFirst.mockResolvedValue(pagina(camadas(FOTO, { x: 0.1, y: 0, width: 0.5, height: 1 })))
    await expect(aplicarOpcaoDeFoto(chamada)).rejects.toMatchObject({ code: 'FOTO_DA_PAGINA_MUDOU' })
    expect(portas.ajustarArte).not.toHaveBeenCalled()
  })

  it('aplicar de novo a mesma opção devolve a aplicação que existe, sem outro ajuste', async () => {
    const aplicada = { opcao: 1, generationId: 'g-nova', url: 'https://x/nova.png', em: 'agora' }
    banco.generation.findFirst.mockResolvedValue(proposta(registro({ aplicada })))
    banco.page.findFirst.mockResolvedValue(pagina(camadas('https://x/o1.jpg')))
    const r = await aplicarOpcaoDeFoto(chamada)
    expect(r).toMatchObject({ jaEstavaAplicada: true, generationId: 'g-nova' })
    expect(portas.ajustarArte).not.toHaveBeenCalled()
    expect(portas.mesclar).not.toHaveBeenCalled()
  })

  it('opção que não existe, proposta que não ficou pronta e geração que não é de foto são recusadas', async () => {
    banco.page.findFirst.mockResolvedValue(pagina())
    banco.generation.findFirst.mockResolvedValue(proposta())
    await expect(aplicarOpcaoDeFoto({ ...chamada, opcao: 2 })).rejects.toMatchObject({ code: 'OPCAO_NAO_EXISTE' })
    banco.generation.findFirst.mockResolvedValue(proposta(registro(), 'PROCESSING'))
    await expect(aplicarOpcaoDeFoto(chamada)).rejects.toMatchObject({ code: 'MELHORIA_NAO_PRONTA' })
    banco.generation.findFirst.mockResolvedValue({ id: 'g', status: 'COMPLETED', resultUrl: 'u', fieldValues: { source: 'compositor' } })
    await expect(aplicarOpcaoDeFoto(chamada)).rejects.toMatchObject({ code: 'NAO_E_MELHORIA_DE_FOTO' })
    expect(portas.ajustarArte).not.toHaveBeenCalled()
  })

  it('post no Zernio dentro da janela: recusa ANTES de tocar na página', async () => {
    banco.generation.findFirst.mockResolvedValue(proposta())
    banco.page.findFirst.mockResolvedValue(pagina())
    banco.socialPost.findFirst.mockResolvedValue({ id: 'post1', status: 'SCHEDULED', laterPostId: 'z1', lateStatus: 'scheduled-congelado' })
    await expect(aplicarOpcaoDeFoto({ ...chamada, postId: 'post1' })).rejects.toMatchObject({ code: 'POST_CONGELADO' })
    expect(portas.ajustarArte).not.toHaveBeenCalled()
  })

  it('post no Zernio fora da janela: a página é atualizada e a arte renderizada troca no post de lá', async () => {
    banco.generation.findFirst.mockResolvedValue(proposta())
    banco.page.findFirst.mockResolvedValue(pagina())
    banco.socialPost.findFirst.mockResolvedValue({ id: 'post1', status: 'SCHEDULED', laterPostId: 'z1', lateStatus: 'scheduled' })
    portas.aplicarArteMelhoradaAoPost.mockResolvedValue({ aplicada: true, indice: 0, total: 1 })
    const r = await aplicarOpcaoDeFoto({ ...chamada, postId: 'post1' })
    expect(portas.aplicarArteMelhoradaAoPost).toHaveBeenCalledWith({ postId: 'post1', projectId: 7, url: 'https://x/nova.png', generationId: 'g-nova' })
    expect(r.postNoZernio).toEqual({ aplicada: true })
  })

  it('post nativo (sem Zernio) fica por conta da invalidação do ajuste: nada é trocado à mão', async () => {
    banco.generation.findFirst.mockResolvedValue(proposta())
    banco.page.findFirst.mockResolvedValue(pagina())
    banco.socialPost.findFirst.mockResolvedValue({ id: 'post1', status: 'DRAFT', laterPostId: null })
    const r = await aplicarOpcaoDeFoto({ ...chamada, postId: 'post1' })
    expect(portas.aplicarArteMelhoradaAoPost).not.toHaveBeenCalled()
    expect(r.postNoZernio).toBeUndefined()
  })

  it('reserva: a opção 1 entra no post pelo caminho da melhoria de sempre', async () => {
    banco.generation.findFirst.mockResolvedValue({ id: 'g-reserva', status: 'COMPLETED', resultUrl: 'https://x/r.jpg', fieldValues: { source: 'ai_improvement', fotoPelaReserva: { motivo: 'sem-pagina' } } })
    banco.socialPost.findFirst.mockResolvedValue({ id: 'post1', status: 'DRAFT', laterPostId: null })
    portas.aplicarArteMelhoradaAoPost.mockResolvedValue({ aplicada: true, indice: 0, total: 1 })
    const r = await aplicarOpcaoDeFoto({ ...chamada, melhoriaId: 'g-reserva', postId: 'post1' })
    expect(r).toMatchObject({ via: 'reserva', generationId: 'g-reserva', url: 'https://x/r.jpg' })
    expect(portas.aplicarArteMelhoradaAoPost).toHaveBeenCalledWith({ postId: 'post1', projectId: 7, url: 'https://x/r.jpg', generationId: 'g-reserva' })
    expect(portas.ajustarArte).not.toHaveBeenCalled()
  })
})
