import { describe, expect, it } from 'vitest'
import { CATEGORIAS_DA_BASE } from '@/lib/mcp/catalogo/base-e-dna'
import { lerVoz, TETO_DO_PROMPT_DA_VOZ, vozParaPrompt, vozVazia, type VozCompacta } from '../voz'
import {
  CATEGORIAS_DE_FATO,
  chaveDoFato,
  classificarFato,
  coberturaDasRegrasLegadas,
  computeDe,
  divergenciasDoFato,
  ehPooler,
  mesmoBanco,
  nomeDoBancoDe,
  trechosRepetidos,
  condicoesOperacionais,
  fatosNaVoz,
  fatosNoDna,
  isolamentoDoCache,
  isolamentoDoIndexador,
  lerManifesto,
  diaExiste,
  linhasDaSecaoLegada,
  manifestoEmBranco,
  montarPrevia,
  planoDeAplicacao,
  podeIndexar,
  previaParaMarkdown,
  problemasParaMigrar,
  VERSAO_DO_MANIFESTO,
  versaoDaPrevia,
  type EstadoDoCliente,
  type Manifesto,
} from '../migracao-da-voz'
import { dnaDiverge } from '../voz'
import { PROJETOS_COM_VOZ_PROPOSTA, VOZES_PROPOSTAS } from '../../../../scripts/lib/vozes-propostas'

const regra = (id: string, texto: string, extra: Partial<VozCompacta['regras'][number]> = {}): VozCompacta['regras'][number] => ({ id, texto, motivo: 'motivo de teste', em: '2026-09-01', escopo: 'copy', ativa: true, ...extra })
const vozDeTeste = (parcial: Partial<VozCompacta> = {}): VozCompacta => ({ ...vozVazia('Voz de prova, direta e acolhedora.'), ...parcial })

const DNA_COM_SECAO = `Tom doce e direto. O gelato custa R$ 25 hoje.

Regras aprendidas na prática:
- Meia-noite se escreve por extenso, nunca em numeral (2026-08-16 — artes de sexta)
- Toda peça diz de qual unidade fala (2026-08-11 - feedback da bancada)
- curta

Outra seção que não é item de lista.`

describe('a seção legada e os fatos do DNA', () => {
  it('linhasDaSecaoLegada: lê os itens da seção "Regras aprendidas na prática" sem o "(data — motivo)", para no primeiro parágrafo fora da lista e descarta linha curta; sem a seção, nada', () => {
    const linhas = linhasDaSecaoLegada(DNA_COM_SECAO)
    expect(linhas).toEqual([
      { texto: 'Meia-noite se escreve por extenso, nunca em numeral', em: '2026-08-16' },
      { texto: 'Toda peça diz de qual unidade fala', em: '2026-08-11' },
    ])
    expect(linhasDaSecaoLegada('Só o tom, sem seção.')).toEqual([])
    expect(linhasDaSecaoLegada(null)).toEqual([])
  })

  it('fatosNoDna: só as frases com dado, com a origem; o rodapé "(data — motivo)" da regra legada NÃO é fato; a mesma frase não repete; sem texto, nada', () => {
    const fatos = fatosNoDna({ toneOfVoice: DNA_COM_SECAO, contentRules: 'Happy hour das 17h às 19h. Nunca gritar.' })
    expect(fatos.map((f) => [f.origem, f.trecho, f.tipos])).toEqual([
      ['toneOfVoice', 'O gelato custa R$ 25 hoje.', ['preco']],
      ['contentRules', 'Happy hour das 17h às 19h.', ['horario']],
    ])
    expect(fatosNoDna({ toneOfVoice: null, contentRules: null })).toEqual([])
  })
})

describe('dado dentro da voz proposta', () => {
  it('preço na descrição, horário no exemplo e no motivo da regra são dado; data no motivo não é (o motivo só olha preço e horário)', () => {
    const voz = vozDeTeste({
      descricao: 'Premium e doce. O gelato custa R$ 25.',
      exemplos: ['Happy hour das 17h às 19h'],
      regras: [regra('r1', 'Nunca fatiar uma frase entre blocos.', { motivo: 'observado em 12/08/2026 nas artes, às 19h' }), regra('r2', 'Regra inativa com 50% de desconto', { ativa: false })],
    })
    const achados = fatosNaVoz(voz)
    expect(achados.map((a) => [a.caminho, a.tipos])).toEqual([
      ['descricao', ['preco']],
      ['exemplos.0', ['horario']],
      ['regras.0.motivo', ['horario']],
    ])
  })

  it('em PROIBIÇÃO e REGRA a palavra nua "promoção"/"desconto"/"grátis" é vocabulário proibido, não dado; percentual e "leve X pague Y" continuam sendo dado; a mesma palavra na descrição é dado', () => {
    const limpa = vozDeTeste({ proibicoes: ['as palavras promoção, desconto e grátis não existem'], regras: [regra('r1', 'Nunca escrever "promoção" nem "cortesia" na manchete.')] })
    expect(fatosNaVoz(limpa)).toEqual([])
    const comNumero = vozDeTeste({ proibicoes: ['20% de desconto na primeira compra'], regras: [regra('r1', 'Leve 2 pague 1 só às terças.')] })
    expect(fatosNaVoz(comNumero).map((a) => a.caminho)).toEqual(['proibicoes.0', 'regras.0.texto'])
    expect(fatosNaVoz(vozDeTeste({ descricao: 'Sempre com promoção.' })).map((a) => a.caminho)).toEqual(['descricao'])
    // PR13-25: disponibilidade, programa fixo do dia e dia fechado são condição da casa — fato no DNA, recusados na voz
    expect(fatosNaVoz(vozDeTeste({ exemplos: ['HAPPY HOUR TODO DIA'] })).map((a) => a.caminho)).toEqual(['exemplos.0'])
    expect(fatosNaVoz(vozDeTeste({ exemplos: ['QUINTA É DIA DE VINHO'] })).map((a) => a.caminho)).toEqual(['exemplos.0'])
    expect(fatosNaVoz(vozDeTeste({ proibicoes: ['convidar para segunda-feira (a casa está fechada)'] })).map((a) => a.caminho)).toEqual(['proibicoes.0'])
    expect(fatosNaVoz(vozDeTeste({ proibicoes: ['convidar para dia sem funcionamento: os dias em que a casa recebe vêm da base, na data da peça'] }))).toEqual([])
    // editorial que só MENCIONA o dia, sem afirmar disponibilidade, passa; "lista fechada" e "menu fechado" não são dia fechado
    expect(fatosNaVoz(vozDeTeste({ exemplos: ['SEXTA NA WINE VIX', 'Sábado para celebrar', 'Domingo merece'] }))).toEqual([])
    expect(fatosNaVoz(vozDeTeste({ regras: [{ id: 'r1', texto: 'CTA de lista fechada, cópia literal; valor de menu fechado de evento não entra.', motivo: 'm', em: '2026-09-01', escopo: 'copy', ativa: true }] }))).toEqual([])
    const dnaComCondicoes = fatosNoDna({ toneOfVoice: 'Fale de happy hour todo dia com energia.\nQuinta é dia de vinho na casa.', contentRules: 'Nunca convide para segunda-feira: a casa está fechada.' })
    expect(dnaComCondicoes.map((f) => f.tipos.includes('condicao'))).toEqual([true, true, true])
  })
})

describe('a cobertura das regras legadas e a versão da prévia', () => {
  it('a linha legada coberta aponta a regra (ou a proibição) da voz que fala do mesmo assunto; a sem correspondente é declarada', () => {
    const voz = vozDeTeste({ regras: [regra('regra-meia-noite', 'Meia-noite se escreve por extenso, nunca em numeral.')], proibicoes: ['a palavra promoção'] })
    const cobertura = coberturaDasRegrasLegadas({ toneOfVoice: DNA_COM_SECAO, contentRules: null }, voz)
    expect(cobertura.map((c) => [c.texto, c.situacao, c.correspondentes])).toEqual([
      ['Meia-noite se escreve por extenso, nunca em numeral', 'coberta', ['regra-meia-noite']],
      ['Toda peça diz de qual unidade fala', 'sem-correspondente', []],
    ])
  })

  it('a versão é do CONTEÚDO: mesma entrada → mesma versão; DNA ou voz mudando uma letra → outra; a ordem das chaves da voz não conta', () => {
    const dna = { toneOfVoice: 'a', contentRules: 'b' }
    const voz = { versao: 'voz-v1', descricao: 'x', regras: [] }
    const v = versaoDaPrevia({ dna, voz })
    expect(v).toHaveLength(16)
    expect(versaoDaPrevia({ dna: { ...dna, updatedAt: new Date() }, voz })).toBe(v)
    expect(versaoDaPrevia({ dna, voz: { regras: [], descricao: 'x', versao: 'voz-v1' } })).toBe(v)
    expect(versaoDaPrevia({ dna: { ...dna, contentRules: 'b.' }, voz })).not.toBe(v)
    expect(versaoDaPrevia({ dna, voz: { ...voz, descricao: 'x.' } })).not.toBe(v)
  })
})

describe('a prévia', () => {
  it('voz válida: prompt medido contra o teto, contagens, fatos do DNA como aviso, regra legada sem correspondente como aviso; o markdown traz as seções', () => {
    const voz = vozDeTeste({ regras: [regra('regra-meia-noite', 'Meia-noite se escreve por extenso, nunca em numeral.')], exemplos: ['Sua pausa com sabores Real'], termos: ['gelato'] })
    const p = montarPrevia({ projectId: 1, nome: 'Real', dna: { toneOfVoice: DNA_COM_SECAO, contentRules: null, updatedAt: new Date('2026-09-10T12:00:00Z') }, voz, agora: new Date('2026-09-12T10:00:00Z') })
    expect(p.problemasDaVoz).toEqual([])
    expect(p.depois.chars).toBe(p.depois.prompt.length)
    expect(p.depois.teto).toBe(TETO_DO_PROMPT_DA_VOZ)
    expect(p.depois).toMatchObject({ regras: 1, exemplos: 1, termos: 1, proibicoes: 0 })
    expect(p.antes).toEqual({ toneOfVoiceChars: DNA_COM_SECAO.length, contentRulesChars: 0, regrasLegadas: 2, dnaAtualizadoEm: '2026-09-10T12:00:00.000Z', toneOfVoice: DNA_COM_SECAO, contentRules: null })
    expect(p.fatos.noLegado.map((f) => f.trecho)).toEqual(['O gelato custa R$ 25 hoje.'])
    expect(p.fatos.naVoz).toEqual([])
    expect(p.avisos.some((a) => /1 regra\(s\) aprendida\(s\) do DNA sem correspondente/.test(a))).toBe(true)
    expect(p.avisos.some((a) => /1 frase\(s\) do DNA carregam dado/.test(a))).toBe(true)
    expect(p.geradaEm).toBe('2026-09-12T10:00:00.000Z')
    const md = previaParaMarkdown(p)
    for (const secao of ['# Real (projeto 1)', 'Versão da prévia: `' + p.versaoDaPrevia + '`', '## Antes', '## Depois', '## Regras aprendidas no DNA × a voz', '✓ [toneOfVoice, 2026-08-16] Meia-noite', '○ [toneOfVoice, 2026-08-11] Toda peça', '## Fatos no DNA', 'O gelato custa R$ 25 hoje.', '## Avisos']) {
      expect(md).toContain(secao)
    }
    expect(md).not.toContain('NÃO passa no contrato')
  })

  it('voz que NÃO passa no contrato: a prévia sai com os problemas, prompt vazio e o aviso de que a migração é impossível; o markdown grita', () => {
    const p = montarPrevia({ projectId: 3, nome: 'TERO', dna: { toneOfVoice: 'tom', contentRules: null }, voz: { versao: 'voz-v1' } })
    expect(p.problemasDaVoz.length).toBeGreaterThan(0)
    expect(p.depois.prompt).toBe('')
    expect(p.regrasLegadas).toEqual([])
    expect(p.avisos.some((a) => /impossível/.test(a))).toBe(true)
    expect(previaParaMarkdown(p)).toContain('## ⚠️ A voz proposta NÃO passa no contrato')
  })
})

describe('o manifesto', () => {
  const clienteOk = { projectId: 1, nome: 'Real', versaoDaPrevia: 'abcdef0123456789', decisao: 'migrar' as const, aprovadoPor: 'Ciro', aprovadoEm: '2026-09-12', fatosParaABase: [] }
  const base = { versao: VERSAO_DO_MANIFESTO, geradoEm: '2026-09-12T10:00:00.000Z' }

  it('em branco a partir das prévias: tudo pendente, com a versão de cada prévia', () => {
    const previas = [montarPrevia({ projectId: 1, nome: 'Real', dna: { toneOfVoice: 'a', contentRules: null }, voz: vozDeTeste() }), montarPrevia({ projectId: 2, nome: 'Quintal', dna: { toneOfVoice: 'b', contentRules: null }, voz: vozDeTeste() })]
    const m = manifestoEmBranco(previas, new Date('2026-09-12T10:00:00.000Z'))
    expect(m.versao).toBe(VERSAO_DO_MANIFESTO)
    expect(m.clientes.map((c) => [c.projectId, c.decisao, c.versaoDaPrevia])).toEqual([[1, 'pendente', previas[0].versaoDaPrevia], [2, 'pendente', previas[1].versaoDaPrevia]])
    expect(lerManifesto(m).manifesto).not.toBeNull()
  })

  it('lê o manifesto válido; decisão sem aprovadoPor/aprovadoEm, fato fora de "migrar" e projeto repetido voltam TODOS de uma vez; versão desconhecida e chave estranha são recusadas pelo schema', () => {
    expect(lerManifesto({ ...base, clientes: [clienteOk] }).manifesto?.clientes[0].decisao).toBe('migrar')
    const ruim = lerManifesto({
      ...base,
      clientes: [
        { ...clienteOk, aprovadoPor: undefined },
        { projectId: 2, nome: 'Quintal', versaoDaPrevia: 'abcdef0123456789', decisao: 'manter-legado', aprovadoPor: 'Ciro', aprovadoEm: '2026-09-12', fatosParaABase: [{ trecho: 'Happy hour das 17h às 19h', categoria: 'HORARIOS', titulo: 'Happy hour' }] },
        { ...clienteOk, aprovadoPor: 'Ciro' },
      ],
    })
    expect(ruim.manifesto).toBeNull()
    expect(ruim.problemas).toEqual([
      'clientes.1: decisão "migrar" precisa de aprovadoPor e aprovadoEm — silêncio não é aprovação',
      'clientes.2: fatosParaABase só vale com decisão "migrar" (o legado continua guardando o fato)',
      'manifesto: projeto 1 aparece 2×',
    ])
    expect(lerManifesto({ ...base, versao: 'manifesto-voz-v0', clientes: [clienteOk] }).problemas.some((p) => /versao/.test(p))).toBe(true)
    expect(lerManifesto({ ...base, clientes: [{ ...clienteOk, extra: 1 }] }).manifesto).toBeNull()
    expect(lerManifesto({ ...base, clientes: [] }).manifesto).toBeNull()
  })

  it('PR13-24: recusa data que não existe no calendário em validaAte e aprovadoEm, antes de qualquer escrita', () => {
    expect(diaExiste('2028-02-29')).toBe(true)
    expect(diaExiste('2026-02-29')).toBe(false)
    expect(diaExiste('2026-13-01')).toBe(false)
    expect(diaExiste('2026-1-01')).toBe(false)
    const comFatoRuim = lerManifesto({
      ...base,
      clientes: [{ ...clienteOk, fatosParaABase: [{ trecho: 'chopp em dobro das 17h às 19h', categoria: 'PROMOCOES', titulo: 'Happy em dobro', validaAte: '2026-13-01' }] }],
    })
    expect(comFatoRuim.manifesto).toBeNull()
    expect(comFatoRuim.problemas.some((p) => /validaAte/.test(p) && /calend/.test(p))).toBe(true)
    const aprovadoRuim = lerManifesto({ ...base, clientes: [{ ...clienteOk, aprovadoEm: '2026-02-29' }] })
    expect(aprovadoRuim.manifesto).toBeNull()
    expect(aprovadoRuim.problemas.some((p) => /aprovadoEm/.test(p))).toBe(true)
    const bissexto = lerManifesto({ ...base, clientes: [{ ...clienteOk, aprovadoEm: '2028-02-29' }] })
    expect(bissexto.manifesto).not.toBeNull()
  })

  it('o plano: pendente e manter-legado não escrevem; já migrado é dito; voz inválida, prévia que mudou e fato fora da prévia BLOQUEIAM; migrar leva a versão lida e os fatos', () => {
    const estado = (parcial: Partial<EstadoDoCliente> = {}): EstadoDoCliente => ({ versaoDaPreviaAtual: 'abcdef0123456789', trechosDeFato: ['Happy hour das 17h às 19h.'], registro: null, vozValida: true, ...parcial })
    const fato = { trecho: 'Happy hour das 17h às 19h.', categoria: 'HORARIOS' as const, titulo: 'Happy hour' }
    const m: Manifesto = {
      ...base,
      clientes: [
        { ...clienteOk, projectId: 1, decisao: 'pendente', aprovadoPor: undefined, aprovadoEm: undefined },
        { ...clienteOk, projectId: 2, decisao: 'manter-legado' },
        { ...clienteOk, projectId: 3 },
        { ...clienteOk, projectId: 4 },
        { ...clienteOk, projectId: 5 },
        { ...clienteOk, projectId: 6, fatosParaABase: [fato, { ...fato, trecho: 'Frase que a prévia não lista' }] },
        { ...clienteOk, projectId: 7, fatosParaABase: [fato] },
        { ...clienteOk, projectId: 8 },
      ],
    }
    const estados = new Map<number, EstadoDoCliente>([
      [3, estado({ registro: { versao: 2, migradaEm: new Date('2026-09-12') } })],
      [4, estado({ vozValida: false })],
      [5, estado({ versaoDaPreviaAtual: 'ffffffffffffffff' })],
      [6, estado()],
      [7, estado({ registro: { versao: 3, migradaEm: null } })],
      [8, estado()],
    ])
    const plano = planoDeAplicacao(m, estados)
    expect(plano.map((a) => [a.projectId, a.acao])).toEqual([[1, 'pendente'], [2, 'manter-legado'], [3, 'ja-migrado'], [4, 'bloqueado'], [5, 'bloqueado'], [6, 'bloqueado'], [7, 'migrar'], [8, 'migrar']])
    const motivo = (id: number) => (plano.find((a) => a.projectId === id) as { motivo?: string }).motivo ?? ''
    expect(motivo(4)).toMatch(/não passa no contrato/)
    expect(motivo(5)).toMatch(/prévia mudou.*aprovada abcdef0123456789, atual ffffffffffffffff/)
    expect(motivo(6)).toMatch(/fato\(s\) do manifesto que a prévia não lista: "Frase que a prévia não lista"/)
    expect(plano.find((a) => a.projectId === 7)).toMatchObject({ acao: 'migrar', versaoEsperadaDaVoz: 3, fatos: [fato] })
    expect(plano.find((a) => a.projectId === 8)).toMatchObject({ acao: 'migrar', versaoEsperadaDaVoz: 0, fatos: [] })
    // cliente do manifesto sem estado lido (sem DNA/voz proposta) é bloqueado, nunca migrado
    const semEstado = planoDeAplicacao({ ...base, clientes: [{ ...clienteOk, projectId: 99 }] }, new Map())
    expect(semEstado[0]).toMatchObject({ acao: 'bloqueado' })
  })

  it('as categorias de fato são categorias da base e TOM_DE_VOZ fica de fora (identidade nunca volta para a base)', () => {
    for (const c of CATEGORIAS_DE_FATO) expect(CATEGORIAS_DA_BASE).toContain(c)
    expect(CATEGORIAS_DE_FATO).not.toContain('TOM_DE_VOZ')
  })
})

describe('as vozes propostas da carteira (scripts/lib/vozes-propostas.ts)', () => {
  it('toda voz passa no contrato, não carrega dado, cabe no teto do prompt e traz a regra da copy curta de 01/09; a lista de projetos é a das chaves, ordenada', () => {
    expect(PROJETOS_COM_VOZ_PROPOSTA).toEqual(Object.keys(VOZES_PROPOSTAS).map(Number).sort((a, b) => a - b))
    expect(PROJETOS_COM_VOZ_PROPOSTA.length).toBeGreaterThanOrEqual(10)
    for (const id of PROJETOS_COM_VOZ_PROPOSTA) {
      const { nome, voz } = VOZES_PROPOSTAS[id]
      const lida = lerVoz(voz)
      expect(lida.problemas, `${id} ${nome}`).toEqual([])
      expect(fatosNaVoz(voz), `${id} ${nome}`).toEqual([])
      expect(problemasParaMigrar(voz), `${id} ${nome}`).toEqual([])
      const prompt = vozParaPrompt(voz, { escopo: 'copy' })
      expect(prompt.length, `${id} ${nome}`).toBeLessThanOrEqual(TETO_DO_PROMPT_DA_VOZ)
      expect(prompt.length, `${id} ${nome}`).toBeGreaterThan(400)
      // a regra da copy curta (Ciro, 01/09) vale para a carteira de RESTAURANTES; a Lagosta Criativa (8) é a agência
      if (id !== 8) expect(voz.regras.some((r) => r.em === '2026-09-01' && r.ativa), `${id} ${nome}: copy curta`).toBe(true)
      // a prévia de cada uma sai sem "impossível" e sem dado na voz
      const p = montarPrevia({ projectId: id, nome, dna: { toneOfVoice: 'tom legado', contentRules: null }, voz })
      expect(p.problemasDaVoz).toEqual([])
      expect(p.fatos.naVoz).toEqual([])
    }
  })

  it('PR13-07: a proposta do TERO não carrega mais a mecânica ("em dobro") nem a janela ("de segunda a quinta, no jantar") — e o detector as pegaria de volta', () => {
    const tero = VOZES_PROPOSTAS[3].voz
    const textos = [...tero.regras.map((r) => r.texto), ...tero.proibicoes, ...tero.exemplos, tero.descricao]
    expect(textos.some((t) => /em dobro|de segunda a quinta|no jantar/i.test(t))).toBe(false)
    const comCondicao = { ...tero, regras: [...tero.regras, regra('r-x', 'O happy hour comunica-se pela mecânica (chopp e drinks selecionados em dobro).'), regra('r-y', 'Rolha free: nome da mecânica e a janela (de segunda a quinta, no jantar).')] }
    const achados = fatosNaVoz(comCondicao)
    expect(achados.map((a) => [a.caminho, a.tipos])).toEqual(expect.arrayContaining([[expect.stringMatching(/^regras\.\d+\.texto$/), ['condicao']], [expect.stringMatching(/^regras\.\d+\.texto$/), ['condicao']]]))
    const soAsDuas = vozDeTeste({ regras: [regra('r-x', 'O happy hour comunica-se pela mecânica (chopp e drinks selecionados em dobro).'), regra('r-y', 'Rolha free: nome da mecânica e a janela (de segunda a quinta, no jantar).')] })
    expect(lerVoz(soAsDuas).voz).not.toBeNull()
    expect(problemasParaMigrar(soAsDuas)).toEqual([expect.stringMatching(/^regras\.0\.texto carrega condicao/), expect.stringMatching(/^regras\.1\.texto carrega condicao/)])
  })

  it('PR13-04: a regra de 04/09 do Espeto que fica é a da LEITURA CONTÍNUA entre blocos (feedback de 03/09), não a "não adicione campos" substituída em 11/09', () => {
    const espeto = VOZES_PROPOSTAS[6].voz
    const r = espeto.regras.find((x) => x.id === 'regra-2026-09-04-1')
    expect(r?.ativa).toBe(true)
    expect(r?.texto).toMatch(/lidos como UMA frase/)
    expect(r?.motivo).toMatch(/Não é a regra de 04\/09 substituída em 11\/09/)
    expect(espeto.regras.some((x) => /não adicione campos|campos do template|campos que existem/i.test(x.texto) && x.ativa)).toBe(false)
  })
})

describe('os consertos da revisão do Codex (PR13-01/02/03/05/06/07/08)', () => {
  it('PR13-06: o marcador de lista sai, o número que é conteúdo FICA ("20% de desconto", "10h às 22h", "R$ 25", "12/10", "1. item")', () => {
    const dna = { toneOfVoice: '20% de desconto em setembro.\n10h às 22h todos os dias.\n- R$ 25 o gelato.\n1. 12/10 é o Dia das Crianças.\n2) Promoção da semana vale até domingo.', contentRules: null }
    const trechos = fatosNoDna(dna).map((f) => f.trecho)
    expect(trechos).toEqual(expect.arrayContaining(['20% de desconto em setembro.', '10h às 22h todos os dias.', 'R$ 25 o gelato.', '12/10 é o Dia das Crianças.', 'Promoção da semana vale até domingo.']))
    expect(trechos.some((t) => t.startsWith('% de') || t.startsWith('h às') || t.startsWith('/10'))).toBe(false)
  })

  it('PR13-08: os três formatos reais de rodapé do Espeto (01/09, 04/09 com aspas e parênteses internos, 06/09 com duas frases) NÃO viram fato — a regra antes deles vira uma frase só', () => {
    const dna = {
      toneOfVoice: `Regras aprendidas na prática:
- Copy curta: a manchete tem no máximo 4 palavras. (2026-09-01 — Decisão do Ciro em 01/09/2026, estendida a toda a carteira. Vale para stories e feed.)
- Pré-título, manchete e apoio são lidos como UMA frase, de cima para baixo. (2026-09-04 — Em 03/09/2026 o Ciro editou o story do aniversário de Vitória deixando "TRADIÇÃO GAÚCHA NO" (o pré-título) e explicou a estratégia: dar continuidade à leitura. Leia em voz alta antes de fechar.)
- Nunca "Vem pro fogo". (2026-09-06 — Feedback do Ciro na peça de quarta, 06/09/2026. Vou aprovar dessa vez mas não uso mais.)`,
      contentRules: null,
    }
    const fatos = fatosNoDna(dna)
    expect(fatos.filter((f) => f.tipos.includes('data'))).toEqual([])
    expect(fatos.map((f) => f.trecho).join(' | ')).not.toMatch(/2026-09-0[146]|01\/09\/2026|03\/09\/2026|06\/09\/2026/)
    const legadas = linhasDaSecaoLegada(dna.toneOfVoice)
    expect(legadas.map((l) => l.em)).toEqual(['2026-09-01', '2026-09-04', '2026-09-06'])
    expect(legadas[1].texto).toBe('Pré-título, manchete e apoio são lidos como UMA frase, de cima para baixo.')
  })

  it('PR13-27: refeição ou período AMARRADOS a um dia, "fecha cedo" e "casa fechada" são condição — detectados no DNA e recusados na voz; o dia sozinho (editorial) passa', () => {
    // As três frases reais que a revisão FINAL achou nas propostas (Seu Quinto, TERO, Quintal) e a do Empório.
    const reais = [
      'sugerir jantar de domingo (a casa fecha cedo); prova social de domingo sai com a casa fechada',
      'domingo nada noturno; segunda nada de almoço',
      'programação noturna em domingo e segunda; tempo relativo',
      'programação em domingo',
    ]
    expect(condicoesOperacionais(reais[0])).toEqual(['dia fechado', 'refeição por dia'])
    expect(condicoesOperacionais(reais[1])).toEqual(['período por dia'])
    expect(condicoesOperacionais(reais[2])).toEqual(['período por dia'])
    expect(condicoesOperacionais(reais[3])).toEqual(['programação por dia'])
    expect(condicoesOperacionais('Fechamos aos domingos; abrimos de terça a sábado.')).toContain('dia fechado')
    // Editorial que só CITA o dia — e o que a regra proíbe entre aspas — passa.
    for (const t of ['SEXTA NO QUINTAL', 'DOMINGOU NO QUINTAL', 'Domingou no boteco favorito', 'SÁBADO DE BOTECO', 'Seu fim de semana começa aqui', 'Almoço executivo', 'Almoço ao vivo', 'rodízio de sexta', 'Leia em voz alta antes de fechar.', 'Story de funcionamento: título identifica o DIA como convite ("Quarta no TERO").', 'convite para período em que a casa não recebe: os dias e períodos de funcionamento vêm da base, na data da peça']) {
      expect(condicoesOperacionais(t), t).toEqual([])
    }
    // No DNA a frase vira FATO de tipo condição (a porta de entrada na base); na voz ela impede a migração.
    const noDna = fatosNoDna({ toneOfVoice: null, contentRules: `Nunca ${reais[0]}.\nEvite ${reais[1]}.` })
    expect(noDna.map((f) => f.tipos)).toEqual([['condicao'], ['condicao']])
    for (const frase of reais) {
      const voz = vozDeTeste({ proibicoes: [frase] })
      expect(problemasParaMigrar(voz).some((p) => /condi/i.test(p)), frase).toBe(true)
    }
  })

  it('PR13-29: exclusividade de unidade, cardápio restrito, canal/serviço afirmado e preparo afirmado são condição — detectados no DNA e recusados na voz; a orientação "vem da base" passa', () => {
    const reais = [
      'Assunto exclusivo da Praia do Canto (Semifreddo de Pistache, Suco de Frutas Vermelhas) exige peça nomeando essa unidade.',
      'item fora do cardápio (cervejas além da IPA, bebida sem álcool além do café expresso, Cheesecake Basca, a versão antiga do executivo)',
      'WhatsApp, link de pedido ou botão de compra: não existem, não inventar',
      'prometer o que não fazemos: encomenda só com garçom ou gerente, sem site ou app; sem delivery; inventar happy hour ou campanha semanal',
      'WhatsApp, telefone, CEP, estacionamento, delivery e aplicativos de entrega (retirada sim)',
      'técnica ou equipamento de preparo (brasa, chapa, forno, defumação): a casa não tem brasa, os cortes são grelhados; "chapa" só como travessa',
    ]
    expect(condicoesOperacionais(reais[0])).toEqual(['exclusividade de unidade'])
    expect(condicoesOperacionais(reais[1])).toEqual(['cardápio restrito a item'])
    expect(condicoesOperacionais(reais[2])).toEqual(['canal ou serviço afirmado'])
    expect(condicoesOperacionais(reais[3])).toEqual(['canal ou serviço afirmado'])
    expect(condicoesOperacionais(reais[4])).toEqual(['canal ou serviço afirmado'])
    expect(condicoesOperacionais(reais[5])).toEqual(['preparo afirmado'])
    // As redações corrigidas — orientação editorial com a condição devolvida à base — passam.
    for (const t of [
      'Assunto exclusivo de uma unidade exige peça nomeando essa unidade; quais itens são exclusivos, e de qual unidade, vem da base na data da peça.',
      'item fora do cardápio da base (bebida, sobremesa ou versão do executivo que a base não registra na data da peça)',
      'canal de pedido ou botão de compra que a base não registra (os canais existentes vêm da base)',
      'prometer canal, serviço ou programação que a base não registra (encomenda, delivery, site, app, happy hour, campanha): o que a casa oferece vem da base',
      'WhatsApp, telefone, CEP, estacionamento, delivery e aplicativos de entrega; retirada só como a base registra',
      'técnica ou equipamento de preparo que a base não registra (brasa, chapa, forno, defumação): o modo de preparo dos cortes vem da base; "chapa" só como travessa',
      'Solicite pelo Direct',
      'sabor, combinação ou produto fora do cardápio da base',
    ]) {
      expect(condicoesOperacionais(t), t).toEqual([])
    }
    const noDna = fatosNoDna({ toneOfVoice: null, contentRules: `${reais[0]}\nNunca prometa: ${reais[3]}.` })
    expect(noDna.map((f) => f.tipos)).toEqual([['condicao'], ['condicao']])
    for (const frase of reais) {
      const voz = vozDeTeste({ proibicoes: [frase] })
      expect(problemasParaMigrar(voz).some((p) => /condi/i.test(p)), frase).toBe(true)
    }
  })

  it('PR13-30: o cache de busca (Redis) tem a mesma régua do indexador — isolado só com URL e token próprios e URL diferente da de produção', () => {
    const prod = { UPSTASH_REDIS_REST_URL: 'https://prod-redis.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'p' }
    expect(isolamentoDoCache(prod, {})).toBe('ausente')
    expect(isolamentoDoCache(prod, { UPSTASH_REDIS_REST_URL: 'https://dev-redis.upstash.io' })).toBe('ausente')
    expect(isolamentoDoCache(prod, prod)).toBe('producao')
    expect(isolamentoDoCache(prod, { UPSTASH_REDIS_REST_URL: 'https://dev-redis.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'd' })).toBe('isolado')
  })

  it('PR13-07: condicoesOperacionais pega mecânica, janela de dias e período; vocabulário citado entre aspas e o nome da mecânica nos TERMOS não contam', () => {
    expect(condicoesOperacionais('chopp e drinks selecionados em dobro')).toEqual(['mecânica "em dobro"'])
    expect(condicoesOperacionais('a janela (de segunda a quinta, no jantar)')).toEqual(['janela de dias', 'período do dia'])
    expect(condicoesOperacionais('leve 3 pague 2 nas sextas')).toEqual(['mecânica leve/pague'])
    expect(condicoesOperacionais('Nunca escreva "em dobro" na manchete.')).toEqual([])
    expect(condicoesOperacionais('Fale como quem recebe em casa.')).toEqual([])
    const voz = vozDeTeste({ termos: ['happy em dobro'], exemplos: ['Happy em dobro de segunda a quinta, no jantar.'] })
    const achados = fatosNaVoz(voz)
    expect(achados.map((a) => a.caminho)).toEqual(['exemplos.0'])
    expect(achados[0].tipos).toContain('condicao')
    // e a voz com condição NÃO pode migrar, mesmo passando no contrato
    expect(lerVoz(voz).voz).not.toBeNull()
    expect(problemasParaMigrar(voz)).toEqual([expect.stringMatching(/^exemplos\.0 carrega .*condicao/)])
    expect(problemasParaMigrar({ descricao: 42 })).toEqual(expect.arrayContaining([expect.stringMatching(/^descricao:/)]))
  })

  it('PR13-05: a prévia carrega o toneOfVoice e o contentRules INTEGRAIS, e o markdown os reproduz verbatim (caixa, acento, linhas) — vazio é dito', () => {
    const dna = { toneOfVoice: 'Tom DOCE.\n  Segunda linha com acento: ação.', contentRules: 'Nunca emoji.\nVocabulário fora das seções reconhecidas.' }
    const p = montarPrevia({ projectId: 1, nome: 'X', dna, voz: vozDeTeste() })
    expect(p.antes.toneOfVoice).toBe(dna.toneOfVoice)
    expect(p.antes.contentRules).toBe(dna.contentRules)
    const md = previaParaMarkdown(p)
    expect(md).toContain('### toneOfVoice — texto integral')
    expect(md).toContain(dna.toneOfVoice)
    expect(md).toContain(dna.contentRules)
    const vazio = previaParaMarkdown(montarPrevia({ projectId: 1, nome: 'X', dna: { toneOfVoice: null, contentRules: null }, voz: vozDeTeste() }))
    expect(vazio.match(/\(vazio\)/g)?.length).toBe(2)
  })

  it('PR13-03: a chave do fato é durável e distingue projeto, prévia e trecho', () => {
    const a = chaveDoFato({ projectId: 6, versaoDaPrevia: 'abcdef0123456789', trecho: 'Happy hour das 17h às 19h.' })
    expect(a).toMatch(/^[0-9a-f]{40}$/)
    expect(chaveDoFato({ projectId: 6, versaoDaPrevia: 'abcdef0123456789', trecho: 'Happy hour das 17h às 19h.' })).toBe(a)
    expect(chaveDoFato({ projectId: 7, versaoDaPrevia: 'abcdef0123456789', trecho: 'Happy hour das 17h às 19h.' })).not.toBe(a)
    expect(chaveDoFato({ projectId: 6, versaoDaPrevia: 'ffffffffffffffff', trecho: 'Happy hour das 17h às 19h.' })).not.toBe(a)
    expect(chaveDoFato({ projectId: 6, versaoDaPrevia: 'abcdef0123456789', trecho: 'Happy hour das 17h às 19h' })).not.toBe(a)
  })

  it('PR13-01: o indexador é isolado só com URL e token PRÓPRIOS; dev sem indexador isolado e destino não declarado não podem indexar; produção exige o de produção', () => {
    const prod = { UPSTASH_VECTOR_REST_URL: 'https://prod.upstash.io', UPSTASH_VECTOR_REST_TOKEN: 'p' }
    expect(isolamentoDoIndexador(prod, {})).toBe('ausente')
    expect(isolamentoDoIndexador(prod, { UPSTASH_VECTOR_REST_URL: 'https://dev.upstash.io' })).toBe('ausente')
    expect(isolamentoDoIndexador(prod, prod)).toBe('producao')
    expect(isolamentoDoIndexador(prod, { UPSTASH_VECTOR_REST_URL: 'https://prod.upstash.io ', UPSTASH_VECTOR_REST_TOKEN: 'outro' })).toBe('producao')
    expect(isolamentoDoIndexador(prod, { UPSTASH_VECTOR_REST_URL: 'https://dev.upstash.io', UPSTASH_VECTOR_REST_TOKEN: 'd' })).toBe('isolado')
    expect(podeIndexar(undefined)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não foi declarado/) })
    expect(podeIndexar({ banco: 'dev', indexador: 'producao', indexadorUrl: 'https://prod.upstash.io' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/é o de PRODUÇÃO/) })
    expect(podeIndexar({ banco: 'dev', indexador: 'ausente', indexadorUrl: null })).toMatchObject({ ok: false, motivo: expect.stringMatching(/não existe/) })
    expect(podeIndexar({ banco: 'dev', indexador: 'isolado', indexadorUrl: 'https://dev.upstash.io' })).toEqual({ ok: true })
    expect(podeIndexar({ banco: 'producao', indexador: 'producao', indexadorUrl: 'https://prod.upstash.io' })).toEqual({ ok: true })
    expect(podeIndexar({ banco: 'producao', indexador: 'isolado', indexadorUrl: 'https://dev.upstash.io' })).toMatchObject({ ok: false })
  })

  it('PR13-12: a condição operacional do DNA vira FATO da prévia (mesma régua da voz) e pode ser citada no manifesto; o rodapé de aprendizado continua fora', () => {
    const dna = { toneOfVoice: 'Chopp e drinks selecionados em dobro.\nRolha free de segunda a quinta, no jantar.\nFale como quem recebe em casa.', contentRules: 'Regras aprendidas na prática:\n- Nunca prometa em dobro sem a base confirmar (2026-09-05 — decisão de segunda a quinta, no jantar do Ciro)' }
    const fatos = fatosNoDna(dna)
    expect(fatos.map((f) => [f.trecho, f.tipos])).toEqual([
      ['Chopp e drinks selecionados em dobro.', ['condicao']],
      ['Rolha free de segunda a quinta, no jantar.', ['condicao']],
      ['Nunca prometa em dobro sem a base confirmar', ['condicao']],
    ])
    expect(fatos[1].termos).toEqual(['janela de dias', 'período do dia'])
    // no manifesto: os dois trechos são aceitos como fatos da prévia
    const estado: EstadoDoCliente = { versaoDaPreviaAtual: 'abcdef0123456789', trechosDeFato: fatos.map((f) => f.trecho), registro: null, vozValida: true }
    const m: Manifesto = { versao: VERSAO_DO_MANIFESTO, geradoEm: '2026-09-12T00:00:00.000Z', clientes: [{ projectId: 3, nome: 'TERO', versaoDaPrevia: 'abcdef0123456789', decisao: 'migrar', aprovadoPor: 'Ciro', aprovadoEm: '2026-09-12', fatosParaABase: [{ trecho: 'Chopp e drinks selecionados em dobro.', categoria: 'CAMPANHAS', titulo: 'Happy hour' }, { trecho: 'Rolha free de segunda a quinta, no jantar.', categoria: 'HORARIOS', titulo: 'Rolha free' }] }] }
    expect(planoDeAplicacao(m, new Map([[3, estado]]))[0]).toMatchObject({ acao: 'migrar', fatos: [expect.objectContaining({ trecho: 'Chopp e drinks selecionados em dobro.' }), expect.objectContaining({ trecho: 'Rolha free de segunda a quinta, no jantar.' })] })
    // e a MESMA frase na voz continua proibida
    expect(problemasParaMigrar(vozDeTeste({ exemplos: ['Chopp e drinks selecionados em dobro.'] }))).toHaveLength(1)
  })

  it('PR13-09: o indexador em uso pelo processo tem de ser o validado no destino', () => {
    const destino = { banco: 'dev' as const, indexador: 'isolado' as const, indexadorUrl: 'https://dev.upstash.io' }
    expect(podeIndexar(destino, { url: 'https://dev.upstash.io' })).toEqual({ ok: true })
    expect(podeIndexar(destino, { url: ' https://dev.upstash.io ' })).toEqual({ ok: true })
    expect(podeIndexar(destino, { url: 'https://prod.upstash.io' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/não é o validado/) })
    expect(podeIndexar(destino, { url: undefined })).toMatchObject({ ok: false, motivo: expect.stringMatching(/nenhum.*não é o validado/) })
    expect(podeIndexar({ banco: 'producao', indexador: 'producao', indexadorUrl: 'https://prod.upstash.io' }, { url: 'https://outro.upstash.io' })).toMatchObject({ ok: false })
    // sem `efetivo` a conferência do processo não roda (quem chama sem ela não tem o ambiente à mão)
    expect(podeIndexar(destino)).toEqual({ ok: true })
  })

  it('PR13-11: a linha existir não prova o vetor — classificarFato: ausente, incompleto (sem indexadoEm) e completo', () => {
    expect(classificarFato(null)).toBe('ausente')
    expect(classificarFato({ metadata: { chaveDoFato: 'x' } })).toBe('incompleto')
    expect(classificarFato({ metadata: null })).toBe('incompleto')
    expect(classificarFato({ metadata: { chaveDoFato: 'x', indexadoEm: '' } })).toBe('incompleto')
    expect(classificarFato({ metadata: { chaveDoFato: 'x', indexadoEm: '2026-09-12T10:00:00.000Z' } })).toBe('completo')
  })

  it('PR13-13: a trava só vale no MESMO compute das escritas (pooler e direto são o mesmo); URL ilegível nunca é o mesmo banco', () => {
    expect(computeDe('postgresql://u:p@ep-winter-lake-admt6duq-pooler.sa-east-1.aws.neon.tech/neondb')).toBe('ep-winter-lake-admt6duq')
    expect(computeDe('postgresql://u:p@ep-winter-lake-admt6duq.sa-east-1.aws.neon.tech/neondb')).toBe('ep-winter-lake-admt6duq')
    expect(computeDe('nada')).toBeNull()
    expect(mesmoBanco('postgresql://u:p@ep-a-pooler.x.neon.tech/db', 'postgresql://u:p@ep-a.x.neon.tech/db')).toBe(true)
    expect(mesmoBanco('postgresql://u:p@ep-a.x.neon.tech/db', 'postgresql://u:p@ep-b.x.neon.tech/db')).toBe(false)
    expect(mesmoBanco(undefined, 'postgresql://u:p@ep-a.x.neon.tech/db')).toBe(false)
    expect(mesmoBanco('nada', 'nada')).toBe(false)
    // PR13-16: mesmo compute, bancos DIFERENTES não é o mesmo banco (advisory lock é por banco); pooler/direto do mesmo banco, sim
    expect(nomeDoBancoDe('postgresql://u:p@ep-a.x.neon.tech/neondb?sslmode=require')).toBe('neondb')
    expect(nomeDoBancoDe('postgresql://u:p@ep-a.x.neon.tech')).toBeNull()
    expect(mesmoBanco('postgresql://u:p@ep-a.x.neon.tech/neondb', 'postgresql://u:p@ep-a.x.neon.tech/outro_banco')).toBe(false)
    expect(mesmoBanco('postgresql://u:p@ep-a-pooler.x.neon.tech/neondb?pgbouncer=true', 'postgresql://u:p@ep-a.x.neon.tech/neondb?sslmode=require')).toBe(true)
    expect(mesmoBanco('postgresql://u:p@ep-a.x.neon.tech/', 'postgresql://u:p@ep-a.x.neon.tech/neondb')).toBe(false)
    // PR13-19: a trava de sessão exige conexão DIRETA — `-pooler` no host é o PgBouncer em modo transação
    expect(ehPooler('postgresql://u:p@ep-a-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require')).toBe(true)
    expect(ehPooler('postgresql://u:p@ep-a.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require')).toBe(false)
    expect(ehPooler('postgresql://u:p@ep-a-pooler.x/neondb?pgbouncer=true')).toBe(true)
    expect(ehPooler(undefined)).toBe(false)
  })

  it('PR13-17: trecho repetido em fatosParaABase é recusado por lerManifesto com as posições; trechosRepetidos lista cada repetição', () => {
    const fatos = [{ trecho: 'A', categoria: 'HORARIOS' as const, titulo: 't' }, { trecho: 'B', categoria: 'HORARIOS' as const, titulo: 't' }, { trecho: 'A', categoria: 'CAMPANHAS' as const, titulo: 'outro' }, { trecho: 'B', categoria: 'HORARIOS' as const, titulo: 't' }]
    expect(trechosRepetidos(fatos)).toEqual([{ trecho: 'A', posicoes: [0, 2] }, { trecho: 'B', posicoes: [1, 3] }])
    expect(trechosRepetidos([{ trecho: 'A' }, { trecho: 'B' }])).toEqual([])
    const m: Manifesto = { versao: VERSAO_DO_MANIFESTO, geradoEm: '2026-09-12T00:00:00.000Z', clientes: [{ projectId: 3, nome: 'TERO', versaoDaPrevia: 'abcdef0123456789', decisao: 'migrar', aprovadoPor: 'Ciro', aprovadoEm: '2026-09-12', fatosParaABase: [{ trecho: 'Happy hour das 17h às 19h.', categoria: 'HORARIOS', titulo: 'Happy hour' }, { trecho: 'Happy hour das 17h às 19h.', categoria: 'CAMPANHAS', titulo: 'Happy hour (campanha)' }] }] }
    const lido = lerManifesto(m)
    expect(lido.manifesto).toBeNull()
    expect(lido.problemas).toEqual([expect.stringMatching(/clientes\.0 \(TERO\): fatosParaABase repete o trecho "Happy hour das 17h às 19h\." nas posições 0, 1/)])
  })

  it('PR13-14: a linha com a chave só é o fato aprovado se conteúdo, categoria, status ACTIVE e validade (em Brasília) batem — cada divergência é dita', () => {
    const fato = { trecho: 'Happy hour das 17h às 19h.', categoria: 'HORARIOS', validaAte: '2026-12-31' }
    const linha = { content: 'Happy hour das 17h às 19h.', category: 'HORARIOS', status: 'ACTIVE', expiresAt: new Date('2026-12-31T23:59:59-03:00') }
    expect(divergenciasDoFato(linha, fato)).toEqual([])
    expect(divergenciasDoFato({ ...linha, content: 'Happy hour das 17h às 20h.' }, fato)).toEqual(['conteúdo editado'])
    expect(divergenciasDoFato({ ...linha, category: 'CAMPANHAS' }, fato)).toEqual(['categoria CAMPANHAS (aprovada HORARIOS)'])
    expect(divergenciasDoFato({ ...linha, status: 'ARCHIVED' }, fato)).toEqual(['status ARCHIVED (a busca só lê ACTIVE)'])
    expect(divergenciasDoFato({ ...linha, expiresAt: null }, fato)).toEqual(['validade sem prazo (aprovada 2026-12-31)'])
    // sem prazo aprovado, linha com prazo diverge; o dia é lido em Brasília (a validade grava 23:59:59-03:00, que já é 1º/01 em UTC)
    expect(divergenciasDoFato({ ...linha, expiresAt: null }, { ...fato, validaAte: null })).toEqual([])
    expect(divergenciasDoFato(linha, { ...fato, validaAte: null })).toEqual(['validade 2026-12-31 (aprovada sem prazo)'])
    // tudo errado ao mesmo tempo: todas as divergências, não só a primeira
    expect(divergenciasDoFato({ content: 'x', category: 'CARDAPIO', status: 'ARCHIVED', expiresAt: null }, fato)).toHaveLength(4)
  })

  it('PR13-02: dnaDiverge aponta os campos que mudaram; null e undefined são a mesma ausência', () => {
    expect(dnaDiverge({ toneOfVoice: 'a', contentRules: null }, { toneOfVoice: 'a', contentRules: undefined })).toEqual([])
    expect(dnaDiverge({ toneOfVoice: 'a', contentRules: 'b' }, { toneOfVoice: 'A', contentRules: 'b' })).toEqual(['toneOfVoice'])
    expect(dnaDiverge({ toneOfVoice: null, contentRules: 'b ' }, { toneOfVoice: null, contentRules: 'b' })).toEqual(['contentRules'])
    expect(dnaDiverge({}, { toneOfVoice: 'x', contentRules: 'y' })).toEqual(['toneOfVoice', 'contentRules'])
  })
})
