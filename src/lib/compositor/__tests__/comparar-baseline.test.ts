import { describe, expect, it } from 'vitest'
import { compararComBaseline, compararTons, type LeituraComparavel } from '../comparar-baseline'
import { validarSpec } from '../spec'
const base: LeituraComparavel = { tom: { alteracaoMedia: 0.1, escurecimentoMedio: 0.1 }, fontes360: { headline: 20, servico: 9 }, cores: { headline: '#ffffff', servico: '#ffffff' }, faixas: { headline: 'topo', servico: 'rodape' }, contraste: { headline: 10, servico: 20 }, crop: 'center-middle', logo: 'inferior-direito' }
const comparar = (mudancas: Partial<LeituraComparavel>, mesmaFoto = true) => compararComBaseline(base, { ...base, ...mudancas }, mesmaFoto)
describe('dominância conservadora, independente de marca ou score', () => {
  it('mede escurecimento separado do clareamento sem cancelamento', () => {
    expect(compararTons(Uint8Array.from([255, 0]), Uint8Array.from([0, 255]))).toEqual({ alteracaoMedia: 1, escurecimentoMedio: 0.5 })
    expect(() => compararTons(new Uint8Array(), new Uint8Array())).toThrow()
  })
  it('empate e ruído de uma unidade de cinza conservam baseline', () => {
    expect(comparar({}).domina).toBe(false)
    expect(comparar({ tom: { alteracaoMedia: 0.1 - 0.5 / 255, escurecimentoMedio: 0.1 } }).domina).toBe(false)
  })
  it('menor intervenção sem outras regressões é evidência relativa', () => {
    expect(comparar({ tom: { alteracaoMedia: 0.08, escurecimentoMedio: 0.08 } }).domina).toBe(true)
  })
  it('ganho de contraste não compensa maior escurecimento', () => {
    expect(comparar({ contraste: { headline: 30, servico: 20 }, tom: { alteracaoMedia: 0.2, escurecimentoMedio: 0.2 } }).domina).toBe(false)
  })
  it.each([
    { fontes360: { headline: 30, servico: 8 } },
    { fontes360: { headline: 30, servico: 9 }, contraste: { headline: 9, servico: 10 } },
    { fontes360: { headline: 30, servico: 9 }, faixas: { headline: 'rodape', servico: 'rodape' } },
    { fontes360: { headline: 30, servico: 9 }, crop: 'right-middle' },
    { fontes360: { headline: 30, servico: 9 }, logo: 'superior-direito' },
    { fontes360: { headline: 30 } },
    { fontes360: { headline: 30, servico: NaN } },
    { fontes360: { headline: 30, servico: 9 }, tom: { alteracaoMedia: NaN, escurecimentoMedio: 0.1 } },
    { fontes360: { headline: 30, servico: 9 }, cores: { headline: '#003300', servico: '#003300' } },
    { fontes360: { headline: 30, servico: 9 }, tom: undefined },
  ])('não troca baseline com regressão, mudança estrutural ou dados ausentes: %j', (mudancas) => {
    expect(comparar(mudancas).domina).toBe(false)
  })
  it('outra cena requer revisão mesmo com ganho medido', () => {
    expect(comparar({ fontes360: { headline: 30, servico: 9 } }, false).domina).toBe(false)
  })
  it('false e ausência normalizam igualmente; true permanece explícito', () => {
    const spec = { projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Teste'] }], fotosCandidatas: ['f'] }
    expect(validarSpec({ ...spec, selecaoExperimental: false })).toEqual(validarSpec(spec))
    expect(validarSpec({ ...spec, selecaoExperimental: true }).spec?.selecaoExperimental).toBe(true)
  })
})
