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

/** Uma entrada do catálogo, no formato que `acervo.ts` já lê. */
interface EntradaDoCatalogo {
  driveFileId: string
  fileName: string
  folder: string
  folderId?: string
  createdTime?: string
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
}

/** O que a análise de visão devolve por foto. */
type Analise = Pick<
  EntradaDoCatalogo,
  | 'menuItem'
  | 'menuCategory'
  | 'description'
  | 'tags'
  | 'mood'
  | 'bestFor'
  | 'quality'
  | 'analiseBloqueada'
>

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

  const { paraAnalisar, restantes } = aplicarTeto(
    novas.map((id) => vivas.get(id)!),
    tetoDeNovas,
  )

  const { catalogadas, erros, naoAlcancadas } = await analisarNovas({
    projectId,
    projectName: base.projeto,
    fotos: paraAnalisar,
    prazoEm,
    aoCatalogar: (entrada) => imagens.push(entrada),
  })

  // Grava só se mudou: rodada sem drift não deve nem tocar no arquivo.
  if (orfas.length > 0 || catalogadas > 0) {
    await googleDriveService.writeFileAsJson(catalogoId, {
      ...catalogo,
      images: imagens,
      lastUpdated: new Date().toISOString(),
    })
  }

  return encerrar({
    orfasRemovidas: orfas.length,
    novasCatalogadas: catalogadas,
    restantes: restantes + naoAlcancadas,
    erros,
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
  fotos,
  prazoEm,
  aoCatalogar,
}: {
  projectId: number
  projectName: string
  fotos: FotoViva[]
  prazoEm: number
  aoCatalogar: (entrada: EntradaDoCatalogo) => void
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
        })
        aoCatalogar({
          driveFileId: foto.id,
          fileName: foto.name,
          folder: foto.folder,
          folderId: foto.folderId,
          createdTime: foto.createdTime,
          ...analise,
          usageHistory: [],
        })
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

async function analisarImagem({
  genAI,
  imagem,
  pasta,
  cardapio,
  projectName,
}: {
  genAI: GoogleGenerativeAI
  imagem: Buffer
  pasta: string
  cardapio: string
  projectName: string
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

  const secaoCardapio = cardapio
    ? `CARDÁPIO COMPLETO DO RESTAURANTE (use EXATAMENTE estes nomes):\n${cardapio}`
    : '(Cardápio não disponível — descreva o prato pelo que vê na foto)'

  const prompt = `Analise esta foto do restaurante "${projectName}".

A foto está na pasta "${pasta}" do acervo do restaurante.

${secaoCardapio}

Retorne um JSON com:
{
  "menuItem": "Nome EXATO do item do cardápio acima (copie letra por letra). null se não for comida/bebida ou se não conseguir identificar",
  "menuCategory": "Categoria: PRATOS_PRINCIPAIS, PETISCOS_ENTRADAS, BURGERS, CHAPAS, SALADAS, SOBREMESAS, BEBIDAS, AMBIENTE, AREA_KIDS, MUSICA, ou null",
  "description": "Descrição curta em português do que aparece na foto (1-2 frases)",
  "tags": ["lista", "de", "tags", "relevantes"],
  "mood": "Uma palavra: casual, aconchegante, animado, dramatico, elegante, familiar, festivo",
  "bestFor": ["lista de temas de post ideais para esta foto: almoco, happy-hour, abertura, area-kids, churrasco, etc"],
  "quality": "alta, media, ou baixa (baseado em foco, iluminação, composição)"
}

REGRAS OBRIGATÓRIAS:
1. menuItem DEVE ser copiado EXATAMENTE como aparece no cardápio acima (mesma capitalização, acentos e grafia)
2. Se a foto mostra comida mas você não consegue associar a nenhum item específico do cardápio, use null
3. NÃO invente nomes de pratos — use APENAS os que constam no cardápio
4. Se for ambiente, pessoas, decoração ou área externa: menuItem = null, menuCategory = "AMBIENTE"
5. Se for bebida (cerveja, chopp, drink, etc): menuCategory = "BEBIDAS"
6. Responda APENAS o JSON, sem markdown`

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
    const bruto = JSON.parse(json) as Partial<Analise>
    return {
      menuItem: bruto.menuItem ?? null,
      menuCategory: bruto.menuCategory ?? null,
      description: bruto.description ?? `Foto do restaurante (pasta: ${pasta})`,
      tags: Array.isArray(bruto.tags) ? bruto.tags : [],
      mood: bruto.mood ?? 'casual',
      bestFor: Array.isArray(bruto.bestFor) ? bruto.bestFor : ['generico'],
      quality: bruto.quality ?? 'media',
    }
  } catch {
    // Fallback do script: entrada pobre porém navegável é melhor que foto
    // invisível para a busca.
    return analisePelaPasta(pasta)
  }
}

/** O que dá para dizer de uma foto sem conseguir olhá-la: a pasta em que mora. */
function analisePelaPasta(pasta: string): Analise {
  return {
    menuItem: null,
    menuCategory: pasta.toLowerCase().includes('ambiente') ? 'AMBIENTE' : null,
    description: `Foto do restaurante (pasta: ${pasta})`,
    tags: pasta ? [pasta.toLowerCase()] : [],
    mood: 'casual',
    bestFor: ['generico'],
    quality: 'media',
  }
}

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
