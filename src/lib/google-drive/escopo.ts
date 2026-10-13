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
import { idDoDriveValido } from '@/lib/google-drive/id'

const ATALHO = 'application/vnd.google-apps.shortcut'
const CAMPOS = 'id, parents, trashed, mimeType, driveId, shortcutDetails(targetId)'
const PROFUNDIDADE_MAXIMA = 10

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

export { idDoDriveValido }

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
 * A posição do item: ele MESMO é uma das raízes ou um ancestral é — e cada um
 * deles (a raiz inclusive) existe e está fora da lixeira. A profundidade conta
 * antes de aceitar a raiz.
 */
async function posicaoPermitida(
  itemId: string,
  validas: ReadonlySet<string>,
  memo: MemoDoDrive | undefined,
  maxima: number,
): Promise<{ meta: MetaDoDrive } | { motivo: string }> {
  const item = await lerMeta(itemId, memo)
  if (!item) return { motivo: 'nao-encontrado' }
  if (item.trashed) return { motivo: 'lixeira' }
  if (validas.has(itemId)) return { meta: item }

  const vistos = new Set([itemId])
  let atual = item
  for (let profundidade = 1; ; profundidade++) {
    if (atual.parents.length === 0) return { motivo: 'sem-pai' }
    if (atual.parents.length > 1) return { motivo: 'varios-pais' }
    const pai = atual.parents[0]
    if (!idDoDriveValido(pai)) return { motivo: 'sem-pai' }
    if (vistos.has(pai)) return { motivo: 'ciclo' }
    if (profundidade > maxima) return { motivo: 'profundidade' }
    vistos.add(pai)
    const meta = await lerMeta(pai, memo)
    if (!meta) return { motivo: 'pai-nao-encontrado' }
    if (meta.trashed) return { motivo: 'lixeira' }
    if (validas.has(pai)) return { meta: item }
    atual = meta
  }
}

/**
 * O item vale se ele mesmo for uma das raízes ou se um ancestral for. Atalho
 * só vale se o destino TAMBÉM estiver sob as mesmas raízes (e não for outro
 * atalho); o id efetivo é o destino.
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

  const posicao = await posicaoPermitida(itemId, validas, opts.memo, maxima)
  if ('motivo' in posicao) return recusar(posicao.motivo, itemId)
  if (posicao.meta.mimeType !== ATALHO) return { permitido: true, idEfetivo: itemId }

  const destino = posicao.meta.targetId
  if (!idDoDriveValido(destino)) return recusar('atalho-sem-destino', itemId)
  const doDestino = await posicaoPermitida(destino, validas, opts.memo, maxima)
  if ('motivo' in doDestino) return recusar(`destino-${doDestino.motivo}`, itemId)
  if (doDestino.meta.mimeType === ATALHO) return recusar('atalho-para-atalho', itemId)
  return { permitido: true, idEfetivo: destino }
}

/** Todos ou nenhum: os ids efetivos, ou `null` se algum for recusado. */
export async function todosPermitidos(
  ids: readonly unknown[],
  raizes: ReadonlySet<string>,
  memo: MemoDoDrive = new Map(),
): Promise<string[] | null> {
  // Formato primeiro: um id inválido recusa o lote antes de qualquer consulta.
  const invalido = ids.find((id) => !idDoDriveValido(id))
  if (invalido !== undefined) {
    recusar('id-invalido', invalido)
    return null
  }
  const decisoes = await Promise.all(ids.map((id) => driveItemPermitido(id, raizes, { memo })))
  return decisoes.every((d) => d.permitido)
    ? decisoes.map((d) => (d as { idEfetivo: string }).idEfetivo)
    : null
}

interface ItemListado {
  id: string
  mimeType?: string | null
  shortcutDetails?: { targetId?: string | null } | null
}

/**
 * Filhos de uma pasta já conferida: o que não é atalho passa como está; o
 * atalho só passa se `driveItemPermitido` aceitar (posição E destino sob as
 * raízes). A listagem troca o tipo do atalho pelo do destino, então
 * `shortcutDetails` também marca atalho. Admin não passa por aqui.
 */
export async function filtrarAtalhosDoEscopo<T extends ItemListado>(
  itens: readonly T[],
  raizes: ReadonlySet<string>,
  opts: { memo?: MemoDoDrive } = {},
): Promise<T[]> {
  const memo = opts.memo ?? new Map()
  // ponytail: Promise.all sem teto; atalho é raro e o memo divide os ancestrais.
  const manter = await Promise.all(
    itens.map(async (item) =>
      item.mimeType !== ATALHO && item.shortcutDetails == null
        ? true
        : (await driveItemPermitido(item.id, raizes, { memo })).permitido,
    ),
  )
  return itens.filter((_, i) => manter[i])
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

/** Rotas web com projeto: `null` para admin (Drive inteiro); senão, as pastas DAQUELE projeto. */
export async function raizesNaRotaDoProjeto(userId: string, projectId: number): Promise<Set<string> | null> {
  return (await isAdmin(userId)) ? null : raizesDoProjeto(projectId)
}

/**
 * Rotas web com projeto: os ids efetivos, ou `null` se algum estiver fora das
 * pastas do projeto. Admin passa com qualquer id no formato do Drive.
 */
export async function idsDoDriveNaRotaDoProjeto(
  userId: string,
  projectId: number,
  ids: readonly unknown[],
): Promise<string[] | null> {
  const raizes = await raizesNaRotaDoProjeto(userId, projectId)
  if (raizes) return todosPermitidos(ids, raizes)
  return ids.every(idDoDriveValido) ? (ids as string[]) : null
}

/**
 * A foto do Drive precisa estar sob as pastas DESTE projeto — vale para
 * qualquer chamador (pessoa, serviço ou admin) em operação de projeto. Vale
 * o estado ATUAL do Drive (o índice de fotos pode estar velho). Devolve o id
 * efetivo.
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
  const r = await driveItemPermitido(driveId, await raizesDoProjeto(projectId), opts)
  if (!r.permitido) throw naoEncontrada()
  return r.idEfetivo
}
