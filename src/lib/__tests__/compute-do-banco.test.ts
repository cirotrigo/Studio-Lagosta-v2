import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeDe, nomeDoBancoDe } from '../compute-do-banco'
import { recusaDoBancoDeDev } from '../../../scripts/dev-db'

/**
 * `postgresql:` é esquema NÃO especial: o `new URL` preserva a caixa do host, e o DNS não a distingue. As guardas
 * comparavam o compute como string, então `EP-PROD-123-POOLER…` conectava na produção e passava como dev (nem o
 * `-POOLER` saía). A lição do PR13-49 — identidade do endpoint, nunca a string — no runner de `db:migrate`,
 * `db:push` e `db:reset`, e em toda prova que se guarda contra produção.
 */
const PROD = {
  DATABASE_URL: 'postgresql://u:p@ep-prod-123-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  DIRECT_URL: 'postgresql://u:p@ep-prod-123.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
}
const DEV = {
  DATABASE_URL: 'postgresql://u:p@ep-dev-456-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  DIRECT_URL: 'postgresql://u:p@ep-dev-456.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
}
/** O mesmo endereço com o host em CAIXA ALTA: conecta no mesmo compute. */
const emCaixaAlta = (url: string) => url.replace(/@([^/]+)\//, (_, host: string) => `@${host.toUpperCase()}/`)

describe('computeDe — o compute não depende da caixa do host', () => {
  it('EP-PROD-123-POOLER e Ep-Prod-123 são o compute ep-prod-123 (minúsculas ANTES de tirar o -pooler)', () => {
    expect(computeDe(emCaixaAlta(PROD.DATABASE_URL))).toBe('ep-prod-123')
    expect(computeDe('postgresql://u:p@Ep-Prod-123.c-2.us-east-1.aws.neon.tech/neondb')).toBe('ep-prod-123')
    expect(computeDe('nada')).toBeNull()
  })

  it('o NOME do banco guarda a caixa: no Postgres /NeonDB e /neondb são bancos diferentes', () => {
    expect(nomeDoBancoDe('postgresql://u:p@ep-a.x.neon.tech/NeonDB')).toBe('NeonDB')
  })
})

describe('scripts/dev-db.ts — a guarda de db:migrate, db:push e db:reset', () => {
  it('recusa a URL de PRODUÇÃO escrita em outra caixa no .env.development.local', () => {
    for (const chave of ['DATABASE_URL', 'DIRECT_URL'] as const) {
      const recusa = recusaDoBancoDeDev(PROD, { ...DEV, [chave]: emCaixaAlta(PROD[chave]) })
      expect(recusa?.titulo, chave).toMatch(/PRODUÇÃO/)
      expect(recusa?.linhas[0], chave).toContain('ep-prod-123')
    }
  })

  it('recusa também quando é o .env que está em outra caixa', () => {
    const prodEmCaixaAlta = { DATABASE_URL: emCaixaAlta(PROD.DATABASE_URL), DIRECT_URL: emCaixaAlta(PROD.DIRECT_URL) }
    expect(recusaDoBancoDeDev(prodEmCaixaAlta, { ...DEV, DIRECT_URL: PROD.DIRECT_URL })?.titulo).toMatch(/PRODUÇÃO/)
  })

  it('controle: as URLs do branch de dev passam', () => {
    expect(recusaDoBancoDeDev(PROD, DEV)).toBeNull()
  })
})

describe('uma só identidade de compute', () => {
  it('nenhum arquivo refaz o parse do host: toda guarda contra produção passa por computeDe', () => {
    const raiz = resolve(__dirname, '../../..')
    const copias = ['scripts', 'src'].flatMap((dir) =>
      (readdirSync(join(raiz, dir), { recursive: true }) as string[])
        .filter((arquivo) => /\.(ts|tsx|mjs|js)$/.test(arquivo))
        .filter((arquivo) => /hostname\.split\(['"]\.['"]\)\[0\]/.test(readFileSync(join(raiz, dir, arquivo), 'utf8')))
        .map((arquivo) => join(dir, arquivo)),
    )
    expect(copias).toEqual([])
  })
})
