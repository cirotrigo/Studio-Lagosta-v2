/**
 * Pipeline da geração de arte do zero — o trabalho pesado que a rota (ou a
 * tool MCP) dispara em background via `after()`.
 *
 * Irmão do creative-improvement-runner, com as mesmas garantias: fases
 * medidas e logadas, verificação de texto por visão (trilha `arte`), budget
 * de tempo com retentativa consciente, dedução de créditos não-fatal DEPOIS
 * do sucesso, e FAILED honesto com o motivo gravado.
 *
 * O contrato de referências (docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md):
 * subject → âncoras → style → brand-card → logo, com o preâmbulo de papéis
 * prefixado pelo backend. Toda geração grava {prompt, refs, params, modelo}
 * em fieldValues — o registro atômico que permite aprender com cada run.
 */

import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import { runImageEdit, type RawEditImage } from '@/lib/ai/openai-image-client'
import { generateImageWithGemini } from '@/lib/ai/gemini-image-client'
import { loadBrandContext } from '@/lib/brand/brand-context'
import { getBrandReferenceCard } from '@/lib/ai/brand-reference-card'
import { renderTypeSpecimen } from '@/lib/ai/type-specimen'
import { verifyImageTexts } from '@/lib/ai/creative-text-verification'
import {
  buildArtePrompt,
  buildImagePromptViaLLM,
  buildReferencePreamble,
  orderReferences,
  validateImagePrompt,
  type ArtReferenceRole,
  type GenerationTrack,
} from '@/lib/ai/image-prompt-builder'
import { googleDriveService } from '@/server/google-drive-service'
import {
  cantoDaAssinatura,
  comporLogo,
  instrucaoAreaReservada,
  instrucaoLogoPeloModelo,
  instrucaoMarcaDoCliente,
  logoModePadraoPara,
  type LogoCorner,
  type LogoMode,
} from '@/lib/ai/logo-compositor'
import { decodificarGuia, type GuiaLido } from '@/lib/ai/carousel-guide-decoder'
import { checarProporcao, conferirFidelidadeDaCena, resumirQA } from '@/lib/ai/creative-qa'
import { ancoraAmbienteAutomatica } from '@/lib/ai/anchor-images'
import { escolherReferenciaDeEstilo, registrarUsoDaReferencia } from '@/lib/ai/style-references'
import { pedirNovaTentativa } from '@/lib/ai/generation-queue'
import { registrarUsoDeFoto } from '@/lib/creatives/uso-de-foto'
import { qualidadePadraoPara, type QualidadeArte } from '@/lib/ai/qualidade-arte'
import { modeloLivre } from '@/lib/ai/modelo-livre'
import { MAX_ANCHOR_REFS } from '@/lib/ai/image-prompt-builder'
import type { FeatureKey } from '@/lib/credits/feature-config'

// Mesmo teto de sanitização do insta-automatico: foto acima de 4000px/lado
// (48MP de iPhone) derruba a API com `invalid_image_file`.
const MAX_INPUT_DIM = 4000
// Âncoras e referências secundárias não precisam de 4000px — 3000 mantém o
// detalhe e segura o payload (Gemini recebe tudo inline em base64).
const MAX_REF_DIM = 3000
const MAX_OPENAI_INPUT_BYTES = 4 * 1024 * 1024
/**
 * Teto de bytes da cena entregue no nativo (trilha `imagem`). O limite de
 * imagem do Instagram é 8 MB e o 4K medido em 12/08/2026 saiu com 7,69 MB —
 * 6 MB deixa folga para o post que use a cena direto, sem tocar na dimensão.
 */
const MAX_PUBLICAVEL_BYTES = 6 * 1024 * 1024

const MAX_GENERATION_ATTEMPTS = 2
/**
 * Margem ADITIVA sobre a duração MEDIDA da geração anterior, para decidir a
 * retentativa.
 *
 * O princípio de 09/08/2026 continua: medir a primeira e exigir esse tempo, em
 * vez de um teto fixo — foi um teto de 45s que fez a retentativa abortar no
 * meio quando a geração levava 131s, queimando dois minutos e uma chamada da
 * OpenAI para terminar no mesmo FAILED.
 *
 * A folga de 1,2× era proporcional ao tempo de GERAÇÃO, mas o que se gasta
 * depois dela não escala com ela: é a checagem de texto (~5-10s) mais o QA por
 * visão (~5-10s). Numa geração de 2 minutos, 20% viram 24s de exigência a mais
 * sem nada para cobrir — e em 10/08 isso recusou uma retentativa que cabia,
 * por 0,4 segundo (geração 109,5s, restavam 131s, exigiu 131,4s).
 *
 * ⚠️ Isto recupera só os casos de borda. O teto real é o `maxDuration = 300`
 * da rota: duas gerações de ~120s não cabem numa invocação, e nenhuma folga
 * resolve isso. A saída estrutural é retentar em OUTRA invocação (padrão da
 * fila de render), não espremer esta.
 */
const MARGEM_POS_GERACAO_MS = 20_000
/**
 * Canto reservado para a logo. Fixo (e não escolhido pela medição de calma)
 * porque o prompt precisa saber ONDE deixar limpo ANTES de gerar — medir
 * depois só serviria para achar um canto que o modelo não preparou.
 */
const LOGO_CORNER: LogoCorner = 'bottom-right'
/**
 * Co-branding: o canto da marca do CLIENTE CITADO, oposto ao da marca do
 * projeto dono. Os dois cantos de baixo porque em story o topo é do Instagram
 * (avatar à esquerda, controles à direita) — ver `comporLogo`.
 */
const CLIENT_LOGO_CORNER: LogoCorner = 'bottom-left'
const BACKGROUND_BUDGET_MS = 290_000
const FINALIZE_RESERVE_MS = 35_000
/** Piso: abaixo disto nem a geração mais rápida cabe. */
const MIN_RETRY_BUDGET_MS = 45_000

export interface ArtGenerationReference {
  role: Exclude<ArtReferenceRole, 'brand-card' | 'logo' | 'series-guide' | 'style-guide'>
  url?: string
  driveFileId?: string
  label?: string
  /** Elementos a NÃO reproduzir desta foto (A3) — ver buildReferencePreamble. */
  excluir?: string[]
  /**
   * Presente numa referência `style`, marca a ESCOLHA À MÃO de uma arte
   * aprovada deste projeto (a bancada aponta uma Generation estrelada). É o
   * que separa "combine o clima desta foto de estilo" de "faça parecida com
   * esta peça": só a segunda vira o papel `style-guide`, que manda também na
   * diagramação. Sem este campo as duas chegavam iguais ao runner, e escolher
   * um modelo não mudava o layout da arte (Real Gelateria, 16/08/2026).
   */
  generationId?: string
}

export interface CarouselMeta {
  groupId: string
  slideOrder: number
  totalSlides: number
  /** Generation do slide-guia aprovado, cuja ARTE entra como referência. */
  guideGenerationId?: string | null
}

export interface ArtGenerationJobArgs {
  jobGenerationId: string
  projectId: number
  projectName: string
  projectGoogleDriveFolderId: string | null
  /**
   * Pasta de FOTOS do cliente (acervo). Destino do backup da trilha `imagem`:
   * foto de cena é INSUMO e vai para `Fotos/IA_LAGOSTA`, não para
   * `ARTES LAGOSTA`, que é onde ficam as peças prontas.
   */
  projectGoogleDriveImagesFolderId: string | null
  actorClerkId: string
  orgId?: string
  track: GenerationTrack
  pedido: string
  copy: string[]
  instrucaoImagem: string | null
  /**
   * Co-branding: o cliente CITADO na peça. A logo oficial dele (tabela Logo do
   * projeto dele) é composta por sharp no canto `CLIENT_LOGO_CORNER` depois
   * da geração; o prompt só reserva o canto. Nulo = peça sem segunda marca.
   */
  marcaDoCliente?: { projectId: number; nome: string } | null
  formato: 'story' | 'feed' | 'quadrado'
  aspectRatio: string
  openaiSize: string
  finalSize: { width: number; height: number }
  referencias: ArtGenerationReference[]
  modelo: string
  resolution: '1K' | '2K' | '4K'
  finalPrompt: string | null
  feature: FeatureKey
  creditQuantity: number
  carrossel?: CarouselMeta | null
  /** URL da arte do guia, resolvida pelo serviço (evita ida ao banco aqui). */
  guideResultUrl?: string | null
  /**
   * Quem põe a logo na peça. `compor` (default) cola o PNG oficial com sharp
   * depois da geração; `modelo` manda o arquivo como referência e pede que o
   * modelo o DESENHE — é o que o insta-automatico faz, e integra melhor à
   * composição ao custo do risco de distorção.
   */
  logoMode?: LogoMode
  /**
   * Job da fila durável que está executando este pipeline (F0.3). Presente,
   * a retentativa acontece em OUTRA invocação — ver `pedirNovaTentativa`.
   * Ausente (teste E2E, script), o comportamento antigo vale: retenta no laço.
   */
  queueJobId?: string
  /**
   * Tier do gpt-image na trilha `arte`. Ausente, cai em `qualidadePadraoPara`:
   * `low` para compor texto, `high` quando há ajuste autorizado NA foto.
   */
  qualidade?: QualidadeArte
}

interface LoadedRef {
  role: ArtReferenceRole
  label?: string
  buffer: Buffer
  mimeType: string
  excluir?: string[]
  /** Modo modelo-livre no papel `style-guide` — ver `ArtReferenceDescriptor`. */
  estiloLivre?: boolean
}

/**
 * Monta o aviso de número sem lastro na copy. Vazio quando não há o que dizer —
 * espalhar chave nula pelo fieldValues só suja o registro.
 */
/** Os blocos de logo do prompt (marca da casa + marca do cliente citado), só os que existem. */
function juntarBlocosDeLogo(...blocos: Array<string | null | undefined>): string | null {
  const vivos = blocos.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
  return vivos.length > 0 ? vivos.join('\n\n') : null
}

function avisoDeNumeros(numeros: string[]): Record<string, unknown> {
  if (numeros.length === 0) return {}
  const lista = numeros.slice(0, 5).join(', ')
  return {
    entregueComAlerta: true,
    numerosNaoEsperados: numeros.slice(0, 10),
    numerosAlerta:
      `A arte mostra número que não está na copy (${lista}). ` +
      'Pode ser algo real da foto — ou dado inventado pelo modelo, como contagem de avaliação. Confira antes de aprovar.',
  }
}

/**
 * Aviso de frase copiada da arte de REFERÊNCIA — o irmão do de números, para
 * palavra. Ver `textosVazadosDoModelo`: o defeito que ele vigia derrubou as
 * cinco peças do O Quintal em 17/08/2026, com endereço e horário do post
 * antigo letrados numa peça que não os pedia.
 */
function avisoDeVazamento(textos: string[]): Record<string, unknown> {
  if (textos.length === 0) return {}
  const lista = textos.slice(0, 3).map((t) => `"${t.slice(0, 40)}"`).join(', ')
  return {
    entregueComAlerta: true,
    textosVazados: textos.slice(0, 5),
    vazamentoAlerta:
      `A arte repete texto da arte de referência que não está na copy pedida (${lista}). ` +
      'Confira antes de aprovar: costuma ser horário ou endereço do post antigo.',
  }
}

export async function processArtGenerationInBackground(args: ArtGenerationJobArgs): Promise<void> {
  const startedAt = Date.now()
  let textCheckInfo: Record<string, unknown> = { textCheck: 'skipped' }
  let promptUsado: string | null = null
  /** Registro atômico: qual referência de marca o modelo recebeu de fato. */
  let brandCardOrigem: 'manual-designer' | 'card-gerado' | null = null

  try {
    const brand = await loadBrandContext(args.projectId)

    // ── Referências do usuário (acervo/upload) ────────────────────────────
    const loadedRefs: LoadedRef[] = []
    const downloads = await Promise.all(
      args.referencias.map(async (ref): Promise<LoadedRef | null> => {
        try {
          const source = ref.driveFileId
            ? await fetchImageSource(`/api/google-drive/image/${ref.driveFileId}`)
            : await fetchImageSource(ref.url!)
          const maxDim = ref.role === 'subject' ? MAX_INPUT_DIM : MAX_REF_DIM
          const sane = await sanitizeInput(source.buffer, maxDim)
          /**
           * A arte apontada à mão vira MODELO (manda no layout), não simples
           * referência de clima. A promoção acontece aqui, no runner, e não na
           * borda: a validação de papéis do serviço só conhece os quatro
           * papéis do usuário, e `style-guide` é decisão nossa a partir de um
           * fato — a referência é uma Generation deste projeto.
           */
          const ehModeloEscolhido = ref.role === 'style' && !!ref.generationId
          return {
            role: ehModeloEscolhido ? ('style-guide' as const) : ref.role,
            label: ref.label,
            excluir: ref.excluir,
            // Nos clientes de `modelo-livre.ts` o modelo passa o ESTILO e o
            // layout fica livre — muda o preâmbulo do papel.
            estiloLivre: ehModeloEscolhido && modeloLivre(args.projectId) ? true : undefined,
            ...sane,
          }
        } catch (error) {
          // Âncora que falhou não derruba a geração; subject sim — sem a foto
          // do prato a trilha `arte` produziria cena inventada.
          if (ref.role === 'subject') {
            throw new Error(
              `Falha ao baixar a foto principal: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
          console.warn(`[arte-ia.bg] referência ${ref.role} falhou — seguindo sem ela:`, error)
          return null
        }
      }),
    )
    loadedRefs.push(...downloads.filter((d): d is LoadedRef => d !== null))

    // ── Âncora de ambiente automática (trilha `imagem`) ───────────────────
    // A cena é GERADA nesta trilha; sem foto real do lugar o modelo inventa
    // um ambiente genérico. Se o projeto tem anchor sheet e o chamador não
    // escolheu âncora de ambiente, o sistema injeta a canônica.
    let autoAnchorUsada: string | null = null
    if (args.track === 'imagem' && !loadedRefs.some((r) => r.role === 'anchor-ambient')) {
      const anchorsAtuais = loadedRefs.filter(
        (r) => r.role === 'anchor-ambient' || r.role === 'anchor-dish',
      ).length
      if (anchorsAtuais < MAX_ANCHOR_REFS) {
        const auto = await ancoraAmbienteAutomatica(args.projectId).catch(() => null)
        if (auto) {
          try {
            const source = await fetchImageSource(auto.blobUrl)
            const sane = await sanitizeInput(source.buffer, MAX_REF_DIM)
            loadedRefs.push({
              role: 'anchor-ambient',
              label: auto.label ?? 'ambiente da casa',
              ...sane,
            })
            autoAnchorUsada = auto.id
            console.log(`[arte-ia.bg] âncora de ambiente automática injetada (${auto.id})`)
          } catch (error) {
            console.warn('[arte-ia.bg] âncora automática não baixou — seguindo sem ela:', error)
          }
        }
      }
    }

    // ── Referência de estilo automática (artes aprovadas, em rodízio) ────
    //
    // Só quando ninguém escolheu uma à mão, e nunca no carrossel: ali quem
    // manda no visual é o slide-guia, e uma segunda referência de estilo
    // competiria com ele exatamente na coisa que o LOOK SPINE tenta travar.
    //
    // Uma por vez, sempre a MENOS USADA — referência fixa faz toda peça sair
    // igual, que é o problema que este mecanismo existe para não criar.
    let styleRefUsada: string | null = null
    if (args.track === 'arte' && !args.carrossel) {
      // `style-guide` conta como escolha à mão: é a MESMA referência, promovida
      // logo acima. Esquecê-la aqui faria o rodízio injetar uma segunda arte
      // de estilo para competir com o modelo que a pessoa acabou de escolher.
      if (!loadedRefs.some((r) => r.role === 'style' || r.role === 'style-guide')) {
        const escolhida = await escolherReferenciaDeEstilo(args.projectId).catch(() => null)
        if (escolhida) {
          try {
            const source = await fetchImageSource(escolhida.resultUrl)
            const sane = await sanitizeInput(source.buffer, MAX_REF_DIM)
            loadedRefs.push({ role: 'style', label: 'arte aprovada desta marca', ...sane })
            styleRefUsada = escolhida.generationId
            console.log(
              `[arte-ia.bg] referência de estilo do rodízio: ${escolhida.generationId}` +
                (escolhida.inedita ? ' (inédita)' : ''),
            )
          } catch (error) {
            console.warn('[arte-ia.bg] referência de estilo não baixou — seguindo sem ela:', error)
          }
        }
      } else {
        /**
         * A referência de estilo veio escolhida À MÃO (a bancada deixa apontar
         * uma arte estrelada específica). Quando ela é uma das ESTRELADAS do
         * projeto, o uso conta no rodízio do mesmo jeito — sem isto a
         * escolhida ficava com cara de nunca usada e o rodízio a devolveria
         * no topo da fila. O match é por `resultUrl`, que é o que viaja no
         * pedido; URL que não é de estrelada (foto de estilo do acervo)
         * simplesmente não marca nada.
         */
        const urls = args.referencias
          .filter((r) => r.role === 'style' && r.url)
          .map((r) => r.url as string)
        if (urls.length > 0) {
          const estrelada = await db.generation
            .findFirst({
              where: {
                projectId: args.projectId,
                styleRefAt: { not: null },
                resultUrl: { in: urls },
              },
              select: { id: true },
            })
            .catch(() => null)
          if (estrelada) {
            styleRefUsada = estrelada.id
            console.log(`[arte-ia.bg] referência de estilo escolhida à mão: ${estrelada.id}`)
          }
        }
      }
    }

    /**
     * ── Modelo escolhido à mão: mesma leitura por visão que o slide-guia ──
     *
     * O decodificador é o do carrossel de propósito: a pergunta é idêntica
     * ("o que esta peça faz na camada gráfica?"), e um segundo decodificador
     * seria a mesma prompt em dois lugares, divergindo com o tempo.
     *
     * Falhar aqui não derruba nada — o MODELO SPINE textual e a imagem do
     * modelo seguem no prompt, só sem a lista de decisões explícitas.
     */
    let modeloLido: GuiaLido | null = null
    const refModelo = loadedRefs.find((r) => r.role === 'style-guide')
    if (refModelo) {
      modeloLido = await decodificarGuia(refModelo.buffer, {
        nomeDaMarca: brand?.projectName,
        // Modo livre: a leitura sai sem bandas/faixas/lados, senão a descrição
        // vira instrução de lugar por outra porta (`modelo-livre.ts`).
        semPosicoes: modeloLivre(args.projectId),
      }).catch(() => null)
      console.log(
        modeloLido
          ? `[arte-ia.bg] modelo escolhido decodificado para o MODELO SPINE` +
              // `null` = a visão não respondeu isto; `[]` = respondeu que não
              // há nenhum. Com `strict: false` o tsc não protege este acesso.
              (modeloLido.elementosGraficos === null
                ? ' | elementos gráficos não declarados'
                : modeloLido.elementosGraficos.length > 0
                  ? ` | elementos gráficos a replicar: ${modeloLido.elementosGraficos.join('; ')}`
                  : ' | modelo sem elemento gráfico')
          : '[arte-ia.bg] modelo escolhido não decodificou — segue só com a imagem e o MODELO SPINE',
      )
    }

    // ── Slide-guia do carrossel: a arte aprovada que define o look ───────
    // Entra como imagem porque instrução textual de "mesmo estilo" o modelo
    // reinterpreta; a arte do guia ele copia.
    let guiaLido: GuiaLido | null = null
    if (args.guideResultUrl) {
      try {
        const guia = await fetchImageSource(args.guideResultUrl)
        const sane = await sanitizeInput(guia.buffer, MAX_REF_DIM)
        loadedRefs.push({ role: 'series-guide', label: 'slide-guia aprovado', ...sane })
        // A imagem sozinha deixa o modelo decidir o que é essencial; a
        // descrição por visão transforma "copie o estilo" em lista de
        // decisões explícitas. Indisponível, o LOOK SPINE textual segue.
        guiaLido = await decodificarGuia(sane.buffer, { paraSerie: true, nomeDaMarca: brand?.projectName })
        if (guiaLido) {
          console.log(
            `[arte-ia.bg] guia decodificado para o LOOK SPINE` +
              (guiaLido.elementosGraficos === null
                ? ' | elementos gráficos não declarados'
                : guiaLido.elementosGraficos.length > 0
                  ? ` | elementos gráficos a replicar: ${guiaLido.elementosGraficos.join('; ')}`
                  : ' | guia sem elemento gráfico'),
          )
        }
      } catch (error) {
        console.warn('[arte-ia.bg] slide-guia não baixou — o slide sai sem referência de série:', error)
      }
    }

    // ── Referências do sistema: brand card (só na trilha `arte`) ─────────
    // No modo `compor` (default) a logo NÃO vai ao modelo para ser desenhada:
    // ela é colada depois (logo-compositor), e o card só serve para o modelo
    // RECONHECER a marca. No modo `modelo`, o arquivo oficial entra como
    // referência e o prompt manda reproduzi-lo — é o caminho do
    // insta-automatico, opt-in aqui.
    // Default `modelo` desde 10/08/2026, por decisão do Ciro apoiada em teste
    // real: a marca desenhada a partir do arquivo oficial saiu fiel e integrou
    // melhor que a colagem — e o modo `compor` produzia DUAS logos, porque o
    // modelo desenha a dele mesmo com o "DO NOT DRAW".
    // O default é por PROJETO: marca com ligadura que o gpt-image não
    // reproduz (TERO) cai em `compor` — ver `logoModePadraoPara`.
    const logoMode: LogoMode = args.logoMode ?? logoModePadraoPara(args.projectId)
    let logoParaCompor: Buffer | null = null
    if (args.track === 'arte') {
      const card = await getBrandReferenceCard(brand).catch((error) => {
        console.warn('[arte-ia.bg] brand card falhou — seguindo sem ele:', error)
        return null
      })
      if (card) {
        brandCardOrigem = card.origem
        loadedRefs.push({
          role: 'brand-card',
          buffer: card.buffer,
          mimeType: card.mimeType,
          // O rótulo entra no preâmbulo: o manual do designer é um documento
          // de marca de verdade, e dizer isso muda o peso que o modelo dá.
          label: card.origem === 'manual-designer' ? 'manual oficial de identidade' : undefined,
        })
      }
      // A prancha tipográfica é imagem PRÓPRIA, não faixa do card: empilhada
      // no card ela seria reduzida junto com tudo e os glifos virariam borrão
      // — e o card/manual mostra ~12 glifos por fonte, quase tudo minúscula,
      // que é a raiz das headlines com serifa inventada (Quintal, 11/08/2026).
      const prancha = await renderTypeSpecimen(brand).catch((error) => {
        console.warn('[arte-ia.bg] prancha tipográfica falhou — seguindo sem ela:', error)
        return null
      })
      if (prancha) {
        loadedRefs.push({
          role: 'type-specimen',
          buffer: prancha,
          mimeType: 'image/png',
          label: 'alfabetos oficiais da marca',
        })
      }
      if (brand?.logoUrl) {
        try {
          const logo = await fetchImageSource(brand.logoUrl)
          if (logoMode === 'modelo') {
            // Vai ao modelo em vez de esperar a composição. O preâmbulo do
            // papel `logo` precisa mudar de tom junto (ver buildReferencePreamble).
            loadedRefs.push({
              role: 'logo',
              buffer: logo.buffer,
              mimeType: logo.contentType || 'image/png',
              label: 'arquivo oficial — reproduzir fielmente',
            })
          } else {
            logoParaCompor = logo.buffer
          }
        } catch (error) {
          console.warn('[arte-ia.bg] logo não baixou — a arte sai sem marca:', error)
        }
      } else {
        console.warn(
          `[arte-ia.bg] projeto ${args.projectId} sem logo cadastrada — a arte sai sem marca`,
        )
      }
    }

    // ── Co-branding: a logo do cliente citado (só trilha `arte`) ──────────
    // Lida pelo loader único de identidade (a logo mora na tabela Logo, não em
    // Project.logoUrl). Falha aqui não derruba a arte: ela sai só com a marca
    // do projeto dono e o aviso fica gravado.
    let logoDoClienteParaCompor: Buffer | null = null
    if (args.track === 'arte' && args.marcaDoCliente) {
      try {
        const brandDoCliente = await loadBrandContext(args.marcaDoCliente.projectId)
        if (brandDoCliente?.logoUrl) {
          const logoCliente = await fetchImageSource(brandDoCliente.logoUrl)
          logoDoClienteParaCompor = logoCliente.buffer
        } else {
          console.warn(
            `[arte-ia.bg] cliente citado ${args.marcaDoCliente.projectId} (${args.marcaDoCliente.nome}) sem logo cadastrada — a peça sai sem a marca dele`,
          )
        }
      } catch (error) {
        console.warn('[arte-ia.bg] logo do cliente citado não baixou — a peça sai sem a marca dele:', error)
      }
    }

    const ordered = orderReferences(loadedRefs)
    const downloadMs = Date.now() - startedAt
    console.log(
      `[arte-ia.bg] fase download: ${(downloadMs / 1000).toFixed(1)}s | refs: ${ordered
        .map((r) => r.role)
        .join(', ')}`,
    )

    // ── Prompt ────────────────────────────────────────────────────────────
    const preamble = buildReferencePreamble(ordered)
    let body: string
    let promptIssues: string[] = []

    if (args.finalPrompt) {
      // Modo diretor (MCP): o assistente escreveu o prompt — validamos com a
      // mesma régua da trilha antes de aceitar.
      body = args.finalPrompt
      if (args.track === 'imagem') {
        const check = validateImagePrompt(body)
        promptIssues = check.issues
        if (!check.ok) {
          console.warn(`[arte-ia.bg] finalPrompt com ressalvas: ${check.issues.join(' | ')}`)
        }
      }
    } else if (args.track === 'imagem') {
      const built = await buildImagePromptViaLLM({
        pedido: args.pedido,
        brand,
        refs: ordered.map((r) => ({ role: r.role, label: r.label })),
        aspectRatio: args.aspectRatio,
      })
      body = built.prompt
      promptIssues = built.issues
    } else {
      body = buildArtePrompt({
        copy: args.copy,
        pedido: args.pedido || undefined,
        brand,
        refs: ordered.map((r) => ({ role: r.role, label: r.label })),
        instrucaoImagem: args.instrucaoImagem,
        // A safe area sai em PIXEL da peça real, e só no story — ver
        // `regraDeSafeArea`.
        formato: args.formato,
        alturaPx: args.finalSize.height,
        modelo: modeloLido
          ? { descricao: modeloLido.descricao, elementos: modeloLido.elementosGraficos }
          : null,
        // Três estados: colar depois (reserva o canto), o modelo desenhar
        // (manda reproduzir o arquivo), ou nenhuma logo (não gasta prompt).
        blocoLogo: juntarBlocosDeLogo(
          logoParaCompor
          ? instrucaoAreaReservada(LOGO_CORNER)
          : logoMode === 'modelo' && ordered.some((r) => r.role === 'logo')
            ? // Canto FIXO no slide irmão de carrossel (o LOOK SPINE manda
              // repetir o guia, e marca pulando de canto entre slides é o
              // defeito que ele existe para evitar) e, desde 17/08/2026,
              // também na peça avulsa QUANDO o modelo escolhido diz onde a
              // marca fica — `cantoDaAssinatura`. Sem modelo, ou com a marca
              // centralizada, o canto volta a ser escolha do gerador, que é
              // quem enxerga onde a foto está calma.
              instrucaoLogoPeloModelo(
                args.carrossel ? LOGO_CORNER : cantoDaAssinatura(modeloLido?.assinatura),
                // Em story o bloco derruba a marca para os cantos inferiores —
                // o avatar do Instagram mora no topo esquerdo (O Quintal, 20/08).
                args.formato,
              )
            : null,
          // A segunda marca: reserva o canto do cliente citado. Só existe
          // quando a logo dele baixou — reservar canto para marca que não
          // vem seria buraco na peça.
          logoDoClienteParaCompor && args.marcaDoCliente
            ? instrucaoMarcaDoCliente(CLIENT_LOGO_CORNER, args.marcaDoCliente.nome)
            : null,
        ),
        carrossel: args.carrossel
          ? {
              slideOrder: args.carrossel.slideOrder,
              totalSlides: args.carrossel.totalSlides,
              // O guia é o primeiro slide COM texto: é ele que estabelece o
              // padrão que os demais copiam. A capa é foto pura e não conta.
              ehGuia: !args.carrossel.guideGenerationId,
              temGuia: !!args.guideResultUrl,
              descricaoDoGuia: guiaLido?.descricao ?? null,
              elementosDoGuia: guiaLido?.elementosGraficos ?? null,
            }
          : null,
      })
    }

    const prompt = preamble ? `${preamble}\n\n${body}` : body
    promptUsado = prompt
    console.log(`[arte-ia.bg] prompt pronto (${prompt.length} chars, trilha ${args.track})`)

    // ── Geração (+ verificação de texto e QA na trilha `arte`) ───────────
    const expectedTexts = args.track === 'arte' ? args.copy : []
    let resultBuffer: Buffer | null = null
    const attemptsLog: Array<Record<string, unknown>> = []
    let lastMissing: string[] = []
    /** Duração da geração anterior — base para decidir se a próxima cabe. */
    let ultimaGeracaoMs = 0
    /** Último QA rodado — vai para o registro atômico mesmo quando reprova. */
    let qaInfo: Record<string, unknown> = {}
    // Desde 10/08/2026 (decisão do Ciro, pelo custo real): SÓ a proporção
    // errada regera sozinha — a arte seria inutilizável, o `cover` cortaria a
    // faixa do texto. Texto e QA divergentes ENTREGAM com alerta na primeira
    // geração; corrigir é botão com preço na mão do usuário, porque cada
    // tentativa é uma chamada paga (~US$0,10-0,19) e a maioria das reprovações
    // medidas era falso negativo do verificador.
    let ultimoQaMotivo: string | null = null

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const remainingMs = BACKGROUND_BUDGET_MS - FINALIZE_RESERVE_MS - (Date.now() - startedAt)
      if (attempt > 1) {
        const precisa = Math.max(MIN_RETRY_BUDGET_MS, ultimaGeracaoMs + MARGEM_POS_GERACAO_MS)
        if (remainingMs < precisa) {
          console.warn(
            `[arte-ia.bg] sem orçamento para a tentativa ${attempt}: restam ${Math.round(remainingMs / 1000)}s e a geração anterior levou ${Math.round(ultimaGeracaoMs / 1000)}s — parando em vez de abortar no meio`,
          )
          break
        }
      }

      const genStartedAt = Date.now()
      const candidate = await generateOnce(args, ordered, prompt, Math.max(30_000, remainingMs))
      const generationMs = Date.now() - genStartedAt
      ultimaGeracaoMs = generationMs

      // ── QA 1: proporção. Roda ANTES da visão porque é local, instantâneo e
      // pega o defeito mais caro. O `resize(fit: 'cover')` da finalização
      // CORTA sem avisar quando a proporção diverge, e o corte come justamente
      // a faixa onde o texto mora. Assert, nunca resize de proporção errada.
      const aspecto = await checarProporcao(candidate, args.finalSize)
      if (!aspecto.ok) {
        ultimoQaMotivo = `proporção ${aspecto.largura}x${aspecto.altura} diverge ${(aspecto.desvio * 100).toFixed(0)}% da pedida (${args.finalSize.width}x${args.finalSize.height})`
        qaInfo = { qa: 'failed', qaMotivo: ultimoQaMotivo, qaAspecto: { ...aspecto } }
        attemptsLog.push({ attempt, generationMs, qa: 'aspecto', ok: false, ...aspecto })
        console.warn(`[arte-ia.bg] tentativa ${attempt}: ${ultimoQaMotivo} — regerando em vez de cortar`)
        /**
         * Com fila durável, a segunda geração NUNCA roda nesta invocação: duas
         * gerações de ~120s não cabem nos 300s da rota, e era isso que fazia a
         * retentativa abortar no meio. Devolvida à fila, a Generation continua
         * PROCESSING e a bancada continua acompanhando normalmente.
         */
        if (args.queueJobId) {
          if (await pedirNovaTentativa(args.queueJobId, ultimoQaMotivo)) {
            console.log(`[arte-ia.bg] devolvido à fila para outra invocação (${args.queueJobId})`)
            return
          }
          throw new Error(`QA reprovou e as tentativas acabaram: ${ultimoQaMotivo}`)
        }
        continue
      }

      if (expectedTexts.length === 0) {
        resultBuffer = candidate
        /**
         * A trilha `imagem` não leva texto — mas isso responde a pergunta
         * errada. O risco dela é o PRATO ter mudado, e até 12/08/2026 nada
         * conferia. `conferirFidelidadeDaCena` avisa e nunca reprova; o teto
         * alto de confiança está lá para não repetir o alarme falso que
         * derrubou a revisão visual em 10/08 (ver a nota da função).
         */
        let fidelidade: Record<string, unknown> = {}
        if (args.track === 'imagem') {
          const subject = ordered.find((r) => r.role === 'subject')
          if (subject) {
            const cena = await conferirFidelidadeDaCena(candidate, subject.buffer)
            if (cena.pulada) {
              fidelidade = { cenaCheck: 'skipped', cenaMotivo: cena.motivo }
            } else if (!cena.ok) {
              const alerta = `A cena gerada pode ter mudado o prato (${cena.motivo}). Compare com a foto original antes de usar.`
              console.warn(`[arte-ia.bg] ${alerta}`)
              fidelidade = {
                cenaCheck: 'divergente',
                entregueComAlerta: true,
                cenaAlerta: alerta,
                cenaDetalhe: cena.detalhe,
              }
            } else {
              fidelidade = { cenaCheck: 'passed', cenaDetalhe: cena.detalhe }
            }
          } else {
            fidelidade = { cenaCheck: 'skipped', cenaMotivo: 'geração sem foto de referência' }
          }
        }
        textCheckInfo =
          args.track === 'arte'
            ? { textCheck: 'skipped', textCheckReason: 'peça sem texto (capa pura)' }
            : { textCheck: 'skipped', textCheckReason: 'trilha imagem — peça não leva texto', ...fidelidade }
        qaInfo = { qa: 'passed', qaResumo: resumirQA(aspecto, null), qaAspecto: { ...aspecto } }
        break
      }

      try {
        const checkStartedAt = Date.now()
        // Os textos do modelo entram só como RÉGUA da conferência — eles nunca
        // chegaram ao prompt (ver `descricaoDoGuia`).
        const check = await verifyImageTexts(
          candidate,
          expectedTexts,
          modeloLido?.textos ?? [],
          brand?.projectName ?? null,
        )
        const checkMs = Date.now() - checkStartedAt
        attemptsLog.push({ attempt, generationMs, checkMs, passed: check.passed, missing: check.missing })
        console.log(
          `[arte-ia.bg] tentativa ${attempt}: geração ${(generationMs / 1000).toFixed(1)}s, checagem ${(checkMs / 1000).toFixed(1)}s → ${check.passed ? 'texto OK' : `divergente (${check.missing.length})`}`,
        )
        if (check.passed) {
          /**
           * A inspeção visual por IA (legibilidade + fidelidade da logo) foi
           * DESLIGADA em 10/08/2026, por decisão do Ciro, depois de DOIS
           * falsos negativos confirmados no mesmo dia: o verificador reprovou
           * o "STEAKHOUSE" do By Rock alegando que o arquivo oficial era
           * minúsculo (é maiúsculo) e o "I" amarelo do Wine Vix alegando que
           * o oficial era branco (é amarelo — conferido baixando o arquivo).
           * Alarme falso repetido ensina quem aprova a ignorar o aviso, que é
           * pior do que não ter aviso. A revisão visual é de quem aprova, no
           * olho; `conferirLogo`/`inspecionarArte` seguem em creative-qa.ts
           * para quem quiser religar com um verificador confiável.
           */
          qaInfo = { qa: 'passed', qaResumo: resumirQA(aspecto, null), qaAspecto: { ...aspecto } }
          resultBuffer = candidate
          /**
           * O aviso de número inventado vale JUSTAMENTE aqui, no ramo em que o
           * texto passou: é assim que ele aparece na prática — a copy toda
           * presente, mais um dado que ninguém pediu (contagem de avaliação do
           * Google, medida em 12/08/2026). Se só fosse anexado à reprovação,
           * nunca seria visto.
           */
          textCheckInfo = {
            textCheck: 'passed',
            textCheckAttempts: attemptsLog,
            ...avisoDeNumeros(check.numerosNaoEsperados),
            ...avisoDeVazamento(check.textosVazados),
          }
          break
        }
        lastMissing = check.missing
        // Texto divergente ENTREGA, com o alerta, e NUNCA regera sozinho —
        // decisão do Ciro em 10/08/2026, reafirmada em 12/08 ao introduzir a
        // escolha de tier: o comparador produz falso negativo ("R$ 9,90" vs
        // "R$9,90"), e regerar por conta própria gasta chamada paga para
        // corrigir o que muitas vezes não está errado. Quem confere no fim é o
        // olho de quem aprova; o comparador vira aviso e a correção vira botão
        // — hoje com escolha de modelo (ver `qualidade` nos args).
        {
          const sample = check.missing.slice(0, 3).map((t) => `"${t}"`).join(', ')
          const alerta = `A conferência automática não encontrou ${sample}${check.missing.length > 3 ? ` (+${check.missing.length - 3})` : ''} na arte. Confira o texto no olho antes de aprovar — pode ser erro real do desenho ou implicância do comparador.`
          console.warn(`[arte-ia.bg] entregando com ALERTA de texto: ${alerta}`)
          resultBuffer = candidate
          const porNumeros = avisoDeNumeros(check.numerosNaoEsperados)
          const porVazamento = avisoDeVazamento(check.textosVazados)
          textCheckInfo = {
            textCheck: 'failed',
            entregueComAlerta: true,
            textCheckAlert: [alerta, porNumeros.numerosAlerta, porVazamento.vazamentoAlerta]
              .filter(Boolean)
              .join(' '),
            textCheckAttempts: attemptsLog,
            textCheckExtracted: check.extracted.slice(0, 30),
            ...porNumeros,
            ...porVazamento,
          }
          break
        }
      } catch (visionError) {
        console.warn('[arte-ia.bg] visão indisponível — aplicando sem verificação:', visionError)
        resultBuffer = candidate
        textCheckInfo = {
          textCheck: 'skipped',
          textCheckReason: `visão indisponível: ${visionError instanceof Error ? visionError.message : String(visionError)}`,
          textCheckAttempts: attemptsLog,
        }
        qaInfo = { qa: 'skipped', qaResumo: resumirQA(aspecto, null), qaAspecto: { ...aspecto } }
        break
      }
    }

    if (!resultBuffer && ultimoQaMotivo) {
      // Só chega aqui a proporção errada nas duas tentativas — o único caso
      // que não produz peça aproveitável (cortar seria pior que falhar).
      throw new Error(`QA reprovou após ${attemptsLog.length} tentativa(s): ${ultimoQaMotivo}`)
    }

    if (!resultBuffer) {
      // Rede de segurança: com a entrega-com-alerta nos dois caminhos, não
      // deveria haver como chegar aqui com a geração tendo funcionado.
      throw new Error('geração terminou sem peça e sem motivo registrado')
    }

    // ── Finalização: resize → logo → Blob → backup Drive → Generation ────
    /**
     * O resize é da trilha `arte`, e SÓ dela.
     *
     * Ele nasceu para normalizar os múltiplos de 16 do gpt-image — 1088 → 1080,
     * downscale de 0,7% cujo propósito documentado era PARAR DE FAZER UPSCALE
     * (`creative-improvement-format.ts:9`) — e continua certo lá: a peça pronta
     * tem de sair no tamanho exato de publicação.
     *
     * A trilha `imagem` produz INSUMO: a cena vai para `Fotos/IA_LAGOSTA` para
     * ser recortada e composta depois (ver o destino por trilha, logo abaixo).
     * Ela caiu nesta saída por herança, no mesmo commit que expôs `resolution`
     * (6a15cb62, 09/08/2026), e o efeito era descartar o que acabara de ser
     * pago: medido em 12/08/2026, o `nano-banana-pro` em 4K devolve 3072x5504
     * (16,9 MP) e era gravado em 1080x1920 (2,07 MP) — **87,7% dos pixels no
     * lixo**, na única peça do fluxo que precisa de margem para recorte.
     *
     * `scripts/medir-resolucao-trilha-imagem.ts` refaz a medição.
     */
    const preservarNativo = args.track === 'imagem'
    const metaSaida = await sharp(resultBuffer).metadata()
    let finalBuffer: Buffer
    if (preservarNativo) {
      // O Gemini já devolve image/jpeg; reencodar acrescentaria perda de
      // geração a um arquivo cujo destino é justamente ser editado depois.
      finalBuffer =
        metaSaida.format === 'jpeg'
          ? resultBuffer
          : await sharp(resultBuffer).jpeg({ quality: 92 }).toBuffer()
      /**
       * Teto de BYTES, nunca de pixels.
       *
       * A cena nativa pode ser publicada direto — item de plano sem copy nasce
       * nesta trilha (`execucao.ts:293`) e pode virar post —, e o limite de
       * imagem do Instagram é 8 MB. O 4K medido em 12/08/2026 saiu com 7,69 MB,
       * encostado na borda. Reencodar com qualidade menor tira bytes e PRESERVA
       * os 16,9 MP, que é exatamente o que esta mudança veio entregar; reduzir
       * a dimensão desfaria o conserto para resolver o problema errado.
       *
       * A escada começa ALTA porque o degrau caro é reencodar, não a qualidade
       * escolhida: medido no mesmo 4K, a variância do laplaciano cai para 80,6%
       * já no q=95 e só chega a 74,8% no q=80. Ou seja, quem está abaixo do teto
       * passa intocado (é o caso do 2K), e quem precisa reencodar paga o
       * pedágio uma vez — desperdiçar qualidade depois disso não compra nada.
       */
      for (const qualidade of [95, 88, 80, 72]) {
        if (finalBuffer.length <= MAX_PUBLICAVEL_BYTES) break
        finalBuffer = await sharp(resultBuffer).jpeg({ quality: qualidade }).toBuffer()
        console.log(
          `[arte-ia.bg] cena nativa acima de ${(MAX_PUBLICAVEL_BYTES / 1024 / 1024).toFixed(0)} MB — ` +
            `reencodada em qualidade ${qualidade}, agora ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB (dimensão intacta)`,
        )
      }
    } else {
      finalBuffer = await sharp(resultBuffer)
        .resize(args.finalSize.width, args.finalSize.height, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 92 })
        .toBuffer()
    }
    /**
     * O tamanho REAL do arquivo gravado. `buildFieldValues` escreve o alvo
     * (`args.finalSize`), que na trilha `imagem` deixou de ser o que sai —
     * então ele é sobrescrito no `extra` do caminho de sucesso. Na falha não
     * há arquivo, e o alvo continua sendo o registro honesto do que se pediu.
     */
    const saidaReal = preservarNativo
      ? { width: metaSaida.width ?? args.finalSize.width, height: metaSaida.height ?? args.finalSize.height }
      : args.finalSize
    if (preservarNativo) {
      console.log(
        `[arte-ia.bg] trilha imagem: entregue no nativo ${saidaReal.width}x${saidaReal.height} ` +
          `(${((saidaReal.width * saidaReal.height) / 1e6).toFixed(1)} MP), sem reduzir para ${args.finalSize.width}x${args.finalSize.height}`,
      )
    }

    // A logo REAL entra aqui, depois do resize — nunca desenhada pelo modelo.
    // Falha ao compor não derruba a arte: ela sai sem marca e o aviso fica
    // gravado, porque arte sem logo ainda é editável e uma logo inventada não.
    let logoInfo: Record<string, unknown> = { logoComposta: false, logoMode }
    if (logoParaCompor) {
      try {
        const comLogo = await comporLogo(finalBuffer, logoParaCompor, {
          cornerReservado: LOGO_CORNER,
          // Em story os cantos de topo são do Instagram — ver comporLogo.
          formato: args.formato,
        })
        finalBuffer = comLogo.buffer
        logoInfo = {
          logoMode,
          logoComposta: true,
          logoCanto: comLogo.corner,
          logoMudouDeCanto: comLogo.moveu,
          logoContraste: comLogo.contraste,
        }
        console.log(
          `[arte-ia.bg] logo oficial composta no canto ${comLogo.corner}` +
            (comLogo.moveu ? ` (o canto reservado ${LOGO_CORNER} estava ocupado)` : '') +
            (comLogo.contraste !== null ? ` | contraste ${comLogo.contraste.toFixed(0)}` : ''),
        )
      } catch (logoError) {
        const msg = logoError instanceof Error ? logoError.message : String(logoError)
        console.warn('[arte-ia.bg] composição da logo falhou — arte sai sem marca:', msg)
        logoInfo = { logoComposta: false, logoErro: msg.slice(0, 200) }
      }
    }

    // A marca do CLIENTE CITADO entra depois da marca do dono, em canto FIXO
    // (o oposto), um pouco menor — é assinatura secundária. Falha não derruba a
    // arte, pela mesma razão da logo principal.
    let marcaDoClienteInfo: Record<string, unknown> = {}
    if (logoDoClienteParaCompor && args.marcaDoCliente) {
      try {
        const comMarca = await comporLogo(finalBuffer, logoDoClienteParaCompor, {
          cantoFixo: CLIENT_LOGO_CORNER,
          larguraRatio: 0.13,
          formato: args.formato,
        })
        finalBuffer = comMarca.buffer
        marcaDoClienteInfo = {
          marcaDoCliente: {
            projectId: args.marcaDoCliente.projectId,
            nome: args.marcaDoCliente.nome,
            composta: true,
            canto: comMarca.corner,
            contraste: comMarca.contraste,
          },
        }
        console.log(
          `[arte-ia.bg] marca do cliente citado (${args.marcaDoCliente.nome}) composta no canto ${comMarca.corner}` +
            (comMarca.contraste !== null ? ` | contraste ${comMarca.contraste.toFixed(0)}` : ''),
        )
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro)
        console.warn('[arte-ia.bg] composição da marca do cliente falhou — peça sai só com a marca da casa:', msg)
        marcaDoClienteInfo = {
          marcaDoCliente: { projectId: args.marcaDoCliente.projectId, nome: args.marcaDoCliente.nome, composta: false, erro: msg.slice(0, 200) },
        }
      }
    } else if (args.marcaDoCliente) {
      marcaDoClienteInfo = {
        marcaDoCliente: { projectId: args.marcaDoCliente.projectId, nome: args.marcaDoCliente.nome, composta: false, erro: 'logo do cliente não disponível' },
      }
    }

    const blob = await put(
      `arte-ia/${args.projectId}/${sanitizeName(args.pedido || args.copy[0] || 'arte')}_${Date.now()}.jpg`,
      finalBuffer,
      { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true },
    )

    // Destino no Drive por TRILHA: a cena da trilha `imagem` é insumo de
    // fotografia e vai para o acervo (`Fotos/IA_LAGOSTA`, criada na primeira
    // vez); a peça da trilha `arte` continua indo para `ARTES LAGOSTA`, que é
    // de onde a equipe tira o que já está pronto para publicar.
    let googleDriveFileId: string | null = null
    let googleDriveBackupUrl: string | null = null
    const ehTrilhaImagem = args.track === 'imagem'
    const pastaDoBackup = ehTrilhaImagem
      ? args.projectGoogleDriveImagesFolderId ?? args.projectGoogleDriveFolderId
      : args.projectGoogleDriveFolderId
    if (pastaDoBackup && googleDriveService.isEnabled()) {
      try {
        const backup = ehTrilhaImagem
          ? await googleDriveService.uploadAIGeneratedImage(finalBuffer, pastaDoBackup, args.projectName)
          : await googleDriveService.uploadCreativeToArtesLagosta(finalBuffer, pastaDoBackup, args.projectName)
        googleDriveFileId = backup.fileId
        googleDriveBackupUrl = backup.publicUrl
      } catch (backupError) {
        console.warn('[arte-ia.bg] backup no Drive falhou:', backupError)
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
    const baseFieldValues = buildFieldValues(args, {
      prompt,
      promptIssues,
      refsUsadas: ordered.map((r) => ({ role: r.role, label: r.label ?? null })),
      autoAnchorId: autoAnchorUsada,
      styleRefId: styleRefUsada,
      // Registro atômico da run: houve modelo a seguir, e a visão conseguiu
      // lê-lo? Sem isto, "a arte não ficou parecida com o modelo" volta a ser
      // impossível de diagnosticar sem reproduzir o pedido inteiro.
      ...(refModelo ? { modeloSeguido: true, modeloDecodificado: !!modeloLido } : {}),
      brandCardOrigem,
      elapsedSeconds,
      // Sobrescreve o alvo com o que de fato foi gravado (ver `saidaReal`).
      finalSize: `${saidaReal.width}x${saidaReal.height}`,
      ...qaInfo,
      ...logoInfo,
      ...marcaDoClienteInfo,
      ...textCheckInfo,
    })

    await db.generation.update({
      where: { id: args.jobGenerationId },
      data: {
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname,
        googleDriveFileId,
        googleDriveBackupUrl,
        completedAt: new Date(),
        fieldValues: baseFieldValues as any,
      },
    })
    console.log(`[arte-ia.bg] concluído em ${elapsedSeconds}s → ${blob.url}`)

    // Rodízio: a referência só vai para o fim da fila depois de a arte existir.
    // Marcar antes faria uma geração que falhou "gastar" a referência.
    if (styleRefUsada) await registrarUsoDaReferencia(styleRefUsada)

    /**
     * Rodízio do acervo (B5): as fotos do cliente que entraram nesta arte
     * ficam marcadas como usadas. DEPOIS do sucesso — contar uso de foto cuja
     * arte falhou mentiria sobre a preferência do cliente, mesma razão pela
     * qual o rodízio de referência de estilo só marca uso quando a arte existe.
     */
    await registrarUsoDeFoto({
      projectId: args.projectId,
      driveFileIds: args.referencias
        .map((r) => r.driveFileId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
      origem: 'arte-ia',
      tema: args.pedido || args.copy[0] || null,
      generationId: args.jobGenerationId,
    })

    // Dedução DEPOIS do sucesso e não-fatal (regra da casa desde a melhoria).
    try {
      await deductCreditsForFeature({
        clerkUserId: args.actorClerkId,
        feature: args.feature,
        // TOTAL, não multiplicador (ver `creditosADebitar` em credits/deduct).
        creditsTotal: args.creditQuantity,
        /**
         * `details` é o que `estimateUsdCost` lê para o painel de gastos —
         * sem `resolution` (trilha imagem) e sem `inputSize`/`quality`
         * (trilha arte) ele não casava chave nenhuma e TODA geração do arte-ia
         * caía no fallback de $0,012/crédito. Como as duas features mapeiam
         * para AI_IMAGE_GENERATION, o maior consumidor do sistema era
         * justamente o que o painel estimava no chute (12/08/2026).
         */
        details: {
          generationId: args.jobGenerationId,
          track: args.track,
          model: args.modelo,
          formato: args.formato,
          elapsedSeconds,
          ...(args.track === 'imagem'
            ? { resolution: args.resolution, apiProvider: 'gemini-direct' }
            : { inputSize: args.openaiSize, quality: 'high' }),
        },
        organizationId: args.orgId,
        projectId: args.projectId,
      })
    } catch (deductError) {
      const msg = deductError instanceof Error ? deductError.message : String(deductError)
      console.error(
        `[arte-ia.bg] dedução de créditos FALHOU (generation ${args.jobGenerationId}) — arte segue valendo, acertar à mão:`,
        msg,
      )
      await db.generation
        .update({
          where: { id: args.jobGenerationId },
          data: { fieldValues: { ...baseFieldValues, creditDeductionError: msg.slice(0, 400) } as any },
        })
        .catch(() => null)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[arte-ia.bg] failed:', message)
    await db.generation
      .update({
        where: { id: args.jobGenerationId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          fieldValues: buildFieldValues(args, {
            prompt: promptUsado,
            error: message,
            failedAt: new Date().toISOString(),
            ...textCheckInfo,
          }) as any,
        },
      })
      .catch((updateError) => {
        console.error('[arte-ia.bg] falha ao marcar FAILED:', updateError)
      })
  }
}

/** Uma chamada de geração, roteada pela trilha. */
async function generateOnce(
  args: ArtGenerationJobArgs,
  ordered: LoadedRef[],
  prompt: string,
  timeoutMs: number,
): Promise<Buffer> {
  if (args.track === 'arte') {
    const images: RawEditImage[] = ordered.map((r, i) => ({
      buffer: r.buffer,
      mimeType: r.mimeType,
      name: `${i + 1}-${r.role}.${r.mimeType.includes('png') ? 'png' : 'jpg'}`,
    }))
    return runImageEdit({
      images,
      prompt,
      size: args.openaiSize,
      timeoutMs,
      // O serviço sempre define; o fallback usa a MESMA regra para chamador
      // que monte os args por fora (script, teste).
      quality:
        args.qualidade ?? qualidadePadraoPara({ temAjusteDeFoto: Boolean(args.instrucaoImagem?.trim()) }),
    })
  }

  const model = args.modelo === 'nano-banana-pro' ? 'nano-banana-pro' : 'nano-banana-2'
  const result = await generateImageWithGemini({
    model,
    prompt,
    aspectRatio: args.aspectRatio,
    resolution: args.resolution,
    referenceImages: ordered.length > 0 ? ordered.map((r) => r.buffer) : undefined,
    referenceImageTypes: ordered.length > 0 ? ordered.map((r) => r.mimeType) : undefined,
    mode: 'generate',
  })
  return result.imageBuffer
}

/**
 * fieldValues completo da Generation — o REGISTRO ATÔMICO da run
 * {prompt, refs, params, veredito}. Só 2 de 35 runs das skills guardaram o
 * prompt, e foram as únicas que permitiram reconstruir os aprendizados; aqui
 * ele é gravado sempre, no sucesso e na falha.
 */
function buildFieldValues(
  args: ArtGenerationJobArgs,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    source: 'arte-ia',
    track: args.track,
    pedido: args.pedido,
    slotValues: Object.fromEntries(args.copy.map((b, i) => [`bloco${i + 1}`, b])),
    formato: args.formato,
    referencias: args.referencias as unknown as Record<string, unknown>[],
    instrucaoImagem: args.instrucaoImagem,
    ...(args.carrossel
      ? {
          carrossel: {
            groupId: args.carrossel.groupId,
            slideOrder: args.carrossel.slideOrder,
            totalSlides: args.carrossel.totalSlides,
            guideGenerationId: args.carrossel.guideGenerationId ?? null,
          },
        }
      : {}),
    model: args.modelo,
    resolution: args.track === 'imagem' ? args.resolution : null,
    inputSize: args.track === 'arte' ? args.openaiSize : null,
    finalSize: `${args.finalSize.width}x${args.finalSize.height}`,
    quality: args.track === 'arte' ? 'high' : null,
    ...extra,
  }
}

/**
 * Sanitização de entrada: EXIF aplicado + teto de dimensão + teto de bytes.
 * PNG é preservado quando pedido (logo precisa do canal alpha — convertê-lo
 * vira retângulo sólido, erro documentado no padrão de produção).
 */
async function sanitizeInput(
  buffer: Buffer,
  maxDim: number,
  { preservePng = false }: { preservePng?: boolean } = {},
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const meta = await sharp(buffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const tooBig = w > maxDim || h > maxDim || buffer.length > MAX_OPENAI_INPUT_BYTES
    if (!tooBig) {
      const mime = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg'
      return { buffer, mimeType: mime }
    }
    const pipeline = sharp(buffer)
      .rotate() // EXIF antes do resize, senão a foto pode girar
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    if (preservePng && meta.format === 'png') {
      return { buffer: await pipeline.png().toBuffer(), mimeType: 'image/png' }
    }
    return { buffer: await pipeline.jpeg({ quality: 90 }).toBuffer(), mimeType: 'image/jpeg' }
  } catch {
    return { buffer, mimeType: 'image/jpeg' }
  }
}

function sanitizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'arte'
  )
}
