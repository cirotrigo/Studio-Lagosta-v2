import { describe, expect, it } from 'vitest'
import { diffDeCamadas, diffVazio, fundirDiffsDeCamadas } from '../diff-camadas'

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
    const r = diffDeCamadas([titulo, foto], JSON.stringify([titulo, foto]))
    expect(r).toEqual({ ilegivel: false, reordenou: false, camadas: [] })
    expect(diffVazio(r)).toBe(true)
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

  it('reordenada: vira `reordenou`, nunca `order` por camada', () => {
    const r = diffDeCamadas([titulo, foto], [{ ...foto, order: 1 }, { ...titulo, order: 0 }])
    expect(r).toEqual({ ilegivel: false, reordenou: true, camadas: [] })
    expect(diffVazio(r)).toBe(false)
  })

  it('apagar no meio renumera as outras sem acusar alteração', () => {
    const a = { id: 'a', type: 'text', name: 'A', order: 0 }
    const b = { id: 'b', type: 'text', name: 'B', order: 1 }
    const c = { id: 'c', type: 'text', name: 'C', order: 2 }
    const r = diffDeCamadas([a, b, c], [a, { ...c, order: 1 }])
    expect(r.reordenou).toBe(false)
    expect(r.camadas).toEqual([{ id: 'b', tipo: 'text', nome: 'B', situacao: 'apagada' }])
  })

  it('`text` espelhado em `content` sai só como `content`', () => {
    const t = { ...titulo, text: titulo.content }
    const r = diffDeCamadas([t], [{ ...t, content: 'Novo', text: 'Novo' }])
    expect(r.camadas[0].caminhos).toEqual(['content'])
  })

  it('id repetido no depois: vale a primeira ocorrência', () => {
    const r = diffDeCamadas([titulo], [{ ...titulo, visible: false }, { ...titulo, name: 'Cópia' }])
    expect(r.camadas).toEqual([{ id: 't1', tipo: 'text', nome: 'Título', situacao: 'alterada', caminhos: ['visible'] }])
  })

  it('criada e apagada', () => {
    const r = diffDeCamadas([titulo, foto], [titulo, { id: 'n1', type: 'shape', name: 'Faixa' }])
    expect(r.camadas).toEqual([
      { id: 'n1', tipo: 'shape', nome: 'Faixa', situacao: 'criada' },
      { id: 'f1', tipo: 'image', nome: 'Foto', situacao: 'apagada' },
    ])
  })

  it('lado ilegível nunca vira "não mudou"', () => {
    const r = diffDeCamadas('{quebrado', [titulo])
    expect(r).toEqual({ ilegivel: true, reordenou: false, camadas: [] })
    expect(diffVazio(r)).toBe(true)
  })

  it('aceita a dupla codificação do banco', () => {
    const dupla = JSON.stringify(JSON.stringify([titulo]))
    expect(diffDeCamadas(dupla, [{ ...titulo, visible: false }]).camadas[0].caminhos).toEqual(['visible'])
  })
})

describe('fundirDiffsDeCamadas (o balde de 10 min)', () => {
  it('soma caminhos, criada+alterada continua criada, criada+apagada some', () => {
    const primeiro = diffDeCamadas([titulo, foto], [{ ...titulo, content: 'x' }, foto, { id: 'n1', type: 'shape', name: 'Faixa' }])
    const segundo = diffDeCamadas(
      [{ ...titulo, content: 'x' }, foto, { id: 'n1', type: 'shape', name: 'Faixa' }],
      [{ ...titulo, content: 'x', position: { x: 1, y: 160 } }, { id: 'n1', type: 'shape', name: 'Faixa', visible: false }],
    )
    const r = fundirDiffsDeCamadas(primeiro, segundo)
    expect(r.camadas).toEqual([
      { id: 't1', tipo: 'text', nome: 'Título', situacao: 'alterada', caminhos: ['content', 'position.x'] },
      { id: 'n1', tipo: 'shape', nome: 'Faixa', situacao: 'criada' },
      { id: 'f1', tipo: 'image', nome: 'Foto', situacao: 'apagada' },
    ])
    const apagaACriada = diffDeCamadas([{ id: 'n1', type: 'shape', name: 'Faixa' }], [])
    expect(fundirDiffsDeCamadas(primeiro, apagaACriada).camadas.map((c) => c.id)).toEqual(['t1'])
  })

  it('linha anterior sem lista (truncada) recomeça do novo; reordenou acumula', () => {
    const novo = diffDeCamadas([titulo], [{ ...titulo, visible: false }])
    const r = fundirDiffsDeCamadas({ _truncado: true, reordenou: true } as never, novo)
    expect(r).toEqual({ ...novo, reordenou: true })
  })
})
