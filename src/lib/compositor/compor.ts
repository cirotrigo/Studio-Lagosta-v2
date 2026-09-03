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

import { garantirPasta } from './pastas'
import { nomeDaPagina } from './pasta-da-semana'

import {
  completarComStory,
  escolherVariante,
  formatoDaPagina,
  montarAssinatura,
  papeisQueFaltam,
  NOME_DO_TEMPLATE_DE_ASSINATURA,
  TAG_DA_ASSINATURA,
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
import { medirContrasteDaPeca, type ContrasteMedido } from './regua'

export const TAG_DA_PECA_COMPOSTA = 'compositor'

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
  /** Luz média da foto (0..255) — escolhe entre variantes `clara`/`escura`. */
  luzDaFoto?: number | null
  /** Chave da peça para o rodízio entre variantes. */
  chave?: string
}

/** Todas as páginas de assinatura do projeto, com o formato que cada uma declara. */
export async function paginasDeAssinatura(projectId: number) {
  const template = await db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } })
  if (!template) return { templateId: null as number | null, paginas: [] as Array<{ id: string; name: string; tags: string[]; width: number; height: number; formato: Formato | null }> }
  const paginas = await db.page.findMany({
    where: { templateId: template.id, isTemplate: true, tags: { has: TAG_DA_ASSINATURA } },
    select: { id: true, name: true, tags: true, width: true, height: true },
    orderBy: { order: 'asc' },
  })
  return { templateId: template.id, paginas: paginas.map((p) => ({ ...p, formato: formatoDaPagina(p) })) }
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
        where: { templateId: template.id, isTemplate: true, tags: { has: TAG_DA_ASSINATURA } },
        select: { id: true, name: true, width: true, height: true, layers: true, background: true, tags: true },
      })
    : []

  const { parsePageLayers } = await import('@/lib/posts/page-layers')
  const { pagina: escolhida, formatoDaPagina: fmt } = escolherVariante(paginas, {
    formato,
    variante: opcoes.variante ?? null,
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
  // Feed/quadrado montado só com o que muda: o que falta vem da página de story.
  if (fmt && fmt !== 'story' && fmt === formato) {
    const story = escolherVariante(paginas, { formato: 'story', chave: opcoes.chave ?? '' }).pagina
    if (story && story.id !== escolhida?.id) {
      return completarComStory(assinatura, montar(story, 'story'), assinatura.numeros.geometria[formato].escalaDeFonte)
    }
  }
  return assinatura
}

/** O projeto tem página de assinatura? É o que decide a via `compor` na proposta da semana. */
export async function projetoTemAssinatura(projectId: number): Promise<boolean> {
  const template = await db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } })
  if (!template) return false
  const n = await db.page.count({ where: { templateId: template.id, isTemplate: true, tags: { has: TAG_DA_ASSINATURA } } })
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
  extra: { reservaNoRodape?: number; alinhaDaAssinatura?: Alinhamento | null } = {},
): CandidatoDePosicao<RotuloDePosicao>[] {
  const pref = spec.preferencias ?? {}
  const rodizio = { ...preferenciaDoRodizio(spec), ...(extra.alinhaDaAssinatura ? { alinha: extra.alinhaDaAssinatura } : {}) }
  const ancoras: Ancora[] = pref.ancora && pref.ancora !== 'auto' ? [pref.ancora] : ['topo', 'meio', 'rodape']
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
      const reserva = ancora === 'rodape' ? extra.reservaNoRodape ?? 0 : 0
      const rect = retanguloDoBloco(g, ancora, alinha, bloco.width, bloco.height + reserva)
      saida.push({ rect: { ...rect, height: bloco.height }, preferencia, rotulo: { ancora, alinha, crop } })
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
  const todos: Canto[] = ['inferior-esquerdo', 'inferior-direito', 'superior-direito', 'superior-esquerdo']
  const candidatos: Canto[] = args.pedido && args.pedido !== 'auto' ? [args.pedido] : todos
  const livres = candidatos
    .map((canto) => ({ canto, rect: retanguloDoCanto(args.g, canto, args.logo.w, args.logo.h) }))
    .filter((c) => !args.blocos.some((b) => intersecta(b, c.rect)))
  const lista = livres.length > 0 ? livres : candidatos.map((canto) => ({ canto, rect: retanguloDoCanto(args.g, canto, args.logo.w, args.logo.h) }))
  const pontuados = lista.map((c) => {
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
    luzDaFoto,
    chave: `${spec.nome ?? ''}|${spec.tema ?? ''}|${spec.foto?.driveFileId ?? spec.foto?.url ?? ''}|${spec.blocos[0]?.linhas.join(' ') ?? ''}`,
  })
  const faltam = papeisQueFaltam(assinatura, spec.blocos.map((b) => b.papel))
  if (!assinatura.origem.pageId || faltam.length > 0) {
    throw new CreativeError(
      'ASSINATURA_INCOMPLETA',
      assinatura.origem.pageId
        ? `A página de assinatura do projeto não tem os papéis: ${faltam.join(', ')}. Adicione camadas de texto com esses nomes e o estilo da marca.`
        : 'O projeto não tem página de assinatura (template "Assinatura", página com a tag "assinatura"). Sem ela o compositor não sabe a fonte, o tamanho nem a cor de cada papel.',
      422,
      { faltam },
    )
  }

  const geo = assinatura.numeros.geometria[spec.formato]
  const g: GeometriaDaPeca = { W: canvas.width, H: canvas.height, margemH: geo.margemH, safeTopo: geo.safeTopo, safeRodape: geo.safeRodape, gap: geo.gapEntreBlocos }
  const escalaDoFormato = assinatura.origem.formatoDaPagina === spec.formato ? 1 : geo.escalaDeFonte
  const mancha = assinatura.numeros.mancha

  await registerProjectFonts(spec.projectId)
  const medir = await createServerTextBoxMeasurer()

  // 1. Os blocos, medidos. Serviço vive no rodapé (regra da casa) — em grupo próprio.
  const colunaUtil = g.W - 2 * g.margemH
  const principais: BlocoMontado[] = []
  let servico: BlocoMontado | null = null
  const recusas: Array<{ papel: Papel; orcamento: unknown }> = []
  for (const b of spec.blocos) {
    const estilo = assinatura.papeis[b.papel]!
    const r = montarBloco({
      papel: b.papel,
      linhas: b.linhas,
      estilo,
      escalaDoFormato,
      colunaUtil,
      textAlign: 'left',
      groupId: b.papel === 'servico' ? 'bloco-servico' : 'bloco-principal',
      corDaMancha: mancha,
      medir,
    })
    if (r.recusa) {
      recusas.push({ papel: r.recusa.papel, orcamento: r.recusa.orcamento })
      continue
    }
    if (r.bloco.escala < 1) avisos.push(`${b.papel}: fonte reduzida a ${Math.round(r.bloco.escala * 100)}% para caber na coluna`)
    if (b.papel === 'servico') servico = r.bloco
    else principais.push(r.bloco)
  }
  if (recusas.length > 0) {
    throw new CreativeError(
      'TEXTO_NAO_CABE_NA_COLUNA',
      `Linha maior que a coluna útil (${colunaUtil}px) mesmo a 80% da fonte: ${recusas.map((r) => r.papel).join(', ')}. Reescreva com o orçamento devolvido.`,
      422,
      { orcamento: recusas },
    )
  }
  if (principais.length === 0 && !servico) throw new CreativeError('SPEC_INVALIDA', 'Nenhum bloco de texto', 400)

  const pilha = empilhar(principais, g.gap)
  // O serviço vive no rodapé: quando o bloco principal também vai para lá, o
  // candidato precisa da altura dos dois, senão um pousa em cima do outro.
  const reservaNoRodape = servico ? servico.height + Math.round(g.gap * 1.6) : 0

  // 2. O mapa e o assunto — por corte candidato.
  const cortes = cortesCandidatos(foto, canvas, spec.preferencias?.enquadramento === 'fixo')
  const assuntoDoCatalogo = foto && spec.foto?.driveFileId ? await assuntoDoCatalogoDaFoto(spec.projectId, spec.foto.driveFileId) : null

  let melhor: { crop: CropPosition; raster: FotoCinza | null; mapa: MapaDeCalma | null; assunto: Rect | null; escolhido: PontuacaoDePosicao<RotuloDePosicao>; todos: PontuacaoDePosicao<RotuloDePosicao>[] } | null = null
  const cores = [...principais.map((b) => b.cor), ...(servico ? [servico.cor] : [])]
  for (const crop of cortes) {
    const raster = foto ? await lerFotoComoCover(foto.bytes, canvas, { cropPosition: crop }) : null
    const mapa = raster ? mapaDeCalma(raster) : null
    const assunto = assuntoDoCatalogo ? assuntoEmPixels(assuntoDoCatalogo, canvas) : mapa ? estimarAssunto(mapa) : null
    const candidatos = candidatosDePosicao(g, spec, pilha, crop, { reservaNoRodape, alinhaDaAssinatura: assinatura.alinhamento })
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
  const textAlign = alinhamentoParaTextAlign(alinha)
  const rectPrincipal = melhor.escolhido.rect

  // 3. Posicionar as camadas de texto dentro da caixa escolhida.
  const camadasDeTexto: Layer[] = principais.map((b, i) => {
    const x = alinha === 'esquerda' ? rectPrincipal.x : alinha === 'direita' ? rectPrincipal.x + rectPrincipal.width - b.width : rectPrincipal.x + (rectPrincipal.width - b.width) / 2
    return {
      ...b.layer,
      position: { x: Math.round(x), y: Math.round(rectPrincipal.y + pilha.offsets[i]) },
      style: { ...b.layer.style, textAlign },
    }
  })
  const rectsDeGrupo: Array<{ grupo: string; rect: Rect; cores: string[]; camadas: Layer[] }> = [
    { grupo: 'bloco-principal', rect: rectPrincipal, cores: principais.map((b) => b.cor), camadas: [...camadasDeTexto] },
  ]
  if (servico) {
    // Serviço sempre no rodapé. Com o bloco principal também no rodapé, o
    // candidato já reservou a altura do serviço (ver `reservaNoRodape`): o
    // serviço pousa no fim do retângulo e o principal fica acima dele.
    const rectServico = retanguloDoBloco(g, 'rodape', alinha, servico.width, servico.height)
    const camada: Layer = { ...servico.layer, position: { x: rectServico.x, y: rectServico.y }, style: { ...servico.layer.style, textAlign } }
    camadasDeTexto.push(camada)
    rectsDeGrupo.push({ grupo: 'bloco-servico', rect: rectServico, cores: [servico.cor], camadas: [camada] })
  }

  // 4. O halo. Se a equipe ligou o fundo de texto em ALGUM papel da página de
  //    assinatura, a página é a verdade papel a papel (cor, ajuste, margem,
  //    desfoque; a opacidade dela é o teto e a foto modula dentro, quando a
  //    mancha é escura e o ajuste é `texto`). Papéis com fundo IGUAL dividem
  //    uma mancha (mesmo grupo); diferentes desenham a sua. Sem fundo em
  //    papel nenhum, vale a calibragem da casa na FAIXA da marca.
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
          camada.metadata = { ...(camada.metadata ?? {}), groupId: `sem-halo-${camada.id}` }
          continue
        }
        const escura = luzDaCor(fundo.backgroundColor) < 128
        const modula = escura && fundo.fit === 'texto' && luz !== null
        const piso = Math.min(fundo.opacity, assinatura.numeros.halo.faixaTexto[0])
        const opacity = modula ? Number((piso + necessidade * (fundo.opacity - piso)).toFixed(3)) : fundo.opacity
        camada.effects = {
          ...(camada.effects ?? {}),
          background: { enabled: true, ...fundo, baseColor: fundo.backgroundColor, tone: 0, opacity },
        }
        // Grupo = mesma configuração de fundo (a mancha do grupo é a do líder).
        const assinaturaDoFundo = `${fundo.backgroundColor}|${fundo.fit}|${fundo.padding}|${fundo.blur}|${fundo.borderRadius}|${modula ? 'm' : fundo.opacity}`
        camada.metadata = { ...(camada.metadata ?? {}), groupId: `${grupo.grupo}-${hashDe(assinaturaDoFundo) % 9973}` }
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
      if (tinta > 0) {
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
        style: { objectFit: 'contain', shadow: { color: mancha, blur: 12, offsetX: 0, offsetY: 2 } },
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
    const regua = await medirContrasteDaPeca({ layers, canvas, background: assinatura.numeros.fundo, faixa: assinatura.numeros.halo.faixaTexto })
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
    blocos: [...principais, ...(servico ? [servico] : [])].map((b) => ({ papel: b.papel, escala: b.escala, width: b.width, height: b.height })),
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

  // A pasta é a SEMANA da data prevista (ou as avulsas do mês) — regra de
  // 03/09/2026: a aba organiza por quando publica, não por quem criou.
  const pasta = await garantirPasta(spec.projectId, projeto.userId, spec.quando ?? null)
  const nome = nomeDaPagina({ quando: spec.quando ?? null, formato: spec.formato, tema: spec.tema ?? null, nome: spec.nome ?? spec.blocos[0]?.linhas[0] ?? null })
  const persistido = await persistAndRenderCreative({
    project: projeto,
    templateId: pasta.id,
    templateName: pasta.name,
    pageName: nome,
    width: canvas.width,
    height: canvas.height,
    layers,
    background: assinatura.numeros.fundo,
    authorName: 'compositor',
    canal: opcoes.canal ?? null,
    pageTags: [TAG_DA_PECA_COMPOSTA, spec.formato],
    fieldValues: {
      source: 'compositor',
      spec,
      composicao: diagnostico,
      // F4: o snapshot das camadas como nasceram — é o "git" de uma peça.
      layersSnapshot: layers,
      ...(spec.foto?.driveFileId ? { driveImageId: spec.foto.driveFileId } : {}),
      imageUrl: foto?.url ?? null,
      ...(spec.itemDePlanoId ? { itemDePlanoId: spec.itemDePlanoId } : {}),
      ...(spec.planoId ? { planoId: spec.planoId } : {}),
      ...(opcoes.generationId ? { generationIdDaFila: opcoes.generationId } : {}),
    },
  })

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
