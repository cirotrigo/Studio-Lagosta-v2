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
import { fetchBuffer, registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { checkTextGeometry } from '@/lib/creatives/text-geometry'
import { medirContrasteDaPeca, type ContrasteMedido } from '@/lib/compositor/regua'
import { GRADIENTE_PADRAO } from '@/lib/compositor/gradiente-de-leitura'
import { formatoDaPagina } from '@/lib/compositor/assinatura'
import { papelDoNome } from '@/lib/compositor/papel-do-nome'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { lerFotoComoCover } from '@/lib/creatives/halo/halo-medicao'
import { estimarAssunto, mapaDeCalma } from '@/lib/compositor/mapa-de-calma'
import type { Rect } from '@/lib/creatives/halo/halo'
import type { RelatorioDaRevisao } from './contrato'
import { avaliarPeca, ehTextoVisivel, entrelinhaDaCamada, type ReferenciaDeCamada } from './regras'
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
import { versaoDaPagina } from './versao'

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

/** Família (ou peso) pedida por um texto que o render não tem: ele desenha outra no lugar. */
async function fontesQueFaltam(camadas: Layer[]) {
  const { GlobalFonts } = await import('@napi-rs/canvas')
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
      const familia = primeiraFamilia(p.familia)
      if (!familia) continue
      const lista = pesos.get(familia.toLowerCase())
      // Só a família AUSENTE conta. A carteira cadastra cada peso como família
      // própria ("Lato Bold", "Didot HTF B06 Bold") e o render usa o estilo do
      // arquivo que existe: medido em 11/09/2026, conferir o peso pedido contra
      // o do arquivo acusou 45 falsos alarmes em 30 peças reais.
      if ((lista && lista.length > 0) || GlobalFonts.has(familia)) continue
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
): Promise<{ referencias: Record<string, ReferenciaDeCamada>; origem: string | null }> {
  const referencias: Record<string, ReferenciaDeCamada> = {}
  const doTexto = (c: Layer, largura: number) => ({
    fontSize1080: (typeof c.style?.fontSize === 'number' ? c.style.fontSize : 16) / (largura / 1080),
    entrelinha: entrelinhaDaCamada(c),
  })

  const assinaturaId = composicao?.assinatura?.pageId
  const arranjoDeCombinacao = Array.isArray(composicao?.arranjos) && composicao!.arranjos.some((a: any) => a?.origem === 'combinacao')
  if (typeof assinaturaId === 'string' && !arranjoDeCombinacao) {
    const pagina = await db.page.findUnique({ where: { id: assinaturaId }, select: { name: true, width: true, layers: true } })
    if (pagina) {
      // Papel repetido (endereço e horário, os dois `servico`) casa pela ORDEM de
      // cima para baixo; contagens diferentes não casam. Usar o maior corpo para
      // todos "aumentava" o endereço composto certo em 24px.
      const daAssinatura = new Map<string, Array<{ y: number; fontSize1080: number; entrelinha: number }>>()
      for (const c of lerCamadas(pagina.layers).camadas as unknown as Layer[]) {
        if (!ehTextoVisivel(c)) continue
        const papel = papelDaCamada(c) ?? papelDoNome(c.name) ?? papelDoNome(c.id)
        if (!papel) continue
        daAssinatura.set(papel, [...(daAssinatura.get(papel) ?? []), { y: c.position?.y ?? 0, ...doTexto(c, pagina.width) }])
      }
      const daPeca = new Map<string, Layer[]>()
      for (const c of camadas) {
        const papel = ehTextoVisivel(c) ? papelDaCamada(c) : null
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
          referencias[c.id] = { fontSize1080: ref.fontSize1080, entrelinha: ref.entrelinha, origem }
        })
      }
      return { referencias, origem }
    }
  }

  const modeloId = geracoes.find((g) => g.sourcePageId)?.sourcePageId
  if (modeloId) {
    const modelo = await db.page.findUnique({ where: { id: modeloId }, select: { name: true, width: true, layers: true } })
    if (modelo) {
      const porId = new Map((lerCamadas(modelo.layers).camadas as unknown as Layer[]).map((c) => [c.id, c]))
      const origem = `modelo "${modelo.name}"`
      for (const c of camadas) {
        const doModelo = porId.get(c.id)
        if (doModelo && ehTextoVisivel(c) && ehTextoVisivel(doModelo)) referencias[c.id] = { ...doTexto(doModelo, modelo.width), origem }
      }
      return { referencias, origem }
    }
  }
  return { referencias, origem: null }
}

/** O assunto da foto: o gravado pelo compositor (mesma foto, mesmo corte) ou o estimado pela textura. */
async function assuntoDaPeca(
  camadas: Layer[],
  canvas: { width: number; height: number },
  formato: RevisaoDaArte['formato'],
  fieldValues: Record<string, any> | null,
): Promise<{ rect: Rect; origem: 'catalogo' | 'estimado' } | null> {
  const fundo =
    camadas.find((l) => l.id === 'bg-foto' && l.visible !== false) ??
    camadas.find(
      (l) => l.type === 'image' && l.visible !== false && (l.size?.width ?? 0) >= canvas.width * 0.9 && (l.size?.height ?? 0) >= canvas.height * 0.9,
    )
  if (!fundo?.fileUrl) return null
  const composicao = fieldValues?.composicao
  const corte = fundo.style?.cropPosition ?? null
  if (
    composicao?.assunto &&
    // O retângulo gravado é da peça COMPOSTA: outro formato é outro cover.
    composicao.formato === formato &&
    composicao.assuntoOrigem &&
    composicao.assuntoOrigem !== 'nenhum' &&
    fieldValues?.imageUrl === fundo.fileUrl &&
    (composicao.posicao?.crop ?? null) === corte
  ) {
    return { rect: composicao.assunto as Rect, origem: composicao.assuntoOrigem === 'catalogo' ? 'catalogo' : 'estimado' }
  }
  try {
    const bytes = await fetchBuffer(fundo.fileUrl)
    const foto = await lerFotoComoCover(bytes, canvas, corte ? { cropPosition: corte } : {})
    const rect = estimarAssunto(mapaDeCalma(foto))
    return rect ? { rect, origem: 'estimado' } : null
  } catch (erro) {
    console.warn('[revisar-arte] assunto da foto não estimado:', erro instanceof Error ? erro.message : erro)
    return null
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

export async function revisarArte(input: RevisarArteInput): Promise<RevisaoDaArte> {
  const inicio = Date.now()
  const { projectId } = input

  let pageId = input.pageId ?? null
  if (!pageId && input.generationId) {
    const geracao = await db.generation.findFirst({
      where: { id: input.generationId, projectId },
      select: { fieldValues: true, status: true },
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
    pageId = pid
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
  const canvas = { width: page.width, height: page.height }
  const formato = formatoDaPagina({ name: page.name, tags: page.tags, width: page.width, height: page.height })
  // O MESMO fundo que o render de publicação usa (`renderPageAndRegister` passa
  // pelo mesmo conversor): revisar sobre outro fundo julgaria outra peça (R3).
  const designData = convertPageToDesignData({ id: page.id, name: page.name, width: page.width, height: page.height, layers: page.layers, background: page.background })
  const background = designData.canvas.backgroundColor

  // Toda etapa de MEDIDA é opcional: falhar em registrar fonte, criar o
  // medidor ou medir a geometria vira cobertura "não avaliada" nas regras que
  // dependem dela — nunca derruba a revisão (R4). Métrica ausente não é
  // avaliação positiva: `motivoSemMedida` é o que `avaliarPeca` lê.
  const medidasAproximadas: string[] = []
  let issues: ReturnType<typeof checkTextGeometry>['issues'] = []
  let metricas: ReturnType<typeof checkTextGeometry>['metricas'] = []
  let motivoSemMedida: string | undefined
  let textosSemMetrica: string[] = []
  try {
    await registerProjectFonts(projectId)
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

  const [fontesAusentes, projeto, geracoes] = await Promise.all([
    fontesQueFaltam(camadas),
    db.project.findUnique({ where: { id: projectId }, select: { assinatura: true } }),
    db.generation.findMany({
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

  let contraste: ContrasteMedido[] | null = null
  try {
    contraste = (await medirContrasteDaPeca({ layers: camadas, canvas, background, faixa, corrigir: true })).medidas
  } catch (erro) {
    console.warn('[revisar-arte] a régua de contraste falhou:', erro instanceof Error ? erro.message : erro)
  }

  const doCompositor = geracoes.find((g) => (g.fieldValues as Record<string, unknown> | null)?.source === 'compositor')
  const fieldValues = (doCompositor?.fieldValues ?? null) as Record<string, any> | null
  const { referencias, origem: referencia } = await referenciasDaPagina(camadas, fieldValues?.composicao ?? null, geracoes)
  const assunto = await assuntoDaPeca(camadas, canvas, formato, fieldValues)

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
              contraste,
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
    canvas,
    formato,
    camadas,
    metricas,
    geometria: issues,
    contraste,
    faixaDoGradiente: faixa,
    referencias,
    assunto,
    fontesAusentes,
    medidasAproximadas,
    motivoSemMedida,
    textosSemMetrica,
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
    ms: Date.now() - inicio,
  }
}
