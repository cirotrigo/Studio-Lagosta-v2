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
import { extractDriveFileId } from '@/lib/ai/fetch-image-source'
import { persistAndRenderCreative, resolveImageUrl, type PersistCreativeResult } from '@/lib/creatives/persist'
import { registerProjectFonts, fetchBuffer, familiasNaoCarregadas } from '@/lib/posts/register-project-fonts'
import { dividirManchete } from './segunda-voz'
import { familiasDaCamada, medidasFinaisDasCamadas, type MedidaFinal } from './medidas'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { aplicarAutofixOuFalhar } from '@/lib/creatives/text-autofix'
import { normalizarCamadas } from '@/lib/creatives/layer-contract'
import { lerFotoComoCover, luzNoRect, type FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import { alvoPorContraste, calibrarHalo, uniao, type Rect } from '@/lib/creatives/halo/halo'
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
  NOME_DO_TEMPLATE_DE_ASSINATURA,
  type AssinaturaDaMarca,
  type EstiloDePapel,
  type NumerosDaAssinatura,
} from './assinatura'
import { empilhar, type BlocoMontado } from './blocos'
import { prepararBlocos, chaveDaPeca } from './preparar-blocos'
import { resolverCamadasExtras, idsDeCamadaRepetidos } from './camadas-extras'
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
  alcanceDoGrupo,
  alturaDaFaixa,
  bordaDaCamadaDeGradiente,
  bordaDoGrupo,
  camadaDeGradiente,
  configDaCamada,
  corQueContrasta,
  ehGradienteDeLeituraDaPagina,
  forcaDaCamada,
  type AjustesDoGradiente,
  inserirAcimaDaFoto,
  montarGradientes,
  type Borda,
  type ConfigDoGradiente,
  type GradienteMontado,
  type GrupoParaGradiente,
} from './gradiente-de-leitura'
import { DIMENSOES, validarSpec, type Alinhamento, type Ancora, type Canto, type Formato, type Papel, type SpecDePeca } from './spec'
import {
  alvoClaroPorContraste,
  medirContrasteDaPeca,
  luzMedida,
  medirFundoDosTextos,
  polaridadeDoTexto,
  TOLERANCIA_DE_PIORA,
  type ContrasteMedido,
  type IntervencaoDeTexto,
  type PioraDeTratamento,
} from './regua'
import { candidatasDistintas, gradientesARecusar, MOTIVOS_DO_TRATAMENTO, planejarTratamentoDaBorda, type PlanoDaBorda } from './tratamento-de-leitura'
import { conferirLinhas, conferirLogo, prepararArquetipo, type ArquetipoPreparado } from './arquetipos/na-spec'
import { caixasMaximas, referenciaDoPapel, type Materializacao, type RetanguloPx } from './arquetipos/materializar'
import { MODO_BUSCA_ESPACIAL, MOTIVOS_DE_ELIMINACAO, type DiagnosticoDaBuscaEspacial, type EscolhaParaReproduzir, type LeituraDoCorte, type PlanejamentoDoTratamento } from './arquetipos/busca-espacial-tipos'
import { chaveDaFoto as impressaoDaFoto, contarRecusas, exemplosDeRecusa, motivoDaFalta, selecionarNoArquetipo, type SelecaoNoArquetipo } from './arquetipos/busca-espacial'
import { partidaNoArquetipo, type PartidaNoArquetipo } from './arquetipos/candidatos-espaciais'
import { regioesProtegidas } from './arquetipos/pontuacao-espacial'
import {
  ajusteFinalNecessario,
  camadasNaReferencia,
  grupoDaUnidade,
  materializarUnidades,
  papelGeometrico,
  prepararNoArquetipo,
  type PreparoNoArquetipo,
  type UnidadeDoArquetipo,
} from './arquetipos/no-compositor'
import { chaveDoArquetipo } from './arquetipos/tipos'

/**
 * De onde veio a cor do gradiente de leitura de uma borda. Borda com camada de
 * gradiente de leitura na página de assinatura: `pagina-na-borda` (o
 * tratamento explícito do template). Nas outras, desde o CP2A (14/10/2026), a
 * candidata que o tratamento POR BORDA escolheu: `pagina` (o gradiente da
 * página), `numeros-da-assinatura`, `mancha` ou `biblioteca-legada`
 * (`GRADIENTES_POR_PROJETO`). `contraste-com-os-textos` é a cor global de
 * antes — hoje só no véu da LOGO (a borda só com logo, ou a borda de texto que
 * ficou sem véu de texto), que é do CP3.
 */
export type OrigemDaCorDoVeu = 'pagina-na-borda' | 'pagina' | 'numeros-da-assinatura' | 'contraste-com-os-textos' | 'mancha' | 'biblioteca-legada'

/** Uma leitura de texto no diagnóstico do tratamento por borda: o fundo antes e depois, contra o alvo. */
export interface LeituraDoTratamento {
  camada: string
  polaridade: 'clara' | 'escura'
  percentil: 'p98' | 'p02'
  antes: number
  alvo: number
  depois: number | null
  /** `melhorou`/`piorou` além da tolerância de 2 níveis; `neutro` dentro dela. */
  efeito: 'melhorou' | 'piorou' | 'neutro' | null
}

/** O tratamento de leitura de uma borda com texto, no diagnóstico (CP2A, 14/10/2026). Compacto. */
export interface TratamentoDaBorda {
  borda: Borda
  /**
   * `sem-necessidade`: todo texto já lê, nenhum véu automático. `tratado`: véu desenhado.
   * `inviavel`: nenhuma candidata serve (ver `motivo`) — a ESTRATÉGIA de tratamento, não a peça.
   * `recusado`: a régua provou que o véu piorava a leitura e ele saiu. `explicito-do-template`: a
   * página de assinatura desenha o gradiente dessa borda e ele é reproduzido como sempre.
   * `nao-medido`: o fundo não pôde ser medido (ou a régua não rodou) — nenhum véu automático de texto.
   */
  estado: PlanoDaBorda['estado'] | 'recusado' | 'nao-medido' | 'explicito-do-template'
  grupos: string[]
  textos: LeituraDoTratamento[]
  cor?: string
  origemDaCor?: OrigemDaCorDoVeu
  forca?: number
  forcaPedida?: number | null
  alcancaAlvo?: boolean
  motivo?: string
  recusadas?: PlanoDaBorda['recusadas']
  foraDoPlano?: string[]
  /** O véu desenhado nesta borda é o da LOGO (a borda de texto ficou sem véu de texto). */
  veuDaLogo?: boolean
}

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
  /**
   * Um gradiente de leitura por borda com texto, com a força FINAL (depois da
   * régua). Ausente em diagnósticos antigos. Desde o CP1 (13/10/2026), `cor` é
   * a cor DESENHADA naquela borda (lida da camada) e `origemDaCor` diz de onde
   * ela veio — antes, `cor` repetia a cor global mesmo quando a borda usava a
   * da camada da página.
   */
  gradientes?: Array<{ borda: Borda; forca: number; altura: number; cor: string; necessidade: number; origemDaCor?: OrigemDaCorDoVeu }>
  /**
   * TRATAMENTO_PIOROU_LEITURA na peça FINAL (CP1, 13/10/2026): o texto cuja
   * leitura o gradiente piorou, medido com e sem ele. Diagnóstico — a peça
   * continua saindo; a correção é de outro checkpoint.
   */
  tratamentoPiorou?: PioraDeTratamento[]
  /** O tratamento de leitura de cada borda com texto (CP2A, 14/10/2026). Ausente em diagnósticos antigos. */
  tratamentoDeLeitura?: TratamentoDaBorda[]
  /** `tinta` é legado (sempre 0): a logo não ganha mais halo. */
  logo: { canto: Canto; tinta: number } | null
  blocos: Array<{ /** O id da camada (`servico-2`, `headline2`…) — a identidade do bloco; ausente em diagnósticos antigos. */ id?: string; papel: Papel; escala: number; width: number; height: number; destacado?: boolean; naoMedido?: boolean }>
  /**
   * As medidas FINAIS de cada texto, depois do autofix (corpo, entrelinha,
   * caixa, linhas) e se a medida vale — `naoMedido` quando a fonte do papel não
   * carregou no servidor. Ausente em diagnósticos anteriores ao PR 4 (12/09/2026).
   */
  medidasFinais?: MedidaFinal[]
  /** As famílias de fonte pedidas pela assinatura que NÃO carregaram no servidor. */
  fontesNaoCarregadas?: string[]
  /** De onde saiu a divisão da manchete em duas vozes: do contrato do autor, da regra legada, ou nenhuma. */
  segundaVoz?: 'contrato' | 'legado' | 'nenhuma'
  /** O arranjo de texto usado em cada grupo: o da página ou uma combinação salva. Ausente em diagnósticos antigos. */
  arranjos?: Array<{ grupo: string; id: string; nome: string; origem: ArranjoDeGrupo['origem']; motivo: string }>
  contraste: ContrasteMedido[] | null
  assinatura: AssinaturaDaMarca['origem']
  /**
   * O ARQUÉTIPO materializado (T1a, 14/10/2026) — a procedência da geometria: a
   * definição exata (id, versão, impressão) e, por papel, a referência, a zona
   * efetiva e onde a caixa pousou. Ausente sem arquétipo. A recomposição não lê
   * daqui: a fonte é `fieldValues.spec.arquetipo`.
   */
  arquetipo?: DiagnosticoDoArquetipo
  avisos: string[]
}

export interface DiagnosticoDoArquetipo {
  id: string
  versao: number
  impressao: string
  codigoTaxonomico: string
  formato: Formato
  /**
   * `busca-espacial-v1` (CP2B): a foto escolheu, dentro das zonas, o corte e a posição de cada faixa (`buscaEspacial`
   * diz como). `referencia`: a posição de referência — as peças do T1a, e a recomposição delas.
   */
  modo: 'referencia' | typeof MODO_BUSCA_ESPACIAL
  /** A busca espacial (CP2B): a escolha congelada que a recomposição reproduz, o vencedor, as alternativas e as recusas. */
  buscaEspacial?: DiagnosticoDaBuscaEspacial
  /** As preferências da spec que coincidiam com as do arquétipo (aceitas — a geometria veio do arquétipo). */
  preferenciasCoincidentes: string[]
  papeis: Array<{ papel: string; referencia: RetanguloPx; zonaEfetiva: RetanguloPx; posicao: RetanguloPx }>
  logo: { modo: 'referencia' | 'automatica'; canto: Canto | null; referencia?: RetanguloPx; zonaEfetiva?: RetanguloPx; posicao?: RetanguloPx }
  /** Os elementos que o arquétipo declara e os desenhados — nenhum no T1a (é o T1b). */
  elementosDeclarados: Array<{ id: string; tipo: string; opcional: boolean }>
  elementosMaterializados: string[]
  /** Textos cujo arranjo trazia a logo: ela saiu do arranjo e ficou só onde o arquétipo manda. */
  logoDoArranjoRetirada?: string[]
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
  /**
   * Interno (CP2B): a recomposição REPRODUZ a escolha espacial gravada na peça (`composicao.arquetipo`) em vez de
   * refazer a busca — só com arquétipo. `{ modo: 'referencia' }` é a peça do T1a (referência + corte central). Nunca
   * vem do MCP nem da spec: não é uma segunda fonte de posição.
   */
  escolhaEspacial?: EscolhaParaReproduzir
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
  /** O id da página com que a peça nasceu (a recomposição fixa) — ver `CriteriosDeVariante.varianteOriginal`. */
  varianteOriginal?: string | null
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
    varianteOriginal: opcoes.varianteOriginal ?? null,
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
  assinatura.dimensoesDaPagina = escolhida ? { width: escolhida.width, height: escolhida.height } : undefined
  // A página do formato é a verdade daquele formato: papel que a página de
  // feed não tem NÃO vem da story. Desde 11/09/2026 a regra é "copy primeiro,
  // campos depois" (os campos são opcionais e nenhum texto é descartado por
  // falta de campo): o texto cujo papel a variante não tem entra como camada
  // EXTRA quando declara `herdaDe` (PR 9 e 10, `camadas-extras.ts`); sem a
  // herança declarada ele é RECUSADO com PAPEIS_INCOMPATIVEIS — nunca some em
  // silêncio.
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

export async function carregarFoto(spec: SpecDePeca): Promise<{ foto: FotoDaPeca | null; aviso: string | null }> {
  if (!spec.foto?.url && !spec.foto?.driveFileId) return { foto: null, aviso: null }
  const r = await resolveImageUrl(spec.foto.url, spec.foto.driveFileId, spec.projectId)
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
export async function luzMediaDaFoto(bytes: Buffer, canvas: { width: number; height: number }): Promise<number | null> {
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
    /** A largura do bloco em cada alinhamento: com o recuo da página, o lado de dentro muda. */
    larguraPara?: (alinha: Alinhamento) => number
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
      // A margem do grupo na página chega ao principal também: declarada em
      // f9c24278, ela nunca era usada aqui, e o principal caía na margem da
      // assinatura (a do texto mais rente de TODA a página).
      const largura = extra.larguraPara?.(alinha) ?? bloco.width
      const rect = retanguloDoBloco(g, ancora, alinha, largura, bloco.height + reservaBaixo + reservaCima, extra.margemPara?.(alinha))
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
export async function familiasDoProjeto(projectId: number): Promise<string[]> {
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

// ─── A composição ──────────────────────────────────────────────────────────

/**
 * As combinações salvas do projeto que servem à usina (todo texto com papel),
 * já como arranjos. Falha de leitura vira lista vazia: a peça sai com os grupos
 * da página de assinatura, como antes.
 */
export async function arranjosDasCombinacoes(projectId: number, medir: MeasureTextBox): Promise<ArranjoDeGrupo[]> {
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
  // T1a: o arquétipo é RESOLVIDO antes de tudo (id + versão + impressão exatas, impressão gravada conferida) e
  // as recusas que não dependem da medida saem aqui. Sem `arquetipo`, `null` — e nada abaixo muda.
  const arq: ArquetipoPreparado | null = prepararArquetipo(v.spec)
  if (v.spec.selecaoExperimental === true && !opcoes.somenteAvaliar) {
    const { selecionarCombinacao } = await import('./selecionar-combinacao')
    const selecao = await selecionarCombinacao(v.spec)
    return comporPeca(selecao.spec, { ...opcoes, selecao: selecao.diagnostico, avisosDaSelecao: selecao.avisos, cacheDeFotos: selecao.cacheDeFotos, assuntosDoCatalogo: selecao.assuntosDoCatalogo })
  }
  // A peça nunca depende de "a mais recente": a spec que se compõe e se grava traz a versão exata.
  const spec: SpecDePeca = arq ? { ...v.spec, arquetipo: arq.resolvido } : v.spec
  if (arq) conferirLinhas(arq.definicao, arq.formato, spec)
  const avisos: string[] = [...(opcoes.avisosDaSelecao ?? [])]

  const projeto = await db.project.findUnique({ where: { id: spec.projectId }, select: { id: true, name: true, userId: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${spec.projectId} não encontrado`, 404)

  // A foto vem ANTES da assinatura: a luz média dela escolhe entre variantes
  // `clara`/`escura`, e a chave da peça faz o rodízio entre as demais.
  const chaveDaFoto = JSON.stringify(spec.foto ?? {})
  const fotoCarregada = opcoes.cacheDeFotos?.get(chaveDaFoto) ?? await carregarFoto(spec)
  opcoes.cacheDeFotos?.set(chaveDaFoto, fotoCarregada)
  const { foto, aviso: avisoDaFoto } = fotoCarregada
  // CP2B: com arquétipo a posição é escolhida PELA foto e a região protegida dela é obrigatória — a peça não sai sem
  // a foto pedida (Codex R3). Transitório (o Drive fora do ar): a fila tenta de novo.
  if (!foto && (spec.foto?.url || spec.foto?.driveFileId) && arq) {
    throw new CreativeError(
      'FOTO_INDISPONIVEL',
      `${avisoDaFoto ?? 'A foto não pôde ser carregada.'} Com arquétipo, a posição é escolhida pela foto e a região protegida dela é obrigatória: a peça não sai sem a foto. Tente de novo em instantes.`,
      503,
      { arquetipo: chaveDoArquetipo(arq.definicao) },
    )
  }
  if (!foto && spec.foto && (opcoes.somenteAvaliar || opcoes.selecao)) {
    throw new CreativeError('FOTO_INDISPONIVEL', avisoDaFoto ?? 'A foto candidata não pôde ser carregada. Escolha um arquivo acessível.', 422)
  }
  if (avisoDaFoto) avisos.push(avisoDaFoto)
  const canvas = DIMENSOES[spec.formato]
  const luzDaFoto = foto ? await luzMediaDaFoto(foto.bytes, canvas) : null
  const assinatura = await carregarAssinatura(spec.projectId, spec.formato, {
    paginas: opcoes.paginasDeAssinatura,
    variante: spec.preferencias?.variante ?? null,
    varianteOriginal: spec.preferencias?.varianteOriginal ?? null,
    papeis: spec.blocos.map((b) => b.papel),
    tema: spec.tema ?? spec.nome ?? null,
    luzDaFoto,
    chave: chaveDaPeca(spec),
  })
  // F3: papel que a variante não tem só falta quando nenhuma herança declarada
  // o salva — o texto com `herdaDe` vira camada EXTRA (a mesma resolução que a
  // preparação e o `medir-copy` fazem).
  const faltam = resolverCamadasExtras({ blocos: spec.blocos, camadasExtras: spec.camadasExtras }, assinatura).faltam
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
      `A variante não tem ${faltam.join(', ')}. Escolha uma variante com todos os papéis, ou declare no bloco de que papel ele herda o estilo (herdaDe) — a camada extra veste esse estilo sem ser esse papel.`,
      422, { faltam, variante: assinatura.origem.variante })
  }

  if (arq) conferirLogo(arq.definicao, Boolean(assinatura.logo))

  const geo = assinatura.numeros.geometria[spec.formato]
  const g: GeometriaDaPeca = { W: canvas.width, H: canvas.height, margemH: geo.margemH, safeTopo: geo.safeTopo, safeRodape: geo.safeRodape, gap: geo.gapEntreBlocos }
  // Com arquétipo, a área segura é o piso do PROJETO (antes das margens da página, que são geometria da página);
  // ver `AssinaturaDaMarca.pisoDoProjeto`.
  const pisoArq = arq ? (assinatura.pisoDoProjeto ?? assinatura.numeros.geometria)[spec.formato] : null
  const gArq: GeometriaDaPeca | null = pisoArq ? { ...g, margemH: pisoArq.margemH, safeTopo: pisoArq.safeTopo, safeRodape: pisoArq.safeRodape } : null
  const caixasArq = arq ? caixasMaximas(arq.definicao, arq.formato, canvas) : null
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
  // A preparação dos blocos — agrupamento, arranjos, distribuição das linhas,
  // segunda voz, estilos e a montagem com a régua — mora em
  // `preparar-blocos.ts` e é a MESMA que o `medir-copy` usa (PR 8): medir e
  // compor nunca podem divergir.
  const combinacoesSalvas = await arranjosDasCombinacoes(spec.projectId, medir)
  const familias = await familiasDoProjeto(spec.projectId)
  const preparar = (escalaMaximaDoPapel?: (p: Papel) => number | undefined) =>
    prepararBlocos({
      spec,
      assinatura,
      colunaUtil,
      escalaDoFormato,
      mancha,
      medir,
      familias,
      combinacoesSalvas,
      ...(caixasArq ? { caixaDoPapel: (p: Papel) => caixasArq[papelGeometrico(p)], ...(escalaMaximaDoPapel ? { escalaMaximaDoPapel } : {}) } : {}),
    })
  // Com arquétipo, a preparação passa pela escada da UNIDADE (a mesma do medir-copy) — e a logo dos arranjos sai
  // deles: com arquétipo a logo é do arquétipo (senão a marca sairia duas vezes).
  const noArquetipo: PreparoNoArquetipo | null = arq ? prepararNoArquetipo({ arquetipo: arq.definicao, formato: arq.formato, canvas, gap: g.gap, preparar }) : null
  const preparados = noArquetipo ? noArquetipo.preparados : preparar()
  avisos.push(...preparados.avisos)
  const { arranjos, arranjoPorGrupo, elementosPorTexto, segundaVoz, gruposExtras } = preparados
  const montados = noArquetipo ? noArquetipo.montados : preparados.montados
  for (const id of noArquetipo?.retiradas ?? []) {
    const presos = elementosPorTexto.get(id)
    if (!presos) continue
    const elementos = presos.elementos.filter((e) => !e.logo)
    if (elementos.length > 0) elementosPorTexto.set(id, { ...presos, elementos })
    else elementosPorTexto.delete(id)
    avisos.push(`${id}: a logo presa ao arranjo saiu dele — com arquétipo a logo fica só onde o arquétipo manda.`)
  }
  // 🔴 As fontes são conferidas ANTES das decisões de encaixe. Família que não
  // carregou no servidor faz o medidor cair no FALLBACK — e é dessa medida que
  // saem a escada de encolhimento e o ORÇAMENTO de caracteres. Recusar a peça
  // com um número tirado dali manda reescrever a copy por uma medida que este
  // mesmo PR declara inválida (PR4-FINAL-02, 21/09/2026): é a medida de
  // fallback virando número apresentado como medido.
  // `familiasCandidatas` é o SUPERCONJUNTO do que a peça podia usar (o estilo de
  // cada papel da assinatura e de cada arranjo candidato, mais a família do
  // trecho destacado, que costuma ser a versão pesada — R02); o diagnóstico no
  // fim filtra pelo que as camadas FINAIS realmente usam.
  const semFonte = await familiasNaoCarregadas(preparados.familiasCandidatas)
  // Com uma família do bloco ausente no servidor, a caixa foi medida no
  // fallback: o orçamento não vale, e a recusa diz o que faltou em vez de
  // devolver um número (PR4-FINAL-02). As famílias vêm da RECUSA — só as que
  // entraram na medição —, nunca de uma releitura dos colchetes aqui: fonte de
  // destaque configurada mas não usada (copy sem [colchetes]) invalidava um
  // orçamento bom (PR4-R2-01).
  const recusas: Array<{ papel: Papel; orcamento?: unknown; naoMedido?: boolean; fontesNaoCarregadas?: string[] }> = preparados.recusas.map((r) => {
    const faltando = [...new Set(r.familiasMedidas.filter((f) => semFonte.has(f)))]
    return faltando.length > 0 ? { papel: r.papel, naoMedido: true, fontesNaoCarregadas: faltando } : { papel: r.papel, orcamento: r.orcamento }
  })
  if (recusas.length > 0 && arq) {
    // Com arquétipo a caixa é a REFERÊNCIA do papel: a recusa diz a coluna e a capacidade dela, com o orçamento.
    const fontes = [...new Set(recusas.flatMap((r) => r.fontesNaoCarregadas ?? []))]
    // O MESMO diagnóstico da recusa da materialização: papel, referência, zona efetiva, medida e motivo — mais a
    // coluna, a altura e o orçamento por linha da escada do bloco.
    const detalhe = preparados.recusas.map((r) => {
      const maisLarga = Math.max(0, ...r.orcamento.map((o) => o.largura))
      return {
        codigo: 'ARQUETIPO_TEXTO_NAO_CABE' as const,
        papel: r.papel,
        ...(referenciaDoPapel(arq.definicao, arq.formato, canvas, pisoArq!, papelGeometrico(r.papel)) ?? {}),
        coluna: r.coluna,
        ...(r.altura
          ? { altura: r.altura, medida: { height: r.altura.medida } }
          : maisLarga > 0
            ? { medida: { width: maisLarga } }
            : r.quebras?.length
              ? { quebras: r.quebras, medida: { linhas: Math.max(...r.quebras.map((q) => q.linhas)) } }
              : { medida: {} }),
        motivo: r.altura
          ? `a caixa tem ${r.altura.medida}px de altura no piso da escada e a referência comporta ${r.altura.capacidade}px`
          : maisLarga > 0
            ? `linha de ${maisLarga}px maior que a coluna da referência (${r.coluna}px) mesmo no piso da escada`
            : r.quebras?.length
              ? `${r.quebras.map((q) => `"${q.linha}"`).join(', ')} se desenha em mais de uma linha na coluna da referência (${r.coluna}px) — há quebra dentro do item; cada linha da copy é uma linha`
              : `o bloco não coube na coluna da referência (${r.coluna}px) nem no piso da escada`,
        ...(recusas.find((x) => x.papel === r.papel)?.naoMedido ? { naoMedido: true } : { orcamento: r.orcamento }),
      }
    })
    throw new CreativeError(
      'ARQUETIPO_TEXTO_NAO_CABE',
      `${chaveDoArquetipo(arq.definicao)}: ${preparados.recusas
        .map((r) =>
          r.altura
            ? `${r.papel} tem ${r.altura.medida}px de altura e a referência comporta ${r.altura.capacidade}px mesmo a ${Math.round(0.8 * 100)}% da fonte`
            : r.orcamento.length === 0 && r.quebras?.length
              ? `${r.papel} tem linha que se desenha em mais de uma na coluna da referência (${r.coluna}px) — há quebra dentro do item`
              : `${r.papel} tem linha maior que a coluna da referência (${r.coluna}px) mesmo a ${Math.round(0.8 * 100)}% da fonte`,
        )
        .join('; ')}. Reescreva com o orçamento devolvido${fontes.length > 0 ? ` (a fonte ${fontes.map((f) => `"${f}"`).join(', ')} não carregou: sem orçamento para esses papéis)` : ''}.`,
      422,
      { arquetipo: chaveDoArquetipo(arq.definicao), formato: arq.formato, problemas: detalhe, orcamento: detalhe, ...(fontes.length > 0 ? { fontesNaoCarregadas: fontes } : {}) },
    )
  }
  if (recusas.length > 0) {
    // 🔴 A recusa de quem não pôde ser MEDIDO não vira "reescreva com o
    // orçamento": o número seria o da fonte de fallback (PR4-FINAL-02).
    const semMedida = recusas.filter((r) => r.naoMedido)
    const medidas = recusas.filter((r) => !r.naoMedido)
    const fontes = [...new Set(semMedida.flatMap((r) => r.fontesNaoCarregadas ?? []))]
    throw new CreativeError(
      'TEXTO_NAO_CABE_NA_COLUNA',
      [
        ...(medidas.length > 0 ? [`Linha maior que a coluna útil (${colunaUtil}px) mesmo a 80% da fonte: ${medidas.map((r) => r.papel).join(', ')}. Reescreva com o orçamento devolvido.`] : []),
        ...(semMedida.length > 0
          ? [`Em ${semMedida.map((r) => r.papel).join(', ')} a fonte ${fontes.map((f) => `"${f}"`).join(', ')} não está carregada no servidor: a caixa saiu medida na fonte de fallback, então NÃO há orçamento de caracteres para esses papéis — cadastre a fonte (ou confira o arquivo) antes de mexer na copy.`]
          : []),
      ].join(' '),
      422,
      { orcamento: recusas, ...(fontes.length > 0 ? { fontesNaoCarregadas: fontes } : {}) },
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
  const corQueContrastaComOsTextos = corQueContrasta(coresDaMarca, montados.map((b) => b.cor))
  const cfgGradiente: ConfigDoGradiente = {
    ...assinatura.numeros.gradiente,
    ...(assinatura.gradienteDaPagina ?? {}),
    cor: assinatura.gradienteDaPagina?.cor ?? assinatura.numeros.gradiente.cor ?? corQueContrastaComOsTextos ?? mancha,
  }
  // A cor que PONTUA as posições (e a necessidade de antes) segue a regra antiga — o primeiro gradiente da
  // página, de qualquer forma —: o CP2A não pode mover grupo nenhum, nem quando a página tem gradiente
  // decorativo (que deixou de mandar no tratamento). A posição por polaridade é do CP2B.
  const primeiroGradienteDaPagina = (assinatura.camadasDaPagina ?? []).map(configDaCamada).find((c): c is AjustesDoGradiente => !!c)
  const corDaPontuacao = assinatura.camadasDaPagina
    ? (primeiroGradienteDaPagina?.cor ?? assinatura.numeros.gradiente.cor ?? corQueContrastaComOsTextos ?? mancha)
    : cfgGradiente.cor
  // Só observabilidade (CP1): a mesma ordem da linha acima, dita por extenso.
  const origemDaCorGlobal: OrigemDaCorDoVeu =
    assinatura.gradienteDaPagina?.cor != null
      ? 'pagina'
      : assinatura.numeros.gradiente.cor != null
        ? 'numeros-da-assinatura'
        : corQueContrastaComOsTextos != null
          ? 'contraste-com-os-textos'
          : 'mancha'
  // O gradiente de cada BORDA segue a camada que a página desenhou naquela
  // borda: nos modelos do Quintal (11/09/2026) o rodapé é mais forte que o
  // topo, e ler só a primeira camada prendia o rodapé à força do topo.
  // Só o gradiente de LEITURA da página manda; o decorativo não vira tratamento (CP2A).
  // Declarados aqui (só dependem da assinatura) porque a busca espacial do arquétipo (CP2B) estima o tratamento
  // com eles ANTES de posicionar — o 7c usa os mesmos.
  const gradientesDaPagina = new Map<Borda, AjustesDoGradiente>()
  for (const camada of assinatura.camadasDaPagina ?? []) {
    if (!ehGradienteDeLeituraDaPagina(camada, assinatura.dimensoesDaPagina ?? canvas)) continue
    const ajustes = configDaCamada(camada)
    const borda = ajustes ? bordaDaCamadaDeGradiente(camada) : null
    if (ajustes && borda && !gradientesDaPagina.has(borda)) gradientesDaPagina.set(borda, ajustes)
  }
  const cfgDaBorda = (borda: Borda): ConfigDoGradiente => {
    const daBorda = gradientesDaPagina.get(borda)
    return daBorda ? { ...cfgGradiente, ...daBorda, cor: daBorda.cor ?? cfgGradiente.cor } : cfgGradiente
  }
  // As cores aprovadas: as da assinatura primeiro; a biblioteca por projeto é LEGADO, o último recurso.
  const candidatasDoVeu = candidatasDistintas([
    { cor: assinatura.gradienteDaPagina?.cor, origem: 'pagina' },
    { cor: assinatura.numeros.gradiente.cor, origem: 'numeros-da-assinatura' },
    { cor: assinatura.numeros.mancha, origem: 'mancha' },
    ...coresDaMarca.map((cor) => ({ cor, origem: 'biblioteca-legada' as const })),
  ])

  interface BlocoComposto {
    chave: string
    blocos: BlocoMontado[]
    pilha: ReturnType<typeof empilhar>
    /** A pilha com o recuo que a página desenhou, para o lado em que o grupo alinha lá. */
    pilhaRecuada?: ReturnType<typeof empilhar>
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
    // Grupo só de camadas extras (F3): pousa na borda que o grupo visual diz;
    // não tem caixa na página (o extra não herda a posição do papel de origem).
    const bordaDoExtra = gruposExtras.get(chave)
    if (bordaDoExtra) {
      return { chave, blocos, pilha: empilhar(blocos, g.gap), principal: false, ancora: bordaDoExtra, temCaixa: false, alinha: null, centro: null }
    }
    const centro = caixas.length > 0 ? caixas.reduce((acc, c) => acc + (c.y + c.height / 2), 0) / caixas.length / canvas.height : null
    const soServico = papeis.every((p) => p === 'servico')
    const ancora: Ancora = soServico || centro === null ? (soServico ? 'rodape' : 'topo') : centro > 0.55 ? 'rodape' : centro < 0.45 ? 'topo' : 'meio'
    const ladoDoRecuo = arranjoDoGrupo?.alinhamento === 'esquerda' || arranjoDoGrupo?.alinhamento === 'direita' ? arranjoDoGrupo.alinhamento : null
    return {
      chave,
      blocos,
      pilha: empilhar(blocos, g.gap),
      ...(ladoDoRecuo && blocos.some((b) => (b.recuo ?? 0) > 0) ? { pilhaRecuada: empilhar(blocos, g.gap, ladoDoRecuo) } : {}),
      // A manchete inteira na voz 2 só desenha `headline2` — e o grupo dela
      // continua sendo o principal (PR4-02 da revisão final do Codex).
      principal: papeis.includes('headline') || papeis.includes('headline2'),
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
  //
  // O recuo da página (a linha de serviço 90 px para dentro de "Funcionamento",
  // ao lado do ícone, na segunda da Real) vale no lado em que o grupo alinha lá;
  // virado pelo mapa, o grupo sai rente, como antes.
  const pilhaPara = (c: BlocoComposto, alinha: Alinhamento) => (c.pilhaRecuada && c.pilhaRecuada.lado === alinha ? c.pilhaRecuada : c.pilha)
  const margemDoGrupo = (c: BlocoComposto, alinha: Alinhamento): number | undefined => {
    const a = arranjoPorGrupo.get(c.chave)
    if (a?.origem !== 'pagina' || !a.caixa || assinatura.origem.formatoDaPagina !== spec.formato || alinha === 'centro') return undefined
    const distancia = a.alinhamento === 'direita' ? canvas.width - (a.caixa.x + a.caixa.width) : a.alinhamento === 'esquerda' ? a.caixa.x : null
    if (distancia === null) return undefined
    const p = pilhaPara(c, alinha)
    return Math.max(24, Math.min(240, Math.round(distancia - (alinha === 'esquerda' ? p.esquerda : p.direita))))
  }
  // O vão entre dois grupos que moram na mesma borda é o da PÁGINA: da base da
  // tinta do de cima ao topo da tinta do de baixo, descontado o que os elementos
  // passam das pilhas (o filete sob o apoio, o ícone acima do serviço). O ritmo
  // fixo de 1,6 gap deixava o apoio da terça da Real a 24 px de "Funcionamento",
  // contra 61 no modelo, e abria a segunda 14 px a mais (11/09/2026). Bordas
  // diferentes, página de outro formato ou vão que não é vão (sobreposto, ou
  // maior que um quarto da altura) ficam no ritmo da casa.
  const vaoEntreGrupos = (acima: BlocoComposto, abaixo: BlocoComposto): number => {
    const padrao = Math.round(g.gap * 1.6)
    const a = arranjoPorGrupo.get(acima.chave)
    const b = arranjoPorGrupo.get(abaixo.chave)
    if (a?.origem !== 'pagina' || b?.origem !== 'pagina' || !a.faixaDaTinta || !b.faixaDaTinta) return padrao
    if (assinatura.origem.formatoDaPagina !== spec.formato || acima.ancora !== abaixo.ancora) return padrao
    const vao = (b.faixaDaTinta.topo - a.faixaDaTinta.base) * escalaDoFormato
    if (vao < 0 || vao > canvas.height * 0.25) return padrao
    const ultimo = acima.blocos.length - 1
    const sobraAbaixoDoDeCima = acima.pilha.height - (acima.pilha.offsets[ultimo] + acima.blocos[ultimo].height)
    const sobraAcimaDoDeBaixo = abaixo.pilha.offsets[0] ?? 0
    return Math.max(0, Math.round(vao - sobraAbaixoDoDeCima - sobraAcimaDoDeBaixo))
  }
  // Os blocos secundários reservam a própria altura na âncora deles, para o
  // principal não pousar em cima — cada um com o vão até o vizinho do lado do
  // principal (o próximo grupo da mesma borda, ou o próprio principal).
  const vaoRumoAoPrincipal = new Map<BlocoComposto, number>()
  for (const borda of ['rodape', 'topo'] as const) {
    const fila = secundarios.filter((c) => c.ancora === borda)
    fila.forEach((c, i) => {
      const vizinho = fila[i + 1] ?? principal
      vaoRumoAoPrincipal.set(c, borda === 'rodape' ? vaoEntreGrupos(vizinho, c) : vaoEntreGrupos(c, vizinho))
    })
  }
  const reservaNoRodape = secundarios.filter((c) => c.ancora === 'rodape').reduce((acc, c) => acc + c.pilha.height + vaoRumoAoPrincipal.get(c)!, 0)
  const reservaNoTopo = secundarios.filter((c) => c.ancora === 'topo').reduce((acc, c) => acc + c.pilha.height + vaoRumoAoPrincipal.get(c)!, 0)

  // T1a: com arquétipo, cada papel é uma unidade (papéis que a página agrupa NÃO se fundem), na área segura efetiva
  // do projeto. O PORTÃO ESTRUTURAL (o mesmo do medir-copy): a capacidade de cada referência, a logo, a zona e — CP2B —
  // uma posição VERTICAL em que cada faixa cabe na zona. A referência é a partida quando cabe; quando a área segura do
  // projeto a corta, a partida é a posição válida mais perto dela (resgate, dito no aviso). O que nenhuma posição
  // conserta é recusado com papel, referência, zona, medida e motivo.
  const unidadesArq: UnidadeDoArquetipo[] | null = noArquetipo ? noArquetipo.unidades : null
  let materializacao: Extract<Materializacao, { ok: true }> | null = null
  let partidaArq: Extract<PartidaNoArquetipo, { ok: true }> | null = null
  if (arq && unidadesArq && pisoArq) {
    const p = partidaNoArquetipo({
      arquetipo: arq.definicao,
      formato: arq.formato,
      canvas,
      geometria: pisoArq,
      unidades: unidadesArq,
      logo: assinatura.logo ? { razao: assinatura.logo.razao } : null,
    })
    if ('problemas' in p) {
      const m = p
      throw new CreativeError(
        m.problemas[0].codigo,
        `${chaveDoArquetipo(arq.definicao)}: ${m.problemas.map((p) => `${p.papel} — ${p.motivo}`).join('; ')}. Nenhuma posição da busca dentro da zona conserta isto (o portão estrutural, o mesmo do medir-copy): encurte o texto (menos linhas ou linhas mais curtas).`,
        422,
        { arquetipo: chaveDoArquetipo(arq.definicao), formato: arq.formato, problemas: m.problemas },
      )
    }
    partidaArq = p
    materializacao = p.materializacao
  }

  // 2. O mapa e o assunto — por corte candidato.
  // Com arquétipo (CP2B) a foto escolhe, DENTRO das zonas, a posição de cada faixa e o corte (os mesmos candidatos do
  // caminho sem arquétipo). Na recomposição, a escolha gravada é REPRODUZIDA: o corte dela, sem buscar; a peça do
  // T1a (`modo: 'referencia'`), a referência no corte central. Foto trocada invalida a escolha gravada: busca nova, dita.
  // A identidade da foto é a impressão da URL que a peça DESENHA (a do fundo): a recomposição troca `driveFileId` pela URL da página
  // (`specComACopyDaPagina`), e a mesma foto não pode parecer outra — senão toda recomposição refaria a busca.
  const chaveDaFotoDaPeca = impressaoDaFoto(foto?.url ?? spec.foto?.url ?? spec.foto?.driveFileId)
  const pedidoDeReproducao = arq ? opcoes.escolhaEspacial ?? null : null
  const reproducao = pedidoDeReproducao && pedidoDeReproducao.modo === MODO_BUSCA_ESPACIAL && pedidoDeReproducao.foto !== chaveDaFotoDaPeca ? null : pedidoDeReproducao
  if (pedidoDeReproducao && !reproducao) avisos.push('A foto da peça mudou: a posição foi escolhida de novo pela foto nova (a escolha gravada era de outra foto).')
  // O resgate da partida só é notícia quando a busca roda (na reprodução vale a posição congelada).
  if (partidaArq && !reproducao) {
    for (const r of partidaArq.resgatados) {
      avisos.push(
        r.causa === 'ornamento'
          ? `${r.membro}: com o texto na referência, os ornamentos do arranjo (ícone, filete, selo) saíam da zona efetiva; a faixa partiu da posição válida mais perto dela (${r.dy} px).`
          : `${r.membro}: a referência do arquétipo sai da zona efetiva (a área segura do projeto a corta); a faixa partiu da posição válida mais perto dela (${r.dy} px).`,
      )
    }
  }
  const cortes: CropPosition[] =
    arq && reproducao ? [reproducao.modo === 'referencia' ? 'center-middle' : reproducao.corte] : cortesCandidatos(foto, canvas, spec.preferencias?.enquadramento === 'fixo')
  // O arquivo do catálogo da foto desenhada: o `driveFileId` — ou, com arquétipo, o id que uma URL do Drive carrega (o
  // resolvedor a desenha reconhecendo esse mesmo id; sem isto a região anotada ficava de fora, Codex R4). Sem
  // arquétipo, só o `driveFileId`, como sempre.
  const idDoCatalogo = spec.foto?.driveFileId ?? (arq && spec.foto?.url ? extractDriveFileId(spec.foto.url) : null)
  const assuntoDoCatalogo = foto && idDoCatalogo
    ? opcoes.assuntosDoCatalogo?.has(idDoCatalogo)
      ? opcoes.assuntosDoCatalogo.get(idDoCatalogo) ?? null
      : await assuntoDoCatalogoDaFoto(spec.projectId, idDoCatalogo, !!arq)
    : null

  let melhor: { crop: CropPosition; raster: FotoCinza | null; mapa: MapaDeCalma | null; assunto: Rect | null; escolhido: PontuacaoDePosicao<RotuloDePosicao>; todos: PontuacaoDePosicao<RotuloDePosicao>[] } | null = null
  const cores = montados.map((b) => b.cor)
  // CP2B: a foto em cada corte, para a busca espacial do arquétipo (depois do laço).
  const fotoPorCorte = new Map<CropPosition, { raster: FotoCinza | null; mapa: MapaDeCalma | null; assunto: Rect | null }>()
  const leiturasDoCorte = (crop: CropPosition, raster: FotoCinza | null, mapa: MapaDeCalma | null, assunto: Rect | null): LeituraDoCorte | null =>
    raster && mapa
      ? {
          crop,
          raster,
          mapa,
          regioes: regioesProtegidas({ catalogo: assuntoDoCatalogo ? assunto : null, estimado: assuntoDoCatalogo ? null : assunto }),
          // A fração REAL do assunto do catálogo que o corte mostra: abaixo de 75% o corte é inválido SEMPRE (o catálogo é
          // dado curado), haja ou não outro corte melhor — se nenhum preserva, a peça nova recusa (SEM_COMBINACAO, motivo
          // CORTE_PERDE_O_ASSUNTO): a foto não serve a este formato. Só a peça do T1a reproduzida segue com aviso.
          assuntoVisivel: assuntoDoCatalogo && assunto ? fracaoVisivelDoAssunto(assunto, canvas) : null,
        }
      : null
  for (const crop of cortes) {
    const raster = foto ? await lerFotoComoCover(foto.bytes, canvas, { cropPosition: crop }) : null
    const mapa = raster ? mapaDeCalma(raster) : null
    const assunto = assuntoDoCatalogo ? assuntoEmPixels(assuntoDoCatalogo, { width: foto!.largura, height: foto!.altura }, canvas, crop) : mapa ? estimarAssunto(mapa) : null
    if (arq && materializacao) {
      fotoPorCorte.set(crop, { raster, mapa, assunto })
      continue
    }
    const candidatos = candidatosDePosicao(g, spec, pilha, crop, {
      reservaNoRodape,
      reservaNoTopo,
      alinhaDaAssinatura: principal.alinha ?? assinatura.alinhamento,
      ancoraDaPagina: principal.temCaixa ? principal.ancora : null,
      margemPara: (al) => margemDoGrupo(principal, al),
      larguraPara: (al) => pilhaPara(principal, al).width,
    })
    const pontuados = mapa
      ? pontuarCandidatos({ mapa, candidatos, coresDoTexto: cores, corDaMancha: corDaPontuacao, assunto })
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
  // CP2B: a posição do arquétipo pela foto — a busca pequena (faixas × candidatos × cortes), ou a escolha gravada
  // reproduzida. Sem combinação válida depois de esgotar cortes, posições e tratamentos: SEM_COMBINACAO, ou
  // PREFERENCIA_INVIAVEL quando é o enquadramento fixo pedido que impede a solução que existe.
  let buscaDoArquetipo: DiagnosticoDaBuscaEspacial | null = null
  let escolhaDoArquetipo: Extract<SelecaoNoArquetipo, { ok: true }>['escolha'] | null = null
  if (arq && materializacao && unidadesArq && pisoArq && partidaArq) {
    const planejamento: PlanejamentoDoTratamento = {
      bordasExplicitas: (['topo', 'rodape'] as const).filter((b) => gradientesDaPagina.has(b)),
      planejar: ({ borda, textos, vizinhos, alcance }) => {
        const cfg = cfgDaBorda(borda)
        return planejarTratamentoDaBorda({ borda, textos, vizinhos, candidatas: candidatasDoVeu, curva: cfg.curva, forcaMinima: cfg.forcaMinima, forcaMaxima: cfg.forcaMaxima, altura: alturaDaFaixa(alcance, canvas.height, cfg), H: canvas.height })
      },
    }
    const selecionar = (leituras: LeituraDoCorte[]) =>
      selecionarNoArquetipo({
        arquetipo: arq.definicao,
        formato: arq.formato,
        canvas,
        geometria: pisoArq,
        unidades: unidadesArq,
        logo: assinatura.logo ? { razao: assinatura.logo.razao } : null,
        partida: partidaArq,
        cortes: leituras,
        planejamento,
        foto: chaveDaFotoDaPeca,
        // A peça do T1a (`referencia`) reproduz a referência no corte central; se ela não cabe mais, é recusa.
        reproduzir: reproducao && reproducao.modo === MODO_BUSCA_ESPACIAL ? reproducao : reproducao ? { modo: MODO_BUSCA_ESPACIAL, foto: chaveDaFotoDaPeca, corte: 'center-middle', deslocamentos: {} } : null,
        reproduzirReferencia: reproducao?.modo === 'referencia',
      })
    const leituras = cortes.flatMap((crop) => {
      const f = fotoPorCorte.get(crop)
      const l = f ? leiturasDoCorte(crop, f.raster, f.mapa, f.assunto) : null
      return l ? [l] : []
    })
    const sel = selecionar(leituras)
    if ('resultado' in sel) {
      // O enquadramento FIXO é preferência não essencial: se outro corte resolve, a recusa diz isso.
      if (spec.preferencias?.enquadramento === 'fixo' && !reproducao) {
        const outros = cortesCandidatos(foto, canvas, false).filter((c) => !cortes.includes(c))
        const extras: LeituraDoCorte[] = []
        for (const crop of outros) {
          const raster = foto ? await lerFotoComoCover(foto.bytes, canvas, { cropPosition: crop }) : null
          const mapa = raster ? mapaDeCalma(raster) : null
          const assunto = assuntoDoCatalogo ? assuntoEmPixels(assuntoDoCatalogo, { width: foto!.largura, height: foto!.altura }, canvas, crop) : mapa ? estimarAssunto(mapa) : null
          const l = leiturasDoCorte(crop, raster, mapa, assunto)
          if (l) extras.push(l)
        }
        const alternativa = extras.length > 0 ? selecionar(extras) : null
        if (alternativa && 'escolha' in alternativa) {
          throw new CreativeError(
            'PREFERENCIA_INVIAVEL',
            `${chaveDoArquetipo(arq.definicao)}: com o enquadramento fixo (corte central) nenhuma posição permitida resolve a foto (${Object.entries(contarRecusas(sel.resultado.ordenadas)).map(([m, n]) => `${m} ×${n}`).join(', ')}), e o corte ${alternativa.crop} resolve. Peça sem enquadramento fixo, ou troque a foto.`,
            422,
            {
              preferencia: 'enquadramento',
              pedido: 'fixo',
              motivo: sel.motivo,
              arquetipo: chaveDoArquetipo(arq.definicao),
              formato: arq.formato,
              recusasNoCorteFixo: contarRecusas(sel.resultado.ordenadas),
              alternativa: { crop: alternativa.crop, deslocamentos: alternativa.escolha.deslocamentos, recusas: alternativa.diagnostico.recusas },
            },
          )
        }
        if (alternativa && 'resultado' in alternativa) {
          sel.resultado.ordenadas.push(...alternativa.resultado.ordenadas)
          sel.resultado.avaliadas += alternativa.resultado.avaliadas
          cortes.push(...extras.map((l) => l.crop))
        }
      }
      const contagem = contarRecusas(sel.resultado.ordenadas)
      // O motivo de TODOS os cortes avaliados (os do enquadramento fixo juntados acima entram na conta).
      const motivo = motivoDaFalta(sel.resultado.ordenadas)
      const saida =
        motivo === MOTIVOS_DE_ELIMINACAO.corteSemOAssunto
          ? 'Nenhum corte da foto neste formato mostra 75% do assunto que o catálogo marca: troque a foto, ou peça outro formato.'
          : motivo === MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel || motivo === MOTIVOS_DO_TRATAMENTO.piorou
            ? 'Troque a foto, ou a variante (as cores dos textos que dividem a borda), ou o arquétipo.'
            : 'Troque a foto, ou o arquétipo.'
      throw new CreativeError(
        'SEM_COMBINACAO',
        `${chaveDoArquetipo(arq.definicao)}: nenhuma combinação de corte e posição dentro das zonas serve a esta foto e a esta copy (${sel.resultado.avaliadas} avaliadas; ${Object.entries(contagem).map(([m, n]) => `${m} ×${n}`).join(', ')}). ${saida}`,
        422,
        { motivo, arquetipo: chaveDoArquetipo(arq.definicao), formato: arq.formato, cortesAvaliados: cortes, combinacoesAvaliadas: sel.resultado.avaliadas, recusas: contagem, exemplos: exemplosDeRecusa(sel.resultado.ordenadas) },
      )
    }
    materializacao = sel.materializacao
    avisos.push(...sel.avisos)
    const f = fotoPorCorte.get(sel.crop) ?? { raster: null, mapa: null, assunto: null }
    if (assuntoDoCatalogo && f.assunto && fracaoVisivelDoAssunto(f.assunto, canvas) < 0.75) avisos.push(`O corte ${sel.crop} preserva menos de 75% da caixa do assunto catalogado.`)
    buscaDoArquetipo = reproducao?.modo === 'referencia' ? null : sel.diagnostico
    escolhaDoArquetipo = sel.escolha
    melhor = {
      crop: sel.crop,
      raster: f.raster,
      mapa: f.mapa,
      assunto: f.assunto,
      escolhido: {
        rect: materializacao.papeis.headline?.posicao ?? { x: 0, y: 0, width: 0, height: 0 },
        preferencia: 1,
        rotulo: { ancora: arq.definicao.preferencias.ancora, alinha: arq.definicao.preferencias.alinha, crop: sel.crop },
        pontuacao: 1,
        calma: 1,
        tintaNecessaria: 0,
        cobreAssunto: sel.diagnostico.vencedor?.regiaoEstimada?.cobertura ?? 0,
        descartado: false,
        motivo: reproducao?.modo === 'referencia' ? `arquétipo ${chaveDoArquetipo(arq.definicao)} na posição de referência (peça do T1a reproduzida)` : `arquétipo ${chaveDoArquetipo(arq.definicao)}: ${sel.diagnostico.motivo}`,
      },
      todos: [],
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
    const { esquerda, direita, recuos } = pilhaPara(c, alinhaDoBloco)
    const camadas = c.blocos.map((b, i) => {
      const recuo = recuos?.[i] ?? 0
      const x =
        alinhaDoBloco === 'esquerda'
          ? rect.x + esquerda + recuo
          : alinhaDoBloco === 'direita'
            ? rect.x + rect.width - direita - b.width - recuo
            : rect.x + esquerda + (rect.width - esquerda - direita - b.width) / 2
      const camada: Layer = { ...b.layer, position: { x: Math.round(x), y: Math.round(rect.y + c.pilha.offsets[i]) }, style: { ...b.layer.style, textAlign } }
      camadasDeTexto.push(camada)
      return camada
    })
    rectsDeGrupo.push({ grupo: c.chave, rect, cores: c.blocos.map((b) => b.cor), camadas, ancora: ancoraDoBloco })
  }
  if (arq && unidadesArq && materializacao) {
    // T1a: cada unidade na posição que a materialização deu (a referência, alinhada como o arquétipo manda) — pela
    // MESMA conta que o medir-copy usa para conferir a geometria final (`camadasNaReferencia`).
    for (const { unidade: u, rect, camadas } of camadasNaReferencia(unidadesArq, materializacao.papeis, arq.definicao.preferencias.alinha)) {
      // A borda do tratamento é a GEOMÉTRICA da posição final (`meio` → o lado de H/2 da caixa do grupo, com os
      // elementos): a mesma da régua e do revisor, e a mesma que a busca usou para estimar o tratamento (CP2B).
      const ancoraDaUnidade: Ancora = 'meio'
      camadasDeTexto.push(...camadas)
      rectsDeGrupo.push({ grupo: grupoDaUnidade(u.papel), rect, cores: u.blocos.map((b) => b.cor), camadas, ancora: ancoraDaUnidade })
    }
    // O que o autofix resolveria encolhendo (transbordo, colisão) é recusa: abaixo da escada a peça sairia menor que o
    // piso e diferente do que o medir-copy mediu — que confere esta mesma lista.
    const ajustes = ajusteFinalNecessario(camadasDeTexto, canvas, medir)
    if (ajustes.length > 0) {
      throw new CreativeError(
        'ARQUETIPO_AJUSTE_FINAL',
        `${chaveDoArquetipo(arq.definicao)}: na posição ${buscaDoArquetipo ? 'escolhida' : 'de referência'}, ${ajustes.map((a) => a.detalhe).join('; ')}. Com arquétipo a peça não encolhe abaixo da escada nem a caixa é movida.`,
        422,
        { arquetipo: chaveDoArquetipo(arq.definicao), formato: arq.formato, problemas: ajustes },
      )
    }
  } else {
    posicionar(principal, rectPrincipal, alinha, ancora)
    let ocupadoNoRodape = 0
    let ocupadoNoTopo = 0
    for (const c of secundarios) {
      const al = c.alinha ?? alinha
      let rect = retanguloDoBloco(g, c.ancora, al, pilhaPara(c, al).width, c.pilha.height, margemDoGrupo(c, al))
      if (c.ancora === 'rodape') {
        rect = { ...rect, y: g.H - g.safeRodape - c.pilha.height - ocupadoNoRodape }
        ocupadoNoRodape += c.pilha.height + (vaoRumoAoPrincipal.get(c) ?? Math.round(g.gap * 1.6))
      } else if (c.ancora === 'topo') {
        rect = { ...rect, y: g.safeTopo + ocupadoNoTopo }
        ocupadoNoTopo += c.pilha.height + (vaoRumoAoPrincipal.get(c) ?? Math.round(g.gap * 1.6))
      }
      posicionar(c, rect, al, c.ancora)
    }
  }

  // 4. SEM HALO (Ciro, 11/09/2026: "prefiro que deixe de usar o halo"). O fundo
  //    de texto que a página de assinatura ainda carrega não é copiado; o
  //    contraste é o gradiente de leitura, montado no passo 7b sobre as caixas
  //    FINAIS (o autofix ainda pode mexer nelas). Aqui só se mede quanto a foto
  //    pede sob um retângulo — a mesma conta que calibrava o halo.
  const necessidadeSob = (rect: Rect, coresDoTexto: string[]): number => {
    const luz = melhor.raster ? luzNoRect(melhor.raster, rect) : null
    if (!luz) return 0
    const c = calibrarHalo({ texto: rect, luz, coresDoTexto, corDaMancha: corDaPontuacao, raioBase: 0 })
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
  if (arq && assinatura.logo && materializacao) {
    // T1a: a logo é do arquétipo. Na referência fixa, em contain (a proporção do arquivo, nunca deformada); na
    // automática, a escolha de canto de sempre (o mais calmo), no piso do projeto. Contraste da logo é do CP3.
    const fixa = materializacao.papeis.logo?.posicao
    const largura = Math.round(assinatura.logo.largura * (spec.formato === 'story' ? 1 : escalaDoFormato))
    let canto: { canto: Canto; rect: Rect } | null = fixa
      ? { canto: arq.definicao.preferencias.cantoDaMarca as Canto, rect: { x: fixa.x, y: fixa.y, width: fixa.width, height: fixa.height } }
      : materializacao.logoAutomatica
        ? escolherCanto({
            g: gArq!,
            mapa: melhor.mapa,
            blocos: rectsDeGrupo.map((r) => r.rect),
            logo: { w: largura, h: Math.round(largura * assinatura.logo.razao) },
            // Na recomposição, o canto CONGELADO com a posição (CP2B): a copy nova não troca a logo de canto.
            pedido: reproducao?.cantoDaLogo ?? undefined,
            formato: spec.formato,
          })
        : null
    // O canto congelado que agora encosta no texto novo não fica por cima dele: o canto livre de sempre, DITO.
    const congelado = !fixa && materializacao.logoAutomatica ? reproducao?.cantoDaLogo ?? null : null
    if (canto && congelado && rectsDeGrupo.some((r) => intersecta(r.rect, canto.rect))) {
      const livre = escolherCanto({ g: gArq!, mapa: melhor.mapa, blocos: rectsDeGrupo.map((r) => r.rect), logo: { w: largura, h: Math.round(largura * assinatura.logo.razao) }, pedido: undefined, formato: spec.formato })
      if (livre) {
        avisos.push(`A logo saiu do canto congelado (${congelado}) para o ${livre.canto}: lá ela encostava no texto novo.`)
        canto = livre
      }
    }
    if (canto) {
      camadasDaLogo.push({
        id: 'logo',
        name: 'Logo',
        type: 'logo',
        visible: true,
        locked: false,
        order: 0,
        position: { x: canto.rect.x, y: canto.rect.y },
        size: { width: canto.rect.width, height: canto.rect.height },
        rotation: 0,
        fileUrl: assinatura.logo.url,
        style: { objectFit: 'contain' },
        metadata: { compositor: { canto: canto.canto } },
      })
      logoDiag = { canto: canto.canto, tinta: 0 }
      if (materializacao.logoAutomatica && escolhaDoArquetipo) escolhaDoArquetipo.cantoDaLogo = canto.canto
    }
  } else if (assinatura.logo && spec.preferencias?.cantoDaMarca !== 'nenhum' && !logoNoArranjo) {
    const largura = Math.round(assinatura.logo.largura * (spec.formato === 'story' ? 1 : escalaDoFormato))
    const altura = Math.round(largura * assinatura.logo.razao)
    // A logo onde a PÁGINA a pôs — no alto e ao centro no "Almoço TERO", no
    // canto de cima nos "Clássicos" —, quando ali ela não encosta em nenhum
    // TEXTO da peça; senão, o canto mais calmo de sempre. Confere-se a caixa de
    // cada texto, e não o retângulo do grupo inteiro: no "Convite do dia" do
    // Quintal a linha longa do serviço esticava o retângulo do rodapé até a
    // logo, que no modelo mora ao lado do CTA curto, e ela fugia para o canto de
    // cima (11/09/2026).
    const encostaNumTexto = (rect: Rect) =>
      rectsDeGrupo.some((r) => r.camadas.some((c) => intersecta({ x: c.position.x, y: c.position.y, width: c.size.width, height: c.size.height }, rect)))
    // O canto pedido na spec vale enquanto não encosta num texto. Pedido gravado
    // numa peça que depois é refeita punha a logo em cima do título: na Real
    // (11/09/2026) o chat gravou "superior-direito" com a manchete à esquerda,
    // e a variante alinhada à direita levou pré-título e manchete para baixo da
    // logo. Encostando, o pedido cai com aviso e vale a regra de sempre: a
    // posição da página, depois o canto livre.
    const pedidoBruto = spec.preferencias?.cantoDaMarca
    const pedido: Canto | null = pedidoBruto && pedidoBruto !== 'auto' ? pedidoBruto : null
    const pedidoEncosta = pedido ? encostaNumTexto(retanguloDoCanto(g, pedido, largura, altura)) : false
    if (pedido && pedidoEncosta) avisos.push(`A logo não foi para o canto pedido (${pedido}): ali ela encostava no texto.`)
    const pedidoQueVale = pedido && !pedidoEncosta ? pedido : null
    const naPagina =
      !pedidoQueVale && assinatura.logo.posicao && assinatura.origem.formatoDaPagina === spec.formato
        ? { x: Math.round(assinatura.logo.posicao.x), y: Math.round(assinatura.logo.posicao.y), width: largura, height: altura }
        : null
    const livreNaPagina = naPagina && !encostaNumTexto(naPagina) ? naPagina : null
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
          pedido: pedidoQueVale ?? undefined,
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

  // 6c. As fontes que NÃO carregaram no servidor: o texto nelas foi medido e
  //     vai ser desenhado na fonte de fallback — a medida não vale, e isso
  //     precisa ficar dito ("não medido"), nunca parecer medida (PR 4).
  // A família do TRECHO destacado (rich text) conta também: o destaque pode
  // estar noutra família (a versão pesada), e é com ela que a largura extra é
  // medida — ausente, a medida do bloco não vale (R02 da revisão do Codex).
  // A conferência já rodou ANTES do encaixe (PR4-FINAL-02) sobre o
  // superconjunto do que a peça podia usar; aqui só se filtra pelo que as
  // camadas FINAIS realmente usam, para o aviso não citar fonte de um arranjo
  // que não foi escolhido.
  const usadasNaPeca = new Set(montados.flatMap((b) => familiasDaCamada(b.layer as Layer)))
  const fontesNaoCarregadas = new Set([...semFonte].filter((f) => usadasNaPeca.has(f)))
  for (const f of fontesNaoCarregadas) avisos.push(`a fonte "${f}" não está carregada no servidor: o texto nela saiu na fonte de fallback e a medida não vale (não medido)`)

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
  if (arq) {
    // Defesa: a conferência acima garante que o autofix não tem o que fazer; se ele mexeu num texto, a peça não é a medida.
    const lh = (l: Layer) => l.textboxConfig?.autoWrap?.lineHeight ?? l.style?.lineHeight
    const mexidos = camadasDeTexto.filter((c) => {
      const f = layers.find((l) => l.id === c.id)
      return !f || f.style?.fontSize !== c.style?.fontSize || lh(f) !== lh(c) || f.position.x !== c.position.x || f.position.y !== c.position.y
    })
    if (mexidos.length > 0) {
      throw new CreativeError('ARQUETIPO_AJUSTE_FINAL', `${chaveDoArquetipo(arq!.definicao)}: o ajuste final mexeria em ${mexidos.map((c) => c.id).join(', ')} — com arquétipo a peça sai como medida, ou não sai.`, 422, {
        arquetipo: chaveDoArquetipo(arq!.definicao),
        camadas: mexidos.map((c) => c.id),
      })
    }
  }

  // 7a. Os ELEMENTOS presos aos textos (ícone, filete, selo, a logo do
  //     arranjo), na tinta FINAL — o autofix pode ter encolhido a fonte. Entram
  //     logo acima dos textos, antes da logo do canto.
  // Id único na peça inteira: a logo presa a um grupo se chama `logo`, e dois
  // grupos com ela dariam duas camadas de mesmo id (mesma varredura).
  const idsNaPeca = new Set(layers.map((l) => l.id))
  const camadasDeElementos = layers
    .flatMap((l) => {
      const presos = elementosPorTexto.get(l.id)
      return presos && l.visible !== false ? camadasDosElementos(l, presos.elementos, presos.escala) : []
    })
    .map((c) => {
      let id = c.id
      for (let n = 2; idsNaPeca.has(id); n++) id = `${c.id}-${n}`
      idsNaPeca.add(id)
      return id === c.id ? c : { ...c, id }
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
  // T1a: o autofix pode encolher a fonte e legalizar a altura da caixa, e os elementos presos entram agora — a
  // unidade FINAL (textos + elementos) tem de continuar na zona efetiva. Fora dela, recusa (nada é movido).
  if (arq && unidadesArq && materializacao) {
    const fora: Array<{ codigo: 'ARQUETIPO_FORA_DA_ZONA'; papel: string; referencia: RetanguloPx; zonaEfetiva: RetanguloPx; medida: { width: number; height: number }; motivo: string }> = []
    const foraDaZona = (r: Rect, z: RetanguloPx) => r.x < z.x - 1 || r.y < z.y - 1 || r.x + r.width > z.x + z.width + 1 || r.y + r.height > z.y + z.height + 1
    const conferir = (papel: string, caixa: Rect | null, m: { referencia: RetanguloPx; zonaEfetiva: RetanguloPx } | undefined) => {
      if (!caixa || !m || !foraDaZona(caixa, m.zonaEfetiva)) return
      const z = m.zonaEfetiva
      fora.push({
        codigo: 'ARQUETIPO_FORA_DA_ZONA',
        papel,
        referencia: m.referencia,
        zonaEfetiva: z,
        medida: { width: Math.round(caixa.width), height: Math.round(caixa.height) },
        motivo: `depois do ajuste final (autofix e elementos presos), a caixa (${Math.round(caixa.x)},${Math.round(caixa.y)} ${Math.round(caixa.width)}×${Math.round(caixa.height)}) sai da zona efetiva (${z.x},${z.y} ${z.width}×${z.height})`,
      })
    }
    for (const u of unidadesArq) {
      const ids = new Set(u.blocos.map((b) => b.layer.id))
      conferir(u.papel, uniao(layers.filter((l) => l.visible !== false && (ids.has(l.id) || ids.has(elementoDe(l)))).map(caixaDe)), materializacao.papeis[u.papel])
    }
    const logoFinalArq = layers.find((l) => l.id === 'logo')
    if (logoFinalArq) conferir('logo', caixaDe(logoFinalArq), materializacao.papeis.logo)
    if (fora.length > 0) {
      throw new CreativeError(
        'ARQUETIPO_FORA_DA_ZONA',
        `${chaveDoArquetipo(arq.definicao)}: ${fora.map((f) => `${f.papel} — ${f.motivo}`).join('; ')}. Com arquétipo a caixa não é movida depois da escolha.`,
        422,
        { arquetipo: chaveDoArquetipo(arq.definicao), formato: arq.formato, problemas: fora },
      )
    }
  }
  const gruposDeTexto = rectsDeGrupo.map((grupo) => {
    const ids = new Set(grupo.camadas.map((c) => c.id))
    // O gradiente cobre também os elementos presos aos textos do grupo
    const doGrupo = layers.filter((l) => l.visible !== false && (ids.has(l.id) || ids.has(elementoDe(l))))
    const rect = uniao(doGrupo.map(caixaDe)) ?? grupo.rect
    return { grupo: grupo.grupo, ids, rect, ancora: grupo.ancora, necessidade: necessidadeSob(rect, grupo.cores) }
  })
  const paraGradiente: GrupoParaGradiente[] = gruposDeTexto.map(({ rect, ancora, necessidade }) => ({ rect, ancora, necessidade }))
  const logoFinal = layers.find((l) => l.id === 'logo')
  const logoNaPeca = logoFinal && melhor.raster ? { rect: caixaDe(logoFinal), borda: bordaDoGrupo(caixaDe(logoFinal), null, canvas.height), necessidade: necessidadeSob(caixaDe(logoFinal), ['#FFFFFF']) } : null
  if (logoNaPeca) {
    // A logo não tem mais halo: canto claro numa borda SEM texto ganha um
    // gradiente fraco (metade da necessidade), só o bastante para ela ler.
    const bordaTemTexto = paraGradiente.some((grupo) => bordaDoGrupo(grupo.rect, grupo.ancora, canvas.height) === logoNaPeca.borda)
    if (!bordaTemTexto && logoNaPeca.necessidade > 0.5) paraGradiente.push({ rect: logoNaPeca.rect, ancora: logoNaPeca.borda, necessidade: logoNaPeca.necessidade * 0.5 })
  }
  // 7c. O TRATAMENTO DE LEITURA POR BORDA (CP2A, 14/10/2026). Na borda cujo
  //     gradiente a página de assinatura desenha (o tratamento EXPLÍCITO do
  //     template), nada muda. Nas outras, o fundo medido sob cada texto decide
  //     — texto claro pede véu escuro, texto escuro pede véu claro; sem
  //     necessidade, nenhum véu; claros e escuros sem leitura na mesma borda,
  //     estratégia inviável (a posição é do CP2B) — entre as cores aprovadas da
  //     marca, nunca uma que piore algum texto. Os grupos não se movem.
  const H = canvas.height
  const bordaDe = (p: { rect: Rect; ancora?: Ancora | null }) => bordaDoGrupo(p.rect, p.ancora, H)
  const gruposNaBorda = (borda: Borda) => gruposDeTexto.filter((g) => bordaDe(g) === borda)
  const alcanceDaBorda = (borda: Borda) => Math.max(...gruposNaBorda(borda).map((g) => alcanceDoGrupo(g.rect, borda, H)))
  const bordasAutomaticas = (['topo', 'rodape'] as const).filter((b) => !gradientesDaPagina.has(b) && gruposNaBorda(b).length > 0)
  let planos: Array<Omit<PlanoDaBorda, 'estado'> & { estado: PlanoDaBorda['estado'] | 'recusado' | 'nao-medido' }> | null = null
  if (foto && bordasAutomaticas.length > 0) {
    try {
      const fundos = new Map((await medirFundoDosTextos({ layers, canvas, background: assinatura.numeros.fundo })).map((f) => [f.camada, f]))
      const textosDos = (grupos: typeof gruposDeTexto) => grupos.flatMap((g) => [...g.ids].flatMap((id) => (fundos.has(id) ? [{ ...fundos.get(id)!, grupo: g.grupo }] : [])))
      planos = bordasAutomaticas.map((borda) => {
        const cfg = cfgDaBorda(borda)
        return planejarTratamentoDaBorda({
          borda,
          textos: textosDos(gruposNaBorda(borda)),
          vizinhos: textosDos(gruposDeTexto.filter((g) => bordaDe(g) !== borda)),
          candidatas: candidatasDoVeu,
          curva: cfg.curva,
          forcaMinima: cfg.forcaMinima,
          forcaMaxima: cfg.forcaMaxima,
          altura: alturaDaFaixa(alcanceDaBorda(borda), H, cfg),
          H,
        })
      })
    } catch (erro) {
      // Sem a medida não há decisão: nenhum véu AUTOMÁTICO de texto (a regra antiga, de uma cor para a peça e
      // piso de 0.45, voltaria a escolher às cegas — revisão do Codex). O explícito do template fica.
      planos = bordasAutomaticas.map((borda) => ({ borda, estado: 'nao-medido' as const, grupos: gruposNaBorda(borda).map((g) => g.grupo), textos: [] }))
      avisos.push(`O tratamento de leitura por borda não mediu o fundo (${(erro as Error).message}): nenhum véu automático de texto nesta peça.`)
    }
  }
  const planoDa = (borda: Borda) => planos?.find((p) => p.borda === borda) ?? null
  for (const p of planos ?? []) {
    if (p.estado !== 'inviavel') continue
    const nomeDaBorda = p.borda === 'topo' ? 'Topo' : 'Rodapé'
    const semLeitura = p.textos.filter((t) => !t.ok)
    const protegidos = [...new Set((p.recusadas ?? []).flatMap((r) => (r.camada ? [r.camada] : [])))]
    avisos.push(
      p.motivo !== MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel
        ? `${nomeDaBorda}: ${semLeitura.map((t) => t.camada).join(', ')} sem leitura e nenhuma cor aprovada da marca serve sem piorar outro texto (${p.motivo}); nenhum véu automático.`
        : new Set(semLeitura.map((t) => t.polaridade)).size > 1
          ? `${nomeDaBorda}: texto claro e texto escuro sem leitura na mesma borda — nenhum véu serve aos dois (POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA); nenhum véu automático. A solução é de posição.`
          : `${nomeDaBorda}: o véu que ${semLeitura.map((t) => t.camada).join(', ')} pede pioraria a leitura de ${protegidos.join(', ')}, de polaridade oposta (POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA); nenhum véu automático. A solução é de posição.`,
    )
  }
  /** Os véus da LOGO: o da borda só com logo e o da borda de texto que ficou sem véu de texto. */
  const veusDaLogo = new Set<string>()
  const gradientes: GradienteMontado[] = foto
    ? (['topo', 'rodape'] as const).flatMap((borda) => {
        const plano = planoDa(borda)
        if (!plano) {
          const veus = montarGradientes({ W: canvas.width, H, grupos: paraGradiente.filter((p) => bordaDe(p) === borda), cfg: cfgDaBorda(borda) })
          // Sem plano e sem gradiente na página, a borda só tem a logo: o véu dela é automático e entra na regra 7.
          if (!gradientesDaPagina.has(borda)) for (const v of veus) veusDaLogo.add(v.layer.id)
          return veus
        }
        if (plano.estado !== 'tratado') {
          // A logo desta borda ficava sob o véu do texto; sem ele, vale a regra da borda só com a logo (a logo é do
          // CP3). O véu dela entra na regra 7: se piorar algum texto, sai.
          if (logoNaPeca?.borda !== borda || logoNaPeca.necessidade <= 0.5) return []
          const veus = montarGradientes({ W: canvas.width, H, grupos: [{ rect: logoNaPeca.rect, ancora: borda, necessidade: logoNaPeca.necessidade * 0.5 }], cfg: cfgDaBorda(borda) })
          for (const v of veus) veusDaLogo.add(v.layer.id)
          return veus
        }
        const altura = alturaDaFaixa(alcanceDaBorda(borda), H, cfgDaBorda(borda))
        const layer = camadaDeGradiente({ borda, W: canvas.width, H, altura, cor: plano.cor!, curva: cfgDaBorda(borda).curva, forca: plano.forca! })
        return [{ borda, forca: plano.forca!, altura, alcance: Math.round(alcanceDaBorda(borda)), layer }]
      })
    : []
  if (gradientes.length > 0) layers = inserirAcimaDaFoto(layers, gradientes.map((gr) => gr.layer))
  // R10: a identidade de cada camada é única no conjunto FINAL. A validação da
  // spec já recusa os nomes internos; esta é a última porta — id repetido
  // tornaria ambíguos seleção, ajuste e leitura da copy por id.
  const idsRepetidosNaPeca = idsDeCamadaRepetidos(layers)
  if (idsRepetidosNaPeca.length > 0) {
    const problema = `id de camada repetido na composição: ${idsRepetidosNaPeca.join(', ')}`
    throw new CreativeError('SPEC_INVALIDA', problema, 400, { problemas: [problema] })
  }

  // 8. A régua (F2): o p98 real sob cada bloco na peça renderizada — corrige a
  //    FORÇA do gradiente uma vez dentro da faixa e AVISA quando a foto não
  //    carrega o texto.
  let contraste: ContrasteMedido[] | null = null
  let tratamentoPiorou: PioraDeTratamento[] | undefined
  let intervencaoDeTexto: IntervencaoDeTexto | undefined
  // Os véus AUTOMÁTICOS (o do tratamento por borda e o da logo em borda de texto), com a luz da cor no espaço
  // da medida — só eles a regra 7 pode tirar; o explícito do template e o decorativo, nunca.
  const corDoVeu = (l: Layer) => (l.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops?.find((st) => typeof st.color === 'string')?.color ?? '#000000'
  const automaticos = new Map(
    gradientes.filter((g) => planoDa(g.borda)?.estado === 'tratado' || veusDaLogo.has(g.layer.id)).map((g) => [g.layer.id, luzMedida(corDoVeu(g.layer))] as const),
  )
  try {
    const faixa: [number, number] = [
      Math.min(cfgDaBorda('topo').forcaMinima, cfgDaBorda('rodape').forcaMinima),
      Math.max(cfgDaBorda('topo').forcaMaxima, cfgDaBorda('rodape').forcaMaxima),
    ]
    const medir = (camadas: Layer[], corrigir: boolean) =>
      medirContrasteDaPeca({ layers: camadas, canvas, background: assinatura.numeros.fundo, faixa, corrigir, medirIntervencao: opcoes.medirComparacao })
    let regua = await medir(layers, true)
    // A correção de força da régua que fez PIORAR um texto (nova piora, ou piora mais funda): só os véus
    // envolvidos voltam à força de antes da correção; a correção dos outros fica (CP2A).
    const antesDaCorrecao = regua.pioras ?? []
    const novas = (regua.piorasDepoisDaCorrecao ?? []).filter((p) => {
      const q = antesDaCorrecao.find((x) => x.camada === p.camada)
      return !q || (p.polaridade === 'clara' ? p.depois > q.depois : p.depois < q.depois)
    })
    if (novas.length > 0) {
      const envolvidos = new Set(novas.flatMap((p) => p.gradientes ?? (p.gradiente ? [p.gradiente] : [])))
      const deAntes = new Map(layers.map((l) => [l.id, l]))
      regua = await medir(regua.layers.map((l) => (envolvidos.has(l.id) && deAntes.has(l.id) ? deAntes.get(l.id)! : l)), false)
      avisos.push(`A correção de força da régua piorava a leitura de ${novas.map((p) => p.camada).join(', ')}: ${[...envolvidos].join(', ')} ficou na força de antes.`)
    }
    // Regra 7 (CP2A): o véu AUTOMÁTICO que a régua provou pior (com e sem ele) não fica na peça — e a peça sem
    // ele é medida e conferida de novo, até nenhum automático restante piorar (no máximo um por véu).
    const restantes = new Map(automaticos)
    for (let rodada = 0; rodada < automaticos.size; rodada++) {
      const recusados = gradientesARecusar(regua.piorasDepoisDaCorrecao ?? regua.pioras ?? [], restantes)
      if (recusados.length === 0) break
      for (const id of recusados) {
        const recusado = regua.layers.find((l) => l.id === id)
        const borda: Borda = id.endsWith('topo') ? 'topo' : 'rodape'
        const p = planoDa(borda)
        if (p?.estado === 'tratado' && !veusDaLogo.has(id)) {
          p.estado = 'recusado'
          p.motivo = MOTIVOS_DO_TRATAMENTO.piorou
          p.recusadas = [...(p.recusadas ?? []), { cor: p.cor!, origem: p.origemDaCor!, motivo: MOTIVOS_DO_TRATAMENTO.piorou, ...(recusado ? { forca: forcaDaCamada(recusado) } : {}) }]
        }
        restantes.delete(id)
        avisos.push(`${borda === 'topo' ? 'Topo' : 'Rodapé'}: o véu ${veusDaLogo.has(id) ? 'da logo ' : ''}${recusado ? corDoVeu(recusado) : ''} piorou a leitura medida (TRATAMENTO_PIOROU_LEITURA) e saiu da peça.`)
      }
      regua = await medir(regua.layers.filter((l) => !recusados.includes(l.id)), false)
    }
    layers = regua.layers
    contraste = regua.medidas
    // A peça que sai é a corrigida: a piora que vale é a dela.
    tratamentoPiorou = regua.piorasDepoisDaCorrecao ?? regua.pioras
    intervencaoDeTexto = regua.intervencao
    avisos.push(...regua.avisos)
  } catch (erro) {
    // Sem a régua, nenhum véu AUTOMÁTICO fica sem a conferência da regra 7 (CP2A): sai da peça, dito.
    const semConferencia = layers.filter((l) => automaticos.has(l.id)).map((l) => l.id)
    if (semConferencia.length > 0) {
      layers = layers.filter((l) => !automaticos.has(l.id))
      for (const p of planos ?? []) if (p.estado === 'tratado') p.estado = 'nao-medido'
    }
    avisos.push(`A régua de contraste não rodou: ${(erro as Error).message}${semConferencia.length > 0 ? ` — os véus automáticos (${semConferencia.join(', ')}) saíram, sem conferência` : ''}`)
  }

  /** O tratamento de cada borda com texto, para o diagnóstico: o plano, e o fundo antes/depois que a régua mediu. */
  const tratamentoPorBorda = (): TratamentoDaBorda[] => {
    const medidaDe = new Map((contraste ?? []).flatMap((m) => (m.textos ?? []).map((t) => [t.camada, t] as const)))
    return (['topo', 'rodape'] as const)
      .filter((borda) => gruposNaBorda(borda).length > 0)
      .map((borda): TratamentoDaBorda => {
        const plano = planoDa(borda)
        const camada = gradientes.map((g) => layers.find((l) => l.id === g.layer.id && g.borda === borda)).find(Boolean)
        const textos = gruposNaBorda(borda).flatMap((g) =>
          [...g.ids].flatMap((id): LeituraDoTratamento[] => {
            const t = medidaDe.get(id)
            const polaridade = t?.cor && t.percentis && !t.caixaDeFundo ? polaridadeDoTexto(t.cor, t.percentis.sem) : null
            if (t?.cor && t.percentis && polaridade) {
              const clara = polaridade.polaridade === 'clara'
              const antes = clara ? t.percentis.sem.p98 : t.percentis.sem.p02
              const depois = clara ? t.percentis.com.p98 : t.percentis.com.p02
              const ganho = clara ? antes - depois : depois - antes
              const alvo = Math.round(clara ? alvoPorContraste(t.cor, 3) : alvoClaroPorContraste(t.cor, 3))
              return [{ camada: id, polaridade: polaridade.polaridade, percentil: clara ? 'p98' : 'p02', antes, alvo, depois, efeito: ganho > TOLERANCIA_DE_PIORA ? 'melhorou' : ganho < -TOLERANCIA_DE_PIORA ? 'piorou' : 'neutro' }]
            }
            const doPlano = plano?.textos.find((x) => x.camada === id)
            return doPlano ? [{ camada: id, polaridade: doPlano.polaridade, percentil: doPlano.percentil, antes: doPlano.antes, alvo: doPlano.alvo, depois: null, efeito: null }] : []
          }),
        )
        const corDesenhada = (camada?.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops?.find((st) => typeof st.color === 'string')?.color
        const forcaDesenhada = camada?.metadata?.forca
        const estado: TratamentoDaBorda['estado'] = plano ? plano.estado : 'explicito-do-template'
        return {
          borda,
          estado,
          grupos: gruposNaBorda(borda).map((g) => g.grupo),
          textos,
          ...(corDesenhada ? { cor: corDesenhada } : {}),
          ...(camada ? { origemDaCor: gradientesDaPagina.has(borda) ? 'pagina-na-borda' : plano?.estado === 'tratado' ? plano.origemDaCor! : origemDaCorGlobal } : {}),
          ...(camada && veusDaLogo.has(camada.id) ? { veuDaLogo: true } : {}),
          ...(typeof forcaDesenhada === 'number' ? { forca: forcaDesenhada } : {}),
          ...(plano?.forcaPedida !== undefined ? { forcaPedida: plano.forcaPedida } : {}),
          ...(plano?.alcancaAlvo !== undefined ? { alcancaAlvo: plano.alcancaAlvo } : {}),
          ...(plano?.motivo ? { motivo: plano.motivo } : {}),
          ...(plano?.recusadas?.length ? { recusadas: plano.recusadas } : {}),
          ...(plano?.foraDoPlano?.length ? { foraDoPlano: plano.foraDoPlano } : {}),
        }
      })
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
    gradientes: gradientes
      .filter((gr) => layers.some((l) => l.id === gr.layer.id))
      .map((gr) => {
        const final = layers.find((l) => l.id === gr.layer.id)
        const forcaFinal = final?.metadata?.forca
        const plano = planoDa(gr.borda)
        const daBorda = paraGradiente.filter((p) => bordaDe(p) === gr.borda).map((p) => p.necessidade)
        // A cor DESENHADA: a da camada que vai para a peça (a primeira parada), não a global.
        const corDesenhada = (final?.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops?.find((st) => typeof st.color === 'string')?.color
        return {
          borda: gr.borda,
          forca: typeof forcaFinal === 'number' ? forcaFinal : gr.forca,
          altura: gr.altura,
          cor: corDesenhada ?? cfgDaBorda(gr.borda).cor,
          // A conta de antes (0..1); a força que o fundo pede no tratamento por borda está em `tratamentoDeLeitura`.
          necessidade: veusDaLogo.has(gr.layer.id) && logoNaPeca ? Number((logoNaPeca.necessidade * 0.5).toFixed(3)) : daBorda.length > 0 ? Math.max(...daBorda) : 0,
          origemDaCor: gradientesDaPagina.get(gr.borda)?.cor != null ? 'pagina-na-borda' : plano?.estado === 'tratado' ? plano.origemDaCor! : origemDaCorGlobal,
        }
      }),
    ...(tratamentoPiorou ? { tratamentoPiorou } : {}),
    ...(foto && gruposDeTexto.length > 0 ? { tratamentoDeLeitura: tratamentoPorBorda() } : {}),
    logo: logoDiag,
    blocos: montados.map((b) => ({ id: b.layer.id, papel: b.papel, escala: b.escala, width: b.width, height: b.height, destacado: b.destacado, ...(familiasDaCamada(b.layer as Layer).some((f) => fontesNaoCarregadas.has(f)) ? { naoMedido: true } : {}) })),
    // As medidas FINAIS, depois do autofix — é o que vale para quem for ler a
    // peça (ver-geracao, medir-copy): o bloco montado acima ainda pode encolher.
    medidasFinais: medidasFinaisDasCamadas(layers, fontesNaoCarregadas),
    ...(fontesNaoCarregadas.size > 0 ? { fontesNaoCarregadas: [...fontesNaoCarregadas] } : {}),
    segundaVoz,
    arranjos,
    contraste,
    assinatura: assinatura.origem,
    ...(arq && materializacao
      ? {
          arquetipo: {
            id: arq.resolvido.id,
            versao: arq.resolvido.versao,
            impressao: arq.resolvido.impressao,
            codigoTaxonomico: arq.definicao.codigoTaxonomico,
            formato: spec.formato,
            modo: buscaDoArquetipo ? MODO_BUSCA_ESPACIAL : ('referencia' as const),
            // A origem da região protegida é FATO, a mesma de `assuntoOrigem` (o corte escolhido): a caixa do catálogo; a
            // região de fato estimada pela textura; ou nenhuma — sem foto, ou foto sem região estimável: o campo some.
            ...(buscaDoArquetipo
              ? { buscaEspacial: { ...buscaDoArquetipo, ...(assuntoDoCatalogo ? { regiaoProtegida: 'catalogo' as const } : melhor.assunto ? { regiaoProtegida: 'estimada' as const } : {}) } }
              : {}),
            preferenciasCoincidentes: arq.preferenciasCoincidentes,
            papeis: (unidadesArq ?? []).map((u) => ({ papel: u.papel, ...materializacao!.papeis[u.papel]! })),
            logo: {
              modo: materializacao.logoAutomatica ? ('automatica' as const) : ('referencia' as const),
              canto: logoDiag?.canto ?? null,
              ...(materializacao.papeis.logo ? { referencia: materializacao.papeis.logo.referencia, zonaEfetiva: materializacao.papeis.logo.zonaEfetiva, posicao: materializacao.papeis.logo.posicao } : {}),
            },
            elementosDeclarados: (arq.definicao.elementos ?? []).map((e) => ({ id: e.id, tipo: e.tipo, opcional: e.opcional })),
            elementosMaterializados: [],
            ...(noArquetipo?.retiradas.length ? { logoDoArranjoRetirada: noArquetipo.retiradas } : {}),
          },
        }
      : {}),
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
  // PR 15: o carimbo da voz em vigor quando a copy foi escrita. A peça de item
  // de plano foi escrita no `criar-plano` (o `createdAt` do item é o instante);
  // best-effort — sem carimbo a peça sai do mesmo jeito.
  // Import dinâmico: `voz-service` puxa o `Prisma` do client em runtime, e o
  // compositor é carregado em testes que só dublam `@/lib/db`.
  const vozNaEscrita = await import('@/lib/brand/voz-service')
    .then((m) => m.carimboDaVozAgora(spec.projectId, { itemDePlanoId: spec.itemDePlanoId ?? null }))
    .catch(() => null)
  // A entrada do persist é montada num módulo PURO (`persistencia.ts`): é lá
  // que mora a regra de que a Generation da FILA (`opcoes.generationId`) é
  // FECHADA em vez de nascer outra — o defeito de 04/09/2026 (Espeto).
  // Os arranjos usados ficam gravados na spec: a recomposição refaz A MESMA
  // peça, sem sortear outra combinação.
  const specGravada: SpecDePeca = arranjos.length > 0 ? { ...spec, preferencias: { ...spec.preferencias, arranjos: arranjos.map((a) => ({ grupo: a.grupo, arranjo: a.id })) } } : spec
  const entradaDoPersist = entradaDePersistencia({
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
    vozNaEscrita,
  })
  // A peça sem contrato por recusa (legado que não cabe, histórico cheio) AVISA quem pediu — nunca em silêncio.
  // `diagnostico` é o mesmo objeto gravado em `fieldValues.composicao`.
  const avisosDaCopy = (entradaDoPersist.fieldValues as { avisosDaCopyAutoral?: string[] }).avisosDaCopyAutoral ?? []
  if (avisosDaCopy.length > 0) diagnostico.avisos.push(...avisosDaCopy)
  const persistido = await persistAndRenderCreative(entradaDoPersist)

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

/**
 * A caixa do assunto gravada no catálogo (frações 0..1), quando a análise a deu. `SEM_CATALOGO` (projeto sem catálogo,
 * ou vazio) é "a foto não tem anotação": `null`. Qualquer outro erro é o catálogo INDISPONÍVEL: sem arquétipo, segue
 * sem a caixa, como sempre; com arquétipo (`exigir`), a região protegida do catálogo é hard constraint e a posição não
 * é escolhida — nem reproduzida — sem ela (CP2B, Codex R2): recusa transitória, a fila tenta de novo.
 */
async function assuntoDoCatalogoDaFoto(projectId: number, driveFileId: string, exigir = false): Promise<AssuntoNormalizado | null> {
  try {
    const { lerCatalogoDoProjeto } = await import('@/lib/creatives/acervo')
    const catalogo = await lerCatalogoDoProjeto(projectId)
    const entrada = catalogo?.todas?.find((i) => i.driveFileId === driveFileId) as unknown as (Record<string, unknown> | undefined)
    return lerCaixaDoAssunto(entrada?.assunto)
  } catch (erro) {
    if (!exigir || (erro instanceof CreativeError && erro.code === 'SEM_CATALOGO')) return null
    throw new CreativeError(
      'CATALOGO_INDISPONIVEL',
      'Não deu para ler o catálogo de fotos do projeto agora. Com arquétipo, a região protegida da foto (o que o catálogo marcou) é obrigatória: a posição não é escolhida sem ela. Tente de novo em instantes.',
      503,
      { driveFileId, causa: erro instanceof Error ? erro.message : String(erro) },
    )
  }
}
