/**
 * O caminho da MELHORIA DE FOTO (17/11/2026,
 * `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`, seção 6).
 *
 * A melhoria de sempre manda a arte chapada (foto + texto + logo) para a IA
 * redesenhar tudo. Aqui a IA edita SÓ a foto limpa da página, no quadro que a
 * peça mostra, e o Studio renderiza texto, logo e elementos por cima. O texto
 * nunca passa pela IA.
 *
 * O que este runner entrega é uma PROPOSTA: leitura, prompt e uma ou duas
 * opções (foto limpa e prévia), gravadas na Generation do job. A página e o
 * post só mudam quando alguém aplica uma opção (`aplicarOpcaoDeFoto`).
 *
 * As conferências AVISAM, nunca vetam (regra de 10/08/2026). O único descarte
 * é medido por código: a opção que saiu igual à origem (`mudancaNaoEntrou`).
 * Nenhum crédito é cobrado; cada opção gerada vira uma linha de uso com o
 * custo real.
 */

import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { loadBrandContext } from '@/lib/brand/brand-context'
import { CreativeError } from '@/lib/creatives/errors'
import { registrarUsoSemCobranca } from '@/lib/credits/registrar-uso-sem-cobranca'
import { convertPageToDesignData } from '@/lib/posts/page-to-design-data'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { videosDaPagina } from '@/lib/video/camadas-de-video'
import { camadasNoInstante } from '@/lib/video/linha-do-tempo'
import { MENSAGEM_PAGINA_COM_VIDEO } from '@/lib/video/pagina-com-video'
import type { DesignData } from '@/types/template'
import { criarControleDoDiretor, RESERVA_PARA_GERAR_MS, tempoParaGerar } from './controle-do-diretor'
import { conferirFidelidadeDaCena } from './creative-qa'
import type { ImprovementJobArgs } from './creative-improvement-runner'
import { planejarMelhoriaDeFoto, problemasDoPromptDeFoto, verRostoEmFoco } from './diretor-de-foto'
import { fetchImageSource } from './fetch-image-source'
import { generateImageWithGemini, idDoModeloGemini, type GeminiImageModel } from './gemini-image-client'
import { pedirNovaTentativa } from './generation-queue'
import {
  CUSTO_POR_OPCAO_USD,
  FONTE_DA_MELHORIA_DE_FOTO,
  TRILHA_DA_FOTO_MELHORADA,
  type AvisoDaOpcao,
  type OpcaoDeFoto,
  type RegistroDaMelhoriaDeFoto,
} from './melhoria-de-foto-registro'
import { deslocamentoDaFoto } from './preservar-foto'
import {
  acharFotoDaPagina,
  ajustarAoQuadro,
  caixaDoAssuntoNoQuadro,
  caixaDoTextoNoQuadro,
  camadasComFotoTrocada,
  proporcaoMaisProxima,
  recortarQuadro,
  retanguloDoQuadro,
} from './quadro-da-foto'
import { conferenciasDasReceitas, montarPromptDeFoto, promptSemDiretor, type CaixaEmFracoes, type ReceitaPedida } from './receitas-de-foto'
import { areaVisivelmenteAlterada, mudancaNaoEntrou } from './recompor-por-zona'

/** O gerador da foto. Id conferido na listagem da API em 17/11/2026 (`gerador-da-melhoria.ts`). */
export const MODELO_DA_FOTO: GeminiImageModel = 'nano-banana-2.1'

const ORCAMENTO_MS = 290_000
const RESERVA_PARA_FECHAR_MS = 45_000
/** Lado maior da foto que vai ao gerador: acima disso só pesa o envio (ele devolve 2K). */
const LADO_MAXIMO_DE_ENVIO = 2048
/** Largura em que a mudança visível é medida: o recorte de uma foto de acervo pode ter 4000 px. */
const LARGURA_DA_MEDIDA = 1080

export const AVISO_DE_ROSTO = 'Esta foto tem rosto: confira se a pessoa continua a mesma.'

export interface MelhoriaDeFotoArgs {
  pageId: string
  receitas: ReceitaPedida[]
  /** O pedido curto de quem pediu. */
  pedido: string
  /** O prompt detalhado escrito pelo chat: o Studio não reescreve, só acrescenta o bloco de preservação. */
  promptPronto: string | null
  opcoes: 1 | 2
  /** O post para o qual a melhoria foi pedida. A troca só acontece ao aplicar. */
  postId: string | null
}

const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro))

interface PaginaDaPrevia {
  id: string
  name: string
  width: number
  height: number
  background: string | null
  audio: unknown
}

/**
 * A página renderizada com outras camadas, EM MEMÓRIA: o mesmo render de
 * `renderPageAndRegister`, sem gravar página, miniatura nem Generation.
 */
export async function renderizarPrevia(pagina: PaginaDaPrevia, layers: unknown, projectId: number): Promise<Buffer> {
  const designData = convertPageToDesignData({ id: pagina.id, name: pagina.name, width: pagina.width, height: pagina.height, layers, background: pagina.background } as never)
  if (videosDaPagina(designData.layers).length > 0) throw new CreativeError('PAGINA_COM_VIDEO', MENSAGEM_PAGINA_COM_VIDEO, 422, { pageId: pagina.id })
  designData.layers = camadasNoInstante(designData.layers, 0, { audio: pagina.audio as DesignData['audio'] })
  await registerProjectFonts(projectId)
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  return new CanvasRenderer(designData.canvas.width, designData.canvas.height).renderDesign(designData, {})
}

/** A caixa do assunto marcada por alguém (`marcar-assunto`), se houver. Leitura só do banco; falha vira "não sei". */
async function assuntoMarcado(projectId: number, driveFileId: string | null): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
  if (!driveFileId) return null
  try {
    const linha = await db.photoAssunto.findFirst({ where: { projectId, driveFileId, revogadoEm: null, decisao: 'caixa' }, select: { caixa: true } })
    const c = linha?.caixa as { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown } | null | undefined
    return c && [c.x0, c.y0, c.x1, c.y1].every((n) => typeof n === 'number') ? (c as { x0: number; y0: number; x1: number; y1: number }) : null
  } catch {
    return null
  }
}

export async function processarMelhoriaDeFoto(args: ImprovementJobArgs & { foto: MelhoriaDeFotoArgs }): Promise<void> {
  const inicio = Date.now()
  const prazoParaGerar = inicio + ORCAMENTO_MS - RESERVA_PARA_FECHAR_MS
  const controle = criarControleDoDiretor(prazoParaGerar - RESERVA_PARA_GERAR_MS)
  const pedido = args.foto.pedido ?? ''
  const base: Record<string, unknown> = {
    source: FONTE_DA_MELHORIA_DE_FOTO,
    alvo: 'foto',
    originalGenerationId: args.originalGenerationId,
    userRequest: pedido,
    model: idDoModeloGemini(MODELO_DA_FOTO),
    format: args.format,
  }
  /** O que já se sabe, para o ramo de falha gravar as mesmas chaves do ramo feliz. */
  let registro: RegistroDaMelhoriaDeFoto | null = null

  try {
    const pagina = await db.page.findFirst({
      where: { id: args.foto.pageId, Template: { projectId: args.projectId } },
      select: { id: true, name: true, width: true, height: true, background: true, layers: true, audio: true, isTemplate: true },
    })
    if (!pagina) throw new Error('a página desta arte não existe mais neste cliente')
    if (pagina.isTemplate) throw new Error('a página desta arte virou modelo: a foto de um modelo não é trocada por aqui')
    const foto = acharFotoDaPagina(pagina.layers)
    if (!foto) throw new Error('a página desta arte não tem mais foto')

    const [arquivo, arte, marca, origem] = await Promise.all([
      fetchImageSource(foto.url),
      fetchImageSource(args.originalResultUrl).then((r) => r.buffer).catch(() => null),
      loadBrandContext(args.projectId).catch(() => null),
      db.generation.findUnique({ where: { id: args.originalGenerationId }, select: { fieldValues: true } }).catch(() => null),
    ])

    const quadro = await recortarQuadro(arquivo.buffer, foto)
    const meta = await sharp(arquivo.buffer).metadata()
    const natural = { width: meta.width ?? quadro.width, height: meta.height ?? quadro.height }
    const proporcao = proporcaoMaisProxima(quadro.width, quadro.height)
    const paraOGerador = await sharp(quadro.buffer)
      .resize(LADO_MAXIMO_DE_ENVIO, LADO_MAXIMO_DE_ENVIO, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer()

    const receitas = args.foto.receitas
    const caixaDoTexto: CaixaEmFracoes | null = receitas.find((r) => r.id === 'abrir-espaco')?.area ?? caixaDoTextoNoQuadro(pagina.layers, foto.camadaId)
    // "Abrir espaço" sem área informada recebe a que as camadas da página dão.
    const receitasParaOPrompt = receitas.map((r) => (r.id === 'abrir-espaco' && !r.area && caixaDoTexto ? { ...r, area: caixaDoTexto } : r))

    /**
     * QUEM ESCREVE O PROMPT. Com prompt pronto (o chat olhou a arte e
     * escreveu), o Studio não reescreve. Sem ele, o diretor de foto olha a
     * foto e a arte; se ele não responder, os trechos das receitas seguram.
     * Nos três casos o bloco de preservação entra por código.
     */
    let promptBase: string
    let promptDe: RegistroDaMelhoriaDeFoto['promptDe'] = 'diretor'
    let leitura: string | null = null
    let riscos: string[] = []
    let rostoEmFoco: boolean | null = null
    const infoDoPrompt: Record<string, unknown> = {}
    if (args.foto.promptPronto?.trim()) {
      promptBase = args.foto.promptPronto.trim()
      promptDe = 'chat'
      rostoEmFoco = await verRostoEmFoco(paraOGerador)
      // Aviso, nunca veto: quem escreveu o prompt é quem decide.
      riscos = problemasDoPromptDeFoto(promptBase)
        .filter((p) => /contraste/.test(p))
        .map((p) => `O prompt enviado ${p.replace(/^o prompt /, '')}.`)
      infoDoPrompt.planejador = 'chat'
    } else {
      const fvDaOrigem = (origem?.fieldValues ?? {}) as Record<string, unknown>
      const assunto = await assuntoMarcado(args.projectId, typeof fvDaOrigem.driveImageId === 'string' ? fvDaOrigem.driveImageId : null)
      const plano = await planejarMelhoriaDeFoto({
        foto: paraOGerador,
        arte,
        receitas: receitasParaOPrompt,
        pedido,
        marca: marca?.projectName ?? args.projectName,
        cozinha: marca?.cuisineType ?? null,
        direcaoDeFoto: marca?.dna.photoDirection ?? null,
        sobreAFoto: { caixaDoAssunto: assunto ? caixaDoAssuntoNoQuadro(assunto, natural, retanguloDoQuadro(natural, foto)) : null },
        caixaDoTexto,
        proporcao,
        controle,
      })
      if (plano) {
        promptBase = plano.prompt
        leitura = plano.leitura
        riscos = plano.riscos
        rostoEmFoco = plano.rostoEmFoco
        Object.assign(infoDoPrompt, { planejador: plano.modelo, planejadorMs: plano.ms, planejadorTentativas: plano.tentativas })
      } else {
        console.warn('[foto.bg] diretor de foto indisponível: o prompt sai dos trechos das receitas')
        promptBase = promptSemDiretor(receitasParaOPrompt, pedido)
        rostoEmFoco = await verRostoEmFoco(paraOGerador)
        infoDoPrompt.planejador = 'fallback'
      }
    }
    const prompt = montarPromptDeFoto(promptBase, receitasParaOPrompt)

    registro = {
      trilha: TRILHA_DA_FOTO_MELHORADA,
      pageId: pagina.id,
      camadaId: foto.camadaId,
      fotoDeOrigemUrl: foto.url,
      recorteDeOrigem: foto.estilo.crop ?? null,
      quadro: foto.caixa,
      receitas,
      pedido,
      promptDe,
      leitura,
      prompt,
      riscos,
      rostoEmFoco,
      opcoes: [],
      postId: args.foto.postId,
      aplicada: null,
    }

    const conferencias = conferenciasDasReceitas(receitas)
    const tamanhoDaMedida = { width: LARGURA_DA_MEDIDA, height: Math.max(1, Math.round((LARGURA_DA_MEDIDA * quadro.height) / quadro.width)) }
    const avisosDaFoto: AvisoDaOpcao[] = [
      ...(rostoEmFoco === true ? [{ tipo: 'rosto' as const, texto: AVISO_DE_ROSTO, destaque: true }] : []),
      ...(rostoEmFoco === null ? [{ tipo: 'conferencia' as const, texto: 'Não foi possível conferir se a foto tem rosto de pessoa (a visão não respondeu): olhe antes de usar.' }] : []),
      ...riscos.map((texto) => ({ tipo: 'risco' as const, texto })),
    ]

    const gerarOpcao = async (numero: number): Promise<OpcaoDeFoto> => {
      const t0 = Date.now()
      const segundos = () => Math.round((Date.now() - t0) / 1000)
      let tokens: OpcaoDeFoto['tokens']
      let gerou = false
      try {
        const r = await generateImageWithGemini({
          model: MODELO_DA_FOTO,
          prompt,
          mode: 'edit',
          baseImage: paraOGerador,
          baseImageType: 'image/jpeg',
          aspectRatio: proporcao,
          resolution: '2K',
          timeoutMs: tempoParaGerar(prazoParaGerar),
        })
        gerou = true
        tokens = r.usage?.tokensDeEntrada || r.usage?.tokensDeSaida ? { entrada: r.usage.tokensDeEntrada, saida: r.usage.tokensDeSaida } : undefined
        const fotoNova = await ajustarAoQuadro(r.imageBuffer, quadro)

        // O ÚNICO descarte: a opção saiu igual à foto de origem.
        const area = await areaVisivelmenteAlterada(quadro.buffer, fotoNova, tamanhoDaMedida)
        if (mudancaNaoEntrou(area)) {
          return { opcao: numero, fotoUrl: null, previaUrl: null, avisos: [], descartada: 'saiu igual à foto de origem (a mudança não entrou)', areaAlterada: Number(area.toFixed(3)), custoUsd: CUSTO_POR_OPCAO_USD, tokens, segundos: segundos() }
        }

        // Daqui para baixo tudo é AVISO ao lado da opção. Conferência que falha por código também vira aviso.
        const avisos: AvisoDaOpcao[] = [...avisosDaFoto]
        const [assunto, cena] = await Promise.all([
          conferencias.includes('assunto-no-lugar') ? deslocamentoDaFoto(quadro.buffer, fotoNova).catch(() => null) : null,
          conferencias.includes('fidelidade-da-cena') ? conferirFidelidadeDaCena(fotoNova, quadro.buffer) : null,
        ])
        if (assunto?.deslocada) avisos.push({ tipo: 'assunto', texto: `O assunto da foto pode ter saído do lugar (${assunto.deslocados} de ${assunto.ladrilhos} pedaços da foto mudaram de posição): compare o antes e o depois.` })
        if (cena && !cena.pulada && !cena.ok) avisos.push({ tipo: 'cena', texto: `A conferência viu diferença no prato: ${cena.motivo ?? 'confira os ingredientes e a porção'}.` })
        if (cena?.pulada) avisos.push({ tipo: 'conferencia', texto: 'Não foi possível conferir se o prato continua o mesmo (a visão não respondeu): compare o antes e o depois.' })

        const caminho = `${TRILHA_DA_FOTO_MELHORADA}/${args.projectId}/${args.jobGenerationId}`
        const blobDaFoto = await put(`${caminho}-opcao-${numero}.jpg`, fotoNova, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })
        // A prévia: a página como ela está, com a foto trocada. Nada é gravado na página.
        const png = await renderizarPrevia(pagina, camadasComFotoTrocada(pagina.layers, foto.camadaId, blobDaFoto.url), args.projectId)
        const previa = await sharp(png).jpeg({ quality: 92 }).toBuffer()
        const blobDaPrevia = await put(`${caminho}-previa-${numero}.jpg`, previa, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })
        return { opcao: numero, fotoUrl: blobDaFoto.url, previaUrl: blobDaPrevia.url, avisos, areaAlterada: Number(area.toFixed(3)), custoUsd: CUSTO_POR_OPCAO_USD, tokens, segundos: segundos() }
      } catch (erro) {
        console.warn(`[foto.bg] opção ${numero} falhou:`, mensagemDe(erro))
        return { opcao: numero, fotoUrl: null, previaUrl: null, avisos: [], descartada: `não foi gerada: ${mensagemDe(erro).replace(/\s+/g, ' ').slice(0, 240)}`, custoUsd: gerou ? CUSTO_POR_OPCAO_USD : 0, tokens, segundos: segundos() }
      }
    }

    // Uma por padrão; duas em paralelo quando a pessoa pede.
    registro.opcoes = await Promise.all(Array.from({ length: args.foto.opcoes }, (_, i) => gerarOpcao(i + 1)))

    // Uma linha de uso por opção GERADA (a descartada por ter saído igual também foi paga), sem cobrar crédito.
    await Promise.all(
      registro.opcoes
        .filter((o) => o.custoUsd > 0)
        .map((o) =>
          registrarUsoSemCobranca({
            clerkUserId: args.userId,
            feature: 'ai_creative_improvement',
            details: {
              alvo: 'foto',
              trilha: TRILHA_DA_FOTO_MELHORADA,
              newGenerationId: args.jobGenerationId,
              originalGenerationId: args.originalGenerationId,
              projectId: args.projectId,
              opcao: o.opcao,
              model: idDoModeloGemini(MODELO_DA_FOTO),
              custoUsd: o.custoUsd,
              tokens: o.tokens ?? null,
              receitas: receitas.map((r) => r.id),
              ...(o.descartada ? { descartada: true } : {}),
            },
          }),
        ),
    )

    const validas = registro.opcoes.filter((o) => o.fotoUrl && o.previaUrl)
    const fieldValues = { ...base, ...infoDoPrompt, diretor: controle.registro, melhoriaDeFoto: registro, elapsedSeconds: Math.round((Date.now() - inicio) / 1000) }
    if (validas.length === 0) {
      const naoEntrou = registro.opcoes.some((o) => o.areaAlterada !== undefined)
      const motivo = naoEntrou
        ? 'a mudança pedida não entrou: a foto voltou igual à de origem. Nenhum crédito foi cobrado.'
        : `a foto não foi gerada: ${registro.opcoes[0]?.descartada ?? 'erro desconhecido'}`
      // Vale outra tentativa pela fila; sem tentativa sobrando, termina dizendo o que houve.
      if (args.queueJobId && (await pedirNovaTentativa(args.queueJobId, motivo))) return
      await db.generation.update({
        where: { id: args.jobGenerationId },
        data: { status: 'FAILED', completedAt: new Date(), fieldValues: { ...fieldValues, error: motivo, ...(naoEntrou ? { mudancaNaoEntrou: true } : {}), failedAt: new Date().toISOString() } as never },
      })
      return
    }

    await db.generation.update({
      where: { id: args.jobGenerationId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        // A prévia da primeira opção válida: é o que a galeria e o conferir-arte mostram da proposta.
        resultUrl: validas[0].previaUrl,
        fileName: `${pagina.name} (opção de foto).jpg`,
        fieldValues: fieldValues as never,
      },
    })
    console.log(`[foto.bg] ${validas.length} de ${registro.opcoes.length} opção(ões) em ${Math.round((Date.now() - inicio) / 1000)}s (${args.jobGenerationId})`)
  } catch (erro) {
    const motivo = mensagemDe(erro)
    console.error('[foto.bg] falhou:', motivo)
    await db.generation
      .update({
        where: { id: args.jobGenerationId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          fieldValues: { ...base, diretor: controle.registro, ...(registro ? { melhoriaDeFoto: registro } : {}), error: motivo, failedAt: new Date().toISOString() } as never,
        },
      })
      .catch((falha) => console.error('[foto.bg] não consegui marcar a Generation como FAILED:', falha))
  }
}
