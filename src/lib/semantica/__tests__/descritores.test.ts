import { describe, expect, it } from 'vitest'
import { descreverAlvos } from '../descritores'
import { doisLogos, fotoELogo, legadoPorNome, papelInvalidoComIdDePapel, servicosComSlot, slotMalformado } from './fixtures'

describe('descreverAlvos', () => {
  it('um descriptor por camada, com identidade, papel, slot e expectativa', () => {
    expect(descreverAlvos(servicosComSlot)).toEqual([
      {
        layerId: 'text-8f931',
        indice: 0,
        type: 'text',
        name: 'Endereço',
        visible: true,
        papel: { status: 'valido', papel: 'servico', origem: 'metadata' },
        slot: { status: 'valido', slotId: 'servico-endereco' },
        cardinalidadeEsperada: 'MANY',
        ocorrenciasDoPapel: 2,
        ambiguous: true,
      },
      {
        layerId: 'text-17ca2',
        indice: 1,
        type: 'text',
        name: 'Horário',
        visible: true,
        papel: { status: 'valido', papel: 'servico', origem: 'metadata' },
        slot: { status: 'valido', slotId: 'servico-horario' },
        cardinalidadeEsperada: 'MANY',
        ocorrenciasDoPapel: 2,
        ambiguous: true,
      },
    ])
  })

  it('dois logos: expectativa ONE, observado 2 — informação, não erro', () => {
    const d = descreverAlvos(doisLogos)
    expect(d.map((x) => [x.cardinalidadeEsperada, x.ocorrenciasDoPapel, x.ambiguous])).toEqual([
      ['ONE', 2, true],
      ['ONE', 2, true],
    ])
  })

  it('o template pode sobrescrever a expectativa', () => {
    expect(descreverAlvos(doisLogos, { cardinalidadeEsperada: { logo: 'MANY' } })[0].cardinalidadeEsperada).toBe('MANY')
  })

  it('papel único não é ambíguo', () => {
    const [foto, logo] = descreverAlvos(fotoELogo)
    expect(foto).toMatchObject({ papel: { status: 'valido', papel: 'foto' }, ocorrenciasDoPapel: 1, ambiguous: false, cardinalidadeEsperada: 'ONE' })
    expect(logo).toMatchObject({ papel: { status: 'valido', papel: 'logo' }, ambiguous: false })
  })

  it('camada legada sem slot e camada sem semântica', () => {
    const [titulo, fundo] = descreverAlvos(legadoPorNome)
    expect(titulo).toMatchObject({ papel: { status: 'valido', origem: 'nome' }, slot: { status: 'ausente' }, ambiguous: false })
    expect(fundo).toMatchObject({ papel: { status: 'ausente' }, cardinalidadeEsperada: null, ocorrenciasDoPapel: 0, ambiguous: false })
  })

  it('semântica inválida aparece no descriptor, sem virar papel', () => {
    expect(descreverAlvos(papelInvalidoComIdDePapel)[0]).toMatchObject({ papel: { status: 'invalido', valor: 'servicoo' }, cardinalidadeEsperada: null })
    expect(descreverAlvos(slotMalformado)[0].slot.status).toBe('invalido')
  })

  it('não expõe conteúdo da página (texto nem URL)', () => {
    const texto = JSON.stringify(descreverAlvos([...fotoELogo, ...servicosComSlot]))
    expect(texto).not.toContain('content')
    expect(texto).not.toContain('https://')
  })
})
