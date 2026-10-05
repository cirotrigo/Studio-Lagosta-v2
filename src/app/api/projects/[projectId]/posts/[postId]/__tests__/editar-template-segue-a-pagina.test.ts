/**
 * "Editar Template" na agenda abre a página no template em que ela mora HOJE
 * (21/09/2026).
 *
 * `agendarPost` cria o post com o `templateId` da página e SÓ DEPOIS chama
 * `moverPaginaParaSemana`; `refilarPaginasDoPost` (post remarcado) também move
 * só a página. O post ficava com a pasta antiga, o editor não achava o `pageId`
 * lá e o fallback do `multi-page-context` abria a primeira página daquele
 * template — outra peça.
 *
 * Reais: `agendarPost`, as duas mudanças de pasta, as duas rotas que servem o
 * post à tela (`GET posts/[postId]` e `GET posts/calendar`, esta do modal no
 * editor) e o href do botão. Falsos: Clerk, o acesso ao projeto e o banco (em
 * memória, com as relações que as consultas pedem). O banco falso não tem
 * escrita de post além do `create`: a correção é leitura e não reescreve post
 * nenhum — congelado ou não.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Linha = Record<string, any>

const banco = vi.hoisted(() => ({
  templates: new Map<number, Record<string, any>>(),
  pages: new Map<string, Record<string, any>>(),
  posts: new Map<string, Record<string, any>>(),
  seq: 100,
}))

vi.mock('@/lib/db', () => {
  const PROJETO = { id: 8, name: 'Espeto Gaúcho', userId: 'dono-interno', instagramAccountId: null, instagramUsername: null, logoUrl: null }
  const relacoes: Record<string, Record<string, [string, (r: Linha) => unknown]>> = {
    page: { Template: ['template', (r) => banco.templates.get(r.templateId) ?? null] },
    socialPost: {
      PageRef: ['page', (r) => (r.pageId ? banco.pages.get(r.pageId) ?? null : null)],
      Generation: ['generation', () => null],
      Project: ['project', () => PROJETO],
    },
    project: { Logo: ['logo', () => []], organizationProjects: ['op', () => []] },
  }
  // Projeta como o Prisma: `select` escolhe campos (e relações); `include` soma relações à linha.
  function projetar(modelo: string, linha: Linha | null, args: { select?: Linha; include?: Linha } = {}): any {
    if (!linha) return null
    const rel = relacoes[modelo] ?? {}
    const resolver = (chave: string, sub: unknown) => {
      const [alvo, ler] = rel[chave]
      const valor = ler(linha)
      const subArgs = sub === true ? {} : (sub as Linha)
      return Array.isArray(valor) ? valor.map((v) => projetar(alvo, v, subArgs)) : projetar(alvo, valor as Linha, subArgs)
    }
    if (args.select) return Object.fromEntries(Object.entries(args.select).map(([k, s]) => [k, k in rel ? resolver(k, s) : linha[k]]))
    const saida: Linha = { ...linha }
    for (const [k, s] of Object.entries(args.include ?? {})) saida[k] = resolver(k, s)
    return saida
  }
  function casa(linha: Linha, where: Linha = {}): boolean {
    return Object.entries(where).every(([k, cond]) => {
      if (k === 'OR') return (cond as Linha[]).some((c) => casa(linha, c))
      const v = linha[k]
      if (cond === null || typeof cond !== 'object' || cond instanceof Date) return v === cond
      if ('in' in cond) return cond.in.includes(v)
      if ('has' in cond) return Array.isArray(v) && v.includes(cond.has)
      if ('path' in cond) return v?.[cond.path[0]] === cond.equals
      if ('not' in cond) return v !== undefined && v !== cond.not
      return (cond.gte === undefined || v >= cond.gte) && (cond.lte === undefined || v <= cond.lte) && (cond.lt === undefined || v < cond.lt)
    })
  }
  const achar = (mapa: Map<unknown, Linha>, where: Linha) => [...mapa.values()].filter((l) => casa(l, where))
  const db: any = {
    project: { findUnique: async (a: Linha) => projetar('project', PROJETO, a) },
    template: {
      findFirst: async ({ where, ...a }: Linha) => projetar('template', achar(banco.templates, where)[0] ?? null, a),
      create: async ({ data, ...a }: Linha) => {
        const linha = { id: ++banco.seq, ...data }
        banco.templates.set(linha.id, linha)
        return projetar('template', linha, a)
      },
    },
    page: {
      findUnique: async ({ where, ...a }: Linha) => projetar('page', banco.pages.get(where.id) ?? null, a),
      findMany: async ({ where, ...a }: Linha) => achar(banco.pages, where).map((l) => projetar('page', l, a)),
      update: async ({ where, data }: Linha) => Object.assign(banco.pages.get(where.id)!, data),
    },
    generation: { findFirst: async () => null },
    socialPost: {
      create: async ({ data, ...a }: Linha) => {
        const linha = { id: `post-${++banco.seq}`, createdAt: new Date(), updatedAt: new Date(), ...data }
        banco.posts.set(linha.id, linha)
        return projetar('socialPost', linha, a)
      },
      findUnique: async ({ where, ...a }: Linha) => projetar('socialPost', banco.posts.get(where.id) ?? null, a),
      findMany: async ({ where, select }: Linha) => achar(banco.posts, where).map((l) => projetar('socialPost', l, { select })),
    },
  }
  // `garantirPasta` cria a pasta da semana sob `comTravaPorChave` (R12-09 do PR 12): uma transação
  // curta que pega a trava consultiva antes de reler. Aqui é uma chamada só, então a trava é no-op.
  db.$transaction = async (fazer: (tx: unknown) => unknown) => fazer(db)
  db.$queryRaw = async () => [{ ok: 1 }]
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../../../../../prisma/generated/client'))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({
  // A porta de acesso da rota do calendário (#155) — este teste mede o link, não o acesso.
  fetchProjectWithShares: async (id: number) => ({ id }),
  hasProjectReadAccess: () => true,
  hasProjectWriteAccess: () => true,
  withProjectOwner: async (p: unknown) => p,
}))
// O que o agendamento e a rota importam e este teste não exercita.
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }) }))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({
  registrarSlotDoPost: async () => null,
  registrarCopyDoPost: async () => null,
  fecharSugestaoDeSlot: async () => null,
}))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarLegendaDoPost: async () => null, registrarEdicaoDeLegenda: async () => null }))
vi.mock('@/lib/posts/artes-do-post', () => ({ registrarArtesDoPost: async () => ({ artes: [] }) }))
vi.mock('@/lib/posts/scheduler', () => ({ PostScheduler: class {} }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => null }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ desfazerUsoDeFotoDoPost: async () => undefined }))

import { GET as lerPostHttp } from '../route'
import { GET as lerCalendarioHttp } from '../../calendar/route'
import { agendarPost } from '@/lib/creatives/agendar'
import { refilarPaginasDoPost } from '@/lib/compositor/pastas'
import { editarTemplateHref } from '@/lib/agenda-routes'

const AVULSAS = 10

async function lerPost(postId: string) {
  const res = await lerPostHttp(new NextRequest(`http://studio.test/api/projects/8/posts/${postId}`), {
    params: Promise.resolve({ projectId: '8', postId }),
  })
  expect(res.status).toBe(200)
  return res.json()
}

async function lerDoCalendario(postId: string) {
  const res = await lerCalendarioHttp(
    new NextRequest('http://studio.test/api/projects/8/posts/calendar?startDate=2026-09-01T00:00:00.000Z&endDate=2026-10-31T00:00:00.000Z'),
    { params: Promise.resolve({ projectId: '8' }) },
  )
  return ((await res.json()) as Linha[]).find((p) => p.id === postId)
}

/** O que o editor faz com o link: abre o template e procura a página; sem achar, cai na primeira de lá (`multi-page-context`). */
function paginaQueOEditorAbre(href: string): string | null {
  const [, templateId, pageId] = href.match(/^\/templates\/(\d+)\/editor\?pageId=([^&]+)&from=agenda$/) ?? []
  const doTemplate = [...banco.pages.values()].filter((p) => p.templateId === Number(templateId)).sort((a, b) => a.order - b.order)
  return (doTemplate.find((p) => p.id === decodeURIComponent(pageId)) ?? doTemplate[0])?.id ?? null
}

beforeEach(() => {
  banco.seq = 100
  banco.templates = new Map([[AVULSAS, { id: AVULSAS, name: 'Stories · Avulsas · setembro', category: 'avulsas', projectId: 8, tags: ['avulsas', 'mes:2026-09', 'mes:2026-09:story'] }]])
  const peca = { isTemplate: false, tags: ['compositor', 'story'], width: 1080, height: 1920, layers: [] }
  banco.pages = new Map([
    // A outra peça que continua nas avulsas: é ela que o editor abria.
    ['pg-outra', { id: 'pg-outra', name: 'Outra peça', templateId: AVULSAS, order: 0, thumbnail: 'https://blob.test/pg-outra.png', ...peca }],
    ['pg-costela', { id: 'pg-costela', name: 'Costela no bafo', templateId: AVULSAS, order: 1, thumbnail: 'https://blob.test/pg-costela.png', ...peca }],
  ])
  banco.posts = new Map()
})

describe('"Editar Template" segue a página quando ela muda de pasta', () => {
  it('peça das avulsas agendada com data: a página vai para a semana e o link da tela e do calendário vai junto', async () => {
    const { postId } = await agendarPost({ projectId: 8, pageId: 'pg-costela', postType: 'STORY', scheduledDatetime: '2026-09-24 19:00', situacao: 'rascunho' })

    const semana = banco.templates.get(banco.pages.get('pg-costela')!.templateId)!
    expect(semana).toMatchObject({ category: 'programacao', name: 'Stories · Semana 21 a 27/09' })
    // A causa: o post nasceu com a pasta de ANTES da mudança, e ela continua lá.
    expect(banco.posts.get(postId)!.templateId).toBe(AVULSAS)

    const esperado = `/templates/${semana.id}/editor?pageId=pg-costela&from=agenda`
    for (const post of [await lerPost(postId), await lerDoCalendario(postId)]) {
      expect(paginaQueOEditorAbre(editarTemplateHref(post))).toBe('pg-costela')
      expect(editarTemplateHref(post)).toBe(esperado)
    }
    // Leitura: o post não foi reescrito.
    expect(banco.posts.get(postId)!.templateId).toBe(AVULSAS)
  })

  it('post remarcado para outra semana: refilarPaginasDoPost move a página e o link acompanha', async () => {
    const { postId } = await agendarPost({ projectId: 8, pageId: 'pg-costela', postType: 'STORY', scheduledDatetime: '2026-09-24 19:00', situacao: 'rascunho' })
    await refilarPaginasDoPost(postId, new Date('2026-10-01T12:00:00-03:00'), 'dono-interno')

    const semana = banco.templates.get(banco.pages.get('pg-costela')!.templateId)!
    expect(semana.name).toBe('Stories · Semana 28/09 a 4/10')
    const href = editarTemplateHref(await lerPost(postId))
    expect(paginaQueOEditorAbre(href)).toBe('pg-costela')
    expect(href).toBe(`/templates/${semana.id}/editor?pageId=pg-costela&from=agenda`)
  })

  it('post sem página continua com o templateId da coluna', async () => {
    banco.posts.set('post-sem-pagina', { id: 'post-sem-pagina', projectId: 8, pageId: null, templateId: AVULSAS, postType: 'STORY', scheduleType: 'SCHEDULED' })
    expect((await lerPost('post-sem-pagina')).templateId).toBe(AVULSAS)
  })
})
