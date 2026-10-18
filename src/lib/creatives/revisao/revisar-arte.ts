/**
 * O REVISOR DA ARTE — serviço (11/09/2026).
 *
 * Revisa uma página do EDITOR como ela está hoje, sem recompor (recompor
 * mudaria justamente o objeto revisado e apagaria ajuste feito à mão) e sem
 * gravar nada. Mede, olha e decide:
 *
 *  1. as camadas atuais, com as fontes do projeto registradas (medir com a
 *     fonte de reserva dá quebra e altura erradas);
 *  2. a geometria dos glifos (`checkTextGeometry`), com rich text medido como
 *     texto simples do mesmo corpo — a mesma aproximação do compositor;
 *  3. a régua de contraste COM correção, em memória: a força corrigida vira o
 *     ajuste proposto, e a medida de antes diz se havia problema;
 *  4. a referência de corpo e entrelinha: a variante da assinatura com que a
 *     peça foi composta, ou a página-modelo de onde a arte saiu;
 *  5. o assunto da foto: o que o compositor gravou, quando a foto e o corte
 *     são os mesmos; senão, estimado pela textura;
 *  6. a visão (gpt-5.2) sobre a peça renderizada, com as marcas e os recortes;
 *  7. `avaliarPeca` junta tudo em achados e ajustes.
 *
 * Qualquer etapa de medida que falhe vira cobertura "não avaliada", nunca
 * derruba a revisão — e a revisão nunca bloqueia a agenda.
 */

import type { Layer } from '@/types/template'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getPublicAppUrl } from '@/lib/creatives/persist'
import { lerCamadas } from '@/lib/posts/page-layers'
import { convertPageToDesignData } from '@/lib/posts/page-to-design-data'
import { fetchBuffer, registerProjectFonts, type OpcoesDoDownload } from '@/lib/posts/register-project-fonts'
import { fontesPadraoIncompletas } from '@/lib/fontes-padrao-estado'
import type { Prisma } from '../../../../prisma/generated/client'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { checkTextGeometry } from '@/lib/creatives/text-geometry'
import { medirContrasteDaPeca, type ContrasteMedido, type PioraDeTratamento } from '@/lib/compositor/regua'
import { GRADIENTE_PADRAO } from '@/lib/compositor/gradiente-de-leitura'
import { formatoDaPagina } from '@/lib/compositor/assinatura'
import { papelDoNome } from '@/lib/compositor/papel-do-nome'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { lerFotoComoCover } from '@/lib/creatives/halo/halo-medicao'
import { estimarAssunto, mapaDeCalma } from '@/lib/compositor/mapa-de-calma'
import type { Rect } from '@/lib/creatives/halo/halo'
import type { RelatorioDaRevisao } from './contrato'
import { avaliarPeca, ehTextoVisivel, entrelinhaDaCamada, fotoDeFundo, logosDaPeca, type EntradaDaRevisao, type ReferenciaDeCamada } from './regras'
import { medirLogosDaPeca } from '@/lib/compositor/legibilidade-da-logo'
import {
  MODELO_DA_VISAO,
  marcasDaPeca,
  pedirOlharDaVisao,
  insumosDaVisao,
  reconciliarVisao,
  textoDeContexto,
  type AchadoVisto,
  type MarcaDaPeca,
} from './visao'
import { identidadeDaPagina, versaoDaPagina } from './versao'
import type { GateDaArte, PoliticaDoAssunto } from './gate'
import { decidirEMontarRegistro } from './gate-registro'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import { alvoDaRecomposicao } from '@/lib/compositor/recompor'
import { POLITICA_DO_ASSUNTO_DO_GATE, TIPO_DO_POST_POR_FORMATO } from '@/lib/lotes/agendamento'

/**
 * CP5e § 1 — a frase fixa de todo bloco `gate` do `revisar-arte`: é INFORMAÇÃO sobre a página como estava na leitura,
 * nunca autorização nem registro (o `ver-geracao` mostra REGISTRO, o passado; aqui é medida de agora, sem gravar).
 */
export const INFORMACAO_DO_GATE_DO_REVISOR =
  'informação do gate sobre a página como estava nesta leitura (pageVersion): não autoriza, não grava e não vale para a agenda — o veredito que vale é o medido na hora, sob trava, por agendar-leva/ajustar-arte; esta leitura pode envelhecer'

/** CP5e § 1.2 — o bloco `gate` de `revisar-arte`. */
export type GateInformativo =
  | {
      tipo: 'medida'
      resultado: GateDaArte['resultado']
      rulesVersion: string
      versaoDoGate: GateDaArte['versao']
      medidoEm: string
      motivos: GateDaArte['motivos']
      naoMedidos: GateDaArte['naoMedidos']
      pageVersion: string | null
      copyVersion: string
      politicaDoAssunto: PoliticaDoAssunto
      vinculo: { generationId: string; postType: 'STORY' | 'POST' }
      informacao: string
    }
  | { tipo: 'sem-vinculo'; motivo: string; informacao: string }
  | { tipo: 'nao-medida'; motivo: string; informacao: string }

export interface RevisarArteInput {
  projectId: number
  pageId?: string | null
  /** Alternativa ao pageId: a página é achada por `fieldValues.pageId` da arte. */
  generationId?: string | null
  /** Olhar da visão (default true). */
  visao?: boolean
  /** Miniatura com as marcas na resposta (default true). */
  previa?: boolean
}

export interface EstadoDaVisao {
  estado: 'feita' | 'desligada' | 'falhou'
  modelo?: string
  ms?: number
  descartados?: number
  /** Achados válidos que ficaram além do teto da reconciliação (REV-127-INTEGRAL-02). */
  truncados?: number
  motivo?: string
}

export interface RevisaoDaArte {
  projectId: number
  pageId: string
  pagina: string
  editUrl: string
  formato: 'story' | 'feed' | 'quadrado' | null
  /** Vai de volta em `ajustar-arte` como `versaoEsperada`. */
  versao: string | null
  /** Página-modelo pode ser revisada, mas não ajustada por `ajustar-arte`. */
  aplicavel: boolean
  motivo?: string
  referencia: string | null
  relatorio: RelatorioDaRevisao
  visao: EstadoDaVisao
  previa: Buffer | null
  /** CP5e § 1: o veredito que o gate daria à página como está — informação, nunca autorização nem registro. */
  gate: GateInformativo
  ms: number
}

const GENERICAS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])

function primeiraFamilia(valor: unknown): string | null {
  const primeira = String(valor ?? '')
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
  return primeira && !GENERICAS.has(primeira.toLowerCase()) ? primeira : null
}

function pesoCss(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  const s = String(valor ?? '').trim().toLowerCase()
  if (!s || s === 'normal') return 400
  if (s === 'bold') return 700
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function numero(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao
}

/**
 * Família (ou peso) pedida por um texto que o render não tem: ele desenha outra no lugar. Com as fontes padrão
 * incompletas (`fontes-padrao-estado`), nenhuma família conta como presente: o gate não aprova a medida.
 * Exportado para a regressão (`fontes-padrao-consumidores.test.ts`).
 */
export async function fontesQueFaltam(camadas: Layer[]) {
  const { GlobalFonts } = await import('@napi-rs/canvas')
  const incompletas = fontesPadraoIncompletas()
  const pesos = new Map<string, number[]>()
  for (const f of GlobalFonts.families) {
    const chave = f.family.toLowerCase()
    pesos.set(chave, [...(pesos.get(chave) ?? []), ...f.styles.map((s) => s.weight)])
  }
  const faltas = new Map<string, { familia: string; peso: number | null; camadas: string[] }>()
  for (const l of camadas) {
    if (!ehTextoVisivel(l)) continue
    const pesoBase = pesoCss(l.style?.fontWeight)
    const pedidas = [
      { familia: l.style?.fontFamily, peso: pesoBase },
      ...(l.richTextStyles ?? []).map((s) => ({
        familia: s.fontFamily ?? l.style?.fontFamily,
        peso: /bold/.test(String(s.fontStyle ?? '')) ? 700 : pesoBase,
      })),
    ]
    for (const p of pedidas) {
      // Família genérica (ou ausente) desenha no fallback padrão: com ele incompleto, ela também falta.
      const familia = primeiraFamilia(p.familia) ?? (incompletas ? 'sans-serif' : null)
      if (!familia) continue
      const lista = pesos.get(familia.toLowerCase())
      // Só a família AUSENTE conta. A carteira cadastra cada peso como família
      // própria ("Lato Bold", "Didot HTF B06 Bold") e o render usa o estilo do
      // arquivo que existe: medido em 11/09/2026, conferir o peso pedido contra
      // o do arquivo acusou 45 falsos alarmes em 30 peças reais.
      if (!incompletas && ((lista && lista.length > 0) || GlobalFonts.has(familia))) continue
      const peso: number | null = null
      const chave = `${familia}|${peso}`
      const falta = faltas.get(chave) ?? { familia, peso, camadas: [] }
      if (!falta.camadas.includes(l.id)) falta.camadas.push(l.id)
      faltas.set(chave, falta)
    }
  }
  return [...faltas.values()]
}

type GeracaoDaPagina = { id: string; fieldValues: unknown; sourcePageId: string | null }

/**
 * O corpo e a entrelinha de referência de cada texto da página: a variante da
 * assinatura com que a peça foi composta (casada por PAPEL) ou a página-modelo
 * de onde a arte de modelo saiu (casada por id de camada). Peça composta com
 * arranjo de combinação fica sem referência: o estilo veio da combinação, e
 * comparar com a página de assinatura acusaria o que é desenho.
 */
async function referenciasDaPagina(
  camadas: Layer[],
  composicao: Record<string, any> | null,
  geracoes: GeracaoDaPagina[],
  /** CP4.2a: os títulos fixados pelo executor — casam por papel mesmo OCULTOS na página anterior (a referência é do modelo). */
  titulosFixados: ReadonlySet<string> = new Set(),
  /** CP5c: por onde as páginas de referência são lidas (o `db`, ou a transação do gate, que as travou `FOR SHARE`). */
  cliente: ClienteDaMedicao = db,
): Promise<{ referencias: Record<string, ReferenciaDeCamada>; origem: string | null }> {
  const referencias: Record<string, ReferenciaDeCamada> = {}
  // CP4.2a: o fallback 16 de uma camada do modelo sem `fontSize` numérico é dito (`inferida`): para títulos vale como
  // referência ausente, nunca como piso.
  const doTexto = (c: Layer, largura: number): Omit<ReferenciaDeCamada, 'origem'> => ({
    fontSize1080: (typeof c.style?.fontSize === 'number' ? c.style.fontSize : 16) / (largura / 1080),
    entrelinha: entrelinhaDaCamada(c),
    ...(typeof c.style?.fontSize === 'number' ? {} : { inferida: true as const }),
  })

  const assinaturaId = composicao?.assinatura?.pageId
  const arranjoDeCombinacao = Array.isArray(composicao?.arranjos) && composicao!.arranjos.some((a: any) => a?.origem === 'combinacao')
  if (typeof assinaturaId === 'string' && !arranjoDeCombinacao) {
    const pagina = await cliente.page.findUnique({ where: { id: assinaturaId }, select: { name: true, width: true, layers: true } })
    if (pagina) {
      // Papel repetido (endereço e horário, os dois `servico`) casa pela ORDEM de
      // cima para baixo; contagens diferentes não casam. Usar o maior corpo para
      // todos "aumentava" o endereço composto certo em 24px.
      const daAssinatura = new Map<string, Array<{ y: number; fontSize1080: number; entrelinha: number | null; inferida?: true }>>()
      for (const c of lerCamadas(pagina.layers).camadas as unknown as Layer[]) {
        if (!ehTextoVisivel(c)) continue
        const papel = papelDaCamada(c) ?? papelDoNome(c.name) ?? papelDoNome(c.id)
        if (!papel) continue
        daAssinatura.set(papel, [...(daAssinatura.get(papel) ?? []), { y: c.position?.y ?? 0, ...doTexto(c, pagina.width) }])
      }
      const daPeca = new Map<string, Layer[]>()
      for (const c of camadas) {
        const papel = ehTextoVisivel(c) || (titulosFixados.has(c.id) && (c.type === 'text' || c.type === 'rich-text')) ? papelDaCamada(c) : null
        if (papel) daPeca.set(papel, [...(daPeca.get(papel) ?? []), c])
      }
      const origem = `assinatura "${pagina.name}"`
      for (const [papel, textos] of daPeca) {
        const modelo = [...(daAssinatura.get(papel) ?? [])].sort((a, b) => a.y - b.y)
        if (modelo.length === 0) continue
        const ordenados = [...textos].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
        if (modelo.length !== 1 && modelo.length !== ordenados.length) continue
        ordenados.forEach((c, i) => {
          const ref = modelo.length === 1 ? modelo[0] : modelo[i]
          referencias[c.id] = { fontSize1080: ref.fontSize1080, entrelinha: ref.entrelinha, origem, ...(ref.inferida ? { inferida: true as const } : {}) }
        })
      }
      return { referencias, origem }
    }
  }

  const modeloId = geracoes.find((g) => g.sourcePageId)?.sourcePageId
  if (modeloId) {
    const modelo = await cliente.page.findUnique({ where: { id: modeloId }, select: { name: true, width: true, layers: true } })
    if (modelo) {
      const porId = new Map((lerCamadas(modelo.layers).camadas as unknown as Layer[]).map((c) => [c.id, c]))
      const origem = `modelo "${modelo.name}"`
      for (const c of camadas) {
        const doModelo = porId.get(c.id)
        if (doModelo && (ehTextoVisivel(c) || titulosFixados.has(c.id)) && ehTextoVisivel(doModelo)) referencias[c.id] = { ...doTexto(doModelo, modelo.width), origem }
      }
      return { referencias, origem }
    }
  }
  return { referencias, origem: null }
}

/** O assunto da foto e, quando não há, POR QUÊ — "não há assunto" (fato medido) é diferente de "não deu para medir". */
interface AssuntoDaPeca {
  assunto: { rect: Rect; origem: 'catalogo' | 'estimado' } | null
  /** Por que não há assunto (sem foto, foto lida sem região forte, ou a estimativa falhou). */
  motivoSemAssunto?: string
  /** A foto foi examinada (ou não existe) e não há assunto a proteger: a regra não se aplica, e o não-piorar (CP4) não recusa por ela. */
  assuntoNaoSeAplica?: true
}

/**
 * O assunto da foto: o gravado pelo compositor (mesma foto, mesmo corte) ou o estimado pela textura.
 * CP4.1: a peça cuja foto NÃO tem assunto localizável (o compositor gravou `assuntoOrigem: 'nenhum'`, ou o mapa de
 * calma não achou região forte) voltava "não medida" e NENHUM ajuste entrava nela (`AJUSTE_NAO_MEDIDO` em toda chamada,
 * provado pela prova de integração no passo 6). Agora isso é dito como regra inaplicável; só a estimativa que FALHOU
 * (foto não baixou, sharp não leu) continua não medida.
 */
async function assuntoDaPeca(
  camadas: Layer[],
  canvas: { width: number; height: number },
  formato: RevisaoDaArte['formato'],
  fieldValues: Record<string, any> | null,
  /** CP5c: sinal e teto do download da foto (o gate mede sob trava, com prazo). */
  download: OpcoesDoDownload = {},
): Promise<AssuntoDaPeca> {
  const fundo = fotoDeFundo(camadas, canvas)
  if (!fundo?.fileUrl) return { assunto: null, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger', assuntoNaoSeAplica: true }
  const composicao = fieldValues?.composicao
  const corte = fundo.style?.cropPosition ?? null
  const mesmaComposicao =
    // O retângulo gravado é da peça COMPOSTA: outro formato é outro cover.
    composicao?.formato === formato && fieldValues?.imageUrl === fundo.fileUrl && (composicao.posicao?.crop ?? null) === corte
  if (mesmaComposicao && composicao.assunto && composicao.assuntoOrigem && composicao.assuntoOrigem !== 'nenhum') {
    return { assunto: { rect: composicao.assunto as Rect, origem: composicao.assuntoOrigem === 'catalogo' ? 'catalogo' : 'estimado' } }
  }
  if (mesmaComposicao && composicao.assuntoOrigem === 'nenhum') {
    return { assunto: null, motivoSemAssunto: 'a foto não tem assunto localizável (o compositor leu esta foto neste corte e não achou região forte): nada a proteger', assuntoNaoSeAplica: true }
  }
  try {
    const bytes = await fetchBuffer(fundo.fileUrl, download)
    const foto = await lerFotoComoCover(bytes, canvas, corte ? { cropPosition: corte } : {})
    const rect = estimarAssunto(mapaDeCalma(foto))
    return rect
      ? { assunto: { rect, origem: 'estimado' } }
      : { assunto: null, motivoSemAssunto: 'a foto foi lida e não tem assunto localizável (mapa de calma sem região forte): nada a proteger', assuntoNaoSeAplica: true }
  } catch (erro) {
    const motivo = `o assunto da foto não foi estimado: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 160)}`
    console.warn('[revisar-arte]', motivo)
    return { assunto: null, motivoSemAssunto: motivo }
  }
}

/** A peça com um retângulo e um rótulo por marca — é por eles que a visão aponta. */
async function desenharMarcas(
  png: Buffer,
  marcas: MarcaDaPeca[],
  canvas: { width: number; height: number },
  familia: string | null,
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const imagem = await loadImage(png)
  const tela = createCanvas(canvas.width, canvas.height)
  const ctx = tela.getContext('2d')
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height)
  const s = canvas.width / 1080
  for (const m of marcas) {
    const cor = m.tipo === 'logo' ? '#00B8D4' : '#FF2D95'
    ctx.lineWidth = Math.max(3, 4 * s)
    ctx.strokeStyle = cor
    ctx.strokeRect(m.rect.x - 6, m.rect.y - 6, m.rect.width + 12, m.rect.height + 12)
    const alturaDoRotulo = Math.round(40 * s)
    // O rótulo usa uma fonte do PROJETO: na Vercel não há fonte de sistema, e
    // um rótulo invisível deixaria a visão sem como apontar.
    ctx.font = `700 ${Math.round(30 * s)}px ${familia ? `"${familia}"` : 'sans-serif'}`
    const largura = ctx.measureText(m.marca).width + 20 * s
    const x = Math.max(0, Math.min(canvas.width - largura, m.rect.x - 6))
    const acima = m.rect.y - 6 - alturaDoRotulo
    const y = acima >= 0 ? acima : Math.min(canvas.height - alturaDoRotulo, m.rect.y + m.rect.height + 6)
    ctx.fillStyle = cor
    ctx.fillRect(x, y, largura, alturaDoRotulo)
    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    ctx.fillText(m.marca, x + 10 * s, y + alturaDoRotulo / 2)
  }
  return tela.encode('jpeg', 85)
}

/** Recortes dos maiores blocos em resolução real: é onde a cedilha cortada e o acento aparecem. */
async function recortesDosBlocos(
  png: Buffer,
  marcas: MarcaDaPeca[],
  canvas: { width: number; height: number },
): Promise<Array<{ marca: string; imagem: Buffer }>> {
  const sharp = (await import('sharp')).default
  const escolhidas = marcas
    .filter((m) => m.tipo === 'texto')
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, 5)
    .sort((a, b) => Number(a.marca.slice(1)) - Number(b.marca.slice(1)))
  const saida: Array<{ marca: string; imagem: Buffer }> = []
  for (const m of escolhidas) {
    const folga = 40
    const left = Math.max(0, Math.floor(m.rect.x - folga))
    const top = Math.max(0, Math.floor(m.rect.y - folga))
    const width = Math.min(canvas.width - left, Math.ceil(m.rect.width + folga * 2))
    const height = Math.min(canvas.height - top, Math.ceil(m.rect.height + folga * 2))
    if (width < 20 || height < 20) continue
    saida.push({ marca: m.marca, imagem: await sharp(png).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer() })
  }
  return saida
}


/** O que a medida de uma peça precisa da PÁGINA e do banco — calculado uma vez; vale para todos os estados das camadas. */
export interface ContextoDaMedicao {
  projectId: number
  canvas: { width: number; height: number }
  formato: RevisaoDaArte['formato']
  /** O fundo do render de publicação (o mesmo conversor). */
  background: string
  faixa: [number, number]
  referencias: Record<string, ReferenciaDeCamada>
  referencia: string | null
  /** CP4.2a: os títulos fixados pelo executor (da página anterior à chamada); ausente no revisar-arte solto. */
  titulosFixados?: string[]
  assunto: { rect: Rect; origem: 'catalogo' | 'estimado' } | null
  /** Por que não há assunto, e se isso é "regra inaplicável" (foto lida sem assunto) ou "não medido" (a estimativa falhou). */
  motivoSemAssunto?: string
  assuntoNaoSeAplica?: true
  /** A origem gravada da variante da logo desenhada (CP3), url → origem. */
  origensDaLogo: ReadonlyMap<string, 'pagina' | 'projeto'>
  /** Bytes da logo por URL, um download por chamada (o executor do CP4 mede N vezes com este mesmo contexto). */
  cacheDeLogos: Map<string, Promise<Buffer>>
  /** As fontes do projeto já foram registradas neste contexto (uma vez por chamada, não por medida). */
  fontesRegistradas?: boolean
  /** CP5c: por onde `registerProjectFonts` lê `CustomFont` (padrão `db`) e o sinal/teto dos downloads que aceitam cancelamento. */
  cliente?: ClienteDaMedicao
  sinal?: AbortSignal
  prazoPorDownloadMs?: number
}

/** CP5c: o que a medição lê do banco — o `db` de sempre ou a transação do gate (que travou essas linhas). */
export type ClienteDaMedicao = Pick<Prisma.TransactionClient, 'project' | 'generation' | 'page' | 'customFont'>

/**
 * Lê do banco o que a medição precisa (a faixa do gradiente do projeto, as gerações da página, as referências de
 * corpo/entrelinha, o assunto da foto). As REFERÊNCIAS e a classificação dos títulos saem de `camadasDaPagina`
 * (a página ANTERIOR à chamada, CP4.2a); o ASSUNTO sai de `camadas` — as camadas EFETIVAS, depois do bake: trocar
 * a foto e ajustar na mesma chamada mede o ajuste contra o assunto da foto NOVA, e uma foto nova que não pôde ser
 * lida fica "não medida" (fail-closed), nunca herda o "não se aplica" da foto anterior (revisão do owner, 15/10).
 */
export async function contextoDaMedicao(args: {
  projectId: number
  page: { id: string; name: string; width: number; height: number; tags: string[]; background: string | null; layers: unknown }
  camadas: Layer[]
  /**
   * CP4.2a (executor): as camadas da página ANTERIOR à chamada — é delas que saem as referências e a classificação dos
   * títulos, para o `papel` enviado no pedido não trocar a referência nem rebaixar a manchete. Ausente = `camadas`.
   */
  camadasDaPagina?: Layer[]
  titulosFixados?: string[]
  /** CP5c: a transação do gate (as linhas lidas estão travadas); padrão `db`. */
  cliente?: ClienteDaMedicao
  /** CP5c: sinal e teto dos downloads (foto do assunto, fontes). O render da régua e a logo não aceitam sinal — o prazo de fora cobre. */
  sinal?: AbortSignal
  prazoPorDownloadMs?: number
  /**
   * CP5c § 4.3: `false` quando a arte da Generation NÃO é desta versão da página (`versaoRenderizada` ≠
   * `versaoDaPagina`): a `composicao` gravada (assunto, variante da logo) não é reaproveitada; a assinatura e a
   * página-modelo apontadas por ela continuam sendo a referência de corpo e entrelinha. Padrão `true`.
   */
  composicaoReaproveitavel?: boolean
  /**
   * CP5c § 4.3: a Generation DA PEÇA (travada), em vez da varredura das 15 mais recentes da página: a medição
   * do draft-only lê `composicao`, `sourcePageId` e a variante da logo SÓ dela. `null` = sem Generation (mede sem cache).
   */
  generationDaPeca?: GeracaoDaPagina | null
}): Promise<ContextoDaMedicao> {
  const { projectId, page } = args
  const cliente = args.cliente ?? db
  const download: OpcoesDoDownload = { signal: args.sinal, timeoutMs: args.prazoPorDownloadMs }
  const reaproveitar = args.composicaoReaproveitavel !== false
  const camadas = args.camadasDaPagina ?? args.camadas
  const titulosFixados = args.titulosFixados
  const canvas = { width: page.width, height: page.height }
  const formato = formatoDaPagina({ name: page.name, tags: page.tags, width: page.width, height: page.height })
  const designData = convertPageToDesignData({ id: page.id, name: page.name, width: page.width, height: page.height, layers: page.layers, background: page.background })
  const background = designData.canvas.backgroundColor
  const [projeto, geracoes] = await Promise.all([
    cliente.project.findUnique({ where: { id: projectId }, select: { assinatura: true } }),
    args.generationDaPeca !== undefined
      ? Promise.resolve(args.generationDaPeca ? [args.generationDaPeca] : [])
      : cliente.generation.findMany({
          // Sem filtrar pelo template: a página MUDA de pasta quando é agendada
          // (`moverPaginaParaSemana`), e a arte do compositor fica no template antigo.
          where: { projectId, fieldValues: { path: ['pageId'], equals: page.id } },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: { id: true, fieldValues: true, sourcePageId: true },
        }),
  ])
  const gradienteDoProjeto = ((projeto?.assinatura as Record<string, any> | null)?.gradiente ?? {}) as Record<string, unknown>
  const faixa: [number, number] = [
    numero(gradienteDoProjeto.forcaMinima, GRADIENTE_PADRAO.forcaMinima),
    numero(gradienteDoProjeto.forcaMaxima, GRADIENTE_PADRAO.forcaMaxima),
  ]
  // Com a Generation da peça dada (CP5c), ela É a fonte — sem a varredura por `source`.
  const doCompositor = args.generationDaPeca !== undefined ? args.generationDaPeca : geracoes.find((g) => (g.fieldValues as Record<string, unknown> | null)?.source === 'compositor')
  const fieldValues = (doCompositor?.fieldValues ?? null) as Record<string, any> | null
  // O CACHE do compositor (assunto gravado, variante da logo) só vale quando a arte é desta versão da página.
  const cache = reaproveitar ? fieldValues : null
  const varianteGravada = cache?.composicao?.logo?.legibilidade?.variante as { url?: unknown; origem?: unknown } | undefined
  const origensDaLogo = new Map<string, 'pagina' | 'projeto'>()
  if (typeof varianteGravada?.url === 'string' && (varianteGravada.origem === 'pagina' || varianteGravada.origem === 'projeto')) origensDaLogo.set(varianteGravada.url, varianteGravada.origem)
  const { referencias, origem: referencia } = await referenciasDaPagina(camadas, fieldValues?.composicao ?? null, geracoes, new Set(titulosFixados ?? []), cliente)
  const { assunto, motivoSemAssunto, assuntoNaoSeAplica } = await assuntoDaPeca(args.camadas, canvas, formato, cache, download)
  return {
    projectId, canvas, formato, background, faixa, referencias, referencia, assunto,
    ...(titulosFixados ? { titulosFixados } : {}),
    ...(motivoSemAssunto ? { motivoSemAssunto } : {}),
    ...(assuntoNaoSeAplica ? { assuntoNaoSeAplica } : {}),
    origensDaLogo, cacheDeLogos: new Map(),
    ...(args.cliente ? { cliente: args.cliente } : {}),
    ...(args.sinal ? { sinal: args.sinal } : {}),
    ...(args.prazoPorDownloadMs ? { prazoPorDownloadMs: args.prazoPorDownloadMs } : {}),
  }
}

/** A entrada do revisor medida das CAMADAS dadas (sem a visão): fontes, geometria, régua e logo. Nunca lança. */
export type MedidaDaPeca = Omit<EntradaDaRevisao, 'vistos' | 'motivoSemVisao' | 'marcas'>

/**
 * Mede as camadas em memória — a MESMA medição para o revisor (`revisarArte`) e para a não-piora do executor de
 * ajustes (CP4): toda etapa é opcional e a falha vira cobertura "não avaliada" nas regras que dependem dela
 * (métrica ausente nunca é avaliação positiva, R4).
 */
export async function medirCamadasDaPeca(
  camadas: Layer[],
  ctx: ContextoDaMedicao,
  /**
   * `corrigir` (padrão `true`, o revisor): a régua aplica em memória a força de gradiente que PROPORIA e devolve as
   * leituras pós-correção (`tintaCorrigida`, para o ajuste `gradiente`). O executor do CP4 mede com `false`: a
   * não-piora compara a peça COMO VAI SER GRAVADA, não uma hipótese (revisores A e B, 15/10/2026).
   */
  opcoes: { corrigir?: boolean } = {},
): Promise<MedidaDaPeca> {
  const { projectId, canvas, formato, background, faixa } = ctx
  const medidasAproximadas: string[] = []
  let issues: ReturnType<typeof checkTextGeometry>['issues'] = []
  let metricas: ReturnType<typeof checkTextGeometry>['metricas'] = []
  let motivoSemMedida: string | undefined
  let textosSemMetrica: string[] = []
  try {
    if (!ctx.fontesRegistradas) {
      await registerProjectFonts(projectId, { cliente: ctx.cliente, signal: ctx.sinal, timeoutMs: ctx.prazoPorDownloadMs })
      ctx.fontesRegistradas = true
    }
    const medir = await createServerTextBoxMeasurer()
    const paraMedir = camadas.map((l) => {
      if (l.type !== 'rich-text' || l.visible === false) return l
      medidasAproximadas.push(l.id)
      return { ...l, type: 'text', richTextStyles: undefined } as Layer
    })
    ;({ issues, metricas } = checkTextGeometry(paraMedir, canvas, medir))
    // Texto visível com conteúdo que a geometria OMITIU (curvo, fitty,
    // auto-resize — o medidor devolve null sem exceção): não foi examinado, e
    // a cobertura tem de dizer (REV-127-03).
    const medidos = new Set(metricas.map((mm) => mm.layerId))
    textosSemMetrica = camadas
      .filter((l) => (l.type === 'text' || l.type === 'rich-text') && l.visible !== false && String(l.content ?? '').trim() && !medidos.has(l.id))
      .map((l) => l.id)
  } catch (erro) {
    motivoSemMedida = `a medição dos textos falhou: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 160)}`
    console.warn('[revisar-arte]', motivoSemMedida)
  }

  // "Nunca lança": a conferência das fontes (importa o canvas) também é cercada — sem ela, nenhuma fonte é dita ausente
  // e a geometria fica como medida; o aviso vai ao log (revisor D).
  let fontesAusentes: MedidaDaPeca['fontesAusentes'] = []
  let motivoSemFontes: string | undefined
  try {
    fontesAusentes = await fontesQueFaltam(camadas)
  } catch (erro) {
    motivoSemFontes = `a conferência das fontes falhou: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 160)}`
    console.warn('[revisar-arte]', motivoSemFontes)
  }

  let contraste: ContrasteMedido[] | null = null
  let pioras: PioraDeTratamento[] | null = null
  try {
    const regua = await medirContrasteDaPeca({ layers: camadas, canvas, background, faixa, corrigir: opcoes.corrigir !== false })
    contraste = regua.medidas
    // A piora vale para a peça COMO ESTÁ — a correção da régua aqui é só em memória (CP1).
    pioras = regua.pioras
  } catch (erro) {
    console.warn('[revisar-arte] a régua de contraste falhou:', erro instanceof Error ? erro.message : erro)
  }

  // A leitura da logo (CP3): cada logo solta medida contra o fundo efetivo sem ela. Falha do render = regra não
  // avaliada, com o motivo; arquivo que não carregou é dito por logo (cobertura parcial), nunca "sem contraste".
  let leituraDaLogo: Awaited<ReturnType<typeof medirLogosDaPeca>> | null = null
  let motivoSemLeituraDaLogo: string | undefined
  const logosSoltas = logosDaPeca(camadas)
  if (logosSoltas.length === 0) leituraDaLogo = []
  else {
    try {
      leituraDaLogo = await medirLogosDaPeca({ layers: camadas, canvas, background, logos: logosSoltas, origens: ctx.origensDaLogo, cache: ctx.cacheDeLogos })
    } catch (erro) {
      motivoSemLeituraDaLogo = `a leitura da logo não foi medida: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 160)}`
      console.warn('[revisar-arte]', motivoSemLeituraDaLogo)
    }
  }

  return {
    canvas,
    formato,
    camadas,
    metricas,
    geometria: issues,
    contraste,
    pioras,
    faixaDoGradiente: faixa,
    referencias: ctx.referencias,
    ...(ctx.titulosFixados ? { titulosFixados: ctx.titulosFixados } : {}),
    assunto: ctx.assunto,
    ...(ctx.motivoSemAssunto ? { motivoSemAssunto: ctx.motivoSemAssunto } : {}),
    ...(ctx.assuntoNaoSeAplica ? { assuntoNaoSeAplica: ctx.assuntoNaoSeAplica } : {}),
    leituraDaLogo,
    ...(motivoSemLeituraDaLogo ? { motivoSemLeituraDaLogo } : {}),
    fontesAusentes,
    ...(motivoSemFontes ? { motivoSemFontes } : {}),
    medidasAproximadas,
    motivoSemMedida,
    textosSemMetrica,
  }
}

const SELECT_DA_GERACAO = { id: true, fieldValues: true, sourcePageId: true } as const

/**
 * CP5e § 1.2 item 2 — UMA seleção da Generation da peça, relida com `sourcePageId` (o contexto precisa dele para a
 * referência de modelo): (i) a pedida pelo chamador, se for desta página; (ii) a de ORIGEM (a do compositor, a mesma
 * seleção do CP5d); (iii) a última arte da página (`alvoDaRecomposicao`); (iv) nenhuma.
 */
async function geracaoDaPecaParaRevisao(args: { projectId: number; pageId: string; pedida: GeracaoDaPagina | null }): Promise<GeracaoDaPagina | null> {
  const { projectId, pageId } = args
  if (args.pedida) {
    const pid = (args.pedida.fieldValues as Record<string, unknown> | null)?.pageId
    if (pid !== pageId) {
      throw new CreativeError('GERACAO_DE_OUTRA_PAGINA', `A arte ${args.pedida.id} não é desta página: revise pelo pageId dela ou sem generationId.`, 422, { pageId, generationId: args.pedida.id })
    }
    return args.pedida
  }
  const compositor = (await db.generation.findFirst({
    where: { projectId, AND: [{ fieldValues: { path: ['pageId'], equals: pageId } }, { fieldValues: { path: ['source'], equals: 'compositor' } }] },
    orderBy: { createdAt: 'desc' },
    select: SELECT_DA_GERACAO,
  })) as GeracaoDaPagina | null
  if (compositor) return compositor
  const alvo = await alvoDaRecomposicao(db, pageId, { projectId })
  if (!alvo) return null
  return (await db.generation.findUnique({ where: { id: alvo.id }, select: SELECT_DA_GERACAO })) as GeracaoDaPagina | null
}

/**
 * CP5e § 1.2 item 1 — o gate como INFORMAÇÃO: uma SEGUNDA medida com `corrigir: false` (a do revisor é corrigida em
 * memória pela régua — `ok` da força PROPOSTA, não da gravada — e o gate não pode tomar essa leitura por medida) sobre o
 * MESMO contexto, decidida por `decidirEMontarRegistro` com origem `revisar-arte`, SEM gravar. Toda exceção vira
 * `nao-medida` (fail-closed): a revisão humana sai do mesmo jeito.
 */
async function gateInformativo(args: {
  projectId: number
  page: { id: string; name: string; tags: string[]; width: number; height: number; background: string | null; layers: unknown; copyAutoral: unknown; isTemplate: boolean }
  camadas: Layer[]
  contexto: ContextoDaMedicao
  geracao: GeracaoDaPagina | null
}): Promise<GateInformativo> {
  const informacao = INFORMACAO_DO_GATE_DO_REVISOR
  const { page } = args
  // Decisão 5.2 (proposta): página-modelo não vai para a agenda — nada a decidir.
  if (page.isTemplate) return { tipo: 'sem-vinculo', motivo: 'página-modelo não vai para a agenda: o gate só decide sobre arte', informacao }
  if (!args.geracao) return { tipo: 'sem-vinculo', motivo: 'a página não tem arte (nenhuma Generation): o gate só decide sobre arte', informacao }
  const formato = formatoDaPaginaGravada(page)
  if (!formato) return { tipo: 'sem-vinculo', motivo: 'o formato da página não é story, feed nem quadrado', informacao }
  try {
    const medidaFiel = await medirCamadasDaPeca(args.camadas, args.contexto, { corrigir: false })
    const identidade = identidadeDaPagina(page)
    const decisao = decidirEMontarRegistro({
      entrada: { medida: medidaFiel, identidade: { pageVersion: identidade.pageVersion, copyVersion: identidade.copyVersion }, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE },
      page,
      vinculo: { projectId: args.projectId, generationId: args.geracao.id, postType: TIPO_DO_POST_POR_FORMATO[formato] },
      origem: 'revisar-arte',
      agora: () => new Date(),
    })
    if (decisao.decisao === 'sem-vinculo') return { tipo: 'sem-vinculo', motivo: decisao.motivo, informacao }
    const { gate, registro } = decisao
    return {
      tipo: 'medida',
      resultado: gate.resultado,
      rulesVersion: gate.rulesVersion,
      versaoDoGate: gate.versao,
      medidoEm: registro.medidoEm,
      motivos: gate.motivos,
      naoMedidos: gate.naoMedidos,
      pageVersion: gate.pageVersion,
      copyVersion: gate.copyVersion,
      politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE,
      vinculo: { generationId: args.geracao.id, postType: TIPO_DO_POST_POR_FORMATO[formato] },
      informacao,
    }
  } catch (erro) {
    return { tipo: 'nao-medida', motivo: `a decisão do gate falhou: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 200)}`, informacao }
  }
}

export async function revisarArte(input: RevisarArteInput): Promise<RevisaoDaArte> {
  const inicio = Date.now()
  const { projectId } = input

  let pageId = input.pageId ?? null
  // A Generation PEDIDA pelo chamador (relida com o select do contexto): acha a página quando não há `pageId` e, com
  // `pageId`, é validada como arte DESTA página (CP5e § 1.2 — antes o `generationId` era ignorado quando vinha `pageId`).
  let pedida: GeracaoDaPagina | null = null
  if (input.generationId) {
    const geracao = await db.generation.findFirst({
      where: { id: input.generationId, projectId },
      select: { ...SELECT_DA_GERACAO, status: true },
    })
    if (!geracao) throw new CreativeError('GERACAO_NAO_ENCONTRADA', `Arte não encontrada neste projeto: ${input.generationId}`, 404)
    const pid = (geracao.fieldValues as Record<string, unknown> | null)?.pageId
    if (typeof pid !== 'string' || !pid) {
      throw new CreativeError(
        'GERACAO_SEM_PAGINA',
        geracao.status === 'PROCESSING'
          ? 'A peça ainda está sendo composta: espere ela aparecer pronta em ver-geracao e revise de novo.'
          : 'Esta arte não tem página editável (veio de IA ou de upload): a revisão é da arte feita no editor.',
        422,
      )
    }
    pedida = { id: geracao.id, fieldValues: geracao.fieldValues, sourcePageId: geracao.sourcePageId }
    if (!pageId) pageId = pid
  }
  if (!pageId) throw new CreativeError('SEM_PAGINA', 'Informe pageId ou generationId da peça.', 400)

  const page = await db.page.findUnique({
    where: { id: pageId },
    include: { Template: { select: { id: true, projectId: true } } },
  })
  if (!page || page.Template.projectId !== projectId) {
    throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada neste projeto: ${pageId}`, 404)
  }
  const lidas = lerCamadas(page.layers)
  if (!lidas.legivel) {
    throw new CreativeError('PAGE_LAYERS_ILEGIVEIS', 'As camadas desta página são ilegíveis: abra no editor e salve de novo.', 422, { pageId })
  }
  const camadas = lidas.camadas as unknown as Layer[]
  // O MESMO fundo que o render de publicação usa (`renderPageAndRegister` passa
  // pelo mesmo conversor): revisar sobre outro fundo julgaria outra peça (R3).
  const designData = convertPageToDesignData({ id: page.id, name: page.name, width: page.width, height: page.height, layers: page.layers, background: page.background })
  // CP4: o contexto da página (banco) e a medida das camadas em memória são as mesmas funções que o executor de ajustes
  // usa para medir cada ajuste ANTES e DEPOIS — uma medição só, para o revisor e para a não-piora.
  // CP5e § 1.2 item 2: UMA seleção da Generation da peça (relida), passada ao contexto — a composição só é reaproveitada
  // (assunto gravado, variante da logo) quando a arte é DESTA versão da página (a regra do CP5c).
  const geracao = await geracaoDaPecaParaRevisao({ projectId, pageId: page.id, pedida })
  const versaoAtual = versaoDaPagina(page)
  const composicaoReaproveitavel = !!geracao && versaoAtual !== null && (geracao.fieldValues as Record<string, unknown> | null)?.versaoRenderizada === versaoAtual
  const contexto = await contextoDaMedicao({
    projectId,
    page: { id: page.id, name: page.name, width: page.width, height: page.height, tags: page.tags, background: page.background, layers: page.layers },
    camadas,
    generationDaPeca: geracao,
    composicaoReaproveitavel,
  })
  const { canvas, formato, background, referencia } = contexto
  const medida = await medirCamadasDaPeca(camadas, contexto)
  // CP5e § 1: o gate como informação — segunda medida fiel sobre o mesmo contexto, decidida sem gravar.
  const gate = await gateInformativo({ projectId, page, camadas, contexto, geracao })
  const { metricas } = medida

  const querVisao = input.visao !== false && process.env.ARTE_REVISAO_VISAO !== 'off'
  const querPrevia = input.previa !== false
  let png: Buffer | null = null
  if (querVisao || querPrevia) {
    try {
      const { CanvasRenderer } = await import('@/lib/canvas-renderer')
      png = await new CanvasRenderer(canvas.width, canvas.height).renderDesign(designData, {})
    } catch (erro) {
      console.warn('[revisar-arte] render da peça falhou:', erro instanceof Error ? erro.message : erro)
    }
  }

  const marcas = marcasDaPeca(camadas, metricas)
  let marcada: Buffer | null = null
  if (png) {
    try {
      const { GlobalFonts } = await import('@napi-rs/canvas')
      const familia = camadas.map((l) => primeiraFamilia(l.style?.fontFamily)).find((f) => !!f && GlobalFonts.has(f)) ?? null
      marcada = await desenharMarcas(png, marcas, canvas, familia)
    } catch (erro) {
      console.warn('[revisar-arte] marcas não desenhadas:', erro instanceof Error ? erro.message : erro)
    }
  }

  let vistos: AchadoVisto[] | undefined
  let visao: EstadoDaVisao = { estado: 'desligada', motivo: 'visão desligada nesta revisão' }
  if (querVisao) {
    if (!png || !marcada) {
      visao = { estado: 'falhou', motivo: 'a peça não pôde ser renderizada para a visão' }
    } else {
      const t0 = Date.now()
      try {
        const sharp = (await import('sharp')).default
        const recortes = await recortesDosBlocos(png, marcas, canvas)
        const bruto = await pedirOlharDaVisao([
          {
            texto: textoDeContexto({
              formato,
              canvas,
              marcas,
              camadas,
              metricas,
              contraste: medida.contraste,
              recortes: recortes.map((r) => r.marca),
            }),
          },
          { imagem: await sharp(png).jpeg({ quality: 90 }).toBuffer() },
          { imagem: marcada },
          ...recortes.map((r) => ({ imagem: r.imagem })),
        ])
        const reconciliado = reconciliarVisao(bruto, marcas)
        vistos = reconciliado.vistos
        visao = {
          estado: 'feita',
          modelo: MODELO_DA_VISAO,
          ms: Date.now() - t0,
          descartados: reconciliado.descartados,
          truncados: reconciliado.truncados,
        }
      } catch (erro) {
        visao = {
          estado: 'falhou',
          modelo: MODELO_DA_VISAO,
          ms: Date.now() - t0,
          motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 200),
        }
      }
    }
  }

  const relatorio = avaliarPeca({
    ...medida,
    vistos,
    ...insumosDaVisao(visao, marcas),
  })

  // A prévia é conveniência: falhar aqui não pode descartar um relatório pronto.
  let previa: Buffer | null = null
  if (querPrevia && (marcada || png)) {
    try {
      const sharp = (await import('sharp')).default
      previa = await sharp(marcada ?? png!).resize({ width: 720 }).jpeg({ quality: 80 }).toBuffer()
    } catch (erro) {
      console.warn('[revisar-arte] prévia não gerada:', erro instanceof Error ? erro.message : erro)
    }
  }

  return {
    projectId,
    pageId: page.id,
    pagina: page.name,
    editUrl: `${getPublicAppUrl()}/templates/${page.templateId}/editor?pageId=${encodeURIComponent(page.id)}`,
    formato,
    versao: versaoDaPagina(page),
    aplicavel: !page.isTemplate,
    ...(page.isTemplate
      ? { motivo: 'É uma página-modelo do cliente: a revisão vale como leitura, mas modelo se ajusta no editor.' }
      : {}),
    referencia,
    relatorio,
    visao,
    previa,
    gate,
    ms: Date.now() - inicio,
  }
}
