/**
 * B1d — checkpoint g (Codex, rodada 6): com `_slots`/`_papeis`, a copy registrada da arte é a VISUAL das camadas
 * (chave `name ?? id`). Texto visível numa camada cuja chave começa com `_` cairia onde os leitores descartam — nas DUAS
 * vias da arte rápida (criação e ajuste), inclusive com pedido só de imagem.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))

import { camadasDeTextoComChaveReservada } from '../arte-rapida'

describe('camadasDeTextoComChaveReservada', () => {
  it('texto/rich-text VISÍVEL com name (ou id, sem name) começado por "_"', () => {
    expect(
      camadasDeTextoComChaveReservada([
        { id: 'a', name: '_titulo', type: 'text', visible: true },
        { id: '_b', type: 'rich-text' },
        { id: 'c', name: '_oculta', type: 'text', visible: false },
        { id: 'd', name: '_foto', type: 'image' },
        { id: 'e', name: 'Título', type: 'text' },
      ]),
    ).toEqual(['a', '_b'])
  })
})

describe('as duas vias usam a guarda com o contrato semântico', () => {
  const fonte = readFileSync(join(process.cwd(), 'src/lib/creatives/arte-rapida.ts'), 'utf8')
  it('criação (valoresDaArte) e ajuste (ajustarArte)', () => {
    const ini = fonte.indexOf('export async function ajustarArte')
    expect(ini).toBeGreaterThan(-1)
    expect(fonte.slice(0, ini)).toMatch(/camadasDeTextoComChaveReservada\(camadas\)/)
    expect(fonte.slice(ini)).toMatch(/temContratoSemantico\(slotValues\)[\s\S]{0,200}camadasDeTextoComChaveReservada\(sourceLayers\)/)
  })
})
