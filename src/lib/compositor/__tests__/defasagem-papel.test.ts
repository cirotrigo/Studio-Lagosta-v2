import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { copyDosPapeisComDestaque, papelDaCamada } from '../defasagem'

const texto = (parcial: Partial<Layer>): Layer =>
  ({ type: 'text', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 100, height: 40 }, ...parcial }) as Layer

describe('papel de uma camada de texto', () => {
  it('lê o papel do compositor, o id ou o nome — cada um sozinho', () => {
    expect(papelDaCamada(texto({ id: 'x', name: 'y', metadata: { compositor: { papel: 'cta' } } }))).toBe('cta')
    expect(papelDaCamada(texto({ id: 'headline', name: 'Título' }))).toBe('headline')
    // Página feita à mão: o id é próprio e o papel está só no nome
    expect(papelDaCamada(texto({ id: 'dia-no-quintal-headline', name: 'headline' }))).toBe('headline')
    expect(papelDaCamada(texto({ id: 'qualquer', name: 'Texto 1' }))).toBeNull()
  })

  it('junta de cima para baixo os textos do mesmo papel', () => {
    const copy = copyDosPapeisComDestaque([
      texto({ id: 'servico-2', content: 'Rua Aleixo Netto, 1158', position: { x: 0, y: 1700 }, metadata: { compositor: { papel: 'servico' } } }),
      texto({ id: 'servico', content: 'das 11h às 00h', position: { x: 0, y: 1650 }, metadata: { compositor: { papel: 'servico' } } }),
      texto({ id: 'pagina-headline', name: 'headline', content: 'Sábado no', position: { x: 0, y: 200 } }),
    ])
    expect(copy).toEqual({ servico: 'das 11h às 00h\nRua Aleixo Netto, 1158', headline: 'Sábado no' })
  })
})
