import { describe, expect, it } from 'vitest'
import { MARCA_DE_INDEXADO, comMarcaDeIndexado, semMarcaDeIndexado, temMarcaDeIndexado } from '../marca-de-indexado'

const meta = { origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1', [MARCA_DE_INDEXADO]: '2026-09-12T10:00:00.000Z' }

describe('marca de indexado — invalidar e repor preservando o resto do metadata (PR13-36)', () => {
  it('tem a marca só com string não vazia; metadata que não é objeto plano nunca tem', () => {
    expect(temMarcaDeIndexado(meta)).toBe(true)
    expect(temMarcaDeIndexado({ ...meta, [MARCA_DE_INDEXADO]: '' })).toBe(false)
    expect(temMarcaDeIndexado({ chaveDoFato: 'abc' })).toBe(false)
    expect(temMarcaDeIndexado(null)).toBe(false)
    expect(temMarcaDeIndexado(['x'])).toBe(false)
    expect(temMarcaDeIndexado('indexadoEm')).toBe(false)
  })
  it('sem a marca: a chave do fato e o resto ficam; a marca some', () => {
    const r = semMarcaDeIndexado(meta)
    expect(r).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1' })
    expect(temMarcaDeIndexado(r)).toBe(false)
    expect(semMarcaDeIndexado(null)).toEqual({})
  })
  it('com a marca: grava o instante dado e preserva o resto; sobre metadata vazio cria só a marca', () => {
    const em = new Date('2026-09-12T12:34:56.000Z')
    expect(comMarcaDeIndexado(semMarcaDeIndexado(meta), em)).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1', [MARCA_DE_INDEXADO]: '2026-09-12T12:34:56.000Z' })
    expect(comMarcaDeIndexado(undefined, em)).toEqual({ [MARCA_DE_INDEXADO]: '2026-09-12T12:34:56.000Z' })
  })
})

describe('arrendamento da indexação — vigente, adquirir, renovar e liberar (PR13-41)', () => {
  const agora = Date.parse('2026-09-12T12:00:00.000Z')
  it('vigente só com token E prazo no futuro; token sem prazo é ciclo encerrado', async () => {
    const { arrendamentoVigenteDe } = await import('../marca-de-indexado')
    expect(arrendamentoVigenteDe({ cicloDeIndexacao: 'A', cicloExpiraEm: '2026-09-12T12:01:00.000Z' }, agora)).toBe('A')
    expect(arrendamentoVigenteDe({ cicloDeIndexacao: 'A', cicloExpiraEm: '2026-09-12T11:59:59.000Z' }, agora)).toBeNull()
    expect(arrendamentoVigenteDe({ cicloDeIndexacao: 'A' }, agora)).toBeNull()
    expect(arrendamentoVigenteDe({ cicloExpiraEm: '2026-09-12T12:01:00.000Z' }, agora)).toBeNull()
    expect(arrendamentoVigenteDe({ cicloDeIndexacao: 'A', cicloExpiraEm: 'lixo' }, agora)).toBeNull()
    expect(arrendamentoVigenteDe(null, agora)).toBeNull()
  })
  it('adquirir tira a marca e grava token + prazo; renovar só estende; liberar tira só o prazo e deixa o token', async () => {
    const { comArrendamento, comPrazoRenovado, semPrazoDoArrendamento } = await import('../marca-de-indexado')
    const adquirido = comArrendamento(meta, 'A', agora + 1000)
    expect(adquirido).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1', cicloDeIndexacao: 'A', cicloExpiraEm: '2026-09-12T12:00:01.000Z' })
    expect(comPrazoRenovado(adquirido, agora + 2000).cicloExpiraEm).toBe('2026-09-12T12:00:02.000Z')
    expect(semPrazoDoArrendamento(adquirido)).toEqual({ origem: 'migracao-da-voz', chaveDoFato: 'abc', versaoDaPrevia: 'v1', cicloDeIndexacao: 'A' })
  })
  it('o prazo de um passo é muito menor que o arrendamento', async () => {
    const { DURACAO_DO_ARRENDAMENTO_MS, PRAZO_DO_PASSO_MS } = await import('../marca-de-indexado')
    expect(PRAZO_DO_PASSO_MS * 4).toBeLessThan(DURACAO_DO_ARRENDAMENTO_MS)
  })
})
