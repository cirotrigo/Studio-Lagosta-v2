import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeDe, destinoDaProvaDeDev } from '../../../scripts/lib/destino-da-prova'

/**
 * R12-10 (3ª FINAL do Codex sobre 7b7e90e1): a guarda da prova conferia só o `DATABASE_URL`, e as conexões
 * auxiliares do passo 21 usavam o `DIRECT_URL` — HERDADO do `.env` (produção) quando o arquivo de dev não o
 * definia. Nenhuma conexão da prova pode alcançar produção: o `db` (DATABASE_URL) e as auxiliares (DIRECT_URL)
 * saem do arquivo de dev, e as duas têm de ser o MESMO banco de dev.
 */
const PROD_POOLED = 'postgresql://u:p@ep-prod-123-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const PROD_DIRETA = 'postgresql://u:p@ep-prod-123.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const DEV_POOLED = 'postgresql://u:p@ep-dev-456-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const DEV_DIRETA = 'postgresql://u:p@ep-dev-456.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const OUTRO_DEV = 'postgresql://u:p@ep-outro-789.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const DEV_OUTRO_BANCO = 'postgresql://u:p@ep-dev-456.c-2.us-east-1.aws.neon.tech/outro_banco?sslmode=require'

const prod = { DATABASE_URL: PROD_POOLED, DIRECT_URL: PROD_DIRETA, BLOB_READ_WRITE_TOKEN: 'token-do-blob' }
const PRODUCAO = new Set([computeDe(PROD_POOLED), computeDe(PROD_DIRETA)])
/** A recusa é a INSTRUÇÃO (o arquivo de dev não define a direta; rode o setup) — não uma recusa por acaso de outra camada. */
const instrucao = (r: { titulo: string; linhas: string[] }) => /não define DIRECT_URL/.test(r.titulo) && r.linhas.some((l) => l.includes('db:dev:setup'))

describe('destinoDaProvaDeDev — nenhuma conexão da prova de dev alcança produção (R12-10)', () => {
  it('DIRECT_URL de produção EXPLÍCITA no arquivo de dev: recusa', () => {
    const r = destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: PROD_DIRETA }, processo: {} })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.titulo).toMatch(/PRODUÇÃO/)
  })

  it('DIRECT_URL HERDADA: ausente no dev e presente no .env — recusa com a instrução, nunca a de produção', () => {
    const r = destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED }, processo: {} })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(instrucao(r)).toBe(true)
  })

  it('DIRECT_URL HERDADA do ambiente do processo (ausente no dev): recusa', () => {
    const r = destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED }, processo: { DIRECT_URL: PROD_DIRETA } })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(instrucao(r)).toBe(true)
  })

  it('DIRECT_URL AUSENTE no dev e no .env: recusa com a instrução (falha fechada, nada é derivado)', () => {
    const r = destinoDaProvaDeDev({ prod: { DATABASE_URL: PROD_POOLED }, dev: { DATABASE_URL: DEV_POOLED }, processo: {} })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(instrucao(r)).toBe(true)
  })

  it('controle: direta e pooled do MESMO banco de dev — as duas conexões vão para ele, e o ambiente sobrescreve o que o processo herdou', () => {
    const r = destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: DEV_DIRETA }, processo: { DATABASE_URL: PROD_POOLED, DIRECT_URL: PROD_DIRETA } })
    expect(r.ok).toBe(true)
    if (r.ok !== true) return
    expect(r.destino).toMatchObject({ compute: 'ep-dev-456', databaseUrl: DEV_POOLED, directUrl: DEV_DIRETA })
    expect(r.destino.ambiente.DATABASE_URL).toBe(DEV_POOLED)
    expect(r.destino.ambiente.DIRECT_URL).toBe(DEV_DIRETA)
    // As outras chaves do .env continuam vindo (o Blob da prova é o de produção, declarado).
    expect(r.destino.ambiente.BLOB_READ_WRITE_TOKEN).toBe('token-do-blob')
  })

  it('DIRECT_URL de OUTRO compute de dev: recusa (não é o mesmo banco do db)', () => {
    expect(destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: OUTRO_DEV }, processo: {} }).ok).toBe(false)
  })

  it('mesmo compute, OUTRO nome de banco: recusa (PR13-16 — a trava é por banco)', () => {
    expect(destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: DEV_OUTRO_BANCO }, processo: {} }).ok).toBe(false)
  })

  it('DATABASE_URL de produção no dev: recusa; .env sem URL de banco reconhecível: recusa', () => {
    expect(destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: PROD_POOLED, DIRECT_URL: DEV_DIRETA }, processo: {} }).ok).toBe(false)
    expect(destinoDaProvaDeDev({ prod: { BLOB_READ_WRITE_TOKEN: 'x' }, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: DEV_DIRETA }, processo: {} }).ok).toBe(false)
  })

  it('matriz: em toda combinação aceita, nenhuma URL de conexão — nem a do ambiente aplicado — é de produção, e as duas são o mesmo banco de dev', () => {
    const diretasDoDev = [undefined, DEV_DIRETA, PROD_DIRETA, PROD_POOLED, OUTRO_DEV, DEV_OUTRO_BANCO]
    const herdadas = [undefined, PROD_DIRETA]
    let aceitas = 0
    for (const d of diretasDoDev) {
      for (const noProcesso of herdadas) {
        for (const noEnv of herdadas) {
          const r = destinoDaProvaDeDev({
            prod: { DATABASE_URL: PROD_POOLED, ...(noEnv ? { DIRECT_URL: noEnv } : {}) },
            dev: { DATABASE_URL: DEV_POOLED, ...(d ? { DIRECT_URL: d } : {}) },
            processo: noProcesso ? { DIRECT_URL: noProcesso } : {},
          })
          if (r.ok !== true) continue
          aceitas++
          for (const url of [r.destino.databaseUrl, r.destino.directUrl, r.destino.ambiente.DATABASE_URL, r.destino.ambiente.DIRECT_URL]) {
            expect(PRODUCAO.has(computeDe(url))).toBe(false)
            expect(computeDe(url)).toBe('ep-dev-456')
          }
        }
      }
    }
    // Só o arquivo de dev com a direta do mesmo banco é aceito — 4 combinações (herdadas ignoradas).
    expect(aceitas).toBe(4)
  })

  it('host de produção em OUTRA CAIXA é produção: `postgresql:` não normaliza a caixa no new URL, e o DNS não a distingue', () => {
    const PROD_DIRETA_MAIUSCULA = PROD_DIRETA.replace('ep-prod-123', 'EP-PROD-123')
    const PROD_POOLED_MISTA = PROD_POOLED.replace('ep-prod-123-pooler', 'Ep-Prod-123-Pooler')
    expect(destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: PROD_DIRETA_MAIUSCULA }, processo: {} }).ok).toBe(false)
    expect(destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: PROD_POOLED_MISTA, DIRECT_URL: PROD_DIRETA_MAIUSCULA }, processo: {} }).ok).toBe(false)
    // controle: o mesmo dev em outra caixa continua o mesmo banco.
    expect(destinoDaProvaDeDev({ prod, dev: { DATABASE_URL: DEV_POOLED, DIRECT_URL: DEV_DIRETA.replace('ep-dev-456', 'EP-DEV-456') }, processo: {} }).ok).toBe(true)
  })

  it('a prova USA o destino validado: toda conexão que ela abre por conta própria vai para DESTINO.directUrl, nenhuma lê process.env.DIRECT_URL', () => {
    const fonte = readFileSync(resolve(__dirname, '../../../scripts/validar-lote-ate-rascunhos.ts'), 'utf8')
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).toMatch(/destinoDaProvaDeDev\(/)
    expect(codigo).toMatch(/Object\.assign\(process\.env, r\.destino\.ambiente\)/)
    expect(codigo).not.toMatch(/process\.env\.DIRECT_URL/)
    const clientes = codigo.match(/new PrismaClient\([^)]*\)/g) ?? []
    expect(clientes.length).toBeGreaterThan(0)
    for (const c of clientes) expect(c).toMatch(/url: DESTINO\.directUrl \}/)
  })
})
