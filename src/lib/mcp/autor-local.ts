/**
 * Quem está sentado NESTE Mac — o autor das artes pedidas pelo servidor MCP
 * local (`scripts/mcp-server.ts`).
 *
 * O Ciro e a Roberta usam a MESMA conta do Claude em Macs diferentes
 * (04/09/2026), então a identidade não pode vir do Claude: vem da máquina.
 * `STUDIO_AUTOR` (e-mail de login no Studio ou clerkId) é exportado pelo
 * `mcp-wrapper.sh` a partir do arquivo `.studio-autor` da raiz, gitignored.
 *
 * Sem a variável, ou com um valor que não é usuário do Studio, o servidor
 * segue assinando com o dono do projeto ("Automações") — e AVISA no stderr,
 * porque assinar errado em silêncio é o defeito que a coluna `canal` já
 * consertou uma vez.
 */
import { db } from '@/lib/db'
import type { McpPrincipal } from '@/lib/mcp/oauth'
import { CLIENT_ID_LOCAL } from '@/lib/mcp/tools'

export interface AutorLocal {
  id: string
  clerkId: string
  email: string | null
  name: string | null
}

export async function resolverAutorLocal(valor = process.env.STUDIO_AUTOR): Promise<AutorLocal | null> {
  const v = (valor ?? '').trim()
  if (!v) return null
  const where = v.startsWith('user_') ? { clerkId: v } : { email: { equals: v, mode: 'insensitive' as const } }
  const u = await db.user.findFirst({ where, select: { id: true, clerkId: true, email: true, name: true } })
  if (!u || !u.clerkId.startsWith('user_')) return null
  return u
}

/** O principal do servidor local: a pessoa do Mac quando declarada, senão o serviço. */
export function principalLocal(autor: AutorLocal | null): McpPrincipal {
  return autor ? { kind: 'user', userId: autor.clerkId, clientId: CLIENT_ID_LOCAL } : { kind: 'service', clientId: CLIENT_ID_LOCAL }
}
