/**
 * O botão de duplicar (17/08/2026): mesmo briefing, referência nova.
 *
 * O fieldValues abaixo é o shape real gravado pelo arte-ia — o das cinco peças
 * do O Quintal está no histórico desta mesma data.
 */
import { describe, expect, it } from 'vitest'

import { duplicarParaBancada } from '../duplicar-para-bancada'

const FIELD_VALUES = {
  source: 'arte-ia',
  track: 'arte',
  formato: 'story',
  pedido: 'Funcionamento e endereço',
  instrucaoImagem: null,
  slotValues: {
    bloco1: 'Domingou no quintal',
    bloco2: 'Hoje das 11h às 17h',
    bloco3: 'Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES',
    bloco4: 'Chega mais',
  },
  referencias: [
    { role: 'subject', label: 'Funcionamento e endereço', driveFileId: '1Pe6Tjv' },
    {
      role: 'style',
      url: 'https://blob/ref-sabadouu.jpg',
      label: 'arte de referência',
      generationId: 'cmsx9bdxe0003sw4nfglo636b',
    },
  ],
}

describe('duplicarParaBancada', () => {
  it('carrega copy (na ordem dos blocos), pedido, formato e a foto', () => {
    const item = duplicarParaBancada(FIELD_VALUES)!

    expect(item.copy).toEqual([
      'Domingou no quintal',
      'Hoje das 11h às 17h',
      'Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES',
      'Chega mais',
    ])
    expect(item.pedido).toBe('Funcionamento e endereço')
    expect(item.formato).toBe('story')
    expect(item.trilha).toBe('arte')
    expect(item.referencias).toEqual([
      {
        papel: 'subject',
        driveFileId: '1Pe6Tjv',
        url: undefined,
        label: 'Funcionamento e endereço',
        thumbUrl: '/api/drive/thumbnail/1Pe6Tjv?size=400',
      },
    ])
  })

  it('🔴 deixa a referência de ESTILO para trás — duplicar existe para escolhê-la de novo', () => {
    const item = duplicarParaBancada(FIELD_VALUES)!
    expect(item.referencias.some((r) => (r as { papel: string }).papel === 'style')).toBe(false)
    // O "Gerar de novo" (refazer), um botão ao lado, é quem repete tudo igual.
  })

  it('ordena os blocos pelo sufixo numérico, não pela ordem do JSON', () => {
    const item = duplicarParaBancada({
      ...FIELD_VALUES,
      // bloco10 depois do bloco2 — ordenação alfabética o poria antes.
      slotValues: { bloco10: 'décimo', bloco2: 'segundo', bloco1: 'primeiro' },
    })!
    expect(item.copy).toEqual(['primeiro', 'segundo', 'décimo'])
  })

  it('recusa o que não tem briefing: template, upload, melhoria', () => {
    expect(duplicarParaBancada({ ...FIELD_VALUES, source: 'ai_improvement' })).toBeNull()
    expect(duplicarParaBancada({ source: 'konva_editor' })).toBeNull()
    expect(duplicarParaBancada(null)).toBeNull()
    expect(duplicarParaBancada(undefined)).toBeNull()
  })

  it('recusa arte sem NENHUMA foto — card vazio é pior que não abrir', () => {
    expect(duplicarParaBancada({ ...FIELD_VALUES, referencias: [] })).toBeNull()
    expect(
      duplicarParaBancada({
        ...FIELD_VALUES,
        referencias: [{ role: 'style', url: 'https://blob/x.jpg', generationId: 'g1' }],
      }),
    ).toBeNull()
  })

  it('âncoras viajam junto; trilha imagem também duplica', () => {
    const item = duplicarParaBancada({
      ...FIELD_VALUES,
      track: 'imagem',
      slotValues: undefined,
      referencias: [
        { role: 'subject', driveFileId: 'f1' },
        { role: 'anchor-ambient', driveFileId: 'f2', label: 'salão' },
      ],
    })!
    expect(item.trilha).toBe('imagem')
    expect(item.copy).toEqual([])
    expect(item.referencias.map((r) => r.papel)).toEqual(['subject', 'anchor-ambient'])
  })
})
