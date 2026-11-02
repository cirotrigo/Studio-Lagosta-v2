import { beforeEach, describe, expect, it, vi } from 'vitest'
import { barreira, base, dbFalso, IndiceFalso } from './fixtures/base-falsa'

vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn() }))
vi.mock('../cache', () => ({ invalidateProjectCache: vi.fn(async () => 1) }))

import { CATALOGO } from '@/lib/mcp/catalogo'
import { TOOLS_DRAFT_ONLY } from '@/lib/mcp/registro/perfil'
import { generateEmbeddings } from '../embeddings'
import { chunkText } from '../chunking'
import { CAMPOS_PERMITIDOS, aplicarAlteracoes, dadosVisiveis, divergenciasDe, linhasDatadas, problemasDasAlteracoes, versaoDaEntrada, type LinhaDaBase } from '../dados-da-entrada'
import { consultarOperacaoDaBase, divergenciasDaBase, executarOperacaoDaBase, type PedidoDeOperacao } from '../operacao-da-base'

const embeddings = vi.mocked(generateEmbeddings)

/** A entrada real do Quintal, lida pelo conector em 02/11/2026. */
const TEXTO = `Segunda: das 11h às 17h, somente almoço.
Terça a sábado: das 11h à meia-noite.
Domingo: das 11h às 17h.

Linha pronta para rodapé de arte:
Seg das 11h às 17h · Ter–Sáb das 11h às 00h · Dom das 11h às 17h

O almoço executivo é servido das 11h às 16h.

Domingo fecha às 17h. Nunca sugerir jantar, happy hour ou reserva noturna no domingo.

Segunda fecha às 17h e só tem almoço. Nunca sugerir happy hour, jantar ou evento noturno na segunda.

Todo post é agendado de 2 a 3 horas antes do que ele anuncia. Almoço, que abre 11h, é postado entre 09h e 10h. Happy hour, que começa 16h, é postado entre 14h e 14h30.

Atualização de funcionamento — Ciro, chamada de voz de 02/11/2026: segunda-feira e domingo funcionam habitualmente das 11h às 17h; não é exceção de feriado. Demais dias e horários de almoço executivo e happy hour permanecem inalterados.`

const HOURS = { friday: '11:00-24:00', monday: '11:00-16:00', sunday: '11:00-17:00', tuesday: '11:00-24:00', saturday: '11:00-24:00', thursday: '11:00-24:00', wednesday: '11:00-24:00' }
const HAPPY = { days: 'tuesday-friday', time: '17:00-19:00', offer: 'chope e drinks em dobro', not_valid_on: 'holidays' }
const ADDRESS = 'Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES'
const META = { hours: HOURS, address: ADDRESS, happy_hour: HAPPY, cicloDeIndexacao: 'ciclo-antigo' }
const ID = 'cmj54h7p70001jr044pf8lis1'
const SEGUNDA = [{ campo: 'hours.monday', valor: '11:00-17:00' }]

function semearEntrada() {
  base.entradas.set(ID, { id: ID, projectId: 2, title: 'Horário de funcionamento e endereço — Quintal', content: TEXTO, category: 'HORARIOS', status: 'ACTIVE', tags: ['horario'], expiresAt: null, metadata: structuredClone(META), updatedAt: new Date('2026-11-02T14:55:24Z'), createdBy: 'u', userId: 'u' })
  base.chunks = chunkText(TEXTO).map((c) => ({ id: `c${c.ordinal}`, entryId: ID, ordinal: c.ordinal, content: c.content, tokens: c.tokens, vectorId: `${ID}:${c.ordinal}` }))
  for (const c of base.chunks) base.vetores.set(c.vectorId, { id: c.vectorId, vector: [1], metadata: { entryId: ID, ordinal: c.ordinal, projectId: 2 } })
}
const linha = () => base.linha(ID)
const versao = () => versaoDaEntrada(linha())
const pedido = (extra: Partial<PedidoDeOperacao> = {}): PedidoDeOperacao => ({ projectId: 2, entradaId: ID, versaoEsperada: versao(), operacaoId: 'quintal-segunda-17h', alteracoes: SEGUNDA, confirmado: true, autor: 'u', ator: { kind: 'user', userId: 'user_ciro', clientId: 'claude' }, ...extra })

beforeEach(() => {
  process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
  process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
  base.reset()
  vi.clearAllMocks()
  embeddings.mockImplementation(async (textos: string[]) => textos.map(() => [0.1, 0.2]))
  semearEntrada()
})

describe('o caso do Quintal', () => {
  it('a proposta mostra o diff e nada grava', async () => {
    const antes = structuredClone(linha())
    const r = await executarOperacaoDaBase(pedido({ confirmado: false }))
    expect(r).toMatchObject({ estado: 'proposta', gravado: false, bloqueiam: [], indexacao: { necessaria: false } })
    expect((r as { diff: unknown }).diff).toEqual([{ campo: 'hours.monday', antes: '11:00-16:00', depois: '11:00-17:00' }])
    expect(linha()).toEqual(antes)
    expect(base.operacoes).toHaveLength(0)
  })

  it('confirma a segunda, sem reindexar, e preserva todo o resto', async () => {
    const r = await executarOperacaoDaBase(pedido())
    expect(r).toMatchObject({ estado: 'concluida', gravado: true })
    expect(linha().metadata).toEqual({ ...META, hours: { ...HOURS, monday: '11:00-17:00' } })
    expect(linha().content).toBe(TEXTO)
    expect(embeddings).not.toHaveBeenCalled()
    expect(base.operacoes[0]).toMatchObject({ autor: 'u', ator: { userId: 'user_ciro' }, tipo: 'dados', status: 'CONCLUIDA' })
    expect((base.operacoes[0].antes as { dados: unknown }).dados).toEqual({ hours: HOURS, address: ADDRESS, happy_hour: HAPPY })
  })

  it('restaura exatamente: a versão e o metadata voltam ao que eram', async () => {
    const original = versao()
    const feita = (await executarOperacaoDaBase(pedido())) as { versaoDepois: string }
    expect(versao()).toBe(feita.versaoDepois)
    const r = await executarOperacaoDaBase(pedido({ operacaoId: 'quintal-reverte-segunda', alteracoes: undefined, reverterOperacaoId: 'quintal-segunda-17h' }))
    expect(r).toMatchObject({ estado: 'concluida', tipo: 'reversao' })
    expect(versao()).toBe(original)
    expect(linha().metadata).toEqual(META)
  })

  it('a edição mantém identidade e token, que a versão não enxerga', async () => {
    linha().metadata = { ...META, origem: 'chat', chaveDoFato: 'horario-quintal' }
    await executarOperacaoDaBase(pedido())
    expect(linha().metadata).toMatchObject({ origem: 'chat', chaveDoFato: 'horario-quintal', cicloDeIndexacao: 'ciclo-antigo' })
  })

  it('a versão não muda com o arrendamento da indexação', () => {
    const antes = versao()
    linha().metadata = { ...(linha().metadata as object), cicloDeIndexacao: 'outro', cicloExpiraEm: '2026-11-02T15:00:00Z', indexadoEm: 'x' }
    linha().updatedAt = new Date()
    expect(versao()).toBe(antes)
  })
})

describe('repetição e concorrência', () => {
  it('repetir o mesmo pedido não escreve de novo, nem depois de a entrada mudar', async () => {
    const versaoLida = versao()
    await executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida }))
    const carimbo = linha().updatedAt
    const r = await executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida }))
    expect(r).toMatchObject({ estado: 'concluida', repetida: true })
    expect(linha().updatedAt).toBe(carimbo)
    expect(base.operacoes).toHaveLength(1)
  })

  it('o mesmo id com outro pedido é recusado', async () => {
    await executarOperacaoDaBase(pedido())
    await expect(executarOperacaoDaBase(pedido({ alteracoes: [{ campo: 'hours.monday', valor: '11:00-18:00' }] }))).rejects.toMatchObject({ code: 'OPERACAO_REUTILIZADA' })
    expect((linha().metadata as typeof META).hours.monday).toBe('11:00-17:00')
  })

  it('versão velha é recusada, com a versão atual na resposta', async () => {
    const velha = versao()
    await executarOperacaoDaBase(pedido())
    const atual = versao()
    await expect(executarOperacaoDaBase(pedido({ operacaoId: 'outra-operacao', versaoEsperada: velha, alteracoes: [{ campo: 'hours.sunday', valor: '11:00-18:00' }], aceitarDivergencias: ['hours.sunday'] }))).rejects.toMatchObject({ code: 'VERSAO_DIVERGENTE', details: { versaoAtual: atual } })
  })

  it('a entrada que muda entre a análise e o commit também recusa', async () => {
    const lerOriginal = dbFalso.knowledgeBaseEntry.findUnique.getMockImplementation()
    let leituras = 0
    dbFalso.knowledgeBaseEntry.findUnique.mockImplementation(async (a: never) => {
      if (++leituras === 2) linha().content = `${TEXTO}\nmudou por fora`
      return lerOriginal?.(a) as never
    })
    await expect(executarOperacaoDaBase(pedido())).rejects.toMatchObject({ code: 'VERSAO_DIVERGENTE' })
    dbFalso.knowledgeBaseEntry.findUnique.mockImplementation(lerOriginal as never)
    expect(base.operacoes).toHaveLength(0)
  })

  it('a trilha que não grava desfaz a edição', async () => {
    dbFalso.operacaoDaBase.create.mockRejectedValueOnce(new Error('banco fora'))
    await expect(executarOperacaoDaBase(pedido())).rejects.toThrow('banco fora')
    expect(linha().metadata).toEqual(META)
  })
})

describe('isolamento entre clientes', () => {
  it('entrada de outro cliente responde como inexistente', async () => {
    await expect(executarOperacaoDaBase(pedido({ projectId: 3 }))).rejects.toMatchObject({ code: 'ENTRADA_NAO_ENCONTRADA', status: 404 })
    expect(base.operacoes).toHaveLength(0)
  })
  it('o mesmo operacaoId em outro cliente não enxerga a operação', async () => {
    await executarOperacaoDaBase(pedido())
    expect(await consultarOperacaoDaBase({ projectId: 3, operacaoId: 'quintal-segunda-17h' })).toMatchObject({ estado: 'nao_encontrada', gravado: false })
    expect(await consultarOperacaoDaBase({ projectId: 3, entradaId: ID })).toMatchObject({ count: 0 })
  })
  it('reversão de operação de outra entrada é recusada', async () => {
    await executarOperacaoDaBase(pedido())
    base.entradas.set('e2', { ...structuredClone(linha()), id: 'e2' })
    const v = versaoDaEntrada(base.linha('e2'))
    await expect(executarOperacaoDaBase(pedido({ entradaId: 'e2', versaoEsperada: v, operacaoId: 'reverte-outra', alteracoes: undefined, reverterOperacaoId: 'quintal-segunda-17h' }))).rejects.toMatchObject({ code: 'OPERACAO_NAO_ENCONTRADA' })
  })
})

describe('entradas inválidas', () => {
  it.each([
    ['dia inexistente', 'hours.segundaa', '11:00-17:00', 'fora da lista'],
    ['caminho arbitrário', 'meta.nome', 'x', 'fora da lista'],
    ['chave do sistema', 'cicloDeIndexacao', 'x', 'fora da lista'],
    ['__proto__', 'horarios_funcionamento.__proto__', '11:00-17:00', 'não tem'],
    ['formato 11h', 'hours.monday', '11h-17h', 'HH:MM'],
    ['travessão', 'hours.monday', '11:00–17:00', 'HH:MM'],
    ['hora 25', 'hours.monday', '11:00-25:00', 'fim inválido'],
    ['minuto 60', 'hours.monday', '11:60-17:00', 'início inválido'],
    ['início igual ao fim', 'hours.monday', '11:00-11:00', 'iguais'],
    ['turnos sobrepostos', 'hours.monday', '11:00-15:00, 14:00-18:00', 'sobrepõem'],
    ['dia de happy hour', 'happy_hour.days', 'terça-sexta', 'intervalo'],
    ['endereço vazio', 'address', '  ', 'vazio'],
    ['vocabulário de outro cliente', 'horarios.segunda', '11:00-17:00', 'não tem'],
    ['chave nova em campo só-existente', 'happy_hour.dias', 'terca-sexta', 'já existe'],
  ])('%s é recusado sem gravar', async (_nome, campo, valor, motivo) => {
    const antes = structuredClone(linha())
    await expect(executarOperacaoDaBase(pedido({ alteracoes: [{ campo, valor }] }))).rejects.toMatchObject({ code: 'DADOS_INVALIDOS', message: expect.stringContaining(motivo), details: { camposPermitidos: CAMPOS_PERMITIDOS } })
    expect(linha()).toEqual(antes)
  })

  it('um campo inválido recusa o pedido inteiro', async () => {
    await expect(executarOperacaoDaBase(pedido({ alteracoes: [...SEGUNDA, { campo: 'hours.foo', valor: '1' }] }))).rejects.toMatchObject({ code: 'DADOS_INVALIDOS' })
    expect((linha().metadata as typeof META).hours.monday).toBe('11:00-16:00')
  })
  it('valor igual ao atual e pedido vazio não gravam', async () => {
    await expect(executarOperacaoDaBase(pedido({ alteracoes: [{ campo: 'hours.sunday', valor: '11:00-17:00' }] }))).rejects.toMatchObject({ code: 'NADA_A_MUDAR' })
    await expect(executarOperacaoDaBase(pedido({ alteracoes: [] }))).rejects.toMatchObject({ code: 'PEDIDO_INVALIDO' })
  })
  it('entrada arquivada e metadata que não é objeto são recusados', async () => {
    linha().status = 'ARCHIVED'
    await expect(executarOperacaoDaBase(pedido())).rejects.toMatchObject({ code: 'ENTRADA_INATIVA' })
    linha().status = 'ACTIVE'
    linha().metadata = ['lista']
    await expect(executarOperacaoDaBase(pedido())).rejects.toMatchObject({ code: 'DADOS_ILEGIVEIS' })
  })
  it('turnos e madrugada válidos passam', () => {
    expect(problemasDasAlteracoes({ hours: HOURS }, [{ campo: 'hours.monday', valor: '11:00-15:30, 18:00-23:30' }, { campo: 'hours.friday', valor: '18:00-02:00' }, { campo: 'hours.sunday', valor: '11:00-00:00' }])).toEqual([])
  })
  it('turno que atravessa a madrugada não engole outro', () => {
    expect(problemasDasAlteracoes({ hours: HOURS }, [{ campo: 'hours.friday', valor: '18:00-02:00, 19:00-23:00' }])[0].motivo).toContain('sobrepõem')
    expect(problemasDasAlteracoes({ hours: HOURS }, [{ campo: 'hours.friday', valor: '01:00-03:00, 18:00-02:00' }])[0].motivo).toContain('sobrepõem')
  })
  it('não cria a segunda verdade ao lado da que existe', () => {
    expect(problemasDasAlteracoes({ endereco: 'Rua A' }, [{ campo: 'address', valor: 'Rua B' }])[0].motivo).toContain('já existe')
    expect(problemasDasAlteracoes({ happy_hour: { horario: '16:00-19:00' } }, [{ campo: 'happy_hour.time', valor: '16:00-19:00' }])[0].motivo).toContain('já existe')
    expect(problemasDasAlteracoes({ horarios: { 'terca-sabado': '11:30-23:30' } }, [{ campo: 'horarios.quarta', valor: '11:30-23:30' }])[0].motivo).toContain('já existe')
  })
  it('aplicar preserva chave desconhecida dentro do mesmo objeto', () => {
    expect(aplicarAlteracoes({ hours: { monday: 'a', extra: { x: 1 } } }, SEGUNDA)).toEqual({ hours: { monday: '11:00-17:00', extra: { x: 1 } } })
  })
})

describe('coerência com os textos', () => {
  const texto = (content: string, extra: Partial<LinhaDaBase> = {}): LinhaDaBase => ({ id: 'e', title: 'Ficha', content, updatedAt: new Date('2026-11-01T00:00:00Z'), expiresAt: null, metadata: null, ...extra })
  const dados = { hours: HOURS, happy_hour: HAPPY }

  it('a entrada real acusa a segunda e nada além dela no funcionamento', () => {
    const d = divergenciasDe(dados, [texto(TEXTO)])
    expect([...new Set(d.map((x) => x.campo))]).toEqual(['hours.monday'])
    expect(d[0]).toMatchObject({ valorNosDados: '11:00-16:00', origem: { entradaId: 'e', titulo: 'Ficha' } })
  })
  it('depois da correção a entrada real fica limpa', () => {
    expect(divergenciasDe({ hours: { ...HOURS, monday: '11:00-17:00' } }, [texto(TEXTO)])).toEqual([])
  })
  it('acha o happy hour de 16h contra os 17h gravados, com o trecho e a origem', () => {
    const d = divergenciasDe(dados, [texto('Happy hour de terça a sexta, das 16h às 19h, chope e drinks selecionados em dobro.'), texto('Terça a sexta, das 16h às 19h.', { id: 'hh', title: 'Happy Hour — Quintal (terça a sexta)' })])
    expect(d.map((x) => [x.campo, x.valorNoTexto, x.origem.entradaId])).toEqual([['happy_hour.time', '16:00-19:00', 'e'], ['happy_hour.time', '16:00-19:00', 'hh']])
  })
  it('medição, grade de publicação, executivo e serviço não viram funcionamento', () => {
    const ruido = [
      'Células fortes: sáb almoço 1,86 · qua almoço 1,60 · qui só à tarde 15–18h (1,48) · ter almoço 1,38 · dom manhã até 11h 1,31 (após o meio-dia cai a 0,89).',
      '4. Happy hour: 0,87 — máx 1 por semana, sempre a mecânica completa (ter–sex, 16h–19h, em dobro) e um prato nomeado junto.',
      'SLOT FIXO 2 — entre 9h e 10h, de segunda a sexta',
      'O almoço executivo do Quintal é servido de SEGUNDA A SEXTA, das 11h às 16h.',
      'Delivery de segunda a quinta, das 11h às 15h30.',
      'Lá está terça a sexta até 23h30 e segunda até 16h30.',
    ]
    expect(divergenciasDe({ hours: { ...HOURS, monday: '11:00-17:00' } }, ruido.map((t) => texto(t)))).toEqual([])
  })
  it('exceção datada e campanha com validade não são comparadas', () => {
    const excecoes = ['Dia 24/12 fechamos às 15h: segunda das 11h às 15h.', 'Feriado nacional: segunda das 11h às 14h.', 'Véspera de Natal: terça das 11h às 15h.']
    expect(divergenciasDe({ hours: { ...HOURS, monday: '11:00-17:00' } }, [texto(excecoes.join('\n'))])).toEqual([])
    expect(divergenciasDe(dados, [texto('Segunda das 11h às 20h.', { expiresAt: new Date('2026-12-01') })])).toEqual([])
    expect(linhasDatadas(`${excecoes.join('\n')}\nTodos os dias das 11h30 às 23h30 (vigente desde 15/10/2026).`)).toEqual(excecoes)
  })
  it('reconhece data ISO e por extenso, e "horário habitual" não apaga a exceção', () => {
    for (const l of ['Em 2026-11-20, abrimos das 11h às 15h.', 'No dia 20 de novembro, abrimos das 11h às 15h.', 'Dia 20/11 abrimos das 11h às 15h, no lugar do horário habitual.']) expect(linhasDatadas(l)).toEqual([l])
  })
  it('separa a regra habitual da exceção na mesma linha, e a exceção alcança o que vem depois dela', () => {
    expect(linhasDatadas('Segunda funciona habitualmente das 11h às 17h; dia 20/11 abrimos das 11h às 15h.')).toEqual(['dia 20/11 abrimos das 11h às 15h.'])
    expect(divergenciasDe({ hours: HOURS }, [texto('Natal: terça das 11h às 14h; quarta das 11h às 15h.')])).toEqual([])
  })
  it('compara todos os turnos do dia: o segundo herda o dia', () => {
    const segunda = (monday: string) => divergenciasDe({ hours: { ...HOURS, monday } }, [texto('Segunda das 11h às 15h e das 18h às 23h.')])
    expect(segunda('11:00-15:00, 18:00-23:00')).toEqual([])
    expect(segunda('11:00-15:00, 18:00-22:00')).toMatchObject([{ campo: 'hours.monday', valorNoTexto: '11:00-15:00, 18:00-23:00' }])
  })
  it('o happy hour de dois turnos também se compara inteiro', () => {
    const hh = (time: string) => divergenciasDe({ happy_hour: { time } }, [texto('Happy hour das 17h às 19h e das 22h às 23h.')])
    expect(hh('17:00-19:00, 22:00-23:00')).toEqual([])
    expect(hh('17:00-19:00, 22:00-23:30')).toMatchObject([{ campo: 'happy_hour.time' }])
  })
  it('a faixa de outro serviço na mesma frase não entra no happy hour', () => {
    const misto = (time: string, frase: string) => divergenciasDe({ happy_hour: { time } }, [texto(frase, { title: 'Happy Hour' })]).map((d) => d.valorNoTexto)
    const depois = 'Happy hour das 17h às 19h e delivery das 20h às 23h.'
    expect(misto('17:00-19:00', depois)).toEqual([])
    expect(misto('17:00-19:00, 20:00-23:00', depois)).toEqual(['17:00-19:00'])
    expect(misto('17:00-19:00', 'Almoço executivo das 11h às 16h e happy hour das 17h às 19h.')).toEqual([])
  })
  it('os dados de campanha não vigiam o horário habitual', () => {
    const campanha = texto('Ceia de Natal por encomenda.', { id: 'natal', expiresAt: new Date('2026-12-26'), metadata: { hours: { monday: '11:00-14:00' } } })
    expect(divergenciasDaBase([campanha, texto('Segunda das 11h às 17h.')])).toEqual([])
  })
  it('entende os outros vocabulários: intervalo, todos os dias e 00:00', () => {
    const d = divergenciasDe({ horarios: { domingo: '11:30-16:00', segunda: '18:30-23:30', 'terca-sabado': '11:30-23:30' } }, [texto('Todos os dias das 11h30 às 23h30 (vigente desde 15/10/2026).')])
    expect(d.map((x) => x.campo).sort()).toEqual(['horarios.domingo', 'horarios.segunda'])
    expect(divergenciasDe({ horarios_funcionamento: { todos_os_dias: '11:00-00:00' } }, [texto('Todos os dias das 11h à meia-noite.')])).toEqual([])
  })

  it('campo alterado que contradiz o texto bloqueia, e o aceite nominal libera', async () => {
    const alteracoes = [{ campo: 'hours.monday', valor: '11:00-18:00' }]
    const proposta = await executarOperacaoDaBase(pedido({ alteracoes, confirmado: false }))
    expect(proposta).toMatchObject({ estado: 'proposta', bloqueiam: expect.arrayContaining(['hours.monday']) })
    await expect(executarOperacaoDaBase(pedido({ alteracoes }))).rejects.toMatchObject({ code: 'DIVERGENCIA_NAO_RESOLVIDA' })
    expect((linha().metadata as typeof META).hours.monday).toBe('11:00-16:00')
    expect(await executarOperacaoDaBase(pedido({ alteracoes, aceitarDivergencias: ['hours.monday'] }))).toMatchObject({ estado: 'concluida' })
    expect((base.operacoes[0].pedido as { aceitarDivergencias: string[] }).aceitarDivergencias).toEqual(['hours.monday'])
  })
  it('divergência em campo NÃO alterado é relatada e não trava nem muda o valor', async () => {
    base.entradas.set('hh', { ...structuredClone(linha()), id: 'hh', title: 'Happy Hour — Quintal (terça a sexta)', content: 'Terça a sexta, das 16h às 19h.', metadata: null })
    const r = (await executarOperacaoDaBase(pedido())) as { estado: string; divergencias: { campo: string }[] }
    expect(r.estado).toBe('concluida')
    expect(r.divergencias.map((d) => d.campo)).toEqual(['happy_hour.time'])
    expect((linha().metadata as typeof META).happy_hour.time).toBe('17:00-19:00')
  })
  it('tirar a data de perto do trecho conta como remover a exceção', async () => {
    const comExcecao = `${TEXTO}\nNatal: terça das 11h às 14h; quarta das 11h às 15h.`
    linha().content = comExcecao
    const semContexto = `${TEXTO}\nNatal: terça das 11h às 14h.\nquarta das 11h às 15h.`
    await expect(executarOperacaoDaBase(pedido({ alteracoes: undefined, content: semContexto, autorizarIndexacao: true, aceitarDivergencias: ['hours.monday', 'hours.wednesday'] }))).rejects.toMatchObject({ code: 'DIVERGENCIA_NAO_RESOLVIDA', details: { excecoesRemovidas: ['quarta das 11h às 15h.'] } })
    expect(linha().content).toBe(comExcecao)
  })
  it('texto novo que contradiz os dados de OUTRA entrada bloqueia', async () => {
    base.entradas.set('dados', { ...structuredClone(linha()), id: 'dados', title: 'Ficha', content: 'Ficha de horários sem frase de dia.', metadata: { hours: { ...HOURS, monday: '11:00-17:00' } } })
    linha().metadata = null
    linha().content = 'Funcionamento conforme a ficha da casa.'
    const novo = 'Segunda das 11h às 18h.'
    await expect(executarOperacaoDaBase(pedido({ alteracoes: undefined, content: novo, autorizarIndexacao: true }))).rejects.toMatchObject({ code: 'DIVERGENCIA_NAO_RESOLVIDA', details: { divergencias: [{ campo: 'hours.monday', entradaDosDados: 'dados', origem: { entradaId: ID } }] } })
    expect(linha().content).not.toBe(novo)
  })
  it('a proposta diz o que o sistema não comparou, e traz o texto antes e depois', async () => {
    const novo = TEXTO.replace('Domingo: das 11h às 17h.', 'Domingo: das 11h às 17h, sempre.')
    const r = (await executarOperacaoDaBase(pedido({ confirmado: false, content: novo, alteracoes: [...SEGUNDA, { campo: 'happy_hour.days', valor: 'wednesday-friday' }, { campo: 'address', valor: 'Rua Nova' }] }))) as unknown as { camposSemConferencia: string[]; diff: { campo: string; antes: unknown; depois: unknown }[] }
    expect(r.camposSemConferencia.sort()).toEqual(['address', 'happy_hour.days'])
    expect(r.diff.find((d) => d.campo === 'content')).toEqual({ campo: 'content', antes: TEXTO, depois: novo })
  })
  it('apagar exceção datada pelo texto exige aceite nominal', async () => {
    const comExcecao = `${TEXTO}\nDia 24/12 fechamos às 15h.`
    linha().content = comExcecao
    await expect(executarOperacaoDaBase(pedido({ alteracoes: undefined, content: TEXTO, autorizarIndexacao: true }))).rejects.toMatchObject({ code: 'DIVERGENCIA_NAO_RESOLVIDA', details: { excecoesRemovidas: ['Dia 24/12 fechamos às 15h.'] } })
    expect(linha().content).toBe(comExcecao)
  })
  it('o aviso do texto olha todas as entradas com horário nos dados', () => {
    expect(divergenciasDaBase([texto(TEXTO, { metadata: META })]).map((d) => d.campo)).toContain('hours.monday')
  })
})

describe('o serviço de cada frase, em entrada que fala de happy hour', () => {
  const texto = (content: string, title: string): LinhaDaBase => ({ id: 'e', title, content, updatedAt: new Date('2026-11-01T00:00:00Z'), expiresAt: null, metadata: null })
  const SO_HAPPY = 'Happy Hour — Quintal (terça a sexta)'
  const MISTO = 'Horário de funcionamento e happy hour — Quintal'
  const LINHA_DO_CIRO = 'Atualização de funcionamento — Ciro, chamada de voz de 02/11/2026: segunda-feira e domingo funcionam habitualmente das 11h às 17h; não é exceção de feriado. Demais dias e horários de almoço executivo e happy hour permanecem inalterados.'
  const CERTO = { hours: { ...HOURS, monday: '11:00-17:00' }, happy_hour: { ...HAPPY, time: '16:00-19:00' } }
  const achado = (dados: Record<string, unknown>, content: string, title: string) => divergenciasDe(dados, [texto(content, title)]).map((d) => [d.campo, d.valorNoTexto])

  it('título misto: cada linha vale para o seu serviço', () => {
    const conteudo = 'Segunda das 11h às 17h.\nHappy hour das 16h às 19h.'
    expect(achado(CERTO, conteudo, MISTO)).toEqual([])
    expect(achado({ ...CERTO, hours: HOURS }, conteudo, MISTO)).toEqual([['hours.monday', '11:00-17:00']])
    expect(achado({ ...CERTO, happy_hour: HAPPY }, conteudo, MISTO)).toEqual([['happy_hour.time', '16:00-19:00']])
    expect(achado(CERTO, 'Segunda das 11h às 17h.', 'Horários e happy hour — Quintal')).toEqual([])
  })
  it('a linha de funcionamento numa entrada de happy hour não é happy hour', () => {
    expect(achado(CERTO, LINHA_DO_CIRO, SO_HAPPY)).toEqual([])
    // Continua sendo fato: acusa o funcionamento, que é o assunto dela.
    expect(achado({ ...CERTO, hours: HOURS }, LINHA_DO_CIRO, SO_HAPPY)).toEqual([['hours.monday', '11:00-17:00']])
  })
  it('funcionamento e happy hour na mesma frase: um não apaga nem contamina o outro', () => {
    const frase = 'Segunda e domingo das 11h às 17h, happy hour das 16h às 19h.'
    expect(achado(CERTO, frase, 'Ficha')).toEqual([])
    expect(achado({ ...CERTO, hours: HOURS }, frase, 'Ficha')).toEqual([['hours.monday', '11:00-17:00']])
    expect(achado({ ...CERTO, happy_hour: HAPPY }, frase, 'Ficha')).toEqual([['happy_hour.time', '16:00-19:00']])
    expect(achado(CERTO, frase, SO_HAPPY)).toEqual([])
  })
  it('o horário sem sujeito segue sendo do happy hour na entrada exclusiva', () => {
    expect(achado({ happy_hour: HAPPY }, 'Terça a sexta, das 16h às 19h.', SO_HAPPY)).toEqual([['happy_hour.time', '16:00-19:00']])
    expect(achado({ happy_hour: { time: '16:00-19:00' } }, 'Terça a sexta, das 16h às 19h.', SO_HAPPY)).toEqual([])
    expect(achado({ hours: HOURS }, 'Terça a sexta, das 16h às 19h.', SO_HAPPY)).toEqual([])
    expect(achado({ hours: HOURS }, 'Dias e horários: terça a sexta, das 16h às 19h.', SO_HAPPY)).toEqual([])
    expect(achado({ happy_hour: HAPPY }, 'Dias e horários: terça a sexta, das 16h às 19h.', SO_HAPPY)).toEqual([['happy_hour.time', '16:00-19:00']])
  })
  it('exceção datada e almoço não se misturam com o happy hour', () => {
    const ruido = ['Natal: das 11h às 15h.', 'Feriado: happy hour das 18h às 20h.', 'Em 24/12, happy hour das 12h às 14h.', 'Almoço das 11h às 15h.', 'Almoço executivo das 11h às 16h.', 'Jantar das 19h às 23h.']
    for (const r of ruido) expect(achado(CERTO, r, SO_HAPPY)).toEqual([])
    expect(achado(CERTO, 'Almoço de terça a sexta das 11h às 15h e happy hour das 16h às 19h.', MISTO)).toEqual([])
    expect(achado({ ...CERTO, happy_hour: HAPPY }, 'Almoço de terça a sexta das 11h às 15h e happy hour das 16h às 19h.', MISTO)).toEqual([['happy_hour.time', '16:00-19:00']])
  })
  it('título exclusivo que fala de horários segue exclusivo', () => {
    expect(achado({ happy_hour: HAPPY, hours: HOURS }, 'Terça a sexta, das 16h às 19h.', 'Happy Hour — dias e horários')).toEqual([['happy_hour.time', '16:00-19:00']])
  })
  it('o que vem depois da faixa não muda de quem ela é', () => {
    for (const frase of ['Terça a sexta, das 16h às 19h, na varanda aberta.', 'Terça a sexta, das 16h às 19h, antes do jantar.', 'Terça a sexta, das 16h às 19h, com atendimento no salão.']) {
      expect(achado({ happy_hour: HAPPY, hours: HOURS }, frase, SO_HAPPY)).toEqual([['happy_hour.time', '16:00-19:00']])
    }
  })
  it('jantar com dia antes do happy hour não vira funcionamento', () => {
    const frase = 'Jantar de terça a sexta das 19h às 23h e happy hour das 16h às 19h.'
    expect(achado(CERTO, frase, 'Ficha')).toEqual([])
    expect(achado(CERTO, 'Jantar de terça a sexta das 19h às 23h.', 'Ficha')).toEqual([])
  })
  it('a mesma faixa antes da citação é o happy hour se apresentando', () => {
    const frase = 'Terça a sexta das 16h às 19h: nosso happy hour tem chope em dobro das 16h às 19h.'
    expect(achado(CERTO, frase, SO_HAPPY)).toEqual([])
    expect(achado({ ...CERTO, happy_hour: HAPPY }, frase, SO_HAPPY)).toEqual([['happy_hour.time', '16:00-19:00']])
  })
  it('sem faixa própria o happy hour não leva a frase junto', () => {
    expect(achado(CERTO, 'Terça a sexta, das 16h às 19h, tem happy hour.', 'Ficha')).toEqual([])
  })
  it('alterar o happy hour: a linha de funcionamento não bloqueia e o conflito verdadeiro bloqueia', async () => {
    const entrada = (content: string) => base.entradas.set('hh', { ...structuredClone(linha()), id: 'hh', title: SO_HAPPY, content, metadata: null })
    linha().metadata = { ...structuredClone(META), hours: { ...HOURS, monday: '11:00-17:00' } }
    entrada(`Terça a sexta, das 16h às 19h.\n\n${LINHA_DO_CIRO}`)
    const alteracoes = [{ campo: 'happy_hour.time', valor: '16:00-19:00' }]
    expect(await executarOperacaoDaBase(pedido({ alteracoes, confirmado: false }))).toMatchObject({ estado: 'proposta', bloqueiam: [] })
    const errado = [{ campo: 'happy_hour.time', valor: '18:00-19:00' }]
    await expect(executarOperacaoDaBase(pedido({ alteracoes: errado }))).rejects.toMatchObject({ code: 'DIVERGENCIA_NAO_RESOLVIDA' })
    expect((linha().metadata as typeof META).happy_hour.time).toBe('17:00-19:00')
  })
})

describe('indexação', () => {
  const NOVO = TEXTO.replace('Domingo: das 11h às 17h.', 'Domingo: das 11h às 17h, sempre.')

  it('texto novo sem autorização não grava nada', async () => {
    await expect(executarOperacaoDaBase(pedido({ content: NOVO }))).rejects.toMatchObject({ code: 'INDEXACAO_NAO_AUTORIZADA', details: { indexacao: { necessaria: true } } })
    expect(linha().content).toBe(TEXTO)
    expect(base.operacoes).toHaveLength(0)
  })
  it('texto acima do teto é recusado antes de custar nada', async () => {
    await expect(executarOperacaoDaBase(pedido({ content: `${TEXTO}\n${'x '.repeat(2600)}`, autorizarIndexacao: true }))).rejects.toMatchObject({ code: 'TEXTO_ACIMA_DO_TETO' })
    expect(embeddings).not.toHaveBeenCalled()
  })
  it('com autorização grava texto e dados juntos e só conclui com o índice em dia', async () => {
    const r = await executarOperacaoDaBase(pedido({ content: NOVO, autorizarIndexacao: true }))
    expect(r).toMatchObject({ estado: 'concluida', indexacao: { necessaria: true } })
    expect(embeddings).toHaveBeenCalledTimes(1)
    expect(base.chunks.map((c) => c.content)).toEqual(chunkText(NOVO).map((c) => c.content))
    expect(linha().metadata).toMatchObject({ hours: { monday: '11:00-17:00' } })
    expect(await consultarOperacaoDaBase({ projectId: 2, operacaoId: 'quintal-segunda-17h' })).toMatchObject({ estado: 'concluida', indiceConfere: true })
  })
  it('falha da indexação não vira sucesso, e repetir o mesmo id retoma sem reescrever', async () => {
    embeddings.mockRejectedValueOnce(new Error('embeddings fora do ar'))
    const versaoLida = versao()
    const r = await executarOperacaoDaBase(pedido({ content: NOVO, autorizarIndexacao: true }))
    expect(r).toMatchObject({ estado: 'indexacao_falhou', gravado: true, mensagem: expect.stringContaining('embeddings fora do ar') })
    expect(linha().content).toBe(NOVO)
    expect(await consultarOperacaoDaBase({ projectId: 2, operacaoId: 'quintal-segunda-17h' })).toMatchObject({ estado: 'indexacao_falhou', indiceConfere: false })

    const carimbo = versao()
    await expect(executarOperacaoDaBase(pedido({ operacaoId: 'outra-operacao', versaoEsperada: carimbo, alteracoes: [{ campo: 'address', valor: 'Outra rua' }] }))).rejects.toMatchObject({ code: 'INDEXACAO_PENDENTE_NA_ENTRADA', details: { operacaoPendente: 'quintal-segunda-17h' } })

    expect(await executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida, content: NOVO, autorizarIndexacao: true, confirmado: false }))).toMatchObject({ estado: 'indexacao_falhou', repetida: true })
    expect(embeddings).toHaveBeenCalledTimes(1)

    const retomada = await executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida, content: NOVO, autorizarIndexacao: true }))
    expect(retomada).toMatchObject({ estado: 'concluida', repetida: true })
    expect(versao()).toBe(carimbo)
    expect(base.operacoes).toHaveLength(1)
  })
  it('retomar não indexa texto que a operação não autorizou', async () => {
    embeddings.mockRejectedValueOnce(new Error('embeddings fora do ar'))
    const versaoLida = versao()
    await executarOperacaoDaBase(pedido({ content: NOVO, autorizarIndexacao: true }))
    linha().content = `${NOVO}\nmudou pelo site`
    embeddings.mockClear()
    expect(await executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida, content: NOVO, autorizarIndexacao: true }))).toMatchObject({ estado: 'superada', gravado: true })
    expect(embeddings).not.toHaveBeenCalled()
    expect(await executarOperacaoDaBase(pedido({ operacaoId: 'operacao-seguinte', alteracoes: [{ campo: 'address', valor: 'Rua Nova' }], autorizarIndexacao: true }))).toMatchObject({ gravado: true })
  })
  it('o texto muda entre a repetição e a aquisição: nada se apaga e a operação vira superada', async () => {
    embeddings.mockRejectedValueOnce(new Error('embeddings fora do ar'))
    const versaoLida = versao()
    await executarOperacaoDaBase(pedido({ content: NOVO, autorizarIndexacao: true }))
    linha().content = `${NOVO}\nmudou no último instante`
    const [chunks, vetores] = [structuredClone(base.chunks), base.vetores.size]
    embeddings.mockClear()
    expect(await executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida, content: NOVO, autorizarIndexacao: true }))).toMatchObject({ estado: 'superada' })
    expect(embeddings).not.toHaveBeenCalled()
    expect(base.chunks).toEqual(chunks)
    expect(base.vetores.size).toBe(vetores)
  })
  it('a tentativa antiga não publica o resultado por cima da mais nova', async () => {
    embeddings.mockRejectedValueOnce(new Error('embeddings fora do ar'))
    const versaoLida = versao()
    await executarOperacaoDaBase(pedido({ content: NOVO, autorizarIndexacao: true }))
    const parada = barreira()
    embeddings.mockImplementationOnce(async (textos: string[]) => {
      await parada.parar()
      return textos.map(() => [0.1, 0.2])
    })
    const repete = () => executarOperacaoDaBase(pedido({ versaoEsperada: versaoLida, content: NOVO, autorizarIndexacao: true }))
    const primeira = repete()
    await parada.chegou
    expect(await repete()).toMatchObject({ estado: 'indexacao_pendente' })
    parada.liberar()
    expect(await primeira).toMatchObject({ estado: 'indexacao_pendente' })
    expect(await repete()).toMatchObject({ estado: 'concluida' })
  })
  it('chunk certo sem vetor não é índice em dia', async () => {
    base.vetores.clear()
    const proposta = await executarOperacaoDaBase(pedido({ confirmado: false }))
    expect(proposta).toMatchObject({ indexacao: { necessaria: true, motivo: expect.stringContaining('vetores') } })
    await expect(executarOperacaoDaBase(pedido())).rejects.toMatchObject({ code: 'INDEXACAO_NAO_AUTORIZADA' })
    expect(await executarOperacaoDaBase(pedido({ autorizarIndexacao: true }))).toMatchObject({ estado: 'concluida' })
    expect(base.vetores.size).toBeGreaterThan(0)
  })
  it('índice que não responde não conta como conferido', async () => {
    const espiao = vi.spyOn(IndiceFalso.prototype, 'fetch').mockRejectedValue(new Error('upstash fora'))
    await expect(executarOperacaoDaBase(pedido())).rejects.toMatchObject({ code: 'INDEXACAO_NAO_AUTORIZADA' })
    espiao.mockRestore()
    expect(linha().metadata).toEqual(META)
  })
  it('indexação em curso recusa o texto novo antes de gravar', async () => {
    linha().metadata = { ...META, cicloExpiraEm: new Date(Date.now() + 60_000).toISOString() }
    await expect(executarOperacaoDaBase(pedido({ content: NOVO, autorizarIndexacao: true }))).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
    expect(linha().content).toBe(TEXTO)
  })
  it('dados com índice já furado também exigem reindexar: não há sucesso sobre índice inconsistente', async () => {
    base.chunks = []
    await expect(executarOperacaoDaBase(pedido())).rejects.toMatchObject({ code: 'INDEXACAO_NAO_AUTORIZADA' })
    expect(await executarOperacaoDaBase(pedido({ autorizarIndexacao: true }))).toMatchObject({ estado: 'concluida' })
    expect(base.chunks.length).toBeGreaterThan(0)
  })
})

describe('acesso', () => {
  it.each(['atualizar-dados-entrada-base', 'consultar-operacao-base'])('%s passa pelo gate de projeto e fica fora do perfil draft-only', (nome) => {
    expect(CATALOGO.get(nome)?.acesso).toEqual({ tipo: 'projeto' })
    expect(TOOLS_DRAFT_ONLY.has(nome)).toBe(false)
  })
})

describe('leitura', () => {
  it('consultar-base não mostra chave do sistema como dado do cliente', () => {
    expect(dadosVisiveis({ ...META, origem: 'chat', indexadoEm: 'x', cicloExpiraEm: 'y' })).toEqual({ hours: HOURS, address: ADDRESS, happy_hour: HAPPY })
    expect(dadosVisiveis({ cicloDeIndexacao: 'c' })).toBeUndefined()
  })
  it('sem operação nada foi gravado, e a trilha lista o que houve', async () => {
    expect(await consultarOperacaoDaBase({ projectId: 2, operacaoId: 'nao-existe' })).toMatchObject({ estado: 'nao_encontrada', gravado: false })
    await executarOperacaoDaBase(pedido())
    expect(await consultarOperacaoDaBase({ projectId: 2, entradaId: ID })).toMatchObject({ count: 1, operacoes: [{ operacaoId: 'quintal-segunda-17h', estado: 'concluida' }] })
  })
  it('a operação concluída não atesta a entrada de agora', async () => {
    await executarOperacaoDaBase(pedido())
    const ok = await consultarOperacaoDaBase({ projectId: 2, operacaoId: 'quintal-segunda-17h' })
    expect(ok).toMatchObject({ estado: 'concluida', indiceConfere: true, mensagem: expect.stringContaining('ficou em dia') })
    linha().content = `${TEXTO}\nmudou depois`
    expect(await consultarOperacaoDaBase({ projectId: 2, operacaoId: 'quintal-segunda-17h' })).toMatchObject({ estado: 'concluida', indiceConfere: false, mensagem: expect.stringContaining('mudou depois') })
    base.entradas.delete(ID)
    expect(await consultarOperacaoDaBase({ projectId: 2, operacaoId: 'quintal-segunda-17h' })).toMatchObject({ indiceConfere: null, mensagem: expect.stringContaining('não existe mais') })
  })
  it('repetir o id com outra versão esperada é outro pedido', async () => {
    await executarOperacaoDaBase(pedido())
    await expect(executarOperacaoDaBase(pedido({ versaoEsperada: 'outra-versao' }))).rejects.toMatchObject({ code: 'OPERACAO_REUTILIZADA' })
  })
})
