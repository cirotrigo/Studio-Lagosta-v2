/**
 * Um Drive de mentira, compartilhado pelos testes do escopo do Drive.
 *
 * Projeto 1 tem `rootA` (pasta geral) e `rootAimg` (pasta de imagens FORA da
 * rootA); projeto 2 tem `rootB`. O resto da árvore existe para exercitar cada
 * caminho de recusa do `driveItemPermitido`.
 */
import { Readable } from 'node:stream'
import { vi } from 'vitest'

const PASTA = 'application/vnd.google-apps.folder'
const ATALHO = 'application/vnd.google-apps.shortcut'

interface NoFalso {
  parents?: string[]
  trashed?: boolean
  mimeType?: string
  targetId?: string
  name?: string
}

const pasta = (parents: string[], extra: NoFalso = {}): NoFalso => ({ parents, mimeType: PASTA, ...extra })
const foto = (parents: string[], extra: NoFalso = {}): NoFalso => ({ parents, mimeType: 'image/jpeg', ...extra })

export const ARVORE: Record<string, NoFalso> = {
  meu: { parents: [], mimeType: PASTA, name: 'Meu Drive' },
  rootA: pasta(['meu'], { name: 'Cliente A' }),
  childA: pasta(['rootA'], { name: 'Sub A' }),
  grandA: pasta(['childA'], { name: 'Neta A' }),
  fileA: foto(['grandA'], { name: 'fotoA.jpg' }),
  rootAimg: pasta(['meu'], { name: 'Imagens A' }),
  fileAimg: foto(['rootAimg'], { name: 'fotoAimg.jpg' }),
  rootB: pasta(['meu'], { name: 'Cliente B' }),
  fileB: foto(['rootB'], { name: 'fotoB.jpg' }),
  orphan: foto(['meu']),
  orphanDeep: foto(['sumido']),
  X: pasta(['Y']),
  Y: pasta(['X']),
  Z: pasta(['Z']),
  viaBoom: foto(['boom']),
  trashedA: foto(['rootA'], { trashed: true }),
  lixeiraA: pasta(['rootA'], { trashed: true }),
  sobLixeira: foto(['lixeiraA']),
  shortA: { parents: ['childA'], mimeType: ATALHO, targetId: 'fileB' },
  shortB: { parents: ['rootB'], mimeType: ATALHO, targetId: 'fileA' },
  // atalho na A apontando para a pasta de imagens da A (destino também sob as raízes)
  shortOk: { parents: ['childA'], mimeType: ATALHO, targetId: 'fileAimg' },
  // atalho na pasta de imagens da A apontando para a geral da A
  shortImg: { parents: ['rootAimg'], mimeType: ATALHO, targetId: 'fileA' },
  // atalho para atalho: nunca vale
  shortChain: { parents: ['childA'], mimeType: ATALHO, targetId: 'shortOk' },
  // atalho para arquivo na lixeira
  shortLixo: { parents: ['childA'], mimeType: ATALHO, targetId: 'trashedA' },
  multi: foto(['rootA', 'rootB']),
  semDestino: { parents: ['rootA'], mimeType: ATALHO },
}

// fundo0 → rootA, fundoN → fundo(N-1): fundo11 tem 11 ancestrais até a rootA
for (let i = 0; i <= 11; i++) ARVORE[`fundo${i}`] = pasta([i === 0 ? 'rootA' : `fundo${i - 1}`])

function erroDoDrive(status: number, message: string) {
  return Object.assign(new Error(message), { code: status, response: { status } })
}

export async function metaFalsa(id: string, _campos?: string) {
  if (id === 'boom') throw erroDoDrive(500, 'Internal error at /segredo/rootB')
  const no = ARVORE[id]
  if (!no) throw erroDoDrive(404, `File not found: ${id}.`)
  return {
    id,
    name: no.name ?? id,
    parents: no.parents,
    trashed: no.trashed ?? false,
    mimeType: no.mimeType ?? null,
    shortcutDetails: no.targetId ? { targetId: no.targetId } : undefined,
    thumbnailLink: `https://lh3.example/miniatura-${id}=s220`,
  }
}

/**
 * Os filhos de uma pasta como as listagens do serviço devolvem: o atalho
 * chega com o tipo TROCADO pelo do destino e com `shortcutDetails`.
 */
function filhosFalsos(folderId: string) {
  return Object.entries(ARVORE)
    .filter(([, no]) => no.parents?.includes(folderId) && !no.trashed)
    .map(([id, no]) => {
      const destino = no.targetId ? ARVORE[no.targetId] : undefined
      const mimeType = (no.mimeType === ATALHO ? destino?.mimeType : no.mimeType) ?? 'application/octet-stream'
      return {
        id,
        name: no.name ?? id,
        mimeType,
        kind: no.mimeType === PASTA ? ('folder' as const) : ('file' as const),
        webContentLink: null,
        shortcutDetails: no.targetId ? { targetId: no.targetId, targetMimeType: destino?.mimeType ?? null } : undefined,
      }
    })
}

/** Tudo que lê ou escreve DADOS no Drive (não conta getFileMetadata). */
export const drive = {
  isEnabled: vi.fn(() => true),
  getFileMetadata: vi.fn(metaFalsa),
  getFileStream: vi.fn(async (id: string) => ({
    stream: Readable.from([Buffer.from(`bytes-de-${id}`)]),
    mimeType: 'image/jpeg',
    name: `${id}.jpg`,
    size: 10,
    contentLength: undefined,
    contentRange: undefined,
  })),
  getThumbnailStream: vi.fn(async (id: string) => ({
    stream: Readable.from([Buffer.from(`mini-de-${id}`)]),
    mimeType: 'image/jpeg',
    name: `${id}.jpg`,
  })),
  listFiles: vi.fn(async ({ folderId }: { folderId?: string }) => ({
    items: [{ id: `dentro-de-${folderId ?? 'root'}`, name: 'x', mimeType: 'image/jpeg', kind: 'file' }, ...filhosFalsos(folderId ?? 'meu')],
  })),
  listFolderFiles: vi.fn(async (folderId: string) => [
    { id: `dentro-de-${folderId}`, name: 'x', mimeType: 'image/jpeg', webContentLink: null },
    ...filhosFalsos(folderId).filter((f) => f.kind !== 'folder'),
  ]),
  getFolderBreadcrumbs: vi.fn(async (folderId: string) => {
    // Ignora a parada de propósito: a rota precisa cortar sozinha.
    const trilha: Array<{ id: string; name: string }> = []
    let atual: string | undefined = folderId
    while (atual && ARVORE[atual]) {
      trilha.unshift({ id: atual, name: ARVORE[atual].name ?? atual })
      atual = ARVORE[atual].parents?.[0]
    }
    return trilha
  }),
  createFolder: vi.fn(async () => 'nova-pasta'),
  moveFiles: vi.fn(async () => undefined),
  deleteFiles: vi.fn(async () => undefined),
  uploadFileToFolder: vi.fn(async () => ({ fileId: 'enviado', publicUrl: 'https://x', webViewLink: null, webContentLink: null })),
  getPublicUrl: vi.fn((id: string) => `https://lh3.googleusercontent.com/d/${id}`),
}

export function chamadasDeDados() {
  return (
    drive.getFileStream.mock.calls.length +
    drive.getThumbnailStream.mock.calls.length +
    drive.listFiles.mock.calls.length +
    drive.listFolderFiles.mock.calls.length +
    drive.getFolderBreadcrumbs.mock.calls.length +
    drive.createFolder.mock.calls.length +
    drive.moveFiles.mock.calls.length +
    drive.deleteFiles.mock.calls.length +
    drive.uploadFileToFolder.mock.calls.length
  )
}

export const PROJETOS: Record<number, Record<string, string | null> & { name: string }> = {
  1: {
    name: 'Projeto A',
    googleDriveFolderId: 'rootA',
    googleDriveFolderName: 'Cliente A',
    googleDriveImagesFolderId: 'rootAimg',
    googleDriveImagesFolderName: 'Imagens A',
    googleDriveVideosFolderId: null,
    googleDriveVideosFolderName: null,
  },
  2: {
    name: 'Projeto B',
    googleDriveFolderId: 'rootB',
    googleDriveFolderName: 'Cliente B',
    googleDriveImagesFolderId: null,
    googleDriveImagesFolderName: null,
    googleDriveVideosFolderId: null,
    googleDriveVideosFolderName: null,
  },
  // pastas mal configuradas: nunca podem virar chamada ao Drive
  3: {
    name: 'Projeto mal configurado',
    googleDriveFolderId: 'root',
    googleDriveFolderName: 'Meu Drive',
    googleDriveImagesFolderId: "x' in parents or 'rootB",
    googleDriveImagesFolderName: 'Imagens',
    googleDriveVideosFolderId: 'root',
    googleDriveVideosFolderName: null,
  },
  // sem pasta nenhuma
  4: {
    name: 'Projeto sem pasta',
    googleDriveFolderId: null,
    googleDriveFolderName: null,
    googleDriveImagesFolderId: null,
    googleDriveImagesFolderName: null,
    googleDriveVideosFolderId: null,
    googleDriveVideosFolderName: null,
  },
}

/** Quem enxerga o quê (o que `projetosVisiveis` devolveria). */
export const VISIVEIS: Record<string, number[]> = {
  user_admin: [],
  userA: [1, 3, 4],
  userB: [2],
  userAB: [1, 2],
  userNone: [],
}

export const ADMINS = new Set(['user_admin'])

/** O `db` do escopo: projetos e o índice de fotos (vazio por padrão). */
export const embeddings = new Set<string>()

export const dbFalso = {
  project: {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) =>
      PROJETOS[where.id] ? { id: where.id, ...PROJETOS[where.id] } : null,
    ),
    findMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
      where.id.in.filter((id) => PROJETOS[id]).map((id) => ({ id, ...PROJETOS[id] })),
    ),
  },
  photoEmbedding: {
    findUnique: vi.fn(
      async ({ where }: { where: { projectId_driveFileId: { projectId: number; driveFileId: string } } }) => {
        const { projectId, driveFileId } = where.projectId_driveFileId
        return embeddings.has(`${projectId}:${driveFileId}`) ? { id: 'emb' } : null
      },
    ),
  },
  driveFileCache: { upsert: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({})) },
  storageObject: { create: vi.fn(async () => ({})) },
}

/** `put` do Blob: nada sai daqui sem ser contado. */
export const blobPut = vi.fn(async (chave: string) => ({ url: `https://loja.public.blob.vercel-storage.com/${chave}`, pathname: chave }))

/** `@/lib/permissions` de mentira: enxerga o projeto quem o tem em VISIVEIS (admin, todos). */
export class PermissionError extends Error {
  constructor(message: string, public status = 403) {
    super(message)
  }
}
export const permissoes = {
  PermissionError,
  requireAdminUser: vi.fn(async () => ({})),
  requireProjectAccess: vi.fn(async (projectId: number, { userId }: { userId: string }) => {
    if (!PROJETOS[projectId]) throw new PermissionError('Projeto não encontrado', 404)
    if (!ADMINS.has(userId) && !(VISIVEIS[userId] ?? []).includes(projectId)) throw new PermissionError('Não autorizado', 403)
    return { id: projectId, ...PROJETOS[projectId] }
  }),
}

export function zerarArvore() {
  vi.clearAllMocks()
  drive.isEnabled.mockReturnValue(true)
  embeddings.clear()
}
