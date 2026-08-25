/**
 * Derivações de leitura do catálogo — hoje o `tools/list`; o catálogo em
 * markdown para as skills entra aqui no PR 7.
 */

import type { Superficie, ToolParaLista, ToolPronta } from './tipos'

/**
 * A lista que o `tools/list` serve para uma superfície.
 *
 * Apelidos ficam DE FORA de propósito: eles resolvem na chamada (cliente com
 * lista velha continua funcionando), mas listá-los dobraria o catálogo que o
 * modelo lê.
 */
export function catalogoParaLista(
  catalogo: ReadonlyMap<string, ToolPronta>,
  superficie: Superficie,
): ToolParaLista[] {
  const lista: ToolParaLista[] = []
  for (const tool of catalogo.values()) {
    if (!tool.superficies.includes(superficie)) continue
    lista.push({
      name: tool.nome,
      description: tool.descricao,
      inputSchema: tool.schemaJson,
      annotations: { ...tool.annotations },
    })
  }
  return lista
}
