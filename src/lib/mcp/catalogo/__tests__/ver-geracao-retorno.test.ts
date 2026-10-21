import { describe, expect, it } from 'vitest'
import { AVISO_DO_GATE, avisosDoCompositor, copyDaArte, falhaDaGeracao, montarRetornoDaPagina, type PaginaDaGeracao } from '../ver-geracao-retorno'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { NAO_CONFERIDO_PELA_IDENTIDADE } from '@/lib/creatives/revisao/gate-registro'
import { AGORA, PAGINA_LIMPA, VINCULO, camadasDaPaginaLimpa, decidirOk, entradaDa } from '@/lib/creatives/revisao/__tests__/suporte/pagina-limpa'
import { decidirEMontarRegistro } from '@/lib/creatives/revisao/gate-registro'
import { medida } from '@/lib/creatives/revisao/__tests__/suporte/corpus-do-gate'

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

describe('a falha só promete orçamento quando ele veio', () => {
  it('compositor com errorDetails.orcamento: devolve os detalhes e diz onde estão', () => {
    const f = falhaDaGeracao({ fieldValues: { error: 'texto não cabe', errorDetails: { orcamento: { headline: 18 } } }, doCompositor: true, ehMelhoria: false })
    expect(f.detalhes).toEqual({ orcamento: { headline: 18 } })
    expect(f.mensagem).toContain('detalhes.orcamento')
  })
  it('compositor sem detalhes: não promete orçamento', () => {
    const f = falhaDaGeracao({ fieldValues: { error: 'assinatura incompleta' }, doCompositor: true, ehMelhoria: false })
    expect(f.detalhes).toBeUndefined()
    expect(f.mensagem).not.toContain('orçamento')
  })
  it('melhoria e geração nova têm mensagens próprias', () => {
    expect(falhaDaGeracao({ fieldValues: {}, doCompositor: false, ehMelhoria: true }).mensagem).toContain('melhoria')
    expect(falhaDaGeracao({ fieldValues: {}, doCompositor: false, ehMelhoria: false }).mensagem).toContain('geração falhou')
  })
})

describe('a copy da arte de IA (sem camadas) — escrita × enviada × lida (F1, PR 5)', () => {
  const original = { versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat' }, blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake', 'em dobro'] }], revisoes: [] }
  it('com enviada e conferência: comparável por VISÃO, sem desenhada, lacuna das camadas preservada', () => {
    const c = copyDaArte({ copyAutoral: { original, enviada: ['MILK-SHAKE\nEM DOBRO'], comparavel: true, lacunas: ['a arte não tem camadas'], conferencia: { lida: ['MILK-SHAKE EM DOBRO'], faltando: [], passou: true, regua: 'copy' } } })
    expect(c?.comparavel).toBe(true)
    expect(c?.comparadoPor).toBe('visao')
    expect(c?.enviada).toEqual(['MILK-SHAKE\nEM DOBRO'])
    expect(c?.desenhada).toEqual([])
    expect(c?.conferencia).toEqual({ lida: ['MILK-SHAKE EM DOBRO'], faltando: [], passou: true, regua: 'copy' })
    expect(c?.lacunas).toEqual(['a arte não tem camadas'])
  })
  it('enviada sem conferência (a visão não rodou): NÃO é comparável, e continua declarado por visão', () => {
    const c = copyDaArte({ copyAutoral: { original, enviada: ['x'], comparavel: true, lacunas: ['a arte não tem camadas'], conferencia: { lida: [], faltando: [], passou: null, regua: 'nenhuma (visão indisponível)' } } })
    expect(c?.comparavel).toBe(false)
    expect(c?.comparadoPor).toBe('visao')
  })
  it('com efetiva (camadas) continua como antes: comparado por camadas', () => {
    const c = copyDaArte({ copyAutoral: { original, efetiva: original, comparavel: true, lacunas: [] } })
    expect(c?.comparadoPor).toBe('camadas')
    expect(c?.comparavel).toBe(true)
    expect(c?.enviada).toBeUndefined()
  })
})

describe('CP5b — H11: o bloco `gate` de ver-geracao é auditoria rotulada, nunca um veredito inventado', () => {
  const PROJETO = 8
  const paginaCompleta: PaginaDaGeracao = { ...pagina, id: PAGINA_LIMPA.id, name: PAGINA_LIMPA.name, tags: PAGINA_LIMPA.tags, width: PAGINA_LIMPA.width, height: PAGINA_LIMPA.height, background: PAGINA_LIMPA.background, layers: PAGINA_LIMPA.layers, copyAutoral: PAGINA_LIMPA.copyAutoral }
  const registro = () => JSON.parse(JSON.stringify(decidirOk().registro)) as Record<string, unknown>
  const retorno = (fv: Record<string, unknown>, p: PaginaDaGeracao | null, generationId = 'gen-1') => montarRetornoDaPagina({ fieldValues: { pageId: 'pg-1', ...fv }, pagina: p, appUrl: app, projectId: PROJETO, concluida: true, generationId })

  it('sem generationId (chamadores antigos): nenhum bloco; com generationId e sem registro: gate: null', () => {
    expect(montarRetornoDaPagina({ fieldValues: { pageId: 'pg-1' }, pagina, appUrl: app, projectId: PROJETO, concluida: true })).not.toHaveProperty('gate')
    const r = retorno({}, paginaCompleta)
    expect(r.gate).toBeNull()
    expect(JSON.stringify(r)).not.toMatch(/APTO|pendente/)
  })

  it('registro coincidente: resultado, versões, política gravada e comparada, naoConferido e o aviso fixo; o resto do retorno é o de sempre', () => {
    const r = retorno({ gateDaArte: registro() }, paginaCompleta)
    expect(r.gate).toMatchObject({ validade: 'coincidente', resultado: 'APTO', rulesVersion: 'revisao-v1', versaoDoGate: 'gate-v3', medidoEm: '2026-10-16T03:00:00.000Z', origem: 'piloto', politica: POLITICA_DO_ASSUNTO_DO_GATE, politicaComparada: POLITICA_DO_ASSUNTO_DO_GATE, naoConferido: NAO_CONFERIDO_PELA_IDENTIDADE, motivos: [], aviso: AVISO_DO_GATE })
    expect(r.gate && 'divergencias' in r.gate).toBe(false)
    expect(AVISO_DO_GATE).toMatch(/não é o veredito atual/)
    expect(r.pageId).toBe('pg-1')
    expect(r.editUrl).toContain('/templates/412/editor?pageId=pg-1')
    expect(r.comoAgendar).toContain('pageId "pg-1"')
  })

  it('histórico: página mudou (hash), renomeada para "feed" (formato do revisor), só as tags (formato do compositor) ou OUTRA Generation (vínculo) — o resultado antigo só com o rótulo', () => {
    const mudada = { ...paginaCompleta, layers: (PAGINA_LIMPA.layers as Array<Record<string, unknown>>).map((l) => (l.id === 'headline' ? { ...l, content: 'Outro' } : l)) }
    expect(retorno({ gateDaArte: registro() }, mudada).gate).toMatchObject({ validade: 'historico', divergencias: ['pageVersion'], resultado: 'APTO' })
    expect(retorno({ gateDaArte: registro() }, { ...paginaCompleta, name: 'feed especial', tags: [] }).gate).toMatchObject({ validade: 'historico', divergencias: ['formato'] })
    // Só as tags: página 1080×1350 "feed de quarta" tags [feed] → registro; tags [story] → o revisor segue 'feed' pelo nome, o compositor vira 'story'.
    const feedLayers = camadasDaPaginaLimpa().map((l) => (l.id === 'bg-foto' ? { ...l, size: { width: 1080, height: 1350 } } : l.id === 'servico' ? { ...l, position: { x: 100, y: 1150 } } : l))
    const feed = { ...PAGINA_LIMPA, name: 'feed de quarta', tags: ['feed'], height: 1350, layers: feedLayers as unknown }
    const rf = decidirEMontarRegistro({ entrada: entradaDa(feed, { formato: 'feed', canvas: { width: 1080, height: 1350 }, metricas: medida().metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, y: 1150 }, glyphTop: 1150, glyphBottom: 1210 } : m)) }), page: feed, vinculo: { ...VINCULO, postType: 'POST' }, origem: 'piloto', agora: AGORA })
    expect(rf.decisao).toBe('ok')
    const registroFeed = rf.decisao === 'ok' ? JSON.parse(JSON.stringify(rf.registro)) : null
    expect(retorno({ gateDaArte: registroFeed }, { ...paginaCompleta, ...feed, tags: ['story'] }).gate).toMatchObject({ validade: 'historico', divergencias: ['formatoDoCompositor'] })
    expect(retorno({ gateDaArte: registro() }, paginaCompleta, 'gen-OUTRA').gate).toMatchObject({ validade: 'historico', divergencias: ['vinculo'] })
  })

  it('ilegível: registro malformado (com as versões gravadas só quando válidas), APTO forjado, página sumida, sem os campos da identidade, camadas ilegíveis → sem resultado nenhum', () => {
    const anterior = registro()
    ;(anterior.gate as Record<string, unknown>).versao = 'gate-v2'
    const longa = registro()
    ;(longa.gate as Record<string, unknown>).versao = 'x'.repeat(200)
    const casos: Array<[string, Record<string, unknown>, PaginaDaGeracao | null]> = [
      ['registro malformado', { gateDaArte: { resultado: 'APTO' } }, paginaCompleta],
      ['APTO forjado com cobertura vazia', { gateDaArte: { ...registro(), gate: { ...(registro().gate as object), cobertura: {} } } }, paginaCompleta],
      ['versão anterior do gate', { gateDaArte: anterior }, paginaCompleta],
      ['versão malformada', { gateDaArte: longa }, paginaCompleta],
      ['página sumida', { gateDaArte: registro() }, null],
      ['página sem os campos da identidade', { gateDaArte: registro() }, pagina],
      ['camadas ilegíveis hoje', { gateDaArte: registro() }, { ...paginaCompleta, layers: '{nao é json' }],
    ]
    for (const [nome, fv, p] of casos) {
      const r = retorno(fv, p)
      expect(r.gate?.validade, nome).toBe('ilegivel')
      expect(r.gate && 'resultado' in r.gate, nome).toBe(false)
      expect(r.gate && 'motivo' in r.gate && r.gate.motivo.length > 0, nome).toBe(true)
      expect(r.gate?.aviso, nome).toBe(AVISO_DO_GATE)
    }
    expect(retorno({ gateDaArte: anterior }, paginaCompleta).gate).toMatchObject({ validade: 'ilegivel', versaoGravada: 'gate-v2', rulesVersionGravada: 'revisao-v1' })
    expect(retorno({ gateDaArte: longa }, paginaCompleta).gate).not.toHaveProperty('versaoGravada')
  })
})
