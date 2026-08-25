/**
 * A costura entre o catálogo e as superfícies — o ÚNICO módulo desta pasta
 * que pode importar `tools.ts` (e outros módulos pesados) estaticamente; por
 * isso o validar-registro-mcp.ts não passa por aqui, e é aqui que moram as
 * SENTINELAS dos vocabulários cravados no catálogo.
 */

import { assertProjetoPermitido, assertCuradorDoProjeto } from '../tools'
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

/** O tools/list do conector remoto — o catálogo inteiro, com annotations. */
export function listarToolsRemotas(): ToolParaLista[] {
  return catalogoParaLista(CATALOGO, 'remoto')
}
