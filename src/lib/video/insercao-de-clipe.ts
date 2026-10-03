/**
 * O "+" da linha do tempo abre a aba Imagens/Vídeos ARMADA: a próxima foto ou
 * vídeo inserido entra como clipe (ver `inserirClipe`). Módulo mínimo fora do
 * React: a aba e o contexto do editor não se conhecem.
 */
let armado = false

export function armarInsercaoDeClipe(): void {
  armado = true
}

export function desarmarInsercaoDeClipe(): void {
  armado = false
}

/** Lê E desarma: a inserção seguinte volta a ser comum. */
export function consumirInsercaoDeClipe(): boolean {
  const era = armado
  armado = false
  return era
}
