/**
 * O COMPOSITOR — a usina de arte do editor (F1 do plano editor-como-usina).
 *
 * Recebe uma spec (copy por papel e por linha, foto, formato, preferências),
 * lê a assinatura da marca (página + números), MEDE cada linha com a fonte
 * real, acha a área livre da foto (mapa de calma + assunto), escolhe o
 * enquadramento e a posição, calibra o halo por bloco, põe a logo no canto
 * pela luz, passa pelo autofix geométrico e persiste como página EDITÁVEL —
 * ou, em `provar`, só renderiza e devolve o PNG, sem gravar nada.
 *
 * É o port do `gerar.py` do canvas de design para dentro do backend: a spec
 * é o `dados.py`, a assinatura é o `PADRAO.md`, o mapa é o `luz_sob`, e o
 * que sai é `Layer[]` em vez de HTML — a peça nasce onde a equipe ajusta.
 */

import type { CanalDaArte } from '@/lib/creatives/canal'
import { db } from '@/lib/db'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { persistAndRenderCreative, resolveImageUrl, type PersistCreativeResult } from '@/lib/creatives/persist'
import { registerProjectFonts, fetchBuffer } from '@/lib/posts/register-project-fonts'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { aplicarAutofixOuFalhar } from '@/lib/creatives/text-autofix'
import { normalizarCamadas } from '@/lib/creatives/layer-contract'
import { lerFotoComoCover, luzNoRect, type FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import { calibrarHalo, luzDaCor, type Rect } from '@/lib/creatives/halo/halo'
import type { CropPosition } from '@/lib/image-crop-utils'
import { registrarUsoDeFoto } from '@/lib/creatives/uso-de-foto'

import { garantirPasta, ordemNaPasta } from './pastas'
import { entradaDePersistencia } from './persistencia'
import { nomeDaPagina } from './pasta-da-semana'

import {
  escolherVariante,
  formatoDaPagina,
  montarAssinatura,
  papelDoNome,
  papeisQueFaltam,
  NOME_DO_TEMPLATE_DE_ASSINATURA,
  type AssinaturaDaMarca,
} from './assinatura'
import { montarBloco, empilhar, type BlocoMontado } from './blocos'
import {
  estimarAssunto,
  lerMapaSob,
  mapaDeCalma,
  pontuarCandidatos,
  type CandidatoDePosicao,
  type MapaDeCalma,
  type PontuacaoDePosicao,
} from './mapa-de-calma'
import { DIMENSOES, validarSpec, type Alinhamento, type Ancora, type Canto, type Formato, type Papel, type SpecDePeca } from './spec'
import { alvoClaroPorContraste, medirContrasteDaPeca, type ContrasteMedido } from './regua'

export { TAG_DA_PECA_COMPOSTA } from './persistencia'

export interface RotuloDePosicao {
  ancora: Ancora
  alinha: Alinhamento
  crop: CropPosition
}

export interface DiagnosticoDaComposicao {
  formato: Formato
  posicao: RotuloDePosicao & { pontuacao: number; motivo: string }
  candidatos: Array<RotuloDePosicao & { pontuacao: number; descartado: boolean; motivo: string }>
  assunto: Rect | null
  assuntoOrigem: 'catalogo' | 'estimado' | 'nenhum'
  halos: Array<{ grupo: string; tinta: number; raio: number; luz: number; alvo: number; necessidade: number }>
  logo: { canto: Canto; tinta: number } | null
  blocos: Array<{ papel: Papel; escala: number; width: number; height: number }>
  contraste: ContrasteMedido[] | null
  assinatura: AssinaturaDaMarca['origem']
  avisos: string[]
}

export interface OpcoesDeComposicao {
  /** Só renderiza e devolve o PNG — nada é gravado. */
  provar?: boolean
  /** `User.id` INTERNO (cuid), nunca o clerkId. */
  decididoPor?: string | null
  /**
   * Quem ASSINA a arte (`Generation.createdBy`, User.id interno). É a pessoa
   * que pediu — no conector, o dono do token; no servidor local, quem o Mac
   * declara em STUDIO_AUTOR. Sem isso, o dono do projeto ("Automações").
   */
  autor?: string | null
  /** Por qual canal a peça foi pedida. Ver `creatives/canal.ts`. */
  canal?: CanalDaArte | null
  /** F3: a Generation PROCESSING que a fila criou — o persist a fecha em vez de criar outra. */
  generationId?: string | null
}

export interface ResultadoDaComposicao {
  persistido: PersistCreativeResult | null
  prova: Buffer | null
  layers: Layer[]
  diagnostico: DiagnosticoDaComposicao
}

// ─── Assinatura ────────────────────────────────────────────────────────────

export interface OpcoesDeAssinatura {
  /** Nome/tag da variante pedida na spec. */
  variante?: string | null
  /** Os papéis que a peça pede: variante que os tem vence a que não os tem. */
  papeis?: Papel[]
  /** O assunto da peça — casa com nome/tags da página ("funcionamento", "cafés"). */
  tema?: string | null
  /** Luz média da foto (0..255) — escolhe entre variantes `clara`/`escura`. */
  luzDaFoto?: number | null
  /** Chave da peça para o rodízio entre variantes. */
  chave?: string
}

/** Todas as páginas de assinatura do projeto, com o formato que cada uma declara. */
export async function paginasDeAssinatura(projectId: number) {
  const template = await db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } })
  if (!template) return { templateId: null as number | null, paginas: [] as Array<{ id: string; name: string; tags: string[]; width: number; height: number; formato: Formato | null; papeis: Papel[] }> }
  // TODA página do template "Assinatura" é variante — duplicar uma página no
  // editor já cria a variante, sem precisar marcar como modelo nem taguear
  // (a segunda story da Real nasceu assim, sem tag, e ficava invisível).
  const paginas = await db.page.findMany({
    where: { templateId: template.id },
    select: { id: true, name: true, tags: true, width: true, height: true, layers: true },
    orderBy: { order: 'asc' },
  })
  const { parsePageLayers } = await import('@/lib/posts/page-layers')
  return {
    templateId: template.id,
    paginas: paginas.map(({ layers, ...p }) => ({
      ...p,
      formato: formatoDaPagina(p),
      papeis: [...new Set((parsePageLayers(layers) as unknown as Layer[]).filter((c) => c.type === 'text' && c.visible !== false).map((c) => papelDoNome(c.name) ?? papelDoNome(c.id)).filter((x): x is Papel => !!x))],
    })),
  }
}

export async function carregarAssinatura(projectId: number, formato: Formato, opcoes: OpcoesDeAssinatura = {}): Promise<AssinaturaDaMarca> {
  const [projeto, template] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        assinatura: true,
        Logo: { where: { isProjectLogo: true }, take: 1, select: { fileUrl: true } },
      },
    }),
    db.template.findFirst({
      where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA },
      select: { id: true },
    }),
  ])
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${projectId} não encontrado`, 404)

  const paginas = template
    ? await db.page.findMany({
        where: { templateId: template.id },
        select: { id: true, name: true, width: true, height: true, layers: true, background: true, tags: true },
        orderBy: { order: 'asc' },
      })
    : []

  const { parsePageLayers } = await import('@/lib/posts/page-layers')
  // Cada página com os papéis que TEM: é o que deixa a escolha ser pela
  // mensagem (a peça de funcionamento precisa de serviço; a de sabor, não).
  const comPapeis = paginas.map((p) => ({
    ...p,
    papeis: [...new Set((parsePageLayers(p.layers) as unknown as Layer[]).filter((c) => c.type === 'text' && c.visible !== false).map((c) => papelDoNome(c.name) ?? papelDoNome(c.id)).filter((x): x is Papel => !!x))],
  }))
  const { pagina: escolhida, formatoDaPagina: fmt, motivo } = escolherVariante(comPapeis, {
    formato,
    variante: opcoes.variante ?? null,
    papeis: opcoes.papeis,
    tema: opcoes.tema ?? null,
    luzDaFoto: opcoes.luzDaFoto ?? null,
    chave: opcoes.chave ?? '',
  })

  const montar = (p: (typeof paginas)[number] | null, f: Formato | null) =>
    montarAssinatura({
      pagina: p ? { id: p.id, name: p.name, tags: p.tags, width: p.width, height: p.height, background: p.background, layers: parsePageLayers(p.layers) as unknown as Layer[] } : null,
      formatoDaPagina: f,
      numerosDoProjeto: projeto.assinatura,
      logoDoProjeto: projeto.Logo[0] ? { url: projeto.Logo[0].fileUrl } : null,
    })
  const assinatura = montar(escolhida, fmt)
  assinatura.origem.motivoDaVariante = motivo
  // Feed/quadrado montado só com o que muda: o que falta vem da página de story.
  // A página do formato é a verdade INTEIRA daquele formato (Ciro, 04/09/2026:
  // "respeite os templates que eu defini, não adicione campos"). Papel que a
  // página de feed não tem NÃO vem da story — sai da peça com aviso, como em
  // qualquer variante. A copy é escrita sobre os papéis que a página tem.
  return assinatura
}

/** O projeto tem página de assinatura? É o que decide a via `compor` na proposta da semana. */
export async function projetoTemAssinatura(projectId: number): Promise<boolean> {
  const template = await db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } })
  if (!template) return false
  const n = await db.page.count({ where: { templateId: template.id } })
  return n > 0
}

// ─── Foto ──────────────────────────────────────────────────────────────────

interface FotoDaPeca {
  url: string
  bytes: Buffer
  largura: number
  altura: number
}

async function carregarFoto(spec: SpecDePeca): Promise<{ foto: FotoDaPeca | null; aviso: string | null }> {
  if (!spec.foto?.url && !spec.foto?.driveFileId) return { foto: null, aviso: null }
  const r = await resolveImageUrl(spec.foto.url, spec.foto.driveFileId)
  if (!r.url) return { foto: null, aviso: r.warning ?? 'A foto não pôde ser resolvida.' }
  const bytes = await fetchBuffer(r.url)
  const sharp = (await import('sharp')).default
  const meta = await sharp(bytes).metadata()
  return {
    foto: { url: r.url, bytes, largura: meta.width ?? 0, altura: meta.height ?? 0 },
    aviso: r.warning ?? null,
  }
}

/** Luz média da foto como ela aparece na peça (0..255) — para a variante clara/escura. */
async function luzMediaDaFoto(bytes: Buffer, canvas: { width: number; height: number }): Promise<number | null> {
  try {
    const raster = await lerFotoComoCover(bytes, canvas)
    const luz = luzNoRect(raster, { x: 0, y: 0, width: canvas.width, height: canvas.height })
    return luz ? Math.round(luz.media) : null
  } catch {
    return null
  }
}

/** Os cortes que abrem área livre: só faz sentido variar no eixo em que a foto SOBRA. */
function cortesCandidatos(foto: FotoDaPeca | null, canvas: { width: number; height: number }, fixo: boolean): CropPosition[] {
  if (!foto || fixo || !foto.largura || !foto.altura) return ['center-middle']
  const razaoFoto = foto.largura / foto.altura
  const razaoCanvas = canvas.width / canvas.height
  if (razaoFoto > razaoCanvas * 1.08) return ['left-middle', 'center-middle', 'right-middle']
  if (razaoFoto < razaoCanvas / 1.08) return ['center-top', 'center-middle', 'center-bottom']
  return ['center-middle']
}

// ─── Posição ───────────────────────────────────────────────────────────────

const RODIZIO: Array<{ ancora: Ancora; alinha: Alinhamento }> = [
  { ancora: 'topo', alinha: 'esquerda' },
  { ancora: 'rodape', alinha: 'esquerda' },
  { ancora: 'topo', alinha: 'direita' },
  { ancora: 'rodape', alinha: 'direita' },
  { ancora: 'meio', alinha: 'esquerda' },
  { ancora: 'meio', alinha: 'direita' },
  { ancora: 'topo', alinha: 'centro' },
  { ancora: 'rodape', alinha: 'centro' },
]

function hashDe(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function preferenciaDoRodizio(spec: SpecDePeca): { ancora: Ancora; alinha: Alinhamento } {
  const chave = `${spec.nome ?? ''}|${spec.tema ?? ''}|${spec.foto?.driveFileId ?? spec.foto?.url ?? ''}|${spec.blocos[0]?.linhas.join(' ') ?? ''}`
  return RODIZIO[hashDe(chave) % RODIZIO.length]
}

function alinhamentoParaTextAlign(a: Alinhamento): 'left' | 'center' | 'right' {
  return a === 'esquerda' ? 'left' : a === 'direita' ? 'right' : 'center'
}

interface GeometriaDaPeca {
  W: number
  H: number
  margemH: number
  safeTopo: number
  safeRodape: number
  gap: number
}

function retanguloDoBloco(g: GeometriaDaPeca, ancora: Ancora, alinha: Alinhamento, w: number, h: number): Rect {
  const x = alinha === 'esquerda' ? g.margemH : alinha === 'direita' ? g.W - g.margemH - w : (g.W - w) / 2
  const y = ancora === 'topo' ? g.safeTopo : ancora === 'rodape' ? g.H - g.safeRodape - h : (g.H - h) / 2
  return { x: Math.round(x), y: Math.round(Math.max(g.safeTopo, Math.min(y, g.H - g.safeRodape - h))), width: w, height: h }
}

function candidatosDePosicao(
  g: GeometriaDaPeca,
  spec: SpecDePeca,
  bloco: { width: number; height: number },
  crop: CropPosition,
  extra: { reservaNoRodape?: number; reservaNoTopo?: number; alinhaDaAssinatura?: Alinhamento | null; ancoraDaPagina?: Ancora | null } = {},
): CandidatoDePosicao<RotuloDePosicao>[] {
  const pref = spec.preferencias ?? {}
  const rodizio = { ...preferenciaDoRodizio(spec), ...(extra.alinhaDaAssinatura ? { alinha: extra.alinhaDaAssinatura } : {}) }
  // Ciro (03/09/2026): "o agrupamento que está no topo deve permanecer no
  // topo… o que está no rodapé a mesma coisa" — o VERTICAL é da página; o
  // mapa da foto só escolhe o HORIZONTAL (esquerda/centro/direita). A spec
  // ainda pode pedir outra âncora de propósito.
  const ancoras: Ancora[] =
    pref.ancora && pref.ancora !== 'auto' ? [pref.ancora] : extra.ancoraDaPagina ? [extra.ancoraDaPagina] : ['topo', 'meio', 'rodape']
  const alinhas: Alinhamento[] = pref.alinha && pref.alinha !== 'auto' ? [pref.alinha] : ['esquerda', 'centro', 'direita']
  const saida: CandidatoDePosicao<RotuloDePosicao>[] = []
  for (const ancora of ancoras) {
    for (const alinha of alinhas) {
      const explicita = (pref.ancora && pref.ancora !== 'auto') || (pref.alinha && pref.alinha !== 'auto')
      const preferencia = explicita
        ? 1
        : rodizio.ancora === ancora && rodizio.alinha === alinha
          ? 0.6
          : ancora === 'meio'
            ? 0.1
            : 0.3
      const reservaBaixo = ancora === 'rodape' ? extra.reservaNoRodape ?? 0 : 0
      const reservaCima = ancora === 'topo' ? extra.reservaNoTopo ?? 0 : 0
      const rect = retanguloDoBloco(g, ancora, alinha, bloco.width, bloco.height + reservaBaixo + reservaCima)
      saida.push({ rect: { ...rect, y: rect.y + reservaCima, height: bloco.height }, preferencia, rotulo: { ancora, alinha, crop } })
    }
  }
  return saida
}

// ─── Logo ──────────────────────────────────────────────────────────────────

function retanguloDoCanto(g: GeometriaDaPeca, canto: Canto, w: number, h: number): Rect {
  const x = canto.endsWith('esquerdo') ? g.margemH : g.W - g.margemH - w
  const y = canto.startsWith('superior') ? g.safeTopo : g.H - g.safeRodape - h
  return { x, y, width: w, height: h }
}

function intersecta(a: Rect, b: Rect, folga = 24): boolean {
  return !(a.x + a.width + folga <= b.x || b.x + b.width + folga <= a.x || a.y + a.height + folga <= b.y || b.y + b.height + folga <= a.y)
}

function escolherCanto(args: {
  g: GeometriaDaPeca
  mapa: MapaDeCalma | null
  blocos: Rect[]
  logo: { w: number; h: number }
  pedido: Canto | 'auto' | 'nenhum' | undefined
  formato: Formato
}): { canto: Canto; rect: Rect; luz: number } | null {
  if (args.pedido === 'nenhum') return null
  // Em STORY a logo mora no rodapé (o topo tem avatar e barra do Instagram, e
  // é onde o bloco de texto costuma pousar): os cantos de cima só entram
  // quando o texto está no rodapé. Medido em 03/09 no TERO — a penalidade de
  // 0,25 não segurava a logo longe do pré-título quando o prato embaixo era
  // agitado.
  const textoNoRodape = args.blocos.some((b) => b.y + b.height > args.g.H * 0.6)
  const todos: Canto[] =
    args.formato === 'story' && !textoNoRodape
      ? ['inferior-esquerdo', 'inferior-direito']
      : ['inferior-esquerdo', 'inferior-direito', 'superior-direito', 'superior-esquerdo']
  const candidatos: Canto[] = args.pedido && args.pedido !== 'auto' ? [args.pedido] : todos
  const comRect = (lista: Canto[]) => lista.map((canto) => ({ canto, rect: retanguloDoCanto(args.g, canto, args.logo.w, args.logo.h) }))
  const semColisao = (lista: ReturnType<typeof comRect>) => lista.filter((c) => !args.blocos.some((b) => intersecta(b, c.rect)))
  // 1º os cantos preferidos livres; 2º qualquer canto livre (serviço
  // centralizado no rodapé toma os dois de baixo — medido no Empório, a logo
  // pousava em cima do horário); 3º o menos ruim.
  const todosOsCantos: Canto[] = ['inferior-esquerdo', 'inferior-direito', 'superior-direito', 'superior-esquerdo']
  const livres = semColisao(comRect(candidatos))
  const lista = livres.length > 0 ? livres : semColisao(comRect(args.pedido && args.pedido !== 'auto' ? candidatos : todosOsCantos))
  const finais = lista.length > 0 ? lista : comRect(candidatos)
  const pontuados = finais.map((c) => {
    const leitura = args.mapa ? lerMapaSob(args.mapa, c.rect) : { p98: 0, energia: 0, media: 0, cobertura: 1 }
    const emax = Math.max(1, args.mapa?.energiaMaxima ?? 1)
    // No story a logo prefere o RODAPÉ (o topo tem avatar e barra do Instagram).
    const penalidadeTopo = args.formato === 'story' && c.canto.startsWith('superior') ? 0.25 : 0
    const custo = 0.5 * (leitura.p98 / 255) + 0.5 * (leitura.energia / emax) + penalidadeTopo
    return { ...c, custo, luz: 0.5 * leitura.media + 0.5 * leitura.p98 }
  })
  pontuados.sort((a, b) => a.custo - b.custo)
  return pontuados[0] ?? null
}

// ─── Halo ──────────────────────────────────────────────────────────────────

function tintaNaFaixa(necessidade: number, faixa: [number, number]): number {
  const n = Math.max(0, Math.min(1, necessidade))
  return Number((faixa[0] + n * (faixa[1] - faixa[0])).toFixed(3))
}

function fundoDeHalo(mancha: string, tinta: number, raio: number) {
  return {
    enabled: true,
    backgroundColor: mancha,
    baseColor: mancha,
    tone: 0,
    fit: 'texto' as const,
    opacity: tinta,
    padding: Math.min(200, Math.round(raio * 0.9)),
    borderRadius: Math.min(300, raio),
    blur: raio,
    offsetX: 0,
    offsetY: 0,
  }
}

// ─── A composição ──────────────────────────────────────────────────────────

export async function comporPeca(entrada: unknown, opcoes: OpcoesDeComposicao = {}): Promise<ResultadoDaComposicao> {
  const v = validarSpec(entrada)
  if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400, { problemas: v.problemas })
  const spec = v.spec
  const avisos: string[] = []

  const projeto = await db.project.findUnique({ where: { id: spec.projectId }, select: { id: true, name: true, userId: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${spec.projectId} não encontrado`, 404)

  // A foto vem ANTES da assinatura: a luz média dela escolhe entre variantes
  // `clara`/`escura`, e a chave da peça faz o rodízio entre as demais.
  const { foto, aviso: avisoDaFoto } = await carregarFoto(spec)
  if (avisoDaFoto) avisos.push(avisoDaFoto)
  const canvas = DIMENSOES[spec.formato]
  const luzDaFoto = foto ? await luzMediaDaFoto(foto.bytes, canvas) : null
  const assinatura = await carregarAssinatura(spec.projectId, spec.formato, {
    variante: spec.preferencias?.variante ?? null,
    papeis: spec.blocos.map((b) => b.papel),
    tema: spec.tema ?? spec.nome ?? null,
    luzDaFoto,
    chave: `${spec.nome ?? ''}|${spec.tema ?? ''}|${spec.foto?.driveFileId ?? spec.foto?.url ?? ''}|${spec.blocos[0]?.linhas.join(' ') ?? ''}`,
  })
  const faltam = papeisQueFaltam(assinatura, spec.blocos.map((b) => b.papel))
  if (!assinatura.origem.pageId || faltam.includes('headline')) {
    throw new CreativeError(
      'ASSINATURA_INCOMPLETA',
      assinatura.origem.pageId
        ? 'A página de assinatura escolhida não tem a camada "headline" — sem a manchete não há peça.'
        : 'O projeto não tem página de assinatura (template "Assinatura", página com a tag "assinatura"). Sem ela o compositor não sabe a fonte, o tamanho nem a cor de cada papel.',
      422,
      { faltam },
    )
  }
  // Papel pedido que ESTA variante não tem (uma story sem pré-título, por
  // exemplo) sai da peça com aviso — a variante é um desenho, não um defeito.
  if (faltam.length > 0) {
    avisos.push(`A variante "${assinatura.origem.variante ?? ''}" não tem ${faltam.join(', ')}: esse texto ficou de fora.`)
    spec.blocos = spec.blocos.filter((b) => !faltam.includes(b.papel))
  }

  const geo = assinatura.numeros.geometria[spec.formato]
  const g: GeometriaDaPeca = { W: canvas.width, H: canvas.height, margemH: geo.margemH, safeTopo: geo.safeTopo, safeRodape: geo.safeRodape, gap: geo.gapEntreBlocos }
  const escalaDoFormato = assinatura.origem.formatoDaPagina === spec.formato ? 1 : geo.escalaDeFonte
  const mancha = assinatura.numeros.mancha

  await registerProjectFonts(spec.projectId)
  const medir = await createServerTextBoxMeasurer()

  // 1. Os blocos seguem o AGRUPAMENTO da página de assinatura (Ciro,
  //    03/09/2026: "não junte os agrupamentos"): papéis no mesmo grupo do
  //    editor formam UM bloco; o bloco que tem a manchete é o principal e o
  //    mapa da foto o posiciona; os outros ficam onde estão na página (topo
  //    ou rodapé) com o alinhamento de lá. Papel sem grupo é bloco sozinho;
  //    serviço sozinho vai ao rodapé (regra da casa).
  const colunaUtil = g.W - 2 * g.margemH
  const recusas: Array<{ papel: Papel; orcamento: unknown }> = []
  // A manchete com segunda voz vira DOIS papéis no mesmo grupo: as linhas de
  // cima na voz 1 e a última na voz 2 (o que o Quintal, o TERO e o By Rock
  // fazem à mão). Sem `headline2` na assinatura, nada muda.
  const blocosDaSpec = spec.blocos.flatMap((b) =>
    b.papel === 'headline' && assinatura.papeis.headline2 && b.linhas.length >= 2
      ? [
          { papel: 'headline' as Papel, linhas: b.linhas.slice(0, -1) },
          { papel: 'headline2' as Papel, linhas: b.linhas.slice(-1) },
        ]
      : [b as { papel: Papel; linhas: string[] }],
  )
  const chaveDoGrupo = (papel: Papel) => assinatura.papeis[papel]?.grupo ?? (papel === 'headline2' ? assinatura.papeis.headline?.grupo ?? 'solo:headline' : `solo:${papel}`)
  const montados: BlocoMontado[] = []
  for (const b of blocosDaSpec) {
    const estilo = assinatura.papeis[b.papel]!
    const r = montarBloco({
      papel: b.papel,
      linhas: b.linhas,
      estilo,
      escalaDoFormato,
      colunaUtil,
      textAlign: 'left',
      groupId: `grupo-${hashDe(chaveDoGrupo(b.papel)) % 99991}`,
      corDaMancha: mancha,
      medir,
    })
    if (r.recusa) {
      recusas.push({ papel: r.recusa.papel, orcamento: r.recusa.orcamento })
      continue
    }
    if (r.bloco.escala < 1) avisos.push(`${b.papel}: fonte reduzida a ${Math.round(r.bloco.escala * 100)}% para caber na coluna`)
    montados.push(r.bloco)
  }
  if (recusas.length > 0) {
    throw new CreativeError(
      'TEXTO_NAO_CABE_NA_COLUNA',
      `Linha maior que a coluna útil (${colunaUtil}px) mesmo a 80% da fonte: ${recusas.map((r) => r.papel).join(', ')}. Reescreva com o orçamento devolvido.`,
      422,
      { orcamento: recusas },
    )
  }
  if (montados.length === 0) throw new CreativeError('SPEC_INVALIDA', 'Nenhum bloco de texto', 400)

  interface BlocoComposto {
    chave: string
    blocos: BlocoMontado[]
    pilha: ReturnType<typeof empilhar>
    principal: boolean
    ancora: Ancora
    /** A âncora veio de uma caixa REAL da página (e não do default do papel). */
    temCaixa: boolean
    alinha: Alinhamento | null
  }
  const porGrupo = new Map<string, BlocoMontado[]>()
  for (const b of montados) {
    const chave = chaveDoGrupo(b.papel)
    porGrupo.set(chave, [...(porGrupo.get(chave) ?? []), b])
  }
  const compostos: BlocoComposto[] = [...porGrupo.entries()].map(([chave, blocos]) => {
    const papeis = blocos.map((b) => b.papel)
    const caixas = papeis.map((p) => assinatura.papeis[p]?.caixa).filter((c): c is NonNullable<typeof c> => !!c)
    const centro = caixas.length > 0 ? caixas.reduce((acc, c) => acc + (c.y + c.height / 2), 0) / caixas.length / canvas.height : null
    const soServico = papeis.every((p) => p === 'servico')
    const ancora: Ancora = soServico || centro === null ? (soServico ? 'rodape' : 'topo') : centro > 0.55 ? 'rodape' : centro < 0.45 ? 'topo' : 'meio'
    return {
      chave,
      blocos,
      pilha: empilhar(blocos, g.gap),
      principal: papeis.includes('headline'),
      ancora,
      temCaixa: caixas.length > 0,
      alinha: assinatura.papeis[papeis[0]]?.alinhamento ?? null,
    }
  })
  const principal = compostos.find((c) => c.principal) ?? compostos[0]
  const secundarios = compostos.filter((c) => c !== principal)
  const pilha = principal.pilha
  // Os blocos secundários reservam a própria altura na âncora deles, para o
  // principal não pousar em cima.
  const reservaNoRodape = secundarios.filter((c) => c.ancora === 'rodape').reduce((acc, c) => acc + c.pilha.height + Math.round(g.gap * 1.6), 0)
  const reservaNoTopo = secundarios.filter((c) => c.ancora === 'topo').reduce((acc, c) => acc + c.pilha.height + Math.round(g.gap * 1.6), 0)

  // 2. O mapa e o assunto — por corte candidato.
  const cortes = cortesCandidatos(foto, canvas, spec.preferencias?.enquadramento === 'fixo')
  const assuntoDoCatalogo = foto && spec.foto?.driveFileId ? await assuntoDoCatalogoDaFoto(spec.projectId, spec.foto.driveFileId) : null

  let melhor: { crop: CropPosition; raster: FotoCinza | null; mapa: MapaDeCalma | null; assunto: Rect | null; escolhido: PontuacaoDePosicao<RotuloDePosicao>; todos: PontuacaoDePosicao<RotuloDePosicao>[] } | null = null
  const cores = montados.map((b) => b.cor)
  for (const crop of cortes) {
    const raster = foto ? await lerFotoComoCover(foto.bytes, canvas, { cropPosition: crop }) : null
    const mapa = raster ? mapaDeCalma(raster) : null
    const assunto = assuntoDoCatalogo ? assuntoEmPixels(assuntoDoCatalogo, canvas) : mapa ? estimarAssunto(mapa) : null
    const candidatos = candidatosDePosicao(g, spec, pilha, crop, {
      reservaNoRodape,
      reservaNoTopo,
      alinhaDaAssinatura: principal.alinha ?? assinatura.alinhamento,
      ancoraDaPagina: principal.temCaixa ? principal.ancora : null,
    })
    const pontuados = mapa
      ? pontuarCandidatos({ mapa, candidatos, coresDoTexto: cores, corDaMancha: mancha, assunto })
      : candidatos.map((c) => ({ ...c, pontuacao: c.preferencia, calma: 1, tintaNecessaria: 0, cobreAssunto: 0, descartado: false, motivo: 'sem foto: vale a preferência' }))
    const escolhido = pontuados[0]
    if (!melhor || (escolhido && (Number(!escolhido.descartado) * 10 + escolhido.pontuacao) > (Number(!melhor.escolhido.descartado) * 10 + melhor.escolhido.pontuacao))) {
      melhor = { crop, raster, mapa, assunto, escolhido, todos: pontuados }
    }
  }
  if (!melhor) throw new CreativeError('SEM_POSICAO', 'Nenhuma posição candidata', 500)
  if (melhor.escolhido.descartado) avisos.push(`Toda posição cobre o assunto da foto; ficou a melhor delas (${melhor.escolhido.motivo}).`)

  const { ancora, alinha, crop } = melhor.escolhido.rotulo
  const rectPrincipal = melhor.escolhido.rect

  // 3. Posicionar cada bloco: o principal na caixa que o mapa escolheu; os
  //    secundários na âncora e no alinhamento que têm na página.
  const camadasDeTexto: Layer[] = []
  const rectsDeGrupo: Array<{ grupo: string; rect: Rect; cores: string[]; camadas: Layer[] }> = []
  const posicionar = (c: BlocoComposto, rect: Rect, alinhaDoBloco: Alinhamento) => {
    const textAlign = alinhamentoParaTextAlign(alinhaDoBloco)
    const camadas = c.blocos.map((b, i) => {
      const x = alinhaDoBloco === 'esquerda' ? rect.x : alinhaDoBloco === 'direita' ? rect.x + rect.width - b.width : rect.x + (rect.width - b.width) / 2
      const camada: Layer = { ...b.layer, position: { x: Math.round(x), y: Math.round(rect.y + c.pilha.offsets[i]) }, style: { ...b.layer.style, textAlign } }
      camadasDeTexto.push(camada)
      return camada
    })
    rectsDeGrupo.push({ grupo: c.chave, rect, cores: c.blocos.map((b) => b.cor), camadas })
  }
  posicionar(principal, rectPrincipal, alinha)
  let ocupadoNoRodape = 0
  let ocupadoNoTopo = 0
  for (const c of secundarios) {
    const al = c.alinha ?? alinha
    let rect = retanguloDoBloco(g, c.ancora, al, c.pilha.width, c.pilha.height)
    if (c.ancora === 'rodape') {
      rect = { ...rect, y: g.H - g.safeRodape - c.pilha.height - ocupadoNoRodape }
      ocupadoNoRodape += c.pilha.height + Math.round(g.gap * 1.6)
    } else if (c.ancora === 'topo') {
      rect = { ...rect, y: g.safeTopo + ocupadoNoTopo }
      ocupadoNoTopo += c.pilha.height + Math.round(g.gap * 1.6)
    }
    posicionar(c, rect, al)
  }

  // 4. O halo. Se a equipe ligou o fundo de texto em ALGUM papel da página de
  //    assinatura, a página é a verdade papel a papel (cor, ajuste, margem,
  //    desfoque; a opacidade dela é o teto e a foto modula dentro). O GRUPO
  //    da peça é o grupo da página — a mancha é a do líder, como no editor.
  //    Sem fundo em papel nenhum, vale a calibragem da casa na FAIXA da marca.
  const halos: DiagnosticoDaComposicao['halos'] = []
  const paginaDefineHalo = Object.values(assinatura.papeis).some((e) => e?.fundo)
  if (paginaDefineHalo) {
    for (const grupo of rectsDeGrupo) {
      const luz = melhor.raster ? luzNoRect(melhor.raster, grupo.rect) : null
      const calibrado = calibrarHalo({ texto: grupo.rect, luz: luz ?? { media: 0, p75: 0 }, coresDoTexto: grupo.cores, corDaMancha: mancha, raioBase: assinatura.numeros.halo.raioTexto })
      const necessidade = luz ? calibrado.tinta / 0.95 : 0
      for (const camada of grupo.camadas) {
        const papel = (camada.metadata as { compositor?: { papel?: Papel } })?.compositor?.papel
        const fundo = papel ? assinatura.papeis[papel]?.fundo : null
        if (!fundo) {
          camada.effects = { ...(camada.effects ?? {}), background: undefined }
          continue
        }
        // Ciro (03/09/2026): "pode manter a mesma configuração que a minha do
        // halo, não precisa ajustar de acordo com a luminosidade". A mancha
        // sai EXATAMENTE como está na página — cor, ajuste, margem, desfoque
        // e opacidade. A foto não modula nada; a régua só mede e avisa.
        const opacity = fundo.opacity
        camada.effects = {
          ...(camada.effects ?? {}),
          background: { enabled: true, ...fundo, baseColor: fundo.backgroundColor, tone: 0, opacity },
        }
        halos.push({ grupo: `${grupo.grupo}/${papel}`, tinta: opacity, raio: fundo.blur, luz: calibrado.luzMedida, alvo: calibrado.alvo, necessidade: Number(necessidade.toFixed(3)) })
      }
    }
  } else {
    for (const grupo of rectsDeGrupo) {
      const luz = melhor.raster ? luzNoRect(melhor.raster, grupo.rect) : null
      const calibrado = calibrarHalo({
        texto: grupo.rect,
        luz: luz ?? { media: 0, p75: 0 },
        coresDoTexto: grupo.cores,
        corDaMancha: mancha,
        raioBase: assinatura.numeros.halo.raioTexto,
      })
      const necessidade = luz ? calibrado.tinta / 0.95 : 0
      const tinta = luz ? tintaNaFaixa(necessidade, assinatura.numeros.halo.faixaTexto) : 0
      const raio = assinatura.numeros.halo.raioTexto
      for (const camada of grupo.camadas) {
        camada.effects = { ...(camada.effects ?? {}), ...(tinta > 0 ? { background: fundoDeHalo(mancha, tinta, raio) } : {}) }
      }
      halos.push({ grupo: grupo.grupo, tinta, raio, luz: calibrado.luzMedida, alvo: calibrado.alvo, necessidade: Number(necessidade.toFixed(3)) })
    }
  }

  // 5. A logo, no canto mais calmo e escuro que não encosta no texto.
  //
  // 🔴 A logo vai no TOPO da pilha, depois dos textos (ajuste do Ciro na
  // leva de setembro, 02/09/2026): o halo é desenhado pela camada de TEXTO,
  // com margem de ~170px além da tinta, e com a logo abaixo do texto na ordem
  // a mancha cobria a marca sempre que os dois ficavam perto. Só o halo da
  // marca (shape) fica embaixo de tudo.
  const haloDaMarca: Layer[] = []
  const camadasDaLogo: Layer[] = []
  let logoDiag: DiagnosticoDaComposicao['logo'] = null
  if (assinatura.logo && spec.preferencias?.cantoDaMarca !== 'nenhum') {
    const largura = Math.round(assinatura.logo.largura * (spec.formato === 'story' ? 1 : escalaDoFormato))
    const altura = Math.round(largura * assinatura.logo.razao)
    const canto = escolherCanto({
      g,
      mapa: melhor.mapa,
      blocos: rectsDeGrupo.map((r) => r.rect),
      logo: { w: largura, h: altura },
      pedido: spec.preferencias?.cantoDaMarca,
      formato: spec.formato,
    })
    if (canto) {
      const luz = melhor.raster ? luzNoRect(melhor.raster, canto.rect) : null
      const calibrado = calibrarHalo({ texto: canto.rect, luz: luz ?? { media: 0, p75: 0 }, coresDoTexto: ['#FFFFFF'], corDaMancha: mancha, raioBase: assinatura.numeros.halo.raioMarca })
      const tinta = luz ? tintaNaFaixa(calibrado.tinta / 0.95, assinatura.numeros.halo.faixaMarca) : 0
      const raio = assinatura.numeros.halo.raioMarca
      // A página não desenha halo na logo; só o modo calibrado pela casa põe um.
      if (tinta > 0 && !paginaDefineHalo) {
        const margem = Math.round(raio * 1.4)
        haloDaMarca.push({
          id: 'halo-marca',
          name: 'Halo da marca',
          type: 'shape',
          visible: true,
          locked: false,
          order: 0,
          position: { x: canto.rect.x - margem, y: canto.rect.y - margem },
          size: { width: largura + 2 * margem, height: altura + 2 * margem },
          rotation: 0,
          style: { shapeType: 'rectangle', fill: mancha, fillOpacity: tinta, strokeWidth: 0, border: { width: 0, color: mancha, radius: Math.min(raio + 40, Math.floor((altura + 2 * margem) / 2)) } },
          effects: { blur: { enabled: true, blurRadius: raio } },
          metadata: { halo: { tinta, raio, alvo: calibrado.alvo, luzMedida: calibrado.luzMedida, papel: 'marca' } },
        })
      }
      camadasDaLogo.push({
        id: 'logo',
        name: 'Logo',
        type: 'logo',
        visible: true,
        locked: false,
        order: 0,
        position: { x: canto.rect.x, y: canto.rect.y },
        size: { width: largura, height: altura },
        rotation: 0,
        fileUrl: assinatura.logo.url,
        style: { objectFit: 'contain' },
        metadata: { compositor: { canto: canto.canto } },
      })
      logoDiag = { canto: canto.canto, tinta }
    }
  }

  // 6. O fundo.
  const fundo: Layer[] = foto
    ? [
        {
          id: 'bg-foto',
          name: 'Foto de fundo',
          type: 'image',
          visible: true,
          locked: false,
          order: 0,
          isDynamic: true,
          position: { x: 0, y: 0 },
          size: { width: canvas.width, height: canvas.height },
          rotation: 0,
          fileUrl: foto.url,
          style: { objectFit: 'cover', cropPosition: crop },
        },
      ]
    : []

  // 7. Contrato + autofix geométrico (colisão, transbordo, safe area).
  const normalizado = normalizarCamadas([...fundo, ...haloDaMarca, ...camadasDeTexto, ...camadasDaLogo])
  const fix = await aplicarAutofixOuFalhar({
    projectId: spec.projectId,
    layers: normalizado.camadas,
    canvas,
    changedLayerIds: camadasDeTexto.map((c) => c.id),
  })
  avisos.push(...fix.avisos)
  let layers = fix.layers as Layer[]

  // 8. A régua (F2): o p98 real sob cada bloco na peça renderizada — corrige a
  //    tinta uma vez dentro da faixa e AVISA quando a foto não carrega o texto.
  let contraste: ContrasteMedido[] | null = null
  try {
    const regua = await medirContrasteDaPeca({ layers, canvas, background: assinatura.numeros.fundo, faixa: assinatura.numeros.halo.faixaTexto, corrigir: !paginaDefineHalo })
    layers = regua.layers
    contraste = regua.medidas
    avisos.push(...regua.avisos)
  } catch (erro) {
    avisos.push(`A régua de contraste não rodou: ${(erro as Error).message}`)
  }

  const diagnostico: DiagnosticoDaComposicao = {
    formato: spec.formato,
    posicao: { ancora, alinha, crop, pontuacao: Number(melhor.escolhido.pontuacao.toFixed(3)), motivo: melhor.escolhido.motivo },
    candidatos: melhor.todos.map((c) => ({ ...c.rotulo, pontuacao: Number(c.pontuacao.toFixed(3)), descartado: c.descartado, motivo: c.motivo })),
    assunto: melhor.assunto,
    assuntoOrigem: assuntoDoCatalogo ? 'catalogo' : melhor.assunto ? 'estimado' : 'nenhum',
    halos,
    logo: logoDiag,
    blocos: montados.map((b) => ({ papel: b.papel, escala: b.escala, width: b.width, height: b.height })),
    contraste,
    assinatura: assinatura.origem,
    avisos,
  }

  // 9. Provar ou persistir.
  if (opcoes.provar) {
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    const renderer = new CanvasRenderer(canvas.width, canvas.height)
    const png = await renderer.renderDesign({ canvas: { ...canvas, backgroundColor: assinatura.numeros.fundo }, layers }, {})
    return { persistido: null, prova: png, layers, diagnostico }
  }

  // A pasta é a SEMANA da data prevista (ou as avulsas do mês) NO FORMATO da
  // peça — regra de 03/09/2026, separada por formato em 04/09: a aba organiza
  // por quando publica, e story e feed não se misturam porque a aprovação de
  // cada frente corre separada. A ordem é a de POSTAGEM, com o slide
  // desempatando o mesmo minuto; o nome leva a data e o slide, senão os
  // irmãos de um carrossel saem com nomes idênticos.
  const pasta = await garantirPasta(spec.projectId, projeto.userId, spec.quando ?? null, spec.formato)
  const { ordem, repeticao } = await ordemNaPasta(pasta.id, spec.quando ?? null, spec.carrossel?.slide ?? null)
  const nome = nomeDaPagina({
    quando: spec.quando ?? null,
    tema: spec.tema ?? null,
    nome: spec.nome ?? spec.blocos[0]?.linhas[0] ?? null,
    carrossel: spec.carrossel ?? null,
    // Quem não declarou o slide ganha ao menos um nome próprio: sem isto, os
    // quatro irmãos de um carrossel saem com o nome IDÊNTICO na pasta (foi o
    // que uma leva real fez em 04/09/2026). "peça" e não "slide" de propósito:
    // é a ordem em que foi composta, não a posição no Instagram.
    ...(spec.carrossel ? {} : { peca: repeticao > 0 ? repeticao + 1 : null }),
  })
  // A entrada do persist é montada num módulo PURO (`persistencia.ts`): é lá
  // que mora a regra de que a Generation da FILA (`opcoes.generationId`) é
  // FECHADA em vez de nascer outra — o defeito de 04/09/2026 (Espeto).
  const persistido = await persistAndRenderCreative(
    entradaDePersistencia({
      spec,
      opcoes,
      projeto,
      pasta,
      nome,
      ordem,
      canvas,
      layers,
      fundo: assinatura.numeros.fundo,
      diagnostico,
      fotoUrl: foto?.url ?? null,
    }),
  )

  if (spec.foto?.driveFileId) {
    await registrarUsoDeFoto({
      projectId: spec.projectId,
      driveFileIds: [spec.foto.driveFileId],
      origem: 'compositor',
      tema: spec.tema ?? null,
      generationId: persistido.generationId,
    })
  }

  return { persistido, prova: null, layers, diagnostico }
}

// ─── Assunto pelo catálogo ─────────────────────────────────────────────────

interface AssuntoNormalizado {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A caixa do assunto gravada no catálogo (frações 0..1), quando a análise a deu. */
async function assuntoDoCatalogoDaFoto(projectId: number, driveFileId: string): Promise<AssuntoNormalizado | null> {
  try {
    const { lerCatalogoDoProjeto } = await import('@/lib/creatives/acervo')
    const catalogo = await lerCatalogoDoProjeto(projectId)
    const entrada = catalogo?.todas?.find((i) => i.driveFileId === driveFileId) as unknown as (Record<string, unknown> | undefined)
    const a = entrada?.assunto as Partial<AssuntoNormalizado> | undefined
    if (!a || [a.x0, a.y0, a.x1, a.y1].some((v) => typeof v !== 'number')) return null
    return { x0: a.x0!, y0: a.y0!, x1: a.x1!, y1: a.y1! }
  } catch {
    return null
  }
}

/**
 * Do catálogo o assunto vem em frações da FOTO ORIGINAL; a peça mostra um
 * corte dela. A conversão para px da peça é aproximada (assume o corte
 * central) — o suficiente para descartar candidato que pousa em cima do prato.
 */
function assuntoEmPixels(a: AssuntoNormalizado, canvas: { width: number; height: number }): Rect {
  return { x: a.x0 * canvas.width, y: a.y0 * canvas.height, width: (a.x1 - a.x0) * canvas.width, height: (a.y1 - a.y0) * canvas.height }
}
