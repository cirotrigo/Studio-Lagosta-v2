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
  motivoDeManterOBlob,
  pageIdDaArte,
  periodoDaLista,
  type ArteDaGaleria,
  type PaginaDaArte,
  type PostDaAgenda,
  type ResultadoDaExclusao,
} from './galeria-regras'

/**
 * Apaga uma arte: o arquivo no Drive, o blob e por fim a linha `Generation` — a lógica que morava no
 * `DELETE /api/generations/[id]`, agora uma função só para as rotas do app e para `apagar-arte`. Falha no
 * Drive ou no Blob vira aviso no log e a linha sai mesmo assim (como sempre foi). Quem chama já conferiu
 * permissão e decide o blob (`modoDoBlob`):
 * - `'imagem'`: apaga o blob do `resultUrl`. 🔴 Nunca por `fileName`: na peça composta ele é o nome da
 *   página ("Story.png"), não o caminho do blob. Até 17/11/2026 a rota apagava por `fileName ?? caminho`,
 *   e o blob de toda peça composta ficava órfão;
 * - `'manter'`: o blob fica, porque ainda serve a alguém (miniatura de página, outra arte, mídia de post).
 */
export async function apagarArquivosELinhaDaArte(
  arte: { id: string; resultUrl: string | null; googleDriveFileId: string | null },
  blob: 'imagem' | 'manter',
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

  const alvo = blob === 'imagem' && extractBlobPathname(arte.resultUrl) ? arte.resultUrl : null
  if (blob === 'manter') resultado.blob = 'mantido'
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

/**
 * O blob da arte pode sair? As rotas do app usam esta leitura; `apagar-arte` decide pelas regras dela (lá,
 * post que usa a imagem já barrou a exclusão inteira). `ignorarArtes`: as outras artes do MESMO lote, que
 * também vão sair e por isso não seguram o arquivo.
 */
export async function modoDoBlob(
  arte: { id: string; projectId: number; resultUrl: string | null },
  ignorarArtes: string[] = [],
): Promise<'imagem' | 'manter'> {
  const url = arte.resultUrl
  if (!url) return 'imagem'
  const [paginaComAMiniatura, outras, posts] = await Promise.all([
    db.page.findFirst({ where: { thumbnail: url, Template: { projectId: arte.projectId } }, select: { name: true, thumbnail: true } }),
    db.generation.count({ where: { projectId: arte.projectId, resultUrl: url, id: { notIn: [arte.id, ...ignorarArtes] } } }),
    db.socialPost.count({ where: { projectId: arte.projectId, OR: [{ mediaUrls: { has: url } }, { renderedImageUrl: url }] } }),
  ])
  return motivoDeManterOBlob(arte, paginaComAMiniatura, outras, posts) ? 'manter' : 'imagem'
}

/** Apaga a página e fecha o buraco na ordem da pasta, como o `DELETE` do editor (`templates/[id]/pages/[pageId]`). */
export async function apagarPaginaEReordenar(pagina: { id: string; templateId: number; order: number }): Promise<void> {
  await db.page.delete({ where: { id: pagina.id } })
  await db.page.updateMany({
    where: { templateId: pagina.templateId, order: { gt: pagina.order } },
    data: { order: { decrement: 1 } },
  })
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

const CAMPOS_DA_PAGINA = { id: true, name: true, templateId: true, thumbnail: true, isTemplate: true, order: true, width: true, height: true } as const

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
export async function apagarArteDaGaleria(params: { projectId: number; generationId: string; simular?: boolean; apagarPagina?: boolean; appUrl: string }) {
  return apagarArte(params, {
    lerArte: (id) => db.generation.findUnique({ where: { id }, select: CAMPOS_DA_ARTE }),
    lerPostsDaArte: (arte) => lerPostsDasArtes(arte.projectId, [arte]),
    lerPagina: (pageId, projectId): Promise<PaginaDaArte | null> =>
      db.page.findFirst({ where: { id: pageId, Template: { projectId } }, select: CAMPOS_DA_PAGINA }),
    contarOutrasArtesComAImagem: (arte) =>
      db.generation.count({ where: { projectId: arte.projectId, resultUrl: arte.resultUrl, id: { not: arte.id } } }),
    estaNoBlob: (url) => !!extractBlobPathname(url),
    apagar: (arte, { manterBlob }) => apagarArquivosELinhaDaArte(arte, manterBlob ? 'manter' : 'imagem'),
    lerUsoDaPagina: async (pagina, arte) => {
      const [posts, outras, itensDePlano, referencias, paginasNaPasta] = await Promise.all([
        db.socialPost.count({ where: { pageId: pagina.id } }),
        // Em SQL: o filtro Json do Prisma por chave de `fieldValues` descarta a linha sem o campo (AGENTS.md).
        db.$queryRaw<Array<{ total: number }>>`
          SELECT COUNT(*)::int AS total FROM "Generation"
          WHERE "projectId" = ${arte.projectId} AND id <> ${arte.id}
            AND COALESCE("fieldValues"->>'pageId', '') = ${pagina.id}
        `,
        db.itemDePlano.count({ where: { pageId: pagina.id } }),
        db.referenciaDeLayout.count({ where: { pageId: pagina.id, revogadaEm: null } }),
        db.page.count({ where: { templateId: pagina.templateId } }),
      ])
      return { posts, outrasArtes: outras[0]?.total ?? 0, itensDePlano, referenciaAprovada: referencias > 0, paginasNaPasta }
    },
    apagarPagina: apagarPaginaEReordenar,
    appUrl: params.appUrl,
  })
}
