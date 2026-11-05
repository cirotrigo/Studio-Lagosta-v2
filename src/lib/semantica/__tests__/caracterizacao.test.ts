/**
 * CARACTERIZAÇÃO dos caminhos legados que a fundação semântica NÃO altera.
 *
 * Estes testes fixam o comportamento de hoje (passam sem código novo). Se o PR
 * B mexer em `bakeLayers`, `aplicarSlotNaCamada`, `papelDaCamada` ou na
 * duplicação, é aqui que a mudança de comportamento aparece.
 */
import { describe, expect, it } from 'vitest'
import { bakeLayers } from '@/lib/creatives/bake-layers'
import { aplicarSlotNaCamada } from '@/lib/posts/page-to-design-data'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { doisServicos, legadoPorNome, mesmoPapelIdsAleatorios, papelInvalidoComIdDePapel } from './fixtures'

describe('caracterização: slotValues casam por id, depois por nome', () => {
  it('bakeLayers: a chave "servico" atinge só a camada de id "servico", não a servico-2', () => {
    const { layers, changedTextIds } = bakeLayers(doisServicos, { servico: 'Novo' }, null)
    expect(layers.map((l) => l.content)).toEqual(['Novo', 'Ter a dom'])
    expect(changedTextIds).toEqual(['servico'])
  })

  it('bakeLayers: o PAPEL não endereça — a chave "servico" não acha camadas de id aleatório', () => {
    const { layers, changedTextIds } = bakeLayers(mesmoPapelIdsAleatorios, { servico: 'Novo' }, null)
    expect(layers.map((l) => l.content)).toEqual([undefined, undefined])
    expect(changedTextIds).toEqual([])
  })

  it('bakeLayers: casa pelo nome quando o id não casa', () => {
    const { layers } = bakeLayers(legadoPorNome, { headline: 'Trocado' }, null)
    expect(layers[0].content).toBe('Trocado')
  })

  it('aplicarSlotNaCamada: mesmo contrato — id primeiro, depois nome', () => {
    expect(aplicarSlotNaCamada(doisServicos[1], { servico: 'X' }).content).toBe('Ter a dom')
    expect(aplicarSlotNaCamada(doisServicos[1], { 'servico-2': 'X' }).content).toBe('X')
    expect(aplicarSlotNaCamada(legadoPorNome[0], { headline: 'Y' }).content).toBe('Y')
  })
})

describe('caracterização: papelDaCamada (legado) cai para id e nome', () => {
  it('lê o papel do nome numa página legada sem metadata', () => {
    expect(papelDaCamada(legadoPorNome[0])).toBe('headline')
  })

  it('com metadata INVÁLIDA, o legado devolve o papel do id — é isto que a fundação passa a diagnosticar', () => {
    expect(papelDaCamada(papelInvalidoComIdDePapel[0])).toBe('servico')
  })

  it('não conhece foto nem logo', () => {
    expect(papelDaCamada({ ...legadoPorNome[0], metadata: { compositor: { papel: 'logo' } }, name: 'x', id: 'y' })).toBeNull()
  })
})
