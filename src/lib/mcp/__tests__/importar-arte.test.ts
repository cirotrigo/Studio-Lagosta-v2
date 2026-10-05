import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `importar-arte`: a imagem feita fora do Studio (a conversa do ChatGPT) entra
 * como arte de verdade. Chega por `openai/fileParams` (`imagem`) ou pelo plano B
 * do link de envio (`uploadId`). Os serviços são dublês; o baixador tem o
 * próprio teste (creatives/__tests__/baixar-imagem-externa.test.ts).
 */
const m = vi.hoisted(() => ({
  importarArte: vi.fn(),
  baixar: vi.fn(),
  verFoto: vi.fn(),
}))
vi.mock('@/lib/creatives/arte-enviada', () => ({ importarArte: m.importarArte }))
vi.mock('@/lib/creatives/baixar-imagem-externa', () => ({ baixarImagemExterna: m.baixar }))
vi.mock('@/lib/creatives/chat-upload', () => ({ verFoto: m.verFoto }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { toolsDeFotos } from '../catalogo/fotos'
import { catalogoParaLista } from '../registro/derivar'
import { definirTool } from '../registro/definir'
import { executarTool } from '../registro/porta'
import { z } from 'zod'

const tool = toolsDeFotos.find((t) => t.nome === 'importar-arte')!
const indice = new Map(toolsDeFotos.map((t) => [t.nome, t]))
const gates = { projeto: async () => undefined, curador: async () => undefined }
const principal = { kind: 'user' } as never
const pela = (args: Record<string, unknown>) => executarTool(indice, 'remoto', 'importar-arte', args, principal, { gates })
const texto = (r: { content: Array<Record<string, unknown>> }) => String(r.content[0]?.text)

beforeEach(() => {
  vi.clearAllMocks()
  m.baixar.mockResolvedValue({ bytes: Buffer.from('img'), contentType: 'image/png' })
  m.importarArte.mockResolvedValue({ importada: true, generationId: 'g1', pageId: 'p1', width: 1024, height: 1536, formato: 'STORY' })
})

describe('importar-arte no tools/list', () => {
  it('publica openai/fileParams e o objeto de arquivo que o ChatGPT exige', () => {
    const item = catalogoParaLista(indice, 'remoto').find((t) => t.name === 'importar-arte')!
    expect(item._meta).toEqual({ 'openai/fileParams': ['imagem'] })
    const imagem = (item.inputSchema.properties as Record<string, Record<string, unknown>>).imagem
    expect(Object.keys(imagem.properties as object).sort()).toEqual(['download_url', 'file_id', 'file_name', 'mime_type'])
    expect(imagem.required).toEqual(['download_url', 'file_id'])
  })
  it('só no remoto (no local o caminho é upload-creative)', () => {
    expect(catalogoParaLista(indice, 'local').some((t) => t.name === 'importar-arte')).toBe(false)
  })
  it('o registro recusa fileParams que não é chave do schema', () => {
    const base = { descricao: 'x', annotations: { readOnlyHint: true, destructiveHint: false }, acesso: { tipo: 'projeto' as const }, superficies: ['remoto' as const], handler: async () => null }
    expect(() => definirTool({ ...base, nome: 'a', schema: z.object({ foto: z.string() }), meta: { 'openai/fileParams': ['arquivo'] } })).toThrow(/fileParams/)
    expect(() => definirTool({ ...base, nome: 'b', schema: z.object({ foto: z.string() }), meta: { 'openai/fileParams': ['foto'] } })).not.toThrow()
  })
})

describe('importar-arte', () => {
  it('pela porta, baixa o download_url e importa com textos, canal e autor; avisa a proporção 2:3', async () => {
    const r = await pela({
      projectId: 6,
      imagem: { download_url: 'https://files.oaiusercontent.com/abc', file_id: 'file_1', file_name: 'story.png', extra: 'ignorado' },
      textos: ['Costela no bafo', 'Quinta, 19h'],
    })
    expect(r.isError).toBeFalsy()
    expect(m.baixar).toHaveBeenCalledWith('https://files.oaiusercontent.com/abc')
    expect(m.importarArte).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 6, fileName: 'story.png', canal: 'claude-ai', createdBy: 'u1', textos: ['Costela no bafo', 'Quinta, 19h'],
    }))
    const corpo = JSON.parse(texto(r))
    expect(corpo.avisos[0]).toMatch(/1024x1536/)
    expect(corpo.proximoPasso).toContain('"g1"')
  })
  it('sem imagem nem uploadId, manda para o plano B sem baixar nada', async () => {
    await expect(tool.handler({ projectId: 6 }, principal)).rejects.toMatchObject({ code: 'IMAGEM_AUSENTE', message: expect.stringMatching(/pedir-foto/) })
    expect(m.baixar).not.toHaveBeenCalled()
  })
  it('os dois caminhos juntos são recusados', async () => {
    await expect(tool.handler({ projectId: 6, uploadId: 'u', imagem: { download_url: 'https://x.com/a', file_id: 'f' } }, principal)).rejects.toMatchObject({ code: 'IMAGEM_AUSENTE' })
  })
  it('plano B: usa o arquivo recebido pelo link, e recusa o envio que ainda não chegou', async () => {
    m.verFoto.mockResolvedValueOnce({ situacao: 'recebida', fotoUrl: 'https://blob.exemplo.com/x.jpg', fileName: 'arte.png' })
    await tool.handler({ projectId: 6, uploadId: 'up1' }, principal)
    expect(m.verFoto).toHaveBeenCalledWith({ projectId: 6, uploadId: 'up1' })
    expect(m.baixar).toHaveBeenCalledWith('https://blob.exemplo.com/x.jpg')

    m.verFoto.mockResolvedValueOnce({ situacao: 'aguardando', dica: 'Ainda não chegou.' })
    await expect(tool.handler({ projectId: 6, uploadId: 'up2' }, principal)).rejects.toMatchObject({ code: 'ENVIO_PENDENTE' })
  })
})
