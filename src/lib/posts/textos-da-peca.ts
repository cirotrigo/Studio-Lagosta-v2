/**
 * Os TEXTOS de uma peça da agenda, como a ARTE os mostra (PR 6 de "Marca
 * simples, copy melhor", F2, 12/09/2026) — módulo PURO, sem Prisma.
 *
 * `ver-agenda` devolve os textos de cada peça para a revisão da semana
 * (repetição de tema e de frase entre os dias). A primeira versão lia só a
 * página — e a página é o MODELO: dois posts sobre a mesma página com copy
 * própria em `slotValues` voltavam com o texto de exemplo do modelo, e um
 * post cuja arte já foi entregue ao publicador voltava com a edição feita na
 * página DEPOIS da entrega. Aqui vale a mesma precedência do render
 * (`story-renderer.ts`): a copy PRÓPRIA do post sobrepõe a página; a cópia
 * que o agendamento grava (`_copiaDaPagina`) não volta para a arte.
 *
 * Peça cuja arte já foi ENTREGUE (no publicador, publicada ou falhou) não
 * segue a página: a copy que vale é a da arte. O que se pode afirmar dela é
 * o snapshot da própria arte (quando é a que o post carrega), a copy própria
 * do post, ou a cópia registrada no último render antes da entrega. Sem
 * nenhuma dessas, a indisponibilidade é DECLARADA — nunca se atribui à peça
 * um texto que ela pode não ter.
 */

import { lerCamadas, textosDaPagina } from '@/lib/posts/page-layers'
import { ehCopiaDaPagina, slotValuesParaRender, textosDoSlot } from '@/lib/posts/copy-segue-a-pagina'

export type OrigemDosTextos =
  /** As camadas de texto visíveis da página (o post não tem copy própria). */
  | 'pagina'
  /** A página com a copy própria do post por cima — o que o render desenha. */
  | 'pagina-com-copy-do-post'
  /** Só a copy gravada no post (sem página, ou página ilegível/sem texto). */
  | 'copy-do-post'
  /** Arte já entregue: o snapshot das camadas da arte que o post carrega. */
  | 'arte-entregue'
  /** Arte já entregue: a cópia da página registrada no último render antes da entrega. */
  | 'copy-registrada-na-entrega'

export interface PecaParaTextos {
  pageId: string | null
  slotValues: unknown
  status: string
  laterPostId: string | null
  mediaUrls: string[]
  generationId: string | null
}

export interface FontesDaPeca {
  /** `Page.layers` da página do post; `undefined` quando não há página (ou não foi carregada). */
  camadas?: unknown
  /** A arte que o post aponta (`generationId`): a URL dela e o snapshot das camadas gravado na composição. */
  arte?: { resultUrl: string | null; layersSnapshot: unknown } | null
}

export interface TextosDaPeca {
  textos: string[]
  origem?: OrigemDosTextos
  /** Por que não há texto a afirmar. */
  indisponiveis?: string
}

/** Situações em que a arte já saiu da mão do Studio e não acompanha mais a página. */
const ENTREGUES = new Set(['POSTING', 'POSTED', 'FAILED'])

/** A arte desta peça já foi entregue? (`laterPostId` = está no publicador; publicado/publicando/falhou = a mídia é a que foi.) */
export function arteEntregue(post: Pick<PecaParaTextos, 'status' | 'laterPostId'>): boolean {
  return !!post.laterPostId || ENTREGUES.has(post.status)
}

const RE_URL = /^(https?:\/\/|data:)/i

function limpar(textos: Iterable<string>): string[] {
  const out: string[] = []
  for (const t of textos) {
    const limpo = t.trim()
    if (!limpo || RE_URL.test(limpo) || out.includes(limpo)) continue
    out.push(limpo)
  }
  return out
}

function textoDoValor(valor: unknown): string | null {
  if (typeof valor === 'string') return valor
  if (valor && typeof valor === 'object' && typeof (valor as { content?: unknown }).content === 'string') {
    return (valor as { content: string }).content
  }
  return null
}

/**
 * A página com a copy própria do post por cima, camada a camada, como
 * `applySlotValues` faz no render (casa por id OU por nome). Camada oculta não
 * é copy da peça. `null` quando as camadas são ilegíveis.
 */
function textosDaPaginaComSlots(camadas: unknown, slots: Record<string, unknown> | undefined): string[] | null {
  const lidas = lerCamadas(camadas)
  if (!lidas.legivel) return null
  const out: string[] = []
  for (const camada of lidas.camadas) {
    if (camada?.type !== 'text' && camada?.type !== 'rich-text') continue
    if (camada.visible === false) continue
    const slot = slots ? (slots[String(camada.id)] ?? slots[String(camada.name)]) : undefined
    const texto = textoDoValor(slot) ?? (typeof camada.content === 'string' ? camada.content : '')
    out.push(texto)
  }
  return limpar(out)
}

export function textosDaPeca(post: PecaParaTextos, fontes: FontesDaPeca = {}): TextosDaPeca {
  const sv = post.slotValues
  const proprios = slotValuesParaRender(sv)
  const textosProprios = limpar(Object.values(textosDoSlot(proprios ?? null) ?? {}))

  if (arteEntregue(post)) {
    const arte = fontes.arte
    if (arte?.resultUrl && arte.layersSnapshot !== undefined && arte.layersSnapshot !== null && post.mediaUrls.includes(arte.resultUrl)) {
      const doSnapshot = limpar(Object.values(textosDaPagina(arte.layersSnapshot)))
      if (doSnapshot.length > 0) return { textos: doSnapshot, origem: 'arte-entregue' }
    }
    if (textosProprios.length > 0) return { textos: textosProprios, origem: 'copy-do-post' }
    if (ehCopiaDaPagina(sv)) {
      const registrada = limpar(Object.values(textosDoSlot(sv) ?? {}))
      if (registrada.length > 0) return { textos: registrada, origem: 'copy-registrada-na-entrega' }
    }
    return {
      textos: [],
      indisponiveis:
        'a arte desta peça já foi entregue (no publicador, publicada ou falhou) e a página pode ter mudado depois: o texto que vale é o da própria arte, e não há registro dele aqui.',
    }
  }

  if (fontes.camadas !== undefined) {
    const daPagina = textosDaPaginaComSlots(fontes.camadas, proprios)
    if (daPagina && daPagina.length > 0) {
      return { textos: daPagina, origem: proprios ? 'pagina-com-copy-do-post' : 'pagina' }
    }
    if (daPagina === null && textosProprios.length === 0 && !textosDoSlot(sv)) {
      return { textos: [], indisponiveis: 'as camadas da página não puderam ser lidas.' }
    }
  }

  const doPost = limpar(Object.values(textosDoSlot(sv) ?? {}))
  if (doPost.length > 0) return { textos: doPost, origem: 'copy-do-post' }
  return { textos: [] }
}
