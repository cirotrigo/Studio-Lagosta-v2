/**
 * Escopo do Drive: o que cada pessoa pode ler ou escrever no Drive do Studio.
 *
 * O Drive inteiro é acessado com UMA credencial (a da agência). Por isso a
 * regra mora aqui, no servidor: uma pasta ou arquivo só vale se estiver sob as
 * pastas dos projetos que a pessoa enxerga (`googleDriveFolderId`,
 * `googleDriveImagesFolderId`, `googleDriveVideosFolderId`). Admin
 * (`isAdmin`) enxerga o Drive inteiro nas rotas web.
 *
 * Fecha na dúvida: erro do Drive, item inexistente, na lixeira (ele ou um
 * ancestral), sem pai, com mais de um pai, ciclo, profundidade demais, o
 * literal `root` e id fora do formato do Drive — tudo é recusa, e a recusa é
 * a mesma para "não existe" e "não é seu".
 *
 * Só servidor: lê o banco e usa a credencial do Drive. (Sem `server-only`
 * porque os testes importam o módulo direto.)
 */
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'
import { CreativeError } from '@/lib/creatives/errors'
import { googleDriveService } from '@/server/google-drive-service'

const ATALHO = 'application/vnd.google-apps.shortcut'
const CAMPOS = 'id, parents, trashed, mimeType, driveId, shortcutDetails(targetId)'
const PROFUNDIDADE_MAXIMA = 10
const ID_DO_DRIVE = /^[A-Za-z0-9_-]{1,200}$/

export interface MetaDoDrive {
  id: string
  parents: string[]
  trashed: boolean
  mimeType: string | null
  targetId: string | null
}

/** Memória de UMA requisição. Nunca guarde decisões entre requisições. */
export type MemoDoDrive = Map<string, Promise<MetaDoDrive | null>>

export type DecisaoDoDrive = { permitido: true; idEfetivo: string } | { permitido: false; motivo: string }

/** Id no formato do Drive. `root` (o Meu Drive) nunca vale. */
export function idDoDriveValido(id: unknown): id is string {
  return typeof id === 'string' && id !== 'root' && ID_DO_DRIVE.test(id)
}

function lerMeta(id: string, memo?: MemoDoDrive): Promise<MetaDoDrive | null> {
  const guardado = memo?.get(id)
  if (guardado) return guardado
  const lido = buscarMeta(id)
  memo?.set(id, lido)
  return lido
}

async function buscarMeta(id: string): Promise<MetaDoDrive | null> {
  try {
    const f = (await googleDriveService.getFileMetadata(id, CAMPOS)) as {
      id?: string | null
      parents?: string[] | null
      trashed?: boolean | null
      mimeType?: string | null
      shortcutDetails?: { targetId?: string | null } | null
    }
    if (!f?.id) return null
    return {
      id: f.id,
      parents: f.parents ?? [],
      trashed: f.trashed === true,
      mimeType: f.mimeType ?? null,
      targetId: f.shortcutDetails?.targetId ?? null,
    }
  } catch {
    return null
  }
}

function recusar(motivo: string, id: unknown): DecisaoDoDrive {
  const mostrado = typeof id === 'string' ? JSON.stringify(id.slice(0, 80)) : typeof id
  console.warn(`[drive-escopo] recusado (${motivo}): ${mostrado}`)
  return { permitido: false, motivo }
}

/**
 * O item vale se ele MESMO for uma das raízes ou se um ancestral for. Atalho
 * vale pela posição dele, e o id efetivo é o destino; o id cru do destino é
 * julgado pela própria ascendência.
 */
export async function driveItemPermitido(
  itemId: unknown,
  raizes: ReadonlySet<string>,
  opts: { memo?: MemoDoDrive; profundidadeMaxima?: number } = {},
): Promise<DecisaoDoDrive> {
  if (!idDoDriveValido(itemId)) return recusar('id-invalido', itemId)
  const validas = new Set([...raizes].filter(idDoDriveValido))
  if (validas.size === 0) return recusar('sem-raizes', itemId)
  const maxima = opts.profundidadeMaxima ?? PROFUNDIDADE_MAXIMA

  const item = await lerMeta(itemId, opts.memo)
  if (!item) return recusar('nao-encontrado', itemId)
  if (item.trashed) return recusar('lixeira', itemId)

  let idEfetivo = itemId
  if (item.mimeType === ATALHO) {
    if (!idDoDriveValido(item.targetId)) return recusar('atalho-sem-destino', itemId)
    idEfetivo = item.targetId
  }
  if (validas.has(itemId)) return { permitido: true, idEfetivo }

  const vistos = new Set([itemId])
  let atual = item
  for (let profundidade = 1; ; profundidade++) {
    if (atual.parents.length === 0) return recusar('sem-pai', itemId)
    if (atual.parents.length > 1) return recusar('varios-pais', itemId)
    const pai = atual.parents[0]
    if (!idDoDriveValido(pai)) return recusar('sem-pai', itemId)
    if (validas.has(pai)) return { permitido: true, idEfetivo }
    if (vistos.has(pai)) return recusar('ciclo', itemId)
    if (profundidade > maxima) return recusar('profundidade', itemId)
    vistos.add(pai)
    const meta = await lerMeta(pai, opts.memo)
    if (!meta) return recusar('pai-nao-encontrado', itemId)
    if (meta.trashed) return recusar('lixeira', itemId)
    atual = meta
  }
}

/** Todos ou nenhum: os ids efetivos, ou `null` se algum for recusado. */
export async function todosPermitidos(
  ids: readonly unknown[],
  raizes: ReadonlySet<string>,
  memo: MemoDoDrive = new Map(),
): Promise<string[] | null> {
  const decisoes = await Promise.all(ids.map((id) => driveItemPermitido(id, raizes, { memo })))
  return decisoes.every((d) => d.permitido)
    ? decisoes.map((d) => (d as { idEfetivo: string }).idEfetivo)
    : null
}

const CAMPOS_DAS_PASTAS = {
  name: true,
  googleDriveFolderId: true,
  googleDriveFolderName: true,
  googleDriveImagesFolderId: true,
  googleDriveImagesFolderName: true,
  googleDriveVideosFolderId: true,
  googleDriveVideosFolderName: true,
} as const

type PastasDoProjeto = {
  name: string
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  googleDriveImagesFolderId: string | null
  googleDriveImagesFolderName: string | null
  googleDriveVideosFolderId: string | null
  googleDriveVideosFolderName: string | null
}

function pastasDe(p: PastasDoProjeto): Array<{ id: string; name: string }> {
  return [
    [p.googleDriveFolderId, p.googleDriveFolderName],
    [p.googleDriveImagesFolderId, p.googleDriveImagesFolderName],
    [p.googleDriveVideosFolderId, p.googleDriveVideosFolderName],
  ]
    .filter((par): par is [string, string | null] => idDoDriveValido(par[0]))
    .map(([id, nome]) => ({ id, name: nome ?? p.name }))
}

export async function raizesDoProjeto(projectId: number): Promise<Set<string>> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: CAMPOS_DAS_PASTAS })
  return new Set(p ? pastasDe(p).map((r) => r.id) : [])
}

export interface EscopoDoDrive {
  admin: boolean
  raizes: Set<string>
  /** As raízes com o nome guardado no projeto, para listar sem ir ao Drive. */
  raizesComNome: Array<{ id: string; name: string }>
}

// As tools do MCP puxam meio app; carregam sob demanda e uma vez só (é o
// módulo que fica guardado, nunca uma decisão).
let toolsDoMcp: Promise<typeof import('@/lib/mcp/tools')> | null = null

/** Rotas web sem projeto: admin vê tudo; os demais, a união das pastas dos projetos visíveis. */
export async function escopoDoDriveWeb(userId: string): Promise<EscopoDoDrive> {
  if (await isAdmin(userId)) return { admin: true, raizes: new Set(), raizesComNome: [] }
  toolsDoMcp ??= import('@/lib/mcp/tools').catch((erro) => {
    toolsDoMcp = null
    throw erro
  })
  const { projetosVisiveis } = await toolsDoMcp
  const ids = (await projetosVisiveis({ kind: 'user', userId, clientId: 'web' })) ?? []
  if (ids.length === 0) return { admin: false, raizes: new Set(), raizesComNome: [] }
  const projetos = await db.project.findMany({ where: { id: { in: ids } }, select: CAMPOS_DAS_PASTAS })
  const raizesComNome: Array<{ id: string; name: string }> = []
  const raizes = new Set<string>()
  for (const p of projetos) {
    for (const r of pastasDe(p)) {
      if (raizes.has(r.id)) continue
      raizes.add(r.id)
      raizesComNome.push(r)
    }
  }
  return { admin: false, raizes, raizesComNome }
}

/**
 * Rotas web com projeto: admin passa direto; os demais só com todos os ids
 * sob as pastas DAQUELE projeto. Devolve os ids efetivos ou `null`.
 */
export async function idsDoDriveNaRotaDoProjeto(
  userId: string,
  projectId: number,
  ids: readonly unknown[],
): Promise<string[] | null> {
  if (await isAdmin(userId)) return ids as string[]
  return todosPermitidos(ids, await raizesDoProjeto(projectId))
}

/**
 * A foto do Drive precisa estar sob as pastas DESTE projeto — vale para
 * qualquer chamador (pessoa, serviço ou admin) em operação de projeto.
 * Atalho rápido: a foto indexada no próprio projeto (PhotoEmbedding, escrito
 * só pelo indexador). Devolve o id efetivo.
 */
export async function assertDriveDoProjeto(
  projectId: number,
  driveId: unknown,
  opts: { memo?: MemoDoDrive } = {},
): Promise<string> {
  const naoEncontrada = () => new CreativeError('FOTO_NAO_ENCONTRADA', 'Foto não encontrada.', 404)
  if (!idDoDriveValido(driveId)) {
    recusar('id-invalido', driveId)
    throw naoEncontrada()
  }
  const indexada = await db.photoEmbedding.findUnique({
    where: { projectId_driveFileId: { projectId, driveFileId: driveId } },
    select: { id: true },
  })
  if (indexada) return driveId
  const r = await driveItemPermitido(driveId, await raizesDoProjeto(projectId), opts)
  if (!r.permitido) throw naoEncontrada()
  return r.idEfetivo
}
