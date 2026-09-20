/**
 * Os TEXTOS de uma peça da agenda, como a ARTE os mostra (PR 6 de "Marca
 * simples, copy melhor", F2, 12/09/2026) — módulo PURO, sem Prisma.
 *
 * `ver-agenda` devolve os textos de cada peça para a revisão da semana
 * (repetição de tema e de frase entre os dias). A primeira versão lia só a
 * página — e a página é o MODELO: dois posts sobre a mesma página com copy
 * própria em `slotValues` voltavam com o texto de exemplo do modelo, e um
 * post cuja arte já foi entregue ao publicador voltava com a edição feita na
 * página DEPOIS da entrega. Aqui vale a mesma precedência do render:
 *
 *  - peça VIVA com página: a página com a copy PRÓPRIA do post por cima,
 *    camada a camada, com a MESMA função que o render usa
 *    (`aplicarSlotNaCamada`); a cópia que o agendamento grava
 *    (`_copiaDaPagina`) não volta para a arte;
 *  - CARROSSEL (ou peça sem página): slide a slide, pela arte que cada
 *    mídia é (`Generation` casada pela URL) — na peça viva, a página daquela
 *    arte (é ela que o re-render desenha); na entregue, o snapshot das
 *    camadas gravado na composição. `generationId` do post aponta só para a
 *    PRIMEIRA arte; os demais slides sumiam;
 *  - peça cuja arte já foi ENTREGUE (no publicador, publicada ou falhou) não
 *    segue a página: sem snapshot, a copy própria do post é PARCIAL (só os
 *    campos sobrescritos — o resto veio da página no render e não há
 *    registro) e é declarada assim; a cópia registrada no último render antes
 *    da entrega é inteira. Sem nenhuma, a indisponibilidade é DECLARADA;
 *  - arte de MODELO (`post-schedule` com copy própria): só o REGISTRO das
 *    camadas que o render desenhou (o snapshot confiável da arte) diz quais
 *    valores chegaram à mídia, em qualquer estado — a estrutura atual do
 *    modelo pode ser outra (R46, R47). Sem registro, nada se afirma, nem a
 *    copy que o post herdou dessa arte;
 *  - e a cópia textual que o post carrega cai quando há EVIDÊNCIA de que a
 *    mídia é outra arte: sem página PRÓPRIA ativa (nenhuma, ou só o vínculo
 *    histórico de R51/R52) e com uma arte casada, íntegra, cuja copy
 *    registrada não é a do post, o que está ali foi escrito para a arte
 *    anterior (R53/R54). Sem arte casada, ou com a arte apenas
 *    re-renderizada, não há troca a declarar.
 *
 * O texto de camada volta INTEIRO e na multiplicidade em que existe: uma URL
 * numa camada de texto é texto da peça, duas camadas com a mesma frase são
 * duas ocorrências (é a repetição que a revisão procura). Só o fallback por
 * `slotValues` — onde não há tipo de camada — descarta valor com cara de URL.
 */

import { lerCamadas, type PageLayer } from '@/lib/posts/page-layers'
import { aplicarSlotNaCamada } from '@/lib/posts/page-to-design-data'
import { copyIgual, copyPropriaDoPost, ehCopiaDaPagina, slotValuesParaRender, textosDoSlot } from '@/lib/posts/copy-segue-a-pagina'
import { aplicarCaixa } from '@/lib/posts/caixa-do-texto'

export type OrigemDosTextos =
  /** As camadas de texto visíveis da página (o post não tem copy própria). */
  | 'pagina'
  /** A página com a copy própria do post por cima — o que o render desenha. */
  | 'pagina-com-copy-do-post'
  /** Só a copy gravada no post (sem página, ou página ilegível/sem texto). */
  | 'copy-do-post'
  /** A arte que o post carrega, slide a slide (snapshot da composição; na peça viva, a página daquela arte). */
  | 'arte'
  /** Arte já entregue: a cópia da página registrada no último render antes da entrega. */
  | 'copy-registrada-na-entrega'
  /** Peça VIVA sem página legível: a cópia da página registrada no agendamento (parcial por natureza — R28). */
  | 'copy-registrada'

export interface PecaParaTextos {
  pageId: string | null
  slotValues: unknown
  status: string
  laterPostId: string | null
  mediaUrls: string[]
  generationId: string | null
  /**
   * `SocialPost.renderStatus`. `NOT_NEEDED` = a mídia do post NÃO vem do render da página dele (R51): trocar a arte
   * pela galeria mantém `pageId` como vínculo HISTÓRICO. Ausente = como antes (a página do post é a fonte ativa).
   */
  renderStatus?: string | null
}

/** Uma mídia do post e o que se sabe da arte que ela é. */
export interface SlideDaPeca {
  url: string
  /**
   * A Generation casada com a URL DESTA mídia (a mais recente); `null`/ausente
   * = nenhuma. 🔴 Só a URL casa: o `generationId` do post aponta para a
   * Generation de uma versão anterior quando o re-render grava URL nova sem
   * trocar o vínculo — o snapshot dela é de OUTRA mídia.
   */
  arte?: {
    layersSnapshot?: unknown
    pageId?: string | null
    /**
     * A arte foi RE-RENDERIZADA como a página estava (`recomposicao.estado`):
     * esse caminho grava a URL nova e PRESERVA o snapshot da composição
     * anterior — o snapshot não é registro do que foi desenhado, e não afirma
     * texto. Até a re-renderização gravar as camadas que desenhou, vale o
     * fallback declarado.
     */
    reRenderizada?: boolean
    /**
     * O re-render desta arte REGRAVOU a copy visual (`slotValues`) com o texto
     * das camadas que desenhou (`recomposicao.copyVisualRegravada`, gravado no
     * mesmo registro pela recuperação do PR 0): os `slotValues` são o texto
     * DESTE PNG. O snapshot NÃO é regravado — continua sem afirmar nada. Só
     * vale junto de `reRenderizada`.
     */
    copyVisualRegravada?: boolean
    /**
     * PROCEDÊNCIA da arte (`fieldValues.source`). `post-schedule` é a arte que
     * o render de post gravou desenhando um MODELO com a copy do post por
     * cima: a página dela (`pageId`) é o modelo, e o texto cru do modelo NÃO
     * é o desta mídia — quem diz o que foi desenhado é `slotValues` (R36).
     */
    source?: string | null
    /** A copy com que a arte foi desenhada (`fieldValues.slotValues`), quando a procedência a carrega. */
    slotValues?: unknown
  } | null
  /**
   * `Page.layers` ATUAL da página daquela arte — o texto dela vale só na peça viva. Na arte de MODELO
   * (`post-schedule`) não vale nem como ESTRUTURA: a página de hoje pode não ser a que o render desenhou (camada
   * recriada com outro id e o mesmo nome, caixa, ordem, visibilidade), e quem diz quais valores chegaram à mídia é
   * só o registro das camadas desenhadas (R47).
   */
  camadasDaPagina?: unknown
}

export interface FontesDaPeca {
  /** `Page.layers` da página do post (`pageId`); `undefined` quando não há página (ou não foi carregada). */
  camadas?: unknown
  /**
   * A página do post é um MODELO (`Page.isTemplate`)? É o que decide se o render aplica os slots do post por
   * cima dela (#142, 20/09/2026): em página de CONTEÚDO a página é a peça e manda. Ausente = não é modelo —
   * quem não sabe dizer não deve fazer a agenda afirmar um texto que o render não desenha.
   */
  paginaEhModelo?: boolean
  /** As mídias do post, na ordem, com a arte de cada uma. */
  slides?: SlideDaPeca[]
}

export interface TextosDeSlide {
  slide: number
  /** Definitivo quando `origem` vem — inclusive VAZIO (a arte não tem texto). */
  textos: string[]
  origem?: 'pagina' | 'arte'
  /** A leitura deste slide NÃO cobre a mídia inteira (só a copy com que o modelo foi preenchido — R36). */
  parcial?: boolean
  nota?: string
  indisponiveis?: string
}

export interface TextosDaPeca {
  /** Definitivo quando `origem` vem — inclusive VAZIO: leitura que deu certo e não achou texto não é "não sei". */
  textos: string[]
  origem?: OrigemDosTextos
  /** A leitura NÃO cobre a peça inteira (só os campos sobrescritos; slide sem registro). */
  parcial?: boolean
  nota?: string
  /** Por que não há texto a afirmar. */
  indisponiveis?: string
  /** Carrossel: os textos por slide, na ordem das mídias. */
  slides?: TextosDeSlide[]
}

/** Situações em que a arte já saiu da mão do Studio e não acompanha mais a página. */
const ENTREGUES = new Set(['POSTING', 'POSTED', 'FAILED'])

/** A arte desta peça já foi entregue? (`laterPostId` = está no publicador; publicado/publicando/falhou = a mídia é a que foi.) */
export function arteEntregue(post: Pick<PecaParaTextos, 'status' | 'laterPostId'>): boolean {
  return !!post.laterPostId || ENTREGUES.has(post.status)
}

const RE_URL = /^(https?:\/\/|data:)/i

function camadaDeTexto(c: PageLayer): boolean {
  return (c?.type === 'text' || c?.type === 'rich-text') && c.visible !== false
}

/**
 * A ORDEM do render (`render-engine.ts`: `(order ?? 0)`, sort estável): a persistência aceita o array fora de
 * ordem, e a sequência dos textos tem de ser a que a arte desenha (R23).
 */
function emOrdemDoRender(camadas: PageLayer[]): PageLayer[] {
  return [...camadas].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
}

function caixaDaCamada(camada: PageLayer): string | undefined {
  return (camada.style as { textTransform?: string } | undefined)?.textTransform
}

/**
 * Os textos das camadas, na ordem e na multiplicidade em que existem — com a
 * copy própria do post aplicada por cima quando ela vem (a função do render).
 * `null` quando as camadas são ilegíveis; `[]` é leitura que DEU CERTO e não
 * achou texto (a única camada apagada pelo slot, todas ocultas) — definitiva,
 * nunca motivo para procurar em outra fonte um texto que o render removeu.
 */
function textosDasCamadas(camadas: unknown, slots?: Record<string, unknown>): string[] | null {
  const lidas = lerCamadas(camadas)
  if (!lidas.legivel) return null
  const out: string[] = []
  for (const camada of emOrdemDoRender(lidas.camadas)) {
    if (!camadaDeTexto(camada)) continue
    const efetiva = slots ? aplicarSlotNaCamada(camada, slots) : camada
    const bruto = typeof efetiva.content === 'string' ? efetiva.content : ''
    // A CAIXA é a do render (`textTransform`), aplicada DEPOIS do slot — a
    // camada guarda "Almoço executivo" e a arte mostra "ALMOÇO EXECUTIVO".
    const texto = aplicarCaixa(bruto, caixaDaCamada(efetiva)).trim()
    if (texto) out.push(texto)
  }
  return out
}

/** Marca NÃO-string no lugar do conteúdo da camada: o que sair string da função do render veio do slot. */
const SEM_CONTEUDO_DA_CAMADA: unknown = Symbol('sem-conteudo-da-camada')

/**
 * R46: só os valores da copy registrada que o render APLICOU às camadas de texto visíveis — pela MESMA função
 * (`aplicarSlotNaCamada`: id vence nome; slot "" mantém a camada; `{ content }` troca), na ordem (`order`) e na
 * caixa (`textTransform`) das camadas. O conteúdo da camada é trocado por uma marca não-string antes de aplicar:
 * o texto cru do modelo nunca sai daqui (R36), e o valor que o render descartou (a chave pelo NOME quando o id
 * já casou) também não. `null` = camadas ilegíveis.
 */
function textosAplicadosAoModelo(camadas: unknown, slots: Record<string, unknown>): string[] | null {
  const lidas = lerCamadas(camadas)
  if (!lidas.legivel) return null
  const out: string[] = []
  for (const camada of emOrdemDoRender(lidas.camadas)) {
    if (!camadaDeTexto(camada)) continue
    const efetiva = aplicarSlotNaCamada({ ...camada, content: SEM_CONTEUDO_DA_CAMADA }, slots)
    const conteudo: unknown = efetiva.content
    if (typeof conteudo !== 'string') continue
    const texto = aplicarCaixa(conteudo, caixaDaCamada(efetiva)).trim()
    if (texto) out.push(texto)
  }
  return out
}

/** Os textos de `slotValues` sem tipo de camada: valor com cara de URL é imagem, não copy. */
function textosDoPost(slotValues: unknown): string[] {
  return Object.values(textosDoSlot(slotValues) ?? {})
    .map((t) => t.trim())
    .filter((t) => t && !RE_URL.test(t))
}

/**
 * A cópia da página que o agendamento grava (`_copiaDaPagina`): é texto de
 * CAMADA por construção (`textosDaPagina`), então uma URL ali é texto da peça e
 * fica. O que esse registro NÃO guarda: a caixa do render (`textTransform`) e
 * a ordem em que as camadas são desenhadas — por isso quem o devolve declara
 * a leitura PARCIAL (R19).
 */
function textosDaCopiaRegistrada(slotValues: unknown): string[] {
  return Object.values(textosDoSlot(slotValues) ?? {}).map((t) => t.trim()).filter(Boolean)
}
const NOTA_DA_COPIA_REGISTRADA = 'cópia da página registrada no agendamento: o texto das camadas ANTES da caixa do render (textTransform) e sem a ordem em que foram desenhadas — não prova a arte inteira.'
const NOTA_DA_ARTE_DE_MODELO = 'arte desenhada de um MODELO com a copy do post por cima: só os valores da copy registrada que o render aplicou às camadas do modelo (id antes de nome, na ordem e na caixa delas); o que o modelo trazia fora dela não tem registro — o texto cru do modelo não é o desta mídia.'
const NOTA_DO_MODELO_SEM_REGISTRO = 'a estrutura atual do modelo pode não ser a que o render desenhou (camada recriada com outro id e o mesmo nome, caixa, ordem, visibilidade), e o id da camada vence o nome — sem esse registro não há como saber quais valores da copy registrada chegaram à mídia, e ela não é atribuída a ela: nada a afirmar'

/**
 * A arte de `post-schedule` desenhou um MODELO com copy por cima (a via de
 * template): devolve essa copy quando ela é copy PRÓPRIA (não a cópia da
 * página, que aponta para a página da peça e cai na leitura normal). Ler a
 * página dessa arte entregaria "Título do modelo" por uma mídia que mostra
 * "Costela no bafo" (R36 da revisão final de bf4650f2). E a copy devolvida aqui ainda
 * não é o texto da mídia: quem decide o que foi desenhado é `textosAplicadosAoModelo` (R46).
 */
function copyDaArteDeModelo(arte: NonNullable<SlideDaPeca['arte']>): Record<string, unknown> | null {
  if (arte.source !== 'post-schedule') return null
  // R37: a arte RE-RENDERIZADA como a página estava (`recomposicao.estado`) preserva `source` e `slotValues`
  // antigos no `fieldValues`, mas o PNG novo é a página atual, desenhada SEM essa copy — afirmá-la seria atribuir
  // o texto de outra versão à mídia, contornando R13. Vale o tratamento de sempre: página atual na peça viva;
  // registro confiável ou indisponibilidade na entregue.
  if (arte.reRenderizada === true) return null
  // A pergunta aqui é "esta arte carrega copy PRÓPRIA do post?", não "o que o render aplicaria hoje": a página
  // que esta arte desenhou era um MODELO (é o que `post-schedule` + copy não-marcada significa desde o #142 —
  // em página de conteúdo o render não aplica slots e grava a cópia MARCADA). Ver `copyPropriaDoPost`.
  return copyPropriaDoPost(arte.slotValues)
}

/** O snapshot afirma texto só quando é o registro do que foi desenhado: existe e a arte não foi re-renderizada por cima dele. */
function snapshotConfiavel(arte: NonNullable<SlideDaPeca['arte']>): boolean {
  return arte.layersSnapshot !== undefined && arte.layersSnapshot !== null && arte.reRenderizada !== true
}

const NOTA_DA_COPY_VISUAL_REGRAVADA =
  'arte re-renderizada com a copy visual regravada junto do PNG: o texto das camadas que ela desenhou, ANTES da caixa do render (textTransform) e sem a ordem em que foram desenhadas — não prova a arte inteira.'

/**
 * A copy visual REGRAVADA no re-render desta arte (integração do PR 0 com R13/R37/R42): com o marcador, os
 * `slotValues` são o texto das camadas que o PNG atual desenhou — a copy desta mídia, e não a de outra versão.
 * Sem o marcador (ou sem `reRenderizada`), `null`: a arte re-renderizada segue sem afirmar texto como antes.
 */
function copyVisualRegravadaDaArte(arte: NonNullable<SlideDaPeca['arte']>): Record<string, unknown> | null {
  if (arte.reRenderizada !== true || arte.copyVisualRegravada !== true) return null
  const sv = arte.slotValues
  return sv && typeof sv === 'object' && !Array.isArray(sv) ? (sv as Record<string, unknown>) : null
}

/**
 * Só os textos NÃO VAZIOS de um `slotValues`, como quem grava a cópia textual
 * do post os deriva (`textosDaGeneration`, na troca de arte): chave de controle
 * (`_…`) fora, valor em branco fora. É o que torna as duas pontas comparáveis.
 */
function textosNaoVazios(slotValues: unknown): Record<string, string> | null {
  const t = textosDoSlot(slotValues)
  if (!t) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(t)) if (v.trim()) out[k] = v
  return Object.keys(out).length > 0 ? out : null
}

/**
 * 🔴 R53: há EVIDÊNCIA de que a mídia atual é OUTRA arte?
 *
 * Com a página só como VÍNCULO HISTÓRICO (R51/R52) a mídia pode ter vindo de
 * FORA: a troca pela galeria REGRAVA a cópia do post quando a arte nova carrega
 * copy registrada e PRESERVA o que estava lá quando não carrega
 * (`trocar-arte-do-post`), e a melhoria com IA nem a toca — então o texto que
 * ficou no post descreve a arte ANTERIOR.
 *
 * O que prova a troca é a arte casada pela URL EXISTIR, estar íntegra e a copy
 * registrada dela NÃO ser a do post; inferir pelo caminho da escrita não serve,
 * porque são vários e nenhum deixa marca. Ausência de prova não é prova: sem
 * arte casada (a Generation sumiu, a URL não bate) e com a arte apenas
 * RE-RENDERIZADA — que é a MESMA peça, e cujo render regrava a cópia — não há
 * troca a declarar, e a cópia do post continua valendo como sempre valeu.
 */
function midiaEDeOutraArte(slotValuesDoPost: unknown, arte?: SlideDaPeca['arte']): boolean {
  const doPost = textosNaoVazios(slotValuesDoPost)
  // Post SEM cópia textual não atribui nada a mídia nenhuma: não há o que invalidar, e a
  // indisponibilidade tem de ser dita pelo motivo REAL (entregue, arte sem registro).
  if (!doPost) return false
  if (!arte) return false
  if (arte.reRenderizada === true) return false
  return !copyIgual(doPost, textosNaoVazios(arte.slotValues))
}

function textosPorSlide(slides: SlideDaPeca[], entregue: boolean): TextosDeSlide[] {
  return slides.map((s, i) => {
    const slide = i + 1
    // R36: procedência antes da página — a página de uma arte de modelo é o MODELO, não a peça.
    const copyDoModelo = s.arte ? copyDaArteDeModelo(s.arte) : null
    if (s.arte && copyDoModelo) {
      if (!textosDoSlot(copyDoModelo)) {
        return { slide, textos: [], indisponiveis: 'arte desenhada de um modelo sem copy registrada: o texto cru do modelo não é o desta mídia — nada a afirmar' }
      }
      // R46: a copy registrada pode trazer a MESMA camada por id e por nome, e o render aplica só a do id — os
      // valores brutos não são os textos da mídia. Vale o que a função do render aplica às camadas que ele DESENHOU.
      // R47: e essas camadas só se conhecem pelo REGISTRO da versão renderizada (o snapshot confiável da arte). A
      // página do modelo é a estrutura de HOJE — a Generation de `post-schedule` guarda slots e `pageId`, sem as
      // camadas, e a camada pode ter sido recriada com outro id e o mesmo nome, ou ter caixa, ordem e visibilidade
      // trocadas depois do render. A mídia que lê a arte de modelo é sempre um PNG congelado (post sem página própria
      // ou carrossel): aplicar os slots na página de hoje atribuía a ela o valor que o render descartou. Vale em
      // qualquer estado, viva ou entregue.
      if (!snapshotConfiavel(s.arte)) {
        return { slide, textos: [], indisponiveis: `arte desenhada de um modelo sem registro das camadas que o render usou: ${NOTA_DO_MODELO_SEM_REGISTRO}` }
      }
      const aplicados = textosAplicadosAoModelo(s.arte.layersSnapshot, copyDoModelo)
      if (aplicados === null) {
        return { slide, textos: [], indisponiveis: `as camadas registradas desta arte de modelo não puderam ser lidas: ${NOTA_DO_MODELO_SEM_REGISTRO}` }
      }
      return aplicados.length > 0
        ? { slide, textos: aplicados, origem: 'arte', parcial: true, nota: NOTA_DA_ARTE_DE_MODELO }
        : { slide, textos: [], indisponiveis: 'arte desenhada de um modelo: nenhum valor da copy registrada chega a uma camada de texto visível do modelo, e o texto cru do modelo não é o desta mídia — nada a afirmar' }
    }
    if (!entregue && s.camadasDaPagina !== undefined) {
      const daPagina = textosDasCamadas(s.camadasDaPagina)
      // Legível é definitivo — inclusive vazio (todas as camadas ocultas).
      if (daPagina !== null) return { slide, textos: daPagina, origem: 'pagina' }
    }
    if (s.arte && snapshotConfiavel(s.arte)) {
      const doSnapshot = textosDasCamadas(s.arte.layersSnapshot)
      if (doSnapshot !== null) return { slide, textos: doSnapshot, origem: 'arte' }
    }
    // A arte re-renderizada cuja copy visual foi REGRAVADA no mesmo re-render: depois da página (peça viva) e antes
    // da indisponibilidade, os `slotValues` dela são o texto desta mídia — com a nota do que o registro não guarda
    // (caixa e ordem do render), como a cópia registrada. `{}` é leitura definitiva (a arte não desenhou texto).
    const regravada = s.arte ? copyVisualRegravadaDaArte(s.arte) : null
    if (regravada) {
      const textos = textosDaCopiaRegistrada(regravada)
      return textos.length > 0
        ? { slide, textos, origem: 'arte', parcial: true, nota: NOTA_DA_COPY_VISUAL_REGRAVADA }
        : { slide, textos: [], origem: 'arte' }
    }
    return {
      slide,
      textos: [],
      indisponiveis: !s.arte
        ? 'nenhuma arte registrada para esta mídia'
        : s.arte.reRenderizada
          ? 'a arte desta mídia foi re-renderizada como a página estava e não guardou as camadas desenhadas: nada a afirmar'
          : 'a arte desta mídia não guardou as camadas (sem snapshot): nada a afirmar',
    }
  })
}

/**
 * A arte de uma mídia como `ver-agenda` a monta a partir de `Generation.fieldValues` — módulo puro, para que o teste
 * leia a MESMA coisa que a agenda lê.
 *
 *  - `reRenderizada`: o re-render como a página estava grava URL nova e PRESERVA o snapshot da composição anterior —
 *    o snapshot não afirma texto (R13).
 *  - `copyVisualRegravada`: o re-render regravou a copy visual junto do PNG (marcador do PR 0).
 *  - `source` e `slotValues`: a arte de `post-schedule` é um MODELO com a copy do post por cima (R36).
 *
 * 🔴 A RECUSA de uma recomposição posterior não entra aqui e não apaga nada disso: ela mora em
 * `fieldValues.recusaDaRecomposicao`, e `recomposicao` continua sendo o registro do render que produziu o PNG atual
 * (C6-01 da pré-revisão do HEAD f0eee811, 12/09/2026).
 */
export function arteDosFieldValues(fieldValues: unknown): NonNullable<SlideDaPeca['arte']> {
  const objeto = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const fv = objeto(fieldValues)
  const recomposicao = objeto(fv.recomposicao)
  const reRenderizada = recomposicao.estado === 're-renderizada'
  return {
    layersSnapshot: fv.layersSnapshot,
    pageId: typeof fv.pageId === 'string' ? fv.pageId : null,
    reRenderizada,
    copyVisualRegravada: reRenderizada && recomposicao.copyVisualRegravada === true,
    source: typeof fv.source === 'string' ? fv.source : null,
    slotValues: fv.slotValues,
  }
}

/**
 * 🔴 R51 (revisão FINAL sobre 16af4e20, 13/09/2026): a página do post é só um VÍNCULO HISTÓRICO — e não a fonte ativa
 * do render — quando o post é `NOT_NEEDED` e a mídia única não é a arte daquela página. É o estado que a troca de
 * arte pela GALERIA deixa (`decidirRender` passa a `NOT_NEEDED` sem vincular página, e o update conserva `pageId`):
 * ler a página ali devolvia os textos da arte ANTERIOR, com origem `pagina`, antes de olhar a mídia atual e a
 * procedência dela (C6-03). Inferido do estado que todo post já tem — vale para registro antigo, sem campo novo.
 * Carrossel não passa por aqui: ele sempre se lê slide a slide.
 *
 * 🔴 Só existe "outra arte" quando há UMA mídia (regressão pega pela prova-dev-36, 13/09/2026). Sem mídia nenhuma o
 * post não trocou arte por nada: a página continua sendo a fonte — legível, é lida; de OUTRO projeto (ou apagada), é
 * declarada INDISPONÍVEL (R29/R30). Tratar o post sem mídia como histórico calava essa declaração e fazia o post
 * `NOT_NEEDED` com página do próprio projeto voltar sem texto nenhum.
 */
export function paginaDoPostEHistorica(post: Pick<PecaParaTextos, 'pageId' | 'renderStatus' | 'mediaUrls'>, arteDaMidia?: SlideDaPeca['arte']): boolean {
  if (!post.pageId || post.renderStatus !== 'NOT_NEEDED' || post.mediaUrls.length !== 1) return false
  // R52 (revisão FINAL sobre 7e96c643, 18/09/2026): a igualdade de `pageId` não prova que a página seja a fonte. A arte
  // de MODELO (`post-schedule`) aponta para a página do modelo com a copy por cima, e o render aplica só o valor do id
  // quando id e nome endereçam a mesma camada; aplicar à página os slots que o post herdou (sem o `l1` vazio) afirmava
  // o texto descartado. Com o post `NOT_NEEDED` a página não renderiza de novo: vale a procedência da mídia (R36).
  if (arteDaMidia && copyDaArteDeModelo(arteDaMidia) !== null) return true
  return arteDaMidia?.pageId !== post.pageId
}

export function textosDaPeca(post: PecaParaTextos, fontes: FontesDaPeca = {}): TextosDaPeca {
  const sv = post.slotValues
  const entregue = arteEntregue(post)
  const carrossel = post.mediaUrls.length > 1
  const proprios = copyPropriaDoPost(sv)
  const textosProprios = textosDoPost(proprios ?? null)
  // R51: a página do post que ficou só como vínculo histórico não é lida — a peça se resolve pela mídia atual.
  const paginaHistorica = !carrossel && paginaDoPostEHistorica(post, fontes.slides?.[0]?.arte)
  const semPaginaPropria = !post.pageId || paginaHistorica

  // 1. Peça VIVA com página: a mesma precedência do render. Legível é
  //    definitivo — inclusive vazio (a única camada apagada pelo slot).
  let paginaIlegivel = false
  //    🔴 Os slots do post só entram quando a página RENDERIZA a mídia do post. Com `NOT_NEEDED` e uma mídia, o PNG é o
  //    de uma arte (a da própria página, mantida em dia pela recomposição): os slots que o post herdou na troca pela
  //    galeria não são entrada de render nenhum, e aplicá-los à página editada depois devolvia o texto de antes
  //    (varredura da classe do R52, 18/09/2026). Sem mídia, eles são a entrada do render que ainda vai acontecer.
  //    🔴 E, desde o #142 (20/09/2026), só quando a página é um MODELO: em página de CONTEÚDO o render IGNORA os
  //    slots e desenha a página, marca ou não (`slotValuesParaRender`). Espelhamos pela MESMA função que o render
  //    chama, para os dois não divergirem — ler com os slots aplicados mostraria na agenda um texto que a arte
  //    não tem, que é o defeito que este módulo existe para impedir.
  const slotsDoRender =
    post.renderStatus === 'NOT_NEEDED' && post.mediaUrls.length === 1
      ? null
      : slotValuesParaRender(sv, fontes.paginaEhModelo === true)
  if (!entregue && !carrossel && !paginaHistorica && fontes.camadas !== undefined) {
    const daPagina = textosDasCamadas(fontes.camadas, slotsDoRender)
    if (daPagina !== null) return { textos: daPagina, origem: slotsDoRender ? 'pagina-com-copy-do-post' : 'pagina' }
    paginaIlegivel = true
  }
  // `pageId` preenchido e a página NÃO carregada (de outro projeto, ou apagada) não é "peça sem página": a
  // fonte principal está indisponível, e a copy do post é parcial como no ilegível (R30 da revisão de 5e483ec4).
  if (!entregue && !carrossel && post.pageId && !paginaHistorica && fontes.camadas === undefined) paginaIlegivel = true
  // A fonte que ficou indisponível: a página do post, ou a arte da mídia única (R32 abaixo).
  let fonteIndisponivel: string | null = paginaIlegivel
    ? fontes.camadas === undefined ? 'a página desta peça não pôde ser carregada (fora deste projeto, ou apagada)' : 'as camadas da página não puderam ser lidas'
    : null

  // 2. Pelas ARTES do post, slide a slide (carrossel, peça sem página, peça
  //    entregue). Um slide conta como resolvido quando a FONTE dele é legível,
  //    não quando tem texto.
  const slides = fontes.slides ?? []
  if (slides.length > 0) {
    const porSlide = textosPorSlide(slides, entregue)
    const resolvidos = porSlide.filter((s) => s.origem !== undefined)
    // MÍDIA ÚNICA cuja arte não afirma texto (página da arte fora deste projeto ou apagada, sem snapshot
    // confiável): a fonte é INDISPONÍVEL, como a página ilegível — a copy do post volta PARCIAL e sem copy
    // se declara. Antes só o carrossel preservava a declaração (R32 da revisão de d871673c).
    if (!carrossel && !entregue && resolvidos.length === 0 && porSlide[0]?.indisponiveis) {
      paginaIlegivel = true
      fonteIndisponivel = `a arte desta peça não afirma texto (${porSlide[0].indisponiveis})`
    }
    if (resolvidos.length > 0) {
      const faltam = porSlide.length - resolvidos.length
      const notas = [
        ...(faltam > 0 ? [`${faltam} de ${porSlide.length} mídia(s) sem arte registrada (ou re-renderizada sem registro): os textos delas não estão aqui.`] : []),
        // Uma nota por NATUREZA de leitura parcial (arte de modelo; copy visual regravada), com as mídias dela no carrossel.
        ...[...new Set(porSlide.filter((s) => s.parcial).map((s) => s.nota ?? NOTA_DA_ARTE_DE_MODELO))].map((nota) =>
          carrossel
            ? `mídia(s) ${porSlide.filter((s) => s.parcial && (s.nota ?? NOTA_DA_ARTE_DE_MODELO) === nota).map((s) => s.slide).join(', ')}: ${nota}`
            : nota,
        ),
      ]
      return {
        textos: porSlide.flatMap((s) => s.textos),
        origem: resolvidos.every((s) => s.origem === 'pagina') ? 'pagina' : 'arte',
        ...(carrossel ? { slides: porSlide } : {}),
        ...(notas.length > 0 ? { parcial: true, nota: notas.join(' ') } : {}),
      }
    }
    /**
     * CARROSSEL sem NENHUM slide legível — vivo ou entregue: a copy do post não
     * cobre as mídias (a cópia da página não acompanha o slide; o re-render de
     * slide troca só `mediaUrls`). Declara-se, slide a slide; nada se afirma
     * (R15 e R20 das revisões de 3f784e1a e 941d8e77).
     */
    if (carrossel) {
      return {
        textos: [],
        indisponiveis: entregue
          ? 'carrossel já entregue sem registro confiável das artes por slide: a cópia gravada no post não prova o que foi ao ar (o re-render de slide troca só a mídia).'
          : 'carrossel sem página legível nem snapshot em nenhum slide: a copy gravada no post não cobre as mídias.',
        slides: porSlide,
      }
    }
  }

  // 🔴 A copy de um post SEM página própria veio da arte com que ele foi agendado
  //    (por `generationId`), e a RE-RENDERIZAÇÃO daquela arte DEPOIS do agendamento
  //    troca só a mídia do post (`recompor.ts`): o PNG novo é a página atual,
  //    desenhada SEM essa copy (R37), e o post fica carregando o texto de OUTRA
  //    versão da mídia. Ela não é afirmada — nem entregue, nem viva com a página
  //    da arte ilegível — porque a procedência da mídia atual a invalidou; o que
  //    resta é declarar (R42 da revisão final de be055fe0). Com a página da arte
  //    legível e a peça viva, o passo 2 já devolveu a página (que É a mídia).
  //    O marcador da copy visual REGRAVADA (PR 0) valida a copy da ARTE, lida no passo 2 — nunca a que o post herdou
  //    antes do re-render. Com ele o slide já resolveu e não chega aqui; esta regra fica como era.
  const copyHerdadaInvalidada = !carrossel && semPaginaPropria && slides[0]?.arte?.reRenderizada === true
  const NOTA_R42 =
    'a arte desta peça foi re-renderizada e o post (sem página própria) não guarda registro textual confiável da mídia atual: o texto que está na arte não tem registro aqui.'
  // 🔴 R47: o post sem página própria cuja mídia é uma arte de MODELO sem o registro das camadas desenhadas
  //    herdou dela, no agendamento, a MESMA copy bruta que a arte guarda — com o valor que o render descartou
  //    quando id e nome endereçam a mesma camada. Afirmá-la pelo fallback `copy-do-post` seria a porta lateral
  //    do defeito que a leitura do slide acabou de recusar.
  //    R49 (revisão do commit 402c11b1): a PRESENÇA do registro não basta. Chegar até aqui com a mídia única numa
  //    arte de modelo significa que a leitura do slide NÃO resolveu — nenhum valor aplicado (o slot pelo id vazio
  //    descarta o do nome, e `agendarPost` grava só o que não é vazio) ou registro ilegível — e a copy herdada é a
  //    mesma bruta, com o valor descartado. Só a leitura do slide afirma; o fallback nunca.
  //    R50 (revisão FINAL sobre a6fc900e): o mesmo vale para o post que MANTÉM `pageId` — o post de template cuja arte
  //    entregue é `post-schedule` com os slots dele. A copy gravada no post é a mesma bruta (id e nome endereçando a
  //    mesma camada; o render aplica só o do id), e sem a leitura do slide ela não diz o que chegou à mídia. A peça viva
  //    com a página legível já respondeu no passo 1 e não chega aqui.
  const arteUnica = !carrossel ? slides[0]?.arte : undefined
  const copyHerdadaDeModelo = !!arteUnica && copyDaArteDeModelo(arteUnica) !== null
  const NOTA_R47 =
    'a arte desta peça foi desenhada de um modelo sem registro das camadas que o render usou, e a copy que o post (sem página própria) herdou dela não diz quais valores chegaram à mídia — o id da camada vence o nome, e a estrutura atual do modelo pode ser outra: nada a afirmar.'
  const NOTA_R49 =
    'a arte desta peça foi desenhada de um modelo e o registro das camadas que o render usou não resolve o texto da mídia (nenhum valor aplicado, ou registro ilegível); a copy que o post (sem página própria) herdou dela inclui o que o render descartou: nada a afirmar.'
  const NOTA_R50 =
    'a arte desta peça foi desenhada do modelo com a copy do post por cima, e o registro das camadas que o render usou falta ou não resolve o texto da mídia: a copy gravada no post é o registro NÃO validado do que foi pedido (o id da camada vence o nome, e um valor dela pode não ter sido aplicado) — nada a afirmar sobre a mídia.'
  /**
   * 🔴 R53 (revisão FINAL sobre f96820bf, 20/09/2026): a página do post não é a fonte desta mídia — ela ficou só
   * como VÍNCULO HISTÓRICO (R51/R52), ou o post nunca teve página — e a arte casada pela URL PROVA que a mídia é
   * outra (existe, está íntegra, e a copy registrada dela não é a do post). Trocar a arte pela galeria por uma arte
   * SEM copy registrada preserva o que estava no post, e o fallback devolvia o texto da arte ANTERIOR como se fosse
   * o desta mídia, com uma ressalva que só falava em leitura parcial.
   *
   * 🔴 R54 (revisão FINAL sobre a996a082, 20/09/2026): vale para `semPaginaPropria`, não só para a página HISTÓRICA.
   *    O rascunho criado por `generationId` nasce com `pageId` nulo, e a mesma troca pela galeria o deixava de fora
   *    do guard — "Oferta A" voltava como `copy-do-post` pela mídia B, vivo e depois da entrega. Com página PRÓPRIA
   *    ativa (RENDERED) a copy é legítima: o render desenha dela e `renderPostArt` regrava a cópia.
   *
   * 🔴 Sem arte casada (R12: a Generation vinculada não é a da mídia) e com a arte apenas RE-RENDERIZADA (R13: a
   *    MESMA peça, refeita) NÃO há prova de troca — e a cópia registrada no post é o registro da entrega daquela
   *    mídia, que `renderPostArt` mantém em dia. Exigir a conferência nesses dois casos derrubava a única descrição
   *    que existe da mídia (prova de integração, prova-dev-40). O critério é EVIDÊNCIA DE TROCA, nunca "consegui
   *    conferir".
   */
  const copyHerdadaDeOutraArte = !carrossel && semPaginaPropria && midiaEDeOutraArte(sv, arteUnica)
  const NOTA_R53 =
    'a mídia desta peça não vem do render de uma página do post e a copy gravada nele não confere com a copy registrada da arte atual: esse texto é de OUTRA arte — nada a afirmar sobre esta mídia.'
  const copyDoPostNaoAfirmavel = copyHerdadaInvalidada || copyHerdadaDeModelo || copyHerdadaDeOutraArte
  const notaDaCopyNaoAfirmavel = copyHerdadaInvalidada
    ? NOTA_R42
    : copyHerdadaDeModelo
      ? !semPaginaPropria
        ? NOTA_R50
        : arteUnica && snapshotConfiavel(arteUnica)
          ? NOTA_R49
          : NOTA_R47
      : NOTA_R53

  // 3. Arte entregue sem registro da arte: o que o post guarda, dito pelo que é.
  if (entregue) {
    if (textosProprios.length > 0 && !copyDoPostNaoAfirmavel) {
      return {
        textos: textosProprios,
        origem: 'copy-do-post',
        parcial: true,
        nota: 'só os campos que o post sobrescreveu: o resto veio da página no render e não tem registro — a página pode ter mudado depois da entrega.',
      }
    }
    // 🔴 R53: a cópia MARCADA também é da arte anterior quando a página virou vínculo histórico. Ela continua
    //    valendo nos outros casos invalidados (R37/R42/R50): ali a página do post ainda renderiza a mídia, e
    //    `renderPostArt` regrava a cópia a cada render — o que não acontece num post `NOT_NEEDED`.
    if (!copyHerdadaDeOutraArte && ehCopiaDaPagina(sv)) {
      const registrada = textosDaCopiaRegistrada(sv)
      if (registrada.length > 0) return { textos: registrada, origem: 'copy-registrada-na-entrega', parcial: true, nota: NOTA_DA_COPIA_REGISTRADA }
    }
    return {
      textos: [],
      indisponiveis: copyDoPostNaoAfirmavel
        ? notaDaCopyNaoAfirmavel
        : 'a arte desta peça já foi entregue (no publicador, publicada ou falhou) e a página pode ter mudado depois: o texto que vale é o da própria arte, e não há registro dele aqui.',
    }
  }

  // 4. Peça viva sem página legível (nem arte casada): a copy gravada no post,
  //    DITA pelo que é (R28 da revisão de f3ac8b92). Com página ILEGÍVEL a copy
  //    do post não cobre a peça: os campos sobrescritos são um subconjunto, e a
  //    cópia registrada (`_copiaDaPagina`) é parcial por natureza (sem caixa,
  //    sem ordem) — devolvê-las como leitura completa escondia preço, serviço
  //    ou CTA na revisão semanal. E a cópia registrada passa pela leitura que
  //    PRESERVA URL de camada (a mesma de R19), não pelo filtro genérico.
  if (!copyHerdadaDeOutraArte && ehCopiaDaPagina(sv)) {
    const registrada = textosDaCopiaRegistrada(sv)
    if (registrada.length > 0) {
      return {
        textos: registrada,
        origem: 'copy-registrada',
        parcial: true,
        nota: fonteIndisponivel ? `${fonteIndisponivel}; ${NOTA_DA_COPIA_REGISTRADA}` : NOTA_DA_COPIA_REGISTRADA,
      }
    }
  }
  const doPost = copyDoPostNaoAfirmavel ? [] : textosDoPost(sv)
  if (copyDoPostNaoAfirmavel && textosDoPost(sv).length > 0) return { textos: [], indisponiveis: notaDaCopyNaoAfirmavel }
  if (doPost.length > 0) {
    if (paginaIlegivel) {
      return {
        textos: doPost,
        origem: 'copy-do-post',
        parcial: true,
        nota: `${fonteIndisponivel}: estes são só os campos que o post sobrescreveu, e o resto do texto da peça não tem registro aqui.`,
      }
    }
    return { textos: doPost, origem: 'copy-do-post' }
  }
  if (fonteIndisponivel) return { textos: [], indisponiveis: `${fonteIndisponivel}: não há texto a afirmar.` }
  return { textos: [] }
}
