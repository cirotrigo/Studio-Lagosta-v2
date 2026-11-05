/**
 * Canvas 1.0 (05/11/2026): o medidor do servidor cria o canvas direto. Sem o alias de `sans-serif` para a Montserrat,
 * família não registrada cai numa fonte sem glifos e mede caixas: no CI (Linux) "Texto headline" passou de 880 px a 80%
 * do corpo, conforme a ordem dos testes no processo. As duas fábricas garantem as fontes padrão antes de medir.
 */
import { describe, expect, it, vi } from 'vitest'

const garantir = vi.hoisted(() => vi.fn())
vi.mock('@/lib/canvas-renderer', () => ({ garantirFontesPadrao: garantir }))

import { createServerTextBoxMeasurer, createServerTextMeasurer } from '@/lib/creatives/server-text-measurer'

describe('medidor do servidor · fontes padrão', () => {
  it('createServerTextMeasurer e createServerTextBoxMeasurer chamam garantirFontesPadrao', async () => {
    await createServerTextMeasurer()
    expect(garantir).toHaveBeenCalledTimes(1)
    await createServerTextBoxMeasurer()
    expect(garantir).toHaveBeenCalledTimes(2)
  })
})
