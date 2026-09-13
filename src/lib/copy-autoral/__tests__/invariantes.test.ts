/**
 * As DUAS INVARIANTES do módulo da copy autoral, conferidas por varredura de
 * FRONTEIRA (auditoria do PR 2, 13/09/2026 — depois de PR2-01…PR2-04, quatro
 * rodadas do Codex achando, um por vez, um teto do schema que uma função
 * produtora violava ou um validador parcial que discordava do total):
 *
 *  1. Tudo que o módulo PRODUZ o leitor ACEITA, com conteúdo idêntico; quando
 *     não dá, a recusa é explícita e a entrada fica intacta.
 *  2. Validação de parte concorda com a do todo nas regras LOCAIS.
 *
 * A varredura lê os tetos do PRÓPRIO schema (zod) e gera, para cada campo com
 * limite, teto-1 · teto · teto+1 · vazio · omitido · duplicado · fora do
 * alfabeto · chave desconhecida. Campo novo com limite entra sozinho; tipo de
 * schema que ela não conhece QUEBRA o teste (ensine antes de mudar o schema).
 * Sem dependência nova: os casos são gerados à mão, em laço.
 */
import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import {
  CopyLegadaIncompativel,
  FUNCOES,
  HistoricoDaCopyCheio,
  RevisaoDaCopyInvalida,
  VERSAO_DO_CONTRATO,
  aplicarRevisao,
  blocoAutoralSchema,
  blocosEmOrdem,
  blocosParaOCompositor,
  converterBlocosLegados,
  converterListaLegada,
  copyAutoralSchema,
  copyDeBlocosLegados,
  copyDeListaLegada,
  diferencasDeBlocos,
  lerCopyAutoral,
  revisaoDaCopySchema,
  serializarCopyAutoral,
  tentarAplicarRevisao,
  validarBlocoAutoral,
  validarCopyAutoral,
  validarRevisaoDaCopy,
  type BlocoAutoral,
  type BlocoLegado,
  type CopyAutoral,
  type ProblemaDaCopy,
  type QuemRevisa,
  type RevisaoDaCopy,
} from '..'

// ─── a varredura de fronteira ────────────────────────────────────────────────

type Chave = string | number
interface Caso {
  caminho: string
  rotulo: string
  aplicar: <T>(raiz: T) => T
}

const OMITIR = Symbol('omitir')
const clonar = <T>(v: T): T => structuredClone(v)

function comValorEm<T>(raiz: T, caminho: Chave[], novo: unknown): T {
  if (caminho.length === 0) return (novo === OMITIR ? undefined : novo) as T
  const copia = clonar(raiz) as unknown as Record<Chave, unknown>
  let alvo = copia
  for (const k of caminho.slice(0, -1)) alvo = alvo[k] as Record<Chave, unknown>
  const ultima = caminho[caminho.length - 1]
  if (novo === OMITIR) delete alvo[ultima]
  else alvo[ultima] = novo
  return copia as unknown as T
}

/** Textos de fronteira para um ZodString: vazio, min-1, min, teto-1, teto, teto+1, fora do alfabeto. */
function textosDeFronteira(schema: ZodTypeAny): Array<{ rotulo: string; texto: string }> {
  const checks = schema._def.checks as Array<{ kind: string; value?: number }>
  const comRegex = checks.some((c) => c.kind === 'regex')
  const txt = (n: number) => (comRegex ? 'a' : 'x').repeat(n)
  const saida = [{ rotulo: 'vazio', texto: '' }]
  for (const c of checks) {
    if (c.kind === 'min' && c.value! > 0) saida.push({ rotulo: `min-1 (${c.value! - 1})`, texto: txt(c.value! - 1) }, { rotulo: `min (${c.value})`, texto: txt(c.value!) })
    if (c.kind === 'max') saida.push({ rotulo: `teto-1 (${c.value! - 1})`, texto: txt(c.value! - 1) }, { rotulo: `teto (${c.value})`, texto: txt(c.value!) }, { rotulo: `teto+1 (${c.value! + 1})`, texto: txt(c.value! + 1) })
  }
  if (comRegex) saida.push({ rotulo: 'fora do alfabeto', texto: 'a b' })
  return saida
}

function fronteiras(schema: ZodTypeAny, valor: unknown, caminho: Chave[] = []): Caso[] {
  const def = schema._def
  const casos: Caso[] = []
  const nome = caminho.join('.') || '(raiz)'
  const em = (rotulo: string, novo: unknown) => casos.push({ caminho: nome, rotulo, aplicar: (r) => comValorEm(r, caminho, novo) })
  switch (def.typeName) {
    case 'ZodOptional':
      if (valor === undefined) return casos
      em('omitido', OMITIR)
      return [...casos, ...fronteiras(def.innerType, valor, caminho)]
    case 'ZodObject': {
      const objeto = valor as Record<string, unknown>
      em('chave desconhecida', { ...objeto, chaveIntrusa: 1 })
      em('não é objeto', 'x')
      for (const [k, sub] of Object.entries(schema._def.shape() as Record<string, ZodTypeAny>)) casos.push(...fronteiras(sub, objeto[k], [...caminho, k]))
      return casos
    }
    case 'ZodArray': {
      const lista = valor as unknown[]
      const n = (k: number) => Array.from({ length: k }, (_, i) => clonar(lista.length ? lista[i % lista.length] : undefined))
      em('vazio', [])
      if (def.minLength && def.minLength.value > 0) em(`min-1 (${def.minLength.value - 1})`, n(def.minLength.value - 1))
      if (def.maxLength && lista.length) {
        const t = def.maxLength.value
        em(`teto-1 (${t - 1})`, n(t - 1))
        em(`teto (${t})`, n(t))
        em(`teto+1 (${t + 1})`, n(t + 1))
      }
      if (lista.length) em('duplicado', [...clonar(lista), clonar(lista[0])])
      lista.forEach((item, i) => casos.push(...fronteiras(def.type, item, [...caminho, i])))
      return casos
    }
    case 'ZodString':
      for (const { rotulo, texto } of textosDeFronteira(schema)) em(rotulo, texto)
      em('não é texto', 7)
      return casos
    case 'ZodNumber': {
      const checks = def.checks as Array<{ kind: string; value?: number }>
      for (const c of checks) {
        if (c.kind === 'min') {
          em(`min-1 (${c.value! - 1})`, c.value! - 1)
          em(`min (${c.value})`, c.value)
        }
        if (c.kind === 'max') {
          em(`teto (${c.value})`, c.value)
          em(`teto+1 (${c.value! + 1})`, c.value! + 1)
        }
        if (c.kind === 'int') em('fracionário', 0.5)
      }
      em('não é número', '1')
      return casos
    }
    case 'ZodEnum':
      for (const v of def.values as string[]) em(`opção ${v}`, v)
      em('fora da lista', 'nao-existe')
      return casos
    case 'ZodLiteral':
      em('outro valor', 'outro')
      return casos
    case 'ZodRecord': {
      const registro = valor as Record<string, unknown>
      const [primeira] = Object.keys(registro)
      em('vazio', {})
      for (const { rotulo, texto } of textosDeFronteira(def.keyType)) {
        const { [primeira]: v, ...resto } = registro
        em(`chave ${rotulo}`, { ...resto, [texto]: v })
      }
      for (const [k, v] of Object.entries(registro)) casos.push(...fronteiras(def.valueType, v, [...caminho, k]))
      return casos
    }
    default:
      throw new Error(`a varredura não conhece ${def.typeName} em ${nome}: ensine-a antes de mudar o schema`)
  }
}

// ─── amostras CHEIAS (todo campo opcional presente) e válidas ──────────────

const T = (h: number) => `2026-09-13T${String(h).padStart(2, '0')}:00:00.000Z`

const BLOCO_CHEIO: BlocoAutoral = {
  id: 'headline',
  funcao: 'headline',
  grupoDeLeitura: 'frase-1',
  ordem: 1,
  linhas: ['Milk-shake', 'vem [em dobro]'],
  fatos: [{ entradaId: 'kb-promo', trecho: 'em dobro' }],
  estilo: { herdaDe: 'headline', linhasNaVoz2: [1] },
}

const REVISAO_CHEIA: RevisaoDaCopy = {
  em: T(11),
  autor: 'equipe',
  motivo: 'a Roberta tirou o apoio e mexeu na manchete',
  blocos: ['headline', 'velho'],
  removidos: [{ id: 'velho', funcao: 'apoio', linhas: ['Antes'] }],
  campos: { headline: ['linhas'] },
  superficie: 'editor',
}

const COPY_CHEIA: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: T(10), superficie: 'chat' },
  blocos: [{ id: 'pre', funcao: 'pre', grupoDeLeitura: 'frase-1', ordem: 0, linhas: ['Na sexta o'], fatos: [{ entradaId: 'kb-dia', trecho: 'sexta' }], estilo: { herdaDe: 'apoio' } }, BLOCO_CHEIO],
  revisoes: [REVISAO_CHEIA],
  lacunas: ['uma lacuna declarada'],
}

const QUEM: Required<QuemRevisa> = { autor: 'sistema', motivo: 'varredura de fronteira', em: T(12), superficie: 'teste' }

const semRegistroDeLinhas = (p: ProblemaDaCopy) => `${p.tipo}|${p.mensagem}`
const ordenados = (ps: ProblemaDaCopy[]) => ps.map(semRegistroDeLinhas).sort()

function relidaIdentica(copy: CopyAutoral, rotulo: string) {
  const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(copy))
  expect(problemas, rotulo).toEqual([])
  expect(lida, rotulo).toEqual(copy)
}

function capturar(fn: () => unknown): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

describe('a varredura enxerga todo campo com limite', () => {
  it('cobre os tetos de bloco, linha, voz 2, fatos, grupo, revisão, lacunas e origem', () => {
    const caminhos = new Set(fronteiras(copyAutoralSchema, COPY_CHEIA).map((c) => `${c.caminho} ${c.rotulo}`))
    for (const esperado of [
      'blocos teto+1 (41)',
      'blocos min-1 (0)',
      'blocos.1.id teto+1 (61)',
      'blocos.1.id fora do alfabeto',
      'blocos.1.linhas teto+1 (13)',
      'blocos.1.linhas.0 teto+1 (301)',
      'blocos.1.ordem teto+1 (100)',
      'blocos.1.grupoDeLeitura teto+1 (61)',
      'blocos.1.fatos teto+1 (9)',
      'blocos.1.fatos.0.trecho teto+1 (201)',
      'blocos.1.estilo.linhasNaVoz2 teto+1 (13)',
      'blocos.1.estilo.linhasNaVoz2.0 teto+1 (12)',
      'revisoes teto+1 (201)',
      'revisoes.0.motivo teto+1 (301)',
      'revisoes.0.motivo vazio',
      'revisoes.0.em teto+1 (41)',
      'revisoes.0.superficie teto+1 (41)',
      'revisoes.0.blocos teto+1 (81)',
      'revisoes.0.removidos teto+1 (41)',
      'revisoes.0.campos chave teto+1 (61)',
      'revisoes.0.campos.headline teto+1 (11)',
      'revisoes.0.campos.headline.0 teto+1 (31)',
      'lacunas teto+1 (21)',
      'lacunas.0 teto+1 (201)',
      'origem.em teto+1 (41)',
      'origem.superficie vazio',
    ]) expect(caminhos.has(esperado), esperado).toBe(true)
  })
})

// ─── INVARIANTE 1: o que o módulo produz, o leitor aceita ──────────────────

describe('invariante 1 — validarCopyAutoral/lerCopyAutoral: o que aceita volta idêntico, e as partes também passam', () => {
  it('em toda fronteira da copy inteira', () => {
    let aceitas = 0
    let recusadas = 0
    for (const caso of fronteiras(copyAutoralSchema, COPY_CHEIA)) {
      const rotulo = `${caso.caminho} ${caso.rotulo}`
      const entrada = caso.aplicar(COPY_CHEIA)
      const r = validarCopyAutoral(entrada)
      if (!r.copy) {
        recusadas++
        expect(r.problemas.length, rotulo).toBeGreaterThan(0)
        continue
      }
      aceitas++
      expect(r.copy, rotulo).toEqual(entrada)
      relidaIdentica(r.copy, rotulo)
      // o todo aceito ⇒ cada parte aceita pelo validador parcial (invariante 2, na volta)
      for (const b of blocosEmOrdem(r.copy)) expect(validarBlocoAutoral(b).problemas, `${rotulo} · bloco ${b.id}`).toEqual([])
      for (const rev of r.copy.revisoes) expect(validarRevisaoDaCopy(rev).problemas, `${rotulo} · revisão`).toEqual([])
      // a conversão de saída não perde texto: o que ela entrega o adaptador lê de volta, exato
      const { blocos } = blocosParaOCompositor(r.copy)
      const volta = converterBlocosLegados(blocos)
      if (blocos.length === 0) expect(volta.copy, rotulo).toBeNull()
      else expect(volta.copy?.blocos.map((b) => b.linhas), rotulo).toEqual(blocos.map((b) => b.linhas))
    }
    expect(aceitas).toBeGreaterThan(20)
    expect(recusadas).toBeGreaterThan(50)
  })
})

/** A copy que o CONTRATO descreve para uma revisão: blocos como vieram, revisão com os metadados como vieram. */
function copyRevisadaEsperada(base: CopyAutoral, novos: BlocoAutoral[], quem: QuemRevisa, emEfetivo: string): CopyAutoral {
  const mudancas = diferencasDeBlocos(base, { ...base, blocos: novos })
  if (mudancas.length === 0) return { ...base, blocos: novos }
  const antes = new Map(base.blocos.map((b) => [b.id, b]))
  const removidos = mudancas.filter((m) => m.tipo === 'removido').map((m) => ({ id: m.id, funcao: antes.get(m.id)!.funcao, linhas: antes.get(m.id)!.linhas }))
  const campos = Object.fromEntries(mudancas.filter((m) => m.tipo === 'alterado').map((m) => [m.id, m.campos!]))
  const revisao = {
    em: emEfetivo,
    autor: quem.autor,
    motivo: quem.motivo,
    blocos: mudancas.map((m) => m.id),
    ...(removidos.length ? { removidos } : {}),
    ...(Object.keys(campos).length ? { campos } : {}),
    ...(quem.superficie !== undefined ? { superficie: quem.superficie } : {}),
  } as RevisaoDaCopy
  return { ...base, blocos: novos, revisoes: [...base.revisoes, revisao] }
}

const metadadosSchema = revisaoDaCopySchema.pick({ em: true, autor: true, motivo: true, superficie: true })

/** Confere UMA chamada de revisão contra o contrato: aceita ⇔ o leitor aceitaria; conteúdo idêntico; recusa tipada e sem mutação. */
function conferirRevisao(base: CopyAutoral, novos: BlocoAutoral[], quem: QuemRevisa, rotulo: string) {
  const baseAntes = clonar(base)
  const novosAntes = clonar(novos)
  const r = tentarAplicarRevisao(base, novos, quem)
  // Bloco sem forma de bloco (não é objeto, sem `linhas`): não há diff — só recusa explícita.
  const comForma = novos.every((b) => b !== null && typeof b === 'object' && Array.isArray((b as { linhas?: unknown }).linhas))
  if (!comForma) {
    expect(r.copy, rotulo).toBeNull()
    expect(r.problemas.length, rotulo).toBeGreaterThan(0)
    expect(base, rotulo).toEqual(baseAntes)
    expect(novos, rotulo).toEqual(novosAntes)
    expect(capturar(() => aplicarRevisao(base, novos, quem)), rotulo).toBeInstanceOf(RevisaoDaCopyInvalida)
    return
  }
  const houveMudanca = diferencasDeBlocos(base, { ...base, blocos: novos }).length > 0
  const emEfetivo = quem.em ?? r.copy?.revisoes.at(-1)?.em ?? T(0)
  const metadados = { em: quem.em ?? T(0), autor: quem.autor, motivo: quem.motivo, ...(quem.superficie !== undefined ? { superficie: quem.superficie } : {}) }
  const esperado = copyRevisadaEsperada(base, novos, quem, emEfetivo)
  const cheio = houveMudanca && base.revisoes.length >= 200
  const deveAceitar = !cheio && metadadosSchema.safeParse(metadados).success && validarCopyAutoral(esperado).problemas.length === 0

  expect(r.copy !== null, `${rotulo} (problemas: ${r.problemas.map((p) => p.mensagem).join(' | ')})`).toBe(deveAceitar)
  expect(base, rotulo).toEqual(baseAntes)
  expect(novos, rotulo).toEqual(novosAntes)
  expect(r.original, rotulo).toBe(base)
  if (r.copy) {
    if (houveMudanca) expect(r.copy, rotulo).toEqual(esperado)
    else expect(r.copy, rotulo).toBe(base)
    if (quem.em === undefined && houveMudanca) expect(r.copy.revisoes.at(-1)!.em, rotulo).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    relidaIdentica(r.copy, rotulo)
    expect(r.problemas, rotulo).toEqual([])
    return
  }
  expect(r.problemas.length, rotulo).toBeGreaterThan(0)
  expect(r.historicoCheio, rotulo).toBe(cheio)
  const erro = capturar(() => aplicarRevisao(base, novos, quem))
  expect(erro, rotulo).toBeInstanceOf(cheio ? HistoricoDaCopyCheio : RevisaoDaCopyInvalida)
  expect((erro as RevisaoDaCopyInvalida).copy, rotulo).toBe(base)
}

describe('invariante 1 — aplicarRevisao/tentarAplicarRevisao', () => {
  const casosDeBlocos = fronteiras(copyAutoralSchema, COPY_CHEIA).filter((c) => c.caminho.startsWith('blocos'))
  const bases: Array<[string, CopyAutoral]> = [
    ['base cheia', COPY_CHEIA],
    ['base com 199 revisões', { ...COPY_CHEIA, revisoes: Array.from({ length: 199 }, () => clonar(REVISAO_CHEIA)) }],
    ['base com 200 revisões', { ...COPY_CHEIA, revisoes: Array.from({ length: 200 }, () => clonar(REVISAO_CHEIA)) }],
  ]

  it('toda fronteira dos blocos novos, sobre bases com histórico vazio, quase cheio e cheio', () => {
    expect(casosDeBlocos.length).toBeGreaterThan(80)
    for (const [nomeDaBase, base] of bases) {
      for (const caso of casosDeBlocos) {
        const novos = caso.aplicar(COPY_CHEIA).blocos
        conferirRevisao(base, novos, QUEM, `${nomeDaBase} · ${caso.caminho} ${caso.rotulo}`)
      }
    }
  })

  it('toda fronteira dos metadados (autor, motivo, em, superfície), com e sem mudança', () => {
    const casosDeMetadados = fronteiras(metadadosSchema, QUEM).filter((c) => c.rotulo !== 'chave desconhecida' && c.rotulo !== 'não é objeto')
    expect(casosDeMetadados.map((c) => `${c.caminho} ${c.rotulo}`)).toEqual(expect.arrayContaining(['motivo vazio', 'motivo teto (300)', 'motivo teto+1 (301)', 'em vazio', 'em teto (40)', 'em teto+1 (41)', 'superficie vazio', 'superficie teto+1 (41)', 'superficie omitido', 'autor fora da lista']))
    // `em` é obrigatório na revisão gravada, mas opcional para quem chama (ausente = agora)
    const { em: _semEm, ...quemSemEm } = QUEM
    casosDeMetadados.push({ caminho: 'em', rotulo: 'ausente na chamada', aplicar: () => quemSemEm as never })
    const mudaManchete = COPY_CHEIA.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['Outra', 'manchete'] } : b))
    const quebra = COPY_CHEIA.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['y'.repeat(301), 'x'] } : b))
    for (const caso of casosDeMetadados) {
      const quem = caso.aplicar(QUEM) as QuemRevisa
      const rotulo = `metadado ${caso.caminho} ${caso.rotulo}`
      conferirRevisao(COPY_CHEIA, mudaManchete, quem, `${rotulo} · com mudança`)
      conferirRevisao(COPY_CHEIA, COPY_CHEIA.blocos, quem, `${rotulo} · sem mudança`)
      // metadado ruim E bloco ruim: os dois motivos voltam de uma vez
      const r = tentarAplicarRevisao(COPY_CHEIA, quebra, quem)
      expect(r.copy, rotulo).toBeNull()
      expect(r.problemas.some((p) => p.mensagem.startsWith('blocos.1.linhas.0')), rotulo).toBe(true)
      if (!metadadosSchema.safeParse({ ...quem, em: quem.em ?? T(0) }).success) expect(r.problemas.some((p) => p.mensagem.startsWith('revisão nova:')), rotulo).toBe(true)
    }
  })
})

describe('invariante 1 — adaptadores do legado', () => {
  const linhas = blocoAutoralSchema.shape.linhas
  const MAX_LINHA = linhas._def.type.maxLength as number
  const MAX_LINHAS = linhas._def.maxLength.value as number
  const MAX_BLOCOS = copyAutoralSchema.shape.blocos._def.maxLength.value as number
  const MAX_META = copyAutoralSchema.shape.origem.shape.em.unwrap().maxLength as number
  const metaCabe = (v: string | undefined) => v === undefined || (v.length >= 1 && v.length <= MAX_META)
  const metas: Array<{ em?: string; superficie?: string }> = [{}, { em: '' }, { superficie: '' }, { em: 'a'.repeat(MAX_META), superficie: 'a' }, { em: 'a'.repeat(MAX_META + 1) }, { superficie: 'a'.repeat(MAX_META + 1) }]
  const linhasCabem = (ls: string[]) => ls.length <= MAX_LINHAS && ls.every((l) => l.length <= MAX_LINHA)

  it('lista posicional: contagem, tamanho da linha, linhas por item, metadados e funções nas fronteiras', () => {
    const texto = (n: number) => Array.from({ length: n }, (_, i) => `linha ${i}`).join('\n')
    const listas: Array<[string, string[]]> = [
      ...[0, 1, MAX_BLOCOS - 1, MAX_BLOCOS, MAX_BLOCOS + 1].map((n): [string, string[]] => [`${n} itens`, Array.from({ length: n }, (_, i) => `Texto ${i}`)]),
      ...[MAX_LINHA - 1, MAX_LINHA, MAX_LINHA + 1].map((n): [string, string[]] => [`linha de ${n}`, ['Manchete', 'x'.repeat(n)]]),
      ...[MAX_LINHAS - 1, MAX_LINHAS, MAX_LINHAS + 1].map((n): [string, string[]] => [`item de ${n} linhas`, ['Manchete', texto(n)]]),
      ['item vazio e só quebra', ['', '\n']],
    ]
    const funcoes: Array<Array<string | null | undefined> | undefined> = [undefined, ['headline', 'apoio'], ['cta', 'cta'], [null, 'livre'], ['nao-existe']]
    for (const [nome, itens] of listas) {
      for (const meta of metas) {
        for (const fs of funcoes) {
          const rotulo = `${nome} · ${JSON.stringify(meta)} · ${JSON.stringify(fs)}`
          const opcoes = { ...meta, ...(fs ? { funcoes: fs as never } : {}) }
          const antes = clonar(itens)
          const deveAceitar =
            itens.length >= 1 && itens.length <= MAX_BLOCOS && itens.every((t) => linhasCabem(t.split('\n'))) && metaCabe(meta.em) && metaCabe(meta.superficie) && (fs ?? []).every((f) => f == null || (FUNCOES as readonly string[]).includes(f))
          const r = converterListaLegada(itens, opcoes)
          expect(r.copy !== null, `${rotulo} (${r.problemas.map((p) => p.mensagem).join(' | ')})`).toBe(deveAceitar)
          expect(itens, rotulo).toEqual(antes)
          expect(r.original, rotulo).toEqual(antes)
          if (r.copy) {
            expect(r.copy.blocos.map((b) => b.linhas), rotulo).toEqual(itens.map((t) => t.split('\n')))
            expect(r.copy.origem.em, rotulo).toBe(meta.em)
            expect(r.copy.origem.superficie, rotulo).toBe(meta.superficie)
            relidaIdentica(r.copy, rotulo)
            expect(copyDeListaLegada(itens, opcoes), rotulo).toEqual(r.copy)
          } else {
            const erro = capturar(() => copyDeListaLegada(itens, opcoes))
            expect(erro, rotulo).toBeInstanceOf(CopyLegadaIncompativel)
            expect((erro as CopyLegadaIncompativel).original, rotulo).toEqual(antes)
          }
        }
      }
    }
  })

  it('blocos por papel: papel longo, esquisito ou desconhecido nunca vira recusa; só o conteúdo e os metadados recusam', () => {
    const papeis = ['pre', 'headline', 'headline2', 'apoio', 'cta', 'servico', 'rodape', 'a'.repeat(59), 'a'.repeat(60), 'a'.repeat(61), 'b'.repeat(250), 'Pré Título!', '---', '', 'constructor', 'toString', '__proto__', 'hasOwnProperty']
    const conjuntos: Array<[string, BlocoLegado[]]> = [
      ...papeis.map((p): [string, BlocoLegado[]] => [`papel "${p.slice(0, 12)}"(${p.length})`, [{ papel: p, linhas: ['Texto'] }, { papel: p, linhas: ['Outro'] }]]),
      ...[0, 1, MAX_BLOCOS, MAX_BLOCOS + 1].map((n): [string, BlocoLegado[]] => [`${n} blocos`, Array.from({ length: n }, (_, i) => ({ papel: 'apoio', linhas: [`t${i}`] }))]),
      ...[15, 16, 17, 18, MAX_BLOCOS].map((n): [string, BlocoLegado[]] => [`${n} papéis desconhecidos`, Array.from({ length: n }, (_, i) => ({ papel: `rodape-${'z'.repeat(80)}-${i}`, linhas: [`t${i}`] }))]),
      ['39 desconhecidos + headline2', [...Array.from({ length: MAX_BLOCOS - 1 }, (_, i) => ({ papel: `x${i}`, linhas: ['t'] })), { papel: 'headline2', linhas: ['voz 2'] }]],
      ...[MAX_LINHA - 1, MAX_LINHA, MAX_LINHA + 1].map((n): [string, BlocoLegado[]] => [`linha de ${n}`, [{ papel: 'headline', linhas: ['x'.repeat(n)] }]]),
      ...[0, MAX_LINHAS - 1, MAX_LINHAS, MAX_LINHAS + 1].map((n): [string, BlocoLegado[]] => [`bloco de ${n} linhas`, [{ papel: 'apoio', linhas: Array.from({ length: n }, (_, i) => `l${i}`) }]]),
    ]
    for (const [nome, blocos] of conjuntos) {
      for (const meta of metas) {
        const rotulo = `${nome} · ${JSON.stringify(meta)}`
        const antes = clonar(blocos)
        const deveAceitar = blocos.length >= 1 && blocos.length <= MAX_BLOCOS && blocos.every((b) => linhasCabem(b.linhas)) && metaCabe(meta.em) && metaCabe(meta.superficie)
        const r = converterBlocosLegados(blocos, meta)
        expect(r.copy !== null, `${rotulo} (${r.problemas.map((p) => p.mensagem).join(' | ')})`).toBe(deveAceitar)
        expect(blocos, rotulo).toEqual(antes)
        expect(r.original, rotulo).toEqual(antes)
        if (r.copy) {
          expect(r.copy.blocos.map((b) => [b.ordem, b.linhas]), rotulo).toEqual(blocos.map((b, i) => [i, b.linhas]))
          expect(r.copy.lacunas?.some((l) => /papel desconhecido/.test(l)), rotulo).toBe(blocos.some((b) => !['pre', 'headline', 'headline2', 'apoio', 'cta', 'servico'].includes(b.papel)))
          relidaIdentica(r.copy, rotulo)
          expect(copyDeBlocosLegados(blocos, meta), rotulo).toEqual(r.copy)
        } else {
          expect(capturar(() => copyDeBlocosLegados(blocos, meta)), rotulo).toBeInstanceOf(CopyLegadaIncompativel)
        }
      }
    }
  })
})

// ─── INVARIANTE 2: a parte concorda com o todo nas regras locais ───────────

/** Os problemas do todo que são LOCAIS de um elemento, reescritos como o validador parcial os escreve. */
function locaisDoBloco(problemas: ProblemaDaCopy[], indice: number): ProblemaDaCopy[] {
  const prefixo = `blocos.${indice}`
  return problemas
    .filter((p) => (p.tipo === 'schema' && (p.mensagem.startsWith(`${prefixo}.`) || p.mensagem.startsWith(`${prefixo}:`))) || p.tipo === 'estilo')
    .map((p) => (p.tipo === 'schema' ? { ...p, mensagem: p.mensagem.startsWith(`${prefixo}:`) ? `(raiz)${p.mensagem.slice(prefixo.length)}` : p.mensagem.slice(prefixo.length + 1) } : p))
}

function locaisDaRevisao(problemas: ProblemaDaCopy[]): ProblemaDaCopy[] {
  // "cita o bloco … que não existe na copy" é regra de CONJUNTO: depende dos blocos da copy.
  return problemas
    .filter((p) => (p.tipo === 'schema' && (p.mensagem.startsWith('revisoes.0.') || p.mensagem.startsWith('revisoes.0:'))) || (p.tipo === 'revisao' && !p.mensagem.includes('não existe na copy')))
    .map((p) =>
      p.tipo === 'schema'
        ? { ...p, mensagem: p.mensagem.startsWith('revisoes.0:') ? `(raiz)${p.mensagem.slice('revisoes.0'.length)}` : p.mensagem.slice('revisoes.0.'.length) }
        : { ...p, mensagem: p.mensagem.replace(/^revisão 0 /, 'a revisão ') },
    )
}

describe('invariante 2 — a validação da parte concorda com a do todo', () => {
  it('bloco: toda fronteira do schema do bloco e os casos de segunda voz, sozinho e ao lado de outro bloco', () => {
    const semanticos: BlocoAutoral[] = [
      ...FUNCOES.map((funcao) => ({ ...BLOCO_CHEIO, funcao, estilo: { linhasNaVoz2: [0] } })),
      ...FUNCOES.map((funcao) => ({ ...BLOCO_CHEIO, funcao, estilo: { linhasNaVoz2: [] } })),
      { ...BLOCO_CHEIO, linhas: ['Uma linha'], estilo: { linhasNaVoz2: [1] } },
      { ...BLOCO_CHEIO, linhas: ['Uma linha'], estilo: { linhasNaVoz2: [0] } },
      { ...BLOCO_CHEIO, linhas: [], estilo: { linhasNaVoz2: [0] } },
      { id: 'aviso', funcao: 'livre', ordem: 0, linhas: ['Só hoje'], estilo: { linhasNaVoz2: [0] } },
      { ...BLOCO_CHEIO, funcao: 'apoio', linhas: ['a'], estilo: { linhasNaVoz2: [0, 3] } },
    ]
    const blocos: Array<[string, unknown]> = [
      ...fronteiras(blocoAutoralSchema, BLOCO_CHEIO).map((c): [string, unknown] => [`${c.caminho} ${c.rotulo}`, c.aplicar(BLOCO_CHEIO)]),
      ...semanticos.map((b, i): [string, unknown] => [`semântico ${i}`, b]),
    ]
    const vizinho: BlocoAutoral = { id: 'zz-vizinho', funcao: 'apoio', ordem: 0, linhas: ['vizinho'] }
    let aprovados = 0
    let recusadosPorRegraLocal = 0
    for (const [rotulo, b] of blocos) {
      const parte = validarBlocoAutoral(b)
      for (const [indice, lista] of [[0, [b]], [1, [vizinho, b]]] as Array<[number, unknown[]]>) {
        const todo = validarCopyAutoral({ versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: lista, revisoes: [] })
        const locais = locaisDoBloco(todo.problemas, indice)
        expect(ordenados(locais), `${rotulo} · posição ${indice}`).toEqual(ordenados(parte.problemas))
        expect(parte.bloco !== null, `${rotulo} · posição ${indice}`).toBe(locais.length === 0)
      }
      if (parte.bloco) aprovados++
      else if (parte.problemas.every((p) => p.tipo === 'estilo')) recusadosPorRegraLocal++
    }
    expect(aprovados).toBeGreaterThan(10)
    expect(recusadosPorRegraLocal).toBeGreaterThanOrEqual(8)
  })

  it('revisão: toda fronteira do schema da revisão e os casos de campos/remoção fora de `blocos`', () => {
    const semanticas: RevisaoDaCopy[] = [
      { ...REVISAO_CHEIA, campos: { apoio: ['linhas'] } },
      { ...REVISAO_CHEIA, blocos: ['headline'] },
      { ...REVISAO_CHEIA, blocos: [] },
      { em: T(9), autor: 'claude', motivo: 'm', blocos: ['headline'] },
    ]
    const revisoes: Array<[string, unknown]> = [
      ...fronteiras(revisaoDaCopySchema, REVISAO_CHEIA).map((c): [string, unknown] => [`${c.caminho} ${c.rotulo}`, c.aplicar(REVISAO_CHEIA)]),
      ...semanticas.map((r, i): [string, unknown] => [`semântica ${i}`, r]),
    ]
    const contexto = { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' as const }, blocos: [{ id: 'headline', funcao: 'headline' as const, ordem: 0, linhas: ['M'] }, { id: 'apoio', funcao: 'apoio' as const, ordem: 1, linhas: ['A'] }] }
    let aprovadas = 0
    let recusadasPorRegraLocal = 0
    for (const [rotulo, r] of revisoes) {
      const parte = validarRevisaoDaCopy(r)
      const todo = validarCopyAutoral({ ...contexto, revisoes: [r] })
      const locais = locaisDaRevisao(todo.problemas)
      expect(ordenados(locais), rotulo).toEqual(ordenados(parte.problemas))
      expect(parte.revisao !== null, rotulo).toBe(locais.length === 0)
      if (parte.revisao) aprovadas++
      else if (parte.problemas.every((p) => p.tipo === 'revisao')) recusadasPorRegraLocal++
    }
    expect(aprovadas).toBeGreaterThan(10)
    expect(recusadasPorRegraLocal).toBeGreaterThanOrEqual(3)
  })
})
