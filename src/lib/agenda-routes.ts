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
 * Criar post. `quando` preenche o horário; com `soDia`, manda só o DIA
 * (`?dia=AAAA-MM-DD`) e o formulário escolhe a hora entre os horários típicos
 * do cliente naquele dia da semana — é o que o "+" de um dia da agenda faz
 * desde 05/09/2026 (antes cravava 10:00, uma hora que não vinha de lugar
 * nenhum).
 */
export function novoPostHref(
  projectId: number | string,
  quando?: Date,
  opcoes: { soDia?: boolean } = {},
): string {
  const base = `/projects/${projectId}/agenda/novo`
  if (!quando) return base
  if (opcoes.soDia) {
    const dia = `${quando.getFullYear()}-${String(quando.getMonth() + 1).padStart(2, '0')}-${String(quando.getDate()).padStart(2, '0')}`
    return `${base}?dia=${dia}`
  }
  return `${base}?data=${encodeURIComponent(quando.toISOString())}`
}

/** Editar post. */
export function editarPostHref(projectId: number | string, postId: string): string {
  return `/projects/${projectId}/agenda/${postId}/editar`
}

/**
 * Publicar um lembrete na mão: as artes para salvar no rolo, a legenda e o
 * primeiro comentário para copiar, e o atalho que abre o Instagram. É para
 * onde apontam o "Publicar agora" da tela do post e o do card da agenda
 * quando o post é lembrete (`publishType: REMINDER`) — o sistema não publica
 * esses posts, alguém publica pelo celular.
 */
export function publicarLembreteHref(projectId: number | string, postId: string): string {
  return `/projects/${projectId}/agenda/${postId}/publicar`
}
