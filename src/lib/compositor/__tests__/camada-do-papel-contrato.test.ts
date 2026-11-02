/**
 * F2d: o contrato do espaçamento (`espacamentoDaReferencia`) em `camadaDoPapel` — resolvido DEPOIS de arredondar o
 * corpo, para o mesmo corpo materializado dar o mesmo espaçamento em qualquer degrau; sem o contrato, a conta de sempre,
 * byte a byte. E a sombra: `undefined` = default da casa, `null` = sem sombra, a da referência quando ela tem.
 */
import { describe, expect, it } from 'vitest'
import type { EstiloDePapel } from '../assinatura'
import { camadaDoPapel } from '../blocos'
import { vestirEstiloDaReferencia } from '../arquetipos/estilo-da-referencia'
import { estiloDaRecusa, type RecusaPreparada } from '../preparar-blocos'

const base: EstiloDePapel = { fontFamily: 'Montserrat', fontSize: 38, lineHeight: 1, letterSpacing: 2.92, color: '#CAB371' }
const ref = { fontFamily: 'TrajanPro Regular', fontWeight: null, lineHeight: 1, letterSpacing: 3, textTransform: 'uppercase' as const, color: '#F8F8F8' }
const camada = (estilo: EstiloDePapel, escala: number) => camadaDoPapel({ papel: 'apoio', linhas: ['Sabores'], estilo, escala, width: 900, textAlign: 'left', groupId: 'g', corDaMancha: '#000000' })

describe('camadaDoPapel · o contrato do espaçamento', () => {
  it('31,4 → 31 px: com o contrato (3 px em 39) o espaçamento é 2,38 (do corpo materializado); sem ele, 2,41 (da escala contínua sobre a reserva 2,92)', () => {
    const escala = 31.4 / 38
    const semContrato = camada(base, escala)
    expect(semContrato.style?.fontSize).toBe(31)
    expect(semContrato.style?.letterSpacing).toBe(Math.round(2.92 * escala * 100) / 100)
    expect(semContrato.style?.letterSpacing).toBe(2.41)
    const vestido = vestirEstiloDaReferencia({ base, origemDaBase: 'assinatura', estilo: ref, corpo: 39 }).estilo
    const comContrato = camada(vestido, escala)
    expect(comContrato.style?.fontSize).toBe(31)
    expect(comContrato.style?.letterSpacing).toBe(2.38)
    // No teto (39 px) o espaçamento é o desenhado.
    expect(camada(vestido, 39 / 38).style?.letterSpacing).toBe(3)
    expect(camada(vestido, 39 / 38).style?.fontSize).toBe(39)
  })

  it('sombra: undefined na base → default da casa; null → sem sombra; a da referência quando ela tem', () => {
    expect(camada(vestirEstiloDaReferencia({ base, origemDaBase: 'assinatura', estilo: ref, corpo: 39 }).estilo, 1).effects?.shadow?.enabled).toBe(true)
    expect(camada(vestirEstiloDaReferencia({ base: { ...base, sombra: null }, origemDaBase: 'assinatura', estilo: ref, corpo: 39 }).estilo, 1).effects?.shadow).toBeUndefined()
    const daRef = vestirEstiloDaReferencia({ base: { ...base, sombra: null }, origemDaBase: 'assinatura', estilo: { ...ref, sombra: { color: '#000000', blur: 4, offsetY: 2, opacity: 0.5 } }, corpo: 39 })
    expect(daRef.origem.sombra).toBe('referencia')
    expect(camada(daRef.estilo, 1).effects?.shadow).toMatchObject({ enabled: true, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.5 })
  })

  it('a segunda voz (apenasCor) fica com o espaçamento e a sombra da base; só a cor muda', () => {
    const voz2 = vestirEstiloDaReferencia({ base: { ...base, fontSize: 35, sombra: null }, origemDaBase: 'arranjo', estilo: ref, corpo: 39, apenasCor: true })
    expect(voz2.estilo).toMatchObject({ fontFamily: 'Montserrat', fontSize: 35, letterSpacing: 2.92, color: '#F8F8F8', sombra: null })
    expect(voz2.estilo.espacamentoDaReferencia).toBeUndefined()
    expect(voz2.origem).toMatchObject({ fontFamily: 'arranjo', color: 'referencia', sombra: 'arranjo' })
  })

  it('estiloDaRecusa: no piso, a segunda voz (sem contrato) publica o espaçamento ESCALADO (2,92 em 35 → 5,34 em 64), e com o contrato 2,38 em 31 — o mesmo objeto no compor e no medir-copy (Codex R3)', () => {
    const recusa = (estilo: EstiloDePapel, piso: number, referencia: number): RecusaPreparada => ({ papel: 'apoio', funcao: 'apoio', id: 'apoio', linhasDaCopy: ['Sabores'], estilo, familiasMedidas: [estilo.fontFamily], destaque: null, orcamento: [], coluna: 900, corpo: { referencia, teto: referencia, piso }, estiloDaReferencia: { fontFamily: 'arranjo', fontWeight: 'arranjo', lineHeight: 'arranjo', letterSpacing: 'arranjo', textTransform: 'arranjo', color: 'referencia', sombra: 'arranjo' } })
    const voz2 = vestirEstiloDaReferencia({ base: { ...base, fontSize: 35 }, origemDaBase: 'arranjo', estilo: ref, corpo: 39, apenasCor: true }).estilo
    expect(estiloDaRecusa(recusa(voz2, 64, 85), 1, '#000000')).toMatchObject({ fontFamily: 'Montserrat', letterSpacing: 5.34, color: '#F8F8F8', origem: { color: 'referencia' } })
    const vestido = vestirEstiloDaReferencia({ base, origemDaBase: 'assinatura', estilo: ref, corpo: 39 }).estilo
    expect(estiloDaRecusa(recusa(vestido, 31, 39), 1, '#000000')).toMatchObject({ fontFamily: 'TrajanPro Regular', fontWeight: null, textTransform: 'uppercase', letterSpacing: 2.38, color: '#F8F8F8' })
    expect(estiloDaRecusa({ ...recusa(vestido, 31, 39), estiloDaReferencia: undefined }, 1, '#000000')).toBeNull()
  })
})
