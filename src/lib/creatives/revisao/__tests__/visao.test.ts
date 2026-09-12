import { describe, expect, it } from 'vitest'
import { insumosDaVisao, reconciliarVisao, TETO_DE_ACHADOS_VISTOS, type MarcaDaPeca } from '../visao'

const marcas: MarcaDaPeca[] = [
  { marca: 'T1', tipo: 'texto', camadas: ['headline'], rect: { x: 0, y: 0, width: 10, height: 10 }, descricao: 'Almoço' },
  { marca: 'L1', tipo: 'logo', camadas: ['logo'], rect: { x: 0, y: 0, width: 10, height: 10 }, descricao: 'a logo' },
]

const bom = { marca: 'T1', problema: 'entrelinha-grande', evidencia: 'as duas linhas do título estão muito afastadas', confianca: 'alta', correcao: 'reduzir-entrelinha', intensidade: 'medio' }

describe('a reconciliação do que a visão devolveu', () => {
  it('aceita o achado completo e amarra pela marca', () => {
    const { vistos, descartados } = reconciliarVisao({ achados: [bom] }, marcas)
    expect(descartados).toBe(0)
    expect(vistos).toHaveLength(1)
    expect(vistos[0].marca?.camadas).toEqual(['headline'])
    expect(vistos[0].correcao).toBe('reduzir-entrelinha')
  })

  it('descarta marca desconhecida, confiança baixa, evidência vazia e problema fora do vocabulário', () => {
    const { vistos, descartados } = reconciliarVisao(
      {
        achados: [
          { ...bom, marca: 'T9' },
          { ...bom, confianca: 'baixa' },
          { ...bom, evidencia: 'ruim' },
          { ...bom, problema: 'cor-feia' },
        ],
      },
      marcas,
    )
    expect(vistos).toHaveLength(0)
    expect(descartados).toBe(4)
  })

  it('normaliza acento, caixa e espaço em problema, confiança, correção e intensidade', () => {
    const { vistos } = reconciliarVisao(
      { achados: [{ marca: ' t1 ', problema: 'Posição Estranha', evidencia: 'o bloco solto no meio da foto', confianca: 'Média', correcao: 'Descer', intensidade: 'Médio' }] },
      marcas,
    )
    expect(vistos[0]).toMatchObject({ problema: 'posicao-estranha', confianca: 'media', correcao: 'descer', intensidade: 'medio' })
  })

  it('problema da peça inteira aceita PECA; problema de bloco sem marca não', () => {
    const { vistos, descartados } = reconciliarVisao(
      {
        achados: [
          { ...bom, marca: 'PECA', problema: 'gradiente-escuro-demais', correcao: 'menos-gradiente' },
          { ...bom, marca: 'PECA', problema: 'colisao' },
        ],
      },
      marcas,
    )
    expect(vistos.map((v) => v.problema)).toEqual(['gradiente-escuro-demais'])
    expect(vistos[0].marca).toBeNull()
    expect(descartados).toBe(1)
  })

  it('correção fora da lista vira nenhuma; intensidade desconhecida vira pouco', () => {
    const { vistos } = reconciliarVisao({ achados: [{ ...bom, correcao: 'trocar a foto', intensidade: 'bastante' }] }, marcas)
    expect(vistos[0].correcao).toBeNull()
    expect(vistos[0].intensidade).toBe('pouco')
  })

  it('resposta SEM a lista é incompleta (descartados 1); `achados: []` é conclusão válida (REV-02)', () => {
    expect(reconciliarVisao({}, marcas)).toEqual({ vistos: [], descartados: 1, truncados: 0 })
    expect(reconciliarVisao({ achados: [] }, marcas)).toEqual({ vistos: [], descartados: 0, truncados: 0 })
  })

  it('repetição do mesmo problema na mesma marca conta uma vez; resposta fora do schema vira zero achados', () => {
    expect(reconciliarVisao({ achados: [bom, bom] }, marcas).vistos).toHaveLength(1)
    expect(reconciliarVisao('lixo', marcas)).toEqual({ vistos: [], descartados: 1, truncados: 0 })
  })

  it('achado válido e distinto além do teto é DECLARADO em `truncados`, nunca some calado (REV-127-INTEGRAL-02)', () => {
    const problemas = ['entrelinha-grande', 'titulo-grande', 'texto-pequeno', 'palavra-orfa', 'colisao', 'texto-cortado', 'texto-sem-leitura']
    const sete = problemas.map((problema) => ({ ...bom, problema }))
    expect(sete).toHaveLength(TETO_DE_ACHADOS_VISTOS + 1)
    const r = reconciliarVisao({ achados: sete }, marcas)
    expect(r.vistos.map((v) => v.problema)).toEqual(problemas.slice(0, TETO_DE_ACHADOS_VISTOS))
    expect(r.truncados).toBe(1)
    expect(r.descartados).toBe(0)
    // repetição de um que já entrou não é corte; item inválido além do teto segue sendo descarte
    const comRepeticao = reconciliarVisao({ achados: [...sete.slice(0, 6), sete[0], { ...bom, marca: 'T9', problema: 'colisao' }] }, marcas)
    expect(comRepeticao).toMatchObject({ truncados: 0, descartados: 1 })
    // exatamente no teto: nada cortado
    expect(reconciliarVisao({ achados: sete.slice(0, 6) }, marcas)).toMatchObject({ truncados: 0, descartados: 0 })
  })

  it('insumosDaVisao: corte e descarte chegam separados à revisão; visão que não rodou não carrega nenhum dos dois (REV-127-INTEGRAL-02)', () => {
    expect(insumosDaVisao({ estado: 'feita', descartados: 0, truncados: 1 })).toEqual({ visaoConclusiva: true, visaoTruncados: 1, motivoSemVisao: undefined })
    expect(insumosDaVisao({ estado: 'feita', descartados: 2, truncados: 0 })).toEqual({ visaoConclusiva: false, visaoTruncados: 0, motivoSemVisao: undefined })
    expect(insumosDaVisao({ estado: 'falhou', truncados: 3, motivo: 'timeout' })).toEqual({ visaoConclusiva: false, visaoTruncados: 0, motivoSemVisao: 'timeout' })
  })
})
