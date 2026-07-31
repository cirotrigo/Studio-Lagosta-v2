/**
 * Margem de segurança do canvas — as guias azuis pontilhadas do editor.
 *
 * Valor único para as guias, o snap e o alinhamento. Enquanto cada um tinha o
 * seu, "alinhar à esquerda" encostava na borda da página em vez da guia que o
 * usuário estava vendo.
 *
 * As margens são ASSIMÉTRICAS no eixo vertical: a interface do Instagram come
 * mais espaço no topo (foto do perfil, barra de progresso do story) do que na
 * base. Quem consumir estes valores precisa tratar início e fim separadamente —
 * não existe mais "a margem" como número único.
 */
export const CANVAS_MARGIN = {
  top: 120,
  right: 70,
  bottom: 100,
  left: 70,
} as const

/** Margens do eixo (`x` → esquerda/direita, `y` → topo/base). */
export function marginsForAxis(axis: 'x' | 'y'): { start: number; end: number } {
  return axis === 'x'
    ? { start: CANVAS_MARGIN.left, end: CANVAS_MARGIN.right }
    : { start: CANVAS_MARGIN.top, end: CANVAS_MARGIN.bottom }
}
