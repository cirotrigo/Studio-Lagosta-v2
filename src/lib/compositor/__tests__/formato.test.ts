/**
 * CP5b — H3a: `formatoDaPaginaGravada` (`compositor/formato.ts`, puro) é a função que morava em `pastas.ts`, com a
 * mesma tabela de resultados; `pastas.ts` reexporta a MESMA referência com o nome antigo (`@/lib/db` mockado antes
 * do import, porque `pastas.ts` o carrega).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { formatoDaPaginaGravada } from '../formato'
import * as pastas from '../pastas'

describe('H3a — formatoDaPaginaGravada', () => {
  it('a tabela da função antiga: tag primeiro, depois o tamanho', () => {
    const casos: Array<[Parameters<typeof formatoDaPaginaGravada>[0], string]> = [
      [{ tags: ['story'], width: 1080, height: 1350 }, 'story'],
      [{ tags: ['feed'], width: 1080, height: 1920 }, 'feed'],
      [{ tags: ['quadrado'], width: 1080, height: 1920 }, 'quadrado'],
      [{ tags: [], width: 500, height: 500 }, 'quadrado'],
      [{ tags: [], width: 1080, height: 1920 }, 'story'],
      [{ tags: [], width: 1080, height: 1350 }, 'feed'],
      [{ tags: null, width: 400, height: 300 }, 'feed'],
      [{ width: 1080, height: 1729 }, 'story'],
      [{ width: 1080, height: 1728 }, 'feed'],
    ]
    for (const [p, esperado] of casos) expect(formatoDaPaginaGravada(p), JSON.stringify(p)).toBe(esperado)
  })

  it('pastas.ts reexporta a mesma referência com o nome de sempre', () => {
    expect(pastas.formatoDaPagina).toBe(formatoDaPaginaGravada)
    expect(pastas.formatoDaPagina({ tags: ['story'], width: 1080, height: 1350 })).toBe('story')
  })
})
