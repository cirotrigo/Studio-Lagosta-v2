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

/** Pilha de desfazer de UMA página — o editor guarda uma por pageId. */
export interface PilhaDeDesfazer<T> {
  past: T[]
  future: T[]
}

/**
 * Toda edição que entra no desfazer: o estado de antes abre entrada nova (50
 * níveis) — a menos que a escrita continue a anterior — e o refazer morre.
 * Muta a pilha de propósito: ela é a entrada da página no mapa de históricos, e
 * trocar o objeto soltaria o mapa. `antes` só roda quando a entrada é nova (um
 * clone por tecla custaria caro). Devolve a última chave a lembrar.
 */
export function registrarEdicao<T>(
  pilha: PilhaDeDesfazer<T>,
  antes: () => T,
  ultima: { key: string | null; time: number },
  opcoes: { coalesceKey?: string; gesto?: boolean } | undefined,
  agora: number,
): { key: string | null; time: number } {
  if (!mesmaEntradaDeDesfazer(ultima, opcoes, agora)) {
    pilha.past = [...pilha.past.slice(-49), antes()]
  }
  pilha.future = []
  return { key: opcoes?.coalesceKey ?? null, time: agora }
}

/** Cmd+Z: devolve o estado de antes (null sem passado) e guarda o atual no refazer. */
export function desfazerNaPilha<T>(pilha: PilhaDeDesfazer<T>, atual: () => T): T | null {
  if (pilha.past.length === 0) return null
  const anterior = pilha.past[pilha.past.length - 1]
  pilha.past = pilha.past.slice(0, -1)
  pilha.future = [atual(), ...pilha.future].slice(0, 50)
  return anterior
}
