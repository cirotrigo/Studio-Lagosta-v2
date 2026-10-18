/**
 * PR #238, revisão do Codex (18/10/2026): o `setAlias('Montserrat', 'sans-serif')` resolvia o tofu mas NÃO preservava
 * a face nem as métricas do peso registrado (`700 sans-serif` saía mais espesso que o 400, mas diferente da
 * Montserrat 700). O registro padrão agora põe cada arquivo da Montserrat também sob a família genérica.
 *
 * O oráculo é a Montserrat EXPLÍCITA medida no MESMO processo e ambiente — nenhum número fixo: `sans-serif`, `serif`
 * e família inexistente têm de sair pixel a pixel iguais a `Montserrat` no mesmo peso, 400 ≠ 700, e sem tofu. E a
 * miniatura de um processo frio tem de ser igual à de um processo que já renderizou (antes dependia do estado).
 *
 * Cada medida roda num processo-filho NOVO (`fontes-padrao-filho.ts`, via tsx): o registro de fontes é global.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FILHO = join(__dirname, 'fontes-padrao-filho.ts')
function filho(modo: string) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', FILHO, modo], { encoding: 'utf8', timeout: 90_000, cwd: join(__dirname, '../../..') })
  expect({ modo, status: r.status, signal: r.signal, stderr: r.status === 0 ? '' : r.stderr.slice(0, 800) }).toEqual({ modo, status: 0, signal: null, stderr: '' })
  return JSON.parse(r.stdout.trim().split('\n').pop() as string)
}

describe('fallback das famílias genéricas preserva o peso e o acento (processo isolado)', () => {
  it('sans-serif, serif e família inexistente = Montserrat explícita no mesmo peso, 400 ≠ 700, sem tofu', () => {
    const { estado, casos, tofu } = filho('fontes')
    for (const peso of ['400', '700']) {
      for (const familia of ['sans-serif', 'serif', 'FamiliaQueNaoExiste']) {
        expect({ familia, peso, ...casos[`${familia} ${peso}`] }).toEqual({ familia, peso, ...casos[`Montserrat ${peso}`] })
      }
    }
    expect(casos['sans-serif 700'].hash).not.toBe(casos['sans-serif 400'].hash)
    expect(casos['sans-serif 700'].largura).toBeGreaterThan(casos['sans-serif 400'].largura)
    expect(tofu).toEqual({
      'sans-serif 400': false, 'sans-serif 700': false, 'serif 400': false, 'serif 700': false,
      'FamiliaQueNaoExiste 400': false, 'FamiliaQueNaoExiste 700': false,
    })
    expect(estado?.completo).toBe(true)
  }, 120_000)

  it('a miniatura de um processo frio é igual, pixel a pixel, à de um processo que já renderizou', () => {
    expect(filho('miniatura-fria').hash).toBe(filho('miniatura-quente').hash)
  }, 180_000)
})
