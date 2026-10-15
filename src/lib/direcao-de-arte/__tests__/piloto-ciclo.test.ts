/**
 * CP0 — P9: o ciclo revisar → ajustar → medir de novo, pelo caminho REAL
 * (`revisarArte` e `ajustarArte` de produção), com o banco em memória, o Blob
 * falso e o renderizador de verdade (as medidas precisam do render).
 *
 * O harness do banco é o de `creatives/__tests__/ajuste-render-atrasado.test.ts`.
 * O medidor é o calibrado na peça; as fontes da marca não existem no teste,
 * então o achado `fonte-nao-carregada` é artefato do ambiente e fica de fora
 * do "apta".
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const espioes = vi.hoisted(() => ({ invalidar: vi.fn(async () => ({ invalidados: 1, congelados: [] as string[] })) }))
const banco = vi.hoisted(() => ({
  pagina: null as any,
  relogio: 1_000,
  generations: [] as Array<Record<string, any>>,
  putSeq: 0,
  /** Escritas de `Page.layers` que gravaram: o CP4 promete UMA por chamada, ou nenhuma. */
  escritas: 0,
  projeto: null as any,
  foto: null as Buffer | null,
  /** A Generation do compositor (v1), como o revisor a lê: dela saem o assunto gravado e a assinatura de referência. */
  geracaoDoCompositor: null as any,
  /** A página de assinatura (o revisor compara corpo e entrelinha com ela). */
  assinatura: null as any,
}))

vi.mock('@/lib/db', () => {
  const comTemplate = () => ({ ...banco.pagina, Template: { id: 77, name: 'Arte Rápida', projectId: banco.projeto.id } })
  const tocar = (data: Record<string, unknown>) => {
    banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
    // Só a escrita de CONTEÚDO conta (a miniatura, gravada depois do render, é outra coluna e outro momento).
    if ('layers' in data) banco.escritas++
  }
  const db: Record<string, any> = {
    project: { findUnique: async () => banco.projeto },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? comTemplate() : banco.assinatura && where.id === banco.assinatura.id ? banco.assinatura : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (!banco.pagina || where.id !== banco.pagina.id) throw new Error('page not found')
        tocar(data)
        return comTemplate()
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date; isTemplate?: boolean }; data: Record<string, unknown> }) => {
        if (!banco.pagina || where.id !== banco.pagina.id) return { count: 0 }
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        if (where.isTemplate !== undefined && banco.pagina.isTemplate !== where.isTemplate) return { count: 0 }
        tocar(data)
        return { count: 1 }
      },
    },
    generation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `gen-${banco.generations.length + 1}`
        banco.generations.push({ id, createdAt: new Date(++banco.relogio), ...data })
        return { id }
      },
      findFirst: async () => banco.generations.at(-1) ?? null,
      // Mais recentes primeiro, como no `orderBy: createdAt desc` do revisor.
      findMany: async () => [...banco.generations].reverse().concat(banco.geracaoDoCompositor ? [banco.geracaoDoCompositor] : []),
    },
    knowledgeBaseEntry: { findFirst: async () => null },
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (c: string) => ({ url: `https://blob.test/${c}?n=${++banco.putSeq}` })), del: vi.fn() }))
vi.mock('@/lib/posts/register-project-fonts', () => ({
  registerProjectFonts: async () => undefined,
  fetchBuffer: async () => {
    if (!banco.foto) throw new Error('sem foto')
    return banco.foto
  },
  familiasNaoCarregadas: async () => new Set<string>(),
}))
vi.mock('@/lib/creatives/server-text-measurer', async () => {
  const { medidor } = await import('./suporte/medidor-do-piloto')
  return { createServerTextBoxMeasurer: async () => medidor, createServerTextMeasurer: async () => (l: any) => medidor(l)?.height ?? null }
})
vi.mock('@/lib/creatives/text-autofix', () => ({
  aplicarAutofixOuFalhar: async (a: { layers: unknown[] }) => ({ layers: a.layers, autocorrecao: { necessaria: false, aplicada: false, iteracoes: 0, ajustes: [], pendencias: [] }, avisos: [] }),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: espioes.invalidar }))
vi.mock('@/lib/compositor/recompor', () => ({ travarRecomposicaoDaArte: vi.fn(async () => undefined), pedirRecomposicaoDaArteCongelada: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
// O renderizador NÃO é mockado: a régua e o oráculo medem o render de verdade.

import type { Layer } from '@/types/template'
import type { Ajuste } from '@/lib/creatives/revisao/contrato'
import { ajustarArte } from '@/lib/creatives/arte-rapida'
import { revisarArte } from '@/lib/creatives/revisao/revisar-arte'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { CreativeError } from '@/lib/creatives/errors'
import { arquivosDaFixture, comArquivos, exigirMedidaFiel, fixture, fotoReconstruida } from './suporte/fixture'
import { aplicarAjustes } from '@/lib/creatives/revisao/aplicar-ajustes'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { exigir, hojeViola } from './suporte/hoje-viola'
import { CODIGOS, leituraDentroDoAlvo, leiturasDosTextos, textosQueInvadem, TOLERANCIA_DE_PIORA, type LeituraDoTexto } from './suporte/propriedades'

const CANVAS = { width: 1080, height: 1920 }
const PAGINA = 'pagina-piloto'
let arquivos: Record<string, string>

beforeAll(async () => {
  arquivos = await arquivosDaFixture()
  banco.foto = await fotoReconstruida()
}, 60_000)

beforeEach(() => {
  espioes.invalidar.mockClear()
  const peca = fixture.peca()
  banco.relogio = 1_000
  banco.generations = []
  banco.putSeq = 0
  banco.escritas = 0
  banco.projeto = { id: Number(peca.spec.projectId), name: 'Projeto da fixture', userId: 'dono-interno', instagramAccountId: null, assinatura: fixture.assinatura().numerosDoProjeto }
  banco.assinatura = fixture.assinatura().pagina
  banco.geracaoDoCompositor = {
    id: 'gen-compositor',
    sourcePageId: null,
    fieldValues: {
      pageId: PAGINA,
      source: 'compositor',
      imageUrl: arquivos['fixture:foto'],
      composicao: { ...peca.composicaoRegistrada, formato: 'story' },
    },
  }
  banco.pagina = {
    id: PAGINA,
    name: 'Peça piloto (story)',
    width: 1080,
    height: 1920,
    background: '#FFFFFF',
    tags: ['compositor', 'story'],
    isTemplate: false,
    templateId: 77,
    thumbnail: null,
    copyAutoral: null,
    updatedAt: new Date(banco.relogio),
    layers: comArquivos(peca.v1.layers, arquivos),
  }
})

const projectId = () => Number(fixture.peca().spec.projectId)
const ajustar = (ajustes: Ajuste[]) => ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: versaoDaPagina(banco.pagina)!, ajustes: structuredClone(ajustes) })
const revisar = () => revisarArte({ projectId: projectId(), pageId: PAGINA, visao: false, previa: false })
const camada = (ls: Layer[], id: string) => ls.find((l) => l.id === id)!
/**
 * A regra MEDIU: está na cobertura e foi avaliada — ou só parcial porque a
 * fonte da marca não existe no ambiente de teste (o único "parcial" aceito).
 */
function regraMediu(r: Awaited<ReturnType<typeof revisar>>, regra: string): boolean {
  const c = r.relatorio.cobertura[regra as keyof typeof r.relatorio.cobertura]
  return !!c && (c.estado === 'avaliada' || (c.estado === 'parcial' && /fonte não cadastrada/.test(c.motivo ?? '')))
}
/** Problemas abertos de verdade: `fonte-nao-carregada` é do ambiente de teste (as fontes da marca não estão aqui). */
const problemasAbertos = (r: Awaited<ReturnType<typeof revisar>>) => r.relatorio.achados.filter((a) => a.severidade === 'problema' && a.regra !== 'fonte-nao-carregada')

/** Regras do revisor que precisam ter MEDIDO para "apta" valer alguma coisa (as que viram gate). */
const REGRAS_DURAS = ['texto-sem-leitura', 'fora-da-area-segura', 'colisao', 'texto-cortado', 'texto-sobre-assunto'] as const
/** Recusas de ajustar-arte que são de SETUP (entrada, versão, página), não de qualidade. */
const RECUSAS_DE_SETUP = new Set(['AJUSTE_INVALIDO', 'PAGE_NOT_FOUND', 'PROJECT_NOT_FOUND', 'SEM_AJUSTE', 'VERSAO_OBRIGATORIA', 'VERSAO_DESATUALIZADA'])

/**
 * O que piorou de uma versão para a outra (BQ2): texto que estava no alvo e
 * saiu dele; texto já fora do alvo que piorou além do ruído; texto que passou a
 * invadir a região protegida (a vitrine). Texto no alvo que mexeu dentro dele não é piora.
 */
function pioras(antes: LeituraDoTexto[], depois: LeituraDoTexto[], invadeAntes: string[], invadeDepois: string[]) {
  const leitura = depois.filter((d) => {
    const a = antes.find((x) => x.camada === d.camada)!
    if (leituraDentroDoAlvo(a)) return !leituraDentroDoAlvo(d)
    return d.polaridade === 'clara' ? d.com > a.com + TOLERANCIA_DE_PIORA : d.com < a.com - TOLERANCIA_DE_PIORA
  })
  return { leitura: leitura.map((d) => `${d.camada}: ${antes.find((x) => x.camada === d.camada)!.com}→${d.com} (alvo ${Math.round(d.alvo)})`), assunto: invadeDepois.filter((c) => !invadeAntes.includes(c)) }
}

describe('caracterização: o caminho real hoje', () => {
  it('a revisão (só medida) acusa o serviço sem leitura — ainda sem ajuste (a correção é do CP2)', async () => {
    const r = await revisar()
    expect(r.relatorio.cobertura['texto-sem-leitura']?.estado).toBe('avaliada')
    const servico = r.relatorio.achados.find((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))
    expect(servico).toMatchObject({ severidade: 'problema', ajustes: [] })
  }, 120_000)

  it('CP4 — regressão do piloto: os 3 ajustes do agente (os dois `mover` pioram a leitura; o gradiente com cor é estrutural) são TODOS recusados, com antes/depois, e NADA é gravado', async () => {
    const antes = structuredClone(banco.pagina.layers)
    let erro: CreativeError | null = null
    try {
      await ajustar(fixture.peca().v2.revisao.ajustes as unknown as Ajuste[])
    } catch (e) {
      if (!(e instanceof CreativeError)) throw e
      erro = e
    }
    expect(erro?.code).toBe('AJUSTE_PIOROU_ARTE')
    expect(erro?.status).toBe(422)
    const recusados = (erro?.details as { recusados: Array<Record<string, any>> }).recusados
    expect(recusados.map((r) => [r.indice, r.codigo])).toEqual([[0, 'AJUSTE_PIOROU_ARTE'], [1, 'COR_DE_GRADIENTE_EXISTENTE'], [2, 'AJUSTE_PIOROU_ARTE']])
    // O `mover` do serviço (−230, o que a produção gravou) afasta o texto claro do alvo: antes e depois ditos.
    expect(recusados[0].comparacao.pioras).toEqual([expect.objectContaining({ propriedade: 'contraste', camadas: ['servico'], antes: expect.any(Number), depois: expect.any(Number) })])
    expect(recusados[0].comparacao.pioras[0].depois).toBeGreaterThan(recusados[0].comparacao.pioras[0].antes)
    expect(recusados[0].achado).toBe('visao-posicao-estranha:T2')
    // O `mover` da manchete e do apoio (+110) tira a manchete escura do alvo.
    expect(recusados[2].comparacao.pioras).toEqual([expect.objectContaining({ propriedade: 'contraste', camadas: ['headline'] })])
    expect((erro?.details as { ajusteGravado: boolean }).ajusteGravado).toBe(false)
    // A última versão boa fica: página intacta, nenhuma Generation, nenhum render reaberto, nenhuma escrita.
    expect(banco.pagina.layers).toEqual(antes)
    expect({ escritas: banco.escritas, generations: banco.generations.length, invalidar: espioes.invalidar.mock.calls.length }).toEqual({ escritas: 0, generations: 0, invalidar: 0 })
  }, 120_000)
})

/** Ajustes que o piloto ACEITA e RECUSA pela não-piora (medidos em 15/10/2026, a v1 da fixture). */
const ACEITO_APOIO = { tipo: 'mover', dy: -6, camadas: ['apoio'] } as const
const ACEITO_TOPO = { tipo: 'mover', dy: -60, camadas: ['headline', 'apoio'] } as const
const PIORA_SERVICO = { tipo: 'mover', dy: -230, camadas: ['servico'] } as const
const PIORA_GRADIENTE = { tipo: 'gradiente', borda: 'rodape', forca: 0.95, altura: 730 } as const

describe('CP4 — medir antes, aplicar em memória, medir depois; UMA escrita no fim', () => {
  it('lote parcial (bom, ruim, bom): o 1º e o 3º entram (o 3º medido sobre o estado com o 1º), o 2º é recusado com antes/depois; `parcial`; UMA escrita', async () => {
    const r = await ajustar([ACEITO_APOIO, PIORA_SERVICO, ACEITO_TOPO] as unknown as Ajuste[])
    expect(r.resultadoDosAjustes).toBe('parcial')
    expect(r.ajustesAplicados?.map((a) => [a.indice, a.camadas])).toEqual([[0, ['apoio']], [2, ['headline', 'apoio']]])
    expect(r.ajustesRecusados?.map((a) => [a.indice, a.codigo])).toEqual([[1, 'AJUSTE_PIOROU_ARTE']])
    expect(r.ajustesRecusados?.[0].comparacao?.pioras).toEqual([expect.objectContaining({ propriedade: 'contraste', camadas: ['servico'] })])
    const persistidas = banco.pagina.layers as Layer[]
    const v1 = fixture.peca().v1.layers
    expect(camada(persistidas, 'apoio').position.y).toBe(camada(v1, 'apoio').position.y - 66)
    expect(camada(persistidas, 'headline').position.y).toBe(camada(v1, 'headline').position.y - 60)
    expect(camada(persistidas, 'servico').position).toEqual(camada(v1, 'servico').position)
    expect({ escritas: banco.escritas, generations: banco.generations.length }).toEqual({ escritas: 1, generations: 1 })
    // O que ficou gravado na Generation diz o mesmo que a resposta (nada em silêncio).
    expect(banco.generations.at(-1)?.fieldValues?.revisao?.recusados).toEqual([expect.objectContaining({ indice: 1, codigo: 'AJUSTE_PIOROU_ARTE' })])
  }, 180_000)

  it('todos recusados pela qualidade → NENHUMA escrita: AJUSTE_PIOROU_ARTE (422) com cada recusa, página intacta, render não reaberto', async () => {
    const antes = structuredClone(banco.pagina.layers)
    await expect(ajustar([PIORA_SERVICO, PIORA_GRADIENTE] as unknown as Ajuste[])).rejects.toMatchObject({
      code: 'AJUSTE_PIOROU_ARTE',
      status: 422,
      details: { ajusteGravado: false, recusados: [expect.objectContaining({ indice: 0, codigo: 'AJUSTE_PIOROU_ARTE' }), expect.objectContaining({ indice: 1, codigo: 'AJUSTE_PIOROU_ARTE' })] },
    })
    expect(banco.pagina.layers).toEqual(antes)
    expect({ escritas: banco.escritas, generations: banco.generations.length, invalidar: espioes.invalidar.mock.calls.length }).toEqual({ escritas: 0, generations: 0, invalidar: 0 })
  }, 120_000)

  it('o gradiente mais forte que PIORA o tratamento é recusado pela propriedade `tratamento-piorou-leitura` E pelo contraste do serviço — propriedade a propriedade, sem pontuação global', async () => {
    let erro: CreativeError | null = null
    try {
      await ajustar([PIORA_GRADIENTE] as unknown as Ajuste[])
    } catch (e) {
      erro = e as CreativeError
    }
    const pioras = (erro?.details as { recusados: Array<{ comparacao: { pioras: Array<{ propriedade: string; camadas: string[] }> } }> }).recusados[0].comparacao.pioras
    expect(pioras.map((p) => [p.propriedade, p.camadas])).toEqual([
      ['tratamento-piorou-leitura', ['servico']],
      ['contraste', ['servico']],
    ])
  }, 120_000)

  it('corrida de versão: `versaoEsperada` de antes de outra escrita → VERSAO_DIVERGENTE (409) antes de medir qualquer coisa; nada gravado', async () => {
    const versaoAntiga = versaoDaPagina(banco.pagina)!
    await ajustar([ACEITO_APOIO] as unknown as Ajuste[])
    expect(banco.escritas).toBe(1)
    const depois = structuredClone(banco.pagina.layers)
    await expect(ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: versaoAntiga, ajustes: [ACEITO_TOPO] as unknown as Ajuste[] })).rejects.toMatchObject({ code: 'VERSAO_DIVERGENTE', status: 409 })
    expect(banco.pagina.layers).toEqual(depois)
    expect(banco.escritas).toBe(1)
  }, 180_000)

  it('o ajuste que declara corrigir um achado MENSURÁVEL e não o resolve nem o melhora é recusado (AJUSTE_NAO_MELHOROU_O_ACHADO), mesmo sem piorar nada', async () => {
    const r = await revisar()
    const alvo = r.relatorio.achados.find((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))!
    expect(alvo.certeza).toBe('medida')
    let erro: CreativeError | null = null
    try {
      await ajustar([{ ...ACEITO_APOIO, achado: alvo.id }] as unknown as Ajuste[])
    } catch (e) {
      erro = e as CreativeError
    }
    expect(erro?.code).toBe('AJUSTE_PIOROU_ARTE')
    const recusado = (erro?.details as { recusados: Array<Record<string, any>> }).recusados[0]
    expect(recusado).toMatchObject({ indice: 0, codigo: 'AJUSTE_NAO_MELHOROU_O_ACHADO', achado: alvo.id })
    expect(recusado.comparacao).toMatchObject({ pioras: [], achadoAlvo: { id: alvo.id, regra: 'texto-sem-leitura', estado: 'nao-melhorou' } })
    expect(banco.escritas).toBe(0)
  }, 180_000)

  it('o achado só de VISÃO não exige prova mecânica — o ajuste passa pela não-piora como qualquer outro e, sem piorar, entra', async () => {
    const r = await ajustar([{ ...ACEITO_TOPO, achado: 'visao-posicao-estranha:T2' }] as unknown as Ajuste[])
    expect(r.resultadoDosAjustes).toBe('completo')
    expect(r.ajustesAplicados?.[0]).toMatchObject({ indice: 0, achado: 'visao-posicao-estranha:T2', comparacao: { pioras: [], achadoAlvo: { id: 'visao-posicao-estranha:T2', estado: 'nao-encontrado' } } })
    expect(banco.escritas).toBe(1)
  }, 120_000)
})

/**
 * CP4 — PROVAS VISUAIS (só com PROVAS_DIR; o CI pula): o ANTES (a v1 da fixture), o DEPOIS que o CP4 recusou (o
 * `mover` do serviço que a produção gravou, aplicado em memória) e o DEPOIS que aceitou, em PNG, com a comparação
 * em JSON — para a inspeção ver a piora e a não-piora, não só ler o número:
 *
 *   PROVAS_DIR=/tmp/provas-cp4 npx vitest run src/lib/direcao-de-arte/__tests__/piloto-ciclo.test.ts -t "provas"
 */
describe.skipIf(!process.env.PROVAS_DIR)('CP4 — provas visuais', () => {
  it('grava antes.png, recusado-servico-230.png, recusado-agente-v2.png, aceito-topo-60.png e comparacao.json', async () => {
    const DIR = process.env.PROVAS_DIR!
    mkdirSync(DIR, { recursive: true })
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    const render = (layers: Layer[]) => new CanvasRenderer(CANVAS.width, CANVAS.height).renderDesign({ canvas: { ...CANVAS, backgroundColor: '#FFFFFF' }, layers }, {})
    const v1 = banco.pagina.layers as Layer[]
    writeFileSync(join(DIR, 'antes.png'), await render(v1))
    writeFileSync(join(DIR, 'recusado-servico-230.png'), await render(aplicarAjustes(v1, [PIORA_SERVICO] as unknown as Ajuste[], { canvas: CANVAS, medir: () => null }).camadas))
    writeFileSync(join(DIR, 'recusado-agente-v2.png'), await render(comArquivos(fixture.peca().v2.layers, arquivos)))
    let recusa: unknown = null
    try {
      await ajustar(fixture.peca().v2.revisao.ajustes as unknown as Ajuste[])
    } catch (e) {
      recusa = e instanceof CreativeError ? { code: e.code, message: e.message, details: e.details } : String(e)
    }
    const aceito = await ajustar([ACEITO_TOPO] as unknown as Ajuste[])
    writeFileSync(join(DIR, 'aceito-topo-60.png'), await render(banco.pagina.layers as Layer[]))
    writeFileSync(join(DIR, 'comparacao.json'), JSON.stringify({ recusa, aceito: { aplicados: aceito.ajustesAplicados, recusados: aceito.ajustesRecusados, resultado: aceito.resultadoDosAjustes } }, null, 2))
    expect(recusa).not.toBeNull()
  }, 300_000)
})

describe('P9 — recuperação', () => {
  it('um ajuste persistido nunca deixa a peça pior (leitura de cada texto e invasão da região protegida) — CP4', async () => {
    const regiaoProtegida = fixture.foto().regiaoProtegida.naPeca
    const camadasAntes = banco.pagina.layers as Layer[]
    exigirMedidaFiel(camadasAntes)
    const antes = await leiturasDosTextos(camadasAntes, CANVAS)
    try {
      await ajustar(fixture.peca().v2.revisao.ajustes as unknown as Ajuste[])
    } catch (e) {
      // Recusa estruturada DE QUALIDADE é um desfecho válido: nada pode ter sido gravado.
      if (!(e instanceof CreativeError) || RECUSAS_DE_SETUP.has(e.code)) throw e
      expect(banco.pagina.layers).toEqual(camadasAntes)
      return
    }
    exigirMedidaFiel(banco.pagina.layers)
    const depois = await leiturasDosTextos(banco.pagina.layers, CANVAS)
    const invadeAntes = textosQueInvadem(camadasAntes, regiaoProtegida).map((c) => c.camada)
    const invadeDepois = textosQueInvadem(banco.pagina.layers, regiaoProtegida).map((c) => c.camada)
    const piorou = pioras(antes, depois, invadeAntes, invadeDepois)
    expect(piorou, JSON.stringify(piorou)).toEqual({ leitura: [], assunto: [] })
  }, 120_000)

  hojeViola('em até 2 ciclos com os ajustes do próprio revisor, a peça termina apta ou com REVISAO_HUMANA_NECESSARIA', async () => {
    exigirMedidaFiel(banco.pagina.layers)
    let revisao = await revisar()
    let ultimoAjuste: unknown = null
    for (let ciclo = 0; ciclo < 2 && problemasAbertos(revisao).length > 0 && revisao.relatorio.ajustes.length > 0; ciclo++) {
      ultimoAjuste = await ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: revisao.versao, ajustes: revisao.relatorio.ajustes })
      exigirMedidaFiel(banco.pagina.layers)
      revisao = await revisar()
    }
    // Guarda contra o passe falso: as regras duras precisam ter medido (render quebrado vira "não avaliada").
    for (const regra of REGRAS_DURAS) exigir(regraMediu(revisao, regra), `a regra ${regra} mediu (${JSON.stringify(revisao.relatorio.cobertura[regra])})`)
    const apta = problemasAbertos(revisao).length === 0
    // A escalada vale para a VERSÃO FINAL: a última revisão ou o ajuste que a produziu.
    const escalada = JSON.stringify([revisao, ultimoAjuste]).includes(CODIGOS.revisaoHumana)
    expect(apta || escalada, JSON.stringify(problemasAbertos(revisao).map((a) => `${a.regra}:${a.camadas.join(',')}`))).toBe(true)
  }, 240_000)
})

describe('o revisor (só medida) sobre a v1', () => {
  it('acusa a logo sem leitura como problema (a logo creme sob o véu creme no teto claro) — CP3: logo-sem-leitura, medida', async () => {
    exigirMedidaFiel(banco.pagina.layers)
    const r = await revisar()
    // Regras de GEOMETRIA não contam: a propriedade é leitura da logo, não posição.
    const geometricas = new Set(['logo-sobre-texto', 'fora-da-area-segura', 'colisao', 'tinta-fora-da-caixa', 'texto-cortado'])
    const daLogo = r.relatorio.achados.filter((a) => a.camadas.includes('logo') && !geometricas.has(a.regra) && a.severidade === 'problema')
    expect(daLogo.length, JSON.stringify(r.relatorio.achados.map((a) => `${a.regra}:${a.camadas.join(',')}`))).toBeGreaterThan(0)
  }, 120_000)

  // Era um hojeViola só ("não diz teto" E "traz correção"): o CP1 corrigiu o diagnóstico; a correção executável é do CP2.
  it('no serviço sem leitura, não diz "teto" com a força no piso: diz PISO, a faixa, a margem e por que mais força deste véu não resolve', async () => {
    const r = await revisar()
    const servico = r.relatorio.achados.find((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))
    exigir(servico, 'o revisor acusa o serviço sem leitura')
    expect(servico.observacao).not.toMatch(/teto/i)
    expect(servico.observacao).toMatch(/PISO da faixa da marca \(força 0\.45; faixa da marca 0\.45–0\.9\): há margem para aumentar até 0\.9/)
    expect(servico.observacao).toMatch(/o véu \(#F3EADC, luz 235\) é mais claro que o fundo sob o texto/)
    expect(servico.evidencia).toMatchObject({ forcaAtual: 0.45, forcaMinima: 0.45, forcaMaxima: 0.9, posicaoDaForca: 'piso' })
  }, 120_000)

  hojeViola('no serviço sem leitura, traz correção executável (CP2)', async () => {
    const r = await revisar()
    const servico = r.relatorio.achados.find((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))
    exigir(servico, 'o revisor acusa o serviço sem leitura')
    expect(servico.ajustes.length, JSON.stringify(servico.observacao)).toBeGreaterThan(0)
  }, 120_000)
})

describe('P11 — o re-render de rascunho pelo ajustar-arte no draft-only', () => {
  it('caracterização: o ajuste ACEITO no perfil draft-only reabre o render dos rascunhos da página (os ajustes do agente já não entram: CP4)', async () => {
    await ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: versaoDaPagina(banco.pagina)!, ajustes: [ACEITO_TOPO] as unknown as Ajuste[], apenasRascunho: true })
    expect(espioes.invalidar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pageIds: [PAGINA], apenasRascunho: true }))
  }, 120_000)

  // Contrato alvo da V1 (owner, 13/10/2026): no draft-only, ajuste que piora, deixa blocker aberto ou não tem
  // veredito válido para a versão nova é recusado/revertido ANTES de substituir a versão do rascunho.
  hojeViola('o ajuste que piora é recusado ANTES de substituir a versão do rascunho: página intacta, render não reaberto, REVISAO_HUMANA_NECESSARIA', async () => {
    const antes = structuredClone(banco.pagina.layers)
    let resposta: unknown
    try {
      resposta = await ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: versaoDaPagina(banco.pagina)!, ajustes: structuredClone(fixture.peca().v2.revisao.ajustes) as unknown as Ajuste[], apenasRascunho: true })
    } catch (e) {
      if (!(e instanceof CreativeError) || RECUSAS_DE_SETUP.has(e.code)) throw e
      resposta = { code: e.code, details: e.details }
    }
    expect({
      paginaIntacta: JSON.stringify(banco.pagina.layers) === JSON.stringify(antes),
      renderReaberto: espioes.invalidar.mock.calls.length > 0,
      revisaoHumana: JSON.stringify(resposta).includes(CODIGOS.revisaoHumana),
    }).toEqual({ paginaIntacta: true, renderReaberto: false, revisaoHumana: true })
  }, 120_000)
})
