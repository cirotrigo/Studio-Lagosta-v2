import { describe, expect, it } from 'vitest'
import { metadataDaEdicao, metadataDaPessoa } from '../marca-de-indexado'

/**
 * C13-01 (revisão final do Codex, 18/09/2026): a proteção da identidade do
 * fato migrado (`chaveDoFato`, `origem`, `versaoDaPrevia`) valia para TODA
 * entrada — a criação comum perdia `origem` e a edição não conseguia trocá-la.
 * A identidade só é do sistema num fato (com `chaveDoFato`).
 */
const FATO = { chaveDoFato: 'c1', origem: 'migracao-da-voz', versaoDaPrevia: 'v1', nota: 'x' }

describe('origem de entrada comum é da pessoa; a do fato migrado continua protegida (C13-01)', () => {
  it('criação comum preserva origem', () => {
    expect(metadataDaPessoa({ origem: 'importacao-planilha', lote: 3 })).toEqual({ origem: 'importacao-planilha', lote: 3 })
  })

  it('edição comum troca origem (e null limpa)', () => {
    expect(metadataDaEdicao({ origem: 'importacao-planilha' }, { origem: 'revisada' }, false)).toEqual({ origem: 'revisada' })
    expect(metadataDaEdicao({ origem: 'importacao-planilha' }, null, false)).toBeNull()
  })

  it('fato migrado: a edição não troca nem apaga a identidade', () => {
    expect(metadataDaEdicao(FATO, { origem: 'forjada', nota: 'y' }, true)).toEqual({ chaveDoFato: 'c1', origem: 'migracao-da-voz', versaoDaPrevia: 'v1', nota: 'y' })
    expect(metadataDaEdicao(FATO, null, false)).toEqual({ chaveDoFato: 'c1', origem: 'migracao-da-voz', versaoDaPrevia: 'v1' })
  })

  it('criação que tenta FORJAR a identidade de um fato perde as três chaves', () => {
    expect(metadataDaPessoa({ chaveDoFato: 'forjada', origem: 'migracao-da-voz', versaoDaPrevia: 'v9', nota: 'n' })).toEqual({ nota: 'n' })
  })
})
