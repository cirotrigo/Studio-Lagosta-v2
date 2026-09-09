import { describe, expect, it } from 'vitest'
import { montarSpecDoItem } from '../spec-do-item'
const item = { id: 'i', planoId: 'p', formato: 'story', copyProposta: ['Quarta no Quintal', 'Das 11h às 23h'], fotoCandidatas: [{ driveFileId: 'a', vaga: 'score' }, { driveFileId: 'b', vaga: 'score' }] }
const paginas = [{ formato: 'story' as const, papeis: ['headline' as const, 'headline2' as const, 'servico' as const] }]
describe('ponte semanal para seleção de composição', () => {
  it('passa candidatas persistidas em ordem, mantendo foto explícita', () => {
    const r = montarSpecDoItem({ ...item, fotoDriveId: 'escolhida' }, 2, paginas)
    expect(r.selecaoExperimental).toBeUndefined(); expect(r.fotosCandidatas).toEqual(['a', 'b']); expect(r.foto).toEqual({ driveFileId: 'escolhida' })
    expect(r.blocos.map((b) => b.papel)).toEqual(['headline', 'servico'])
  })
  it('sem foto selecionada permite avaliar alternativas, sem inventar foto', () => {
    expect(montarSpecDoItem(item, 2, paginas).foto).toBeUndefined()
    const r = montarSpecDoItem({ ...item, fotoUrl: 'https://example.com/foto.jpg' }, 2, paginas)
    expect(r.foto?.url).toBe('https://example.com/foto.jpg')
  })
  it('catálogo de candidatas antigo/ilegível mantém contrato sem seleção', () => {
    expect(montarSpecDoItem({ ...item, fotoCandidatas: null }, 2, paginas).fotosCandidatas).toBeUndefined()
  })
  it('serviço e condições excedentes não somem antes de enfileirar', () => {
    expect(() => montarSpecDoItem(item, 2, [{ formato: 'story', papeis: ['headline'] }])).toThrow(/preserve o serviço/)
    expect(() => montarSpecDoItem({ ...item, copyProposta: ['Quarta', 'Somente consumo no local', 'Até acabar o estoque'] }, 2, paginas)).toThrow(/condições obrigatórias/)
  })
})

it('ativação semanal exige opt-in separado das candidatas', () => {
  expect(montarSpecDoItem(item, 2, paginas, true).selecaoExperimental).toBe(true)
  expect(montarSpecDoItem(item, 2, paginas, false).selecaoExperimental).toBeUndefined()
})
