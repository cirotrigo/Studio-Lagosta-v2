import { describe, expect, it } from 'vitest'
import { CATEGORIAS_DA_BASE } from '@/lib/mcp/catalogo/base-e-dna'
import { lerVoz, TETO_DO_PROMPT_DA_VOZ, vozParaPrompt, vozVazia, type VozCompacta } from '../voz'
import {
  CATEGORIAS_DE_FATO,
  coberturaDasRegrasLegadas,
  fatosNaVoz,
  fatosNoDna,
  lerManifesto,
  linhasDaSecaoLegada,
  manifestoEmBranco,
  montarPrevia,
  planoDeAplicacao,
  previaParaMarkdown,
  VERSAO_DO_MANIFESTO,
  versaoDaPrevia,
  type EstadoDoCliente,
  type Manifesto,
} from '../migracao-da-voz'
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
    expect(p.antes).toEqual({ toneOfVoiceChars: DNA_COM_SECAO.length, contentRulesChars: 0, regrasLegadas: 2, dnaAtualizadoEm: '2026-09-10T12:00:00.000Z' })
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
})
