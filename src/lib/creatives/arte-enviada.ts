/**
 * Arte pronta trazida de fora — o arquivo que já existe no computador entra na
 * galeria de Criativos do projeto.
 *
 * A diferença para arte-rápida e arte-livre é que aqui NÃO se renderiza nada:
 * os bytes enviados são a arte final e viram o `resultUrl` da Generation tal e
 * qual. Renderizar de novo só serviria para reencodar e arriscar diferença.
 *
 * Ainda assim a arte nasce como uma Page editável (uma única camada de imagem
 * ocupando a tela inteira, dentro do template coletor "Arte Enviada"). É o que
 * a torna igual às outras: abre no editor para receber um texto por cima,
 * aceita ajustar-arte, conferir-arte e vai para a agenda por pageId.
 *
 * Consequência de ter página: se alguém editar essa página, o post agendado
 * que a usa é invalidado e o cron re-renderiza — a arte publicada passa a ser
 * o render da página, não mais o arquivo original. É o comportamento desejado
 * (editou, vale o que está no editor), mas quem quiser o arquivo intocado deve
 * agendar por generationId.
 */

import type { CanalDaArte } from './canal'
import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { createId } from '@/lib/id'
import { CreativeError } from '@/lib/creatives/errors'
import { ensureArteTemplate, getPublicAppUrl } from '@/lib/creatives/persist'
import type { Layer } from '@/types/template'
import type { TemplateType } from '@prisma/client'

/** Coletor por formato — separado do "Arte Rápida" para a procedência ficar à vista. */
export const ARTE_ENVIADA_TEMPLATE_NAMES: Record<TemplateType, string> = {
  STORY: 'Arte Enviada',
  FEED: 'Arte Enviada — Feed',
  SQUARE: 'Arte Enviada — Quadrado',
}

/** 25MB é o mesmo teto do envio pelo celular (chat-upload). */
export const MAX_ARTE_BYTES = 25 * 1024 * 1024

const FORMATOS_ACEITOS: Record<string, { ext: string; contentType: string }> = {
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
}

export interface ImportarArteInput {
  projectId: number
  /** Bytes do arquivo, já lidos pelo chamador */
  bytes: Buffer
  /** Nome do arquivo de origem, guardado na galeria */
  fileName: string
  /** Nome da arte (default: o nome do arquivo sem extensão) */
  name?: string
  /** Procedência livre — o caminho local, a skill que gerou, o que ajudar depois */
  origem?: string
  /** Por qual canal a arte entrou. Ver `canal.ts`. */
  canal?: CanalDaArte | null
  /** Quem assina a Generation (User.id interno); sem isso, o dono do projeto. */
  createdBy?: string | null
  /**
   * Os textos que a arte contém, quando quem envia os conhece.
   *
   * 🔴 É o que faz a melhoria com IA ter RÉGUA. Sem eles,
   * `loadExpectedTextsForGeneration` devolve `[]`, a seção `[TEXTO EXATO —
   * VERBATIM]` some do prompt e o modelo passa a LER o serviço da própria
   * imagem — completando o que não entende. Medido em 01/09/2026 no By Rock:
   * melhorias sucessivas inventaram endereço em Foz do Iguaçu, São José dos
   * Pinhais, Jaraguá do Sul e Porto Alegre, para um cliente de Vitória.
   *
   * Quem gera a arte por canvas SABE a copy exata — ela está no gerador da
   * leva. Passá-la aqui é mais forte que qualquer transcrição por visão, que
   * é o que a melhoria faz quando este campo falta.
   *
   * `extractExpectedTexts` já lê `fieldValues.textos`, então não é preciso
   * mudar nada do outro lado.
   */
  textos?: string[]
}

export interface ImportarArteResult {
  importada: true
  generationId: string
  pageId: string
  templateId: number
  templateName: string
  url: string
  editUrl: string
  galleryUrl: string
  width: number
  height: number
  sizeKB: number
  formato: TemplateType
  fileName: string
}

/** Nome de arquivo seguro para o caminho do Blob. */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'arte'
  )
}

export function nomeSemExtensao(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

/**
 * Formato pela PROPORÇÃO, não pelo `inferTemplateType` do persist — aquele
 * chama de STORY tudo que é mais alto que largo, e o feed do Instagram (4:5,
 * proporção 1,25) cairia no coletor de story. O corte em 1,5 fica entre 4:5 e
 * 9:16 (1,78), longe dos dois.
 */
export function classificarFormato(width: number, height: number): TemplateType {
  const proporcao = height / width
  if (proporcao >= 1.5) return 'STORY'
  if (proporcao > 1.05) return 'FEED'
  if (proporcao >= 0.95) return 'SQUARE'
  return 'FEED' // deitada: não há coletor próprio, e feed aceita paisagem
}

/**
 * Sobe a arte para o Blob, cria a Page editável e registra a Generation que
 * aparece em Criativos.
 */
export async function importarArte(input: ImportarArteInput): Promise<ImportarArteResult> {
  const { projectId, bytes } = input

  if (!bytes || bytes.length === 0) {
    throw new CreativeError('ARQUIVO_VAZIO', `Arquivo vazio: ${input.fileName}`, 400)
  }
  if (bytes.length > MAX_ARTE_BYTES) {
    throw new CreativeError(
      'ARQUIVO_GRANDE',
      `"${input.fileName}" tem ${Math.round(bytes.length / 1024 / 1024)}MB e o limite é 25MB.`,
      413,
    )
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, userId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  // Foto de celular vem deitada quando o EXIF não é aplicado; a arte exportada
  // por editor não tem orientação, então o rotate() só custa quando precisa.
  let arquivo = bytes
  let meta: sharp.Metadata
  try {
    meta = await sharp(bytes).metadata()
    if (meta.orientation && meta.orientation > 1) {
      arquivo = await sharp(bytes).rotate().toBuffer()
      meta = await sharp(arquivo).metadata()
    }
  } catch {
    throw new CreativeError('ARQUIVO_INVALIDO', `"${input.fileName}" não parece ser uma imagem.`, 415)
  }

  const formatoArquivo = FORMATOS_ACEITOS[meta.format ?? '']
  if (!formatoArquivo) {
    throw new CreativeError(
      'FORMATO_NAO_SUPORTADO',
      `"${input.fileName}" é ${meta.format ?? 'desconhecido'}. Envie PNG, JPG ou WebP.`,
      415,
    )
  }

  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 1 || height < 1) {
    throw new CreativeError('ARQUIVO_INVALIDO', `Não deu para ler as dimensões de "${input.fileName}".`, 415)
  }

  const type = classificarFormato(width, height)
  const template = await ensureArteTemplate(
    project.id,
    project.userId,
    type,
    `${width}x${height}`,
    ARTE_ENVIADA_TEMPLATE_NAMES[type],
  )

  const pageName = input.name?.trim() || nomeSemExtensao(input.fileName)
  const blobPath = `arte-enviada/${project.id}/${slugify(pageName)}.${formatoArquivo.ext}`
  // Sufixo aleatório: enviar duas vezes o mesmo nome de arquivo é rotina
  // (export sobrescrito na pasta local) e sem ele o Blob recusa o segundo.
  const blob = await put(blobPath, arquivo, {
    access: 'public',
    contentType: formatoArquivo.contentType,
    addRandomSuffix: true,
  })

  const camadaDeFundo: Layer = {
    id: createId(),
    type: 'image',
    name: 'Arte enviada',
    visible: true,
    locked: false,
    order: 0,
    position: { x: 0, y: 0 },
    size: { width, height },
    fileUrl: blob.url,
    style: { objectFit: 'cover' },
  } as Layer

  const page = await db.page.create({
    data: {
      name: pageName,
      width,
      height,
      layers: [camadaDeFundo] as never,
      background: null,
      order: 0,
      templateId: template.id,
      isTemplate: false, // arte pronta, não um modelo reutilizável
      // O thumbnail é o próprio arquivo (URL do Blob, não data:) — é o que
      // agendarPost reusa como mídia sem precisar renderizar.
      thumbnail: blob.url,
      tags: ['arte-enviada'],
    },
    select: { id: true },
  })

  const generation = await db.generation.create({
    data: {
      status: 'COMPLETED' as never,
      templateId: template.id,
      // pageId sempre presente: é como conferir-arte/ajustar-arte localizam as
      // camadas desta arte.
      fieldValues: {
        source: 'arte-enviada',
        pageId: page.id,
        thumbnailUrl: blob.url,
        fileName: input.fileName,
        ...(input.origem ? { origem: input.origem } : {}),
        ...(input.textos?.length ? { textos: input.textos } : {}),
        /**
         * Lista VAZIA é uma afirmação, não omissão: "esta arte não tem texto"
         * (capa de carrossel, foto pura). Sem o marcador, quem sobe a linhagem
         * não distingue "foto pura" de "ninguém gravou a copy" — e é essa
         * distinção que impede a capa de virar peça na 2ª melhoria da cadeia,
         * quando a entrada já carrega o texto inventado na 1ª.
         */
        ...(input.textos && input.textos.length === 0 ? { semTexto: true } : {}),
      } as never,
      resultUrl: blob.url,
      projectId: project.id,
      createdBy: input.createdBy ?? project.userId,
      authorName: 'arte-enviada',
      canal: input.canal ?? null,
      templateName: template.name,
      projectName: project.name,
      completedAt: new Date(),
      fileName: input.fileName,
    },
    select: { id: true },
  })

  const appUrl = getPublicAppUrl()

  return {
    importada: true,
    generationId: generation.id,
    pageId: page.id,
    templateId: template.id,
    templateName: template.name,
    url: blob.url,
    editUrl: `${appUrl}/templates/${template.id}/editor?pageId=${encodeURIComponent(page.id)}`,
    galleryUrl: `${appUrl}/projects/${project.id}?tab=criativos`,
    width,
    height,
    sizeKB: Math.round(arquivo.length / 1024),
    formato: type,
    fileName: input.fileName,
  }
}
