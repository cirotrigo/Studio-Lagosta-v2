/**
 * G4.7 · persistência da grade pelo caminho REAL, sem banco: o `PageSyncWrapper` real serializa o design do
 * `TemplateEditorProvider` real e manda o patch pelo `useUpdatePage` real; o `api-client` (único dublê do caminho)
 * entrega o corpo JSON ao handler PATCH REAL de `templates/[id]/pages/[pageId]` (updatePageSchema, canonização,
 * reconciliação, compare-and-set e `JSON.stringify` da gravação); o `usePages` real relê pelo handler GET REAL da
 * lista e um provider NOVO reidrata a página (PageSync → `loadTemplate`). Dublados ANTES do import: Clerk, acesso,
 * banco em memória (a string gravada fica nele), invalidação, recomposição, aprendizado e `after()`.
 *
 * Prova: a string efetivamente gravada e a página reaberta passam por `conferirGrade` com ids, ordem, caixa, recorte,
 * raio, espelhos, fotos e vazias intactos — Story 2/1/2 e Feed 2×3. NÃO prova clique em Salvar, reload do navegador
 * nem o banco real (Postgres): é o encadeamento técnico de serializador, schema e reidratação.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

const banco = vi.hoisted(() => ({
  paginas: {} as Record<string, Record<string, unknown>>,
  relogio: 1_000,
  patches: [] as unknown[],
  invalidados: [] as string[][],
}))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: () => undefined,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: vi.fn(async (_tx: unknown, args: { pageIds: string[] }) => {
    banco.invalidados.push([...args.pageIds])
    return { invalidados: 0, congelados: [] as string[] }
  }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: vi.fn(async () => []) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
vi.mock('@/hooks/use-toast', () => ({ toast: () => undefined, useToast: () => ({ toast: () => undefined }) }))
vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    template: { findFirst: async () => ({ id: 77, projectId: 8, Project: { id: 8, userId: 'u', organizationProjects: [] } }) },
    page: {
      findFirst: async ({ where }: { where: { id: string } }) => (banco.paginas[where.id] ? structuredClone(banco.paginas[where.id]) : null),
      findUnique: async ({ where }: { where: { id: string } }) => (banco.paginas[where.id] ? structuredClone(banco.paginas[where.id]) : null),
      findMany: async () => Object.values(banco.paginas).map((p) => structuredClone(p)),
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        const p = banco.paginas[where.id]
        if (!p || (where.updatedAt && where.updatedAt.getTime() !== (p.updatedAt as Date).getTime())) return { count: 0 }
        banco.paginas[where.id] = { ...p, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        banco.paginas[where.id] = { ...banco.paginas[where.id], ...data, updatedAt: new Date(++banco.relogio) }
        return structuredClone(banco.paginas[where.id])
      },
    },
    socialPost: { findMany: async () => [] },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})
/** O fio: o corpo vai e volta como JSON, para o handler real certo; status ≥ 400 vira erro, como no api-client real */
vi.mock('@/lib/api-client', () => {
  const chamar = async (metodo: string, url: string, corpo?: unknown) => {
    const pagina = url.match(/^\/api\/templates\/(\d+)\/pages\/([^/]+)$/)
    const lista = url.match(/^\/api\/templates\/(\d+)\/pages$/)
    const req = new Request(`http://studio.test${url}`, { method: metodo, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) })
    let r: { status: number; body: unknown }
    if (metodo === 'PATCH' && pagina) {
      banco.patches.push(JSON.parse(JSON.stringify(corpo)))
      r = (await (await import('@/app/api/templates/[id]/pages/[pageId]/route')).PATCH(req, { params: Promise.resolve({ id: pagina[1], pageId: pagina[2] }) })) as never
    } else if (metodo === 'GET' && lista) {
      r = (await (await import('@/app/api/templates/[id]/pages/route')).GET(req, { params: Promise.resolve({ id: lista[1] }) })) as never
    } else throw new Error(`chamada não esperada no teste: ${metodo} ${url}`)
    if (r.status >= 400) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    return JSON.parse(JSON.stringify(r.body))
  }
  return {
    api: {
      get: (url: string) => chamar('GET', url),
      patch: (url: string, corpo: unknown) => chamar('PATCH', url, corpo),
      post: (url: string, corpo: unknown) => chamar('POST', url, corpo),
      put: (url: string, corpo: unknown) => chamar('PUT', url, corpo),
      delete: (url: string) => chamar('DELETE', url),
    },
  }
})

import type { DesignData, Layer } from '@/types/template'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { PageSyncWrapper, usePageSync } from '@/components/templates/page-sync-wrapper'
import { designDataSchema, layerSchema } from '@/lib/validations/studio'
import { celulaVazia, conferirGrade, metadadoDeGrade } from '../conferir'
import { criarGrade, preencherCelula } from '../operacoes'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB } from './fixtures'

beforeAll(() => {
  // o PageSync solta a trava de sincronização no próximo quadro
  globalThis.requestAnimationFrame ??= ((cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame
})

const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 60, y: 80 }, size: { width: 960, height: 160 }, content: 'Grade de sábado', style: { fontSize: 64 } } as Layer

/** Grade pelo motor real: fotos do Blob próprio, uma célula vazia, recorte descentralizado, espelhos e raio */
function grade(layout: string, caixa: { x: number; y: number; w: number; h: number }, raio: number, espacamento: number, ids: string[]) {
  const r = criarGrade({ layout, caixa, espacamento, raio, idDaGrade: `grade-${layout}`, idsDasCelulas: ids })
  if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
  return r.valor.map((c, i) => {
    if (i === 1) return c // vazia
    const p = preencherCelula(c, `${BLOB}/fotos/${c.id}.jpg`)
    if (!p.ok) throw new Error(JSON.stringify(p.diagnosticos))
    const style = { ...p.valor.style }
    if (i === 0) style.crop = { x: 0.37, y: 0.11, width: 0.41, height: 0.52 }
    if (i === 2) style.flipH = true
    if (i === 3) style.flipV = true
    return { ...p.valor, style }
  })
}
const CASOS = {
  Story: { canvas: { width: 1080, height: 1920 }, layers: () => [...grade('2-1-2', { x: 40, y: 520, w: 1000, h: 1340 }, 30, 12, ['s0', 's1', 's2', 's3', 's4']), texto] },
  Feed: { canvas: { width: 1080, height: 1350 }, layers: () => [...grade('2x3', { x: 0, y: 0, w: 1080, h: 1350 }, 9999, 10, ['f0', 'f1', 'f2', 'f3', 'f4', 'f5']), texto] },
  // Q2: as quadradas de 4 colunas — Story 28 com a margem de 15 (calha 0) e Feed 20 com a margem lateral de 1 (calha 10)
  'Story 4×7 quadrada': { canvas: { width: 1080, height: 1920 }, layers: () => [...grade('4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 6, 0, Array.from({ length: 28 }, (_, i) => `q${i}`)), texto] },
  'Feed 4×5 quadrada': { canvas: { width: 1080, height: 1350 }, layers: () => [...grade('4x5-quadrada', { x: 0, y: 0, w: 1080, h: 1350 }, 0, 10, Array.from({ length: 20 }, (_, i) => `r${i}`)), texto] },
} as const

// ── Montagem ────────────────────────────────────────────────────────────────
const sonda: { ctx: TemplateEditorContextValue | null; sync: ReturnType<typeof usePageSync> } = { ctx: null, sync: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  sonda.sync = usePageSync()
  return null
}
const correr = async (n = 12) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}
let desmontar: (() => Promise<void>) | null = null
async function abrirEditor(canvas: { width: number; height: number }) {
  const t: TemplateResource = { id: 77, name: 'T', type: 'STORY', dimensions: `${canvas.width}x${canvas.height}`, designData: { canvas: { ...canvas, backgroundColor: '#ffffff' }, layers: [] } as DesignData, dynamicFields: [], projectId: 8 }
  const m = await montar(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(
        MultiPageProvider,
        { templateId: 77, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
        React.createElement(TemplateEditorProvider, { template: t } as React.ComponentProps<typeof TemplateEditorProvider>, React.createElement(PageSyncWrapper, null, React.createElement(Sonda))),
      ),
    ),
  )
  desmontar = m.desmontar
  // o 1º GET importa a rota de verdade (tempo real): espera a página entrar no editor, com teto
  for (let i = 0; i < 200 && sonda.ctx?.design.layers.length === 0; i++) await emAct(() => new Promise((r) => setTimeout(r, 10)))
  await emAct(() => correr(20))
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
})

/** O que uma célula É depois de ir e voltar ('' e ausente são a mesma vazia) */
const essencia = (c: Layer) => ({
  id: c.id,
  type: c.type,
  name: c.name,
  position: c.position,
  size: c.size,
  rotation: c.rotation ?? 0,
  vazia: celulaVazia(c.fileUrl),
  fileUrl: celulaVazia(c.fileUrl) ? '' : c.fileUrl,
  style: c.style,
  metadata: c.metadata,
})

for (const [nome, caso] of Object.entries(CASOS)) {
  describe(`G4.7 · ${nome}: salvar pelo PageSync real e reabrir num provider novo`, () => {
    it('a string gravada e a página reaberta: conferirGrade limpo e a grade inteira intacta', async () => {
      banco.paginas = {
        p1: { id: 'p1', templateId: 77, name: 'Página', order: 0, isTemplate: false, tags: [], width: caso.canvas.width, height: caso.canvas.height, background: '#ffffff', layers: JSON.stringify([texto]), copyAutoral: null, audio: null, updatedAt: new Date(banco.relogio) },
      }
      banco.patches = []
      // a ordem como o editor a deixa (`normalizeLayerOrder` de toda operação): `order` = posição na pilha
      const estado = caso.layers().map((l, i) => ({ ...l, order: i }))
      expect(conferirGrade(estado)).toEqual([])

      // 1. editor aberto na página real (GET real), o estado com a grade entra e o PageSync grava (PATCH real)
      await abrirEditor(caso.canvas)
      expect(sonda.ctx!.design.layers.map((l) => l.id)).toEqual(['titulo'])
      await emAct(async () => {
        sonda.ctx!.setDesign((prev) => ({ ...prev, layers: estado }))
        await correr()
      })
      await emAct(async () => {
        await sonda.sync!.descarregar()
        await correr()
      })
      expect(banco.patches).toHaveLength(1)
      expect(Object.keys(banco.patches[0] as object)).toEqual(['layers'])

      // 2. a string EFETIVA gravada
      const gravada = banco.paginas.p1.layers as string
      expect(typeof gravada).toBe('string')
      const lidas = JSON.parse(gravada) as Layer[]
      expect(conferirGrade(lidas)).toEqual([])
      expect(lidas.map((l) => l.id)).toEqual(estado.map((l) => l.id))
      for (const c of estado.filter((l) => metadadoDeGrade(l))) expect(essencia(lidas.find((l) => l.id === c.id)!), c.id).toEqual(essencia(c))
      // os schemas do editor (que NÃO são o do PATCH) também aceitam a grade gravada, sem perder o vínculo
      const comSchema = designDataSchema.parse({ canvas: caso.canvas, layers: lidas })
      expect(conferirGrade(comSchema.layers as Layer[])).toEqual([])
      expect(layerSchema.parse(lidas[1]).fileUrl).toBeUndefined() // a vazia: '' vira ausente no schema, e segue vazia
      expect(celulaVazia(layerSchema.parse(lidas[1]).fileUrl)).toBe(true)

      // 3. provider NOVO, página relida pelo GET real e carregada pelo PageSync
      await desmontar!()
      desmontar = null
      sonda.ctx = null
      await abrirEditor(caso.canvas)
      const reaberta = sonda.ctx!.design.layers
      expect(conferirGrade(reaberta)).toEqual([])
      expect(reaberta.map((l) => l.id)).toEqual(estado.map((l) => l.id))
      for (const c of estado.filter((l) => metadadoDeGrade(l))) expect(essencia(reaberta.find((l) => l.id === c.id)!), c.id).toEqual(essencia(c))
      // ao reabrir, nada a gravar (o design reidratado é o gravado)
      await emAct(async () => {
        await sonda.sync!.descarregar()
        await correr()
      })
      expect(banco.patches).toHaveLength(1)
    })
  })
}
