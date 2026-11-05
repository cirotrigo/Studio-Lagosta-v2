import { describe, expect, it } from 'vitest'
import { diffDeCamadas } from '../diff-camadas'

const titulo = {
  id: 't1',
  type: 'text',
  name: 'Título',
  order: 1,
  content: 'Rodízio de quinta',
  position: { x: 64, y: 160 },
  style: { fontSize: 72, textAlign: 'left' },
  effects: { background: { enabled: false, color: '#000' } },
}
const foto = { id: 'f1', type: 'image', name: 'Foto', order: 0, fileUrl: 'https://blob/x.jpg', position: { x: 0, y: 0 } }

describe('diffDeCamadas', () => {
  it('camadas idênticas não entram (diff vazio)', () => {
    expect(diffDeCamadas([titulo, foto], JSON.stringify([titulo, foto]))).toEqual({ ilegivel: false, camadas: [] })
  })

  it('alterada: lista só os caminhos, com o aninhado completo', () => {
    const depois = {
      ...titulo,
      position: { x: 80, y: 160 },
      effects: { background: { enabled: true, color: '#000' } },
    }
    const r = diffDeCamadas([titulo], [depois])
    expect(r.camadas).toEqual([
      { id: 't1', tipo: 'text', nome: 'Título', situacao: 'alterada', caminhos: ['effects.background.enabled', 'position.x'] },
    ])
  })

  it('texto alterado vira só o caminho `content`, sem o valor', () => {
    const r = diffDeCamadas([titulo], [{ ...titulo, content: 'Rodízio de sexta' }])
    expect(r.camadas[0].caminhos).toEqual(['content'])
    expect(JSON.stringify(r)).not.toContain('sexta')
  })

  it('URL trocada não aparece no diff', () => {
    const r = diffDeCamadas([foto], [{ ...foto, fileUrl: 'https://blob/y.jpg' }])
    expect(r.camadas[0].caminhos).toEqual(['fileUrl'])
    expect(JSON.stringify(r)).not.toContain('blob')
  })

  it('chave nova num objeto aninhado é caminho; array é folha', () => {
    const r = diffDeCamadas(
      [{ ...titulo, style: { ...titulo.style, richText: [{ t: 'a' }] } }],
      [{ ...titulo, style: { ...titulo.style, richText: [{ t: 'b' }], fontWeight: 700 } }],
    )
    expect(r.camadas[0].caminhos).toEqual(['style.fontWeight', 'style.richText'])
  })

  it('reordenada: `order` é caminho', () => {
    const r = diffDeCamadas([titulo, foto], [{ ...foto, order: 1 }, { ...titulo, order: 0 }])
    expect(r.camadas.map((c) => [c.id, c.caminhos])).toEqual([
      ['f1', ['order']],
      ['t1', ['order']],
    ])
  })

  it('criada e apagada', () => {
    const r = diffDeCamadas([titulo, foto], [titulo, { id: 'n1', type: 'shape', name: 'Faixa' }])
    expect(r.camadas).toEqual([
      { id: 'n1', tipo: 'shape', nome: 'Faixa', situacao: 'criada' },
      { id: 'f1', tipo: 'image', nome: 'Foto', situacao: 'apagada' },
    ])
  })

  it('lado ilegível nunca vira "não mudou"', () => {
    expect(diffDeCamadas('{quebrado', [titulo])).toEqual({ ilegivel: true, camadas: [] })
  })

  it('aceita a dupla codificação do banco', () => {
    const dupla = JSON.stringify(JSON.stringify([titulo]))
    expect(diffDeCamadas(dupla, [{ ...titulo, visible: false }]).camadas[0].caminhos).toEqual(['visible'])
  })
})
