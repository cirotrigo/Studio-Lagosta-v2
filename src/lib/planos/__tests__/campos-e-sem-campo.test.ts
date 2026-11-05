/**
 * B1c: o mapeamento da copy passa a rodar DENTRO de `createArteRapida`, sobre
 * as camadas do modelo EFETIVO — então os campos saem das camadas já lidas
 * (`camposDeTextoDasCamadas`, sem consulta) e a copy POSICIONAL declara o que
 * ficou sem destino (`semCampo`), como o contrato já fazia.
 */
import { describe, expect, it } from 'vitest'
import { camposDeTextoDasCamadas, mapearCopyParaSlots } from '../execucao'

describe('camposDeTextoDasCamadas: o mesmo critério de camposDeTextoDoModelo, sem banco', () => {
  it('só camadas de texto, com id, nome e o papel de papelDaCamada', () => {
    expect(
      camposDeTextoDasCamadas([
        { id: 'pre-titulo', name: 'Pre-titulo', type: 'text' },
        { id: 'cta', name: 'CTA', type: 'text' },
        { id: 't-h', name: 'Título', type: 'text', metadata: { compositor: { papel: 'headline' } } },
        { id: 'rt', name: 'Rico', type: 'rich-text' },
        { id: 'img', name: 'Foto', type: 'image' },
        { id: '', name: 'sem id', type: 'text' },
      ] as never),
    ).toEqual([
      { layerId: 'pre-titulo', name: 'Pre-titulo', papel: null },
      { layerId: 'cta', name: 'CTA', papel: 'cta' },
      { layerId: 't-h', name: 'Título', papel: 'headline' },
    ])
  })
})

describe('mapearCopyParaSlots: semCampo (posições dos blocos sem destino)', () => {
  const campos = [{ layerId: 'a' }, { layerId: 'b' }]

  it('tudo coube: semCampo vazio', () => {
    expect(mapearCopyParaSlots(campos, ['x', 'y']).semCampo).toEqual([])
  })

  it('blocos sobrando: as posições excedentes, e o aviso de sempre continua', () => {
    const r = mapearCopyParaSlots(campos, ['x', 'y', 'z', 'w'])
    expect(r.semCampo).toEqual([2, 3])
    expect(r.slotValues).toEqual({ a: 'x', b: 'y' })
    expect(r.avisos).toHaveLength(1)
  })

  it('modelo sem campo de texto: todos os blocos sem destino', () => {
    expect(mapearCopyParaSlots([], ['x', 'y']).semCampo).toEqual([0, 1])
  })

  it('campos sobrando continuam ocultados (não é semCampo)', () => {
    const r = mapearCopyParaSlots(campos, ['x'])
    expect(r.semCampo).toEqual([])
    expect(r.ocultar).toEqual(['b'])
  })

  it('sem texto: nada sem destino (o caso de sempre)', () => {
    expect(mapearCopyParaSlots(campos, []).semCampo).toEqual([])
  })
})
