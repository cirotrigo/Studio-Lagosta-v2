/**
 * Quarentena do rich-text (até a issue #209): o contrato semântico NOVO (`_slots`/`_papeis`) não escreve
 * rich-text — trocar `content` sem reconstruir os trechos e estilos produz uma peça difícil de editar depois.
 * A descoberta não o oferece ao agente. O LEGADO (layerId/nome direto) não muda.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { resolverValoresSemanticos } from '../resolver-valores'
import { analisarSlotFields } from '@/lib/creatives/slot-fields'
import { bakeLayers } from '@/lib/creatives/bake-layers'
import { aplicarSlotNaCamada } from '@/lib/posts/page-to-design-data'

const camadas = [
  { id: 't1', name: 'Título', type: 'text', content: 'texto', visible: true, metadata: { compositor: { papel: 'headline' }, slot: { id: 'titulo' } } },
  { id: 'r1', name: 'Rico', type: 'rich-text', content: 'rico', visible: true, metadata: { compositor: { papel: 'servico' }, slot: { id: 'rico' } } },
  { id: 'i1', name: 'Foto', type: 'image', isDynamic: true, visible: true, metadata: { slot: { id: 'foto' } } },
] as unknown as Layer[]
const erros = (slotValues: Record<string, unknown>) => resolverValoresSemanticos(camadas, slotValues).erros

describe('A–D. resolvedor: o contrato novo não escreve rich-text', () => {
  it('A. _slots + content em rich-text → VALOR_INCOMPATIVEL_COM_CAMADA (string e objeto)', () => {
    for (const v of ['X', { content: 'X' }]) {
      expect(erros({ _slots: { rico: v } })).toEqual([{ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', layerId: 'r1', type: 'rich-text', origem: { tipo: 'slotId', chave: 'rico' }, efeito: 'content' }])
    }
  })

  it('B. _papeis com papel DECLARADO em rich-text + content → o mesmo erro', () => {
    expect(erros({ _papeis: { servico: 'X' } })).toEqual([{ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', layerId: 'r1', type: 'rich-text', origem: { tipo: 'semanticRole', chave: 'servico' }, efeito: 'content' }])
  })

  it('C. text continua aceito', () => {
    expect(erros({ _slots: { titulo: 'X' }, _papeis: { headline: 'X' } })).toEqual([])
  })

  it('D. image + fileUrl continua aceito', () => {
    expect(erros({ _slots: { foto: { fileUrl: 'https://f' } } })).toEqual([])
  })
})

describe('E. legado por layerId/nome em rich-text: o comportamento de sempre', () => {
  const rico = camadas[1] as any

  it('render/agendamento (aplicarSlotNaCamada): por id e por nome troca o content', () => {
    expect(aplicarSlotNaCamada(rico, { r1: 'Novo' }).content).toBe('Novo')
    expect(aplicarSlotNaCamada(rico, { Rico: { content: 'Por nome' } }).content).toBe('Por nome')
  })

  it('criação/ajuste (bakeLayers): por id troca o content', () => {
    expect(bakeLayers([rico], { r1: 'Novo' }, null).layers[0].content).toBe('Novo')
  })

  it('o resolvedor não interfere no legado (sem _slots/_papeis, nenhum erro)', () => {
    expect(erros({ r1: 'Novo', Rico: 'Novo' })).toEqual([])
  })
})

describe('F. descoberta: rich-text descrito, mas não oferecido ao agente', () => {
  it('rich-text com slot e papel declarados: slot e papel descritos, addressableBy vazio, com o motivo', () => {
    const campo = analisarSlotFields(camadas).slotFields.find((f) => f.layerId === 'r1')!
    expect(campo.semantic.slot).toEqual({ status: 'declared', id: 'rico' })
    expect(campo.semantic.role).toMatchObject({ status: 'declared', value: 'servico' })
    expect(campo.semantic.addressableBy).toEqual([])
    expect(campo.semantic.problems).toContainEqual({ code: 'RICH_TEXT_NOT_SUPPORTED' })
  })

  it('text e image vizinhos continuam prometidos', () => {
    const r = analisarSlotFields(camadas).slotFields
    expect(r.find((f) => f.layerId === 't1')!.semantic.addressableBy).toEqual(['layerId', 'slotId', 'semanticRole'])
    expect(r.find((f) => f.layerId === 'i1')!.semantic.addressableBy).toEqual(['layerId', 'slotId'])
  })
})
