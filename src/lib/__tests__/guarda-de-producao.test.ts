import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bancoDaLeitura } from '../../../scripts/lib/guarda-de-producao'

/**
 * PR 15 (restack sobre a main 0df88981, 21/09/2026): o guard de `scripts/medir-qualidade-da-copy.ts` comparava o
 * compute do Neon diferenciando caixa. `postgresql:` é esquema NÃO especial, o `new URL` preserva a caixa do host,
 * e o DNS não a distingue: um `DATABASE_URL` com `EP-PROD-…` (ou `…-POOLER`) conectava na PRODUÇÃO e passava por
 * "não-produção", sem a flag `--producao-somente-leitura`. A lição da revisão do PR 12 (R12-10).
 */
const PROD_POOLED = 'postgresql://u:p@ep-prod-123-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const PROD_DIRETA = 'postgresql://u:p@ep-prod-123.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const DEV_POOLED = 'postgresql://u:p@ep-dev-456-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const env = { DATABASE_URL: PROD_POOLED, DIRECT_URL: PROD_DIRETA }
const PRODUCAO = { ok: true, compute: 'ep-prod-123', ehProducao: true }

describe('bancoDaLeitura — o guard de produção da medida da copy', () => {
  it('a produção em OUTRA CAIXA continua sendo a produção (o host e o sufixo -pooler)', () => {
    for (const url of [
      PROD_POOLED.replace('ep-prod-123', 'EP-PROD-123'),
      PROD_POOLED.replace('-pooler', '-POOLER'),
      PROD_POOLED.replace('ep-prod-123-pooler', 'EP-PROD-123-POOLER'),
      PROD_DIRETA.replace('ep-prod-123', 'Ep-Prod-123'),
    ]) {
      expect(bancoDaLeitura(env, url)).toEqual(PRODUCAO)
    }
  })

  it('o .env em outra caixa também reconhece a produção: os dois lados são normalizados', () => {
    const envMaiusculo = { DATABASE_URL: PROD_POOLED.replace('ep-prod-123', 'EP-PROD-123') }
    expect(bancoDaLeitura(envMaiusculo, PROD_DIRETA)).toEqual(PRODUCAO)
  })

  it('controle: a produção na caixa do .env é produção; o dev, em qualquer caixa, não é', () => {
    expect(bancoDaLeitura(env, PROD_POOLED)).toEqual(PRODUCAO)
    expect(bancoDaLeitura(env, DEV_POOLED)).toEqual({ ok: true, compute: 'ep-dev-456', ehProducao: false })
    expect(bancoDaLeitura(env, DEV_POOLED.replace('ep-dev-456', 'EP-DEV-456'))).toEqual({ ok: true, compute: 'ep-dev-456', ehProducao: false })
  })

  it('falha FECHADO sem .env legível ou sem URL de banco reconhecível nele', () => {
    expect(bancoDaLeitura(null, PROD_POOLED)).toEqual({ ok: false, motivo: 'sem-env' })
    expect(bancoDaLeitura({}, PROD_POOLED)).toEqual({ ok: false, motivo: 'sem-env' })
    expect(bancoDaLeitura({ DATABASE_URL: 'não é url' }, PROD_POOLED)).toEqual({ ok: false, motivo: 'sem-env' })
  })

  it('DATABASE_URL ausente ou ilegível não roda', () => {
    expect(bancoDaLeitura(env, undefined)).toEqual({ ok: false, motivo: 'sem-url' })
    expect(bancoDaLeitura(env, 'não é url')).toEqual({ ok: false, motivo: 'sem-url' })
  })

  it('o script USA este guard: nenhuma leitura de host por conta própria', () => {
    const fonte = readFileSync(resolve(__dirname, '../../../scripts/medir-qualidade-da-copy.ts'), 'utf8')
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).toMatch(/from '\.\/lib\/guarda-de-producao'/)
    expect(codigo).toMatch(/bancoDaLeitura\(doEnv, process\.env\.DATABASE_URL\)/)
    expect(codigo).not.toMatch(/new URL\(|hostname/)
  })
})
