/**
 * A galeria de artes com EFEITO: a exclusão compartilhada entre o app e o conector, e as leituras de
 * `listar-artes` / `apagar-arte`. As regras (o que impede, o que fica) são de `galeria-regras.ts`, puro.
 */

import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import { extractBlobPathname } from '@/lib/cleanup/blob-cleanup'
import { googleDriveService } from '@/server/google-drive-service'
import { formatoPeloTamanho } from '@/lib/compositor/formato'
import {
  apagarArte,
  itemDaGaleria,
  pageIdDaArte,
  periodoDaLista,
  type ArteDaGaleria,
  type PaginaDaArte,
  type PostDaAgenda,
  type ResultadoDaExclusao,
} from './galeria-regras'

/**
 * Apaga uma arte: o arquivo no Drive, o blob e por fim a linha `Generation` — a lógica que morava no
 * `DELETE /api/generations/[id]`, agora uma função só para a rota e para `apagar-arte`. Falha no Drive ou
 * no Blob vira aviso no log e a linha sai mesmo assim (como sempre foi). Quem chama já conferiu permissão.
 *
 * `blob`:
 * - ausente: a regra da ROTA, sem mudar uma vírgula (`fileName ?? caminho do resultUrl`);
 * - `'imagem'`: apaga o blob do `resultUrl`. É o que o conector usa: `fileName` de peça composta é o
 *   nome da página ("Story.png"), não o caminho do blob, e por ele nada é apagado;
 * - `'manter'`: o blob fica (ainda é a miniatura da página, ou de outra arte).
 */
export async function apagarArquivosELinhaDaArte(
  arte: { id: string; resultUrl: string | null; fileName: string | null; googleDriveFileId: string | null },
  opcoes: { blob?: 'imagem' | 'manter' } = {},
): Promise<ResultadoDaExclusao> {
  const resultado: ResultadoDaExclusao = { drive: 'nao-havia', blob: 'nao-havia' }

  // Drive primeiro (mais visível pro usuário se falhar)
  if (arte.googleDriveFileId && googleDriveService.isEnabled()) {
    try {
      await googleDriveService.deleteFiles([arte.googleDriveFileId])
      resultado.drive = 'apagado'
    } catch (driveError) {
      resultado.drive = 'falhou'
      console.warn(`[DELETE generation ${arte.id}] Failed to delete Drive file:`, driveError)
    }
  }

  const alvo =
    opcoes.blob === 'manter'
      ? null
      : opcoes.blob === 'imagem'
        ? extractBlobPathname(arte.resultUrl) && arte.resultUrl
        : (arte.fileName ?? extractBlobPathname(arte.resultUrl))
  if (opcoes.blob === 'manter') resultado.blob = 'mantido'
  if (alvo) {
    try {
      await del(alvo)
      resultado.blob = 'apagado'
    } catch (blobError) {
      resultado.blob = 'falhou'
      console.warn(`[DELETE generation ${arte.id}] Failed to delete blob:`, blobError)
    }
  }

  // A linha por último
  await db.generation.delete({ where: { id: arte.id } })
  return resultado
}

const CAMPOS_DA_ARTE = {
  id: true,
  projectId: true,
  status: true,
  createdAt: true,
  resultUrl: true,
  fileName: true,
  templateName: true,
  googleDriveFileId: true,
  fieldValues: true,
  carouselGroupId: true,
  styleRefAt: true,
} as const

const CAMPOS_DO_POST = {
  id: true,
  status: true,
  postType: true,
  scheduledDatetime: true,
  laterPostId: true,
  generationId: true,
  mediaUrls: true,
  renderedImageUrl: true,
} as const

const CAMPOS_DA_PAGINA = { id: true, name: true, templateId: true, thumbnail: true, isTemplate: true, width: true, height: true } as const

/** Os posts do cliente que apontam alguma das artes, pelo vínculo ou pela imagem. */
async function lerPostsDasArtes(projectId: number, artes: Array<Pick<ArteDaGaleria, 'id' | 'resultUrl'>>): Promise<PostDaAgenda[]> {
  const ids = artes.map((a) => a.id)
  if (ids.length === 0) return []
  const urls = artes.map((a) => a.resultUrl).filter((u): u is string => !!u)
  return db.socialPost.findMany({
    where: {
      projectId,
      OR: [
        { generationId: { in: ids } },
        ...(urls.length > 0 ? [{ mediaUrls: { hasSome: urls } }, { renderedImageUrl: { in: urls } }] : []),
      ],
    },
    select: CAMPOS_DO_POST,
  })
}

const FORMATO_DO_MODELO: Record<string, string> = { STORY: 'story', FEED: 'feed', SQUARE: 'quadrado' }

export async function listarArtesDaGaleria(params: {
  projectId: number
  de?: string
  ate?: string
  nome?: string
  limite?: number
  pagina?: number
  /** Vem de quem chama (`getPublicAppUrl`): `persist.ts` carrega o renderizador, e a rota de exclusão importa este módulo. */
  appUrl: string
}) {
  const { projectId, appUrl } = params
  const limite = Math.min(Math.max(Math.trunc(params.limite ?? 20), 1), 50)
  const pagina = Math.max(Math.trunc(params.pagina ?? 1), 1)
  const periodo = periodoDaLista(params.de, params.ate)
  const texto = params.nome?.trim()

  // A galeria mostra PEÇAS, não a foto de cena (`track: 'imagem'`). Em SQL com COALESCE, como na rota da
  // galeria: o filtro Json do Prisma descartaria junto toda arte que não tem o campo (AGENTS.md).
  const ocultas = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Generation"
    WHERE "projectId" = ${projectId}
      AND COALESCE("fieldValues"->>'track', '') = 'imagem'
  `
  const where = {
    projectId,
    ...(ocultas.length > 0 ? { id: { notIn: ocultas.map((r) => r.id) } } : {}),
    ...(periodo.gte || periodo.lte ? { createdAt: periodo } : {}),
    // ponytail: o texto casa o nome do arquivo e o do modelo gravados na arte; página renomeada DEPOIS
    // do render só casa pelo nome antigo. Se fizer falta, juntar "Page" por fieldValues->>'pageId' em SQL.
    ...(texto
      ? {
          OR: [
            { fileName: { contains: texto, mode: 'insensitive' as const } },
            { templateName: { contains: texto, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, artes] = await Promise.all([
    db.generation.count({ where }),
    db.generation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * limite,
      take: limite,
      select: { ...CAMPOS_DA_ARTE, Template: { select: { type: true } } },
    }),
  ])

  const pageIds = [...new Set(artes.map(pageIdDaArte).filter((id): id is string => !!id))]
  const [paginas, posts] = await Promise.all([
    pageIds.length > 0
      ? db.page.findMany({ where: { id: { in: pageIds }, Template: { projectId } }, select: CAMPOS_DA_PAGINA })
      : Promise.resolve([]),
    lerPostsDasArtes(projectId, artes),
  ])
  const paginaPorId = new Map(paginas.map((p) => [p.id, p]))

  return {
    total,
    pagina,
    limite,
    temMais: pagina * limite < total,
    artes: artes.map((arte) => {
      const page = paginaPorId.get(pageIdDaArte(arte) ?? '') ?? null
      return itemDaGaleria({
        arte,
        pagina: page,
        formato: page ? formatoPeloTamanho(page.width, page.height) : (FORMATO_DO_MODELO[arte.Template.type] ?? null),
        posts,
        appUrl,
      })
    }),
    comoApagar:
      'apagar-arte apaga UMA arte por generationId, sem desfazer: confirme com a pessoa citando a arte, e use simular: true para ver antes o que sai e o que impede. Arte com emUso: true não é apagada enquanto o post existir.',
  }
}

/** `apagar-arte`: as regras de `galeria-regras.ts` com as leituras e a exclusão de verdade. */
export async function apagarArteDaGaleria(params: { projectId: number; generationId: string; simular?: boolean; appUrl: string }) {
  return apagarArte(params, {
    lerArte: (id) => db.generation.findUnique({ where: { id }, select: CAMPOS_DA_ARTE }),
    lerPostsDaArte: (arte) => lerPostsDasArtes(arte.projectId, [arte]),
    lerPagina: (pageId, projectId): Promise<PaginaDaArte | null> =>
      db.page.findFirst({ where: { id: pageId, Template: { projectId } }, select: CAMPOS_DA_PAGINA }),
    contarOutrasArtesComAImagem: (arte) =>
      db.generation.count({ where: { projectId: arte.projectId, resultUrl: arte.resultUrl, id: { not: arte.id } } }),
    estaNoBlob: (url) => !!extractBlobPathname(url),
    apagar: (arte, { manterBlob }) => apagarArquivosELinhaDaArte(arte, { blob: manterBlob ? 'manter' : 'imagem' }),
    appUrl: params.appUrl,
  })
}
