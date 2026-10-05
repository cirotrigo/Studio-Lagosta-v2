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
import { lerUsosDeFotoComEstado, mesclarUsos, type UsoDaFoto } from '@/lib/creatives/uso-de-foto'
import {
  filtrarAcervo,
  calcularIdf,
  gruposDoTema,
  palavrasDoTema,
  ranquearAcervo,
  type FotoRanqueada,
  type PilarParaBusca,
  type PreferenciasDeFoto,
} from '@/lib/creatives/ranquear-acervo'
import { diaDoUltimoUso, excluirFotos, identidadeDaExclusao, normalizarExclusao } from '@/lib/creatives/excluir-fotos'
import { dataValida } from '@/lib/posts/contexto-da-semana'
import { lerPreferenciasDeFoto } from '@/lib/aprendizado/sinal-de-foto'
import { googleDriveService } from '@/server/google-drive-service'
import { registrarSugestao } from '@/lib/aprendizado/captura'
import { chaveDeSugestao, diaBRT, resumoEstavel } from '@/lib/aprendizado/chaves'
import { buscarSemelhantes, embedarConsulta, normalizarPorRank } from '@/lib/creatives/embeddings-de-foto'

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
/**
 * v3 (07/09/2026): busca lexical por grupos com maioria, raridade e
 * sinônimos (F1) + similaridade semântica por embedding de imagem e de
 * descrição (F2). Safra nova: a proposta de hoje não é a mesma da v2.
 */
const VERSAO_DO_ACERVO = 'acervo-v3'
/** Quantas fotos o ranking vetorial traz para o pelotão de candidatas. */
const SEMELHANTES_CONSULTADAS = 200
/** Similaridade mínima (0..1, por posição) para uma foto entrar SEM casar palavra. */
const CORTE_DOS_EXTRAS = 0.5
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
  /** v3 (F4, 07/09/2026) — ver `catalogo-de-fotos.ts`. Ausentes na análise antiga. */
  assunto?: string | null
  elementos?: string[]
  enquadramento?: string | null
  momento?: string | null
  lotacao?: string | null
  pessoas?: string | null
  tagsLivres?: string[]
  analiseVersao?: string
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
   * Fotos JÁ ESCOLHIDAS nesta leva (driveFileId) — saem da lista (PR 6).
   * Exclusão explícita de quem busca, declarada na resposta; o rodízio só
   * empurra para baixo.
   */
  excluirDriveFileIds?: string[]
  /** "AAAA-MM-DD": foto com uso registrado a partir desta data sai da lista (PR 6). */
  evitarUsadasDesde?: string
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
  /** A leitura dos usos deu certo? `false` = mapa vazio por FALHA, não por ausência de uso (R24). */
  usosLidos: boolean
  erroDosUsos: string | null
}> {
  const [preferencias, destaques, pilares, leituraDosUsos] = await Promise.all([
    lerPreferenciasDeFoto(projectId),
    lerDestaques(projectId),
    lerPilaresAprovados(projectId),
    lerUsosDeFotoComEstado(projectId),
  ])
  return { preferencias, destaques, pilares, usos: leituraDosUsos.usos, usosLidos: leituraDosUsos.ok, erroDosUsos: leituraDosUsos.erro }
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
  const { preferencias, destaques, pilares, usos, usosLidos, erroDosUsos } = await montarInsumosDeRanking(input.projectId)

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
  /**
   * F1 (07/09/2026): a busca casa por GRUPOS com maioria e raridade —
   * `gruposDoTema` traz os sinônimos do dicionário e do pilar; `calcularIdf`
   * é do acervo INTEIRO (não da lista filtrada), e vai também ao ranking.
   */
  const grupos = input.theme ? gruposDoTema(input.theme, pilares) : []
  const idf = grupos.length > 0 ? calcularIdf(todas) : undefined
  const filtrosExatos = {
    folder: input.folder,
    fileName: input.fileName,
    menuCategory: input.menuCategory,
    tags: input.tags,
    quality: input.quality,
    temQualidadeNoCatalogo: temQualidade,
  }
  const lexicais = filtrarAcervo(todas, {
    ...filtrosExatos,
    palavrasDoTema: grupos.flat(),
    gruposDoTema: grupos,
    idf,
  })

  /**
   * F2 (07/09/2026): a busca ENXERGA a foto. O tema vira vetor no mesmo
   * modelo que embedou cada foto (imagem e descrição); as mais parecidas
   * entram no pelotão de candidatas mesmo sem casar palavra nenhuma — é o
   * que responde "salão cheio" e "fachada à noite" num catálogo que nunca
   * escreveu essas palavras. Os filtros EXATOS (pasta, tags, qualidade…)
   * continuam valendo para elas. A similaridade vai ao ranking como insumo
   * pré-calculado (`ranquearAcervo` é puro, sem rede) e é NORMALIZADA por
   * posição — o coseno cru vive numa faixa estreita.
   *
   * Nada disto derruba a busca: sem chave, sem vetor ou sem tabela, a lista
   * é a lexical de sempre.
   */
  let similaridade: Map<string, number> | undefined
  let imagens = lexicais
  let viaSemantica = 0
  if (input.theme && grupos.length > 0) {
    const vetor = await embedarConsulta(input.theme)
    const semelhantes = vetor ? await buscarSemelhantes(input.projectId, vetor, SEMELHANTES_CONSULTADAS) : new Map()
    if (semelhantes.size > 0) {
      similaridade = normalizarPorRank(semelhantes)
      const jaNaLista = new Set(lexicais.map((i) => i.driveFileId))
      // Foto SEM palavra casada entra só do pelotão de cima dos parecidos
      // (`CORTE_DOS_EXTRAS`); o resto da lista serve para dar posição a quem
      // casou. Um gate "só quando a lexical é fraca" foi medido e descartado:
      // custava os temas visuais (12% contra 28%) sem ganhar nos reais.
      const extras = filtrarAcervo(todas, { ...filtrosExatos, palavrasDoTema: [] }).filter(
        (i) => (similaridade!.get(i.driveFileId) ?? 0) >= CORTE_DOS_EXTRAS && !jaNaLista.has(i.driveFileId),
      )
      viaSemantica = extras.length
      imagens = [...lexicais, ...extras]
    }
  }

  /** Primeira entrada de cada hash — as demais são cópias dela. */
  const canonicaPorHash = new Map<string, string>()
  for (const i of todas) if (i.md5 && !canonicaPorHash.has(i.md5)) canonicaPorHash.set(i.md5, i.driveFileId)

  /**
   * O último uso por foto: o banco (`PhotoUsage`) fundido com o `usageHistory`
   * legado do catálogo. Só valores reais entram no Map — ausência significa
   * "nunca usada", que é como `ranquearAcervo` desempata.
   */
  const ultimoUso = new Map<string, string>()
  /**
   * O DIA em Brasília do último uso, por foto — para a EXCLUSÃO por data, que
   * compara dias: cada fonte vira dia ANTES de escolher a mais recente. Fundir
   * pelo texto (`mesclarUsos`) deixava o timestamp do banco vencer a data do
   * legado que caía num dia posterior em Brasília (R26).
   */
  const diaDoUso = new Map<string, string>()
  for (const i of todas) {
    const doBanco = usos.get(i.driveFileId)
    const doCatalogo = ultimoUsoDoCatalogo(i)
    const uso = mesclarUsos(doBanco, doCatalogo)
    if (uso) ultimoUso.set(i.driveFileId, uso)
    const dia = diaDoUltimoUso(doBanco?.ultimoUso, doCatalogo)
    if (dia) diaDoUso.set(i.driveFileId, dia)
  }

  /**
   * A ORDEM é o score aprendido — estável dentro do dia (comparator total +
   * semente diária), que é o que a paginação por offset exige. Score ordena,
   * nunca esconde: `ranqueadas` tem exatamente as fotos filtradas.
   */
  const ranqueadasTodas = ranquearAcervo({
    imagens,
    tema: input.theme ?? null,
    pilares,
    preferencias,
    ultimoUso,
    destaques,
    hojeBRT: diaBRT(),
    idf,
    similaridade,
  })

  /**
   * A EXCLUSÃO pedida por quem busca (PR 6): as fotos já escolhidas na leva e
   * as usadas a partir de uma data saem da lista ANTES de a proposta ser
   * registrada — o que se registra é o que a pessoa viu. Data inválida em
   * `evitarUsadasDesde` não exclui nada e vira aviso.
   */
  const exclusao = excluirFotos(ranqueadasTodas, { ids: input.excluirDriveFileIds, usadasDesde: input.evitarUsadasDesde }, diaDoUso)
  if (input.evitarUsadasDesde && !dataValida(input.evitarUsadasDesde)) {
    avisos.push(`evitarUsadasDesde ignorado: "${input.evitarUsadasDesde}" não é uma data AAAA-MM-DD que exista no calendário.`)
  }
  /**
   * A leitura dos usos FALHOU e a pessoa pediu corte por uso: a exclusão saiu
   * só com o legado do catálogo e fotos usadas podem ter voltado à lista. Isso
   * é dito — `porUso: 0` sem aviso pareceria exclusão cumprida (R24 da
   * revisão de 386118cc). A busca segue disponível.
   */
  const usoIncompleto = Boolean(input.evitarUsadasDesde && dataValida(input.evitarUsadasDesde) && !usosLidos)
  if (usoIncompleto) {
    avisos.push(`a exclusão por uso ficou INCOMPLETA: não consegui ler os usos registrados (${erroDosUsos ?? 'falha na consulta'}) — fotos usadas desde ${input.evitarUsadasDesde} podem ter voltado à lista; confira antes de escolher.`)
  }
  const ranqueadas = exclusao.mantidas

  // As pastas são a espinha semântica destes catálogos: sem elas, quem busca
  // não tem como saber que existe "01_cortes/picanha-bovina" para pedir.
  const pastas = [...new Set(todas.map((i) => i.folder).filter(Boolean))].sort()

  /**
   * A ORDEM é a proposta: o topo da lista é a foto que o sistema recomenda.
   * Registrar a emissão é o que permite, depois, comparar com a que a pessoa
   * de fato escolheu — sem isso o aprendizado só enxerga o que foi aceito.
   */
  const sugestaoId =
    input.registrarSugestao === false ? null : await registrarProposta(input, ranqueadas, ultimoUso, destaques, exclusao.resumo.idsPorUso)

  return {
    total: ranqueadas.length,
    ...(exclusao.pedida ? { excluidas: { ...exclusao.resumo, ...(usoIncompleto ? { porUsoIncompleta: true } : {}) } } : {}),
    /** Quantas candidatas entraram só pela semelhança (sem casar palavra). */
    viaSemantica,
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
  /** Os ids que saíram por uso nesta busca — entram na identidade da proposta (R21). */
  excluidasPorUso: string[] = [],
): Promise<string | null> {
  /**
   * Busca sem resultado TAMBÉM é registrada (07/09/2026), com `total: 0` e
   * `propostas: []`. Até então ela não deixava rastro — e é justamente ela que
   * diz "a equipe procurou e o acervo não tem", o dado que a pauta de
   * fotografia mais precisa. Ninguém a lê como rejeição: sem propostas, nem
   * `agregarSinaisDeFoto` nem `fecharSugestaoDeFoto` têm o que fechar, e a
   * expiração é neutra.
   */
  /**
   * A EXCLUSÃO entra na identidade da proposta (PR 6): a lista que a pessoa
   * viu com a foto A excluída é OUTRA lista — o topo mudou — e não pode
   * reutilizar a proposta registrada sem exclusão no mesmo dia (o `upsert`
   * preservaria o topo antigo e a escolha de B viraria "troca"). Normalizada,
   * para que os mesmos ids em outra ordem continuem sendo o mesmo pedido; só
   * entra quando pedida, para não mudar a chave de quem nunca excluiu.
   */
  const exclusao = normalizarExclusao({ ids: input.excluirDriveFileIds, usadasDesde: input.evitarUsadasDesde })
  const criterios = {
    theme: input.theme,
    folder: input.folder,
    menuCategory: input.menuCategory,
    tags: input.tags,
    quality: input.quality,
    ...(exclusao.ids.length > 0 ? { excluir: exclusao.ids } : {}),
    ...(exclusao.desde ? { evitarUsadasDesde: exclusao.desde } : {}),
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
      // A exclusão com a CAIXA dos ids preservada (`resumoEstavel` passa
      // strings por minúsculas e "AbC"/"abc" colidiam — R17). Só entra quando
      // há exclusão: a chave de quem nunca excluiu é a de sempre.
      ...(identidadeDaExclusao({ ids: input.excluirDriveFileIds, usadasDesde: input.evitarUsadasDesde }, excluidasPorUso) ? [identidadeDaExclusao({ ids: input.excluirDriveFileIds, usadasDesde: input.evitarUsadasDesde }, excluidasPorUso)] : []),
    ),
    sugerido: {
      criterios,
      total: ranqueadas.length,
      topo: ranqueadas[0]?.imagem.driveFileId ?? null,
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
