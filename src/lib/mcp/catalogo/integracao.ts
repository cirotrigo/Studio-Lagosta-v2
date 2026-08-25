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
import { KnowledgeCategory } from '@prisma/client'
import { BRAND_DNA_FIELDS } from '../../brand/brand-context'
import { CATEGORIAS_DA_BASE, SECOES_DO_DNA } from './base-e-dna'
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

/**
 * Vigias dos vocabulários cravados em catalogo/base-e-dna.ts — os donos
 * (enum do Prisma, BRAND_DNA_FIELDS) não podem entrar estáticos num módulo
 * que carrega sem env, então o espelho é conferido aqui, onde o peso é
 * permitido. Divergiu, o boot quebra em vez de o schema mentir.
 */
{
  const reais = Object.values(KnowledgeCategory).sort().join(',')
  const espelho = [...CATEGORIAS_DA_BASE].sort().join(',')
  if (reais !== espelho) {
    throw new TypeError(
      `CATEGORIAS_DA_BASE divergiu do enum KnowledgeCategory. Enum: ${reais}. Espelho: ${espelho}.`,
    )
  }
  const secoesReais = [...BRAND_DNA_FIELDS].sort().join(',')
  const secoesEspelho = [...SECOES_DO_DNA].sort().join(',')
  if (secoesReais !== secoesEspelho) {
    throw new TypeError(
      `SECOES_DO_DNA divergiu de BRAND_DNA_FIELDS. Real: ${secoesReais}. Espelho: ${secoesEspelho}.`,
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

/**
 * A porta do servidor LOCAL (stdio). Sem fallback legado: o que não está no
 * catálogo com superfície "local" não existe por aqui — as tools inglesas
 * próprias do stdio (upload, render, Zernio) são registradas direto no SDK
 * pelo scripts/mcp-server.ts, fora desta porta.
 */
export async function executarToolLocal(
  nome: string,
  args: Record<string, unknown>,
  principal: McpPrincipal,
): Promise<ResultadoMcp> {
  return executarTool(INDICE_DO_CATALOGO, 'local', nome, args, principal, {
    gates: { projeto: assertProjetoPermitido, curador: assertCuradorDoProjeto },
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
