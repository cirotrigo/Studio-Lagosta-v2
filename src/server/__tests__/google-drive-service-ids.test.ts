/**
 * O serviço do Drive só chama o Drive com id no formato do Drive: `root` (o
 * Meu Drive) e ids malformados — inclusive uma pasta mal configurada no
 * projeto — são recusados antes de qualquer chamada.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ chamadas: 0 }))

vi.mock('googleapis/build/src/apis/drive', () => {
  const resposta = async () => {
    m.chamadas++
    return { data: { files: [], id: 'novo', parents: [], name: 'x', mimeType: 'image/jpeg' } }
  }
  const files = { list: resposta, get: resposta, create: resposta, update: resposta, delete: resposta }
  class OAuth2 {
    setCredentials() {}
  }
  return { auth: { OAuth2 }, drive: () => ({ files, permissions: { create: resposta } }) }
})

let servico: typeof import('../google-drive-service').googleDriveService

beforeAll(async () => {
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'id')
  vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'segredo')
  vi.stubEnv('GOOGLE_DRIVE_REFRESH_TOKEN', 'token')
  servico = (await import('../google-drive-service')).googleDriveService
})
beforeEach(() => {
  m.chamadas = 0
})

const INVALIDOS = ['root', '', "x' in parents or 'y", 'a b', 'a'.repeat(201)]
const buf = Buffer.from('x')

const METODOS: Array<[string, (id: string) => Promise<unknown>]> = [
  ['listFiles', (id) => servico.listFiles({ folderId: id })],
  ['createFolder', (id) => servico.createFolder('Nova', id)],
  ['moveFiles (destino)', (id) => servico.moveFiles(['valido1'], id)],
  ['moveFiles (arquivo)', (id) => servico.moveFiles([id], 'valido1')],
  ['deleteFiles', (id) => servico.deleteFiles([id])],
  ['getFileMetadata', (id) => servico.getFileMetadata(id)],
  ['findFileInFolder', (id) => servico.findFileInFolder(id, 'a.json')],
  ['listChildrenOfFolders', (id) => servico.listChildrenOfFolders([id], 'images')],
  ['getFolderBreadcrumbs', (id) => servico.getFolderBreadcrumbs(id)],
  ['listFolderFiles', (id) => servico.listFolderFiles(id)],
  ['uploadCreativeToArtesLagosta', (id) => servico.uploadCreativeToArtesLagosta(buf, id)],
  ['findArtesLagostaFolder', (id) => servico.findArtesLagostaFolder(id)],
  ['listImagesInFolder', (id) => servico.listImagesInFolder(id)],
  ['uploadAIGeneratedImage', (id) => servico.uploadAIGeneratedImage(buf, id)],
  ['uploadFileToFolder', (id) => servico.uploadFileToFolder({ buffer: buf, folderId: id, mimeType: 'image/png', fileName: 'a.png' })],
  ['getFileStream', (id) => servico.getFileStream(id)],
  ['getThumbnailStream', (id) => servico.getThumbnailStream(id)],
  ['makeFilePublic', (id) => servico.makeFilePublic(id)],
]

describe.each(METODOS)('%s', (_nome, chamar) => {
  it.each(INVALIDOS.map((id) => [id.slice(0, 20), id]))('id %j: recusado sem chamar o Drive', async (_r, id) => {
    await expect(chamar(id)).rejects.toThrow(/inválido/)
    expect(m.chamadas).toBe(0)
  })
})

describe('id válido chega ao Drive', () => {
  it('listFiles e getFileMetadata', async () => {
    await servico.listFiles({ folderId: '1AbC_d-9' })
    await servico.getFileMetadata('1AbC_d-9')
    expect(m.chamadas).toBe(2)
  })
  it('listFiles sem pasta (raiz do admin) segue funcionando', async () => {
    await servico.listFiles({})
    expect(m.chamadas).toBe(1)
  })
})
