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
import { lerUsosDeFoto, mesclarUsos, type UsoDaFoto } from '@/lib/creatives/uso-de-foto'
import { googleDriveService } from '@/server/google-drive-service'
import { registrarSugestao } from '@/lib/aprendizado/captura'
import { chaveDeSugestao, diaBRT, resumoEstavel } from '@/lib/aprendizado/chaves'
import { normalizar } from '@/lib/posts/dia-semana'

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

/**
 * Data do último uso registrada NO CATÁLOGO (legado).
 *
 * Ela sozinha não serve mais para ordenar: nenhum caminho do Studio escrevia
 * `usageHistory`, então isto devolvia `'2000-01-01'` para toda foto e o `sort`
 * ordenava um campo constante. Hoje o valor que manda vem de `mesclarUsos`,
 * que funde isto com o registro do banco (`PhotoUsage`).
 */
function ultimoUsoDoCatalogo(img: ImagemCatalogo): string | undefined {
  const h = img.usageHistory
  return h?.length ? h[h.length - 1].date : undefined
}

/** O que ordena o rodízio: nunca usada primeiro, depois a mais antiga. */
const NUNCA_USADA = '0000-01-01'

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
  /**
   * Nome do arquivo, exato ou PREFIXO ("ambiente-f3a" acha
   * "ambiente-f3a8693.jpg"). Existe porque quem já sabe qual foto quer não
   * tinha como pedi-la: o catálogo é indexado por tema, tag e pasta, e o nome
   * — que é o que aparece no Drive — não era filtro.
   */
  fileName?: string
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

  /**
   * Catálogo VAZIO é pior que catálogo nenhum: ele desliga o fallback da
   * listagem crua e o acervo inteiro do cliente some do seletor, sem erro
   * nenhum. Acontece de verdade — o `analyze-drive-images` salva o arquivo
   * mesmo quando toda foto falhou na análise, que foi o que ocorreu enquanto
   * ele apontava para um modelo de visão aposentado (10/08/2026).
   *
   * Tratar como "sem catálogo" devolve o cliente à navegação por pasta, que é
   * degradação honesta em vez de tela vazia.
   */
  if (todas.length === 0) {
    throw new CreativeError(
      'SEM_CATALOGO',
      'O catálogo deste projeto está vazio (a análise ainda não rodou ou falhou). Use a listagem da pasta.',
      404,
    )
  }

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
  /**
   * Todo casamento é SEM ACENTO (`normalizar`: minúsculas + NFD), porque o
   * catálogo mistura as duas grafias — o Gemini gravou "almoço" numa foto e
   * "almoco" na vizinha, no MESMO acervo (medido no Wine Vix em 11/08). Com
   * comparação crua, o mesmo conceito virava dois baldes e a busca por tema
   * devolvia metade do que existe.
   */
  if (input.folder) {
    const f = normalizar(input.folder)
    imagens = imagens.filter((i) => normalizar(i.folder ?? '').startsWith(f))
  }
  if (input.fileName) {
    const f = normalizar(input.fileName)
    imagens = imagens.filter((i) => normalizar(i.fileName ?? '').startsWith(f))
  }
  if (input.theme) {
    const t = normalizar(input.theme)
    imagens = imagens.filter(
      (i) =>
        i.bestFor?.some((b) => normalizar(b).includes(t)) ||
        i.tags?.some((x) => normalizar(x).includes(t)) ||
        (i.folder ? normalizar(i.folder).includes(t) : false),
    )
  }
  if (input.menuCategory) {
    imagens = imagens.filter((i) => i.menuCategory === input.menuCategory)
  }
  if (input.tags?.length) {
    const alvo = input.tags.map((t) => normalizar(t))
    imagens = imagens.filter((i) => i.tags?.some((t) => alvo.includes(normalizar(t))))
  }

  /**
   * Rodízio de verdade: o uso vem do banco (`PhotoUsage`) fundido com o
   * `usageHistory` legado do catálogo. Antes disto o critério era constante e
   * a ordem saía como estava no arquivo.
   */
  const usos = await lerUsosDeFoto(input.projectId)
  const chaveDeUso = (i: ImagemCatalogo) =>
    mesclarUsos(usos.get(i.driveFileId), ultimoUsoDoCatalogo(i)) ?? NUNCA_USADA
  imagens.sort((a, b) => chaveDeUso(a).localeCompare(chaveDeUso(b)))

  // As pastas são a espinha semântica destes catálogos: sem elas, quem busca
  // não tem como saber que existe "01_cortes/picanha-bovina" para pedir.
  const pastas = [...new Set(todas.map((i) => i.folder).filter(Boolean))].sort()

  /**
   * A ORDEM é a proposta: o topo da lista é a foto que o sistema recomenda
   * (menos usada primeiro). Registrar a emissão é o que permite, depois,
   * comparar com a que a pessoa de fato escolheu — sem isso o aprendizado só
   * enxerga o que foi aceito.
   */
  const sugestaoId = await registrarProposta(input, imagens, usos)

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
      ultimoUso: mesclarUsos(usos.get(i.driveFileId), ultimoUsoDoCatalogo(i))?.slice(0, 10) ?? 'nunca',
      vezesUsada: usos.get(i.driveFileId)?.vezes ?? 0,
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
  /** O mesmo mapa que ordenou — o sinal precisa gravar o uso REAL, não o do catálogo. */
  usos: Map<string, UsoDaFoto>,
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
        ultimoUso: mesclarUsos(usos.get(i.driveFileId), ultimoUsoDoCatalogo(i)),
      })),
    },
  })
}

/** Listagem crua da pasta, para projetos sem catálogo. */
/**
 * Até onde a listagem crua desce.
 *
 * Eram 2, e não bastava: o Wine Vix guarda o almoço executivo em
 * `Executivo/Principais/Ancho` — TRÊS níveis —, e as 77 fotos de lá eram
 * invisíveis no seletor com a pasta configurada certa. Medido nos 8 clientes:
 * 5 têm pasta de 3º nível (Seu Quinto 17, TERO 11, Quintal 8, Wine Vix 7,
 * Real Gelateria 5). 4 níveis cobre todos com folga.
 */
const PROFUNDIDADE_MAXIMA = 4
/**
 * Teto de pastas visitadas — cada uma é uma chamada ao Drive.
 *
 * Eram 60, abaixo do acervo real: O Quintal tem 61 pastas e já era cortado, e
 * By Rock (161) e Seu Quinto (155) seriam truncados pela metade se caíssem no
 * fallback. 250 cobre o maior de hoje com margem.
 */
const PASTAS_VISITADAS_MAX = 250

/**
 * Listagem crua da pasta, para projetos sem catálogo.
 *
 * ⚠️ DESCE NAS SUBPASTAS. `listFolderFiles` lista só os filhos DIRETOS e exclui
 * pastas (`mimeType != folder`), então uma varredura de um nível só devolve
 * zero para todo cliente que organiza o acervo em pastas por assunto — que é
 * como todos organizam. Era o caso do Bacana (27 subpastas, nenhum arquivo
 * solto na raiz) e do Quintal: pasta configurada, seletor vazio, e a mensagem
 * dizendo que "só a listagem da pasta" funcionava — quando ela não funcionava.
 * Achado em 10/08/2026.
 *
 * Devolve também a pasta de cada imagem e a lista de pastas, para o seletor da
 * bancada mostrar os mesmos chips que mostra em projeto catalogado.
 */
export async function listarImagensDoDrive(projectId: number, limit = 30, folder?: string) {
  const raiz = await pastaDeImagens(projectId)

  const imagens: Array<{ driveFileId: string; fileName: string; mimeType: string; folder: string }> = []
  const pastas = new Set<string>()
  let visitadas = 0

  const varrer = async (folderId: string, caminho: string, profundidade: number): Promise<void> => {
    if (visitadas >= PASTAS_VISITADAS_MAX) return
    visitadas++

    const arquivos = await googleDriveService.listFolderFiles(folderId)
    for (const f of arquivos) {
      if (!(f.mimeType ?? '').startsWith('image/')) continue
      if (caminho) pastas.add(caminho)
      imagens.push({ driveFileId: f.id, fileName: f.name, mimeType: f.mimeType, folder: caminho })
    }

    if (profundidade >= PROFUNDIDADE_MAXIMA) return
    const sub = await googleDriveService.listFiles({ folderId, mode: 'folders' })
    for (const pasta of sub.items ?? []) {
      if (visitadas >= PASTAS_VISITADAS_MAX) break
      await varrer(pasta.id, caminho ? `${caminho}/${pasta.name}` : pasta.name, profundidade + 1)
    }
  }

  await varrer(raiz, '', 0)

  // Filtro por pasta é PREFIXO, como no catálogo: "07_bebidas" traz
  // "07_bebidas/chopp" junto. As pastas oferecidas são sempre as do acervo
  // inteiro — senão, filtrar por uma esconderia todas as outras do seletor.
  const filtradas = folder
    ? imagens.filter((i) => i.folder === folder || i.folder.startsWith(`${folder}/`))
    : imagens

  return {
    /** Quantas casam com o filtro — é o que o "Carregar mais" do seletor lê. */
    total: filtradas.length,
    /** O acervo inteiro, sem filtro de pasta. */
    acervoCompleto: imagens.length,
    images: filtradas.slice(0, limit),
    pastasDisponiveis: Array.from(pastas).sort(),
    /** Verdadeiro quando o teto de pastas cortou a varredura. */
    parcial: visitadas >= PASTAS_VISITADAS_MAX,
  }
}
