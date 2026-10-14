/**
 * CP2B — o orquestrador puro da busca: a identidade da escolha, a contagem das recusas, o motivo da falta e o motivo
 * de a peça sair da referência.
 */
import { describe, expect, it } from 'vitest'

import type { AvaliacaoDaCombinacao, ComponentesDaPontuacao, EscolhaEspacial } from '../busca-espacial-tipos'
import { contarRecusas, idDaEscolha, motivoContraAReferencia, motivoDaFalta } from '../busca-espacial'

const componentes = (c: Partial<ComponentesDaPontuacao> = {}): ComponentesDaPontuacao => ({ custoDoTratamento: 0, calma: 0.5, contrasteNatural: 1, assunto: 1, referencia: 1, corte: 1, ...c })
const av = (indice: number, extra: Partial<AvaliacaoDaCombinacao> = {}): AvaliacaoDaCombinacao => ({
  crop: 'center-middle',
  combinacao: { indice, escolhas: [{ faixa: 0, rotulo: indice === 0 ? 'referencia' : 'acima', dy: indice === 0 ? 0 : -40 }], deslocamentos: { headline: indice === 0 ? 0 : -40 } },
  eliminada: [],
  componentes: componentes(),
  pontuacao: 0.8,
  tratamento: [],
  ...extra,
})

describe('CP2B · orquestrador', () => {
  it('a mesma escolha tem o mesmo id; o canto da logo não entra na identidade; outro dy muda o id', () => {
    const e: EscolhaEspacial = { modo: 'busca-espacial-v1', foto: 'u', corte: 'center-middle', deslocamentos: { headline: -40, apoio: -40 } }
    expect(idDaEscolha(e)).toMatch(/^be1-[0-9a-f]{12}$/)
    expect(idDaEscolha({ ...e, deslocamentos: { apoio: -40, headline: -40 } })).toBe(idDaEscolha(e))
    expect(idDaEscolha({ ...e, cantoDaLogo: 'inferior-direito' })).toBe(idDaEscolha(e))
    expect(idDaEscolha({ ...e, deslocamentos: { headline: -20, apoio: -20 } })).not.toBe(idDaEscolha(e))
    expect(idDaEscolha({ ...e, foto: 'outra' })).not.toBe(idDaEscolha(e))
  })

  it('cada avaliação conta uma vez por motivo distinto', () => {
    const elim = (m: string[]) => av(1, { eliminada: m.map((motivo) => ({ motivo: motivo as never, detalhe: '' })) })
    expect(contarRecusas([elim(['INVADE_REGIAO_PROTEGIDA', 'INVADE_REGIAO_PROTEGIDA', 'ORDEM_DE_LEITURA']), elim(['INVADE_REGIAO_PROTEGIDA']), av(0)])).toEqual({ INVADE_REGIAO_PROTEGIDA: 2, ORDEM_DE_LEITURA: 1 })
  })

  it('o motivo da falta: o do CP2A quando todas caem nele; senão o mais frequente', () => {
    const doCp2a = (m: string) => av(1, { eliminada: [{ motivo: 'POLARIDADE_INCOMPATIVEL', detalhe: '', motivoDoTratamento: m as never }] })
    expect(motivoDaFalta([doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA'), doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')])).toBe('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')
    const zona = av(2, { eliminada: [{ motivo: 'FORA_DA_ZONA', detalhe: '' }] })
    expect(motivoDaFalta([doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA'), zona, { ...zona }])).toBe('FORA_DA_ZONA')
    expect(motivoDaFalta([])).toBeNull()
  })

  it('por que saiu da referência: eliminada, véu, ou pontuação; nada quando a vencedora É a referência', () => {
    const vencedora = av(1)
    const ref = av(0)
    expect(motivoContraAReferencia([ref, vencedora], ref)).toBeNull()
    expect(motivoContraAReferencia([vencedora, { ...ref, eliminada: [{ motivo: 'INVADE_REGIAO_PROTEGIDA', detalhe: '' }] }], vencedora)).toBe('a referência caía em INVADE_REGIAO_PROTEGIDA')
    expect(motivoContraAReferencia([vencedora, { ...ref, componentes: componentes({ custoDoTratamento: 0.76 }), tratamento: [{ borda: 'rodape', estado: 'tratado', forca: 0.76 }] }], vencedora)).toBe(
      'a referência precisava de véu (rodape 0,76); aqui lê sem tratamento',
    )
    expect(motivoContraAReferencia([vencedora, { ...ref, pontuacao: 0.5 }], vencedora)).toBe('a referência perdia na pontuação (0,50 contra 0,80)')
    expect(motivoContraAReferencia([{ ...vencedora, crop: 'left-middle' }, { ...ref, componentes: componentes({ custoDoTratamento: 0.5 }), tratamento: [{ borda: 'rodape', estado: 'tratado', forca: 0.5 }] }], { ...vencedora, crop: 'left-middle' })).toMatch(
      /^a referência no corte center-middle precisava de véu/,
    )
  })
})
