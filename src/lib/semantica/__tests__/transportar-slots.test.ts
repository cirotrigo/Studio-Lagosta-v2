import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { transportarSlots } from '../transportar-slots'
import { camada } from './fixtures'

const comp = (papel: unknown, bloco?: unknown) => ({ compositor: { papel, ...(bloco !== undefined ? { bloco } : {}) } })
const comSlot = (base: Record<string, unknown>, id: unknown) => ({ ...base, slot: { id } })

const antiga = (id: string, metadata: Record<string, unknown>) => camada({ id, metadata })
const nova = (id: string, metadata: Record<string, unknown>) => camada({ id, metadata, content: 'novo texto', position: { x: 10, y: 20 } })

const slotDe = (l: Layer) => (l.metadata as { slot?: unknown } | undefined)?.slot

describe('transportarSlots — transporta', () => {
  it('id igual + papel igual + nenhum bloco', () => {
    const r = transportarSlots([antiga('cta', comSlot(comp('cta'), 'cta-principal'))], [nova('cta', comp('cta'))])
    expect(slotDe(r.camadas[0])).toEqual({ id: 'cta-principal' })
    expect(r.avisos).toEqual([])
  })

  it('id igual + papel igual + bloco igual', () => {
    const r = transportarSlots([antiga('servico', comSlot(comp('servico', 'b1'), 'servico-endereco'))], [nova('servico', comp('servico', 'b1'))])
    expect(slotDe(r.camadas[0])).toEqual({ id: 'servico-endereco' })
    expect(r.avisos).toEqual([])
  })

  it('a camada nova mantém o resto dela (geometria, conteúdo e metadata.compositor da recomposição)', () => {
    const n = nova('servico', { ...comp('servico', 'b1'), groupId: 'g1' })
    const r = transportarSlots([antiga('servico', comSlot(comp('servico', 'b1'), 's'))], [n])
    expect(r.camadas[0]).toEqual({ ...n, metadata: { ...n.metadata, slot: { id: 's' } } })
    expect((r.camadas[0].metadata as Record<string, unknown>).compositor).toEqual({ papel: 'servico', bloco: 'b1' })
  })
})

describe('transportarSlots — não transporta (perda com aviso, nunca a camada errada)', () => {
  const casos: Array<[string, Layer, Layer, string]> = [
    ['id diferente', antiga('servico', comSlot(comp('servico'), 's')), nova('servico-2', comp('servico')), 'CAMADA_NOVA_NAO_ENCONTRADA'],
    ['papel diferente', antiga('x', comSlot(comp('cta'), 's')), nova('x', comp('apoio')), 'PAPEL_DIVERGENTE'],
    ['papel inválido do lado novo', antiga('x', comSlot(comp('cta'), 's')), nova('x', comp('ctaa')), 'PAPEL_DIVERGENTE'],
    ['bloco antigo existe e novo não', antiga('servico', comSlot(comp('servico', 'b1'), 's')), nova('servico', comp('servico')), 'BLOCO_DIVERGENTE'],
    ['bloco novo existe e antigo não', antiga('servico', comSlot(comp('servico'), 's')), nova('servico', comp('servico', 'b1')), 'BLOCO_DIVERGENTE'],
    ['blocos diferentes', antiga('servico', comSlot(comp('servico', 'b1'), 's')), nova('servico', comp('servico', 'b2')), 'BLOCO_DIVERGENTE'],
    ['slot antigo inválido', antiga('cta', comSlot(comp('cta'), 'slot com espaço')), nova('cta', comp('cta')), 'SLOT_ANTIGO_INVALIDO'],
    ['novo slot válido diferente', antiga('cta', comSlot(comp('cta'), 'a')), nova('cta', comSlot(comp('cta'), 'b')), 'SLOT_NOVO_PREEXISTENTE'],
    ['novo slot inválido', antiga('cta', comSlot(comp('cta'), 'a')), nova('cta', comSlot(comp('cta'), 7)), 'SLOT_NOVO_INVALIDO'],
  ]

  for (const [nome, a, n, codigo] of casos) {
    it(nome, () => {
      const r = transportarSlots([a], [n])
      expect(r.camadas[0]).toBe(n)
      expect(r.avisos.map((x) => x.codigo)).toEqual([codigo])
    })
  }

  it('transporte criaria slot duplicado → SLOT_DUPLICARIA, a camada que já tinha fica', () => {
    const antigas = [antiga('cta', comSlot(comp('cta'), 'principal'))]
    const novas = [nova('cta', comp('cta')), nova('apoio', comSlot(comp('apoio'), 'principal'))]
    const r = transportarSlots(antigas, novas)
    expect(r.camadas).toEqual(novas)
    expect(r.avisos.map((x) => x.codigo)).toEqual(['SLOT_DUPLICARIA'])
  })

  it('id repetido do lado novo (o compositor numera por grupo) → ID_REPETIDO, nenhum recebe', () => {
    const novas = [nova('servico', comp('servico')), nova('servico', comp('servico'))]
    const r = transportarSlots([antiga('servico', comSlot(comp('servico'), 's'))], novas)
    expect(r.camadas.map(slotDe)).toEqual([undefined, undefined])
    expect(r.avisos.map((x) => x.codigo)).toEqual(['ID_REPETIDO'])
  })

  it('id repetido do lado antigo → ID_REPETIDO', () => {
    const antigas = [antiga('servico', comSlot(comp('servico'), 'a')), antiga('servico', comSlot(comp('servico'), 'b'))]
    const r = transportarSlots(antigas, [nova('servico', comp('servico'))])
    expect(slotDe(r.camadas[0])).toBeUndefined()
    expect(r.avisos.every((x) => x.codigo === 'ID_REPETIDO')).toBe(true)
  })

  it('dois servicos com blocos trocados: cada slot fica no SEU bloco ou se perde — nunca troca', () => {
    const antigas = [antiga('servico', comSlot(comp('servico', 'endereco'), 'servico-endereco')), antiga('servico-2', comSlot(comp('servico', 'horario'), 'servico-horario'))]
    const novas = [nova('servico', comp('servico', 'horario')), nova('servico-2', comp('servico', 'endereco'))]
    const r = transportarSlots(antigas, novas)
    expect(r.camadas.map(slotDe)).toEqual([undefined, undefined])
    expect(r.avisos.map((x) => x.codigo)).toEqual(['BLOCO_DIVERGENTE', 'BLOCO_DIVERGENTE'])
  })

  it('avisos estruturados trazem a identidade, sem conteúdo', () => {
    const r = transportarSlots([antiga('x', comSlot(comp('cta'), 's'))], [nova('x', comp('apoio'))])
    expect(r.avisos).toEqual([{ codigo: 'PAPEL_DIVERGENTE', layerId: 'x', slotId: 's' }])
  })
})

describe('transportarSlots — idempotência e não regressão', () => {
  it('a nova já tem o mesmo slot → no-op estável, sem aviso', () => {
    const n = nova('cta', comSlot(comp('cta'), 'principal'))
    const r = transportarSlots([antiga('cta', comSlot(comp('cta'), 'principal'))], [n])
    expect(r.camadas[0]).toBe(n)
    expect(r.avisos).toEqual([])
    expect(transportarSlots([antiga('cta', comSlot(comp('cta'), 'principal'))], r.camadas).camadas).toEqual(r.camadas)
  })

  it('nenhuma camada antiga tem slot → as novas saem as MESMAS (mesmo array, byte a byte)', () => {
    const novas = [nova('headline', comp('headline', 'b1')), nova('bg-foto', {})]
    const antes = JSON.stringify(novas)
    const r = transportarSlots([antiga('headline', comp('headline', 'b1')), antiga('bg-foto', {})], novas)
    expect(r.camadas).toBe(novas)
    expect(JSON.stringify(r.camadas)).toBe(antes)
    expect(r.avisos).toEqual([])
  })

  it('não muta as entradas', () => {
    const antigas = [antiga('cta', comSlot(comp('cta'), 'principal'))]
    const novas = [nova('cta', comp('cta'))]
    const a = JSON.stringify(antigas)
    const n = JSON.stringify(novas)
    transportarSlots(antigas, novas)
    expect(JSON.stringify(antigas)).toBe(a)
    expect(JSON.stringify(novas)).toBe(n)
  })
})

describe('transportarSlots — bloco repartido: as linhas também identificam a camada (revisão adversarial B0, F2)', () => {
  const parte = (papel: string, bloco: string, linhas?: number[]) => ({ compositor: { papel, bloco, ...(linhas ? { linhas } : {}) } })

  it('mesmas linhas → transporta', () => {
    const r = transportarSlots([antiga('servico', comSlot(parte('servico', 'info', [0]), 'servico-horario'))], [nova('servico', parte('servico', 'info', [0]))])
    expect(slotDe(r.camadas[0])).toEqual({ id: 'servico-horario' })
  })

  it('as linhas trocaram de camada → nenhum slot segue a linha errada', () => {
    const antigas = [antiga('servico', comSlot(parte('servico', 'info', [0]), 'servico-horario')), antiga('servico-2', comSlot(parte('servico', 'info', [1]), 'servico-endereco'))]
    const novas = [nova('servico', parte('servico', 'info', [1])), nova('servico-2', parte('servico', 'info', [0]))]
    const r = transportarSlots(antigas, novas)
    expect(r.camadas.map(slotDe)).toEqual([undefined, undefined])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['LINHAS_DIVERGENTES', 'LINHAS_DIVERGENTES'])
  })

  it('só um lado declara linhas → não transporta', () => {
    const r = transportarSlots([antiga('servico', comSlot(parte('servico', 'info', [0]), 's'))], [nova('servico', parte('servico', 'info'))])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['LINHAS_DIVERGENTES'])
  })
})

describe('transportarSlots — slot duplicado na ORIGEM (codex review B0)', () => {
  it('duas camadas antigas com o mesmo slot: nenhuma ocorrência é transportada (nada pela ordem)', () => {
    const antigas = [antiga('a', comSlot(comp('cta'), 'principal')), antiga('b', comSlot(comp('apoio'), 'principal'))]
    const novas = [nova('a', comp('cta')), nova('b', comp('apoio'))]
    const r = transportarSlots(antigas, novas)
    expect(r.camadas).toBe(novas)
    expect(r.avisos.map((x) => x.codigo)).toEqual(['SLOT_ANTIGO_DUPLICADO', 'SLOT_ANTIGO_DUPLICADO'])
  })
})

describe('transportarSlots — exceção para a camada extra LIVRE (F1 da revisão adversarial B0)', () => {
  /** A marca que o compositor grava na camada extra livre: sem papel, com `extra` e o vínculo de bloco. */
  const livre = (extraId: unknown, vinculo: { bloco?: string; linhas?: number[] } = { bloco: 'nota', linhas: [0] }, extraExtra: Record<string, unknown> = {}) => ({
    compositor: { extra: { id: extraId, funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal', ...extraExtra }, ...vinculo },
  })

  it('1. mesmo layer.id, mesmo extra.id, mesmo bloco e linhas → transporta', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota'), 'nota-rodape'))], [nova('extra-nota', livre('nota'))])
    expect(slotDe(r.camadas[0])).toEqual({ id: 'nota-rodape' })
    expect(r.avisos).toEqual([])
  })

  it('2. mesmo layer.id, extra.id diferente → não transporta', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota'), 's'))], [nova('extra-nota', livre('outra'))])
    expect(slotDe(r.camadas[0])).toBeUndefined()
    expect(r.avisos.map((a) => a.codigo)).toEqual(['IDENTIDADE_EXTRA_DIVERGENTE'])
  })

  it('3. papel ausente nos dois lados mas SEM extra → não adivinha', () => {
    const r = transportarSlots([antiga('texto-1', comSlot({ compositor: { bloco: 'b1' } }, 's'))], [nova('texto-1', { compositor: { bloco: 'b1' } })])
    expect(slotDe(r.camadas[0])).toBeUndefined()
    expect(r.avisos.map((a) => a.codigo)).toEqual(['SEM_IDENTIDADE'])
  })

  it('3b. extra sem id (ou id vazio) → não usa a exceção', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre(''), 's'))], [nova('extra-nota', livre(''))])
    expect(slotDe(r.camadas[0])).toBeUndefined()
    expect(r.avisos.map((a) => a.codigo)).toEqual(['SEM_IDENTIDADE'])
  })

  it('4. um lado livre, o outro com papel válido → não transporta', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota'), 's'))], [nova('extra-nota', { compositor: { papel: 'apoio', bloco: 'nota', linhas: [0] } })])
    expect(slotDe(r.camadas[0])).toBeUndefined()
    expect(r.avisos.map((a) => a.codigo)).toEqual(['IDENTIDADE_EXTRA_DIVERGENTE'])
  })

  it('5. papel INVÁLIDO + extra.id igual → NÃO usa a exceção', () => {
    const invalido = { compositor: { papel: 'livree', extra: { id: 'nota', funcao: 'livre' }, bloco: 'nota', linhas: [0] } }
    const r = transportarSlots([antiga('extra-nota', comSlot(invalido, 's'))], [nova('extra-nota', invalido)])
    expect(slotDe(r.camadas[0])).toBeUndefined()
    expect(r.avisos.map((a) => a.codigo)).toEqual(['PAPEL_DIVERGENTE'])
  })

  it('5b. extra com função que não é livre não usa a exceção', () => {
    const r = transportarSlots([antiga('extra-x', comSlot(livre('x', undefined, { funcao: 'servico' }), 's'))], [nova('extra-x', livre('x', undefined, { funcao: 'servico' }))])
    expect(slotDe(r.camadas[0])).toBeUndefined()
  })

  it('6. mesmo extra.id, bloco diferente → não transporta', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota', { bloco: 'nota', linhas: [0] }), 's'))], [nova('extra-nota', livre('nota', { bloco: 'outro', linhas: [0] }))])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['BLOCO_DIVERGENTE'])
  })

  it('7. mesmo extra.id, linhas diferentes → não transporta', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota', { bloco: 'nota', linhas: [0] }), 's'))], [nova('extra-nota', livre('nota', { bloco: 'nota', linhas: [1] }))])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['LINHAS_DIVERGENTES'])
  })

  it('8. slot duplicado na origem continua bloqueando', () => {
    const antigas = [antiga('extra-a', comSlot(livre('a'), 'dup')), antiga('extra-b', comSlot(livre('b'), 'dup'))]
    const r = transportarSlots(antigas, [nova('extra-a', livre('a')), nova('extra-b', livre('b'))])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['SLOT_ANTIGO_DUPLICADO', 'SLOT_ANTIGO_DUPLICADO'])
  })

  it('9. slot novo preexistente continua vencendo', () => {
    const n = nova('extra-nota', comSlot(livre('nota'), 'slot-novo'))
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota'), 'slot-velho'))], [n])
    expect(r.camadas[0]).toBe(n)
    expect(r.avisos.map((a) => a.codigo)).toEqual(['SLOT_NOVO_PREEXISTENTE'])
  })

  it('o herdaDe pode mudar (estilo) sem mudar a identidade', () => {
    const r = transportarSlots([antiga('extra-nota', comSlot(livre('nota', undefined, { herdaDe: 'apoio' }), 's'))], [nova('extra-nota', livre('nota', undefined, { herdaDe: 'servico' }))])
    expect(slotDe(r.camadas[0])).toEqual({ id: 's' })
  })
})
