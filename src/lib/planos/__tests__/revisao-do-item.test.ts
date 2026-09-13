/**
 * A revisão de conteúdo do item de plano (pré-revisão C11-1a…1b do PR 11): o
 * token `itemRevisao` que o ver-plano devolve e o caminho do plano confere.
 * Estável fora do que vira spec; muda com tudo o que vira spec.
 */
import { describe, expect, it } from 'vitest'
import { VERSAO_DA_REVISAO_DO_ITEM, revisaoDoItem } from '../revisao-do-item'

const item = {
  id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', ordem: 0, updatedAt: new Date('2026-09-08T12:00:00.000Z'),
  copyProposta: ['Costela no bafo', 'Vem pra cá'],
  copyAutoral: {
    versao: 1,
    origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
    blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Costela no bafo'] }, { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] }],
    revisoes: [],
  },
  fotoDriveId: 'drive-1', fotoUrl: null, fotoCandidatas: [{ driveFileId: 'drive-1', vaga: 'score' }],
  formato: 'story', quando: new Date('2026-09-14T22:00:00.000Z'), tema: 'Rodízio',
  legenda: 'Hoje tem costela.', via: 'compor', sourcePageId: null, direcao: null, ajusteDaFoto: null, referencias: null,
  clienteProjectId: null, escopo: 'ROTINA', campaignId: null, generationId: null, pageId: null, postId: null, erro: null, motivoReprovacao: null,
}
const r0 = revisaoDoItem(item)

describe('revisaoDoItem', () => {
  it('é um token curto e versionado', () => {
    expect(r0).toMatch(new RegExp(`^${VERSAO_DA_REVISAO_DO_ITEM}:[0-9a-f]{32}$`))
    expect(revisaoDoItem({ ...item })).toBe(r0)
  })

  it('NÃO muda com o que não vira spec: legenda, via, direção, referências, cliente citado, escopo, campanha, status, vínculos, updatedAt, e a autoria e o histórico do contrato', () => {
    const fora: Array<[string, Record<string, unknown>]> = [
      ['legenda', { legenda: 'Outra legenda' }],
      ['via', { via: 'ia' }],
      ['direcao', { direcao: 'mais escuro' }],
      ['ajusteDaFoto', { ajusteDaFoto: 'cortar ao meio' }],
      ['referencias', { referencias: [{ generationId: 'g9' }] }],
      ['clienteProjectId', { clienteProjectId: 3 }],
      ['escopo', { escopo: 'CAMPANHA' }],
      ['campaignId', { campaignId: 'camp-1' }],
      ['sourcePageId', { sourcePageId: 'page-9' }],
      ['status na-fila', { status: 'na-fila' }],
      ['status erro', { status: 'erro', erro: 'falhou' }],
      ['vínculos', { generationId: 'g1', pageId: 'p1', postId: 'post-1' }],
      ['updatedAt', { updatedAt: new Date('2026-09-13T00:00:00.000Z') }],
      ['motivoReprovacao', { motivoReprovacao: 'não gostei' }],
      ['carimbo do contrato', { copyAutoral: { ...item.copyAutoral, origem: { ...item.copyAutoral.origem, em: '2026-09-12T11:00:00.000Z' } } }],
      ['histórico do contrato', { copyAutoral: { ...item.copyAutoral, revisoes: [{ em: '2026-09-12T11:00:00.000Z', autor: 'equipe', motivo: 'x', blocos: ['cta'] }] } }],
    ]
    for (const [nome, patch] of fora) expect(revisaoDoItem({ ...item, ...patch }), nome).toBe(r0)
  })

  it('MUDA com o que vira spec: a copy (lista e blocos do contrato), a foto, as candidatas, o formato, o horário e o tema', () => {
    const dentro: Array<[string, Record<string, unknown>]> = [
      ['copyProposta', { copyProposta: ['Costela no bafo', 'Reserve já'] }],
      ['blocos do contrato', { copyAutoral: { ...item.copyAutoral, blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Costela', 'no bafo'] }] } }],
      ['fotoDriveId', { fotoDriveId: 'drive-2' }],
      ['fotoUrl', { fotoDriveId: null, fotoUrl: 'https://x/foto.jpg' }],
      ['fotoCandidatas', { fotoCandidatas: [{ driveFileId: 'drive-3', vaga: 'score' }] }],
      ['formato', { formato: 'feed' }],
      ['quando', { quando: new Date('2026-09-15T22:00:00.000Z') }],
      ['tema', { tema: 'Happy hour' }],
    ]
    for (const [nome, patch] of dentro) expect(revisaoDoItem({ ...item, ...patch }), nome).not.toBe(r0)
  })

  it('ausente e nulo são o mesmo valor, a data vale pelo instante, e a ordem das chaves não é diferença', () => {
    const { legenda: _legenda, fotoUrl: _fotoUrl, ...semCampos } = item
    expect(revisaoDoItem(semCampos)).toBe(r0)
    expect(revisaoDoItem({ ...item, quando: '2026-09-14T22:00:00.000Z' })).toBe(r0)
    const invertido = Object.fromEntries(Object.entries(item).reverse())
    expect(revisaoDoItem(invertido)).toBe(r0)
    expect(revisaoDoItem({})).toBe(revisaoDoItem({ copyProposta: null, copyAutoral: null, fotoDriveId: null, fotoUrl: null, fotoCandidatas: null, formato: null, quando: null, tema: null }))
  })
})
