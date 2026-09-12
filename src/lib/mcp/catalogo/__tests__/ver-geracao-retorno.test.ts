import { describe, expect, it } from 'vitest'
import { avisosDoCompositor, montarRetornoDaPagina } from '../ver-geracao-retorno'

const pagina = { id: 'pg1', name: 'Qua 09/09 · 10:00 · gestão', templateId: 412, isTemplate: false }
const app = 'https://studio.exemplo'

describe('ver-geracao devolve a página e os avisos do compositor', () => {
  it('concluída com página: pageId, editUrl do template ATUAL e como agendar pela página', () => {
    const r = montarRetornoDaPagina({ fieldValues: { pageId: 'pg1', composicao: { avisos: ['apoio: fonte reduzida a 92%'] } }, pagina, appUrl: app, projectId: 8, concluida: true })
    expect(r.pageId).toBe('pg1')
    expect(r.editUrl).toBe('https://studio.exemplo/templates/412/editor?pageId=pg1')
    expect(r.comoAgendar).toContain('pageId "pg1"')
    expect(r.avisosDoCompositor).toEqual(['apoio: fonte reduzida a 92%'])
  })

  it('a página mudou de pasta: o editUrl segue o templateId ATUAL, não o gravado na arte', () => {
    const r = montarRetornoDaPagina({ fieldValues: { pageId: 'pg1', templateId: 300 }, pagina: { ...pagina, templateId: 455 }, appUrl: app, projectId: 8, concluida: true })
    expect(r.editUrl).toContain('/templates/455/')
  })

  it('pendente: página e link, mas ainda sem "como agendar"', () => {
    const r = montarRetornoDaPagina({ fieldValues: { pageId: 'pg1' }, pagina, appUrl: app, projectId: 8, concluida: false })
    expect(r.editUrl).toBeDefined()
    expect(r.comoAgendar).toBeUndefined()
  })

  it('sem página (arte de IA ou upload): nada de pageId, e avisos só se existirem', () => {
    expect(montarRetornoDaPagina({ fieldValues: { track: 'imagem' }, pagina: null, appUrl: app, projectId: 8, concluida: true })).toEqual({})
  })

  it('página apagada depois: o id fica, com a marca, sem link inventado', () => {
    const r = montarRetornoDaPagina({ fieldValues: { pageId: 'pg-sumida' }, pagina: null, appUrl: app, projectId: 8, concluida: true })
    expect(r).toEqual({ pageId: 'pg-sumida', paginaApagada: true })
  })

  it('página-modelo não recebe "como agendar" (modelo não vira post por ali)', () => {
    const r = montarRetornoDaPagina({ fieldValues: { pageId: 'pg1' }, pagina: { ...pagina, isTemplate: true }, appUrl: app, projectId: 8, concluida: true })
    expect(r.comoAgendar).toBeUndefined()
  })

  it('avisos do compositor: só strings, e composicao malformada não derruba', () => {
    expect(avisosDoCompositor({ composicao: { avisos: ['a', '', 3, null] } })).toEqual(['a'])
    expect(avisosDoCompositor({ composicao: 'x' })).toEqual([])
    expect(avisosDoCompositor(null)).toEqual([])
  })
})
