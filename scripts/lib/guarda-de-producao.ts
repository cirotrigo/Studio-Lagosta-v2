/**
 * O guard de produção de um script SÓ DE LEITURA que lê pelo `db` da aplicação (PR 15,
 * `scripts/medir-qualidade-da-copy.ts`). Sem Prisma e sem importar módulo do app: decide ANTES de o `db` existir.
 *
 * - A produção é reconhecida pelo COMPUTE do Neon (o primeiro rótulo do host, sem `-pooler`) das URLs do `.env` —
 *   nunca pelo nome do branch. Sem nenhuma URL legível no `.env`, falha FECHADO: não há como saber o que é produção.
 * - O compute é comparado EM MINÚSCULAS dos dois lados (o `computeDe` de `destino-da-prova.ts`): `postgresql:` é
 *   esquema NÃO especial, o `new URL` preserva a caixa do host, e o DNS não a distingue — `EP-PROD-…` (ou
 *   `…-POOLER`) conecta na produção e, comparado como string, passava por "não-produção" sem a flag (a lição da
 *   revisão do PR 12, R12-10).
 * - UM destino só: o script lê pelo `db`, cuja URL sai do `DATABASE_URL` (o `DIRECT_URL` não é usado em runtime).
 *   Por isso não há "mesmo compute E mesmo nome de banco" a conferir, como há na prova que abre conexões auxiliares.
 */
import { CHAVES_DE_BANCO, computeDe } from './destino-da-prova'

export type UrlsDoEnv = Partial<Record<(typeof CHAVES_DE_BANCO)[number], string>>

export type BancoDaLeitura = { ok: true; compute: string; ehProducao: boolean } | { ok: false; motivo: 'sem-env' | 'sem-url' }

export function bancoDaLeitura(env: UrlsDoEnv | null, databaseUrl: string | null | undefined): BancoDaLeitura {
  const producao = new Set(CHAVES_DE_BANCO.map((k) => computeDe(env?.[k])).filter((c): c is string => c !== null))
  if (producao.size === 0) return { ok: false, motivo: 'sem-env' }
  const compute = computeDe(databaseUrl)
  return compute ? { ok: true, compute, ehProducao: producao.has(compute) } : { ok: false, motivo: 'sem-url' }
}
