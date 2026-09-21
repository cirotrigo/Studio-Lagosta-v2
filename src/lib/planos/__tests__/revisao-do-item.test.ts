/**
 * A revisão de conteúdo do item de plano (pré-revisão C11-1a…1b do PR 11): o
 * token `itemRevisao` que o ver-plano devolve e o caminho do plano confere.
 * Estável fora do que vira spec; muda com tudo o que vira spec.
 */
import { describe, expect, it } from 'vitest'
import { VERSAO_DA_REVISAO_DO_ITEM, confrontarRevisaoGravada, revisaoDoItem } from '../revisao-do-item'

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

/**
 * PR11-F01 — a revisão que a main ANTERIOR ao PR 11 gravava no payload do job.
 * As duas strings são escritas À MÃO, no formato exato da main
 * (`json-stable-stringify`: chaves ordenadas — `formato` antes de `foto` —,
 * data em ISO, `null` mantido), para o item acima; nunca geradas pelo código
 * novo. Conferidas byte a byte contra a expressão da própria main avaliada
 * sobre o mesmo item (origin/main 6405bfd5 para a de 15; 6892e362 para a de
 * 14) — registrado em PR-11/achados-e-resolucao.md.
 */
const LEGADA_15 = '{"ajuste":null,"campanha":null,"candidatas":[{"driveFileId":"drive-1","vaga":"score"}],"cliente":null,"copy":["Costela no bafo","Vem pra cá"],"direcao":null,"escopo":"ROTINA","formato":"story","foto":["drive-1",null],"legenda":"Hoje tem costela.","modelo":null,"quando":"2026-09-14T22:00:00.000Z","referencias":null,"tema":"Rodízio","via":"compor"}'
const LEGADA_14 = '{"ajuste":null,"campanha":null,"cliente":null,"copy":["Costela no bafo","Vem pra cá"],"direcao":null,"escopo":"ROTINA","formato":"story","foto":["drive-1",null],"legenda":"Hoje tem costela.","modelo":null,"quando":"2026-09-14T22:00:00.000Z","referencias":null,"tema":"Rodízio","via":"compor"}'

describe('confrontarRevisaoGravada — a revisão LEGADA da main (PR11-F01)', () => {
  const confrontar = (gravada: string | undefined, patch: Record<string, unknown> = {}) => confrontarRevisaoGravada(gravada, revisaoDoItem({ ...item, ...patch }), { ...item, ...patch })

  it('antes: a string legada nunca era igual ao rev1 — depois: o item intocado confere, nas duas versões', () => {
    expect(LEGADA_15).not.toBe(r0)
    expect(confrontar(LEGADA_15)).toBe('igual')
    expect(confrontar(LEGADA_14)).toBe('igual')
  })

  it('mudança REAL de conteúdo continua diferente: a copy, a foto, as candidatas, o formato, o horário e o tema', () => {
    const dentro: Array<[string, Record<string, unknown>]> = [
      ['copyProposta', { copyProposta: ['Costela no bafo', 'Reserve já'] }],
      ['fotoDriveId', { fotoDriveId: 'drive-2' }],
      ['fotoUrl', { fotoDriveId: null, fotoUrl: 'https://x/foto.jpg' }],
      ['fotoCandidatas', { fotoCandidatas: [{ driveFileId: 'drive-3', vaga: 'score' }] }],
      ['formato', { formato: 'feed' }],
      ['quando', { quando: new Date('2026-09-15T22:00:00.000Z') }],
      ['quando, 1 ms', { quando: new Date('2026-09-14T22:00:00.001Z') }],
      ['tema', { tema: 'Happy hour' }],
    ]
    for (const [nome, patch] of dentro) expect(confrontar(LEGADA_15, patch), nome).toBe('diferente')
  })

  it('os nove campos que o rev1 exclui de propósito NÃO contam no legado (C11-1b; campanha e escopo fora do token)', () => {
    const fora: Array<[string, Record<string, unknown>]> = [
      ['legenda', { legenda: 'Outra legenda' }], ['via', { via: 'ia' }], ['modelo', { sourcePageId: 'page-9' }],
      ['direcao', { direcao: 'mais escuro' }], ['ajuste', { ajusteDaFoto: 'cortar ao meio' }], ['referencias', { referencias: [{ generationId: 'g9' }] }],
      ['cliente', { clienteProjectId: 3 }], ['escopo', { escopo: 'CAMPANHA' }], ['campanha', { campaignId: 'camp-1' }],
    ]
    for (const [nome, patch] of fora) expect(confrontar(LEGADA_15, patch), nome).toBe('igual')
  })

  it('limites DECLARADOS: a de 14 chaves não enxerga as candidatas, e nenhuma enxerga o contrato (estrutura) — o texto dele segue coberto pelo espelho', () => {
    expect(confrontar(LEGADA_14, { fotoCandidatas: [{ driveFileId: 'drive-3', vaga: 'score' }] })).toBe('igual')
    expect(confrontar(LEGADA_14, { copyProposta: ['Costela no bafo', 'Reserve já'] })).toBe('diferente')
    const soEstrutura = { copyAutoral: { ...item.copyAutoral, blocos: item.copyAutoral.blocos.map((b) => (b.id === 'cta' ? { ...b, funcao: 'apoio' } : b)) } }
    expect(confrontar(LEGADA_15, soEstrutura)).toBe('igual')
  })

  it('SÓ os dois conjuntos exatos de chaves são legado; qualquer outra forma vale como a ausência (desconhecido), nunca igual por palpite', () => {
    const com = (extra: string) => LEGADA_15.replace('{"ajuste"', `{${extra},"ajuste"`)
    const outras = [
      ['chave a mais', com('"aa":1')],
      ['chave a menos', LEGADA_15.replace('"via":"compor"', '"x":1').replace(',"x":1', '')],
      ['sem legenda (13 conteúdos)', LEGADA_14.replace('"legenda":"Hoje tem costela.",', '')],
      ['lista', '[1,2]'],
      ['não é JSON', 'revisao-antiga'],
      ['vazia', ''],
      ['JSON nulo', 'null'],
    ]
    for (const [nome, gravada] of outras) expect(confrontar(gravada), nome).toBe('desconhecido')
  })

  it('a família nova continua literal: rev igual é igual, rev de outro conteúdo ou de outra versão é diferente, nada gravado é desconhecido', () => {
    expect(confrontar(r0)).toBe('igual')
    expect(confrontar(revisaoDoItem({ ...item, tema: 'Outro' }))).toBe('diferente')
    expect(confrontar(`rev2:${'f'.repeat(32)}`)).toBe('diferente')
    expect(confrontar(undefined)).toBe('desconhecido')
  })
})
