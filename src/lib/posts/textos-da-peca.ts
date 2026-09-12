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
 *    da entrega é inteira. Sem nenhuma, a indisponibilidade é DECLARADA.
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
  /** `Page.layers` ATUAL da página daquela arte — vale só na peça viva. */
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
  // A ORDEM é a do render (`render-engine.ts`: `(order ?? 0)`, sort estável): a
  // persistência aceita o array fora de ordem, e a sequência dos textos tem de
  // ser a que a arte desenha (R23).
  const ordenadas = [...lidas.camadas].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
  for (const camada of ordenadas) {
    if (!camadaDeTexto(camada)) continue
    const efetiva = slots ? aplicarSlotNaCamada(camada, slots) : camada
    const bruto = typeof efetiva.content === 'string' ? efetiva.content : ''
    // A CAIXA é a do render (`textTransform`), aplicada DEPOIS do slot — a
    // camada guarda "Almoço executivo" e a arte mostra "ALMOÇO EXECUTIVO".
    const texto = aplicarCaixa(bruto, (efetiva.style as { textTransform?: string } | undefined)?.textTransform).trim()
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
const NOTA_DA_ARTE_DE_MODELO = 'arte desenhada de um MODELO com a copy do post por cima: só a copy registrada na arte; o que o modelo trazia fora dela (e a caixa do render) não tem registro — o texto cru do modelo não é o desta mídia.'

/**
 * A arte de `post-schedule` desenhou um MODELO com copy por cima (a via de
 * template): devolve essa copy quando ela é copy PRÓPRIA (não a cópia da
 * página, que aponta para a página da peça e cai na leitura normal). Ler a
 * página dessa arte entregaria "Título do modelo" por uma mídia que mostra
 * "Costela no bafo" (R36 da revisão final de bf4650f2).
 */
function copyDaArteDeModelo(arte: NonNullable<SlideDaPeca['arte']>): Record<string, unknown> | null {
  if (arte.source !== 'post-schedule') return null
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
    if (copyDoModelo) {
      const daCopy = textosDoPost(copyDoModelo)
      return daCopy.length > 0
        ? { slide, textos: daCopy, origem: 'arte', parcial: true, nota: NOTA_DA_ARTE_DE_MODELO }
        : { slide, textos: [], indisponiveis: 'arte desenhada de um modelo sem copy registrada: o texto cru do modelo não é o desta mídia — nada a afirmar' }
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

  // 3. Arte entregue sem registro da arte: o que o post guarda, dito pelo que é.
  if (entregue) {
    if (textosProprios.length > 0) {
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
      indisponiveis:
        'a arte desta peça já foi entregue (no publicador, publicada ou falhou) e a página pode ter mudado depois: o texto que vale é o da própria arte, e não há registro dele aqui.',
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
  const doPost = textosDoPost(sv)
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
