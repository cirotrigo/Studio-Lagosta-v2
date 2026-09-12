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
 *    copy que o post herdou dessa arte.
 *
 * O texto de camada volta INTEIRO e na multiplicidade em que existe: uma URL
 * numa camada de texto é texto da peça, duas camadas com a mesma frase são
 * duas ocorrências (é a repetição que a revisão procura). Só o fallback por
 * `slotValues` — onde não há tipo de camada — descarta valor com cara de URL.
 */

import { lerCamadas, type PageLayer } from '@/lib/posts/page-layers'
import { aplicarSlotNaCamada } from '@/lib/posts/page-to-design-data'
import { ehCopiaDaPagina, slotValuesParaRender, textosDoSlot } from '@/lib/posts/copy-segue-a-pagina'
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
  return slotValuesParaRender(arte.slotValues)
}

/** O snapshot afirma texto só quando é o registro do que foi desenhado: existe e a arte não foi re-renderizada por cima dele. */
function snapshotConfiavel(arte: NonNullable<SlideDaPeca['arte']>): boolean {
  return arte.layersSnapshot !== undefined && arte.layersSnapshot !== null && arte.reRenderizada !== true
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

export function textosDaPeca(post: PecaParaTextos, fontes: FontesDaPeca = {}): TextosDaPeca {
  const sv = post.slotValues
  const entregue = arteEntregue(post)
  const carrossel = post.mediaUrls.length > 1
  const proprios = slotValuesParaRender(sv)
  const textosProprios = textosDoPost(proprios ?? null)

  // 1. Peça VIVA com página: a mesma precedência do render. Legível é
  //    definitivo — inclusive vazio (a única camada apagada pelo slot).
  let paginaIlegivel = false
  if (!entregue && !carrossel && fontes.camadas !== undefined) {
    const daPagina = textosDasCamadas(fontes.camadas, proprios)
    if (daPagina !== null) return { textos: daPagina, origem: proprios ? 'pagina-com-copy-do-post' : 'pagina' }
    paginaIlegivel = true
  }
  // `pageId` preenchido e a página NÃO carregada (de outro projeto, ou apagada) não é "peça sem página": a
  // fonte principal está indisponível, e a copy do post é parcial como no ilegível (R30 da revisão de 5e483ec4).
  if (!entregue && !carrossel && post.pageId && fontes.camadas === undefined) paginaIlegivel = true
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
        ...(porSlide.some((s) => s.parcial) ? [carrossel ? `mídia(s) ${porSlide.filter((s) => s.parcial).map((s) => s.slide).join(', ')}: ${NOTA_DA_ARTE_DE_MODELO}` : NOTA_DA_ARTE_DE_MODELO] : []),
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
  const copyHerdadaInvalidada = !carrossel && !post.pageId && slides[0]?.arte?.reRenderizada === true
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
  const copyDoPostNaoAfirmavel = copyHerdadaInvalidada || copyHerdadaDeModelo
  const NOTA_R50 =
    'a arte desta peça foi desenhada do modelo com a copy do post por cima, e o registro das camadas que o render usou falta ou não resolve o texto da mídia: a copy gravada no post é o registro NÃO validado do que foi pedido (o id da camada vence o nome, e um valor dela pode não ter sido aplicado) — nada a afirmar sobre a mídia.'
  const notaDaCopyNaoAfirmavel = copyHerdadaInvalidada ? NOTA_R42 : post.pageId ? NOTA_R50 : arteUnica && snapshotConfiavel(arteUnica) ? NOTA_R49 : NOTA_R47

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
    if (ehCopiaDaPagina(sv)) {
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
  if (ehCopiaDaPagina(sv)) {
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
