/**
 * Duplicar ou colar uma camada cria uma NOVA ocorrência lógica: a cópia nasce
 * sem `metadata.slot` (nem um slot novo gerado). Sem isso a página ficava com
 * dois slots iguais — `resolverAlvo` acusa SLOT_DUPLICADO e nada se endereça.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { camadaDuplicadaNoEditor, camadasColadasNoEditor } from '../camada-copiada'

const original: Layer = {
  id: 'text-1',
  type: 'text',
  name: 'Endereço',
  visible: true,
  locked: true,
  order: 3,
  position: { x: 100, y: 200 },
  size: { width: 600, height: 80 },
  content: 'Rua A, 1',
  style: { fontSize: 40, fill: '#fff' },
  metadata: { groupId: 'g1', presetId: 'p1', slot: { id: 'servico-endereco' } },
}
const semSlotNaOrigem: Layer = { ...original, metadata: { groupId: 'g1', presetId: 'p1' } }
const opcoes = { paginaTemContrato: true }

describe('duplicar camada no editor', () => {
  it('a cópia nasce sem slot, com id novo', () => {
    const copia = camadaDuplicadaNoEditor(original, { ...opcoes, novoId: 'text-2' })
    expect(copia.id).toBe('text-2')
    expect((copia.metadata as Record<string, unknown>).slot).toBeUndefined()
  })

  it('o resto da metadata e todo o visual ficam como eram', () => {
    expect(camadaDuplicadaNoEditor(original, { ...opcoes, novoId: 'text-2' })).toEqual(camadaDuplicadaNoEditor(semSlotNaOrigem, { ...opcoes, novoId: 'text-2' }))
  })

  it('a original não é alterada', () => {
    camadaDuplicadaNoEditor(original, { ...opcoes, novoId: 'text-2' })
    expect(original.metadata).toEqual({ groupId: 'g1', presetId: 'p1', slot: { id: 'servico-endereco' } })
  })
})

describe('colar camadas no editor', () => {
  it('cada camada colada nasce sem slot, com id novo', () => {
    let n = 0
    const coladas = camadasColadasNoEditor([original, original], { ...opcoes, novoId: () => `novo-${++n}` })
    expect(coladas.map((c) => c.id)).toEqual(['novo-1', 'novo-2'])
    expect(coladas.map((c) => (c.metadata as Record<string, unknown>).slot)).toEqual([undefined, undefined])
  })

  it('o resto da metadata e todo o visual ficam como eram', () => {
    let a = 0
    let b = 0
    expect(camadasColadasNoEditor([original], { ...opcoes, novoId: () => `n${++a}` })).toEqual(camadasColadasNoEditor([semSlotNaOrigem], { ...opcoes, novoId: () => `n${++b}` }))
  })
})
