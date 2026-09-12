/**
 * A tabela de decisão do item de plano (revisão final R05–R06 do PR 11),
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
  classificarPecaDoItem,
  confrontarComOGravado,
  decidirNoItemDoPlano,
  type Confronto,
  type ConfrontoDoProjeto,
  type DecisaoDoItem,
  type EntradaDaDecisaoDoItem,
  type EstadoDaPecaDoItem,
  type FichaDoItem,
} from '../decisao-do-item'

const EXECUTAVEL: StatusDoItem[] = ['proposto', 'editado', 'aprovado', 'erro']
const EM_VOO: StatusDoItem[] = ['na-fila', 'gerando']
const FINAL: StatusDoItem[] = ['pronto', 'agendado']

const reaproveitar: DecisaoDoItem = { acao: 'reaproveitar' }
const refazerJob: DecisaoDoItem = { acao: 'refazer-job' }
const novaPeca: DecisaoDoItem = { acao: 'nova-peca' }
const recusar = (motivo: 'reprovado' | 'ficha' | 'avancou' | 'revisado'): DecisaoDoItem => ({ acao: 'recusar', motivo })

interface Linha {
  n: string
  status?: StatusDoItem[]
  ficha?: FichaDoItem[]
  peca?: EstadoDaPecaDoItem[]
  pedido?: Confronto[]
  projeto?: ConfrontoDoProjeto[]
  revisao?: Confronto[]
  comLote?: boolean[]
  saida: DecisaoDoItem
}

const TABELA: Linha[] = [
  { n: '1', status: ['reprovado'], saida: recusar('reprovado') },
  { n: '2', status: EXECUTAVEL, ficha: ['diverge'], saida: recusar('ficha') },
  { n: '3', peca: ['viva', 'pronta'], pedido: ['igual'], projeto: ['confere', 'desconhecido'], revisao: ['igual'], saida: reaproveitar },
  { n: '4', status: FINAL, saida: recusar('avancou') },
  { n: '5', status: EM_VOO, peca: ['nenhuma', 'viva', 'pronta'], saida: recusar('avancou') },
  { n: '6a', status: EM_VOO, pedido: ['diferente'], saida: recusar('revisado') },
  { n: '6b', status: EM_VOO, projeto: ['diverge'], saida: recusar('revisado') },
  { n: '7', status: EM_VOO, revisao: ['diferente'], saida: recusar('revisado') },
  { n: '8', status: EM_VOO, peca: ['sem-job'], saida: refazerJob },
  { n: '9', status: EM_VOO, saida: novaPeca },
  { n: '10', status: EXECUTAVEL, peca: ['nenhuma'], saida: novaPeca },
  { n: '11', status: EXECUTAVEL, comLote: [false], saida: novaPeca },
  { n: '12a', status: EXECUTAVEL, pedido: ['diferente'], saida: novaPeca },
  { n: '12b', status: EXECUTAVEL, projeto: ['diverge'], saida: novaPeca },
  { n: '13', status: EXECUTAVEL, revisao: ['igual'], saida: novaPeca },
  { n: '14', status: EXECUTAVEL, saida: recusar('revisado') },
]

const casa = <T>(permitidos: T[] | undefined, valor: T) => !permitidos || permitidos.includes(valor)
const linhaDa = (e: EntradaDaDecisaoDoItem) =>
  TABELA.find((l) => casa(l.status, e.status) && casa(l.ficha, e.ficha) && casa(l.peca, e.peca) && casa(l.pedido, e.pedido) && casa(l.projeto, e.projeto) && casa(l.revisao, e.revisao) && casa(l.comLote, e.comLote))

function* todasAsCombinacoes(): Generator<EntradaDaDecisaoDoItem> {
  for (const status of STATUS_DO_ITEM)
    for (const ficha of FICHAS_DO_ITEM)
      for (const peca of ESTADOS_DA_PECA_DO_ITEM)
        for (const pedido of CONFRONTOS)
          for (const projeto of CONFRONTOS_DO_PROJETO)
            for (const revisao of CONFRONTOS)
              for (const comLote of [false, true]) yield { status, ficha, peca, pedido, projeto, revisao, comLote }
}

describe('a tabela de decisão do item de plano', () => {
  it('as classes de status cobrem o vocabulário, e "executável" é o de execucao.ts', () => {
    expect([...EXECUTAVEL, ...EM_VOO, ...FINAL, 'reprovado'].sort()).toEqual([...STATUS_DO_ITEM].sort())
    for (const s of STATUS_DO_ITEM) expect(itemExecutavel(s)).toBe(EXECUTAVEL.includes(s))
  })

  it('todas as 11.664 combinações: a tabela escrita e o código dão a mesma saída, nenhuma combinação fica sem linha e nenhuma linha fica morta', () => {
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
    expect(total).toBe(9 * 3 * 8 * 3 * 3 * 3 * 2)
    expect(total).toBe(11664)
    expect(divergencias.slice(0, 20)).toEqual([])
    expect(TABELA.map((l) => l.n).filter((n) => !usadas.has(n))).toEqual([])
  })

  it('invariantes das saídas: peça nova só onde o item tem caminho até na-fila; refazer o job só sem job; reaproveitar só peça viva ou pronta; nada se produz de item reprovado, pronto ou agendado', () => {
    for (const e of todasAsCombinacoes()) {
      const d = decidirNoItemDoPlano(e)
      if (d.acao === 'nova-peca') expect(caminhoAte(e.status, 'na-fila')).not.toBeNull()
      if (d.acao === 'nova-peca' || d.acao === 'refazer-job') expect([...EXECUTAVEL, ...EM_VOO]).toContain(e.status)
      if (d.acao === 'refazer-job') expect(e.peca).toBe('sem-job')
      if (d.acao === 'reaproveitar') {
        expect(['viva', 'pronta']).toContain(e.peca)
        expect([e.pedido, e.projeto, e.revisao]).toEqual(['igual', e.projeto === 'diverge' ? 'nunca' : e.projeto, 'igual'])
      }
    }
  })

  it('os dois cenários da revisão final na tabela: R05 retoma (refaz o job) e R06 recusa, e as linhas vizinhas continuam', () => {
    const base: EntradaDaDecisaoDoItem = { status: 'na-fila', ficha: 'ausente', peca: 'sem-job', pedido: 'igual', projeto: 'confere', revisao: 'igual', comLote: true }
    expect(decidirNoItemDoPlano(base)).toEqual(refazerJob) // R05, com a linha fresca ou ligada — o vínculo não é entrada
    expect(decidirNoItemDoPlano({ ...base, comLote: false })).toEqual(refazerJob)
    const r06: EntradaDaDecisaoDoItem = { status: 'editado', ficha: 'ausente', peca: 'falhou', pedido: 'igual', projeto: 'confere', revisao: 'diferente', comLote: true }
    expect(decidirNoItemDoPlano(r06)).toEqual(recusar('revisado'))
    expect(decidirNoItemDoPlano({ ...r06, revisao: 'desconhecido' })).toEqual(recusar('revisado'))
    expect(decidirNoItemDoPlano({ ...r06, status: 'erro', revisao: 'igual' })).toEqual(novaPeca) // a retomada que continua
    expect(decidirNoItemDoPlano({ ...r06, comLote: false })).toEqual(novaPeca) // a bancada monta a spec do item atual
    expect(decidirNoItemDoPlano({ ...r06, pedido: 'diferente' })).toEqual(novaPeca) // outro pedido sob outra chave
  })
})

describe('as entradas da tabela', () => {
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
