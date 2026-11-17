/**
 * As REGRAS da gestão da galeria pelo conector (`listar-artes` e `apagar-arte`, 17/11/2026).
 *
 * Módulo PURO: nada aqui importa `@/lib/db`, Blob nem Drive. As leituras e a exclusão entram por
 * `DepsDeApagarArte`, e é isso que deixa as recusas e o caminho feliz serem provados sem banco. Os
 * efeitos de verdade moram em `galeria.ts`.
 *
 * O que decide se uma arte pode sair:
 * - arte usada por QUALQUER post que ainda existe na agenda fica. `cancelar-post` REMOVE o post, então
 *   "post cancelado" é post que não existe mais; rascunho, agendado, publicando, publicado e falhou
 *   seguram a arte (o falhado também: o "Tentar novamente" publicaria uma imagem apagada);
 * - post com `laterPostId` é intocável (já está no Zernio): o motivo sai separado, com outro código;
 * - foto de cena (`track: 'imagem'`) é insumo do acervo, não arte da galeria;
 * - arte ainda sendo gerada espera a fila terminar.
 */

import { CreativeError } from './errors'
import { formatarBRT } from './data-brt'

export const SITUACAO_DO_POST: Record<string, string> = {
  DRAFT: 'rascunho',
  SCHEDULED: 'agendado',
  POSTING: 'publicando',
  POSTED: 'publicado',
  FAILED: 'falhou',
}

const SITUACAO_DA_ARTE: Record<string, string> = {
  PROCESSING: 'em-andamento',
  COMPLETED: 'pronta',
  FAILED: 'falhou',
}

/** Abaixo disso a arte `PROCESSING` ainda pode estar na fila; acima, `ver-geracao` já a trata como falha. */
export const MINUTOS_DE_ARTE_EM_ANDAMENTO = 10

export interface ArteDaGaleria {
  id: string
  projectId: number
  status: string
  createdAt: Date
  resultUrl: string | null
  fileName: string | null
  templateName: string | null
  googleDriveFileId: string | null
  fieldValues: unknown
  carouselGroupId: string | null
  styleRefAt: Date | null
}

export interface PostDaAgenda {
  id: string
  status: string
  postType: string
  scheduledDatetime: Date | null
  laterPostId: string | null
  generationId: string | null
  mediaUrls: string[]
  renderedImageUrl: string | null
}

export interface PaginaDaArte {
  id: string
  name: string
  templateId: number
  thumbnail: string | null
  isTemplate: boolean
}

export interface ResultadoDaExclusao {
  drive: 'apagado' | 'falhou' | 'nao-havia'
  blob: 'apagado' | 'falhou' | 'mantido' | 'nao-havia'
}

function camposDaArte(arte: Pick<ArteDaGaleria, 'fieldValues'>): Record<string, unknown> {
  const fv = arte.fieldValues
  return fv && typeof fv === 'object' && !Array.isArray(fv) ? (fv as Record<string, unknown>) : {}
}

/** A página da peça composta (`fieldValues.pageId`), quando a arte tem uma. */
export function pageIdDaArte(arte: Pick<ArteDaGaleria, 'fieldValues'>): string | null {
  const id = camposDaArte(arte).pageId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

/**
 * O nome que a pessoa reconhece: o da página, o do arquivo, ou o do modelo. `fileName` de arte de IA
 * é o caminho do blob ("ai/7/abc.png") e não serve de nome.
 */
export function nomeDaArte(arte: Pick<ArteDaGaleria, 'fileName' | 'templateName'>, pagina?: PaginaDaArte | null): string {
  if (pagina?.name) return pagina.name
  const arquivo = arte.fileName?.trim()
  if (arquivo && !arquivo.includes('/')) return arquivo.replace(/\.(png|jpe?g|webp|mp4|mov)$/i, '')
  return arte.templateName?.trim() || 'Arte sem nome'
}

/**
 * Os posts que usam a arte: pelo vínculo (`generationId`) OU pela imagem (a URL da arte em `mediaUrls`
 * ou no render do post). A coluna sozinha não basta: num carrossel ela aponta só o primeiro slide
 * (ver `artes-do-post.ts`).
 */
export function postsQueUsam(arte: Pick<ArteDaGaleria, 'id' | 'resultUrl'>, posts: PostDaAgenda[]): PostDaAgenda[] {
  return posts.filter(
    (p) =>
      p.generationId === arte.id ||
      (!!arte.resultUrl && (p.mediaUrls.includes(arte.resultUrl) || p.renderedImageUrl === arte.resultUrl)),
  )
}

export function postParaChat(post: PostDaAgenda) {
  return {
    postId: post.id,
    situacao: SITUACAO_DO_POST[post.status] ?? post.status,
    tipo: post.postType,
    quando: post.scheduledDatetime ? formatarBRT(post.scheduledDatetime) : null,
    noZernio: !!post.laterPostId,
  }
}

export type CodigoDeImpedimento =
  | 'NAO_E_ARTE_DA_GALERIA'
  | 'ARTE_EM_ANDAMENTO'
  | 'ARTE_EM_POST_NO_ZERNIO'
  | 'ARTE_EM_USO_NA_AGENDA'

export interface Impedimento {
  codigo: CodigoDeImpedimento
  motivo: string
  comoResolver: string
  postId?: string
  situacao?: string
  quando?: string | null
}

const COMO_LIBERAR =
  'Se a pessoa quiser mesmo apagar a arte, tire o post da agenda antes (cancelar-post, confirmando com ela) ou ponha outra arte nele (trocar-arte-do-post, só em rascunho); depois chame apagar-arte de novo.'
const NAO_SE_LIBERA = 'Post publicado ou em publicação guarda a arte como histórico: esta arte não se apaga.'

/** Tudo o que impede a exclusão, do mais grave para o menos. Lista vazia = pode apagar. */
export function impedimentosDeApagar(arte: ArteDaGaleria, posts: PostDaAgenda[], agora = new Date()): Impedimento[] {
  const impedimentos: Impedimento[] = []

  if (camposDaArte(arte).track === 'imagem') {
    impedimentos.push({
      codigo: 'NAO_E_ARTE_DA_GALERIA',
      motivo: 'Esta geração é uma foto de cena do acervo (insumo de outras artes), não uma arte da galeria.',
      comoResolver: 'Foto do acervo se administra no Drive do cliente, não por apagar-arte.',
    })
  }

  const minutos = (agora.getTime() - arte.createdAt.getTime()) / 60_000
  if (arte.status === 'PROCESSING' && minutos < MINUTOS_DE_ARTE_EM_ANDAMENTO) {
    impedimentos.push({
      codigo: 'ARTE_EM_ANDAMENTO',
      motivo: 'A arte ainda está sendo gerada: apagar agora deixaria a fila gravando numa arte que sumiu.',
      comoResolver: `Acompanhe com ver-geracao e tente de novo quando ela terminar (ou passados ${MINUTOS_DE_ARTE_EM_ANDAMENTO} minutos).`,
    })
  }

  const emUso = postsQueUsam(arte, posts)
  const doPost = (p: PostDaAgenda) => {
    const chat = postParaChat(p)
    const publicado = p.status === 'POSTED' || p.status === 'POSTING'
    return { chat, comoResolver: publicado ? NAO_SE_LIBERA : COMO_LIBERAR }
  }
  for (const p of emUso.filter((p) => !!p.laterPostId)) {
    const { chat, comoResolver } = doPost(p)
    impedimentos.push({
      codigo: 'ARTE_EM_POST_NO_ZERNIO',
      motivo: `A arte está no post ${p.id} (${chat.situacao}${chat.quando ? `, ${chat.quando}` : ''}), que já foi para o Zernio: enquanto ele existir, a arte é intocável.`,
      comoResolver,
      postId: p.id,
      situacao: chat.situacao,
      quando: chat.quando,
    })
  }
  for (const p of emUso.filter((p) => !p.laterPostId)) {
    const { chat, comoResolver } = doPost(p)
    impedimentos.push({
      codigo: 'ARTE_EM_USO_NA_AGENDA',
      motivo: `A arte está em uso pelo post ${p.id} da agenda (${chat.situacao}${chat.quando ? `, ${chat.quando}` : ''}).`,
      comoResolver,
      postId: p.id,
      situacao: chat.situacao,
      quando: chat.quando,
    })
  }

  return impedimentos
}

/**
 * A imagem da arte pode servir a mais alguém: `persist.ts` grava a MESMA URL em `Page.thumbnail`, e duas
 * artes podem apontar o mesmo arquivo. Nesses casos o blob fica (devolve o motivo); `null` = pode sair.
 */
export function motivoDeManterOBlob(
  arte: Pick<ArteDaGaleria, 'resultUrl'>,
  pagina: PaginaDaArte | null,
  outrasArtesComAMesmaImagem: number,
): string | null {
  if (!arte.resultUrl) return null
  if (pagina?.thumbnail && pagina.thumbnail === arte.resultUrl) {
    return `a imagem é também a miniatura da página "${pagina.name}", que continua existindo`
  }
  if (outrasArtesComAMesmaImagem > 0) {
    return `outra(s) ${outrasArtesComAMesmaImagem} arte(s) da galeria usam o mesmo arquivo`
  }
  return null
}

function linkDoEditor(appUrl: string, pagina: PaginaDaArte): string {
  return `${appUrl}/templates/${pagina.templateId}/editor?pageId=${encodeURIComponent(pagina.id)}`
}

/** Um item de `listar-artes`. */
export function itemDaGaleria(input: {
  arte: ArteDaGaleria
  formato: string | null
  pagina: PaginaDaArte | null
  posts: PostDaAgenda[]
  appUrl: string
  agora?: Date
}) {
  const { arte, pagina } = input
  const emUso = postsQueUsam(arte, input.posts)
  const pageId = pageIdDaArte(arte)
  return {
    generationId: arte.id,
    nome: nomeDaArte(arte, pagina),
    formato: input.formato,
    situacao: SITUACAO_DA_ARTE[arte.status] ?? arte.status,
    criadaEm: formatarBRT(arte.createdAt),
    criadaEmISO: arte.createdAt.toISOString(),
    url: arte.resultUrl,
    ...(pagina ? { pageId: pagina.id, editUrl: linkDoEditor(input.appUrl, pagina) } : pageId ? { pageId, paginaApagada: true as const } : {}),
    emUso: emUso.length > 0,
    posts: emUso.map(postParaChat),
    podeApagar: impedimentosDeApagar(arte, input.posts, input.agora).length === 0,
  }
}

/** "AAAA-MM-DD" vira o dia inteiro em Brasília (como em ver-agenda); ISO completo passa como veio. */
export function periodoDaLista(de?: string, ate?: string): { gte?: Date; lte?: Date } {
  const ler = (valor: string, fimDoDia: boolean): Date => {
    const d = new Date(valor.length === 10 ? `${valor}T${fimDoDia ? '23:59:59.999' : '00:00:00'}-03:00` : valor)
    if (Number.isNaN(d.getTime())) {
      throw new CreativeError('DATA_INVALIDA', `Data não reconhecida: "${valor}". Use "AAAA-MM-DD" ou ISO.`, 400)
    }
    return d
  }
  return { ...(de ? { gte: ler(de, false) } : {}), ...(ate ? { lte: ler(ate, true) } : {}) }
}

// ── apagar-arte ─────────────────────────────────────────────────────────────

export interface DepsDeApagarArte {
  /** Pelo id, SEM filtro de projeto: quem confere o cliente é a regra, aqui. */
  lerArte(generationId: string): Promise<ArteDaGaleria | null>
  /** Os posts do cliente que apontam a arte pelo vínculo ou pela imagem. */
  lerPostsDaArte(arte: ArteDaGaleria): Promise<PostDaAgenda[]>
  /** A página, só se for do mesmo cliente. */
  lerPagina(pageId: string, projectId: number): Promise<PaginaDaArte | null>
  contarOutrasArtesComAImagem(arte: ArteDaGaleria): Promise<number>
  /** A URL é de um blob do Studio? (Arte antiga pode morar só no Drive: aí não há blob a apagar.) */
  estaNoBlob(url: string): boolean
  /** A exclusão de verdade (Drive, blob, linha) — a mesma função da rota do app. */
  apagar(arte: ArteDaGaleria, opcoes: { manterBlob: boolean }): Promise<ResultadoDaExclusao>
  appUrl: string
  agora?: Date
}

export async function apagarArte(
  params: { projectId: number; generationId: string; simular?: boolean },
  deps: DepsDeApagarArte,
) {
  const arte = await deps.lerArte(params.generationId)
  // Arte de outro cliente responde igual à inexistente: a existência dela não vaza.
  if (!arte || arte.projectId !== params.projectId) {
    throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente. Confira o generationId em listar-artes.', 404, {
      generationId: params.generationId,
    })
  }

  const pageId = pageIdDaArte(arte)
  const [posts, pagina, outras] = await Promise.all([
    deps.lerPostsDaArte(arte),
    pageId ? deps.lerPagina(pageId, arte.projectId) : Promise.resolve(null),
    arte.resultUrl ? deps.contarOutrasArtesComAImagem(arte) : Promise.resolve(0),
  ])

  const impedimentos = impedimentosDeApagar(arte, posts, deps.agora)
  const manterBlob = motivoDeManterOBlob(arte, pagina, outras)
  const nome = nomeDaArte(arte, pagina)

  const avisos: string[] = []
  if (pagina) {
    avisos.push(
      `A página "${pagina.name}" (${pagina.id}) NÃO é apagada: continua na pasta de templates e pode ser reaproveitada ou apagada no editor.`,
    )
  }
  if (manterBlob) avisos.push(`O arquivo da imagem fica no armazenamento: ${manterBlob}.`)
  if (arte.styleRefAt) avisos.push('Esta arte é referência de estilo da marca: ao ser apagada, sai do rodízio de referências.')
  if (arte.carouselGroupId) avisos.push('Esta arte é um slide de carrossel: os outros slides continuam na galeria.')

  const daArte = {
    generationId: arte.id,
    nome,
    criadaEm: formatarBRT(arte.createdAt),
    url: arte.resultUrl,
  }
  const daPagina = pagina
    ? { pagina: { pageId: pagina.id, nome: pagina.name, editUrl: linkDoEditor(deps.appUrl, pagina), mantida: true as const } }
    : {}

  if (params.simular) {
    return {
      simulacao: true as const,
      podeApagar: impedimentos.length === 0,
      arte: daArte,
      apagaria: {
        arteNaGaleria: true,
        arquivoNoDrive: !!arte.googleDriveFileId,
        imagemNoArmazenamento: !!arte.resultUrl && deps.estaNoBlob(arte.resultUrl) && !manterBlob,
      },
      impedimentos,
      ...daPagina,
      avisos,
      proximoPasso:
        impedimentos.length === 0
          ? `Nada foi apagado. Confirme com a pessoa, citando a arte "${nome}", e chame apagar-arte de novo sem simular.`
          : 'Nada foi apagado, e sem simular a chamada seria recusada pelos impedimentos acima.',
    }
  }

  if (impedimentos.length > 0) {
    throw new CreativeError(
      impedimentos[0].codigo,
      `A arte "${nome}" não foi apagada: ${impedimentos.map((i) => i.motivo).join(' ')}`,
      409,
      { generationId: arte.id, impedimentos, comoResolver: impedimentos[0].comoResolver },
    )
  }

  // ponytail: a conferência e a exclusão não são uma transação só; um post criado com esta arte nesse
  // intervalo (milissegundos) ficaria sem a imagem. Se acontecer, travar a linha da Generation aqui.
  const resultado = await deps.apagar(arte, { manterBlob: !!manterBlob })
  return { apagada: true as const, arte: daArte, ...resultado, ...daPagina, avisos }
}
