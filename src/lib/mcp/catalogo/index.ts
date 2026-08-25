/**
 * Montagem do catálogo: um Map por nome canônico + um índice que resolve
 * também os apelidos. Colisão de nome quebra NO LOAD — o catálogo ambíguo
 * nunca chega a servir uma chamada.
 *
 * Este módulo (e tudo que ele importa estaticamente) carrega SEM env: é o que
 * permite ao `validar-registro-mcp.ts` conferir os invariantes no CI. A regra
 * está no cabeçalho de clientes.ts; arquivo de domínio novo segue a mesma.
 */

import type { ToolPronta } from '../registro/tipos'
import { toolsDeAgenda } from './agenda'
import { toolsDeClientes } from './clientes'
import { toolsDeModelos } from './modelos'

const TODAS: ToolPronta[] = [...toolsDeClientes, ...toolsDeModelos, ...toolsDeAgenda]

const catalogo = new Map<string, ToolPronta>()
const indice = new Map<string, ToolPronta>()

for (const tool of TODAS) {
  for (const nome of [tool.nome, ...tool.apelidos]) {
    const existente = indice.get(nome)
    if (existente) {
      throw new TypeError(
        `Catálogo MCP com colisão de nome: "${nome}" aparece em ${existente.nome} e ${tool.nome}.`,
      )
    }
    indice.set(nome, tool)
  }
  catalogo.set(tool.nome, tool)
}

/** Tools por nome canônico — é o que o tools/list percorre. */
export const CATALOGO: ReadonlyMap<string, ToolPronta> = catalogo

/** Nome canônico E apelidos → tool — é o que a porta consulta na chamada. */
export const INDICE_DO_CATALOGO: ReadonlyMap<string, ToolPronta> = indice
