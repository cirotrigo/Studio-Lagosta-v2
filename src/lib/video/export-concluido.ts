/**
 * O MP4 que ficou pronto enquanto a aba Criativos estava FECHADA: o shell
 * guarda a conclusão e abre a aba; o painel, ao montar, consome e abre o
 * agendamento. Sem isto o evento chegava antes do painel existir e se perdia.
 * Módulo mínimo fora do React, como `insercao-de-clipe`.
 */
let pendente: unknown = null

export function guardarExportConcluido(detalhe: unknown): void {
  pendente = detalhe
}

/** Lê E limpa: a conclusão é entregue uma vez só. */
export function consumirExportConcluido(): unknown {
  const era = pendente
  pendente = null
  return era
}
