/**
 * PR3-R8-03 (revisão FINAL do Codex sobre cc14f30a, 18/09/2026): os blocos que
 * `validarSpec` DERIVA do contrato passam pelo MESMO schema dos blocos
 * explícitos. Antes, `["A", "", "B"]` ou sete linhas passavam na porta
 * (`enfileirarPeca` gravava o job) e o worker recusava com SPEC_INVALIDA ao
 * revalidar a spec já expandida — o mesmo conteúdo com dois destinos.
 *
 * Invariante: toda spec aceita continua aceita na revalidação (JSON ida e
 * volta, que é o que o payload da fila faz); a incompatibilidade é recusada
 * NA PORTA, sem cortar texto.
 */
import { describe, expect, it, vi } from 'vitest'

const tocouNoBanco = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/db', () => {
  const nao = () => {
    tocouNoBanco.n++
    throw new Error('a porta não pode chegar ao banco com spec inválida')
  }
  return { db: new Proxy({}, { get: () => new Proxy({}, { get: () => nao }) }) }
})

import { VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'
import { validarSpec } from '../spec'
import { enfileirarPeca } from '../fila'

const contrato = (linhas: string[]): CopyAutoral => ({
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: [] },
  ],
  revisoes: [],
})
const spec = (linhas: string[]) => ({ projectId: 8, formato: 'story', copyAutoral: contrato(linhas) })

describe('os blocos derivados do contrato valem o mesmo que os explícitos (PR3-R8-03)', () => {
  for (const [caso, linhas] of [
    ['linha vazia no meio', ['A', '', 'B']],
    ['sete linhas', ['1', '2', '3', '4', '5', '6', '7']],
  ] as const) {
    it(`${caso}: recusada na porta, com o contrato intacto (nada cortado)`, async () => {
      const entrada = spec([...linhas])
      const r = validarSpec(entrada)
      expect(r.spec).toBeNull()
      expect(r.problemas.join(' ')).toMatch(/copyAutoral/)
      expect(entrada.copyAutoral.blocos[0].linhas).toEqual(linhas)

      tocouNoBanco.n = 0
      await expect(enfileirarPeca(entrada)).rejects.toMatchObject({ code: 'SPEC_INVALIDA' })
      expect(tocouNoBanco.n).toBe(0)
    })
  }

  it('controle: spec aceita revalida igual depois da ida e volta do payload (o que o worker faz)', () => {
    const aceita = validarSpec(spec(['Sexta é dia', 'de happy hour']))
    expect(aceita.spec).not.toBeNull()
    const doWorker = validarSpec(JSON.parse(JSON.stringify(aceita.spec)))
    expect(doWorker.spec).toEqual(aceita.spec)
  })
})
