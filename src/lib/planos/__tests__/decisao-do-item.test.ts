/**
 * A tabela de decisão do item de plano (revisão final R05–R06 do PR 11, com a
 * revisão declarada pela chamada das pré-revisões C11-1 e C11-1a…1b),
 * combinação a combinação.
 *
 * `TABELA` abaixo é a forma ESCRITA da decisão — linhas em ordem, a primeira
 * que casa vence, colunas ausentes valem qualquer valor —, a mesma do
 * CLAUDE.md. `decidirNoItemDoPlano` é a mesma decisão em código corrido. O
 * teste enumera TODAS as combinações das entradas e exige que as duas formas
 * concordem, que toda combinação case com alguma linha e que nenhuma linha
 * esteja morta. As colunas são as entradas cruas (`pedido` e `projeto`
 * separados), de propósito: derivar "o mesmo pedido" aqui repetiria o código.
 */
import { describe, expect, it } from 'vitest'
import { STATUS_DO_ITEM, type StatusDoItem } from '@/lib/planos/vocabulario'
import { caminhoAte, itemExecutavel } from '@/lib/planos/execucao'
import {
  CONFRONTOS,
  CONFRONTOS_DO_PROJETO,
  ESTADOS_DA_PECA_DO_ITEM,
  FICHAS_DO_ITEM,
  REVISOES_DA_CHAMADA,
  classificarPecaDoItem,
  confrontarComOGravado,
  confrontarRevisaoDaChamada,
  decidirNoItemDoPlano,
  descreverArteAtualDoItem,
  type Confronto,
  type ConfrontoDoProjeto,
  type DecisaoDoItem,
  type EntradaDaDecisaoDoItem,
  type EstadoDaPecaDoItem,
  type FichaDoItem,
  type RevisaoDaChamada,
} from '../decisao-do-item'

const EXECUTAVEL: StatusDoItem[] = ['proposto', 'editado', 'aprovado', 'erro']
const EM_VOO: StatusDoItem[] = ['na-fila', 'gerando']
const FINAL: StatusDoItem[] = ['pronto', 'agendado']

const reaproveitar: DecisaoDoItem = { acao: 'reaproveitar' }
const refazerJob: DecisaoDoItem = { acao: 'refazer-job' }
const novaPeca: DecisaoDoItem = { acao: 'nova-peca' }
const recusar = (motivo: 'reprovado' | 'ficha' | 'avancou' | 'superada' | 'revisado' | 'chamada-vencida'): DecisaoDoItem => ({ acao: 'recusar', motivo })

interface Linha {
  n: string
  status?: StatusDoItem[]
  ficha?: FichaDoItem[]
  peca?: EstadoDaPecaDoItem[]
  pedido?: Confronto[]
  projeto?: ConfrontoDoProjeto[]
  revisao?: Confronto[]
  chamada?: RevisaoDaChamada[]
  saida: DecisaoDoItem
}

const TABELA: Linha[] = [
  { n: '1', status: ['reprovado'], saida: recusar('reprovado') },
  { n: '2', status: EXECUTAVEL, ficha: ['diverge'], saida: recusar('ficha') },
  { n: '3', peca: ['viva', 'pronta'], pedido: ['igual'], projeto: ['confere', 'desconhecido'], revisao: ['igual'], saida: reaproveitar },
  // Decisão do Ciro (13/09/2026): o item já tem OUTRA arte viva ou pronta que não é este pedido — a peça foi superada no plano.
  { n: '4a', status: [...FINAL, ...EM_VOO], peca: ['viva', 'pronta'], saida: recusar('superada') },
  { n: '4', status: FINAL, saida: recusar('avancou') },
  { n: '5', status: EM_VOO, peca: ['nenhuma'], saida: recusar('avancou') },
  { n: '6a', status: EM_VOO, pedido: ['diferente'], saida: recusar('revisado') },
  { n: '6b', status: EM_VOO, projeto: ['diverge'], saida: recusar('revisado') },
  { n: '7', status: EM_VOO, revisao: ['diferente'], saida: recusar('revisado') },
  // C11-1a: com lote, produzir exige a chamada montada a partir da revisão do item agora.
  { n: '7b', status: EM_VOO, chamada: ['diferente', 'desconhecido'], saida: recusar('chamada-vencida') },
  { n: '8', status: EM_VOO, peca: ['sem-job'], saida: refazerJob },
  { n: '9', status: EM_VOO, saida: novaPeca },
  { n: '9b', status: EXECUTAVEL, chamada: ['diferente', 'desconhecido'], saida: recusar('chamada-vencida') },
  // C11-1b: as antigas 10 a 14 — sem lote, ou com a chamada na revisão de agora, a peça nova é o pedido certo.
  { n: '10', status: EXECUTAVEL, saida: novaPeca },
]

const casa = <T>(permitidos: T[] | undefined, valor: T) => !permitidos || permitidos.includes(valor)
const linhaDa = (e: EntradaDaDecisaoDoItem) =>
  TABELA.find((l) => casa(l.status, e.status) && casa(l.ficha, e.ficha) && casa(l.peca, e.peca) && casa(l.pedido, e.pedido) && casa(l.projeto, e.projeto) && casa(l.revisao, e.revisao) && casa(l.chamada, e.chamada))

function* todasAsCombinacoes(): Generator<EntradaDaDecisaoDoItem> {
  for (const status of STATUS_DO_ITEM)
    for (const ficha of FICHAS_DO_ITEM)
      for (const peca of ESTADOS_DA_PECA_DO_ITEM)
        for (const pedido of CONFRONTOS)
          for (const projeto of CONFRONTOS_DO_PROJETO)
            for (const revisao of CONFRONTOS)
              for (const chamada of REVISOES_DA_CHAMADA) yield { status, ficha, peca, pedido, projeto, revisao, chamada }
}

describe('a tabela de decisão do item de plano', () => {
  it('as classes de status cobrem o vocabulário, e "executável" é o de execucao.ts', () => {
    expect([...EXECUTAVEL, ...EM_VOO, ...FINAL, 'reprovado'].sort()).toEqual([...STATUS_DO_ITEM].sort())
    for (const s of STATUS_DO_ITEM) expect(itemExecutavel(s)).toBe(EXECUTAVEL.includes(s))
  })

  it('todas as 23.328 combinações: a tabela escrita e o código dão a mesma saída, nenhuma combinação fica sem linha e nenhuma linha fica morta', () => {
    let total = 0
    const divergencias: string[] = []
    const usadas = new Map<string, number>()
    for (const e of todasAsCombinacoes()) {
      total++
      const linha = linhaDa(e)
      if (!linha) {
        divergencias.push(`sem linha: ${JSON.stringify(e)}`)
        continue
      }
      usadas.set(linha.n, (usadas.get(linha.n) ?? 0) + 1)
      const obtida = decidirNoItemDoPlano(e)
      if (JSON.stringify(obtida) !== JSON.stringify(linha.saida)) divergencias.push(`linha ${linha.n} ${JSON.stringify(e)} → esperado ${JSON.stringify(linha.saida)}, obtido ${JSON.stringify(obtida)}`)
    }
    expect(total).toBe(9 * 3 * 8 * 3 * 3 * 3 * 4)
    expect(total).toBe(23328)
    expect(divergencias.slice(0, 20)).toEqual([])
    expect(TABELA.map((l) => l.n).filter((n) => !usadas.has(n))).toEqual([])
  })

  it('invariantes das saídas: peça nova só onde o item tem caminho até na-fila; refazer o job só sem job; reaproveitar só peça viva ou pronta; com lote, produzir só com a chamada na revisão do item; nada se produz de item reprovado, pronto ou agendado', () => {
    for (const e of todasAsCombinacoes()) {
      const d = decidirNoItemDoPlano(e)
      if (d.acao === 'nova-peca') expect(caminhoAte(e.status, 'na-fila')).not.toBeNull()
      if (d.acao === 'nova-peca' || d.acao === 'refazer-job') expect([...EXECUTAVEL, ...EM_VOO]).toContain(e.status)
      if (d.acao === 'nova-peca' || d.acao === 'refazer-job') expect(['sem-lote', 'igual']).toContain(e.chamada)
      if (d.acao === 'refazer-job') expect(e.peca).toBe('sem-job')
      if (d.acao === 'recusar' && d.motivo === 'superada') {
        expect([...FINAL, ...EM_VOO]).toContain(e.status)
        expect(['viva', 'pronta']).toContain(e.peca)
      }
      if (d.acao === 'reaproveitar') {
        expect(['viva', 'pronta']).toContain(e.peca)
        expect([e.pedido, e.projeto, e.revisao]).toEqual(['igual', e.projeto === 'diverge' ? 'nunca' : e.projeto, 'igual'])
      }
    }
  })

  it('os dois cenários da revisão final na tabela: R05 retoma (refaz o job); R06 — a chamada ORIGINAL repetida depois da edição — recusa pela revisão da chamada, e a chamada na revisão atual produz', () => {
    const base: EntradaDaDecisaoDoItem = { status: 'na-fila', ficha: 'ausente', peca: 'sem-job', pedido: 'igual', projeto: 'confere', revisao: 'igual', chamada: 'igual' }
    expect(decidirNoItemDoPlano(base)).toEqual(refazerJob) // R05, com a linha fresca ou ligada — o vínculo não é entrada
    expect(decidirNoItemDoPlano({ ...base, chamada: 'sem-lote' })).toEqual(refazerJob)
    const r06: EntradaDaDecisaoDoItem = { status: 'editado', ficha: 'ausente', peca: 'falhou', pedido: 'igual', projeto: 'confere', revisao: 'diferente', chamada: 'diferente' }
    expect(decidirNoItemDoPlano(r06)).toEqual(recusar('chamada-vencida'))
    expect(decidirNoItemDoPlano({ ...r06, chamada: 'desconhecido' })).toEqual(recusar('chamada-vencida'))
    expect(decidirNoItemDoPlano({ ...r06, status: 'erro', revisao: 'igual', chamada: 'igual' })).toEqual(novaPeca) // a retomada que continua
    expect(decidirNoItemDoPlano({ ...r06, chamada: 'sem-lote' })).toEqual(novaPeca) // a bancada monta a spec do item atual
    expect(decidirNoItemDoPlano({ ...r06, chamada: 'igual' })).toEqual(novaPeca) // C11-1b: relida na revisão de agora — a antiga linha 14 recusava
    expect(decidirNoItemDoPlano({ ...r06, pedido: 'diferente', chamada: 'igual' })).toEqual(novaPeca) // outro pedido, montado da revisão de agora
  })

  it('C11-1 e C11-1a na tabela: com lote, peça nova e job novo exigem a chamada montada a partir da revisão do item agora; reaproveitar não depende dela', () => {
    // A leva vencida repetida (C11-1, e o cenário B do C11-1a): a peça ATUAL do item é de
    // revisão mais nova, o pedido do lote difere dela, e a chamada é a da leitura antiga.
    const vencida: EntradaDaDecisaoDoItem = { status: 'erro', ficha: 'ausente', peca: 'falhou', pedido: 'diferente', projeto: 'confere', revisao: 'igual', chamada: 'diferente' }
    expect(decidirNoItemDoPlano(vencida)).toEqual(recusar('chamada-vencida'))
    expect(decidirNoItemDoPlano({ ...vencida, revisao: 'diferente' })).toEqual(recusar('chamada-vencida')) // editado de novo depois de G2
    expect(decidirNoItemDoPlano({ ...vencida, status: 'aprovado', peca: 'pronta' })).toEqual(recusar('chamada-vencida')) // G2 pronta, reprovada e liberada
    expect(decidirNoItemDoPlano({ ...vencida, chamada: 'desconhecido' })).toEqual(recusar('chamada-vencida')) // chamada sem revisão nunca vale igual
    expect(decidirNoItemDoPlano({ ...vencida, chamada: 'igual' })).toEqual(novaPeca) // o controle: montada DEPOIS da edição
    // Cenário A do C11-1a: sem peça ainda, a edição chegou antes da chamada — só a chamada sabe.
    const semPeca: EntradaDaDecisaoDoItem = { status: 'editado', ficha: 'ausente', peca: 'nenhuma', pedido: 'desconhecido', projeto: 'desconhecido', revisao: 'desconhecido', chamada: 'diferente' }
    expect(decidirNoItemDoPlano(semPeca)).toEqual(recusar('chamada-vencida'))
    expect(decidirNoItemDoPlano({ ...semPeca, chamada: 'igual' })).toEqual(novaPeca)
    // Em voo: a chamada vencida não refaz o job nem a peça.
    const emVoo: EntradaDaDecisaoDoItem = { status: 'na-fila', ficha: 'ausente', peca: 'sem-job', pedido: 'igual', projeto: 'confere', revisao: 'igual', chamada: 'diferente' }
    expect(decidirNoItemDoPlano(emVoo)).toEqual(recusar('chamada-vencida'))
    expect(decidirNoItemDoPlano({ ...emVoo, peca: 'falhou' })).toEqual(recusar('chamada-vencida'))
    expect(decidirNoItemDoPlano({ ...emVoo, chamada: 'igual' })).toEqual(refazerJob)
    // Reaproveitar não produz nada: a peça devolvida é o pedido e a revisão de agora.
    expect(decidirNoItemDoPlano({ status: 'aprovado', ficha: 'ausente', peca: 'pronta', pedido: 'igual', projeto: 'confere', revisao: 'igual', chamada: 'diferente' })).toEqual(reaproveitar)
  })
})

describe('peça superada no plano (decisão do Ciro, 13/09/2026)', () => {
  it('o item pronto, agendado ou em voo que já tem OUTRA arte viva ou pronta recusa com motivo próprio; nada passa a ser produzido, e a peça do mesmo pedido continua reaproveitada', () => {
    const base: EntradaDaDecisaoDoItem = { status: 'pronto', ficha: 'ausente', peca: 'pronta', pedido: 'diferente', projeto: 'confere', revisao: 'diferente', chamada: 'diferente' }
    for (const status of [...FINAL, ...EM_VOO]) {
      for (const peca of ['viva', 'pronta'] as EstadoDaPecaDoItem[]) {
        expect(decidirNoItemDoPlano({ ...base, status, peca })).toEqual(recusar('superada'))
        expect(decidirNoItemDoPlano({ ...base, status, peca, chamada: 'igual' })).toEqual(recusar('superada'))
        expect(decidirNoItemDoPlano({ ...base, status, peca, pedido: 'igual', revisao: 'igual' })).toEqual(reaproveitar)
      }
    }
    // Sem outra arte viva ou pronta, as recusas de antes.
    expect(decidirNoItemDoPlano({ ...base, peca: 'falhou' })).toEqual(recusar('avancou'))
    expect(decidirNoItemDoPlano({ ...base, status: 'na-fila', peca: 'nenhuma' })).toEqual(recusar('avancou'))
    expect(decidirNoItemDoPlano({ ...base, status: 'na-fila', peca: 'falhou' })).toEqual(recusar('revisado'))
    // Item executável com a chamada vencida é o "pedido desatualizado" — mantido.
    expect(decidirNoItemDoPlano({ ...base, status: 'editado' })).toEqual(recusar('chamada-vencida'))
  })

  it('descreverArteAtualDoItem: a arte, a página (do item, senão da peça), quando foi feita e a situação em palavras — nunca o enum do banco', () => {
    expect(descreverArteAtualDoItem({ generationId: null, geracao: null })).toBeNull()
    expect(descreverArteAtualDoItem({ generationId: 'g2', pageIdDoItem: 'p-item', geracao: { status: 'COMPLETED', resultUrl: 'https://x', createdAt: new Date('2026-09-12T13:00:00.000Z'), fieldValues: { pageId: 'p-peca' } } })).toEqual({
      generationId: 'g2',
      pageId: 'p-item',
      feitaEm: '2026-09-12T13:00:00.000Z',
      feitaEmBrasilia: '12/09/2026, 10:00',
      situacao: 'pronta',
    })
    expect(descreverArteAtualDoItem({ generationId: 'g2', geracao: { status: 'COMPLETED', resultUrl: null, fieldValues: { pageId: 'p-peca' } } })).toMatchObject({ pageId: 'p-peca', feitaEm: null, feitaEmBrasilia: null, situacao: 'sem arquivo' })
    expect(descreverArteAtualDoItem({ generationId: 'g2', geracao: { status: 'PROCESSING', createdAt: 'lixo' } })).toMatchObject({ situacao: 'em produção', feitaEm: null })
    expect(descreverArteAtualDoItem({ generationId: 'g2', geracao: { status: 'FAILED' } })?.situacao).toBe('falhou')
    expect(descreverArteAtualDoItem({ generationId: 'g2', geracao: null })).toMatchObject({ situacao: 'apagada', pageId: null })
  })
})

describe('as entradas da tabela', () => {
  it('confrontarRevisaoDaChamada: sem lote não há declaração; sem revisão (ou vazia) é desconhecido; igual só com a mesma revisão', () => {
    expect(confrontarRevisaoDaChamada({ comLote: false, revisaoDaChamada: 'r1', revisao: 'r1' })).toBe('sem-lote')
    expect(confrontarRevisaoDaChamada({ comLote: false, revisaoDaChamada: null, revisao: 'r1' })).toBe('sem-lote')
    expect(confrontarRevisaoDaChamada({ comLote: true, revisaoDaChamada: 'r1', revisao: 'r1' })).toBe('igual')
    expect(confrontarRevisaoDaChamada({ comLote: true, revisaoDaChamada: 'r1', revisao: 'r2' })).toBe('diferente')
    expect(confrontarRevisaoDaChamada({ comLote: true, revisaoDaChamada: null, revisao: 'r1' })).toBe('desconhecido')
    expect(confrontarRevisaoDaChamada({ comLote: true, revisaoDaChamada: undefined, revisao: 'r1' })).toBe('desconhecido')
    expect(confrontarRevisaoDaChamada({ comLote: true, revisaoDaChamada: '', revisao: '' })).toBe('desconhecido')
  })

  it('classificarPecaDoItem', () => {
    const casos: Array<[Parameters<typeof classificarPecaDoItem>[0], EstadoDaPecaDoItem]> = [
      [{ generationId: null, geracao: null, job: null }, 'nenhuma'],
      [{ generationId: null, geracao: { status: 'PROCESSING' }, job: { status: 'PENDING' } }, 'nenhuma'],
      [{ generationId: 'g', geracao: null, job: { status: 'PENDING' } }, 'sumiu'],
      [{ generationId: 'g', geracao: { status: 'FAILED' }, job: { status: 'PENDING' } }, 'falhou'],
      [{ generationId: 'g', geracao: { status: 'PROCESSING' }, job: { status: 'FAILED' } }, 'job-terminal'],
      [{ generationId: 'g', geracao: { status: 'PROCESSING' }, job: { status: 'DONE' } }, 'job-terminal'],
      [{ generationId: 'g', geracao: { status: 'PROCESSING' }, job: null }, 'sem-job'],
      [{ generationId: 'g', geracao: { status: 'PROCESSING' }, job: { status: 'RUNNING' } }, 'viva'],
      [{ generationId: 'g', geracao: { status: 'COMPLETED', resultUrl: 'https://x' }, job: null }, 'pronta'],
      [{ generationId: 'g', geracao: { status: 'COMPLETED', resultUrl: null }, job: { status: 'DONE' } }, 'pronta-sem-arquivo'],
    ]
    for (const [entrada, esperado] of casos) expect(classificarPecaDoItem(entrada)).toBe(esperado)
  })

  it('confrontarComOGravado: o job vence a Generation; com lote os carimbos não são diferença; o projeto é à parte; nada gravado é desconhecido', () => {
    const contrato = (em: string) => ({ versao: 1, origem: { autor: 'claude', em, superficie: 'chat' }, blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Rodízio'] }], revisoes: [] })
    const spec = { projectId: 6, formato: 'story', copyAutoral: contrato('10:00') }
    const outraHora = { ...spec, copyAutoral: contrato('10:07') }
    const job = (s: unknown, planoRevisao = 'r1') => ({ payload: { spec: s, planoRevisao } })

    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: true, geracao: null, job: job(outraHora) })).toEqual({ pedido: 'igual', projeto: 'confere', revisao: 'igual' })
    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: false, geracao: null, job: job(outraHora) }).pedido).toBe('diferente')
    expect(confrontarComOGravado({ spec, revisao: 'r2', comLote: true, geracao: null, job: job(spec) }).revisao).toBe('diferente')
    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: true, geracao: null, job: job({ ...spec, projectId: 7 }) })).toMatchObject({ pedido: 'igual', projeto: 'diverge' })
    // A Generation COMPLETED pode guardar a spec resolvida: o job vem primeiro.
    const geracaoResolvida = { fieldValues: { spec: { ...spec, foto: { driveFileId: 'b' } }, planoRevisao: 'outra' } }
    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: true, geracao: geracaoResolvida, job: job(spec) })).toEqual({ pedido: 'igual', projeto: 'confere', revisao: 'igual' })
    // Sem job, a Generation; sem os dois, desconhecido.
    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: true, geracao: { fieldValues: { spec, planoRevisao: 'r1' } }, job: null })).toEqual({ pedido: 'igual', projeto: 'confere', revisao: 'igual' })
    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: true, geracao: { fieldValues: { spec } }, job: null }).revisao).toBe('desconhecido')
    expect(confrontarComOGravado({ spec, revisao: 'r1', comLote: true, geracao: null, job: null })).toEqual({ pedido: 'desconhecido', projeto: 'desconhecido', revisao: 'desconhecido' })
  })
})
