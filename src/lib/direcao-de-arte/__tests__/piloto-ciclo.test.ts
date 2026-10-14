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
import { exigir, hojeViola } from './suporte/hoje-viola'
import { CODIGOS, leituraDentroDoAlvo, leiturasDosTextos, textosQueInvademOAssunto, TOLERANCIA_DE_PIORA, type LeituraDoTexto } from './suporte/propriedades'

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
 * invadir o assunto anotado. Texto no alvo que mexeu dentro dele não é piora.
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
  it('a revisão (só medida) acusa o serviço sem leitura — sem ajuste e com o diagnóstico de "teto" no piso 0.45', async () => {
    const r = await revisar()
    expect(r.relatorio.cobertura['texto-sem-leitura']?.estado).toBe('avaliada')
    const servico = r.relatorio.achados.find((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))
    expect(servico).toMatchObject({ severidade: 'problema', ajustes: [] })
    expect(servico?.observacao).toMatch(/teto da marca \(0\.45\)/)
  }, 120_000)

  it('ajustar-arte com os 3 ajustes do agente grava a v2 da produção, sem recusar nada', async () => {
    const r = await ajustar(fixture.peca().v2.revisao.ajustes as unknown as Ajuste[])
    expect(r.ajustesRecusados).toEqual([])
    const persistidas = banco.pagina.layers as Layer[]
    for (const id of ['headline', 'apoio', 'servico', 'gradiente-leitura-rodape']) expect(camada(persistidas, id).position).toEqual(camada(fixture.peca().v2.layers, id).position)
    expect(banco.generations.at(-1)?.fieldValues?.revisao?.aplicados).toEqual(fixture.peca().v2.revisao.aplicados)
  }, 120_000)
})

describe('P9 — recuperação', () => {
  hojeViola('um ajuste persistido nunca deixa a peça pior (leitura de cada texto e invasão do assunto)', async () => {
    const assunto = fixture.foto().assuntoAnotado.naPeca
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
    const invadeAntes = textosQueInvademOAssunto(camadasAntes, assunto).map((c) => c.camada)
    const invadeDepois = textosQueInvademOAssunto(banco.pagina.layers, assunto).map((c) => c.camada)
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
  hojeViola('acusa a logo sem leitura como problema (a logo creme sob o véu creme no teto claro)', async () => {
    exigirMedidaFiel(banco.pagina.layers)
    const r = await revisar()
    // Regras de GEOMETRIA não contam: a propriedade é leitura da logo, não posição.
    const geometricas = new Set(['logo-sobre-texto', 'fora-da-area-segura', 'colisao', 'tinta-fora-da-caixa', 'texto-cortado'])
    const daLogo = r.relatorio.achados.filter((a) => a.camadas.includes('logo') && !geometricas.has(a.regra) && a.severidade === 'problema')
    expect(daLogo.length, JSON.stringify(r.relatorio.achados.map((a) => `${a.regra}:${a.camadas.join(',')}`))).toBeGreaterThan(0)
  }, 120_000)

  hojeViola('no serviço sem leitura, não diz "teto da marca" com a força no piso e traz correção executável', async () => {
    const r = await revisar()
    const servico = r.relatorio.achados.find((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))
    exigir(servico, 'o revisor acusa o serviço sem leitura')
    expect({ teto: /teto da marca/.test(servico.observacao ?? ''), ajustes: servico.ajustes.length > 0 }).toEqual({ teto: false, ajustes: true })
  }, 120_000)
})

describe('P11 — o re-render de rascunho pelo ajustar-arte no draft-only', () => {
  it('caracterização: o ajuste no perfil draft-only reabre o render dos rascunhos da página', async () => {
    await ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: versaoDaPagina(banco.pagina)!, ajustes: structuredClone(fixture.peca().v2.revisao.ajustes) as unknown as Ajuste[], apenasRascunho: true })
    expect(espioes.invalidar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pageIds: [PAGINA], apenasRascunho: true }))
  }, 120_000)

  hojeViola('a versão nova, sem veredito favorável, não reabre o render do rascunho como apta (ou volta com REVISAO_HUMANA_NECESSARIA)', async () => {
    const r = await ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: versaoDaPagina(banco.pagina)!, ajustes: structuredClone(fixture.peca().v2.revisao.ajustes) as unknown as Ajuste[], apenasRascunho: true })
    const reabriu = espioes.invalidar.mock.calls.length > 0
    expect(!reabriu || JSON.stringify(r).includes(CODIGOS.revisaoHumana), JSON.stringify({ reabriu, avisos: r.avisos ?? [] })).toBe(true)
  }, 120_000)
})
