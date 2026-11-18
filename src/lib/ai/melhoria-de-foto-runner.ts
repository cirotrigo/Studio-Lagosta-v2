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
 * é medido por código: a opção que saiu igual à origem (`saiuIgual`).
 * Nenhum crédito é cobrado; cada opção gerada vira uma linha de uso com o
 * custo real.
 */

import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { loadBrandContext } from '@/lib/brand/brand-context'
import { CreativeError } from '@/lib/creatives/errors'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { registrarUsoSemCobranca } from '@/lib/credits/registrar-uso-sem-cobranca'
import { convertPageToDesignData } from '@/lib/posts/page-to-design-data'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { videosDaPagina } from '@/lib/video/camadas-de-video'
import { camadasNoInstante } from '@/lib/video/linha-do-tempo'
import { MENSAGEM_PAGINA_COM_VIDEO } from '@/lib/video/pagina-com-video'
import type { DesignData } from '@/types/template'
import { criarControleDoDiretor, RESERVA_PARA_GERAR_MS, tempoParaGerar, type ControleDoDiretor } from './controle-do-diretor'
import { conferirFidelidadeDaCena } from './creative-qa'
import type { ImprovementJobArgs } from './creative-improvement-runner'
import { planejarMelhoriaDeFoto, problemasDoPromptDeFoto, verRostoEmFoco } from './diretor-de-foto'
import { fetchImageSource } from './fetch-image-source'
import { generateImageWithGemini, idDoModeloGemini, type GeminiImageModel } from './gemini-image-client'
import { pedirNovaTentativa } from './generation-queue'
import {
  avisosDasMedidas,
  CUSTO_POR_OPCAO_USD,
  FONTE_DA_MELHORIA_DE_FOTO,
  saiuIgual,
  type MedidasDaFoto,
  TRILHA_DA_FOTO_MELHORADA,
  type AvisoDaOpcao,
  type OpcaoDeFoto,
  type RegistroDaMelhoriaDeFoto,
} from './melhoria-de-foto-registro'
import { deslocamentoDaFoto } from './preservar-foto'
import {
  acharFotoDaPagina,
  ajustarAoQuadro,
  assuntoNaFotoNova,
  caixaDoAssuntoNoQuadro,
  caixaDoTextoNoQuadro,
  caixasDaMarcaNoQuadro,
  camadasComFotoTrocada,
  diferencaDeTom,
  nitidezDentroEFora,
  proporcaoMaisProxima,
  recortarQuadro,
  retanguloDoQuadro,
  type FotoDaPagina,
} from './quadro-da-foto'
import { conferenciasDasReceitas, montarPromptDeFoto, promptSemDiretor, type CaixaEmFracoes, type ReceitaPedida } from './receitas-de-foto'
import { areaVisivelmenteAlterada, PISO_DE_MUDANCA } from './recompor-por-zona'

/** O gerador da foto. Id conferido na listagem da API em 17/11/2026 (`gerador-da-melhoria.ts`). */
export const MODELO_DA_FOTO: GeminiImageModel = 'nano-banana-2.1'

const ORCAMENTO_MS = 290_000
const RESERVA_PARA_FECHAR_MS = 45_000
/** Lado maior da foto que vai ao gerador: acima disso só pesa o envio (ele devolve 2K). */
const LADO_MAXIMO_DE_ENVIO = 2048
/** Largura em que a mudança visível é medida: o recorte de uma foto de acervo pode ter 4000 px. */
const LARGURA_DA_MEDIDA = 1080

export { PISO_DE_TOM } from './melhoria-de-foto-registro'

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

/** O que se sabe antes de gerar: a página, a foto no quadro e o prompt. */
export interface PreparoDaFoto {
  pagina: PaginaDaPrevia & { layers: unknown }
  foto: FotoDaPagina
  /** A foto limpa no enquadramento da peça, no tamanho do arquivo. */
  quadro: { buffer: Buffer; width: number; height: number }
  /** O mesmo quadro, no tamanho que vai ao gerador. */
  paraOGerador: Buffer
  proporcao: string
  /** O prompt que vai ao gerador, já com o bloco de preservação. */
  prompt: string
  promptDe: RegistroDaMelhoriaDeFoto['promptDe']
  leitura: string | null
  riscos: string[]
  rostoEmFoco: boolean | null
  /** Já há pessoa ou mão na foto de origem. Null quando ninguém olhou (prompt pronto, diretor fora do ar). */
  genteNaFoto: boolean | null
  /**
   * A caixa do assunto no quadro: a marcada à mão (`marcar-assunto`) quando há,
   * senão a que o diretor de foto viu. Null no prompt pronto do chat. É com ela
   * que se mede se o assunto mudou de tamanho ou de lugar e se o fundo desfocou.
   */
  assunto: CaixaEmFracoes | null
  /** Quem escreveu o prompt, para o registro da run. */
  infoDoPrompt: Record<string, unknown>
  /**
   * A página foi editada depois da arte de origem: o "antes" honesto é a página
   * como está HOJE, renderizada aqui (PNG). Null quando a arte de origem ainda
   * é o retrato da página.
   */
  antes: Buffer | null
}

export const AVISO_DE_PAGINA_EDITADA =
  'A página foi editada depois desta arte: o antes e o depois mostram a página como ela está hoje (texto, recorte e elementos atuais), não a arte de origem.'

/**
 * Passos 1, 2 e o prompt (seção 6 do plano): acha a página e a foto limpa,
 * recorta o quadro que a arte mostra e decide o prompt. Só lê.
 *
 * QUEM ESCREVE O PROMPT. Com prompt pronto (o chat olhou a arte e escreveu), o
 * Studio não reescreve. Sem ele, o diretor de foto olha a foto e a arte; se
 * ele não responder, os trechos das receitas seguram. Nos três casos o bloco
 * de preservação entra por código.
 */
export async function prepararMelhoriaDeFoto(p: {
  projectId: number
  projectName: string
  pageId: string
  /** A arte pronta, para o diretor ver onde o texto mora. */
  arteUrl: string
  originalGenerationId: string | null
  receitas: ReceitaPedida[]
  pedido: string
  promptPronto: string | null
  controle?: ControleDoDiretor
}): Promise<PreparoDaFoto> {
  const pagina = await db.page.findFirst({
    where: { id: p.pageId, Template: { projectId: p.projectId } },
    select: { id: true, name: true, width: true, height: true, background: true, layers: true, audio: true, isTemplate: true },
  })
  if (!pagina) throw new Error('a página desta arte não existe mais neste cliente')
  if (pagina.isTemplate) throw new Error('a página desta arte virou modelo: a foto de um modelo não é trocada por aqui')
  const foto = acharFotoDaPagina(pagina.layers)
  if (!foto) throw new Error('a página desta arte não tem mais foto')

  const [arquivo, arte, marca, origem] = await Promise.all([
    fetchImageSource(foto.url),
    fetchImageSource(p.arteUrl).then((r) => r.buffer).catch(() => null),
    loadBrandContext(p.projectId).catch(() => null),
    p.originalGenerationId ? db.generation.findUnique({ where: { id: p.originalGenerationId }, select: { fieldValues: true } }).catch(() => null) : null,
  ])

  const quadro = await recortarQuadro(arquivo.buffer, foto)
  const meta = await sharp(arquivo.buffer).metadata()
  const natural = { width: meta.width ?? quadro.width, height: meta.height ?? quadro.height }
  const proporcao = proporcaoMaisProxima(quadro.width, quadro.height)
  const paraOGerador = await sharp(quadro.buffer)
    .resize(LADO_MAXIMO_DE_ENVIO, LADO_MAXIMO_DE_ENVIO, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer()

  /**
   * A arte de origem ainda é o retrato da página? Medido na bancada de
   * 17/11/2026: em 2 de 4 artes a página tinha sido editada depois (outro
   * texto numa, outro recorte da foto na outra), e a prévia, que é a página de
   * hoje com a foto trocada, parecia ter mexido no que a IA nem viu.
   */
  const fvDaOrigem = (origem?.fieldValues ?? {}) as Record<string, unknown>
  const versaoDaArte = typeof fvDaOrigem.versaoRenderizada === 'string' ? fvDaOrigem.versaoRenderizada : null
  const paginaMudou = !!versaoDaArte && versaoDaArte !== versaoDaPagina(pagina, { audio: pagina.audio })
  const antes = paginaMudou ? await renderizarPrevia(pagina, pagina.layers, p.projectId).catch(() => null) : null

  const caixaDoTexto: CaixaEmFracoes | null = p.receitas.find((r) => r.id === 'abrir-espaco')?.area ?? caixaDoTextoNoQuadro(pagina.layers, foto.camadaId)
  // "Abrir espaço" sem área informada recebe a que as camadas da página dão.
  const receitas = p.receitas.map((r) => (r.id === 'abrir-espaco' && !r.area && caixaDoTexto ? { ...r, area: caixaDoTexto } : r))

  let promptBase: string
  let promptDe: RegistroDaMelhoriaDeFoto['promptDe'] = 'diretor'
  let leitura: string | null = null
  let riscos: string[] = []
  let rostoEmFoco: boolean | null = null
  let genteNaFoto: boolean | null = null
  let assuntoNoQuadro: CaixaEmFracoes | null = null
  const infoDoPrompt: Record<string, unknown> = {}
  if (p.promptPronto?.trim()) {
    promptBase = p.promptPronto.trim()
    promptDe = 'chat'
    rostoEmFoco = await verRostoEmFoco(paraOGerador)
    // Aviso, nunca veto: quem escreveu o prompt é quem decide.
    riscos = problemasDoPromptDeFoto(promptBase)
      .filter((problema) => /contraste/.test(problema))
      .map((problema) => `O prompt enviado ${problema.replace(/^o prompt /, '')}.`)
    infoDoPrompt.planejador = 'chat'
  } else {
    const assunto = await assuntoMarcado(p.projectId, typeof fvDaOrigem.driveImageId === 'string' ? fvDaOrigem.driveImageId : null)
    assuntoNoQuadro = assunto ? caixaDoAssuntoNoQuadro(assunto, natural, retanguloDoQuadro(natural, foto)) : null
    const plano = await planejarMelhoriaDeFoto({
      foto: paraOGerador,
      // O diretor vê onde o texto mora HOJE.
      arte: antes ?? arte,
      receitas,
      pedido: p.pedido,
      marca: marca?.projectName ?? p.projectName,
      cozinha: marca?.cuisineType ?? null,
      direcaoDeFoto: marca?.dna.photoDirection ?? null,
      sobreAFoto: { caixaDoAssunto: assuntoNoQuadro },
      caixaDoTexto,
      caixasDaMarca: caixasDaMarcaNoQuadro(pagina.layers, foto.camadaId),
      proporcao,
      controle: p.controle,
    })
    if (plano) {
      promptBase = plano.prompt
      leitura = plano.leitura
      riscos = plano.riscos
      rostoEmFoco = plano.rostoEmFoco
      genteNaFoto = plano.genteNaFoto
      // A caixa marcada por gente vence a que o diretor viu.
      assuntoNoQuadro = assuntoNoQuadro ?? plano.assunto
      Object.assign(infoDoPrompt, { planejador: plano.modelo, planejadorMs: plano.ms, planejadorTentativas: plano.tentativas })
    } else {
      console.warn('[foto.bg] diretor de foto indisponível: o prompt sai dos trechos das receitas')
      promptBase = promptSemDiretor(receitas, p.pedido)
      rostoEmFoco = await verRostoEmFoco(paraOGerador)
      infoDoPrompt.planejador = 'fallback'
    }
  }
  return { pagina, foto, quadro, paraOGerador, proporcao, prompt: montarPromptDeFoto(promptBase, receitas), promptDe, leitura, riscos, rostoEmFoco, genteNaFoto, assunto: assuntoNoQuadro, infoDoPrompt, antes }
}

/** Uma opção como saiu do gerador e das conferências, antes de ser guardada. */
export interface FotoGerada {
  /** A foto nova, no quadro. Null quando descartada ou quando a geração falhou. */
  foto: Buffer | null
  avisos: AvisoDaOpcao[]
  descartada?: string
  areaAlterada?: number
  /** Diferença média de tom para a foto de origem (0 a 255): o tratamento global que não vira zona. */
  tom?: number
  /** Tudo o que foi medido contra a foto de origem. */
  medidas?: MedidasDaFoto
  /** Só na opção descartada por ter saído igual: a foto como veio, para a bancada calibrar o limiar. */
  fotoDescartada?: Buffer
  /** A chamada ao gerador foi paga (mesmo que a opção tenha sido descartada). */
  gerou: boolean
  tokens?: OpcaoDeFoto['tokens']
  segundos: number
}

/**
 * Passos 3 e 4: gera UMA opção no Nano Banana 2.1 (modo edição, 2K) e confere.
 * O único descarte é a opção que saiu igual à origem; o resto é AVISO ao lado
 * da opção, e conferência que falha por código também vira aviso. Nunca lança.
 */
export async function gerarFotoDaOpcao(preparo: PreparoDaFoto, receitas: ReceitaPedida[], timeoutMs: () => number): Promise<FotoGerada> {
  const t0 = Date.now()
  const segundos = () => Math.round((Date.now() - t0) / 1000)
  const { quadro } = preparo
  let tokens: OpcaoDeFoto['tokens']
  let gerou = false
  try {
    const r = await generateImageWithGemini({
      model: MODELO_DA_FOTO,
      prompt: preparo.prompt,
      mode: 'edit',
      baseImage: preparo.paraOGerador,
      baseImageType: 'image/jpeg',
      aspectRatio: preparo.proporcao,
      resolution: '2K',
      timeoutMs: timeoutMs(),
    })
    gerou = true
    tokens = r.usage?.tokensDeEntrada || r.usage?.tokensDeSaida ? { entrada: r.usage.tokensDeEntrada, saida: r.usage.tokensDeSaida } : undefined
    const fotoNova = await ajustarAoQuadro(r.imageBuffer, quadro)

    const tamanhoDaMedida = { width: LARGURA_DA_MEDIDA, height: Math.max(1, Math.round((LARGURA_DA_MEDIDA * quadro.height) / quadro.width)) }
    /**
     * AS MEDIDAS, contra a foto de origem: o que entrou de novo (mapa de
     * zonas), o desvio de tom, a nitidez do assunto e do fundo e, com a caixa
     * do assunto, onde ele foi parar e de que tamanho. Delas saem o único
     * descarte (`saiuIgual`) e avisos (`avisosDasMedidas`). Medida que falha
     * por código fica de fora, nunca derruba a opção.
     */
    const [area, tomBruto, nitidez, ondeFicou] = await Promise.all([
      areaVisivelmenteAlterada(quadro.buffer, fotoNova, tamanhoDaMedida),
      diferencaDeTom(quadro.buffer, fotoNova),
      nitidezDentroEFora(quadro.buffer, fotoNova, preparo.assunto).catch(() => null),
      preparo.assunto ? assuntoNaFotoNova(quadro.buffer, fotoNova, preparo.assunto).catch(() => null) : null,
    ])
    const areaAlterada = Number(area.toFixed(3))
    const tom = Number(tomBruto.toFixed(1))
    const duas = (n: number) => Number(n.toFixed(2))
    const medidas: MedidasDaFoto = {
      area: areaAlterada,
      tom,
      ...(nitidez ? { nitidezDoAssunto: nitidez.dentro == null ? null : duas(nitidez.dentro), nitidezDoFundo: duas(nitidez.fora) } : {}),
      ...(ondeFicou ? { escalaDoAssunto: ondeFicou.escala, dx: duas(ondeFicou.dx), dy: duas(ondeFicou.dy), correlacao: duas(ondeFicou.correlacao) } : {}),
    }
    if (saiuIgual(medidas, PISO_DE_MUDANCA)) {
      return { foto: null, fotoDescartada: fotoNova, avisos: [], descartada: 'saiu igual à foto de origem (a mudança não entrou)', areaAlterada, tom, medidas, gerou, tokens, segundos: segundos() }
    }

    const conferencias = conferenciasDasReceitas(receitas)
    const avisos: AvisoDaOpcao[] = [
      ...(preparo.rostoEmFoco === true ? [{ tipo: 'rosto' as const, texto: AVISO_DE_ROSTO, destaque: true }] : []),
      ...(preparo.rostoEmFoco === null ? [{ tipo: 'conferencia' as const, texto: 'Não foi possível conferir se a foto tem rosto de pessoa (a visão não respondeu): olhe antes de usar.' }] : []),
      ...(preparo.antes ? [{ tipo: 'conferencia' as const, texto: AVISO_DE_PAGINA_EDITADA }] : []),
      ...(preparo.genteNaFoto && receitas.some((r) => r.id === 'humanizar')
        ? [{ tipo: 'risco' as const, texto: 'A foto já tinha gente ou mão: confira se o gesto novo não disputa com o que já estava lá.' }]
        : []),
      ...preparo.riscos.map((texto) => ({ tipo: 'risco' as const, texto })),
      // Com a caixa do assunto, tamanho e lugar são medidos de verdade; sem ela, vale a conferência por ladrilhos (abaixo).
      ...avisosDasMedidas(receitas.map((r) => r.id), medidas).filter((a) => a.tipo !== 'assunto' || conferencias.includes('assunto-no-lugar')),
    ]
    const [assunto, cena] = await Promise.all([
      conferencias.includes('assunto-no-lugar') && !ondeFicou ? deslocamentoDaFoto(quadro.buffer, fotoNova).catch(() => null) : null,
      conferencias.includes('fidelidade-da-cena') ? conferirFidelidadeDaCena(fotoNova, quadro.buffer) : null,
    ])
    if (assunto?.deslocada) avisos.push({ tipo: 'assunto', texto: `O assunto da foto pode ter saído do lugar (${assunto.deslocados} de ${assunto.ladrilhos} pedaços da foto mudaram de posição): compare o antes e o depois.` })
    if (cena && !cena.pulada && !cena.ok) avisos.push({ tipo: 'cena', texto: `A conferência viu diferença no prato: ${cena.motivo ?? 'confira os ingredientes e a porção'}.` })
    if (cena?.pulada) avisos.push({ tipo: 'conferencia', texto: 'Não foi possível conferir se o prato continua o mesmo (a visão não respondeu): compare o antes e o depois.' })
    return { foto: fotoNova, avisos, areaAlterada, tom, medidas, gerou, tokens, segundos: segundos() }
  } catch (erro) {
    console.warn('[foto.bg] a opção falhou:', mensagemDe(erro))
    return { foto: null, avisos: [], descartada: `não foi gerada: ${mensagemDe(erro).replace(/\s+/g, ' ').slice(0, 240)}`, gerou, tokens, segundos: segundos() }
  }
}

export async function processarMelhoriaDeFoto(args: ImprovementJobArgs & { foto: MelhoriaDeFotoArgs }): Promise<void> {
  const inicio = Date.now()
  const prazoParaGerar = inicio + ORCAMENTO_MS - RESERVA_PARA_FECHAR_MS
  const controle = criarControleDoDiretor(prazoParaGerar - RESERVA_PARA_GERAR_MS)
  const pedido = args.foto.pedido ?? ''
  const receitas = args.foto.receitas
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
    const preparo = await prepararMelhoriaDeFoto({
      projectId: args.projectId,
      projectName: args.projectName,
      pageId: args.foto.pageId,
      arteUrl: args.originalResultUrl,
      originalGenerationId: args.originalGenerationId,
      receitas,
      pedido,
      promptPronto: args.foto.promptPronto,
      controle,
    })
    const { pagina, foto } = preparo

    registro = {
      trilha: TRILHA_DA_FOTO_MELHORADA,
      pageId: pagina.id,
      camadaId: foto.camadaId,
      fotoDeOrigemUrl: foto.url,
      recorteDeOrigem: foto.estilo.crop ?? null,
      quadro: foto.caixa,
      receitas,
      pedido,
      promptDe: preparo.promptDe,
      leitura: preparo.leitura,
      prompt: preparo.prompt,
      riscos: preparo.riscos,
      rostoEmFoco: preparo.rostoEmFoco,
      opcoes: [],
      postId: args.foto.postId,
      aplicada: null,
    }
    if (preparo.antes) {
      // O "antes" da página de hoje vai ao Blob junto das opções: é o par certo da prévia.
      const jpg = await sharp(preparo.antes).jpeg({ quality: 92 }).toBuffer()
      registro.antesUrl = (await put(`${TRILHA_DA_FOTO_MELHORADA}/${args.projectId}/${args.jobGenerationId}-antes.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url
    }

    /** Passos 5 e 6: guarda a foto no Blob (trilha `foto-melhorada`) e monta a prévia sem tocar na página. */
    const gerarOpcao = async (numero: number): Promise<OpcaoDeFoto> => {
      const g = await gerarFotoDaOpcao(preparo, receitas, () => tempoParaGerar(prazoParaGerar))
      const comum = { opcao: numero, avisos: g.avisos, areaAlterada: g.areaAlterada, diferencaDeTom: g.tom, medidas: g.medidas, custoUsd: g.gerou ? CUSTO_POR_OPCAO_USD : 0, tokens: g.tokens }
      if (!g.foto) return { ...comum, fotoUrl: null, previaUrl: null, descartada: g.descartada ?? 'não foi gerada', segundos: g.segundos }
      const t0 = Date.now()
      try {
        const caminho = `${TRILHA_DA_FOTO_MELHORADA}/${args.projectId}/${args.jobGenerationId}`
        const blobDaFoto = await put(`${caminho}-opcao-${numero}.jpg`, g.foto, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })
        const png = await renderizarPrevia(pagina, camadasComFotoTrocada(pagina.layers, foto.camadaId, blobDaFoto.url), args.projectId)
        const previa = await sharp(png).jpeg({ quality: 92 }).toBuffer()
        const blobDaPrevia = await put(`${caminho}-previa-${numero}.jpg`, previa, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })
        return { ...comum, fotoUrl: blobDaFoto.url, previaUrl: blobDaPrevia.url, segundos: g.segundos + Math.round((Date.now() - t0) / 1000) }
      } catch (erro) {
        console.warn(`[foto.bg] opção ${numero}: a foto foi gerada, mas não deu para guardar ou montar a prévia:`, mensagemDe(erro))
        return { ...comum, avisos: [], fotoUrl: null, previaUrl: null, descartada: `não foi possível montar a prévia: ${mensagemDe(erro).replace(/\s+/g, ' ').slice(0, 200)}`, segundos: g.segundos }
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
    const fieldValues = { ...base, ...preparo.infoDoPrompt, diretor: controle.registro, melhoriaDeFoto: registro, elapsedSeconds: Math.round((Date.now() - inicio) / 1000) }
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
