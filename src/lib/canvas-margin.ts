/**
 * As MARGENS DO EDITOR — fonte única (L0 das linhas-guia, 29/10/2026).
 *
 * O editor desenha DUAS camadas, e são coisas diferentes (decisão do owner de 13/10/2026):
 *
 * - a **faixa da interface do Instagram**, só no Story: onde o app desenha avatar, barra de progresso e caixa de
 *   resposta. Texto e logo não entram; foto pode passar por baixo. Vem de `interfaceDoStory` (piso 188/224, que a
 *   configuração do cliente só aperta, nunca afrouxa);
 * - a **margem da marca** (composição): `GEOMETRIA_PADRAO` (o `NUMEROS_PADRAO.geometria` do compositor) com
 *   `Project.assinatura` por cima, pela MESMA mesclagem do compositor (`pisoDoProjetoDe` em `geometria.ts`, o
 *   `pisoDoProjeto` de `assinatura.ts`). Padrão da casa: Story 92/188/224, Feed 4:5 e Quadrado 92/120/104. É nela
 *   que o encaixe, o alinhar e as guias azuis trabalham.
 *
 * Nenhuma constante nova com 188, 224 ou 92: os números moram em `interface-do-story.ts` e em `geometria.ts`.
 * Página fora do tamanho canônico escala por `largura / 1080`, como o revisor (`text-geometry.ts`).
 *
 * As margens são ASSIMÉTRICAS no eixo vertical: quem consome trata início e fim separadamente.
 */
import { GEOMETRIA_PADRAO, pisoDoProjetoDe } from '@/lib/compositor/geometria'
import type { Formato } from '@/lib/compositor/spec'
import { interfaceDoStory } from '@/lib/creatives/revisao/interface-do-story'

export interface MargensDoEditor {
  /** A faixa da interface do Instagram, em px da página: ALTURA da faixa de cima e da de baixo. `null` fora do Story. */
  interface: { topo: number; rodape: number } | null
  /** As quatro LINHAS da margem da marca, em coordenadas da página (como `limitesDoEditor` do revisor). */
  marca: { topo: number; base: number; esquerda: number; direita: number }
  /** `marca` quando `Project.assinatura` tem geometria válida para o formato; `padrao` é `NUMEROS_PADRAO`. */
  origem: 'marca' | 'padrao'
}

const CHAVES = ['margemH', 'safeTopo', 'safeRodape'] as const

/** Número finito e não negativo; qualquer outra coisa (NaN, string, negativo) cai no padrão — nunca afrouxa por lixo. */
function numeroOu(v: unknown, padrao: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : padrao
}

export function margensDoEditor(args: { formato: Formato; assinatura: unknown; largura: number; altura: number }): MargensDoEditor {
  const { formato, largura, altura } = args
  const s = Number.isFinite(largura) && largura > 0 ? largura / 1080 : 1
  const padrao = GEOMETRIA_PADRAO[formato]
  const piso = pisoDoProjetoDe(args.assinatura)[formato]
  const margemH = numeroOu(piso.margemH, padrao.margemH)
  const safeTopo = numeroOu(piso.safeTopo, padrao.safeTopo)
  const safeRodape = numeroOu(piso.safeRodape, padrao.safeRodape)

  const g = (args.assinatura as { geometria?: Record<string, Record<string, unknown>> } | null)?.geometria?.[formato]
  const daMarca = !!g && typeof g === 'object' && CHAVES.some((k) => numeroOu(g[k], -1) >= 0)

  const faixa = formato === 'story' ? interfaceDoStory() : null
  return {
    interface: faixa ? { topo: faixa.topo * s, rodape: faixa.rodape * s } : null,
    marca: { topo: safeTopo * s, base: altura - safeRodape * s, esquerda: margemH * s, direita: largura - margemH * s },
    origem: daMarca ? 'marca' : 'padrao',
  }
}

// ─── Os consumidores antigos ────────────────────────────────────────────────

const padraoDoStory = margensDoEditor({ formato: 'story', assinatura: null, largura: 1080, altura: 1920 }).marca

/**
 * A margem padrão do Story (92/188/224), nos nomes antigos — delega para `margensDoEditor`. Com o L1 os
 * consumidores do editor passam a chamar `margensDoEditor` com o formato e a assinatura da página aberta.
 */
export const CANVAS_MARGIN = {
  top: padraoDoStory.topo,
  right: 1080 - padraoDoStory.direita,
  bottom: 1920 - padraoDoStory.base,
  left: padraoDoStory.esquerda,
} as const

/** Margens do eixo (`x` → esquerda/direita, `y` → topo/base). */
export function marginsForAxis(axis: 'x' | 'y'): { start: number; end: number } {
  return axis === 'x'
    ? { start: CANVAS_MARGIN.left, end: CANVAS_MARGIN.right }
    : { start: CANVAS_MARGIN.top, end: CANVAS_MARGIN.bottom }
}

/**
 * 🔴 LEGADO até o L5: os números que o revisor (`fora-da-area-segura`), o autofix e o `text-geometry` conferiam quando
 * as guias do editor eram 70/120/100. O L0 mudou só o editor; mudar o revisor exige medir antes quantas artes agendadas
 * mudariam de aviso, e o Ciro confirma no chat. Ninguém novo importa isto.
 */
export const MARGEM_LEGADA_DO_REVISOR = { top: 120, right: 70, bottom: 100, left: 70 } as const
