/**
 * A identidade de uma URL de banco do Neon: o COMPUTE e o NOME do banco. Sem dependências de propósito — o runner do
 * banco de dev (`scripts/dev-db.ts`), o `setup-dev-db` e as provas importam isto ANTES de o ambiente existir, e é por
 * `computeDe` que todos decidem "isto é produção?". Guarda nova contra produção usa esta função; nunca refaça o parse
 * do host (até 21/09/2026 eram 22 cópias, nenhuma em minúsculas).
 */

/**
 * O compute: o primeiro rótulo do host, sem o sufixo `-pooler` — `ep-x-pooler.…` e `ep-x.…` são a MESMA instância, e
 * comparar o host inteiro deixaria passar a URL direta de produção no lugar da pooled. `null` quando ilegível.
 *
 * Em MINÚSCULAS, antes de tirar o `-pooler`: `postgresql:` é esquema NÃO especial, o `new URL` preserva a caixa do
 * host, e o DNS não a distingue — `EP-PROD-…-POOLER` conecta na produção e, comparado como string, passava pela guarda
 * como dev (a lição do PR13-49: identidade do endpoint, nunca a string).
 */
export function computeDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().split('.')[0].replace(/-pooler$/, '') || null
  } catch {
    return null
  }
}

/**
 * O NOME do banco na URL (`/neondb`), sem query; `null` quando ilegível ou ausente. COM a caixa, ao contrário do
 * compute: no Postgres `/NeonDB` e `/neondb` são bancos diferentes.
 */
export function nomeDoBancoDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}
