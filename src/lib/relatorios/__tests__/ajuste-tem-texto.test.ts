/**
 * B1d — checkpoint g (subagentes B/F): o placar revisor × diagramação decide pelo que `fieldValues.ajustes` (o pedido
 * cru do ajustarArte) trocou de TEXTO. Controles `_…` e endereçamento só de imagem (`_slots: {foto: {fileUrl}}`) não
 * são troca de texto; texto vindo por `_slots`/`_papeis` (string ou `{ content }`) é.
 */
import { describe, expect, it } from 'vitest'

import { ajusteTemTexto } from '../qualidade-da-copy-contrato'

describe('ajusteTemTexto', () => {
  it.each([
    ['vazio', {}, false],
    ['ausente', null, false],
    ['só controle de imagem', { _imageUrl: 'https://f', _driveImageId: 'd' }, false],
    ['semântico só de imagem', { _slots: { foto: { fileUrl: 'https://f' } } }, false],
    ['campo de texto legado', { Título: 'Noite' }, true],
    ['texto por _slots (string)', { _slots: { manchete: 'Noite' } }, true],
    ['texto por _papeis ({ content })', { _papeis: { headline: { content: 'Noite' } } }, true],
    ['misto: _slots de imagem + chave legada de IMAGEM (Codex)', { _slots: { foto1: { fileUrl: 'https://a' } }, Foto2: { fileUrl: 'https://b' } }, false],
    ['misto: _slots de imagem + chave legada de texto', { _slots: { foto1: { fileUrl: 'https://a' } }, Título: 'Noite' }, true],
    ['legado sem contrato com chave de imagem: como sempre (conta)', { Foto2: { fileUrl: 'https://b' } }, true],
    ['legado: camada de texto chamada "_titulo" é texto, não controle (Codex)', { _titulo: 'Noite' }, true],
  ])('%s → %s', (_n, ajustes, esperado) => {
    expect(ajusteTemTexto(ajustes)).toBe(esperado)
  })
})
