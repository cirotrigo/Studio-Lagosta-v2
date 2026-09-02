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
import {
  filtrarAcervo,
  palavrasDoTema,
  ranquearAcervo,
  type FotoRanqueada,
  type PilarParaBusca,
  type PreferenciasDeFoto,
} from '@/lib/creatives/ranquear-acervo'
import { lerPreferenciasDeFoto } from '@/lib/aprendizado/sinal-de-foto'
import { googleDriveService } from '@/server/google-drive-service'
import { registrarSugestao } from '@/lib/aprendizado/captura'
import { chaveDeSugestao, diaBRT, resumoEstavel } from '@/lib/aprendizado/chaves'

const CATALOG_FILE = '_image-catalog.json'

/**
 * Versão do ranqueamento do acervo.
 *
 * v2 (30/08/2026): score composto aprendido (`ranquearAcervo`) — destaques da
 * curadoria, escolhas/rejeições dos sinais, feedback de arte, qualidade,
 * novidade e relevância do tema por PALAVRA, com o rodízio de "menos usada"
 * rebaixado a desempate. A versão entra na chave de sugestão (regra da casa,
 * `chaves.ts`): a safra nova não herda desfecho de proposta feita pela
 * heurística velha (v1 = menos usada primeiro, tema por substring da frase).
 */
const VERSAO_DO_ACERVO = 'acervo-v2'
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
  /** Hash do conteúdo (B8) — igual em duas entradas significa arquivo idêntico. */
  md5?: string
  /**
   * ISO — carimbado pela reconciliação SÓ nas entradas novas. Ausente = foto
   * antiga, sem boost de novidade (a regra "o diff não retoca entrada
   * existente" trabalha a favor aqui).
   */
  catalogadaEm?: string
  /**
   * A visão viu PREÇO legível no quadro (carta de vinhos com "R$239") — viola
   * o DNA. Só fotos analisadas depois de 01/09/2026 têm o campo; ausente =
   * neutro no ranking.
   */
  precoLegivel?: boolean
  /** Marca de terceiro em DESTAQUE (guarda-sol Brahma, geladeira de refrigerante). Ausente/null = neutro. */
  marcaDeTerceiro?: string | null
}

export interface Catalogo {
  projectId: number
  projectName: string
  /** Catálogos antigos usam lastUpdated; os regerados, regeneradoEm */
  lastUpdated?: string
  regeneradoEm?: string
  images: ImagemCatalogo[]
}

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
 * Ela sozinha não serve para ordenar: nenhum caminho do Studio escrevia
 * `usageHistory`, então isto devolvia `'2000-01-01'` para toda foto e o `sort`
 * ordenava um campo constante. O valor que vale vem de `mesclarUsos`, que
 * funde isto com o registro do banco (`PhotoUsage`).
 *
 * Exportada para o backtest do ranking montar o mesmo Map de último uso que
 * `buscarNoAcervo` monta.
 */
export function ultimoUsoDoCatalogo(img: ImagemCatalogo): string | undefined {
  const h = img.usageHistory
  return h?.length ? h[h.length - 1].date : undefined
}

export interface BuscarAcervoInput {
  projectId: number
  /**
   * Tema — casa por PALAVRA com bestFor, tags e o caminho da pasta (F2), com
   * os pilares aprovados do cliente como expansão de sinônimo. A relevância do
   * casamento também entra no score.
   */
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
  /**
   * Quantas pular antes de montar a página (B2). A ordem é estável DENTRO DO
   * DIA (comparator total do ranking + semente diária), então paginar por
   * posição é seguro aqui. `limit` não tem teto: pedir mais de uma vez costuma
   * ser melhor que paginar.
   */
  offset?: number
  /**
   * Registrar a lista ranqueada como PROPOSTA (LearningSignal `foto`)? Default
   * `true` — é o que fecha o ciclo de aprendizado quando alguém decide. `false`
   * para EXPLORAÇÃO: quem só está olhando o acervo ("o que tem de ambiente?")
   * não recebeu proposta nenhuma, e registrar mesmo assim inflava o
   * denominador do KPI — 7 sinais numa conversa que não decidiu nada
   * (01/09/2026). Os chamadores que decidem (propor-semana, arte-rapida) não
   * passam nada e seguem registrando.
   */
  registrarSugestao?: boolean
}

/**
 * A leitura do catálogo no Drive — compartilhada entre `buscarNoAcervo` e o
 * backtest do ranking (F1.5, `validar-ranking-do-acervo`).
 *
 * ⚠️ NÃO registra sugestão nenhuma: é leitura pura. O registro da proposta é
 * exclusivo de `buscarNoAcervo` — o backtest existe justamente porque chamar a
 * busca de verdade gravaria um `LearningSignal` por rodada.
 *
 * Lança `SEM_CATALOGO` tanto para catálogo ausente quanto para catálogo
 * VAZIO — vazio é pior que nenhum: ele desliga o fallback da listagem crua e o
 * acervo inteiro do cliente some do seletor, sem erro nenhum. Acontece de
 * verdade — o `analyze-drive-images` salva o arquivo mesmo quando toda foto
 * falhou na análise, que foi o que ocorreu enquanto ele apontava para um
 * modelo de visão aposentado (10/08/2026). Tratar como "sem catálogo" devolve
 * o cliente à navegação por pasta, que é degradação honesta em vez de tela
 * vazia.
 */
export async function lerCatalogoDoProjeto(
  projectId: number,
): Promise<{ catalogo: Catalogo; todas: ImagemCatalogo[] }> {
  const folderId = await pastaDeImagens(projectId)

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

  if (todas.length === 0) {
    throw new CreativeError(
      'SEM_CATALOGO',
      'O catálogo deste projeto está vazio (a análise ainda não rodou ou falhou). Use a listagem da pasta.',
      404,
    )
  }

  return { catalogo, todas }
}

/** Destaques ativos (curadoria explícita, F1) — falha devolve Set vazio. */
async function lerDestaques(projectId: number): Promise<Set<string>> {
  try {
    const linhas = await db.photoDestaque.findMany({
      where: { projectId, revogadoEm: null },
      select: { driveFileId: true },
    })
    return new Set(linhas.map((l) => l.driveFileId))
  } catch (erro) {
    console.warn('[acervo] não consegui ler os destaques (seguindo sem eles):', erro)
    return new Set()
  }
}

/** Pilares aprovados — a expansão de sinônimo do tema (F2). Falha devolve []. */
async function lerPilaresAprovados(projectId: number): Promise<PilarParaBusca[]> {
  try {
    return await db.contentPillar.findMany({
      where: { projectId, aprovado: true },
      orderBy: { ordem: 'asc' },
      select: { slug: true, nome: true, exemplos: true },
    })
  } catch (erro) {
    console.warn('[acervo] não consegui ler os pilares (seguindo sem eles):', erro)
    return []
  }
}

/**
 * Os insumos do score aprendido (F1.3), numa ida só: preferências dos sinais,
 * destaques da curadoria, pilares aprovados e usos de foto — as quatro fontes
 * em paralelo, cada uma degradando para o valor neutro na falha (leitura de
 * curadoria e de aprendizado NUNCA derruba a busca).
 *
 * ⚠️ NÃO registra sugestão nenhuma: leitura pura, compartilhada com o backtest
 * (F1.5). O registro continua exclusivo de `buscarNoAcervo`.
 */
export async function montarInsumosDeRanking(projectId: number): Promise<{
  preferencias: PreferenciasDeFoto
  destaques: Set<string>
  pilares: PilarParaBusca[]
  usos: Map<string, UsoDaFoto>
}> {
  const [preferencias, destaques, pilares, usos] = await Promise.all([
    lerPreferenciasDeFoto(projectId),
    lerDestaques(projectId),
    lerPilaresAprovados(projectId),
    lerUsosDeFoto(projectId),
  ])
  return { preferencias, destaques, pilares, usos }
}

/**
 * Busca no catálogo do projeto e ordena pelo SCORE APRENDIDO (`ranquearAcervo`,
 * F1.3): destaques da curadoria primeiro, depois o que os sinais dizem que o
 * cliente escolhe (por tema e global), rebaixando o que foi proposto no topo e
 * preterido — com qualidade, novidade e relevância do tema somando, e o
 * rodízio de "menos usada" como desempate, não mais como critério único.
 */
export async function buscarNoAcervo(input: BuscarAcervoInput) {
  const { catalogo, todas } = await lerCatalogoDoProjeto(input.projectId)

  /**
   * Os insumos vêm ANTES do filtro porque o filtro de tema precisa de um
   * deles: a expansão de sinônimo (F2) usa os pilares aprovados do cliente.
   * São todos por projeto — nada aqui depende do resultado do filtro.
   */
  const { preferencias, destaques, pilares, usos } = await montarInsumosDeRanking(input.projectId)

  // Catálogos regerados (taxonomia v2) não trazem qualidade/tags/bestFor — só a
  // pasta. Aplicar o filtro nesse caso zeraria o acervo inteiro em silêncio;
  // `filtrarAcervo` recebe o boolean e pula o filtro, o aviso é decidido aqui.
  const temQualidade = todas.some((i) => i.quality)
  const avisos: string[] = []
  if (input.quality && !temQualidade) {
    avisos.push('Este catálogo não tem qualidade anotada — o filtro quality foi ignorado.')
  }

  /**
   * O casamento de tema é por PALAVRA (F2, `casaComTema` dentro do filtro):
   * "cortes e churrasco" acerta quem tem "cortes" OU "churrasco" — a substring
   * da frase inteira devolvia ZERO num acervo de mil fotos (By Rock). Acentos
   * são normalizados dos dois lados, porque o catálogo mistura "almoço" e
   * "almoco" no MESMO acervo (medido no Wine Vix). Os filtros exatos (pasta,
   * fileName, menuCategory, tags, quality) não mudaram.
   */
  const palavras = input.theme ? palavrasDoTema(input.theme, pilares) : []
  const imagens = filtrarAcervo(todas, {
    folder: input.folder,
    fileName: input.fileName,
    menuCategory: input.menuCategory,
    tags: input.tags,
    quality: input.quality,
    temQualidadeNoCatalogo: temQualidade,
    palavrasDoTema: palavras,
  })

  /** Primeira entrada de cada hash — as demais são cópias dela. */
  const canonicaPorHash = new Map<string, string>()
  for (const i of todas) if (i.md5 && !canonicaPorHash.has(i.md5)) canonicaPorHash.set(i.md5, i.driveFileId)

  /**
   * O último uso por foto: o banco (`PhotoUsage`) fundido com o `usageHistory`
   * legado do catálogo. Só valores reais entram no Map — ausência significa
   * "nunca usada", que é como `ranquearAcervo` desempata.
   */
  const ultimoUso = new Map<string, string>()
  for (const i of todas) {
    const uso = mesclarUsos(usos.get(i.driveFileId), ultimoUsoDoCatalogo(i))
    if (uso) ultimoUso.set(i.driveFileId, uso)
  }

  /**
   * A ORDEM é o score aprendido — estável dentro do dia (comparator total +
   * semente diária), que é o que a paginação por offset exige. Score ordena,
   * nunca esconde: `ranqueadas` tem exatamente as fotos filtradas.
   */
  const ranqueadas = ranquearAcervo({
    imagens,
    tema: input.theme ?? null,
    pilares,
    preferencias,
    ultimoUso,
    destaques,
    hojeBRT: diaBRT(),
  })

  // As pastas são a espinha semântica destes catálogos: sem elas, quem busca
  // não tem como saber que existe "01_cortes/picanha-bovina" para pedir.
  const pastas = [...new Set(todas.map((i) => i.folder).filter(Boolean))].sort()

  /**
   * A ORDEM é a proposta: o topo da lista é a foto que o sistema recomenda.
   * Registrar a emissão é o que permite, depois, comparar com a que a pessoa
   * de fato escolheu — sem isso o aprendizado só enxerga o que foi aceito.
   */
  const sugestaoId =
    input.registrarSugestao === false ? null : await registrarProposta(input, ranqueadas, ultimoUso, destaques)

  return {
    total: imagens.length,
    acervoCompleto: todas.length,
    catalogoAtualizadoEm: catalogo.lastUpdated ?? catalogo.regeneradoEm ?? null,
    pastasDisponiveis: pastas,
    ...(avisos.length > 0 ? { avisos } : {}),
    ...(sugestaoId ? { sugestaoId, propostaTopo: ranqueadas[0]?.imagem.driveFileId ?? null } : {}),
    /**
     * Quanto do catálogo NÃO foi analisado (B6).
     *
     * Catálogo regerado na taxonomia v2 traz só a pasta — sem tags, sem
     * descrição, sem bestFor. Quem busca por tema não alcança essas fotos e
     * não tinha como saber disso: a busca voltava curta e parecia acervo
     * pequeno. Expor o número torna a lacuna visível sem custar chamada de
     * visão nenhuma.
     */
    /**
     * Fotos que são o MESMO arquivo com nomes diferentes (B8). Sem isto a
     * duplicata inflava o acervo e o rodízio "variava" entre duas cópias da
     * mesma imagem. A primeira de cada grupo é a canônica; as demais vêm
     * marcadas com `duplicataDe` na lista.
     */
    catalogacao: {
      total: todas.length,
      duplicadas: (() => {
        const vistos = new Map<string, number>()
        for (const i of todas) if (i.md5) vistos.set(i.md5, (vistos.get(i.md5) ?? 0) + 1)
        return [...vistos.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0)
      })(),
      semHash: todas.filter((i) => !i.md5).length,
      semDescricao: todas.filter((i) => !i.description).length,
      semTags: todas.filter((i) => !i.tags?.length).length,
    },
    offset: input.offset ?? 0,
    images: ranqueadas
      .slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 20))
      .map((r) => {
        const i = r.imagem
        return {
          driveFileId: i.driveFileId,
          fileName: i.fileName,
          folder: i.folder,
          menuItem: i.menuItem ?? null,
          menuCategory: i.menuCategory ?? null,
          description: i.description ?? null,
          tags: i.tags ?? [],
          bestFor: i.bestFor ?? [],
          quality: i.quality ?? null,
          ultimoUso: ultimoUso.get(i.driveFileId)?.slice(0, 10) ?? 'nunca',
          vezesUsada: usos.get(i.driveFileId)?.vezes ?? 0,
          // A canônica é a PRIMEIRA do catálogo com aquele hash.
          duplicataDe: i.md5 ? (canonicaPorHash.get(i.md5) === i.driveFileId ? undefined : canonicaPorHash.get(i.md5)) : undefined,
          /** Curadoria explícita (F1): a foto está no pool de destaques ativos. */
          destaque: destaques.has(i.driveFileId),
          /** Sem NENHUM sinal e sem uso registrado — candidata à cota de exploração. */
          vagaDeExploracao: r.vagaDeExploracao,
          // O que o catálogo sabe que fere o DNA — só quando a foto foi
          // analisada com as perguntas (01/09/2026); ausente é ausente.
          ...(i.precoLegivel !== undefined ? { precoLegivel: i.precoLegivel } : {}),
          ...(i.marcaDeTerceiro !== undefined ? { marcaDeTerceiro: i.marcaDeTerceiro } : {}),
        }
      }),
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
  ranqueadas: Array<FotoRanqueada<ImagemCatalogo>>,
  /** O mesmo mapa que desempatou o ranking — o sinal grava o uso REAL (banco + legado), não só o do catálogo. */
  ultimoUso: Map<string, string>,
  destaques: Set<string>,
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
      topo: ranqueadas[0].imagem.driveFileId,
      propostas: ranqueadas.slice(0, PROPOSTAS_REGISTRADAS).map((r, posicao) => ({
        posicao: posicao + 1,
        driveFileId: r.imagem.driveFileId,
        fileName: r.imagem.fileName,
        folder: r.imagem.folder,
        ultimoUso: ultimoUso.get(r.imagem.driveFileId) ?? null,
        destaque: destaques.has(r.imagem.driveFileId),
        vagaDeExploracao: r.vagaDeExploracao,
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
