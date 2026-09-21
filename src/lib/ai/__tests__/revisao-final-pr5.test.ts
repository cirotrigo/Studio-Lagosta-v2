/**
 * PR5-08..10 da revisão FINAL do Codex sobre 81708704 (18/09/2026): o registro
 * da copy autoral na via de IA e na melhoria não pode declarar o que não é.
 */
import { describe, expect, it } from 'vitest'
import type { BrandContext } from '@/lib/brand/brand-context'
import { buildArtePrompt, copyComCaixaDaMarca } from '../image-prompt-builder'
import { semColchetes } from '@/lib/compositor/destaques'
import {
  VERSAO_DO_CONTRATO,
  autorDoBloco,
  autorDoPedido,
  comEnviada,
  contratoDaOrigemDaMelhoria,
  enviadaNoPrompt,
  revisaoDoRefino,
  LACUNA_PROMPT_AINDA_NAO_MONTADO,
  registroParaIA,
  textoEnviadoDoContrato,
  validarCopyAutoral,
  type CopyAutoral,
} from '@/lib/copy-autoral'
import { copyDaArte } from '@/lib/mcp/catalogo/ver-geracao-retorno'

const marca = (projectId: number, projectName: string) =>
  ({ projectId, projectName, dna: { toneOfVoice: null, contentRules: null, composition: null, visualStyle: null, photoDirection: null }, cuisineType: null, fonts: { title: 'Didot', subtitle: null, body: 'Montserrat' }, colors: [], logoUrl: null }) as unknown as BrandContext
const contrato = (linhas: string[]): CopyAutoral => ({ versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: [{ id: 'manchete', funcao: 'headline', ordem: 0, linhas }], revisoes: [] })

describe('PR5-09 — a linha vazia interna do autor chega ao planejador', () => {
  it('do contrato ao texto entregue ao diretor: "Almoço\\n\\nem família", com e sem caixa da marca', () => {
    const c = contrato(['Almoço', '', 'em família'])
    expect(validarCopyAutoral(c).problemas).toEqual([])
    // o caminho de `startArtGeneration` (contrato → blocos → sem colchetes, bordas aparadas) → `copyComCaixaDaMarca`
    const copy = textoEnviadoDoContrato(c).map((b) => semColchetes(b).trim())
    expect(copy).toEqual(['Almoço\n\nem família'])
    expect(copyComCaixaDaMarca(copy, null)).toEqual(['Almoço\n\nem família'])
    expect(copyComCaixaDaMarca(copy, marca(3, 'TERO'))).toEqual(['ALMOÇO\n\nEM FAMÍLIA'])
    expect(copyComCaixaDaMarca(['A  \n \nB'], null)).toEqual(['A\n\nB'])
  })
})

describe('PR5-10 — `enviada` é lida do prompt que saiu', () => {
  it('prompt pronto com a frase em caixa natural (TERO): enviada é a da frase, não a caixa alta que o sistema aplicaria', () => {
    const copy = ['Almoço executivo']
    const r = enviadaNoPrompt('Peça do TERO. Manchete: "Almoço executivo", no terço de baixo.', [copyComCaixaDaMarca(copy, marca(3, 'TERO')), copy])
    expect(r).toEqual({ enviada: ['Almoço executivo'], lacuna: null })
  })
  it('o prompt montado por código colapsa a quebra: enviada registra o que ele mandou', () => {
    const copy = ['Almoço\nexecutivo']
    const prompt = buildArtePrompt({ copy, brand: null, refs: [] } as never)
    expect(enviadaNoPrompt(prompt, [copyComCaixaDaMarca(copy, null), copy]).enviada).toEqual(['Almoço executivo'])
  })
  it('bloco que não aparece no prompt: enviada fica ausente e a lacuna diz qual', () => {
    const r = enviadaNoPrompt('um prompt sem a copy', [['Almoço executivo']])
    expect(r.enviada).toBeNull()
    expect(r.lacuna).toMatch(/bloco 1 \("Almoço executivo"\)/)
    expect(enviadaNoPrompt(null, [['x']]).enviada).toBeNull()
  })
  it('o registro nasce SEM enviada (a criação não conhece o prompt) e o runner completa; sem enviada a comparação segue por visão', () => {
    const c = contrato(['Almoço executivo'])
    const criado = registroParaIA(c, null, [LACUNA_PROMPT_AINDA_NAO_MONTADO])
    expect('enviada' in criado).toBe(false)
    const completo = comEnviada(criado, { enviada: ['Almoço executivo'], lacuna: null })
    expect(completo.enviada).toEqual(['Almoço executivo'])
    expect(completo.lacunas).not.toContain(LACUNA_PROMPT_AINDA_NAO_MONTADO)
    const semDizer = comEnviada(criado, { enviada: null, lacuna: 'x' })
    expect('enviada' in semDizer).toBe(false)
    const lido = copyDaArte({ copyAutoral: { ...semDizer, conferencia: { lida: ['ALMOÇO EXECUTIVO'], faltando: [], passou: true, regua: 'copy' } } })
    expect(lido?.comparadoPor).toBe('visao')
    expect(lido?.comparavel).toBe(true)
    expect(lido?.enviada).toBeUndefined()
  })
})

describe('PR5-11 — `enviada` exige o bloco INTEIRO numa ocorrência livre', () => {
  it('pedaço de um texto maior NÃO conta: preço com dígito a mais e frase ampliada viram lacuna', () => {
    const preco = enviadaNoPrompt('[TEXTO EXATO]\n- "R$ 200"', [['R$ 20']])
    expect(preco.enviada).toBeNull()
    expect(preco.lacuna).toMatch(/bloco 1 \("R\$ 20"\)/)

    const frase = enviadaNoPrompt('[TEXTO EXATO]\n- "Venha hoje mesmo"', [['Venha hoje']])
    expect(frase.enviada).toBeNull()
    expect(frase.lacuna).toMatch(/bloco 1 \("Venha hoje"\)/)
  })

  it('dois blocos IGUAIS com uma só ocorrência: indeterminável (a ocorrência serve a um bloco só)', () => {
    const uma = enviadaNoPrompt('[TEXTO EXATO]\n- "Vem pra cá"', [['Vem pra cá', 'Vem pra cá']])
    expect(uma.enviada).toBeNull()
    expect(uma.lacuna).toMatch(/bloco 2 \("Vem pra cá"\)/)
    // com as duas aparições, os dois blocos são determináveis
    const duas = enviadaNoPrompt('[TEXTO EXATO]\n- "Vem pra cá"\n- "Vem pra cá"', [['Vem pra cá', 'Vem pra cá']])
    expect(duas.enviada).toEqual(['Vem pra cá', 'Vem pra cá'])
  })

  it('os casos VÁLIDOS continuam: caixa da marca, espaços colapsados e o bloco sozinho na linha (molde do manual)', () => {
    // prompt pronto em caixa natural (TERO): vale a forma crua, entre aspas
    expect(enviadaNoPrompt('Manchete: "Almoço executivo", no terço de baixo.', [['ALMOÇO EXECUTIVO'], ['Almoço executivo']]).enviada).toEqual(['Almoço executivo'])
    // o prompt montado por código colapsa a quebra do autor
    expect(enviadaNoPrompt('[TEXTO EXATO]\n- "Almoço executivo"', [['Almoço\nexecutivo']]).enviada).toEqual(['Almoço executivo'])
    // `prompt-do-manual` lista um bloco por LINHA, sem aspas
    expect(enviadaNoPrompt('TEXTOS EXATOS — NÃO MODIFICAR:\nAlmoço executivo\nVem pra cá', [['Almoço executivo', 'Vem pra cá']]).enviada).toEqual(['Almoço executivo', 'Vem pra cá'])
  })
})

describe('PR5-13 — o refino é assinado por QUEM PEDIU, não sempre por `claude`', () => {
  const daOrigem: CopyAutoral = {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em: '2026-09-20T10:00:00.000Z' },
    blocos: [{ id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] }],
    revisoes: [],
  }
  const refinar = (canal: Parameters<typeof autorDoPedido>[0]) =>
    revisaoDoRefino(
      daOrigem,
      ['Almoço executivo'],
      ['Almoço de domingo'],
      { autor: autorDoPedido(canal), superficie: 'melhoria' },
      'pedido de refino: troque a frase',
    )

  it('o canal diz o autor: a INTERFACE é `equipe`, os automáticos são `claude`, ausente é `desconhecido`', () => {
    expect(autorDoPedido('studio')).toBe('equipe')
    expect(autorDoPedido('claude-ai')).toBe('claude')
    expect(autorDoPedido('claude-code')).toBe('claude')
    expect(autorDoPedido('claudinho')).toBe('claude')
    // job antigo, enfileirado antes deste código: conservador, nunca um palpite
    expect(autorDoPedido(null)).toBe('desconhecido')
    expect(autorDoPedido(undefined)).toBe('desconhecido')
  })

  it('pedido pela INTERFACE: a revisão e o bloco ficam com `equipe`', () => {
    const r = refinar('studio')
    expect('copy' in r).toBe(true)
    const copy = (r as { copy: CopyAutoral }).copy
    expect(copy.revisoes.at(-1)!.autor).toBe('equipe')
    expect(copy.revisoes.at(-1)!.motivo).toMatch(/pedido de refino/)
    expect(autorDoBloco(copy, 'manchete').autor).toBe('equipe')
    expect(copy.blocos[0].linhas).toEqual(['Almoço de domingo'])
  })

  it('pedido pelo CHAT continua com `claude`; job sem canal fica em `desconhecido`', () => {
    expect((refinar('claude-ai') as { copy: CopyAutoral }).copy.revisoes.at(-1)!.autor).toBe('claude')
    expect((refinar(null) as { copy: CopyAutoral }).copy.revisoes.at(-1)!.autor).toBe('desconhecido')
  })

  it('refino SEM mudança textual não cria revisão, venha de onde vier', () => {
    for (const canal of ['studio', 'claude-ai', null] as const) {
      const r = revisaoDoRefino(
        daOrigem,
        ['Almoço executivo'],
        ['Almoço executivo'],
        { autor: autorDoPedido(canal), superficie: 'melhoria' },
        'pedido de refino: só a foto',
      )
      expect('copy' in r).toBe(true)
      expect((r as { copy: CopyAutoral }).copy.revisoes).toEqual([])
      expect(autorDoBloco((r as { copy: CopyAutoral }).copy, 'manchete').autor).toBe('claude')
    }
  })
})

describe('PR5-08 — melhoria de OUTRO slide não herda o contrato da imagem errada', () => {
  const doSlideA = { copyAutoral: registroParaIA(contrato(['Slide A']), ['Slide A']) }
  it('com `skipTextVerification` (a imagem é outro slide) o contrato de A não vem, e a ausência é dita', () => {
    const r = contratoDaOrigemDaMelhoria(doSlideA, { outraImagem: true })
    expect(r.contrato).toBeNull()
    expect(r.aviso).toMatch(/outro slide/)
  })
  it('a própria arte continua herdando o contrato', () => {
    expect(contratoDaOrigemDaMelhoria(doSlideA, { outraImagem: false }).contrato?.blocos[0].linhas).toEqual(['Slide A'])
    expect(contratoDaOrigemDaMelhoria({}, { outraImagem: true })).toEqual({ contrato: null, aviso: null })
  })
})
