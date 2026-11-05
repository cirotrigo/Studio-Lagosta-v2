/**
 * B1d — checkpoint g (subagentes B/E/F): "os campos que alguém mandou ajustar" vêm de `fieldValues.ajustes`, que é o
 * PEDIDO cru do ajustarArte — e ele pode trazer `_slots`/`_papeis` (endereçamento semântico) e controles `_…`
 * (`_imageUrl`, `_driveImageId`). Nenhum deles é um campo de texto da arte: não pode virar "campo que a IA erra" no
 * prompt do perfil, nem uma URL virar exemplo de texto.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { camposDosAjustes } from '../mineracao'

describe('camposDosAjustes', () => {
  it('ignora chaves de controle e do contrato semântico; conta os campos de texto como sempre', () => {
    const r = camposDosAjustes([
      { ajustes: { _slots: { 'headline-principal': 'Festival de Massas' }, _papeis: { cta: 'Reserve' }, _imageUrl: 'https://f', Título: 'Noite' } },
      { ajustes: { Título: 'Outra', _driveImageId: 'd1' } },
    ])
    expect(r).toEqual([{ campo: 'Título', ocorrencias: 2, exemplos: ['Noite', 'Outra'] }])
    expect(JSON.stringify(r)).not.toMatch(/_slots|_papeis|headline-principal|https:/)
  })

  it('ajustes ausente ou não-objeto não conta', () => {
    expect(camposDosAjustes([{ ajustes: null }, { ajustes: 'x' }])).toEqual([])
  })
})

describe('pedido semântico MISTO (Codex, checkpoint g)', () => {
  it('com _slots presente, a chave legada de IMAGEM não conta como campo de texto; a de texto conta', () => {
    expect(camposDosAjustes([{ ajustes: { _slots: { foto1: { fileUrl: 'https://a' } }, Foto2: { fileUrl: 'https://b' }, Título: 'Noite' } }])).toEqual([{ campo: 'Título', ocorrencias: 1, exemplos: ['Noite'] }])
  })

  it('legado SEM contrato: como sempre (toda chave não-_ conta)', () => {
    expect(camposDosAjustes([{ ajustes: { Foto2: { fileUrl: 'https://b' } } }]).map((c) => c.campo)).toEqual(['Foto2'])
  })
})

it('legado: camada chamada "_titulo" é campo de texto (só as chaves RESERVADAS do pedido são controle)', () => {
  expect(camposDosAjustes([{ ajustes: { _titulo: 'Noite', _imageUrl: 'https://f' } }]).map((c) => c.campo)).toEqual(['_titulo'])
})
