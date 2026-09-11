/**
 * O COMPOSITOR — a usina de arte do editor (F1 do plano editor-como-usina).
 *
 * Recebe uma spec (copy por papel e por linha, foto, formato, preferências),
 * lê a assinatura da marca (página + números), MEDE cada linha com a fonte
 * real, acha a área livre da foto (mapa de calma + assunto), escolhe o
 * enquadramento e a posição, destaca as palavras marcadas com [colchetes],
 * desenha o gradiente de leitura na borda onde o texto pousou (sem halo desde
 * 11/09/2026), põe a logo no canto pela luz, passa pelo autofix geométrico e
 * persiste como página EDITÁVEL —
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
import { calibrarHalo, uniao, type Rect } from '@/lib/creatives/halo/halo'
import { gradientesDoProjeto } from '@/lib/assets/gradients-library'
import type { CropPosition } from '@/lib/image-crop-utils'
import { registrarUsoDeFoto } from '@/lib/creatives/uso-de-foto'
import { blocosDeServico } from '@/lib/ai/blocos-de-servico'

import { avaliarCombinacao, type DiagnosticoDaSelecao } from './selecionar-combinacao'
import { lerCaixaDoAssunto, assuntoEmPixels, fracaoVisivelDoAssunto, type AssuntoNormalizado } from './assunto-da-foto'
import { garantirPasta, ordemNaPasta } from './pastas'
import { entradaDePersistencia } from './persistencia'
import { avisoDeMinutoOcupado, nomeDaPagina } from './pasta-da-semana'

import {
  escolherVariante,
  formatoDaPagina,
  montarAssinatura,
  papelDoNome,
  papeisQueFaltam,
  NOME_DO_TEMPLATE_DE_ASSINATURA,
  type AssinaturaDaMarca,
  type EstiloDePapel,
  type NumerosDaAssinatura,
} from './assinatura'
import { montarBloco, empilhar, type BlocoMontado } from './blocos'
import {
  arranjoDaCombinacao,
  arranjosDaPagina,
  camadasDosElementos,
  distribuirLinhas,
  escolherArranjo,
  type ArranjoDeGrupo,
  type ElementoDoArranjo,
} from './combinacoes'
import type { FontComboElement } from '@/lib/font-combinations'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import {
  estimarAssunto,
  lerMapaSob,
  mapaDeCalma,
  pontuarCandidatos,
  type CandidatoDePosicao,
  type MapaDeCalma,
  type PontuacaoDePosicao,
} from './mapa-de-calma'
import { destaqueDoPapel, semColchetes, type EstiloDeDestaque } from './destaques'
import {
  bordaDaCamadaDeGradiente,
  bordaDoGrupo,
  configDaCamada,
  corQueContrasta,
  type AjustesDoGradiente,
  inserirAcimaDaFoto,
  montarGradientes,
  type Borda,
  type ConfigDoGradiente,
  type GrupoParaGradiente,
} from './gradiente-de-leitura'
import { DIMENSOES, validarSpec, type Alinhamento, type Ancora, type Canto, type Formato, type Papel, type SpecDePeca } from './spec'
import { alvoClaroPorContraste, medirContrasteDaPeca, type ContrasteMedido, type IntervencaoDeTexto } from './regua'

export { TAG_DA_PECA_COMPOSTA } from './persistencia'

export interface RotuloDePosicao {
  ancora: Ancora
  alinha: Alinhamento
  crop: CropPosition
}

export interface DiagnosticoDaComposicao {
  selecao?: DiagnosticoDaSelecao
  intervencaoDeTexto?: IntervencaoDeTexto
  /** Sempre 'gradiente-de-leitura' desde 11/09/2026 (diagnósticos antigos podem trazer 'gradiente-suave-topo'). */
  tratamentoDeTexto?: 'gradiente-de-leitura' | 'gradiente-suave-topo'
  formato: Formato
  posicao: RotuloDePosicao & { pontuacao: number; motivo: string }
  candidatos: Array<RotuloDePosicao & { pontuacao: number; descartado: boolean; motivo: string }>
  assunto: Rect | null
  assuntoOrigem: 'catalogo' | 'estimado' | 'nenhum'
  /** LEGADO — sempre vazio desde 11/09/2026: o compositor não desenha mais halo. */
  halos: Array<{ grupo: string; tinta: number; raio: number; luz: number; alvo: number; necessidade: number }>
  /** Um gradiente de leitura por borda com texto, com a força FINAL (depois da régua). Ausente em diagnósticos antigos. */
  gradientes?: Array<{ borda: Borda; forca: number; altura: number; cor: string; necessidade: number }>
  /** `tinta` é legado (sempre 0): a logo não ganha mais halo. */
  logo: { canto: Canto; tinta: number } | null
  blocos: Array<{ papel: Papel; escala: number; width: number; height: number; destacado?: boolean }>
  /** O arranjo de texto usado em cada grupo: o da página ou uma combinação salva. Ausente em diagnósticos antigos. */
  arranjos?: Array<{ grupo: string; id: string; nome: string; origem: ArranjoDeGrupo['origem']; motivo: string }>
  contraste: ContrasteMedido[] | null
  assinatura: AssinaturaDaMarca['origem']
  avisos: string[]
}

export interface OpcoesDeComposicao {
  /** Interno: mede e monta camadas sem persistir nem exportar prova. */
  somenteAvaliar?: boolean
  medirComparacao?: boolean
  selecao?: DiagnosticoDaSelecao
  avisosDaSelecao?: string[]
  /** Cache local à seleção: evita baixar/decodificar a mesma foto por variante. */
  assuntosDoCatalogo?: Map<string, AssuntoNormalizado | null>
  cacheDeFotos?: Map<string, Awaited<ReturnType<typeof carregarFoto>>>
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
  /**
   * Páginas (ids) que fazem as vezes da assinatura, no lugar do template
   * "Assinatura" — para PROVAR páginas em espera antes de a usina usá-las
   * (`scripts/provar-combinacoes-no-compositor.ts`). Nunca em produção.
   */
  paginasDeAssinatura?: string[]
}

export interface ResultadoDaComposicao {
  persistido: PersistCreativeResult | null
  prova: Buffer | null
  layers: Layer[]
  diagnostico: DiagnosticoDaComposicao
}

// ─── Assinatura ────────────────────────────────────────────────────────────

export interface OpcoesDeAssinatura {
  /** Páginas (ids) no lugar do template "Assinatura" — ver `OpcoesDeComposicao.paginasDeAssinatura`. */
  paginas?: string[]
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
      papeis: [...new Set((parsePageLayers(layers) as unknown as Layer[]).filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false).map((c) => papelDoNome(c.name) ?? papelDoNome(c.id)).filter((x): x is Papel => !!x))],
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

  const paginas = opcoes.paginas?.length
    ? await db.page.findMany({
        where: { id: { in: opcoes.paginas }, Template: { projectId } },
        select: { id: true, name: true, width: true, height: true, layers: true, background: true, tags: true },
        orderBy: { order: 'asc' },
      })
    : template
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
    papeis: [...new Set((parsePageLayers(p.layers) as unknown as Layer[]).filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false).map((c) => papelDoNome(c.name) ?? papelDoNome(c.id)).filter((x): x is Papel => !!x))],
  }))
  const { pagina: escolhida, formatoDaPagina: fmt, motivo } = escolherVariante(comPapeis, {
    formato,
    variante: opcoes.variante ?? null,
    papeis: opcoes.papeis,
    tema: opcoes.tema ?? null,
    luzDaFoto: opcoes.luzDaFoto ?? null,
    chave: opcoes.chave ?? '',
  })

  if (opcoes.variante && !escolhida) {
    throw new CreativeError('ASSINATURA_INCOMPLETA',
      `A variante solicitada "${opcoes.variante}" não foi encontrada entre as assinaturas disponíveis para ${formato}. Consulte ver-assinatura e escolha uma variante existente.`,
      422, { variante: opcoes.variante, formato })
  }

  const montar = (p: (typeof paginas)[number] | null, f: Formato | null) =>
    montarAssinatura({
      pagina: p ? { id: p.id, name: p.name, tags: p.tags, width: p.width, height: p.height, background: p.background, layers: parsePageLayers(p.layers) as unknown as Layer[] } : null,
      formatoDaPagina: f,
      numerosDoProjeto: projeto.assinatura,
      logoDoProjeto: projeto.Logo[0] ? { url: projeto.Logo[0].fileUrl } : null,
    })
  const assinatura = montar(escolhida, fmt)
  assinatura.origem.motivoDaVariante = motivo
  // As camadas da página escolhida: é delas que saem os arranjos de texto
  // (os grupos, com os elementos presos a cada texto) que a peça usa.
  assinatura.camadasDaPagina = escolhida ? (parsePageLayers(escolhida.layers) as unknown as Layer[]) : []
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

function retanguloDoBloco(g: GeometriaDaPeca, ancora: Ancora, alinha: Alinhamento, w: number, h: number, margem = g.margemH): Rect {
  const x = alinha === 'esquerda' ? margem : alinha === 'direita' ? g.W - margem - w : (g.W - w) / 2
  const y = ancora === 'topo' ? g.safeTopo : ancora === 'rodape' ? g.H - g.safeRodape - h : (g.H - h) / 2
  return { x: Math.round(x), y: Math.round(Math.max(g.safeTopo, Math.min(y, g.H - g.safeRodape - h))), width: w, height: h }
}

function candidatosDePosicao(
  g: GeometriaDaPeca,
  spec: SpecDePeca,
  bloco: { width: number; height: number },
  crop: CropPosition,
  extra: {
    reservaNoRodape?: number
    reservaNoTopo?: number
    alinhaDaAssinatura?: Alinhamento | null
    ancoraDaPagina?: Ancora | null
    /** A margem lateral do bloco em cada alinhamento — a do grupo na página. */
    margemPara?: (alinha: Alinhamento) => number | undefined
  } = {},
): CandidatoDePosicao<RotuloDePosicao>[] {
  const pref = spec.preferencias ?? {}
  // A posição que a PÁGINA desenhou é a preferência; o sorteio só completa o
  // que ela não diz. Até 11/09/2026 só o alinhamento vinha da página e a âncora
  // seguia sorteada — e como a preferência pede as duas, o lado do modelo
  // valia 0,30 como qualquer outro: o Almoço executivo do Quintal e o do TERO,
  // alinhados à esquerda nos modelos, saíam à direita por 0,01 a 0,03 de calma.
  const sorteada = preferenciaDoRodizio(spec)
  const rodizio = { ancora: extra.ancoraDaPagina ?? sorteada.ancora, alinha: extra.alinhaDaAssinatura ?? sorteada.alinha }
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

// ─── Destaque ──────────────────────────────────────────────────────────────

/** As famílias de fonte cadastradas no projeto — de onde sai a versão mais pesada do destaque. */
async function familiasDoProjeto(projectId: number): Promise<string[]> {
  try {
    const fontes = await db.customFont.findMany({ where: { projectId }, select: { fontFamily: true } })
    return [...new Set(fontes.map((f) => f.fontFamily))]
  } catch {
    return []
  }
}

/**
 * O estilo do destaque de um papel. A página de assinatura manda (a equipe
 * destacou um trecho lá); sem ela, `Project.assinatura.destaque` — a cor da
 * paleta e, com `pesado`, a versão mais pesada da família DAQUELE papel entre
 * as fontes cadastradas (manchete e apoio costumam ter famílias diferentes).
 */
function estiloDeDestaqueDoPapel(estilo: EstiloDePapel, padrao: NumerosDaAssinatura['destaque'], familias: string[]): EstiloDeDestaque | null {
  // A regra (página manda; família pesada DO papel; alternativa quando o papel
  // já é da cor de destaque) mora no módulo puro, com teste.
  return destaqueDoPapel({ daPagina: estilo.destaque, padrao, corDoPapel: estilo.color, familiaDoPapel: estilo.fontFamily, familias })
}

// ─── A composição ──────────────────────────────────────────────────────────

/**
 * As combinações salvas do projeto que servem à usina (todo texto com papel),
 * já como arranjos. Falha de leitura vira lista vazia: a peça sai com os grupos
 * da página de assinatura, como antes.
 */
async function arranjosDasCombinacoes(projectId: number, medir: MeasureTextBox): Promise<ArranjoDeGrupo[]> {
  try {
    const [projeto, combinacoes] = await Promise.all([
      db.project.findUnique({ where: { id: projectId }, select: { titleFontFamily: true, bodyFontFamily: true, subtitleFontFamily: true } }),
      db.fontCombination.findMany({ where: { projectId }, select: { id: true, name: true, elements: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    ])
    // Sem o par de fontes da marca, o texto sem família própria sairia na fonte padrão
    if (!projeto?.titleFontFamily || !projeto.bodyFontFamily) return []
    const pair = { title: projeto.titleFontFamily, body: projeto.bodyFontFamily, subtitle: projeto.subtitleFontFamily }
    return combinacoes
      .map((c) => arranjoDaCombinacao({ combinacao: { id: c.id, name: c.name, elements: c.elements as unknown as FontComboElement[] }, pair, medir }))
      .filter((a): a is ArranjoDeGrupo => a !== null)
  } catch {
    return []
  }
}

export async function comporPeca(entrada: unknown, opcoes: OpcoesDeComposicao = {}): Promise<ResultadoDaComposicao> {
  const v = validarSpec(entrada)
  if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400, { problemas: v.problemas })
  if (v.spec.selecaoExperimental === true && !opcoes.somenteAvaliar) {
    const { selecionarCombinacao } = await import('./selecionar-combinacao')
    const selecao = await selecionarCombinacao(v.spec)
    return comporPeca(selecao.spec, { ...opcoes, selecao: selecao.diagnostico, avisosDaSelecao: selecao.avisos, cacheDeFotos: selecao.cacheDeFotos, assuntosDoCatalogo: selecao.assuntosDoCatalogo })
  }
  const spec = v.spec
  const avisos: string[] = [...(opcoes.avisosDaSelecao ?? [])]

  const projeto = await db.project.findUnique({ where: { id: spec.projectId }, select: { id: true, name: true, userId: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${spec.projectId} não encontrado`, 404)

  // A foto vem ANTES da assinatura: a luz média dela escolhe entre variantes
  // `clara`/`escura`, e a chave da peça faz o rodízio entre as demais.
  const chaveDaFoto = JSON.stringify(spec.foto ?? {})
  const fotoCarregada = opcoes.cacheDeFotos?.get(chaveDaFoto) ?? await carregarFoto(spec)
  opcoes.cacheDeFotos?.set(chaveDaFoto, fotoCarregada)
  const { foto, aviso: avisoDaFoto } = fotoCarregada
  if (!foto && spec.foto && (opcoes.somenteAvaliar || opcoes.selecao)) {
    throw new CreativeError('FOTO_INDISPONIVEL', avisoDaFoto ?? 'A foto candidata não pôde ser carregada. Escolha um arquivo acessível.', 422)
  }
  if (avisoDaFoto) avisos.push(avisoDaFoto)
  const canvas = DIMENSOES[spec.formato]
  const luzDaFoto = foto ? await luzMediaDaFoto(foto.bytes, canvas) : null
  const assinatura = await carregarAssinatura(spec.projectId, spec.formato, {
    paginas: opcoes.paginasDeAssinatura,
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
  if (faltam.length > 0) {
    throw new CreativeError('PAPEIS_INCOMPATIVEIS',
      `A variante não tem ${faltam.join(', ')}. Escolha uma variante com todos os papéis; preserve as condições obrigatórias da copy.`,
      422, { faltam, variante: assinatura.origem.variante })
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
  //
  //    Desde 11/09/2026 cada grupo é um ARRANJO (`combinacoes.ts`): o grupo da
  //    página ou uma combinação salva na aba Texto com os mesmos papéis — o
  //    estilo de cada texto, o vão entre eles e os ELEMENTOS presos a cada um
  //    (ícone, filete, selo). Pedido do Ciro: o compositor aproveitar da
  //    assinatura também os ícones e os filetes, que até aqui ficavam para trás.
  const colunaUtil = g.W - 2 * g.margemH
  const recusas: Array<{ papel: Papel; orcamento: unknown }> = []
  const chaveDoGrupo = (papel: Papel) => assinatura.papeis[papel]?.grupo ?? (papel === 'headline2' ? assinatura.papeis.headline?.grupo ?? 'solo:headline' : `solo:${papel}`)
  const gruposDaPagina = arranjosDaPagina({
    pageId: assinatura.origem.pageId ?? 'assinatura',
    nome: assinatura.origem.variante ?? 'Assinatura',
    camadas: assinatura.camadasDaPagina ?? [],
    medir,
  })
  // O papel que a página tem em MAIS de um grupo (no Happy wine do TERO, o
  // horário junto da oferta e o endereço sozinho no pé) recebe as linhas pelo
  // tipo: horário no grupo do horário, endereço no do endereço. Sem isso as duas
  // linhas iam para o primeiro grupo e saíam coladas numa caixa só.
  const blocosPorGrupo = new Map<string, Array<{ papel: Papel; linhas: string[] }>>()
  const juntarNoGrupo = (chave: string, papel: Papel, linhas: string[]) => {
    const lista = blocosPorGrupo.get(chave) ?? []
    const mesmo = lista.find((x) => x.papel === papel)
    if (mesmo) mesmo.linhas.push(...linhas)
    else lista.push({ papel, linhas: [...linhas] })
    blocosPorGrupo.set(chave, lista)
  }
  for (const b of spec.blocos) {
    const papel = b.papel as Papel
    const chaves = [...gruposDaPagina.entries()].filter(([, a]) => a.papeis.includes(papel)).map(([chave]) => chave)
    if (chaves.length <= 1 || b.linhas.length <= 1) {
      juntarNoGrupo(chaveDoGrupo(papel), papel, b.linhas)
      continue
    }
    const tipos = new Map(blocosDeServico(b.linhas).map((s) => [s.indice, s.papel === 'horário' ? 'horario' : 'endereco'] as const))
    b.linhas.forEach((linha, i) => {
      const tipo = tipos.get(i)
      const doTipo = tipo ? chaves.find((chave) => gruposDaPagina.get(chave)!.textos.some((t) => t.papel === papel && t.tipo === tipo)) : undefined
      juntarNoGrupo(doTipo ?? chaveDoGrupo(papel), papel, [linha])
    })
  }
  const combinacoesSalvas = await arranjosDasCombinacoes(spec.projectId, medir)
  const chaveDaPeca = `${spec.nome ?? ''}|${spec.tema ?? ''}|${spec.foto?.driveFileId ?? spec.foto?.url ?? ''}|${spec.blocos[0]?.linhas.join(' ') ?? ''}`
  const arranjos: NonNullable<DiagnosticoDaComposicao['arranjos']> = []
  const arranjoPorGrupo = new Map<string, ArranjoDeGrupo>()
  const elementosPorTexto = new Map<string, { elementos: ElementoDoArranjo[]; escala: number }>()

  const montados: Array<BlocoMontado & { chave: string }> = []
  const familias = await familiasDoProjeto(spec.projectId)
  for (const [chave, blocosDoGrupo] of blocosPorGrupo) {
    const daPagina = gruposDaPagina.get(chave)
    const escolha = escolherArranjo([...(daPagina ? [daPagina] : []), ...combinacoesSalvas], {
      papeis: blocosDoGrupo.map((b) => b.papel),
      tema: spec.tema ?? spec.nome ?? null,
      chave: `${chaveDaPeca}|${chave}`,
      preferidos: spec.preferencias?.arranjos,
    })
    const arranjo = escolha?.arranjo ?? null
    if (escolha) {
      arranjoPorGrupo.set(chave, escolha.arranjo)
      arranjos.push({ grupo: chave, id: escolha.arranjo.id, nome: escolha.arranjo.nome, origem: escolha.arranjo.origem, motivo: escolha.motivo })
    }
    // A manchete com segunda voz vira DOIS papéis no mesmo grupo: as linhas de
    // cima na voz 1 e a última na voz 2 (o que o Quintal, o TERO e o By Rock
    // fazem à mão). Sem `headline2` no arranjo (ou na assinatura), nada muda.
    const temSegundaVoz = arranjo ? arranjo.papeis.includes('headline2') : Boolean(assinatura.papeis.headline2)
    const comSegundaVoz = blocosDoGrupo.flatMap((b) =>
      b.papel === 'headline' && temSegundaVoz && b.linhas.length >= 2
        ? [
            { papel: 'headline' as Papel, linhas: b.linhas.slice(0, -1) },
            { papel: 'headline2' as Papel, linhas: b.linhas.slice(-1) },
          ]
        : [b],
    )
    const preenchidos = arranjo
      ? distribuirLinhas(arranjo, comSegundaVoz).map((p) => ({ papel: p.texto.papel, linhas: p.linhas, texto: p.texto }))
      : comSegundaVoz.map((b) => ({ ...b, texto: null }))
    const repeticoes = new Map<Papel, number>()
    for (const p of preenchidos) {
      const estilo = p.texto?.estilo ?? assinatura.papeis[p.papel]
      if (!estilo) continue
      const n = (repeticoes.get(p.papel) ?? 0) + 1
      repeticoes.set(p.papel, n)
      const r = montarBloco({
        papel: p.papel,
        // O segundo texto do mesmo papel (o Local e o Horário) ganha id próprio
        id: n > 1 ? `${p.papel}-${n}` : p.papel,
        linhas: p.linhas,
        estilo,
        escalaDoFormato,
        colunaUtil,
        textAlign: 'left',
        groupId: `grupo-${hashDe(chave) % 99991}`,
        corDaMancha: mancha,
        medir,
        // Palavra entre [colchetes] na copy sai destacada no estilo da marca.
        destaque: estiloDeDestaqueDoPapel(estilo, assinatura.numeros.destaque, familias),
      })
      avisos.push(...r.avisos)
      if (r.recusa) {
        recusas.push({ papel: r.recusa.papel, orcamento: r.recusa.orcamento })
        continue
      }
      if (r.bloco.escala < 1) avisos.push(`${p.papel}: fonte reduzida a ${Math.round(r.bloco.escala * 100)}% para caber na coluna`)
      const escalaDosElementos = escalaDoFormato * r.bloco.escala
      if (p.texto && p.texto.elementos.length > 0) elementosPorTexto.set(r.bloco.layer.id, { elementos: p.texto.elementos, escala: escalaDosElementos })
      const vaoAntes = p.texto && p.texto.vaoAntes !== null ? Math.round(p.texto.vaoAntes * escalaDoFormato) : null
      // O encaixe que a página desenhou — a voz 2 entrando na linha de cima, como
      // o "executivo" em script sob o "Almoço" do Quintal — vai marcado na camada
      // com quanto sobrepõe. A conferência de colisão o aceita entre textos do
      // mesmo grupo; sem a marca, o autofix encolhia a manchete até desfazer o
      // encaixe (88 → 77 px, 11/09/2026).
      const compositorDaCamada = (r.bloco.layer.metadata as { compositor?: Record<string, unknown> } | undefined)?.compositor
      const layer =
        vaoAntes !== null && vaoAntes < 0
          ? { ...r.bloco.layer, metadata: { ...r.bloco.layer.metadata, compositor: { ...compositorDaCamada, encaixe: -vaoAntes } } }
          : r.bloco.layer
      montados.push({
        ...r.bloco,
        layer,
        chave,
        ...(vaoAntes !== null ? { vaoAntes } : {}),
        ...(p.texto && p.texto.elementos.length > 0 ? { elementos: p.texto.elementos, escalaDosElementos } : {}),
      })
    }
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

  // O gradiente de leitura (Ciro, 11/09/2026: "prefiro que deixe de usar o
  // halo, e aprenda a usar o gradiente de forma sutil"). A COR, nesta ordem:
  // uma camada de gradiente na página de assinatura (a equipe desenhou) →
  // `Project.assinatura.gradiente.cor` → o gradiente da marca que contrasta com
  // o texto (a Real, na curva que a Roberta mediu) → o dark da marca.
  const coresDaMarca = [
    ...new Set(
      gradientesDoProjeto(spec.projectId)
        .daMarca.map((g) => g.gradientStops[0]?.color)
        .filter((c): c is string => typeof c === 'string'),
    ),
  ]
  const cfgGradiente: ConfigDoGradiente = {
    ...assinatura.numeros.gradiente,
    ...(assinatura.gradienteDaPagina ?? {}),
    cor:
      assinatura.gradienteDaPagina?.cor ??
      assinatura.numeros.gradiente.cor ??
      corQueContrasta(coresDaMarca, montados.map((b) => b.cor)) ??
      mancha,
  }

  interface BlocoComposto {
    chave: string
    blocos: BlocoMontado[]
    pilha: ReturnType<typeof empilhar>
    principal: boolean
    ancora: Ancora
    /** A âncora veio de uma caixa REAL da página (e não do default do papel). */
    temCaixa: boolean
    alinha: Alinhamento | null
    /** O centro vertical do grupo na página (0..1) — ordena os grupos que dividem a mesma borda. */
    centro: number | null
  }
  const porGrupo = new Map<string, BlocoMontado[]>()
  for (const b of montados) {
    porGrupo.set(b.chave, [...(porGrupo.get(b.chave) ?? []), b])
  }
  const compostos: BlocoComposto[] = [...porGrupo.entries()].map(([chave, blocos]) => {
    const papeis = blocos.map((b) => b.papel)
    // Onde o grupo mora na página: a caixa do próprio arranjo da página — que
    // distingue os dois grupos de serviço do Happy wine — ou as caixas dos papéis.
    const arranjoDoGrupo = arranjoPorGrupo.get(chave)
    const caixas =
      arranjoDoGrupo?.origem === 'pagina' && arranjoDoGrupo.caixa
        ? [arranjoDoGrupo.caixa]
        : papeis.map((p) => assinatura.papeis[p]?.caixa).filter((c): c is NonNullable<typeof c> => !!c)
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
      // O alinhamento preferido é o do arranjo: é o que a combinação desenhou.
      alinha: arranjoPorGrupo.get(chave)?.alinhamento ?? assinatura.papeis[papeis[0]]?.alinhamento ?? null,
      centro,
    }
  })
  const principal = compostos.find((c) => c.principal) ?? compostos[0]
  // Na mesma borda, o grupo mais PERTO dela na página é posto primeiro: o
  // endereço no pé do Happy wine fica abaixo da oferta, como no modelo.
  const outros = compostos.filter((c) => c !== principal)
  const porCentro = (sentido: 1 | -1) => (a: BlocoComposto, b: BlocoComposto) => sentido * ((a.centro ?? 0) - (b.centro ?? 0))
  const secundarios = [
    ...outros.filter((c) => c.ancora === 'topo').sort(porCentro(1)),
    ...outros.filter((c) => c.ancora === 'meio'),
    ...outros.filter((c) => c.ancora === 'rodape').sort(porCentro(-1)),
  ]
  const pilha = principal.pilha
  // A margem lateral de cada grupo é a que ELE tem na página: a caixa dos textos
  // na borda em que alinham, menos o quanto os elementos passam da tinta (o ícone
  // à esquerda do serviço) — os elementos se medem pela tinta, na página e na
  // peça, então o texto cai no mesmo x e o ícone vem junto. Uma margem só para
  // todos punha o serviço do Happy hour do TERO 18 px para dentro e a oferta do
  // Happy wine 11 px para fora (11/09/2026). Virado para o outro lado pelo mapa,
  // o grupo leva a mesma distância à borda.
  const margemDoGrupo = (c: BlocoComposto, alinha: Alinhamento): number | undefined => {
    const a = arranjoPorGrupo.get(c.chave)
    if (a?.origem !== 'pagina' || !a.caixa || assinatura.origem.formatoDaPagina !== spec.formato || alinha === 'centro') return undefined
    const distancia = a.alinhamento === 'direita' ? canvas.width - (a.caixa.x + a.caixa.width) : a.alinhamento === 'esquerda' ? a.caixa.x : null
    if (distancia === null) return undefined
    return Math.max(24, Math.min(240, Math.round(distancia - (alinha === 'esquerda' ? c.pilha.esquerda : c.pilha.direita))))
  }
  // Os blocos secundários reservam a própria altura na âncora deles, para o
  // principal não pousar em cima.
  const reservaNoRodape = secundarios.filter((c) => c.ancora === 'rodape').reduce((acc, c) => acc + c.pilha.height + Math.round(g.gap * 1.6), 0)
  const reservaNoTopo = secundarios.filter((c) => c.ancora === 'topo').reduce((acc, c) => acc + c.pilha.height + Math.round(g.gap * 1.6), 0)

  // 2. O mapa e o assunto — por corte candidato.
  const cortes = cortesCandidatos(foto, canvas, spec.preferencias?.enquadramento === 'fixo')
  const assuntoDoCatalogo = foto && spec.foto?.driveFileId
    ? opcoes.assuntosDoCatalogo?.has(spec.foto.driveFileId)
      ? opcoes.assuntosDoCatalogo.get(spec.foto.driveFileId) ?? null
      : await assuntoDoCatalogoDaFoto(spec.projectId, spec.foto.driveFileId)
    : null

  let melhor: { crop: CropPosition; raster: FotoCinza | null; mapa: MapaDeCalma | null; assunto: Rect | null; escolhido: PontuacaoDePosicao<RotuloDePosicao>; todos: PontuacaoDePosicao<RotuloDePosicao>[] } | null = null
  const cores = montados.map((b) => b.cor)
  for (const crop of cortes) {
    const raster = foto ? await lerFotoComoCover(foto.bytes, canvas, { cropPosition: crop }) : null
    const mapa = raster ? mapaDeCalma(raster) : null
    const assunto = assuntoDoCatalogo ? assuntoEmPixels(assuntoDoCatalogo, { width: foto!.largura, height: foto!.altura }, canvas, crop) : mapa ? estimarAssunto(mapa) : null
    const candidatos = candidatosDePosicao(g, spec, pilha, crop, {
      reservaNoRodape,
      reservaNoTopo,
      alinhaDaAssinatura: principal.alinha ?? assinatura.alinhamento,
      ancoraDaPagina: principal.temCaixa ? principal.ancora : null,
      margemPara: (al) => margemDoGrupo(principal, al),
    })
    const pontuados = mapa
      ? pontuarCandidatos({ mapa, candidatos, coresDoTexto: cores, corDaMancha: cfgGradiente.cor, assunto })
      : candidatos.map((c) => ({ ...c, pontuacao: c.preferencia, calma: 1, tintaNecessaria: 0, cobreAssunto: 0, descartado: false, motivo: 'sem foto: vale a preferência' }))
    if (assuntoDoCatalogo && assunto && fracaoVisivelDoAssunto(assunto, canvas) < 0.75) {
      for (const candidato of pontuados) {
        candidato.descartado = true
        candidato.motivo = 'O corte preserva menos de 75% da caixa do assunto catalogado.'
      }
    }
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
  const rectsDeGrupo: Array<{ grupo: string; rect: Rect; cores: string[]; camadas: Layer[]; ancora: Ancora }> = []
  const posicionar = (c: BlocoComposto, rect: Rect, alinhaDoBloco: Alinhamento, ancoraDoBloco: Ancora) => {
    const textAlign = alinhamentoParaTextAlign(alinhaDoBloco)
    // Os elementos presos aos textos (o ícone antes, o selo depois) moram dentro
    // do retângulo: a coluna de tinta começa depois do que passa à esquerda.
    const { esquerda, direita } = c.pilha
    const camadas = c.blocos.map((b, i) => {
      const x =
        alinhaDoBloco === 'esquerda'
          ? rect.x + esquerda
          : alinhaDoBloco === 'direita'
            ? rect.x + rect.width - direita - b.width
            : rect.x + esquerda + (rect.width - esquerda - direita - b.width) / 2
      const camada: Layer = { ...b.layer, position: { x: Math.round(x), y: Math.round(rect.y + c.pilha.offsets[i]) }, style: { ...b.layer.style, textAlign } }
      camadasDeTexto.push(camada)
      return camada
    })
    rectsDeGrupo.push({ grupo: c.chave, rect, cores: c.blocos.map((b) => b.cor), camadas, ancora: ancoraDoBloco })
  }
  posicionar(principal, rectPrincipal, alinha, ancora)
  let ocupadoNoRodape = 0
  let ocupadoNoTopo = 0
  for (const c of secundarios) {
    const al = c.alinha ?? alinha
    let rect = retanguloDoBloco(g, c.ancora, al, c.pilha.width, c.pilha.height, margemDoGrupo(c, al))
    if (c.ancora === 'rodape') {
      rect = { ...rect, y: g.H - g.safeRodape - c.pilha.height - ocupadoNoRodape }
      ocupadoNoRodape += c.pilha.height + Math.round(g.gap * 1.6)
    } else if (c.ancora === 'topo') {
      rect = { ...rect, y: g.safeTopo + ocupadoNoTopo }
      ocupadoNoTopo += c.pilha.height + Math.round(g.gap * 1.6)
    }
    posicionar(c, rect, al, c.ancora)
  }

  // 4. SEM HALO (Ciro, 11/09/2026: "prefiro que deixe de usar o halo"). O fundo
  //    de texto que a página de assinatura ainda carrega não é copiado; o
  //    contraste é o gradiente de leitura, montado no passo 7b sobre as caixas
  //    FINAIS (o autofix ainda pode mexer nelas). Aqui só se mede quanto a foto
  //    pede sob um retângulo — a mesma conta que calibrava o halo.
  const necessidadeSob = (rect: Rect, coresDoTexto: string[]): number => {
    const luz = melhor.raster ? luzNoRect(melhor.raster, rect) : null
    if (!luz) return 0
    const c = calibrarHalo({ texto: rect, luz, coresDoTexto, corDaMancha: cfgGradiente.cor, raioBase: 0 })
    return Number(Math.min(1, c.tinta / 0.95).toFixed(3))
  }

  // 5. A logo, no canto mais calmo e escuro que não encosta no texto. Vai no
  //    TOPO da pilha, depois dos textos (ajuste do Ciro na leva de setembro,
  //    02/09/2026). Não ganha halo próprio: canto claro numa borda sem texto
  //    recebe um gradiente fraco no passo 7b.
  const camadasDaLogo: Layer[] = []
  let logoDiag: DiagnosticoDaComposicao['logo'] = null
  // A logo que mora DENTRO de um arranjo (ao lado do serviço, como no Quintal)
  // entra com os elementos do texto; a peça não ganha outra no canto.
  const logoNoArranjo = montados.some((b) => b.elementos?.some((e) => e.logo))
  if (assinatura.logo && spec.preferencias?.cantoDaMarca !== 'nenhum' && !logoNoArranjo) {
    const largura = Math.round(assinatura.logo.largura * (spec.formato === 'story' ? 1 : escalaDoFormato))
    const altura = Math.round(largura * assinatura.logo.razao)
    // A logo onde a PÁGINA a pôs — no alto e ao centro no "Almoço TERO", no
    // canto de cima nos "Clássicos" —, quando ali ela não encosta em nenhum
    // bloco de texto da peça; senão, o canto mais calmo de sempre.
    const naPagina =
      !spec.preferencias?.cantoDaMarca && assinatura.logo.posicao && assinatura.origem.formatoDaPagina === spec.formato
        ? { x: Math.round(assinatura.logo.posicao.x), y: Math.round(assinatura.logo.posicao.y), width: largura, height: altura }
        : null
    const livreNaPagina = naPagina && !rectsDeGrupo.some((r) => intersecta(r.rect, naPagina)) ? naPagina : null
    const canto = livreNaPagina
      ? {
          canto: `${livreNaPagina.y + altura / 2 < g.H / 2 ? 'superior' : 'inferior'}-${livreNaPagina.x + largura / 2 < g.W / 2 ? 'esquerdo' : 'direito'}` as Canto,
          rect: livreNaPagina,
          luz: 0,
        }
      : escolherCanto({
          g,
          mapa: melhor.mapa,
          blocos: rectsDeGrupo.map((r) => r.rect),
          logo: { w: largura, h: altura },
          pedido: spec.preferencias?.cantoDaMarca,
          formato: spec.formato,
        })
    if (canto) {
      const tinta = 0
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

  // 7. Contrato + autofix geométrico (colisão, transbordo, safe area). O fundo
  //    de texto que viria da página de assinatura não entra: a peça nasce sem halo.
  const textosSemHalo = camadasDeTexto.map((c) => (c.effects?.background ? { ...c, effects: { ...c.effects, background: undefined } } : c))
  const normalizado = normalizarCamadas([...fundo, ...textosSemHalo, ...camadasDaLogo])
  const fix = await aplicarAutofixOuFalhar({
    projectId: spec.projectId,
    layers: normalizado.camadas,
    canvas,
    changedLayerIds: camadasDeTexto.map((c) => c.id),
  })
  avisos.push(...fix.avisos)
  let layers = fix.layers as Layer[]

  // 7a. Os ELEMENTOS presos aos textos (ícone, filete, selo, a logo do
  //     arranjo), na tinta FINAL — o autofix pode ter encolhido a fonte. Entram
  //     logo acima dos textos, antes da logo do canto.
  const camadasDeElementos = layers.flatMap((l) => {
    const presos = elementosPorTexto.get(l.id)
    return presos && l.visible !== false ? camadasDosElementos(l, presos.elementos, presos.escala) : []
  })
  if (camadasDeElementos.length > 0) {
    const ondeALogo = layers.findIndex((l) => l.id === 'logo')
    const antes = ondeALogo >= 0 ? layers.slice(0, ondeALogo) : layers
    const depois = ondeALogo >= 0 ? layers.slice(ondeALogo) : []
    layers = [...antes, ...camadasDeElementos, ...depois].map((l, order) => ({ ...l, order }))
  }

  // 7b. O gradiente de leitura, sobre as caixas FINAIS: um por borda que tem
  //     texto — topo e rodapé em camadas independentes (pedido do Ciro). Sem
  //     foto não há o que escurecer: a peça sai sobre o fundo liso da marca.
  const caixaDe = (l: Layer): Rect => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })
  const elementoDe = (l: Layer) => String((l.metadata as { compositor?: { elementoDe?: string } } | undefined)?.compositor?.elementoDe ?? '')
  const paraGradiente: GrupoParaGradiente[] = rectsDeGrupo.map((grupo) => {
    const ids = new Set(grupo.camadas.map((c) => c.id))
    // O gradiente cobre também os elementos presos aos textos do grupo
    const doGrupo = layers.filter((l) => l.visible !== false && (ids.has(l.id) || ids.has(elementoDe(l))))
    const rect = uniao(doGrupo.map(caixaDe)) ?? grupo.rect
    return { rect, ancora: grupo.ancora, necessidade: necessidadeSob(rect, grupo.cores) }
  })
  const logoFinal = layers.find((l) => l.id === 'logo')
  if (logoFinal && melhor.raster) {
    // A logo não tem mais halo: canto claro numa borda SEM texto ganha um
    // gradiente fraco (metade da necessidade), só o bastante para ela ler.
    const rect = caixaDe(logoFinal)
    const borda = bordaDoGrupo(rect, null, canvas.height)
    const bordaTemTexto = paraGradiente.some((grupo) => bordaDoGrupo(grupo.rect, grupo.ancora, canvas.height) === borda)
    const necessidade = necessidadeSob(rect, ['#FFFFFF'])
    if (!bordaTemTexto && necessidade > 0.5) paraGradiente.push({ rect, ancora: borda, necessidade: necessidade * 0.5 })
  }
  // O gradiente de cada BORDA segue a camada que a página desenhou naquela
  // borda: nos modelos do Quintal (11/09/2026) o rodapé é mais forte que o
  // topo, e ler só a primeira camada prendia o rodapé à força do topo.
  const gradientesDaPagina = new Map<Borda, AjustesDoGradiente>()
  for (const camada of assinatura.camadasDaPagina ?? []) {
    const ajustes = configDaCamada(camada)
    const borda = ajustes ? bordaDaCamadaDeGradiente(camada) : null
    if (ajustes && borda && !gradientesDaPagina.has(borda)) gradientesDaPagina.set(borda, ajustes)
  }
  const cfgDaBorda = (borda: Borda): ConfigDoGradiente => {
    const daBorda = gradientesDaPagina.get(borda)
    return daBorda ? { ...cfgGradiente, ...daBorda, cor: daBorda.cor ?? cfgGradiente.cor } : cfgGradiente
  }
  const gradientes = foto
    ? (['topo', 'rodape'] as const).flatMap((borda) =>
        montarGradientes({
          W: canvas.width,
          H: canvas.height,
          grupos: paraGradiente.filter((p) => bordaDoGrupo(p.rect, p.ancora, canvas.height) === borda),
          cfg: cfgDaBorda(borda),
        }),
      )
    : []
  if (gradientes.length > 0) layers = inserirAcimaDaFoto(layers, gradientes.map((gr) => gr.layer))

  // 8. A régua (F2): o p98 real sob cada bloco na peça renderizada — corrige a
  //    FORÇA do gradiente uma vez dentro da faixa e AVISA quando a foto não
  //    carrega o texto.
  let contraste: ContrasteMedido[] | null = null
  let intervencaoDeTexto: IntervencaoDeTexto | undefined
  try {
    const faixa: [number, number] = [
      Math.min(cfgDaBorda('topo').forcaMinima, cfgDaBorda('rodape').forcaMinima),
      Math.max(cfgDaBorda('topo').forcaMaxima, cfgDaBorda('rodape').forcaMaxima),
    ]
    const regua = await medirContrasteDaPeca({ layers, canvas, background: assinatura.numeros.fundo, faixa, corrigir: true, medirIntervencao: opcoes.medirComparacao })
    layers = regua.layers
    contraste = regua.medidas
    intervencaoDeTexto = regua.intervencao
    avisos.push(...regua.avisos)
  } catch (erro) {
    avisos.push(`A régua de contraste não rodou: ${(erro as Error).message}`)
  }

  const diagnostico: DiagnosticoDaComposicao = {
    ...(opcoes.selecao ? { selecao: opcoes.selecao } : {}),
    ...(intervencaoDeTexto ? { intervencaoDeTexto } : {}),
    tratamentoDeTexto: 'gradiente-de-leitura',
    formato: spec.formato,
    posicao: { ancora, alinha, crop, pontuacao: Number(melhor.escolhido.pontuacao.toFixed(3)), motivo: melhor.escolhido.motivo },
    candidatos: melhor.todos.map((c) => ({ ...c.rotulo, pontuacao: Number(c.pontuacao.toFixed(3)), descartado: c.descartado, motivo: c.motivo })),
    assunto: melhor.assunto,
    assuntoOrigem: assuntoDoCatalogo ? 'catalogo' : melhor.assunto ? 'estimado' : 'nenhum',
    halos: [],
    gradientes: gradientes.map((gr) => {
      const forcaFinal = layers.find((l) => l.id === gr.layer.id)?.metadata?.forca
      const daBorda = paraGradiente.filter((p) => bordaDoGrupo(p.rect, p.ancora, canvas.height) === gr.borda).map((p) => p.necessidade)
      return {
        borda: gr.borda,
        forca: typeof forcaFinal === 'number' ? forcaFinal : gr.forca,
        altura: gr.altura,
        cor: cfgGradiente.cor,
        necessidade: daBorda.length > 0 ? Math.max(...daBorda) : 0,
      }
    }),
    logo: logoDiag,
    blocos: montados.map((b) => ({ papel: b.papel, escala: b.escala, width: b.width, height: b.height, destacado: b.destacado })),
    arranjos,
    contraste,
    assinatura: assinatura.origem,
    avisos,
  }

  if (opcoes.selecao) {
    const { impedimentos, transitorio } = avaliarCombinacao({ persistido: null, prova: null, layers, diagnostico })
    if (impedimentos.length) throw new CreativeError(transitorio ? 'SELECAO_INDISPONIVEL' : 'SEM_COMBINACAO', 'A combinação selecionada falhou na conferência final; nada foi salvo.', 422, { impedimentos, selecao: opcoes.selecao })
  }
  if (opcoes.somenteAvaliar) return { persistido: null, prova: null, layers, diagnostico }

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

  // Minuto já ocupado sem carrossel declarado: o compositor desempata e AVISA.
  // A regra e o porquê moram no módulo puro (`avisoDeMinutoOcupado`).
  const avisoDeHorario = avisoDeMinutoOcupado(spec.quando ?? null, repeticao, Boolean(spec.carrossel))
  if (avisoDeHorario) avisos.push(avisoDeHorario)

  const nome = nomeDaPagina({
    quando: spec.quando ?? null,
    tema: spec.tema ?? null,
    // Os [colchetes] do destaque são marcação: não entram no nome da página.
    nome: spec.nome ?? (spec.blocos[0]?.linhas[0] ? semColchetes(spec.blocos[0].linhas[0]) : null),
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
  // Os arranjos usados ficam gravados na spec: a recomposição refaz A MESMA
  // peça, sem sortear outra combinação.
  const specGravada: SpecDePeca = arranjos.length > 0 ? { ...spec, preferencias: { ...spec.preferencias, arranjos: arranjos.map((a) => a.id) } } : spec
  const persistido = await persistAndRenderCreative(
    entradaDePersistencia({
      spec: specGravada,
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

/** A caixa do assunto gravada no catálogo (frações 0..1), quando a análise a deu. */
async function assuntoDoCatalogoDaFoto(projectId: number, driveFileId: string): Promise<AssuntoNormalizado | null> {
  try {
    const { lerCatalogoDoProjeto } = await import('@/lib/creatives/acervo')
    const catalogo = await lerCatalogoDoProjeto(projectId)
    const entrada = catalogo?.todas?.find((i) => i.driveFileId === driveFileId) as unknown as (Record<string, unknown> | undefined)
    return lerCaixaDoAssunto(entrada?.assunto)
  } catch {
    return null
  }
}
