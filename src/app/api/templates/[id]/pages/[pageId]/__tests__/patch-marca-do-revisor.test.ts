/**
 * C3-02 (pré-revisão do commit bf85cb26, 12/09/2026): no PATCH da página, a
 * marca "escondida pelo revisor" (`metadata.revisao.ocultaPeloRevisor`) é
 * reconciliada contra a página que ESTA escrita substitui — a leitura protegida
 * pelo compare-and-set —, nunca contra `existingPage`, lida no começo do handler.
 *
 * O handler real, com o banco em memória. A corrida é a do autosave: a pessoa
 * MOSTRA a camada que o revisor escondeu (P1) e a ESCONDE de novo; P2 sai com a
 * marca antiga (o estado local nunca recebeu a remoção feita no servidor) sem
 * esperar P1 terminar. Contra a leitura velha a marca ficava, P2 gravava a
 * camada escondida COM a marca e o contrato saía `sem-mudanca` — a remoção da
 * pessoa nunca entrava no contrato nem no aprendizado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as any,
  relogio: 1_000,
  leituras: 0,
  escritasProtegidas: 0,
  /** Roda uma vez ANTES da N-ésima leitura por `findUnique` (1 = a leitura fora da transação). */
  antesDaLeitura: {} as Record<number, () => void>,
  /** Roda uma vez ANTES do N-ésimo compare-and-set (`updateMany`). */
  antesDoCompareAndSet: {} as Record<number, () => void>,
}))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/db', () => {
  const copia = () => structuredClone(banco.pagina)
  const db: Record<string, any> = {
    page: {
      findFirst: async () => copia(),
      findUnique: async () => {
        const n = ++banco.leituras
        const antes = banco.antesDaLeitura[n]
        delete banco.antesDaLeitura[n]
        antes?.()
        return copia()
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        const n = ++banco.escritasProtegidas
        const antes = banco.antesDoCompareAndSet[n]
        delete banco.antesDoCompareAndSet[n]
        antes?.()
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return copia()
      },
    },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})

import { PATCH } from '../route'
import { comVisibilidadeDoRevisor, marcaDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import { VERSAO_DO_CONTRATO, copyAutoralDaPagina, serializarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'

type Camada = Record<string, any>

function texto(id: string, y: number, content: string): Camada {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } } }
}

const MARCA = { em: '2026-09-12T12:00:00.000Z', ajuste: 0 }

const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Conheça nossos pacotes'] },
  ],
  revisoes: [],
}

/** A: o CTA escondido pelo AJUSTE do revisor (com a marca). O contrato ainda o tem — não é remoção autoral. */
const camadasComCtaOcultoPeloRevisor = (): Camada[] => [texto('headline', 100, 'Milk-shake'), comVisibilidadeDoRevisor(texto('cta', 300, 'Conheça nossos pacotes'), false, MARCA)]
/** B: a pessoa mostrou o CTA (P1): visível e sem a marca. */
const camadasComCtaMostrado = (): Camada[] => [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes')]

function paginaCom(camadas: Camada[]) {
  return { id: 'p1', templateId: 77, name: 'Peça', width: 1080, height: 1920, background: '#101010', isTemplate: false, tags: [], thumbnail: null, audio: null, order: 1, updatedAt: new Date(banco.relogio), layers: JSON.stringify(camadas), copyAutoral: serializarCopyAutoral(contrato) }
}

/** P1 confirma: grava o CTA visível e sem a marca (mostrar a camada do revisor não revisa o contrato). */
function p1Confirma() {
  banco.pagina = { ...banco.pagina, layers: JSON.stringify(camadasComCtaMostrado()), updatedAt: new Date(++banco.relogio) }
}

async function patch(camadas: Camada[]) {
  const request = new Request('http://studio.test/api/templates/77/pages/p1', { method: 'PATCH', body: JSON.stringify({ layers: camadas }) })
  return (await PATCH(request, { params: Promise.resolve({ id: '77', pageId: 'p1' }) })) as unknown as { status: number; body: any }
}

const ctaGravado = (): Camada => (JSON.parse(banco.pagina.layers) as Camada[]).find((l) => l.id === 'cta')!
const contratoGravado = () => copyAutoralDaPagina(banco.pagina.copyAutoral)!

beforeEach(() => {
  banco.relogio = 1_000
  banco.leituras = 0
  banco.escritasProtegidas = 0
  banco.antesDaLeitura = {}
  banco.antesDoCompareAndSet = {}
  banco.pagina = paginaCom(camadasComCtaOcultoPeloRevisor())
})

describe('C3-02 — PATCH: a marca do revisor é reconciliada contra a leitura protegida', () => {
  it('P1 (mostrar) confirma entre a leitura do começo e a leitura protegida: o esconder de P2 perde a marca e entra no contrato como remoção da equipe', async () => {
    // existingPage (findFirst) vê A; P1 confirma antes da leitura de base; a transação vê B.
    banco.antesDaLeitura[1] = p1Confirma
    const r = await patch(camadasComCtaOcultoPeloRevisor())
    expect(r.status).toBe(200)

    expect(ctaGravado().visible).toBe(false)
    expect(marcaDoRevisor(ctaGravado() as never)).toBeNull()
    const cta = contratoGravado().blocos.find((b) => b.id === 'cta')!
    expect(cta.linhas).toEqual([])
    expect(contratoGravado().revisoes.at(-1)).toMatchObject({ autor: 'equipe', superficie: 'editor', blocos: ['cta'] })
  })

  it('P1 confirma no MEIO do compare-and-set (a transação relê): a reconciliação é refeita contra a página relida, não contra a primeira leitura', async () => {
    // P2 também move o título — sem isso o payload é idêntico à base A e não há escrita visual.
    const payload = camadasComCtaOcultoPeloRevisor().map((l) => (l.id === 'headline' ? { ...l, position: { x: 140, y: 120 } } : l))
    // A leitura de base e a 1ª leitura protegida veem A; P1 confirma antes do 1º compare-and-set, que perde; a 2ª volta vê B.
    banco.antesDoCompareAndSet[1] = p1Confirma
    const r = await patch(payload)
    expect(r.status).toBe(200)
    expect(banco.escritasProtegidas).toBe(2)

    expect(ctaGravado().visible).toBe(false)
    expect(marcaDoRevisor(ctaGravado() as never)).toBeNull()
    expect(contratoGravado().blocos.find((b) => b.id === 'cta')!.linhas).toEqual([])
    expect(contratoGravado().revisoes.at(-1)).toMatchObject({ autor: 'equipe', blocos: ['cta'] })
  })

  it('controle: sem corrida, mover o título com o CTA ainda escondido pelo revisor mantém a marca e não revisa o contrato', async () => {
    const payload = camadasComCtaOcultoPeloRevisor().map((l) => (l.id === 'headline' ? { ...l, position: { x: 140, y: 120 } } : l))
    const r = await patch(payload)
    expect(r.status).toBe(200)

    expect(ctaGravado().visible).toBe(false)
    expect(marcaDoRevisor(ctaGravado() as never)).toEqual(MARCA)
    expect(contratoGravado().blocos.find((b) => b.id === 'cta')!.linhas).toEqual(['Conheça nossos pacotes'])
    expect(contratoGravado().revisoes).toEqual([])
  })
})
