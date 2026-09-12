import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'

// O serviço carrega o Prisma, o medidor do render e o registro de fontes: aqui
// tudo isso é substituído — o que se prova é o que `descreverVariantes` DECLARA
// a partir de uma página com dois textos de serviço (R09 da revisão de fd82505c).
const mocks = vi.hoisted(() => ({
  projeto: vi.fn(),
  template: vi.fn(),
  paginas: vi.fn(),
  naoCarregadas: vi.fn(),
  familias: vi.fn(),
  carregarAssinatura: vi.fn(),
  carregarFoto: vi.fn(),
  luz: vi.fn(),
  fetch: vi.fn(),
  driveMeta: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { project: { findUnique: mocks.projeto }, template: { findFirst: mocks.template }, page: { findMany: mocks.paginas } } }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({
  createServerTextBoxMeasurer: async () => (layer: Layer) => {
    const fontSize = Number(layer.style?.fontSize ?? 16)
    const linhas = (layer.content ?? '').split('\n')
    return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.max(...linhas.map((l) => l.length * fontSize * 0.55)), lineCount: linhas.length }
  },
}))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: vi.fn(async () => undefined), familiasNaoCarregadas: mocks.naoCarregadas, fetchBuffer: mocks.fetch }))
vi.mock('../compor', () => ({ arranjosDasCombinacoes: vi.fn(async () => []), carregarAssinatura: mocks.carregarAssinatura, carregarFoto: mocks.carregarFoto, familiasDoProjeto: mocks.familias, luzMediaDaFoto: mocks.luz }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { isEnabled: () => true, getFileMetadata: mocks.driveMeta } }))
vi.mock('@vercel/blob', () => ({ put: mocks.put, del: vi.fn() }))

import { montarAssinatura } from '../assinatura'
import { descreverVariantes, medirCopyDoProjeto } from '../medir-copy-service'

const texto = (id: string, style: Record<string, unknown>, content = 'x'): Layer => ({
  id,
  name: id,
  type: 'text',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 400, height: 80 },
  content,
  style,
})

// A MESMA configuração de dois serviços do teste de R04 em `medir-copy.test.ts`:
// o primeiro em Barlow (disponível), o segundo em "Fonte Rara" (ausente).
const camadas: Layer[] = [
  { ...texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }, 'Título'), metadata: { groupId: 'g-topo' } },
  { ...texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#fff', lineHeight: 1.2 }, 'Seg a sex, das 11h às 15h'), position: { x: 92, y: 1600 }, metadata: { groupId: 'g-rodape' } },
  { ...texto('info', { fontFamily: 'Fonte Rara', fontSize: 24, color: '#ddd', lineHeight: 1.2 }, 'Rua das Flores, 12 — Centro'), id: 'servico-endereco', position: { x: 92, y: 1650 }, metadata: { groupId: 'g-rodape' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.projeto.mockResolvedValue({ assinatura: null, Logo: [] })
  mocks.template.mockResolvedValue({ id: 77 })
  mocks.paginas.mockResolvedValue([{ id: 'p6', name: 'Story base', tags: ['assinatura'], width: 1080, height: 1920, layers: camadas, background: null }])
  mocks.familias.mockResolvedValue(['Bevan', 'Barlow'])
  // o registro real: só "Fonte Rara" não está carregada
  mocks.naoCarregadas.mockImplementation(async (familias: string[]) => new Set(familias.filter((f) => f === 'Fonte Rara')))
})

describe('descreverVariantes — as fontes ausentes de TODOS os textos da variante (R09)', () => {
  it('a "Fonte Rara" do segundo serviço aparece em fontesNaoCarregadas; a Barlow do primeiro continua disponível', async () => {
    const r = await descreverVariantes(6, 'story')
    expect(r.templateId).toBe(77)
    expect(r.variantes).toHaveLength(1)
    const v = r.variantes[0]
    expect(v.papeis).toEqual(expect.arrayContaining(['headline', 'servico']))
    expect(v.aceitaServico).toBe(true)
    expect(v.estilos.servico?.fonte).toBe('Barlow')
    expect(v.estilos.servico?.fonteDisponivel).toBe(true)
    expect(v.fontesNaoCarregadas).toEqual(['Fonte Rara'])
    // a pergunta ao registro levou a família do segundo serviço
    expect(mocks.naoCarregadas.mock.calls[0][0]).toContain('Fonte Rara')
  })

  it('com todas as fontes carregadas a lista de ausências é vazia — a família do segundo serviço não vira falso alarme', async () => {
    mocks.naoCarregadas.mockResolvedValue(new Set<string>())
    const r = await descreverVariantes(6, 'story')
    expect(r.variantes[0].fontesNaoCarregadas).toEqual([])
  })
})

describe('descreverVariantes — o destaque AUTOMÁTICO entra nas fontes ausentes (R11)', () => {
  it('marca com `pesado: true`, "Barlow Bold" cadastrada mas fora do registro: ver-assinatura declara "Barlow Bold" ausente (a mesma família que medir-copy com [colchetes] declararia)', async () => {
    mocks.projeto.mockResolvedValue({ assinatura: { destaque: { pesado: true } }, Logo: [] })
    mocks.familias.mockResolvedValue(['Bevan', 'Barlow', 'Barlow Bold'])
    mocks.naoCarregadas.mockImplementation(async (familias: string[]) => new Set(familias.filter((f) => f === 'Barlow Bold')))
    const r = await descreverVariantes(6, 'story')
    expect(mocks.naoCarregadas.mock.calls[0][0]).toContain('Barlow Bold')
    expect(r.variantes[0].fontesNaoCarregadas).toEqual(['Barlow Bold'])
    expect(r.variantes[0].estilos.servico?.fonteDisponivel).toBe(true)
  })
})

describe('medirCopyDoProjeto com fotoDriveId — leitura que NÃO publica no Blob (R10)', () => {
  let png: Buffer
  beforeAll(async () => {
    const sharp = (await import('sharp')).default
    png = await sharp({ create: { width: 4, height: 6, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer()
  })
  const assinaturaMock = () => {
    const a = montarAssinatura({ pagina: { id: 'p6', name: 'Story base', tags: ['assinatura'], width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: null })
    a.camadasDaPagina = camadas
    return a
  }
  it('a foto do Drive é baixada da miniatura grande (s1920), a luz é medida e entra na escolha da variante; `carregarFoto` (que publica) NÃO é chamado e nada vai ao Blob', async () => {
    mocks.driveMeta.mockResolvedValue({ thumbnailLink: 'https://lh3.example/foto=s220' })
    mocks.fetch.mockResolvedValue(png)
    mocks.luz.mockResolvedValue(40)
    mocks.carregarAssinatura.mockResolvedValue(assinaturaMock())
    mocks.template.mockResolvedValue(null)
    const r = await medirCopyDoProjeto({ projectId: 6, formato: 'story', fotoDriveId: 'drive-1', blocos: [{ papel: 'headline', linhas: ['Costela'] }] })
    expect(mocks.driveMeta).toHaveBeenCalledWith('drive-1', 'thumbnailLink')
    expect(mocks.fetch).toHaveBeenCalledWith('https://lh3.example/foto=s1920')
    expect(mocks.luz).toHaveBeenCalledWith(png, { width: 1080, height: 1920 })
    expect(mocks.carregarAssinatura.mock.calls[0][2]).toMatchObject({ luzDaFoto: 40 })
    expect(mocks.carregarFoto).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
    expect(r.escolhaProvisoria).toBe(false)
    expect(r.variante.id).toBe('p6')
  })
  it('falha DEPOIS de a foto ter sido lida (a assinatura não carrega): o erro sobe e continua sem nenhuma escrita no Blob', async () => {
    mocks.driveMeta.mockResolvedValue({ thumbnailLink: 'https://lh3.example/foto=s220' })
    mocks.fetch.mockResolvedValue(png)
    mocks.luz.mockResolvedValue(40)
    mocks.carregarAssinatura.mockRejectedValue(new Error('assinatura indisponível (prova)'))
    await expect(medirCopyDoProjeto({ projectId: 6, formato: 'story', fotoDriveId: 'drive-1', blocos: [{ papel: 'headline', linhas: ['Costela'] }] })).rejects.toThrow('assinatura indisponível (prova)')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.carregarFoto).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
  })
})
