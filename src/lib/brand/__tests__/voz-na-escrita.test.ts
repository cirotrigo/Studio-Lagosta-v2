import { describe, expect, it, vi } from 'vitest'
import { carimboDaGeracao, carimboDaVoz, lerCarimboDaVoz, origemDoCarimbo } from '../voz-na-escrita'

const lidoEm = new Date('2026-09-13T20:00:00Z')

describe('carimboDaVoz', () => {
  it('sem estado da voz não há carimbo', () => {
    expect(carimboDaVoz(null, { lidoEm })).toBeNull()
  })

  it('copy da mesma chamada: a voz de agora vale (fonte e versão)', () => {
    expect(carimboDaVoz({ fonte: 'voz', versao: 4, migradaEm: '2026-09-01T00:00:00Z', atualizadaEm: '2026-09-10T00:00:00Z' }, { lidoEm })).toEqual({
      fonte: 'voz',
      versao: 4,
      lidoEm: lidoEm.toISOString(),
    })
  })

  it('legado e nenhuma nunca levam versão', () => {
    expect(carimboDaVoz({ fonte: 'legado', versao: 3 }, { lidoEm })?.versao).toBeNull()
    expect(carimboDaVoz({ fonte: 'nenhuma', versao: null }, { lidoEm })?.fonte).toBe('nenhuma')
  })

  it('copy escrita ANTES da migração: a fonte daquele instante é desconhecida (não se chuta legado)', () => {
    const c = carimboDaVoz({ fonte: 'voz', versao: 2, migradaEm: '2026-09-12T12:00:00Z', atualizadaEm: '2026-09-12T12:00:00Z' }, { lidoEm, escritaEm: '2026-09-11T10:00:00Z' })
    expect(c).toMatchObject({ fonte: null, versao: null, escritaEm: '2026-09-11T10:00:00.000Z' })
    expect(c?.incerto).toMatch(/passou a valer depois/)
  })

  it('voz regravada depois da escrita: a fonte é certa, a versão não', () => {
    const c = carimboDaVoz({ fonte: 'voz', versao: 7, migradaEm: '2026-09-01T00:00:00Z', atualizadaEm: '2026-09-12T15:00:00Z' }, { lidoEm, escritaEm: new Date('2026-09-12T09:00:00Z') })
    expect(c).toMatchObject({ fonte: 'voz', versao: null })
    expect(c?.incerto).toMatch(/mudou de versão/)
  })

  it('voz intocada desde antes da escrita: o carimbo vale com a versão', () => {
    const c = carimboDaVoz({ fonte: 'voz', versao: 7, migradaEm: '2026-09-01T00:00:00Z', atualizadaEm: '2026-09-05T00:00:00Z' }, { lidoEm, escritaEm: '2026-09-12T09:00:00Z' })
    expect(c).toMatchObject({ fonte: 'voz', versao: 7 })
    expect(c?.incerto).toBeUndefined()
  })

  it('legado com escrita anterior não vira incerto (a precedência legada não tem versão)', () => {
    expect(carimboDaVoz({ fonte: 'legado', versao: null, migradaEm: null, atualizadaEm: '2026-09-12T15:00:00Z' }, { lidoEm, escritaEm: '2026-09-01T00:00:00Z' })).toMatchObject({ fonte: 'legado', versao: null })
  })
})

describe('lerCarimboDaVoz', () => {
  it('ida e volta', () => {
    const c = carimboDaVoz({ fonte: 'voz', versao: 3 }, { lidoEm, escritaEm: '2026-09-12T09:00:00Z' })
    expect(lerCarimboDaVoz(JSON.parse(JSON.stringify(c)))).toEqual(c)
  })
  it('forma inesperada vira null (conta como sem carimbo)', () => {
    expect(lerCarimboDaVoz(null)).toBeNull()
    expect(lerCarimboDaVoz('voz')).toBeNull()
    expect(lerCarimboDaVoz({ fonte: 'outra', lidoEm: 'x' })).toBeNull()
    expect(lerCarimboDaVoz({ fonte: 'voz' })).toBeNull()
  })
  it('fonte null (incerta) é lida', () => {
    expect(lerCarimboDaVoz({ fonte: null, versao: null, lidoEm: 'x', incerto: 'motivo' })).toEqual({ fonte: null, versao: null, lidoEm: 'x', incerto: 'motivo' })
  })
})

describe('C15-05 · a copy reproduzida herda o carimbo de quando foi escrita', () => {
  const herdado = { fonte: 'legado' as const, versao: null, lidoEm: '2026-09-01T10:00:00.000Z' }

  it('origemDoCarimbo: o carimbo da origem e o createdAt dela como instante da escrita', () => {
    expect(origemDoCarimbo({ fieldValues: { vozNaEscrita: herdado }, createdAt: new Date('2026-09-01T10:00:00Z') })).toEqual({
      vozNaEscrita: herdado,
      escritaEm: '2026-09-01T10:00:00.000Z',
    })
  })

  it('origemDoCarimbo: a origem que já registrava a escrita (item de plano) passa ESSE instante adiante', () => {
    const doItem = { ...herdado, escritaEm: '2026-08-30T09:00:00.000Z' }
    expect(origemDoCarimbo({ fieldValues: { vozNaEscrita: doItem }, createdAt: '2026-09-01T10:00:00Z' }).escritaEm).toBe('2026-08-30T09:00:00.000Z')
  })

  it('origemDoCarimbo: arte antiga sem carimbo ainda leva o createdAt (a voz de hoje sai incerta se mudou depois)', () => {
    expect(origemDoCarimbo({ fieldValues: { source: 'arte-ia' }, createdAt: '2026-09-01T10:00:00Z' })).toEqual({ vozNaEscrita: null, escritaEm: '2026-09-01T10:00:00.000Z' })
    expect(origemDoCarimbo({ fieldValues: null, createdAt: 'lixo' })).toEqual({ vozNaEscrita: null, escritaEm: null })
    expect(origemDoCarimbo(null)).toEqual({ vozNaEscrita: null, escritaEm: null })
  })

  it('carimboDaGeracao: o herdado vence e a voz de agora nem é lida', async () => {
    const calcular = vi.fn(async () => ({ fonte: 'voz' as const, versao: 1, lidoEm: 'agora' }))
    expect(await carimboDaGeracao({ vozNaEscrita: herdado, escritaEm: '2026-09-01T10:00:00Z' }, calcular)).toEqual(herdado)
    expect(calcular).not.toHaveBeenCalled()
  })

  it('carimboDaGeracao: sem herdado válido, calcula com o instante da escrita; falha vira null', async () => {
    const calcular = vi.fn(async (escritaEm: Date | string | null) => ({ fonte: 'voz' as const, versao: null, lidoEm: 'agora', escritaEm: String(escritaEm) }))
    expect((await carimboDaGeracao({ vozNaEscrita: { fonte: 'outra' }, escritaEm: '2026-09-01T10:00:00.000Z' }, calcular))?.escritaEm).toBe('2026-09-01T10:00:00.000Z')
    expect(calcular).toHaveBeenCalledWith('2026-09-01T10:00:00.000Z')
    expect(await carimboDaGeracao({}, async () => { throw new Error('BrandVoice ausente') })).toBeNull()
  })
})
