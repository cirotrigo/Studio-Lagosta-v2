/**
 * A escrita continua a entrada de desfazer anterior? Mesma `coalesceKey`
 * dentro de 800 ms, ou — com `gesto` — durante o gesto inteiro. Desfazer e
 * refazer zeram a última chave, então a escrita seguinte abre entrada nova.
 */
export function mesmaEntradaDeDesfazer(
  ultima: { key: string | null; time: number },
  opcoes: { coalesceKey?: string; gesto?: boolean } | undefined,
  agora: number,
): boolean {
  return (
    opcoes?.coalesceKey !== undefined &&
    ultima.key === opcoes.coalesceKey &&
    (opcoes.gesto === true || agora - ultima.time < 800)
  )
}
