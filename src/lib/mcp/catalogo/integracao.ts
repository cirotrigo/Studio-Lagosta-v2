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
import { MAX_ITENS_POR_PLANO } from '../../planos/plano-service'
import type { McpPrincipal } from '../oauth'
import { executarTool } from '../registro/porta'
import { catalogoParaLista } from '../registro/derivar'
import type { ResultadoMcp, ToolParaLista } from '../registro/tipos'
import { CATALOGO, INDICE_DO_CATALOGO } from './index'

/**
 * Vigia da constante cravada: a descrição de criar-plano.itens diz "Máximo
 * 60" à mão, porque plano-service (dono de MAX_ITENS_POR_PLANO) importa o
 * Prisma e não pode entrar estático no catálogo. Se a constante mudar, o boot
 * quebra aqui — em dev, no smoke e na Vercel — em vez de a descrição mentir.
 */
{
  const criarPlano = CATALOGO.get('criar-plano')
  const descricaoDeItens = (
    (criarPlano?.schemaJson.properties as Record<string, { description?: string }> | undefined)?.itens
      ?.description ?? ''
  )
  if (criarPlano && !descricaoDeItens.includes(`Máximo ${MAX_ITENS_POR_PLANO}.`)) {
    throw new TypeError(
      `criar-plano: a descrição de itens diz outro teto que não MAX_ITENS_POR_PLANO (${MAX_ITENS_POR_PLANO}).`,
    )
  }
}

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
