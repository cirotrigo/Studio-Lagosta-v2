/** A guarda do exportador do piloto é FAIL-CLOSED: só exporta com a produção identificada e um compute de dev diferente dela. */
import { describe, expect, it } from 'vitest'
import { lerEnv, recusaDoExportador } from '../../../../scripts/fixtures/guarda-do-exportador'

const PROD = 'postgresql://u:p@ep-fragrant-term-adnufsao-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require'
const PROD_DIRETA = 'postgresql://u:p@ep-fragrant-term-adnufsao.sa-east-1.aws.neon.tech/neondb?sslmode=require'
const DEV = 'postgresql://u:p@ep-holy-flower-ada0j66v-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require'
const DEV_DIRETA = 'postgresql://u:p@ep-holy-flower-ada0j66v.sa-east-1.aws.neon.tech/neondb?sslmode=require'
const prod = { DATABASE_URL: PROD, DIRECT_URL: PROD_DIRETA }

describe('recusaDoExportador', () => {
  it('aceita um dev com compute diferente da produção', () => {
    expect(recusaDoExportador({ prod, dev: { DATABASE_URL: DEV, DIRECT_URL: DEV_DIRETA } })).toBeNull()
  })
  it('recusa a URL de produção POOLED no lugar do dev', () => {
    expect(recusaDoExportador({ prod, dev: { DATABASE_URL: PROD, DIRECT_URL: DEV_DIRETA } })?.titulo).toMatch(/PRODUÇÃO/)
  })
  it('recusa a URL de produção DIRETA no lugar do dev (mesmo compute, host diferente)', () => {
    expect(recusaDoExportador({ prod, dev: { DATABASE_URL: PROD_DIRETA, DIRECT_URL: DEV_DIRETA } })?.titulo).toMatch(/PRODUÇÃO/)
  })
  it('recusa a URL de produção em MAIÚSCULAS no lugar do dev', () => {
    expect(recusaDoExportador({ prod, dev: { DATABASE_URL: PROD.toUpperCase().replace('POSTGRESQL', 'postgresql'), DIRECT_URL: DEV_DIRETA } })?.titulo).toMatch(/PRODUÇÃO/)
  })
  it('recusa quando a referência da produção (.env) não existe — fail-closed, não fail-open', () => {
    expect(recusaDoExportador({ prod: null, dev: { DATABASE_URL: DEV, DIRECT_URL: DEV_DIRETA } })?.titulo).toMatch(/\.env/)
  })
  it('recusa quando o .env existe mas não tem URL parseável', () => {
    expect(recusaDoExportador({ prod: { DATABASE_URL: 'nada' }, dev: { DATABASE_URL: DEV, DIRECT_URL: DEV_DIRETA } })?.titulo).toMatch(/parseável/)
  })
  it('recusa quando o .env.development.local não existe ou está sem as duas URLs', () => {
    expect(recusaDoExportador({ prod, dev: null })?.titulo).toMatch(/development/)
    expect(recusaDoExportador({ prod, dev: { DATABASE_URL: DEV } })?.titulo).toMatch(/DIRECT_URL/)
  })
})

describe('lerEnv', () => {
  it('lê KEY=valor com aspas opcionais e ignora comentários; null para arquivo inexistente', () => {
    expect(lerEnv('# c\nDATABASE_URL="x"\nDIRECT_URL=y\n')).toEqual({ DATABASE_URL: 'x', DIRECT_URL: 'y' })
    expect(lerEnv(null)).toBeNull()
  })
})
