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

const banco = vi.hoisted(() => ({
  pagina: null as any,
  relogio: 1_000,
  generations: [] as Array<Record<string, any>>,
  putSeq: 0,
  projeto: null as any,
  foto: null as Buffer | null,
}))

vi.mock('@/lib/db', () => {
  const comTemplate = () => ({ ...banco.pagina, Template: { id: 77, name: 'Arte Rápida', projectId: banco.projeto.id } })
  const tocar = (data: Record<string, unknown>) => {
    banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
  }
  const db: Record<string, any> = {
    project: { findUnique: async () => banco.projeto },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) => (banco.pagina && where.id === banco.pagina.id ? comTemplate() : null),
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
      findMany: async () => [],
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
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/compositor/recompor', () => ({ travarRecomposicaoDaArte: vi.fn(async () => undefined), pedirRecomposicaoDaArteCongelada: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
// O renderizador NÃO é mockado: a régua e o oráculo medem o render de verdade.

import type { Layer } from '@/types/template'
import type { Ajuste } from '@/lib/creatives/revisao/contrato'
import { ajustarArte } from '@/lib/creatives/arte-rapida'
import { revisarArte } from '@/lib/creatives/revisao/revisar-arte'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { CreativeError } from '@/lib/creatives/errors'
import { arquivosDaFixture, comArquivos, fixture, fotoReconstruida } from './suporte/fixture'
import { hojeViola } from './suporte/hoje-viola'
import { CODIGOS, leiturasDosTextos, textosQueInvademOAssunto, TOLERANCIA_DE_PIORA, type LeituraDoTexto } from './suporte/propriedades'

const CANVAS = { width: 1080, height: 1920 }
const PAGINA = 'pagina-piloto'
let arquivos: Record<string, string>

beforeAll(async () => {
  arquivos = await arquivosDaFixture()
  banco.foto = await fotoReconstruida()
}, 60_000)

beforeEach(() => {
  const peca = fixture.peca()
  banco.relogio = 1_000
  banco.generations = []
  banco.putSeq = 0
  banco.projeto = { id: Number(peca.spec.projectId), name: 'Projeto da fixture', userId: 'dono-interno', instagramAccountId: null, assinatura: fixture.assinatura().numerosDoProjeto }
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
/** Problemas abertos de verdade: `fonte-nao-carregada` é do ambiente de teste (as fontes da marca não estão aqui). */
const problemasAbertos = (r: Awaited<ReturnType<typeof revisar>>) => r.relatorio.achados.filter((a) => a.severidade === 'problema' && a.regra !== 'fonte-nao-carregada')

/** O que piorou de uma versão para a outra: leitura de cada texto e invasão do assunto anotado. */
function pioras(antes: LeituraDoTexto[], depois: LeituraDoTexto[], invadeAntes: string[], invadeDepois: string[]) {
  const leitura = depois.filter((d) => {
    const a = antes.find((x) => x.camada === d.camada)!
    return d.polaridade === 'clara' ? d.com > a.com + TOLERANCIA_DE_PIORA : d.com < a.com - TOLERANCIA_DE_PIORA
  })
  return { leitura: leitura.map((d) => `${d.camada}: ${antes.find((x) => x.camada === d.camada)!.com}→${d.com}`), assunto: invadeDepois.filter((c) => !invadeAntes.includes(c)) }
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
    const antes = await leiturasDosTextos(camadasAntes, CANVAS)
    try {
      await ajustar(fixture.peca().v2.revisao.ajustes as unknown as Ajuste[])
    } catch (e) {
      // Recusa estruturada é um desfecho válido: nada pode ter sido gravado.
      if (!(e instanceof CreativeError)) throw e
      expect(banco.pagina.layers).toEqual(camadasAntes)
      return
    }
    const depois = await leiturasDosTextos(banco.pagina.layers, CANVAS)
    const invadeAntes = textosQueInvademOAssunto(camadasAntes, assunto).map((c) => c.camada)
    const invadeDepois = textosQueInvademOAssunto(banco.pagina.layers, assunto).map((c) => c.camada)
    const piorou = pioras(antes, depois, invadeAntes, invadeDepois)
    expect(piorou, JSON.stringify(piorou)).toEqual({ leitura: [], assunto: [] })
  }, 120_000)

  hojeViola('em até 2 ciclos com os ajustes do próprio revisor, a peça termina apta ou com REVISAO_HUMANA_NECESSARIA', async () => {
    let revisao = await revisar()
    const respostas: unknown[] = [revisao]
    for (let ciclo = 0; ciclo < 2 && problemasAbertos(revisao).length > 0 && revisao.relatorio.ajustes.length > 0; ciclo++) {
      respostas.push(await ajustarArte({ projectId: projectId(), pageId: PAGINA, versaoEsperada: revisao.versao, ajustes: revisao.relatorio.ajustes }))
      revisao = await revisar()
      respostas.push(revisao)
    }
    // Guarda contra o passe falso: a régua precisa ter medido (render quebrado vira "não avaliada").
    expect(revisao.relatorio.cobertura['texto-sem-leitura']?.estado).toBe('avaliada')
    const apta = problemasAbertos(revisao).length === 0
    const escalada = JSON.stringify(respostas).includes(CODIGOS.revisaoHumana)
    expect(apta || escalada, JSON.stringify(problemasAbertos(revisao).map((a) => `${a.regra}:${a.camadas.join(',')}`))).toBe(true)
  }, 240_000)
})
