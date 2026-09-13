import { describe, expect, it } from 'vitest'
import type { BlocoAutoral, CopyAutoral } from '@/lib/copy-autoral/contrato'
import { aplicarRevisao } from '@/lib/copy-autoral/revisao'
import { validarCopyAutoral } from '@/lib/copy-autoral/validar'
import {
  LIMIAR_DE_AMOSTRA,
  MOTIVO_DO_AJUSTE_DO_REVISOR,
  ajustesDeVisibilidade,
  blocoDaQualidadeDaCopy,
  cancelamentoPorTempo,
  causaDaRevisao,
  faltaDeEsquema,
  linhaDaCopyDoCliente,
  medirPeca,
  medirQualidadeDaCopy,
  montarPecas,
  proporcao,
  revisaoMudaLinhas,
  type ArteLida,
  type LeituraDaSemana,
  type MedidaDaPeca,
} from '../qualidade-da-copy-contrato'

// ─── fixtures ─────────────────────────────────────────────────────────────

const BASE = Date.parse('2026-09-08T10:00:00Z')
const T = (min: number) => new Date(BASE + min * 60_000).toISOString()

function copiaOriginal(autor: CopyAutoral['origem']['autor'] = 'claude'): CopyAutoral {
  const c: CopyAutoral = {
    versao: 'copy-autoral-v1',
    origem: { autor, em: T(0), superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia', 'de churrasco'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Vem pra cá'] },
    ],
    revisoes: [],
  }
  expect(validarCopyAutoral(c).problemas).toEqual([])
  return c
}

function comLinhas(c: CopyAutoral, mudancas: Record<string, string[]>, estilo?: Record<string, BlocoAutoral['estilo']>): BlocoAutoral[] {
  return c.blocos.map((b) => ({ ...b, linhas: mudancas[b.id] ?? b.linhas, ...(estilo?.[b.id] ? { estilo: estilo[b.id] } : {}) }))
}

type Quem = { autor: 'claude' | 'equipe' | 'sistema' | 'desconhecido'; motivo: string; superficie: string; em: string }
function revisar(c: CopyAutoral, mudancas: Record<string, string[]>, quem: Quem, estilo?: Record<string, BlocoAutoral['estilo']>): CopyAutoral {
  const r = aplicarRevisao(c, comLinhas(c, mudancas, estilo), quem).copy
  expect(validarCopyAutoral(r).problemas).toEqual([])
  return r
}

const doCompositor = (em = T(1)): Quem => ({ autor: 'sistema', motivo: 'o que foi desenhado (compositor)', superficie: 'compositor', em })
const noEditor = (em: string): Quem => ({ autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', em })

function arte(id: string, over: Partial<ArteLida>): ArteLida {
  return { id, pageId: 'page-1', createdAt: T(1), source: 'compositor', canal: null, copyAutoral: null, revisao: null, ajustes: null, avisos: [], recomposicao: null, vozNaEscrita: null, ...over }
}

function leitura(over: Partial<LeituraDaSemana>): LeituraDaSemana {
  return {
    posts: [{ id: 'post-1', pageId: 'page-1', generationId: null, createdAt: T(30) }],
    artes: [],
    paginas: [],
    itens: [],
    sinais: [],
    ...over,
  }
}

/** Uma peça do compositor: original do autor, efetiva desenhada e a página com o contrato final. */
function pecaSimples(opts: { original?: CopyAutoral; efetiva?: CopyAutoral; final?: CopyAutoral; layers?: unknown; extras?: Partial<LeituraDaSemana>; artesExtras?: ArteLida[] }) {
  const original = opts.original ?? copiaOriginal()
  const efetiva = opts.efetiva ?? original
  const final = opts.final ?? efetiva
  const l = leitura({
    artes: [arte('gen-1', { copyAutoral: { original, efetiva, comparavel: true } }), ...(opts.artesExtras ?? [])],
    paginas: [{ id: 'page-1', copyAutoral: final, layers: opts.layers ?? '[]' }],
    ...opts.extras,
  })
  const pecas = montarPecas(l)
  expect(pecas).toHaveLength(1)
  return { peca: pecas[0], medida: medirPeca(pecas[0]) }
}

function medida(over: Partial<MedidaDaPeca>): MedidaDaPeca {
  return {
    chave: Math.random().toString(36),
    comparavel: true,
    exclusao: null,
    preservada: true,
    sistemaMudouLinhas: false,
    correcoes: { redacao: 0, compositor: 0, foto: 0, design: 0, revisor: 0, indeterminada: 0 },
    indevidas: [],
    visibilidadeDoRevisor: { aceitos: 0, desfeitos: 0, removidas: 0 },
    minutosAteRascunho: null,
    voz: null,
    avisosDoSistema: 0,
    ...over,
  }
}

// ─── fidelidade ───────────────────────────────────────────────────────────

describe('fidelidade até a agenda', () => {
  it('copy que chega à agenda como o autor escreveu: preservada, sem correção nem indevida', () => {
    const { medida: m } = pecaSimples({})
    expect(m.comparavel).toBe(true)
    expect(m.preservada).toBe(true)
    expect(m.sistemaMudouLinhas).toBe(false)
    expect(Object.values(m.correcoes).every((n) => n === 0)).toBe(true)
    expect(m.indevidas).toEqual([])
  })

  it('o compositor mudou o texto (a seta no CTA): não preservada, causa compositor, indevida', () => {
    const original = copiaOriginal()
    const efetiva = revisar(original, { cta: ['Vem pra cá →'] }, doCompositor())
    const { medida: m } = pecaSimples({ original, efetiva })
    expect(m.preservada).toBe(false)
    expect(m.sistemaMudouLinhas).toBe(true)
    expect(m.correcoes.compositor).toBe(1)
    expect(m.indevidas.map((i) => i.tipo)).toEqual(['sistema-mudou-linhas'])
  })

  it('o compositor mexeu só no estilo (segunda voz): texto preservado, sem indevida', () => {
    const original = copiaOriginal()
    const efetiva = revisar(original, {}, doCompositor(), { headline: { linhasNaVoz2: [1] } })
    const { medida: m } = pecaSimples({ original, efetiva })
    expect(m.preservada).toBe(true)
    expect(m.sistemaMudouLinhas).toBe(false)
    expect(m.correcoes.compositor).toBe(1)
    expect(m.indevidas).toEqual([])
  })

  it('a equipe reescreveu a manchete: redação, não preservada, e NÃO é indevida', () => {
    const original = copiaOriginal()
    const final = revisar(original, { headline: ['Sexta tem', 'churrasco'] }, noEditor(T(10)))
    const { medida: m } = pecaSimples({ original, final })
    expect(m.preservada).toBe(false)
    expect(m.correcoes.redacao).toBe(1)
    expect(m.indevidas).toEqual([])
  })

  it('a equipe devolveu ao original o texto que o compositor mudou: duas indevidas, texto preservado', () => {
    const original = copiaOriginal()
    const efetiva = revisar(original, { cta: ['Vem pra cá →'] }, doCompositor())
    const final = revisar(efetiva, { cta: ['Vem pra cá'] }, noEditor(T(10)))
    const { medida: m } = pecaSimples({ original, efetiva, final })
    expect(m.preservada).toBe(true)
    expect(m.indevidas.map((i) => i.tipo).sort()).toEqual(['equipe-voltou-ao-original', 'sistema-mudou-linhas'])
    expect(m.correcoes).toMatchObject({ compositor: 1, redacao: 1 })
  })

  it('o Claude (pelo chat) desfazendo a mudança do compositor também conta como volta ao original', () => {
    const original = copiaOriginal()
    const efetiva = revisar(original, { cta: ['Vem pra cá →'] }, doCompositor())
    const final = revisar(efetiva, { cta: ['Vem pra cá'] }, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat', em: T(10) })
    const { medida: m } = pecaSimples({ original, efetiva, final })
    expect(m.indevidas.map((i) => i.tipo)).toContain('equipe-voltou-ao-original')
  })

  it('a equipe vai e volta no próprio texto: nenhuma indevida (não houve mudança do sistema)', () => {
    const original = copiaOriginal()
    const meio = revisar(original, { cta: ['Chega mais'] }, noEditor(T(5)))
    const final = revisar(meio, { cta: ['Vem pra cá'] }, noEditor(T(9)))
    const { medida: m } = pecaSimples({ original, final })
    expect(m.preservada).toBe(true)
    expect(m.indevidas).toEqual([])
    expect(m.correcoes.redacao).toBe(2)
  })
})

// ─── o revisor é classe própria ───────────────────────────────────────────

describe('o revisor nunca vira preferência da equipe', () => {
  const original = copiaOriginal()

  it('pelo MOTIVO gravado: assinado pela equipe, é revisor — nunca redação', () => {
    const final = revisar(original, { cta: [] }, { autor: 'equipe', motivo: MOTIVO_DO_AJUSTE_DO_REVISOR, superficie: 'studio', em: T(5) })
    const { medida: m } = pecaSimples({ original, final })
    expect(m.correcoes.revisor).toBe(1)
    expect(m.correcoes.redacao).toBe(0)
  })

  // C15-01: a janela de tempo NÃO classifica. A chamada só de ajustes grava o
  // motivo em toda revisão; o que só uma janela alcançaria é de OUTRA chamada.
  const ajusteDeMover = (em: string, copy: CopyAutoral) =>
    arte('gen-aj', {
      source: 'ajuste-arte',
      createdAt: em,
      revisao: { versaoAntes: 'v1', ajustes: [{ tipo: 'mover', camadas: ['cta'], dy: -20 }], aplicados: [{ indice: 0, tipo: 'mover', camadas: ['cta'], detalhe: 'subiu 20px' }], recusados: [] },
      ajustes: {},
      copyAutoral: { original: copy, efetiva: copy, comparavel: true },
    })

  it('correção de texto numa OUTRA chamada, um minuto DEPOIS do ajuste do revisor, é redação (C15-01)', () => {
    const final = revisar(original, { cta: ['Chega mais'] }, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat', em: T(6) })
    const { medida: m } = pecaSimples({ original, final, artesExtras: [ajusteDeMover(T(5), original)] })
    expect(m.correcoes).toMatchObject({ redacao: 1, revisor: 1 })
  })

  it('e um minuto ANTES do ajuste também (C15-01)', () => {
    const final = revisar(original, { cta: ['Chega mais'] }, { autor: 'equipe', motivo: 'ajustar-arte', superficie: 'studio', em: T(6) })
    const { medida: m } = pecaSimples({ original, final, artesExtras: [ajusteDeMover(T(7), final)] })
    expect(m.correcoes).toMatchObject({ redacao: 1, revisor: 1 })
  })

  it('a MESMA autoria sem a arte do ajuste é redação (a causa não sai do autor)', () => {
    const final = revisar(original, { cta: [] }, { autor: 'claude', motivo: 'outro motivo', superficie: 'chat', em: T(5) })
    const { medida: m } = pecaSimples({ original, final })
    expect(m.correcoes.redacao).toBe(1)
    expect(m.correcoes.revisor).toBe(0)
  })

  it('ajuste do revisor que TROCOU texto junto: a revisão da copy é redação', () => {
    const final = revisar(original, { cta: ['Chega mais'] }, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat', em: T(5) })
    const ajuste = arte('gen-aj', { source: 'ajuste-arte', createdAt: T(5.5), revisao: { ajustes: [] }, ajustes: { cta: 'Chega mais' }, copyAutoral: { original: final, efetiva: final, comparavel: true } })
    const { medida: m } = pecaSimples({ original, final, artesExtras: [ajuste] })
    expect(m.correcoes.redacao).toBe(1)
    expect(m.correcoes.revisor).toBe(1) // o ajuste de diagramação em si ainda é do revisor
  })

  it('o autosave do editor dentro da janela continua sendo gesto humano', () => {
    const final = revisar(original, { cta: [] }, noEditor(T(5)))
    const ajuste = arte('gen-aj', { source: 'ajuste-arte', createdAt: T(5.5), revisao: { ajustes: [] }, ajustes: {}, copyAutoral: { original, efetiva: original, comparavel: true } })
    const { medida: m } = pecaSimples({ original, final, artesExtras: [ajuste] })
    expect(m.correcoes.redacao).toBe(1)
  })

  it('ajuste do revisor que não mexeu na copy (só corpo, gradiente) conta como revisor', () => {
    const ajuste = arte('gen-aj', { source: 'ajuste-arte', createdAt: T(5), revisao: { ajustes: [{ tipo: 'fonte' }] }, ajustes: {}, copyAutoral: { original, efetiva: original, comparavel: true } })
    const { medida: m } = pecaSimples({ original, artesExtras: [ajuste] })
    expect(m.correcoes.revisor).toBe(1)
    expect(m.correcoes.redacao).toBe(0)
  })

})

// ─── C15-02: o desfecho do esconder do revisor sai das CAMADAS ─────────────

describe('o desfecho do ajuste de visibilidade do revisor, no formato que o PR 0 grava (C15-02)', () => {
  const original = copiaOriginal()
  // A efetiva da arte do ajuste é lida das camadas CRUAS: o bloco escondido sai vazio.
  const desenhadaSemCta = revisar(original, { cta: [] }, { autor: 'sistema', motivo: 'o que foi desenhado (ajuste-arte)', superficie: 'ajuste-arte', em: T(5) })
  const visibilidade = (id: string, em: string, escondeu: boolean) =>
    arte(id, {
      source: 'ajuste-arte',
      createdAt: em,
      revisao: {
        versaoAntes: 'v1',
        ajustes: [{ tipo: 'visibilidade', camadas: ['cta'], visivel: !escondeu }],
        aplicados: [{ indice: 0, tipo: 'visibilidade', camadas: ['cta'], detalhe: escondeu ? 'escondidas' : 'mostradas' }],
        recusados: [],
      },
      ajustes: {},
      // O contrato da PÁGINA não muda: a camada marcada é lida como presente (camadasParaDecisao).
      copyAutoral: { original, efetiva: escondeu ? desenhadaSemCta : original, comparavel: true },
    })
  const camadas = (cta: Record<string, unknown> | null) =>
    JSON.stringify([{ id: 'headline', type: 'text', content: 'Sexta é dia\nde churrasco' }, ...(cta ? [{ id: 'cta', type: 'text', content: 'Vem pra cá', ...cta }] : [])])
  const MARCA = { revisao: { ocultaPeloRevisor: { em: T(5), ajuste: 0 } } }

  it('a equipe MOSTROU de novo a camada (visível, marca retirada pelo editor): ajuste do revisor desfeito', () => {
    const { medida: m } = pecaSimples({ original, layers: camadas({ visible: true }), artesExtras: [visibilidade('gen-aj', T(5), true)] })
    expect(m.indevidas).toEqual([{ tipo: 'ajuste-do-revisor-revertido', bloco: null, camada: 'cta' }])
    expect(m.visibilidadeDoRevisor).toEqual({ aceitos: 0, desfeitos: 1, removidas: 0 })
    expect(m.correcoes).toMatchObject({ revisor: 1, redacao: 0 })
    expect(m.preservada).toBe(true)
  })

  it('a camada continua escondida com a marca: aceito, e a efetiva vazia do ajuste não vira indevida de texto', () => {
    const { medida: m } = pecaSimples({ original, layers: camadas({ visible: false, metadata: MARCA }), artesExtras: [visibilidade('gen-aj', T(5), true)] })
    expect(m.indevidas).toEqual([])
    expect(m.visibilidadeDoRevisor).toEqual({ aceitos: 1, desfeitos: 0, removidas: 0 })
  })

  it('visível com a marca esquecida também é desfeito; escondida SEM marca (a pessoa reescondeu) é aceito', () => {
    const aj = [visibilidade('gen-aj', T(5), true)]
    expect(pecaSimples({ original, layers: camadas({ visible: true, metadata: MARCA }), artesExtras: aj }).medida.visibilidadeDoRevisor?.desfeitos).toBe(1)
    expect(pecaSimples({ original, layers: camadas({ visible: false }), artesExtras: aj }).medida.visibilidadeDoRevisor?.aceitos).toBe(1)
  })

  it('vale a ÚLTIMA decisão do revisor: ele mesmo mostrou depois → visível é aceito; escondida depois disso é desfeito', () => {
    const aj = [visibilidade('gen-aj', T(5), true), visibilidade('gen-aj2', T(7), false)]
    const aceito = pecaSimples({ original, layers: camadas({ visible: true }), artesExtras: aj }).medida
    expect(aceito.indevidas).toEqual([])
    expect(aceito.visibilidadeDoRevisor?.aceitos).toBe(1)
    const desfeito = pecaSimples({ original, layers: camadas({ visible: false }), artesExtras: aj }).medida
    expect(desfeito.indevidas.map((i) => i.camada)).toEqual(['cta'])
  })

  it('camada apagada não é aceito nem desfeito; camadas ilegíveis não viram desfecho', () => {
    const aj = [visibilidade('gen-aj', T(5), true)]
    expect(pecaSimples({ original, layers: camadas(null), artesExtras: aj }).medida.visibilidadeDoRevisor).toEqual({ aceitos: 0, desfeitos: 0, removidas: 1 })
    const ilegivel = pecaSimples({ original, layers: 'lixo{', artesExtras: aj }).medida
    expect(ilegivel.visibilidadeDoRevisor).toBeNull()
    expect(ilegivel.indevidas).toEqual([])
    expect(medirQualidadeDaCopy([ilegivel]).visibilidadeDoRevisor.ilegiveis).toBe(1)
  })

  it('ZERAR o texto (slotValues vazio) de uma camada marcada é redação de quem pediu, não revisor', () => {
    const final = revisar(original, { cta: [] }, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat', em: T(8) })
    const { medida: m } = pecaSimples({ original, final, layers: camadas({ visible: false, metadata: MARCA }) })
    expect(m.correcoes).toMatchObject({ redacao: 1, revisor: 0 })
    expect(m.indevidas).toEqual([])
  })

  it('a pessoa editando o texto da camada ainda escondida e voltando ao original NÃO desfaz o ajuste do revisor', () => {
    const meio = revisar(original, { cta: ['Chega mais'] }, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat', em: T(8) })
    const final = revisar(meio, { cta: ['Vem pra cá'] }, { autor: 'claude', motivo: 'ajustar-arte', superficie: 'chat', em: T(9) })
    const { medida: m } = pecaSimples({ original, final, layers: camadas({ visible: false, metadata: MARCA }), artesExtras: [visibilidade('gen-aj', T(5), true)] })
    expect(m.indevidas).toEqual([])
    expect(m.visibilidadeDoRevisor?.aceitos).toBe(1)
  })

  it('ajustesDeVisibilidade: só visibilidade aplicada, com camadas e detalhe conhecidos', () => {
    const lidas = ajustesDeVisibilidade([
      arte('a', { source: 'ajuste-arte', createdAt: T(2), revisao: { aplicados: [{ tipo: 'mover', camadas: ['cta'], detalhe: 'x' }, { tipo: 'visibilidade', camadas: ['cta', 7], detalhe: 'escondidas' }, { tipo: 'visibilidade', camadas: [], detalhe: 'mostradas' }, 'lixo'] } }),
      arte('b', { source: 'compositor', createdAt: T(1), revisao: { aplicados: [{ tipo: 'visibilidade', camadas: ['x'], detalhe: 'escondidas' }] } }),
      arte('c', { source: 'ajuste-arte', createdAt: T(1), revisao: { aplicados: [{ tipo: 'visibilidade', camadas: ['logo'], detalhe: 'mostradas' }] } }),
    ])
    expect(lidas).toEqual([
      { em: Date.parse(T(1)), camadas: ['logo'], escondeu: false },
      { em: Date.parse(T(2)), camadas: ['cta'], escondeu: true },
    ])
  })
})

describe('causaDaRevisao — outras classes', () => {
  const r = (over: Partial<Parameters<typeof causaDaRevisao>[0]>) => ({ em: T(3), autor: 'sistema' as const, motivo: 'x', blocos: ['cta'], ...over })

  it('reverter-arte do sistema é design; sistema fora das superfícies conhecidas é indeterminada', () => {
    expect(causaDaRevisao(r({ superficie: 'reverter-arte' }))).toBe('design')
    expect(causaDaRevisao(r({ superficie: 'outra' }))).toBe('indeterminada')
    expect(causaDaRevisao(r({ superficie: 'recomposicao' }))).toBe('compositor')
  })
  it('autoria desconhecida é indeterminada', () => {
    expect(causaDaRevisao(r({ autor: 'desconhecido' }))).toBe('indeterminada')
  })
  it('humano mexendo só em estilo é design', () => {
    expect(causaDaRevisao(r({ autor: 'equipe', superficie: 'editor', campos: { cta: ['estilo'] } }))).toBe('design')
    expect(causaDaRevisao(r({ autor: 'equipe', superficie: 'editor', campos: { cta: ['estilo', 'linhas'] } }))).toBe('redacao')
  })
  it('revisaoMudaLinhas: linhas, bloco acrescentado (sem campos) e removido mudam; estilo não', () => {
    expect(revisaoMudaLinhas(r({ campos: { cta: ['estilo'] } }))).toBe(false)
    expect(revisaoMudaLinhas(r({ campos: { cta: ['linhas'] } }))).toBe(true)
    expect(revisaoMudaLinhas(r({}))).toBe(true)
    expect(revisaoMudaLinhas(r({ campos: { cta: ['estilo'] }, removidos: [{ id: 'cta', funcao: 'cta', linhas: ['x'] }] }))).toBe(true)
  })
})

describe('refino', () => {
  it('refino desfeito pela equipe é indevida própria', () => {
    const original = copiaOriginal()
    const refinada = revisar(original, { headline: ['Sexta é dia', 'de brasa'] }, { autor: 'claude', motivo: 'refinar', superficie: 'melhoria', em: T(5) })
    const final = revisar(refinada, { headline: ['Sexta é dia', 'de churrasco'] }, noEditor(T(9)))
    const refino = arte('gen-ref', { source: 'ai_improvement', modo: 'refinar', createdAt: T(5), copyAutoral: { original: refinada, efetiva: refinada, comparavel: true } })
    const { medida: m } = pecaSimples({ original, final, artesExtras: [refino] })
    expect(m.indevidas.map((i) => i.tipo)).toEqual(['refino-revertido'])
  })
})

// ─── legado, deduplicação, evidências ─────────────────────────────────────

describe('denominador e deduplicação', () => {
  it('peça sem contrato fica fora do denominador (sem-contrato) — nunca fiel nem infiel', () => {
    const pecas = montarPecas(leitura({ artes: [arte('gen-1', { copyAutoral: null })], paginas: [{ id: 'page-1', copyAutoral: null, layers: '[]' }] }))
    const m = medirPeca(pecas[0])
    expect(m).toMatchObject({ comparavel: false, exclusao: 'sem-contrato', preservada: null })
    const q = medirQualidadeDaCopy([m])
    expect(q.comparaveis).toBe(0)
    expect(q.foraDoDenominador.semContrato).toBe(1)
  })

  it('autoria desconhecida (o adaptador do legado) também fica fora, contada à parte', () => {
    const original = copiaOriginal('desconhecido')
    const m = pecaSimples({ original }).medida
    expect(m.exclusao).toBe('autoria-desconhecida')
    expect(medirQualidadeDaCopy([m]).foraDoDenominador.autoriaDesconhecida).toBe(1)
  })

  it('contrato ilegível na arte conta como sem contrato (não quebra)', () => {
    const pecas = montarPecas(leitura({ artes: [arte('gen-1', { copyAutoral: { original: { versao: 'x' } } })] }))
    expect(medirPeca(pecas[0]).exclusao).toBe('sem-contrato')
  })

  it('arte sem página: a copy final é a efetiva da arte mais nova', () => {
    const original = copiaOriginal()
    const efetiva = revisar(original, { cta: ['Vem pra cá →'] }, doCompositor())
    const pecas = montarPecas({
      posts: [{ id: 'post-1', pageId: null, generationId: 'gen-1', createdAt: T(30) }],
      artes: [arte('gen-1', { pageId: null, copyAutoral: { original, efetiva, comparavel: true } })],
      paginas: [],
      itens: [],
      sinais: [],
    })
    expect(pecas[0].chave).toBe('gen:gen-1')
    expect(medirPeca(pecas[0]).sistemaMudouLinhas).toBe(true)
  })

  it('UMA peça por página: dois posts e três artes da mesma página não inflam nada', () => {
    const original = copiaOriginal()
    const pecas = montarPecas(
      leitura({
        posts: [
          { id: 'post-1', pageId: 'page-1', generationId: null, createdAt: T(30) },
          // O segundo post aponta só para a arte do ajuste — que é da mesma página.
          { id: 'post-2', pageId: null, generationId: 'gen-3', createdAt: T(40) },
        ],
        artes: [
          arte('gen-1', { copyAutoral: { original, efetiva: original, comparavel: true } }),
          arte('gen-2', { source: 'ajuste-arte', createdAt: T(5), copyAutoral: { original, efetiva: original, comparavel: true } }),
          arte('gen-3', { source: 'ajuste-arte', createdAt: T(6), copyAutoral: { original, efetiva: original, comparavel: true } }),
        ],
        paginas: [{ id: 'page-1', copyAutoral: original, layers: '[]' }],
      }),
    )
    expect(pecas).toHaveLength(1)
    expect(pecas[0].postIds.sort()).toEqual(['post-1', 'post-2'])
    expect(medirQualidadeDaCopy(pecas.map(medirPeca)).pecas).toBe(1)
  })

  it('evidências fora da copy: foto, design, compositor e revisor — avisos à parte, nunca como correção', () => {
    const original = copiaOriginal()
    const { medida: m } = pecaSimples({
      original,
      artesExtras: [arte('gen-r', { source: 'compositor', createdAt: T(2), avisos: ['minuto ocupado'], recomposicao: { estado: 'recusada', errorCode: 'TEXTO_NAO_CABE_NA_COLUNA' }, copyAutoral: { original, efetiva: original, comparavel: true } })],
      extras: {
        sinais: [
          { tipo: 'troca-de-arte', desfecho: 'escolha-propria', postId: 'post-1', pageId: null, generationId: null },
          { tipo: 'foto', desfecho: 'trocada', postId: null, pageId: null, generationId: 'gen-1' },
          { tipo: 'foto', desfecho: 'aceita-como-veio', postId: null, pageId: null, generationId: 'gen-1' },
          { tipo: 'geometria', desfecho: 'escolha-propria', postId: null, pageId: 'page-1', generationId: null },
          { tipo: 'geometria', desfecho: 'escolha-propria', postId: null, pageId: 'outra-pagina', generationId: null },
        ],
      },
    })
    expect(m.correcoes).toMatchObject({ foto: 2, design: 1, compositor: 1, redacao: 0 })
    expect(m.avisosDoSistema).toBe(1)
  })
})

// ─── amostra, tempo, voz ──────────────────────────────────────────────────

describe('amostra insuficiente é declarada, nunca percentual', () => {
  it('abaixo do limiar: os números crus, sem percentual', () => {
    const q = medirQualidadeDaCopy([medida({}), medida({ preservada: false })], { limiar: 5 })
    expect(q.fidelidade.mensagemPreservada).toEqual({ estado: 'amostraInsuficiente', n: 1, de: 2, limiar: 5 })
    expect(q.fidelidade.mensagemPreservada).not.toHaveProperty('percentual')
    expect(q.indevidas.pecas.estado).toBe('amostraInsuficiente')
  })

  it('no limiar: percentual', () => {
    const ms = [medida({}), medida({}), medida({}), medida({ preservada: false }), medida({ indevidas: [{ tipo: 'sistema-mudou-linhas', bloco: null }], sistemaMudouLinhas: true })]
    const q = medirQualidadeDaCopy(ms, { limiar: LIMIAR_DE_AMOSTRA })
    expect(q.fidelidade.mensagemPreservada).toEqual({ estado: 'medida', n: 4, de: 5, percentual: 80 })
    expect(q.fidelidade.sistemaSemMudarTexto).toEqual({ estado: 'medida', n: 4, de: 5, percentual: 80 })
    expect(q.indevidas.porTipo['sistema-mudou-linhas']).toBe(1)
  })

  it('legado não conta para o limiar: 5 peças com 4 legadas é amostra insuficiente', () => {
    const ms = [medida({}), ...Array.from({ length: 4 }, () => medida({ comparavel: false, exclusao: 'sem-contrato', preservada: null }))]
    const q = medirQualidadeDaCopy(ms, { limiar: 5 })
    expect(q.pecas).toBe(5)
    expect(q.comparaveis).toBe(1)
    expect(q.fidelidade.mensagemPreservada.estado).toBe('amostraInsuficiente')
  })

  it('proporcao com denominador zero não divide', () => {
    expect(proporcao(0, 0, 0)).toEqual({ estado: 'medida', n: 0, de: 0, percentual: NaN })
    expect(proporcao(0, 0, 1).estado).toBe('amostraInsuficiente')
  })
})

describe('tempo até o rascunho (proxy)', () => {
  it('do item de plano ao primeiro post', () => {
    const original = copiaOriginal()
    const { medida: m } = pecaSimples({
      original,
      extras: {
        posts: [{ id: 'post-1', pageId: 'page-1', generationId: null, createdAt: T(45) }],
        itens: [{ id: 'item-1', postId: 'post-1', pageId: null, generationId: null, createdAt: T(-15) }],
      },
    })
    expect(m.minutosAteRascunho).toBe(60)
  })

  it('sem item, da primeira arte da peça; post anterior à arte fica fora (não é tempo negativo)', () => {
    expect(pecaSimples({}).medida.minutosAteRascunho).toBe(29)
    const antes = pecaSimples({ extras: { posts: [{ id: 'post-1', pageId: 'page-1', generationId: null, createdAt: T(0) }] } })
    expect(antes.medida.minutosAteRascunho).toBeNull()
  })

  it('mediana e p90 com amostra suficiente; abaixo, amostra insuficiente declarada como proxy', () => {
    const ms = [10, 20, 30, 40, 50, 60, 70, 80, 90, 600].map((min) => medida({ minutosAteRascunho: min }))
    const t = medirQualidadeDaCopy(ms, { limiar: 5 }).tempoAteRascunho
    expect(t).toMatchObject({ estado: 'medida', n: 10, medianaMin: 55, p90Min: 90, proxy: true })
    const pouco = medirQualidadeDaCopy(ms.slice(0, 3), { limiar: 5 }).tempoAteRascunho
    expect(pouco).toMatchObject({ estado: 'amostraInsuficiente', n: 3, proxy: true })
  })
})

describe('voz na escrita (contagem)', () => {
  it('conta carimbos por fonte, incertos à parte, e a versão atual só quando informada', () => {
    const ms = [
      medida({ voz: { fonte: 'voz', versao: 3, lidoEm: T(0) } }),
      medida({ voz: { fonte: 'voz', versao: 2, lidoEm: T(0) } }),
      medida({ voz: { fonte: 'legado', versao: null, lidoEm: T(0) } }),
      medida({ voz: { fonte: null, versao: null, lidoEm: T(0), incerto: 'x' } }),
      medida({}),
    ]
    const v = medirQualidadeDaCopy(ms, { versaoDaVozAtual: 3 }).voz
    expect(v).toEqual({ comCarimbo: 4, semCarimbo: 1, porFonte: { voz: 2, legado: 1, nenhuma: 0, incerta: 1 }, naVersaoAtual: 1 })
    expect(medirQualidadeDaCopy(ms).voz.naVersaoAtual).toBeNull()
  })

  it('o carimbo vem da arte que gravou o original', () => {
    const original = copiaOriginal()
    const l = leitura({
      artes: [
        arte('gen-1', { copyAutoral: { original, efetiva: original, comparavel: true }, vozNaEscrita: { fonte: 'voz', versao: 5, lidoEm: T(1) } }),
        arte('gen-2', { source: 'ajuste-arte', createdAt: T(5), vozNaEscrita: { fonte: 'voz', versao: 6, lidoEm: T(5) } }),
      ],
      paginas: [{ id: 'page-1', copyAutoral: original, layers: '[]' }],
    })
    expect(montarPecas(l)[0].voz?.versao).toBe(5)
  })
})

// ─── esquema e texto ──────────────────────────────────────────────────────

describe('faltaDeEsquema', () => {
  it('reconhece coluna e tabela ausentes (Prisma e Postgres cru); o resto não', () => {
    expect(faltaDeEsquema({ code: 'P2022', meta: { column: 'Page.copyAutoral' } })).toMatch(/Page\.copyAutoral/)
    expect(faltaDeEsquema({ code: 'P2021', meta: { table: 'public.BrandVoice' } })).toMatch(/BrandVoice/)
    expect(faltaDeEsquema({ code: 'P2010', meta: { code: '42703' }, message: 'raw query failed' })).toMatch(/coluna ausente/)
    expect(faltaDeEsquema(new Error('column "copyAutoral" does not exist'))).toMatch(/coluna ausente/)
    expect(faltaDeEsquema(new Error('conexão caiu'))).toBeNull()
    expect(faltaDeEsquema(null)).toBeNull()
  })
})

describe('cancelamentoPorTempo', () => {
  it('reconhece o statement_timeout do servidor e mais nada', () => {
    expect(cancelamentoPorTempo({ code: 'P2010', meta: { code: '57014' }, message: 'raw query failed' })).toBe(true)
    expect(cancelamentoPorTempo(new Error('canceling statement due to statement timeout'))).toBe(true)
    expect(cancelamentoPorTempo({ code: 'P2022', meta: { column: 'x' } })).toBe(false)
    expect(cancelamentoPorTempo(null)).toBe(false)
  })
})

describe('o texto do relatório', () => {
  it('sem peça e sem problema: nenhum bloco', () => {
    expect(blocoDaQualidadeDaCopy({ carteira: null, indisponiveis: [], foraDoOrcamento: [] })).toBeNull()
  })

  it('amostra insuficiente aparece como tal, sem "%"', () => {
    const q = medirQualidadeDaCopy([medida({}), medida({ comparavel: false, exclusao: 'sem-contrato', preservada: null })], { limiar: 15 })
    const texto = blocoDaQualidadeDaCopy({ carteira: q, indisponiveis: [], foraDoOrcamento: [] })!
    expect(texto).toMatch(/amostra insuficiente \(1\/1, mínimo 15\)/)
    expect(texto).not.toMatch(/\d%/)
    expect(texto).toMatch(/1 fora da medida \(1 sem contrato/)
  })

  it('medida com causas, indevidas, indisponíveis e fora do orçamento', () => {
    const ms = Array.from({ length: 15 }, (_, i) =>
      medida({ correcoes: { redacao: 1, compositor: 0, foto: 0, design: 0, revisor: i === 0 ? 1 : 0, indeterminada: 0 }, indevidas: i === 0 ? [{ tipo: 'ajuste-do-revisor-revertido', bloco: 'cta' }] : [] }),
    )
    const texto = blocoDaQualidadeDaCopy({ carteira: medirQualidadeDaCopy(ms, { limiar: 15 }), indisponiveis: [{ nome: 'TERO', motivo: 'o esquema não está neste banco' }], foraDoOrcamento: ['By Rock'] })!
    expect(texto).toMatch(/mensagem preservada: 100% \(15\/15\)/)
    expect(texto).toMatch(/redação 15 · revisor 1/)
    expect(texto).toMatch(/ajuste do revisor desfeito 1/)
    expect(texto).toMatch(/TERO: medida indisponível/)
    expect(texto).toMatch(/fora do tempo do relatório: By Rock/)
  })

  it('o desfecho do esconder do revisor aparece quando existe', () => {
    const q = medirQualidadeDaCopy([medida({ visibilidadeDoRevisor: { aceitos: 2, desfeitos: 1, removidas: 0 } })], { limiar: 1 })
    expect(blocoDaQualidadeDaCopy({ carteira: q, indisponiveis: [], foraDoOrcamento: [] })).toMatch(/revisor escondeu\/mostrou: 2 aceito\(s\) · 1 desfeito\(s\)/)
  })

  it('linha por cliente', () => {
    expect(linhaDaCopyDoCliente(null)).toBeNull()
    expect(linhaDaCopyDoCliente(medirQualidadeDaCopy([]))).toBeNull()
    expect(linhaDaCopyDoCliente(medirQualidadeDaCopy([medida({ comparavel: false, exclusao: 'sem-contrato', preservada: null })]))).toMatch(/todas fora da medida/)
    expect(linhaDaCopyDoCliente(medirQualidadeDaCopy([medida({ indevidas: [{ tipo: 'sistema-mudou-linhas', bloco: null }] })], { limiar: 1 }))).toMatch(/fidelidade 100% \(1\/1\) · 1 indevida/)
  })
})
