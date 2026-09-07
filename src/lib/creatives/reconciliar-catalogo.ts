/**
 * Reconcilia o `_image-catalog.json` de um projeto com o que existe DE FATO na
 * pasta de imagens do Drive.
 *
 * O catálogo é o que dá busca por TEMA ao seletor da bancada e às tools do
 * chat (`acervo.ts`), e ele defasa dos dois lados:
 *
 * - a curadoria APAGA fotos do Drive e a entrada vira órfã — sugestão com
 *   miniatura quebrada (o TERO acumulou 214 até 11/08/2026);
 * - o fotógrafo ADICIONA fotos toda semana, e elas ficam invisíveis para a
 *   busca até alguém rodar o script na mão.
 *
 * A reconciliação é um DIFF DE IDS, sem janela de `createdTime`: foi a janela
 * de meses do `analyze-drive-images.ts` que deixou 501+56 fotos antigas fora do
 * catálogo. Sem janela, a operação é idempotente e o acervo atrasado converge
 * em poucas rodadas — o que sobra do teto do dia entra amanhã.
 *
 * A análise das fotos novas é PORTADA de `scripts/analyze-drive-images.ts`
 * (prompt, miniatura em s400, cardápio da base, parse com fallback). O script
 * continua existindo para rodadas manuais em massa e NÃO é importado: ele vive
 * fora de `src/` e sobe um PrismaClient próprio.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/lib/db'
import {
  analisePelaPasta as analisePelaPastaV3,
  montarPromptDeAnalise,
  montarVocabularioDeTags,
  normalizarAnalise,
  type AnaliseNormalizada,
  type VocabularioDeTags,
} from './catalogo-de-fotos'
import { googleDriveService } from '@/server/google-drive-service'
import {
  CONCORRENCIA_ANALISE,
  MAX_NOVAS_POR_PROJETO_POR_DIA,
  PROFUNDIDADE_MAXIMA,
  aplicarTeto,
  diffDeIds,
  haTempo,
  podaSuspeita,
  type ResultadoReconciliacao,
} from '@/lib/creatives/reconciliacao'

const CATALOG_FILE = '_image-catalog.json'
/** Quantos `files.get` só para hash a rodada faz por projeto (o listing não traz md5). */
const TETO_DE_GETS_DE_HASH = 200

/** Uma entrada do catálogo, no formato que `acervo.ts` já lê. */
interface EntradaDoCatalogo extends Partial<AnaliseNormalizada> {
  driveFileId: string
  fileName: string
  folder: string
  folderId?: string
  createdTime?: string
  /**
   * Hash do CONTEÚDO, vindo de graça do listing do Drive (B8). Duas entradas
   * com o mesmo `md5` são o MESMO arquivo — no acervo do By Rock,
   * `ambiente-05.jpg` e `ambiente-f3a8697.jpg` são iguais byte a byte. Sem
   * isto a duplicata inflava a contagem do acervo e o rodízio tratava como
   * duas fotos o que é uma só.
   */
  md5?: string
  /**
   * Quando a foto entrou no catálogo (ISO date-time) — o que dá o boost de
   * NOVIDADE ao ranking do acervo (plano de 29/08/2026, § Manutenção).
   *
   * Só a entrada NOVA carrega o campo, e isso é deliberado: a reconciliação é
   * um diff que não retoca entrada existente, então foto antiga nunca ganha o
   * carimbo — ausência = não é novidade, sem boost. Não backfillar.
   */
  catalogadaEm?: string
  menuItem: string | null
  menuCategory: string | null
  description: string
  tags: string[]
  mood: string
  bestFor: string[]
  quality: string
  usageHistory: { date: string; theme: string }[]
  /** A visão recusou olhar esta foto — a descrição saiu só da pasta. */
  analiseBloqueada?: true
  /**
   * Preço, valor em R$ ou cardápio com preços LEGÍVEIS no quadro — o DNA
   * proíbe preço na peça, e o ranking rebaixa (01/09/2026). Só a entrada
   * analisada com a pergunta tem o campo; ausente = neutro.
   */
  precoLegivel?: boolean
  /** Marca de terceiro em DESTAQUE (cerveja, refrigerante, loja vizinha), ou null. */
  marcaDeTerceiro?: string | null
}

interface Catalogo {
  projectId?: number
  projectName?: string
  catalogFileId?: string | null
  lastUpdated?: string
  regeneradoEm?: string
  images: EntradaDoCatalogo[]
}

interface FotoViva {
  id: string
  name: string
  folder: string
  folderId: string
  createdTime?: string
  md5?: string
}

/** O que a análise de visão devolve por foto — a v3 inteira (`catalogo-de-fotos.ts`). */
type Analise = AnaliseNormalizada & { analiseBloqueada?: true }

export interface ReconciliarCatalogoInput {
  projectId: number
  /**
   * Instante (epoch ms) em que a rodada para de PEGAR trabalho novo. O que já
   * está em voo termina, e o catálogo é gravado depois — ver
   * `ORCAMENTO_DA_RODADA_MS`.
   */
  prazoEm?: number
  /** Teto de fotos novas analisadas nesta rodada. */
  tetoDeNovas?: number
}

export async function reconciliarCatalogo({
  projectId,
  prazoEm = Number.POSITIVE_INFINITY,
  tetoDeNovas = MAX_NOVAS_POR_PROJETO_POR_DIA,
}: ReconciliarCatalogoInput): Promise<ResultadoReconciliacao> {
  const inicio = Date.now()

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, googleDriveImagesFolderId: true, googleDriveFolderId: true },
  })

  /**
   * Os DEMAIS clientes da carteira, para a guarda de saída da descrição (B7).
   * Uma consulta por projeto reconciliado — barata, e o cron roda de madrugada.
   */
  const outrosClientes = (
    await db.project.findMany({ where: { id: { not: projectId } }, select: { name: true } })
  )
    .map((p) => p.name?.trim())
    .filter((n): n is string => !!n && n.length >= 4)

  const base = {
    projectId,
    projeto: project?.name ?? `projeto ${projectId}`,
    orfasRemovidas: 0,
    novasCatalogadas: 0,
    restantes: 0,
    erros: 0,
  }
  const encerrar = (extra: Partial<ResultadoReconciliacao> = {}): ResultadoReconciliacao => ({
    ...base,
    ...extra,
    duracaoMs: Date.now() - inicio,
  })

  // Mesma resolução de `acervo.ts`: o catálogo tem de ser o que o seletor lê.
  const pasta = project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId
  if (!pasta) return encerrar({ pulado: 'sem-pasta' })

  /**
   * Catálogo inexistente PULA o projeto. Criar do zero é decisão manual: a
   * primeira análise de um acervo inteiro são milhares de chamadas pagas de
   * visão, e nada disso pode ser disparado por um cron da madrugada.
   */
  const catalogoId = await googleDriveService.findFileInFolder(pasta, CATALOG_FILE)
  if (!catalogoId) return encerrar({ pulado: 'sem-catalogo' })

  const catalogo = await googleDriveService.readFileAsJson<Catalogo>(catalogoId)
  const entradas = Array.isArray(catalogo?.images) ? catalogo.images : []

  /**
   * Catálogo VAZIO é o mesmo caso do de cima com outra roupa: ou a análise
   * nunca rodou, ou rodou inteira contra um modelo aposentado (aconteceu em
   * 10/08/2026). Encher um acervo inteiro a 120 fotos por dia, sem ninguém
   * pedir, é a decisão manual disfarçada de rotina.
   */
  if (entradas.length === 0) return encerrar({ pulado: 'catalogo-vazio' })

  const vivas = await varrerImagens(pasta)

  /**
   * Varredura vazia com catálogo cheio não é acervo apagado — é credencial,
   * permissão ou pasta reapontada. Podar aqui destruiria o catálogo inteiro.
   */
  if (vivas.size === 0) return encerrar({ pulado: 'varredura-vazia' })

  const { orfas, novas } = diffDeIds(vivas.keys(), entradas.map((e) => e.driveFileId))

  if (podaSuspeita(entradas.length, orfas.length)) {
    console.warn(
      `[reconciliar-catalogo] ${base.projeto}: poda suspeita (${orfas.length} de ${entradas.length} entradas) — nada gravado`,
    )
    return encerrar({ pulado: 'poda-suspeita' })
  }

  const orfasSet = new Set(orfas)
  const imagens = orfas.length > 0 ? entradas.filter((e) => !orfasSet.has(e.driveFileId)) : entradas

  /**
   * Backfill do hash nas entradas que já existiam (B8).
   *
   * A reconciliação é um DIFF DE IDS e por desenho não toca em entrada
   * existente — sem isto, o `md5` só chegaria às fotos catalogadas daqui para
   * frente e a detecção de duplicata ficaria inócua no acervo atual. O dado já
   * veio na varredura, então é de graça: nem chamada nova, nem download.
   */
  let hashesPreenchidos = 0
  for (const entrada of imagens) {
    if (entrada.md5) continue
    const viva = vivas.get(entrada.driveFileId)
    if (viva?.md5) {
      entrada.md5 = viva.md5
      hashesPreenchidos++
    }
  }

  /**
   * 🔴 O listing NÃO devolve `md5Checksum` neste acervo (medido em 07/09/2026:
   * 245 fotos listadas, zero com hash, embora o `fields` o peça) — por isso o
   * backfill acima nunca preencheu nada e `md5` estava vazio em 100% das
   * 12.694 entradas. O `files.get` devolve. Dois caminhos baratos: o hash
   * que a indexação de vetores já guardou em `PhotoEmbedding` (uma consulta),
   * e um teto de `get`s por rodada para o resto — o acervo converge em
   * poucas madrugadas sem estourar o orçamento.
   */
  const semHash = imagens.filter((e) => !e.md5)
  if (semHash.length > 0) {
    try {
      const doIndice = await db.$queryRaw<Array<{ driveFileId: string; md5: string | null }>>`
        SELECT "driveFileId", "md5" FROM "PhotoEmbedding" WHERE "projectId" = ${projectId} AND "md5" IS NOT NULL
      `
      const hashPorFoto = new Map(doIndice.map((l) => [l.driveFileId, l.md5!]))
      for (const entrada of semHash) {
        const h = hashPorFoto.get(entrada.driveFileId)
        if (h) {
          entrada.md5 = h
          hashesPreenchidos++
        }
      }
    } catch (erro) {
      console.warn(`[reconciliar-catalogo] ${base.projeto}: md5 do índice indisponível (seguindo):`, erro)
    }
    let gets = 0
    for (const entrada of semHash) {
      if (entrada.md5 || gets >= TETO_DE_GETS_DE_HASH || !haTempo(prazoEm)) continue
      gets++
      try {
        const meta = await googleDriveService.getFileMetadata(entrada.driveFileId, 'md5Checksum')
        if (typeof meta.md5Checksum === 'string' && meta.md5Checksum) {
          entrada.md5 = meta.md5Checksum
          hashesPreenchidos++
        }
      } catch {
        // Foto que o get não alcança fica para a próxima rodada.
      }
    }
  }

  const { paraAnalisar, restantes } = aplicarTeto(
    novas.map((id) => vivas.get(id)!),
    tetoDeNovas,
  )

  /**
   * F2 (07/09/2026): a foto NOVA ganha o vetor no mesmo passo em que ganha a
   * descrição — a miniatura já está em mãos. Best-effort e depois de gravar
   * o catálogo: falhar aqui não pode custar a análise paga que acabou de
   * acontecer, e o script de carga (`indexar-embeddings-de-fotos`) alcança
   * o que ficar para trás.
   */
  const novasParaIndexar: Array<EntradaDoCatalogo & { miniatura: Buffer }> = []

  // v3: vocabulário fechado (pilares aprovados + pastas do acervo) e o
  // contexto do DNA, carregados UMA vez por projeto.
  const [pilares, contextoDaMarca] = await Promise.all([carregarPilares(projectId), carregarContextoDaMarca(projectId)])
  const vocabulario = montarVocabularioDeTags({ pilares, pastas: [...new Set(imagens.map((e) => e.folder))] })

  const { catalogadas, erros, naoAlcancadas } = await analisarNovas({
    projectId,
    projectName: base.projeto,
    outrosClientes,
    vocabulario,
    contextoDaMarca,
    fotos: paraAnalisar,
    prazoEm,
    aoCatalogar: (entrada, miniatura) => {
      imagens.push(entrada)
      novasParaIndexar.push({ ...entrada, miniatura })
    },
  })

  // Grava só se mudou: rodada sem drift não deve nem tocar no arquivo.
  if (orfas.length > 0 || catalogadas > 0 || hashesPreenchidos > 0) {
    await googleDriveService.writeFileAsJson(catalogoId, {
      ...catalogo,
      images: imagens,
      lastUpdated: new Date().toISOString(),
    })
  }

  let vetoresIndexados = 0
  try {
    const { indexarFotosDoCatalogo } = await import('./indexar-fotos')
    const { removerEmbeddingsDeFotos } = await import('./embeddings-de-foto')
    if (orfas.length > 0) await removerEmbeddingsDeFotos(projectId, orfas)
    if (novasParaIndexar.length > 0) {
      const r = await indexarFotosDoCatalogo({ projectId, entradas: novasParaIndexar, concorrencia: 2, prazoEm })
      vetoresIndexados = r.gravadas
    }
  } catch (erro) {
    console.warn(`[reconciliar-catalogo] ${base.projeto}: indexação de vetores falhou (seguindo):`, erro)
  }

  return encerrar({
    orfasRemovidas: orfas.length,
    hashesPreenchidos,
    novasCatalogadas: catalogadas,
    restantes: restantes + naoAlcancadas,
    erros,
    vetoresIndexados,
  })
}

// ─── Varredura do Drive ──────────────────────────────────────────────

/**
 * Todas as imagens vivas da pasta, descendo `PROFUNDIDADE_MAXIMA` níveis, com
 * o caminho da pasta de cada uma (o catálogo guarda `folder`, e é por ele que a
 * busca por tema casa quando não há tags).
 *
 * Varre por NÍVEL, em lotes de pastas — ver `listChildrenOfFolders`.
 */
async function varrerImagens(raiz: string): Promise<Map<string, FotoViva>> {
  const vivas = new Map<string, FotoViva>()
  let nivelAtual: Array<{ id: string; caminho: string }> = [{ id: raiz, caminho: '' }]

  for (let nivel = 0; nivel <= PROFUNDIDADE_MAXIMA && nivelAtual.length > 0; nivel++) {
    const caminhoPorId = new Map(nivelAtual.map((p) => [p.id, p.caminho]))
    const ids = nivelAtual.map((p) => p.id)

    const arquivos = await googleDriveService.listChildrenOfFolders(ids, 'images')
    for (const arquivo of arquivos) {
      const pai = arquivo.parents.find((p) => caminhoPorId.has(p))
      const caminho = pai ? caminhoPorId.get(pai)! : ''
      vivas.set(arquivo.id, {
        id: arquivo.id,
        name: arquivo.name,
        folder: caminho,
        folderId: pai ?? raiz,
        createdTime: arquivo.createdTime,
        md5: arquivo.md5Checksum,
      })
    }

    if (nivel >= PROFUNDIDADE_MAXIMA) break

    const subpastas = await googleDriveService.listChildrenOfFolders(ids, 'folders')
    nivelAtual = subpastas.map((sub) => {
      const pai = sub.parents.find((p) => caminhoPorId.has(p))
      const base = pai ? caminhoPorId.get(pai)! : ''
      return { id: sub.id, caminho: base ? `${base}/${sub.name}` : sub.name }
    })
  }

  return vivas
}

// ─── Análise das fotos novas ─────────────────────────────────────────

async function analisarNovas({
  projectId,
  projectName,
  outrosClientes,
  vocabulario,
  contextoDaMarca,
  fotos,
  prazoEm,
  aoCatalogar,
}: {
  outrosClientes: string[]
  projectId: number
  projectName: string
  vocabulario: VocabularioDeTags
  contextoDaMarca: string
  fotos: FotoViva[]
  prazoEm: number
  aoCatalogar: (entrada: EntradaDoCatalogo, miniatura: Buffer) => void
}): Promise<{ catalogadas: number; erros: number; naoAlcancadas: number }> {
  if (fotos.length === 0) return { catalogadas: 0, erros: 0, naoAlcancadas: 0 }

  const chave = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!chave) {
    console.warn(
      `[reconciliar-catalogo] ${projectName}: ${fotos.length} foto(s) nova(s) sem análise — GOOGLE_GENERATIVE_AI_API_KEY ausente`,
    )
    return { catalogadas: 0, erros: 0, naoAlcancadas: fotos.length }
  }

  const cardapio = await carregarCardapio(projectId)
  const genAI = new GoogleGenerativeAI(chave)

  let catalogadas = 0
  let erros = 0
  let proxima = 0

  const worker = async () => {
    while (proxima < fotos.length) {
      // O relógio é conferido ANTES de pegar a próxima foto: o que já está em
      // voo termina e é salvo. Análise paga descartada é o pior desfecho.
      if (!haTempo(prazoEm)) return
      const foto = fotos[proxima++]
      try {
        const miniatura = await baixarMiniatura(foto.id)
        const analise = await analisarImagem({
          genAI,
          imagem: miniatura,
          pasta: foto.folder,
          cardapio,
          projectName,
          outrosClientes,
          vocabulario,
          contextoDaMarca,
        })
        aoCatalogar({
          driveFileId: foto.id,
          fileName: foto.name,
          folder: foto.folder,
          folderId: foto.folderId,
          createdTime: foto.createdTime,
          md5: foto.md5,
          // Carimbo de novidade — só a entrada NOVA o recebe (ver o campo).
          catalogadaEm: new Date().toISOString(),
          ...analise,
          usageHistory: [],
        }, miniatura)
        catalogadas++
      } catch (error) {
        // Foto que falha não derruba a leva — conta e segue.
        erros++
        console.warn(
          `[reconciliar-catalogo] ${projectName}: falha em ${foto.folder}/${foto.name}: ${mensagem(error)}`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA_ANALISE, fotos.length) }, worker))

  // O que o relógio não alcançou: nem catalogado, nem tentado. Foto que FALHOU
  // conta em `erros` (e volta sozinha na próxima rodada, pelo diff).
  return { catalogadas, erros, naoAlcancadas: fotos.length - catalogadas - erros }
}

/**
 * O cardápio do cliente, para a análise usar os nomes EXATOS dos pratos.
 *
 * Mesma consulta do script: categoria CARDAPIO primeiro, e como alguns
 * projetos guardam o cardápio em ESTABELECIMENTO_INFO, entradas cujo título
 * fala em cardápio entram depois.
 */
async function carregarCardapio(projectId: number): Promise<string> {
  const entradas = await db.knowledgeBaseEntry.findMany({
    where: {
      projectId,
      OR: [
        { category: 'CARDAPIO' },
        {
          category: 'ESTABELECIMENTO_INFO',
          title: { contains: 'cardap', mode: 'insensitive' },
        },
        {
          category: 'ESTABELECIMENTO_INFO',
          title: { contains: 'cardáp', mode: 'insensitive' },
        },
      ],
    },
    select: { content: true, category: true },
  })

  return entradas
    .sort((a, b) => (a.category === 'CARDAPIO' ? 0 : 1) - (b.category === 'CARDAPIO' ? 0 : 1))
    .map((e) => e.content)
    .join('\n\n')
}

/**
 * A miniatura em s400 — não a foto inteira. É o que o script já fazia: 400px
 * bastam para a visão descrever a cena e evitam baixar megabytes por foto.
 */
async function baixarMiniatura(fileId: string): Promise<Buffer> {
  const meta = await googleDriveService.getFileMetadata(fileId, 'thumbnailLink')
  const link = meta.thumbnailLink
  if (!link) throw new Error('sem thumbnail no Drive')

  const resposta = await fetch(link.replace(/=s\d+/, '=s400'))
  if (!resposta.ok) throw new Error(`thumbnail HTTP ${resposta.status}`)
  return Buffer.from(await resposta.arrayBuffer())
}

/** Os slugs dos pilares aprovados — o vocabulário de tema que o cliente já curou. */
async function carregarPilares(projectId: number): Promise<string[]> {
  try {
    const linhas = await db.contentPillar.findMany({ where: { projectId, aprovado: true }, select: { slug: true }, orderBy: { ordem: 'asc' } })
    return linhas.map((p) => p.slug)
  } catch {
    return []
  }
}

/** Direção fotográfica e estética do DNA — o que faz a visão reconhecer a casa. */
async function carregarContextoDaMarca(projectId: number): Promise<string> {
  try {
    const dna = await db.brandDNA.findUnique({ where: { projectId }, select: { photoDirection: true, visualStyle: true } })
    const cortar = (t: string | null | undefined, teto: number) => (t ? (t.length > teto ? `${t.slice(0, teto)}…` : t) : '')
    const partes: string[] = []
    if (dna?.photoDirection) partes.push(`DIREÇÃO FOTOGRÁFICA E CENÁRIO DA CASA:\n${cortar(dna.photoDirection, 4500)}`)
    if (dna?.visualStyle) partes.push(`ESTÉTICA DA MARCA:\n${cortar(dna.visualStyle, 2000)}`)
    return partes.join('\n\n')
  } catch {
    return ''
  }
}

async function analisarImagem({
  genAI,
  imagem,
  pasta,
  cardapio,
  projectName,
  outrosClientes,
  vocabulario,
  contextoDaMarca,
}: {
  genAI: GoogleGenerativeAI
  imagem: Buffer
  pasta: string
  cardapio: string
  projectName: string
  /** Nomes dos DEMAIS clientes da carteira — ver `semClienteAlheio`. */
  outrosClientes: string[]
  vocabulario: VocabularioDeTags
  contextoDaMarca: string
}): Promise<Analise> {
  /**
   * ⚠️ `gemini-2.0-flash` foi APOSENTADO: `generateContent` devolve 404 embora
   * o nome siga aparecendo no ListModels. Foi assim que a catalogação quebrou
   * em silêncio (toda foto virava erro e o catálogo era salvo VAZIO). Override
   * por env para o dia em que o 2.5 também se aposentar.
   */
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash',
  })

  // O prompt ÚNICO da v3 — o mesmo do script de enriquecimento.
  const prompt = montarPromptDeAnalise({ projectName, pasta, cardapio, contextoDaMarca, vocabulario })

  const conteudo = [
    prompt,
    { inlineData: { mimeType: 'image/jpeg', data: imagem.toString('base64') } },
  ]

  /**
   * Backoff exponencial SÓ para 429/503: erro de conteúdo ou de credencial não
   * melhora esperando, e retentar seria queimar cota à toa.
   */
  let resposta
  for (let tentativa = 0; ; tentativa++) {
    try {
      resposta = await model.generateContent(conteudo)
      break
    } catch (error) {
      const msg = mensagem(error)
      const limitado = /\b(429|503)\b|rate limit|quota|overloaded|unavailable/i.test(msg)
      if (!limitado || tentativa >= 3) throw error
      await new Promise((r) => setTimeout(r, 2000 * 2 ** tentativa + Math.floor(Math.random() * 500)))
    }
  }

  let texto: string
  try {
    texto = resposta.response.text().trim()
  } catch (error) {
    /**
     * Resposta BLOQUEADA pelo filtro de segurança (`PROHIBITED_CONTENT`) —
     * acontece de verdade: a foto nova do Bacana em 11/08/2026 estava na pasta
     * "Fotos - Clientes" e foi recusada.
     *
     * Sem tratamento, a foto continua fora do catálogo e o diff a redescobre
     * TODA madrugada: uma chamada paga por dia, para sempre, e um `erros: 1`
     * permanente no resumo — que é como se ensina a equipe a ignorar o resumo.
     * Ela entra com a análise que dá para fazer sem ver a imagem (a pasta), o
     * que já a torna encontrável por pasta, e com a marca do motivo.
     */
    if (!/blocked|PROHIBITED_CONTENT|SAFETY|Text not available/i.test(mensagem(error))) throw error
    return { ...analisePelaPasta(pasta), analiseBloqueada: true }
  }

  const json = texto.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
  try {
    const analise = normalizarAnalise(JSON.parse(json), vocabulario, { pasta })
    return { ...analise, description: semClienteAlheio(analise.description, projectName, outrosClientes) }
  } catch {
    // JSON ilegível: entra pelo que dá para saber sem a análise (a pasta),
    // como sempre foi — e volta a ser tentada só se alguém reenriquecer.
    return analisePelaPasta(pasta)
  }
}

function semClienteAlheio(descricao: string, projectName: string, outros: string[]): string {
  const normal = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const meu = normal(projectName)
  let saida = descricao
  for (const alheio of outros) {
    if (alheio.length < 4) continue // nome curto demais casa por acaso
    if (normal(alheio) === meu) continue
    const re = new RegExp(alheio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    if (re.test(saida)) {
      saida = saida.replace(re, 'o restaurante')
      console.warn(
        `[reconciliar-catalogo] ${projectName}: descrição citava "${alheio}" — nome de outro cliente, substituído`,
      )
    }
  }
  return saida
}

/** O que dá para dizer de uma foto sem conseguir olhá-la: a pasta em que mora. */
function analisePelaPasta(pasta: string): Analise {
  return analisePelaPastaV3(pasta)
}

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
