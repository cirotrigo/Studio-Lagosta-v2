/**
 * A costura entre o catálogo novo e o mundo de hoje — o ÚNICO módulo desta
 * pasta que pode importar `tools.ts` estaticamente (ele puxa db e ~40
 * serviços; por isso o validar-registro-mcp.ts não passa por aqui).
 *
 * Convivência da migração: a porta consulta o catálogo primeiro e cai no
 * dispatcher legado; o tools/list funde os dois, com o catálogo vencendo por
 * nome. Tool migrada é REMOVIDA do array legado no mesmo PR — deixá-la lá
 * seria uma segunda fonte de verdade esperando divergir.
 */

import {
  MCP_TOOLS,
  runMcpTool,
  assertProjetoPermitido,
  assertCuradorDoProjeto,
} from '../tools'
import type { McpPrincipal } from '../oauth'
import { executarTool } from '../registro/porta'
import { catalogoParaLista } from '../registro/derivar'
import type { ResultadoMcp, ToolParaLista } from '../registro/tipos'
import { CATALOGO, INDICE_DO_CATALOGO } from './index'

export async function executarToolRemota(
  nome: string,
  args: Record<string, unknown>,
  principal: McpPrincipal,
): Promise<ResultadoMcp> {
  return executarTool(INDICE_DO_CATALOGO, 'remoto', nome, args, principal, {
    gates: { projeto: assertProjetoPermitido, curador: assertCuradorDoProjeto },
    legado: (n, a, p) => runMcpTool(n, a as Record<string, any>, p),
  })
}

/** Catálogo novo + tools ainda não migradas, sem duplicar nome. */
export function listarToolsRemotas(): ToolParaLista[] {
  const doCatalogo = catalogoParaLista(CATALOGO, 'remoto')
  const nomesNovos = new Set(doCatalogo.map((t) => t.name))
  const legadas = MCP_TOOLS.filter((t) => !nomesNovos.has(t.name)).map(
    ({ name, description, inputSchema }) => ({ name, description, inputSchema }),
  )
  return [...doCatalogo, ...legadas]
}
