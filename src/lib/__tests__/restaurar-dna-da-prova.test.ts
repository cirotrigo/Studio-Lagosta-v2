import { describe, expect, it } from 'vitest'
import { camposDiferentes, restaurarDna, type ClienteDoDna, type LinhaDoDna } from '../../../scripts/lib/restaurar-dna'

/**
 * PR7-F-01 (nota da revisão final do Codex): a prova da voz apaga e recria o
 * BrandDNA; se a recriação falhar, o cleanup precisa RECRIAR a linha pelo
 * snapshot e conferir todos os campos — não só `update` e dois campos.
 */
function banco(inicial: LinhaDoDna | null, opcoes: { createFalhaVezes?: number } = {}) {
  let linha = inicial ? { ...inicial } : null
  let falhas = opcoes.createFalhaVezes ?? 0
  const cliente: ClienteDoDna = {
    brandDNA: {
      findUnique: async () => (linha ? { ...linha } : null),
      create: async ({ data }) => {
        if (falhas > 0) { falhas--; throw new Error('recriação falhou (injetada)') }
        linha = { ...data }
      },
      update: async ({ data }) => {
        if (!linha) throw new Error('Record to update not found')
        linha = { ...linha, ...data, updatedAt: new Date() }
      },
      deleteMany: async () => { linha = null },
    },
  }
  return { cliente, atual: () => linha }
}

const snap: LinhaDoDna = { id: 9, projectId: 6, toneOfVoice: 'Direto.', contentRules: 'Nunca X.', composition: 'Bloco no rodapé.', visualStyle: 'Quente.', photoDirection: null, approvalChecklist: 'Tem preço?', estiloDasReferencias: { resumo: 'r' }, createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01') }

describe('o cleanup da prova devolve o DNA ao snapshot inteiro (PR7-F-01)', () => {
  it('recriação do passo 8b falhou (linha ausente): o cleanup recria pelo snapshot, mesmo id, todos os campos', async () => {
    const b = banco(null)
    expect(await restaurarDna(b.cliente, 6, snap)).toEqual([])
    expect(b.atual()?.id).toBe(9)
    expect(camposDiferentes(snap, b.atual())).toEqual([])
  })

  it('linha presente com campos mexidos (não só contentRules): volta tudo', async () => {
    const b = banco({ ...snap, contentRules: 'regra de prova', composition: 'outra', estiloDasReferencias: null })
    expect(await restaurarDna(b.cliente, 6, snap)).toEqual([])
    expect(camposDiferentes(snap, b.atual())).toEqual([])
  })

  it('a própria recriação do cleanup falha: vira problema declarado, nunca silêncio', async () => {
    const b = banco(null, { createFalhaVezes: 1 })
    await expect(restaurarDna(b.cliente, 6, snap)).rejects.toThrow(/injetada/)
  })

  it('conferência vê diferença em campo que o cleanup antigo ignorava', () => {
    expect(camposDiferentes(snap, { ...snap, visualStyle: 'mudou' })).toEqual(['visualStyle'])
    expect(camposDiferentes(snap, null)).toEqual(['(linha)'])
  })
})
