import { describe, expect, it } from 'vitest'
import { COR_PARECIDA, destaqueDoPapel, distanciaDeCor } from '../destaques'

const fontesReal = ['Branley GC', 'StageGrotesk Thin', 'StageGrotesk Medium', 'StageGrotesk Bold']

describe('o destaque de um papel', () => {
  it('a página de assinatura manda', () => {
    expect(
      destaqueDoPapel({ daPagina: { fill: '#111111' }, padrao: { fill: '#EA5328', pesado: true }, corDoPapel: '#FFFFFF', familiaDoPapel: 'StageGrotesk Thin', familias: fontesReal }),
    ).toEqual({ fill: '#111111' })
  })

  it('o padrão da marca é a cor da paleta e a família mais pesada DO papel', () => {
    expect(
      destaqueDoPapel({ padrao: { fill: '#EA5328', pesado: true }, corDoPapel: '#F6F0E4', familiaDoPapel: 'StageGrotesk Thin', familias: fontesReal }),
    ).toEqual({ fill: '#EA5328', fontFamily: 'StageGrotesk Medium' })
    // A manchete em Branley GC não tem versão pesada: fica só a cor
    expect(
      destaqueDoPapel({ padrao: { fill: '#EA5328', pesado: true }, corDoPapel: '#F6F0E4', familiaDoPapel: 'Branley GC', familias: fontesReal }),
    ).toEqual({ fill: '#EA5328' })
  })

  it('papel que já é da cor de destaque usa a alternativa (o CTA vermelho do Espeto)', () => {
    expect(
      destaqueDoPapel({ padrao: { fill: '#F4301A', pesado: true, alternativa: '#FDC700' }, corDoPapel: '#F4301A', familiaDoPapel: 'Caveat SemiBold', familias: [] }),
    ).toEqual({ fill: '#FDC700' })
  })

  it('sem alternativa fica só o peso; sem peso, nada', () => {
    const emporio = ['TrajanPro Bold', 'TrajanPro Regular']
    expect(
      destaqueDoPapel({ padrao: { fill: '#CAB371', pesado: true }, corDoPapel: '#C9B270', familiaDoPapel: 'TrajanPro Regular', familias: emporio }),
    ).toEqual({ fontFamily: 'TrajanPro Bold' })
    expect(
      destaqueDoPapel({ padrao: { fill: '#CAB371', pesado: true }, corDoPapel: '#C9B270', familiaDoPapel: 'TrajanPro Bold', familias: emporio }),
    ).toBeNull()
  })

  it('alternativa que também colide com o papel não serve', () => {
    expect(
      destaqueDoPapel({ padrao: { fill: '#FFFFFF', alternativa: '#FAFAFA' }, corDoPapel: '#FFFFFF', familiaDoPapel: 'X', familias: [] }),
    ).toBeNull()
  })

  it('mede a distância entre cores hex', () => {
    expect(distanciaDeCor('#000', '#000000')).toBe(0)
    expect(distanciaDeCor('#F4301A', '#FDC700')).toBeGreaterThan(COR_PARECIDA)
    expect(distanciaDeCor('rgba(0,0,0,1)', '#000000')).toBeNull()
  })
})
