/**
 * Movimento na foto (Fase 2 do plano de 03/10/2026): zoom e deslize do
 * CONTEÚDO dentro da própria caixa da camada, só em página-vídeo. Módulo PURO:
 * o editor e o export (aplicar-quadro.ts) e o render de servidor
 * (render-engine.ts) desenham o MESMO quadro. Nada gravado na camada muda —
 * caixa, recorte e posição são os de sempre; o movimento é só de desenho.
 *
 * Geometria, em fração da caixa: escala em torno do centro e deslocamento ao
 * longo do eixo X da própria caixa (gira junto se a camada girar), com o
 * desenho recortado pela caixa. Como a escala nunca é < 1 e o deslize (6,5%)
 * é menor que a sobra dela (7,5% de cada lado), o conteúdo sempre cobre a caixa.
 */

import { paginaEVideo } from './camadas-de-video'
import type { Clipe } from './linha-do-tempo'

export const MOVIMENTOS = ['aproximar', 'afastar', 'deslizar'] as const
export type Movimento = (typeof MOVIMENTOS)[number]

export function ehMovimento(v: unknown): v is Movimento {
  return typeof v === 'string' && (MOVIMENTOS as readonly string[]).includes(v)
}

export const ESCALA_DO_MOVIMENTO = 1.15
/** Meia-amplitude do deslize, em fração da largura da caixa. */
export const DESLIZE_DO_MOVIMENTO = 0.065

/**
 * O editor cacheia a foto filtrada em movimento nesta densidade (relativa ao
 * cache comum), para o zoom não amaciar o bitmap.
 */
export const DENSIDADE_DO_CACHE_DO_MOVIMENTO = ESCALA_DO_MOVIMENTO

/**
 * O raio do desfoque do Konva é em pixels do BITMAP do cache: com o cache mais
 * denso, o mesmo raio desfoca menos a foto. Compensado aqui, o desfoque da
 * foto em movimento é o mesmo da foto parada — e o do render de servidor.
 */
export function raioDoBlurNoCache(blur: number, emMovimento: boolean): number {
  return emMovimento ? blur * DENSIDADE_DO_CACHE_DO_MOVIMENTO : blur
}

export type QuadroDoMovimento = { escala: number; deslocamentoX: number }
export const QUADRO_PARADO: QuadroDoMovimento = { escala: 1, deslocamentoX: 0 }

/**
 * Campo TRANSITÓRIO que `camadasNoInstante` põe na foto em movimento para o
 * render de servidor. Só existe nas camadas montadas para desenhar — nunca é
 * gravado (persist, story-renderer e a prévia montam e descartam).
 */
export const QUADRO_ANOTADO = '__quadroDoMovimento'

/** Suavização leve: metade linear, metade smoothstep (também a do deslize entre clipes). */
export function suavizar(p: number): number {
  return 0.5 * p + 0.5 * p * p * (3 - 2 * p)
}

function preso(p: number): number {
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0
}

export function quadroDoMovimento(movimento: unknown, progresso: number): QuadroDoMovimento {
  if (!ehMovimento(movimento)) return QUADRO_PARADO
  const s = suavizar(preso(progresso))
  const sobra = ESCALA_DO_MOVIMENTO - 1
  switch (movimento) {
    case 'aproximar':
      return { escala: 1 + sobra * s, deslocamentoX: 0 }
    case 'afastar':
      return { escala: ESCALA_DO_MOVIMENTO - sobra * s, deslocamentoX: 0 }
    case 'deslizar':
      return { escala: ESCALA_DO_MOVIMENTO, deslocamentoX: -DESLIZE_DO_MOVIMENTO + 2 * DESLIZE_DO_MOVIMENTO * s }
  }
}

/**
 * Quanto do movimento já andou no instante `t` da página: o clipe anda dentro
 * do próprio intervalo; a foto fora da sequência anda a página inteira. Preso
 * em [0, 1] — antes do clipe segura o primeiro quadro, depois, o último.
 */
export function progressoDoMovimento(
  camada: { id: string },
  linha: { clipes: readonly Clipe[]; duracao: number | null },
  t: number,
): number {
  const clipe = linha.clipes.find((c) => c.id === camada.id)
  if (clipe) return clipe.duracao > 0 ? preso((t - clipe.inicio) / clipe.duracao) : 0
  return linha.duracao !== null && linha.duracao > 0 ? preso(t / linha.duracao) : 0
}

/**
 * O quadro 0 da página sai com o movimento? A foto só anda em página-vídeo, e
 * a música decide isso (`paginaEVideo`): com foto em movimento, trocar o áudio
 * muda o PNG do quadro 0. `null` = página sem foto em movimento, o áudio não
 * muda nada. Regra única da versão (`versaoDaPagina`) e do PATCH da página.
 */
export function quadroZeroEmVideo(camadas: readonly Record<string, unknown>[], audio: unknown): boolean | null {
  if (!camadas.some((c) => c?.type === 'image' && ehMovimento(c.movimento))) return null
  return paginaEVideo(camadas as Parameters<typeof paginaEVideo>[0], audio as Parameters<typeof paginaEVideo>[1])
}

/** O quadro anotado numa camada montada para o render (ou `null`). */
export function quadroAnotado(camada: unknown): QuadroDoMovimento | null {
  const q = (camada as Record<string, unknown> | null)?.[QUADRO_ANOTADO] as QuadroDoMovimento | undefined
  return q && Number.isFinite(q.escala) && Number.isFinite(q.deslocamentoX) ? q : null
}
