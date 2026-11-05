import { describe, expect, it } from 'vitest'
import { deveIrParaAssinatura } from '../acesso-por-assinatura'

describe('deveIrParaAssinatura', () => {
  it('modo interno: convidado sem assinatura entra no Studio', () => {
    expect(deveIrParaAssinatura({ cobrancaLigada: false, assinaturaAtiva: false, pathname: '/studio' })).toBe(false)
  })

  it('cobrança ligada: sem assinatura vai para /subscribe, como antes', () => {
    expect(deveIrParaAssinatura({ cobrancaLigada: true, assinaturaAtiva: false, pathname: '/studio' })).toBe(true)
  })

  it('cobrança ligada: /billing e /subscribe continuam liberados; com assinatura, nada muda', () => {
    expect(deveIrParaAssinatura({ cobrancaLigada: true, assinaturaAtiva: false, pathname: '/billing' })).toBe(false)
    expect(deveIrParaAssinatura({ cobrancaLigada: true, assinaturaAtiva: false, pathname: '/subscribe' })).toBe(false)
    expect(deveIrParaAssinatura({ cobrancaLigada: true, assinaturaAtiva: true, pathname: '/studio' })).toBe(false)
  })
})
