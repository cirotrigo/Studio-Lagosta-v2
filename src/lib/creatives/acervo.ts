/**
 * Acervo de imagens do projeto no Google Drive.
 *
 * O catálogo (`_image-catalog.json`, gerado pelos scripts de análise) descreve
 * cada foto com tema, tags, categoria de cardápio, qualidade e histórico de
 * uso — é o que permite escolher a foto certa para um tema sem abrir o Drive.
 * Projetos sem catálogo caem na listagem simples da pasta.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { googleDriveService } from '@/server/google-drive-service'
import { registrarSugestao } from '@/lib/aprendizado/captura'
import { chaveDeSugestao, diaBRT, resumoEstavel } from '@/lib/aprendizado/chaves'

const CATALOG_FILE = '_image-catalog.json'

/** Versão do ranqueamento do acervo (hoje: menos usada primeiro). */
const VERSAO_DO_ACERVO = 'acervo-v1'
/** Quantas fotos do topo entram no registro da proposta. */
const PROPOSTAS_REGISTRADAS = 10

export interface ImagemCatalogo {
  driveFileId: string
  fileName: string
  folder: string
  menuItem?: string | null
  menuCategory?: string | null
  description?: string
  tags?: string[]
  mood?: string
  bestFor?: string[]
  quality: string
  usageHistory?: { date: string; theme: string }[]
}

interface Catalogo {
  projectId: number
  projectName: string
  /** Catálogos antigos usam lastUpdated; os regerados, regeneradoEm */
  lastUpdated?: string
  regeneradoEm?: string
  images: ImagemCatalogo[]
}

const ORDEM_QUALIDADE: Record<string, number> = { alta: 3, media: 2, baixa: 1 }

async function pastaDeImagens(projectId: number): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { googleDriveImagesFolderId: true, googleDriveFolderId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }
  const folderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!folderId) {
    throw new CreativeError('SEM_PASTA_DRIVE', 'Este projeto não tem pasta de imagens no Drive.', 400)
  }
  return folderId
}

/** Data do último uso, para rodízio: fotos menos usadas aparecem primeiro. */
function ultimoUso(img: ImagemCatalogo): string {
  const h = img.usageHistory
  return h?.length ? h[h.length - 1].date : '2000-01-01'
}

export interface BuscarAcervoInput {
  projectId: number
  /** Tema — casa com bestFor, tags e o caminho da pasta */
  theme?: string
  /** Caminho exato (ou prefixo) da pasta: "01_cortes/picanha-bovina", "02_ambiente" */
  folder?: string
  menuCategory?: string
  tags?: string[]
  /** Qualidade mínima */
  quality?: 'alta' | 'media' | 'baixa'
  limit?: number
}

/**
 * Busca no catálogo do projeto. Ordena por menos usada recentemente, para não
 * repetir a mesma foto toda semana.
 */
export async function buscarNoAcervo(input: BuscarAcervoInput) {
  const folderId = await pastaDeImagens(input.projectId)

  const catalogId = await googleDriveService.findFileInFolder(folderId, CATALOG_FILE)
  if (!catalogId) {
    throw new CreativeError(
      'SEM_CATALOGO',
      'Este projeto ainda não tem catálogo de imagens. Use list-drive-images para ver a pasta.',
      404,
    )
  }

  const catalogo = await googleDriveService.readFileAsJson<Catalogo>(catalogId)
  const todas = catalogo.images ?? []
  let imagens = todas

  // Catálogos regerados (taxonomia v2) não trazem qualidade/tags/bestFor — só a
  // pasta. Aplicar o filtro nesse caso zeraria o acervo inteiro em silêncio.
  const temQualidade = todas.some((i) => i.quality)
  const avisos: string[] = []
  if (input.quality) {
    if (temQualidade) {
      const minimo = ORDEM_QUALIDADE[input.quality] ?? 1
      imagens = imagens.filter((i) => (ORDEM_QUALIDADE[i.quality] ?? 1) >= minimo)
    } else {
      avisos.push('Este catálogo não tem qualidade anotada — o filtro quality foi ignorado.')
    }
  }
  if (input.folder) {
    const f = input.folder.toLowerCase()
    imagens = imagens.filter((i) => (i.folder ?? '').toLowerCase().startsWith(f))
  }
  if (input.theme) {
    const t = input.theme.toLowerCase()
    imagens = imagens.filter(
      (i) =>
        i.bestFor?.some((b) => b.toLowerCase().includes(t)) ||
        i.tags?.some((x) => x.toLowerCase().includes(t)) ||
        i.folder?.toLowerCase().includes(t),
    )
  }
  if (input.menuCategory) {
    imagens = imagens.filter((i) => i.menuCategory === input.menuCategory)
  }
  if (input.tags?.length) {
    const alvo = input.tags.map((t) => t.toLowerCase())
    imagens = imagens.filter((i) => i.tags?.some((t) => alvo.includes(t.toLowerCase())))
  }

  imagens.sort((a, b) => ultimoUso(a).localeCompare(ultimoUso(b)))

  // As pastas são a espinha semântica destes catálogos: sem elas, quem busca
  // não tem como saber que existe "01_cortes/picanha-bovina" para pedir.
  const pastas = [...new Set(todas.map((i) => i.folder).filter(Boolean))].sort()

  /**
   * A ORDEM é a proposta: o topo da lista é a foto que o sistema recomenda
   * (menos usada primeiro). Registrar a emissão é o que permite, depois,
   * comparar com a que a pessoa de fato escolheu — sem isso o aprendizado só
   * enxerga o que foi aceito.
   */
  const sugestaoId = await registrarProposta(input, imagens)

  return {
    total: imagens.length,
    acervoCompleto: todas.length,
    catalogoAtualizadoEm: catalogo.lastUpdated ?? catalogo.regeneradoEm ?? null,
    pastasDisponiveis: pastas,
    ...(avisos.length > 0 ? { avisos } : {}),
    ...(sugestaoId ? { sugestaoId, propostaTopo: imagens[0]?.driveFileId ?? null } : {}),
    images: imagens.slice(0, input.limit ?? 20).map((i) => ({
      driveFileId: i.driveFileId,
      fileName: i.fileName,
      folder: i.folder,
      menuItem: i.menuItem ?? null,
      menuCategory: i.menuCategory ?? null,
      description: i.description ?? null,
      tags: i.tags ?? [],
      bestFor: i.bestFor ?? [],
      quality: i.quality ?? null,
      ultimoUso: i.usageHistory?.length ? ultimoUso(i) : 'nunca',
    })),
  }
}

/**
 * Registra UMA proposta por busca — não uma por foto.
 *
 * Vinte linhas por busca inflariam o denominador do KPI com fotos que ninguém
 * olhou; o que foi proposto é a LISTA RANQUEADA, e o que interessa medir é se
 * a pessoa levou o topo dela. A dedupe é por (projeto, critérios, DIA):
 * pesquisar "picanha" cinco vezes numa tarde é uma proposta vista cinco vezes,
 * e amanhã, com o acervo em outro estado, é outra.
 *
 * `limit` fica FORA da chave de propósito: "Carregar mais" mostra mais da
 * mesma lista, não uma lista nova.
 */
async function registrarProposta(
  input: BuscarAcervoInput,
  ranqueadas: ImagemCatalogo[],
): Promise<string | null> {
  // Busca sem resultado não propõe nada — e contá-la como proposta rejeitada
  // culparia o ranqueamento por um acervo que não tem a foto.
  if (ranqueadas.length === 0) return null

  const criterios = {
    theme: input.theme,
    folder: input.folder,
    menuCategory: input.menuCategory,
    tags: input.tags,
    quality: input.quality,
  }

  return registrarSugestao({
    projectId: input.projectId,
    tipo: 'foto',
    servico: 'buscar-no-acervo',
    versao: VERSAO_DO_ACERVO,
    chave: chaveDeSugestao(
      'foto',
      VERSAO_DO_ACERVO,
      input.projectId,
      resumoEstavel(criterios),
      diaBRT(),
    ),
    sugerido: {
      criterios,
      total: ranqueadas.length,
      topo: ranqueadas[0].driveFileId,
      propostas: ranqueadas.slice(0, PROPOSTAS_REGISTRADAS).map((i, posicao) => ({
        posicao: posicao + 1,
        driveFileId: i.driveFileId,
        fileName: i.fileName,
        folder: i.folder,
        ultimoUso: i.usageHistory?.length ? ultimoUso(i) : null,
      })),
    },
  })
}

/** Listagem crua da pasta, para projetos sem catálogo. */
export async function listarImagensDoDrive(projectId: number, limit = 30) {
  const folderId = await pastaDeImagens(projectId)
  const arquivos = await googleDriveService.listFolderFiles(folderId)

  const imagens = arquivos
    .filter((f) => (f.mimeType ?? '').startsWith('image/'))
    .slice(0, limit)
    .map((f) => ({ driveFileId: f.id, fileName: f.name, mimeType: f.mimeType }))

  return { total: imagens.length, images: imagens }
}
