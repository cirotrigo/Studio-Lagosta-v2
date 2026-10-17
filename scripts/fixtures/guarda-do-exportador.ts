/**
 * A GUARDA do exportador do piloto sintético — pura, para o teste exercitar. FAIL-CLOSED: a URL de dev só é aceita quando a
 * identidade da produção (`.env`) e a do dev (`.env.development.local`) puderam ser lidas e os computes são DIFERENTES.
 * Sem a identidade da produção não há como PROVAR que o dev não é ela — e aí a resposta é recusar, não seguir.
 *
 * O `.env` é lido SÓ para isso (a identidade da produção); nenhuma conexão sai dele.
 */
import { computeDe } from '../../src/lib/compute-do-banco'
import { recusaDoBancoDeDev } from '../dev-db'

export interface Ambientes {
  /** `.env` parseado, ou null quando o arquivo não existe/não pôde ser lido. */
  prod: Record<string, string> | null
  /** `.env.development.local` parseado, ou null idem. */
  dev: Record<string, string> | null
}

/** Por que NÃO exportar (título + linhas); `null` quando a URL de dev está provada como não-produção. */
export function recusaDoExportador({ prod, dev }: Ambientes): { titulo: string; linhas: string[] } | null {
  if (!dev) return { titulo: '`.env.development.local` não existe ou não pôde ser lido.', linhas: ['O exportador NUNCA cai no `.env`: crie o branch de dev (npm run db:dev:setup) antes de exportar.'] }
  if (!prod) return { titulo: '`.env` não existe ou não pôde ser lido: sem a identidade da PRODUÇÃO não dá para provar que o dev não é ela.', linhas: ['A guarda é fail-closed: recusa em vez de seguir.'] }
  const computesDaProducao = ['DATABASE_URL', 'DIRECT_URL'].map((k) => computeDe(prod[k])).filter((c): c is string => c !== null)
  if (computesDaProducao.length === 0) return { titulo: 'O `.env` não tem uma URL de produção parseável: sem compute da produção a comparação não existe.', linhas: ['A guarda é fail-closed: recusa em vez de seguir.'] }
  // O mesmo guard do runner dos comandos de banco (`scripts/dev-db.ts`): dev sem as duas URLs, URL inválida ou compute igual ao da produção.
  return recusaDoBancoDeDev(prod, dev)
}

/** Parser mínimo de `.env` (KEY=valor, aspas opcionais, `#` comenta); `null` quando o arquivo não existe. */
export function lerEnv(conteudo: string | null): Record<string, string> | null {
  if (conteudo === null) return null
  const saida: Record<string, string> = {}
  for (const linha of conteudo.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha)
    if (!m || linha.trim().startsWith('#')) continue
    saida[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return saida
}
