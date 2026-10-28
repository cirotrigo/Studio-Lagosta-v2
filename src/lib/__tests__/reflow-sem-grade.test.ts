/**
 * G4.4 · célula de grade de fotos nunca é empurrada pelo reflow — testes INDEPENDENTES dos dois caminhos:
 * - servidor: `reflowComboStack` e `reflowLayersAfterFill` (bake da arte rápida, render de slots);
 * - editor: `irmaosQueAcompanham`, o filtro que o laço do texto auto-expandido do `konva-editable-text` chama.
 * Em todos, os OUTROS membros do grupo continuam fluindo. O componente Konva do texto não é montado.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { irmaosQueAcompanham, reflowComboStack, reflowLayersAfterFill } from '@/lib/combo-stack-reflow'
import { conferirGrade } from '@/lib/grades/conferir'
import { celula } from '@/lib/grades/__tests__/fixtures'

const texto = (id: string, y: number, height: number, grupo = 'g') =>
  ({ id, name: id, type: 'text', content: id, position: { x: 0, y }, size: { width: 300, height }, metadata: { groupId: grupo } }) as unknown as Layer
/** Célula que (por dado colado/importado) divide o groupId com textos: a geometria dela é a da grade */
const cel = (id: string, y: number, grupo = 'g') => celula(id, { id: grupo, layout: '1-celula', caixa: { x: 0, y, w: 300, h: 200 } }, 0, { x: 0, y, w: 300, h: 200 }, { metadata: { grade: { id: grupo, layout: '1-celula', versao: 1, celula: 0, espacamento: 10, raio: 0, caixa: { x: 0, y, w: 300, h: 200 } }, groupId: grupo } } as Partial<Layer>)
/** O texto `topo` mede 40 px a mais do que a caixa gravada (cresceu) */
const medir = (l: Layer) => (l.id === 'topo' ? (l.size?.height ?? 0) + 40 : (l.size?.height ?? 0))

describe('servidor: reflowComboStack / reflowLayersAfterFill', () => {
  const pilha = () => [texto('topo', 0, 100), cel('foto', 120), texto('rodape', 340, 50)]

  it('o texto que cresce empurra o rodapé (+40) e NÃO a célula de grade, que fica coerente', () => {
    const patches = reflowComboStack(pilha(), medir)
    expect(patches.find((p) => p.id === 'foto')).toBeUndefined()
    expect(patches.find((p) => p.id === 'rodape')).toEqual({ id: 'rodape', y: 380 })
    expect(patches.find((p) => p.id === 'topo')).toEqual({ id: 'topo', height: 140 })
  })

  it('pós-preenchimento: o mesmo, e a grade sai com conferirGrade limpo', () => {
    const r = reflowLayersAfterFill(pilha(), ['topo'], medir)
    expect(r.find((l) => l.id === 'foto')!.position).toEqual({ x: 0, y: 120 })
    expect(r.find((l) => l.id === 'rodape')!.position!.y).toBe(380)
    expect(conferirGrade(r.filter((l) => l.id === 'foto'))).toEqual([])
  })

  it('sem célula no grupo, nada muda no comportamento (controle)', () => {
    const r = reflowComboStack([texto('topo', 0, 100), texto('meio', 120, 50), texto('rodape', 340, 50)], medir)
    expect(r).toEqual([{ id: 'topo', height: 140 }, { id: 'meio', y: 160 }, { id: 'rodape', y: 380 }])
  })
})

describe('editor: irmaosQueAcompanham (o laço do texto auto-expandido)', () => {
  it('irmãos abaixo do bottom original acompanham; a célula de grade fica de fora', () => {
    const layers = [texto('topo', 0, 100), cel('foto', 120), texto('rodape', 340, 50), texto('lado', 0, 50), texto('outro-grupo', 400, 50, 'h')]
    expect(irmaosQueAcompanham(layers, layers[0], 100).map((l) => l.id)).toEqual(['rodape'])
  })

  it('sem célula: os irmãos abaixo, como antes (colunas na mesma faixa e outro grupo não)', () => {
    const layers = [texto('topo', 0, 100), texto('meio', 120, 50), texto('lado', 50, 50), texto('rodape', 340, 50)]
    expect(irmaosQueAcompanham(layers, layers[0], 100).map((l) => l.id)).toEqual(['meio', 'rodape'])
    expect(irmaosQueAcompanham(layers, { ...layers[0], metadata: {} } as Layer, 100)).toEqual([])
  })
})
