import { describe, expect, it } from 'vitest'
import { avisoDeProporcao } from '../proporcao-da-arte'

describe('avisoDeProporcao', () => {
  it('quieto nas proporções do Instagram', () => {
    expect(avisoDeProporcao(1080, 1920)).toBeNull()
    expect(avisoDeProporcao(1080, 1350)).toBeNull()
    expect(avisoDeProporcao(1080, 1080)).toBeNull()
    expect(avisoDeProporcao(941, 1672)).toBeNull() // 1,777: dentro dos 2%
  })
  it('avisa no 2:3 do ChatGPT', () => {
    expect(avisoDeProporcao(1024, 1536)).toMatch(/1024x1536.*story/)
  })
})
