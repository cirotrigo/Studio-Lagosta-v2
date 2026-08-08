/**
 * Os endereços da agenda, num lugar só.
 *
 * A Fase 2 tira a agenda de dentro de uma aba (`/projects/[id]?tab=agenda`) e
 * a põe em rotas próprias. A migração é por tela, então durante ela convivem
 * a aba (ainda a lista) e a rota do post (já pronta) — e é exatamente aí que
 * um href literal esquecido num canto vira link quebrado.
 *
 * Quando a entrega 2.2 criar `/projects/[id]/agenda`, muda-se `agendaHref`
 * aqui e todo mundo acompanha.
 */

/** A agenda do cliente, em tela cheia (rota própria desde 08/08/2026). */
export function agendaHref(projectId: number | string): string {
  return `/projects/${projectId}/agenda`
}

/** A tela de um post. */
export function postHref(projectId: number | string, postId: string): string {
  return `/projects/${projectId}/agenda/${postId}`
}

/**
 * Criar post. `quando` preenche o horário — é o que o botão "+" de um dia da
 * agenda manda.
 */
export function novoPostHref(projectId: number | string, quando?: Date): string {
  const base = `/projects/${projectId}/agenda/novo`
  return quando ? `${base}?data=${encodeURIComponent(quando.toISOString())}` : base
}

/** Editar post. */
export function editarPostHref(projectId: number | string, postId: string): string {
  return `/projects/${projectId}/agenda/${postId}/editar`
}
