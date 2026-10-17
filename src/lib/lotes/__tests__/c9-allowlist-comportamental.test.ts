/**
 * CP5c — C9 COMPORTAMENTAL (Codex R1 do PR #242): cada tool MUTANTE da allowlist do draft-only (`TOOLS_DRAFT_ONLY`
 * com `readOnlyHint: false`) é EXECUTADA pelo handler real do catálogo, com um principal draft-only e um banco falso
 * que registra toda escrita — em especial a criação de post (`socialPost.create`, `criarPostDoAgendamento`) e a
 * gravação do veredito (`UPDATE "Generation"` do registro do gate). O que se prova:
 *  - só `agendar-leva` cria um DRAFT, e no seu rastro o veredito é gravado ANTES do post;
 *  - `compor-leva`, `ajustar-arte` e `buscar-fotos`, executadas até onde o banco falso as leva, não criam post nem
 *    gravam veredito (e o quanto cada uma avançou fica dito, para a prova não passar por um erro de setup);
 *  - uma tool de CONTROLE, montada no teste como se estivesse na allowlist e chamando `criarPostDoAgendamento`
 *    direto, é PEGA pelo mesmo detector — é o que faz o detector valer alguma coisa.
 * Complemento estático: o FECHO DE IMPORTS de cada handler (os `import()` dentro dele, seguidos pelos imports
 * estáticos) — um helper que criasse post apareceria nele. `inventario-gate-agendar-leva.test.ts` tem o resto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

type Linha = Record<string, any>
const banco = vi.hoisted(() => ({
  tabelas: new Map<string, Map<string, Linha>>(),
  eventos: [] as string[],
  seq: 0,
  postsCriados: 0,
}))
const medicao = vi.hoisted(() => ({ chamadas: 0 }))

vi.mock('@/lib/db', () => {
  const porCaminho = (v: unknown, caminho: string[]) => caminho.reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Linha)[k] : undefined), v)
  const valor = (v: unknown) => (v === undefined ? null : v)
  const casa = (linha: Linha, where: Linha = {}): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (k === 'OR') return (cond as Linha[]).some((w) => casa(linha, w))
      if (k === 'NOT') return !casa(linha, cond as Linha)
      const atual = valor(linha[k])
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as Linha
        if ('path' in c) return valor(porCaminho(atual, c.path as string[])) === valor(c.equals)
        if ('has' in c) return Array.isArray(atual) && atual.includes(c.has)
        if ('in' in c) return (c.in as unknown[]).includes(atual)
        if ('not' in c) return atual !== null && atual !== c.not
        if ('gte' in c || 'lte' in c) return true
        if ('equals' in c) return JSON.stringify(atual) === JSON.stringify(c.equals)
        // where aninhado (relação): não filtra
        return true
      }
      if (cond instanceof Date) return atual instanceof Date && atual.getTime() === cond.getTime()
      return atual === valor(cond)
    })
  const projetar = (linha: Linha, select?: Linha) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, linha[k] ?? null])) : linha)
  const tabela = (nome: string) => {
    if (!banco.tabelas.has(nome)) banco.tabelas.set(nome, new Map())
    return banco.tabelas.get(nome)!
  }
  const gravar = (nome: string, id: string, linha: Linha) => {
    tabela(nome).set(id, linha)
    banco.eventos.push(`escrita:${nome}:${id}`)
  }
  const delegado = (nome: string) => ({
    findUnique: async ({ where, select }: { where: Linha; select?: Linha }) => {
      const t = tabela(nome)
      const l = where.id !== undefined ? t.get(String(where.id)) : [...t.values()].find((x) => casa(x, Object.values(where)[0] as Linha) || casa(x, where))
      return l ? projetar(l, select) : null
    },
    findFirst: async ({ where, select }: { where?: Linha; select?: Linha }) => {
      const l = [...tabela(nome).values()].find((x) => casa(x, where))
      return l ? projetar(l, select) : null
    },
    findMany: async ({ where, select, take }: { where?: Linha; select?: Linha; take?: number } = {}) =>
      [...tabela(nome).values()].filter((x) => casa(x, where)).slice(0, take ?? Infinity).map((l) => projetar(l, select)),
    count: async () => 0,
    create: async ({ data, select }: { data: Linha; select?: Linha }) => {
      const id = String(data.id ?? `${nome}-${++banco.seq}`)
      const linha = { id, createdAt: new Date(2026, 9, 14, 0, 0, ++banco.seq), updatedAt: new Date(), ...data }
      if (nome === 'socialPost') {
        banco.postsCriados++
        banco.eventos.push('POST CRIADO')
      }
      gravar(nome, id, linha)
      return projetar(linha, select)
    },
    upsert: async ({ where, create, select }: { where: Linha; create: Linha; select?: Linha }) => {
      const existente = [...tabela(nome).values()].find((x) => casa(x, where))
      if (existente) return projetar(existente, select)
      const id = String(create.id ?? `${nome}-${++banco.seq}`)
      const linha = { id, ...create }
      gravar(nome, id, linha)
      return projetar(linha, select)
    },
    update: async ({ where, data, select }: { where: Linha; data: Linha; select?: Linha }) => {
      const linha = { ...(tabela(nome).get(String(where.id)) ?? { id: where.id }), ...data }
      gravar(nome, String(where.id), linha)
      return projetar(linha, select)
    },
    updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
      let count = 0
      for (const l of [...tabela(nome).values()]) {
        if (!casa(l, where)) continue
        gravar(nome, l.id, { ...l, ...data })
        count++
      }
      return { count }
    },
    delete: async ({ where }: { where: Linha }) => {
      tabela(nome).delete(String(where.id))
      return { id: where.id }
    },
    deleteMany: async () => ({ count: 0 }),
  })
  const queryRaw = async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const sql = partes.join('?')
    if (sql.includes('pg_advisory_xact_lock')) return [{ ok: 1 }]
    if (/FROM "SocialPost"/.test(sql)) {
      return [...tabela('socialPost').values()].filter((p) => p.pageId === valores[0]).map((p) => ({ id: p.id, status: p.status, laterPostId: p.laterPostId ?? null, postType: p.postType, generationId: p.generationId ?? null, projectId: p.projectId, pageId: p.pageId }))
    }
    return []
  }
  const executeRaw = async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const sql = partes.join('?')
    if (!sql.startsWith('UPDATE "Generation"')) return 0
    const [patch, id] = valores as [string, string]
    const g = tabela('generation').get(id)
    if (!g) return 0
    gravar('generation', id, { ...g, fieldValues: { ...g.fieldValues, ...JSON.parse(patch) } })
    banco.eventos.push('VEREDITO GRAVADO')
    return 1
  }
  const base: Linha = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: async (fn: unknown) => (typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(db) : Promise.all(fn as unknown[])),
  }
  const db: Linha = new Proxy(base, { get: (alvo, chave: string) => (chave in alvo ? alvo[chave] : delegado(chave)) })
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (c: string) => ({ url: `https://blob.test/${c}` })), del: vi.fn() }))
vi.mock('@/lib/creatives/persist', async (original) => ({ ...(await original<typeof import('@/lib/creatives/persist')>()), getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/compositor/pastas', async () => {
  const { formatoDaPaginaGravada } = await import('@/lib/compositor/formato')
  return { garantirPasta: async () => ({ id: 42, name: 'Stories · Semana 42' }), formatoDaPagina: (p: { tags?: string[]; width: number; height: number }) => formatoDaPaginaGravada(p), refilarPaginasDoPost: async () => ({ avisos: [], falhou: false }) }
})
vi.mock('@/lib/creatives/agendar', () => ({
  resolverAgendamento: async (input: Linha) => ({ input, avisos: [], quando: new Date(input.scheduledDatetime), project: { userId: 'dono', name: 'Cliente' } }),
  criarPostDoAgendamento: async (tx: { socialPost: { create: (a: Linha) => Promise<Linha> } }, r: { input: Linha }) => {
    banco.eventos.push('criarPostDoAgendamento')
    return tx.socialPost.create({ data: { projectId: r.input.projectId, pageId: r.input.pageId, generationId: r.input.generationId, postType: r.input.postType, status: 'DRAFT', scheduledDatetime: new Date(r.input.scheduledDatetime), mediaUrls: [], renderStatus: 'PENDING', laterPostId: null }, select: { id: true } })
  },
  efeitosDoAgendamento: async () => ({ falhas: [] }),
  contextoDosEfeitos: () => ({}),
  // O caminho HUMANO de criação: se uma tool da allowlist o alcançasse, o post nasceria SEM o gate — e o detector pega.
  agendarPost: async (input: Linha) => {
    banco.eventos.push('agendarPost')
    const { db } = await import('@/lib/db')
    const post = await db.socialPost.create({ data: { projectId: input.projectId, pageId: input.pageId, generationId: input.generationId ?? null, postType: input.postType ?? 'STORY', status: 'DRAFT', scheduledDatetime: new Date(input.scheduledDatetime), mediaUrls: [], renderStatus: 'PENDING', laterPostId: null } })
    return { post, mensagem: 'rascunho criado' }
  },
}))
// buscar-fotos fala com o Drive e com os embeddings: aqui o Drive está vazio e a busca semântica desligada (sem rede).
vi.mock('@/server/google-drive-service', () => ({
  googleDriveService: new Proxy(
    {
      findFileInFolder: async () => 'catalogo-1',
      readFileAsJson: async () => ({ images: [{ driveFileId: 'drive-123', fileName: 'ambiente.jpg', folder: 'ambiente', tags: ['ambiente'], bestFor: ['ambiente'], quality: 'alta', description: 'salão' }] }),
    } as Record<string, unknown>,
    { get: (alvo, chave: string) => (chave in alvo ? alvo[chave] : async () => []) },
  ),
}))
vi.mock('@/lib/creatives/embeddings-de-foto', async (original) => ({ ...(await original<typeof import('@/lib/creatives/embeddings-de-foto')>()), embedarConsulta: async () => null, buscarSemelhantes: async () => [] }))
vi.mock('@/lib/canvas-renderer', () => ({ CanvasRenderer: class { async renderDesign() { return Buffer.from('png-falso') } } }))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: async () => undefined, fetchBuffer: async () => { throw new Error('sem rede') }, familiasNaoCarregadas: async () => new Set() }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextMeasurer: async () => () => 100, createServerTextBoxMeasurer: async () => () => ({ width: 100, height: 100, maxLineWidth: 100, lineCount: 1 }) }))
vi.mock('@/lib/creatives/text-autofix', () => ({ aplicarAutofixOuFalhar: async (a: { layers: unknown[] }) => ({ layers: a.layers, autocorrecao: { aplicada: false }, avisos: [] }) }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/compositor/recompor', async (original) => ({ ...(await original<typeof import('@/lib/compositor/recompor')>()), travarRecomposicaoDaArte: vi.fn(async () => undefined), pedirRecomposicaoDaArteCongelada: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null), registrarSugestao: vi.fn(async () => null) }))
// A medição do gate mede LIMPO (a medição é objeto de P11): o que importa aqui é QUEM cria post e QUANDO.
vi.mock('@/lib/creatives/revisao/revisar-arte', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/creatives/revisao/revisar-arte')>()
  const { medida, metrica } = await import('../../creatives/revisao/__tests__/suporte/corpus-do-gate')
  const SEM_FUNDO = { assunto: null, assuntoNaoSeAplica: true as const, motivoSemAssunto: 'sem foto' }
  return {
    ...real,
    contextoDaMedicao: async (args: Parameters<typeof real.contextoDaMedicao>[0]) => ({
      projectId: args.projectId, canvas: { width: args.page.width, height: args.page.height }, formato: 'story' as const, background: '#000000', faixa: [0.45, 0.9] as [number, number],
      referencias: { headline: { fontSize1080: 84, entrelinha: null, origem: 'assinatura' } }, referencia: 'assinatura', ...SEM_FUNDO, origensDaLogo: new Map(), cacheDeLogos: new Map(),
    }),
    medirCamadasDaPeca: async (camadas: Array<{ id: string; type: string; visible?: boolean }>, ctx: Parameters<typeof real.medirCamadasDaPeca>[1]) => {
      medicao.chamadas++
      banco.eventos.push('MEDICAO')
      return medida({ canvas: ctx.canvas, formato: ctx.formato, camadas: camadas as never, metricas: camadas.filter((l) => l.type === 'text' && l.visible !== false).map((l) => metrica(l as never)), referencias: ctx.referencias as never, leituraDaLogo: [], ...SEM_FUNDO })
    },
  }
})

import type { Layer } from '@/types/template'
import { CATALOGO } from '@/lib/mcp/catalogo'
import { TOOLS_DRAFT_ONLY } from '@/lib/mcp/registro/perfil'
import { CreativeError } from '@/lib/creatives/errors'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'

const PROJETO = 8
const PRINCIPAL = { kind: 'user' as const, userId: 'u-dot', clientId: 'dot-client' }
const t = (nome: string) => banco.tabelas.get(nome) ?? new Map<string, Linha>()
const texto = (id: string, papel: string, y: number, fontSize: number): Layer =>
  ({ id, name: id, type: 'text', visible: true, locked: false, order: 3, content: `Texto ${id}`, position: { x: 100, y }, size: { width: 880, height: Math.round(fontSize * 1.5) }, style: { fontSize, lineHeight: 1.2, textAlign: 'left', color: '#FFFFFF' }, metadata: { compositor: { papel } } }) as Layer
const camadas = () => [texto('headline', 'headline', 400, 84), texto('apoio', 'apoio', 560, 40), texto('servico', 'servico', 1500, 32)]
const copy = () => ({ versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat' }, revisoes: [], blocos: camadas().map((l, i) => ({ id: l.id, funcao: l.id, ordem: i, linhas: [String(l.content)] })) })

function semear() {
  banco.tabelas.clear()
  const pagina = { id: 'p1', templateId: 42, isTemplate: false, name: 'Página p1', tags: ['compositor', 'story'], width: 1080, height: 1920, background: '#000000', layers: camadas(), copyAutoral: copy(), audio: null, thumbnail: null, updatedAt: new Date('2026-10-14T00:00:00Z'), Template: { id: 42, projectId: PROJETO } }
  const set = (nome: string, l: Linha) => { if (!banco.tabelas.has(nome)) banco.tabelas.set(nome, new Map()); banco.tabelas.get(nome)!.set(String(l.id), l) }
  set('project', { id: PROJETO, name: 'Cliente', userId: 'dono', instagramAccountId: null, assinatura: {}, logoUrl: null, googleDriveImagesFolderId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', googleDriveFolderId: null })
  set('page', pagina)
  set('page', { id: 'assinatura', templateId: 7, isTemplate: true, name: 'Assinatura — story', tags: [], width: 1080, height: 1920, background: '#FFF', layers: camadas(), copyAutoral: null, audio: null, Template: { id: 7, projectId: PROJETO } })
  set('generation', { id: 'g1', projectId: PROJETO, status: 'COMPLETED', resultUrl: 'https://blob.test/g1.png', slideOrder: null, sourcePageId: null, createdAt: new Date(), fieldValues: { source: 'compositor', pageId: 'p1', versaoRenderizada: versaoDaPagina(pagina), composicao: { assinatura: { pageId: 'assinatura' } }, spec: { projectId: PROJETO, formato: 'story', quando: '2026-10-14 10:00', tema: 'tema', blocos: [{ papel: 'headline', linhas: ['Texto headline'] }] } } })
  set('itemDeLote', { id: 'lote-i1', projectId: PROJETO, loteId: 'dot-8-2026-S42', itemId: 'i1', generationId: 'g1', postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null, situacao: 'pronta', tentativas: 0 })
}

beforeEach(() => {
  semear()
  banco.eventos = []
  banco.seq = 100
  banco.postsCriados = 0
  medicao.chamadas = 0
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = 'dot-client'
})

/** Executa o handler real; devolve o resultado ou o erro (o que a tool fez até lá fica nos eventos). */
async function executar(nome: string, args: Record<string, unknown>): Promise<{ resultado?: unknown; erro?: unknown }> {
  const tool = CATALOGO.get(nome)
  if (!tool) throw new Error(`tool ${nome} não está no catálogo`)
  try {
    return { resultado: await tool.handler(args, PRINCIPAL) }
  } catch (erro) {
    return { erro }
  }
}
const mutantes = () => [...TOOLS_DRAFT_ONLY].filter((nome) => CATALOGO.get(nome)?.annotations.readOnlyHint === false).sort()

describe('C9 — as tools MUTANTES da allowlist, executadas com banco falso', () => {
  it('a lista de mutantes é a conhecida (uma tool nova da allowlist que mude de hint entra aqui com o seu caso)', () => {
    expect(mutantes()).toEqual(['agendar-leva', 'ajustar-arte', 'buscar-fotos', 'compor-leva'])
  })

  it('agendar-leva: cria o DRAFT, e no rastro o veredito vem ANTES do post (MEDICAO → VEREDITO GRAVADO → criarPostDoAgendamento → POST CRIADO)', async () => {
    const { resultado, erro } = await executar('agendar-leva', { projectId: PROJETO, loteId: 'dot-8-2026-S42', itens: [{ itemId: 'i1' }] })
    expect(erro, String(erro)).toBeUndefined()
    expect((resultado as { itens: Array<Record<string, unknown>> }).itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', revisao: { tipo: 'medida', resultado: 'APTO' } })
    const marcos = banco.eventos.filter((e) => ['MEDICAO', 'VEREDITO GRAVADO', 'criarPostDoAgendamento', 'POST CRIADO'].includes(e))
    expect(marcos).toEqual(['MEDICAO', 'VEREDITO GRAVADO', 'criarPostDoAgendamento', 'POST CRIADO'])
    expect(banco.postsCriados).toBe(1)
    expect(banco.eventos).not.toContain('agendarPost')
  })

  it('compor-leva: enfileira a peça (Generation + job + linha do lote) e NÃO cria post nem grava veredito', async () => {
    const { erro } = await executar('compor-leva', { projectId: PROJETO, loteId: 'dot-8-2026-S43', itens: [{ itemId: 'i-nova', fotoDriveId: 'drive-123', formato: 'story', quando: '2026-10-15 10:00', blocos: [{ papel: 'headline', linhas: ['Manchete nova'] }] }] })
    expect(erro, String(erro)).toBeUndefined()
    // Avançou até criar a peça: é por isso que a ausência de post significa alguma coisa.
    expect(banco.eventos.some((e) => e.startsWith('escrita:generation:'))).toBe(true)
    expect(banco.eventos.some((e) => e.startsWith('escrita:itemDeLote:'))).toBe(true)
    expect(banco.postsCriados).toBe(0)
    expect(banco.eventos).not.toContain('VEREDITO GRAVADO')
    expect(banco.eventos).not.toContain('criarPostDoAgendamento')
    expect(banco.eventos).not.toContain('agendarPost')
    expect(medicao.chamadas).toBe(0)
  })

  it('ajustar-arte: conferida (posts da página) e executada até onde o banco falso a leva; NÃO cria post nem grava veredito', async () => {
    const { erro } = await executar('ajustar-arte', { projectId: PROJETO, pageId: 'p1', slotValues: { headline: 'Texto headline ajustado' } })
    // Com o render e o Blob falsos ela pode terminar ou cair numa recusa de DOMÍNIO (CreativeError) — nunca num erro do harness.
    if (erro) expect(erro, String(erro)).toBeInstanceOf(CreativeError)
    expect(banco.eventos.some((e) => e.startsWith('escrita:page:') || e.startsWith('escrita:generation:')) || erro).toBeTruthy()
    expect(banco.postsCriados).toBe(0)
    expect(banco.eventos).not.toContain('VEREDITO GRAVADO')
    expect(banco.eventos).not.toContain('criarPostDoAgendamento')
    expect(banco.eventos).not.toContain('agendarPost')
  })

  it('buscar-fotos: TERMINA sem erro (Drive vazio, busca semântica desligada), responde a busca e NÃO cria post nem grava veredito', async () => {
    const { resultado, erro } = await executar('buscar-fotos', { projectId: PROJETO, theme: 'ambiente' })
    expect(erro, String(erro)).toBeUndefined()
    expect(resultado).toBeTypeOf('object')
    expect(banco.postsCriados).toBe(0)
    expect(banco.eventos).not.toContain('VEREDITO GRAVADO')
    expect(banco.eventos).not.toContain('criarPostDoAgendamento')
    expect(banco.eventos).not.toContain('agendarPost')
  })

  it('CONTROLE: uma tool que criasse o DRAFT direto, sem o gate, é pega pelo mesmo detector', async () => {
    const { criarPostDoAgendamento, resolverAgendamento } = await import('@/lib/creatives/agendar')
    const { db } = await import('@/lib/db')
    const handlerDeControle = async () => {
      const r = await resolverAgendamento({ projectId: PROJETO, pageId: 'p1', generationId: 'g1', scheduledDatetime: '2026-10-14T13:00:00.000Z', situacao: 'rascunho', postType: 'STORY' } as never)
      return criarPostDoAgendamento(db as never, r as never)
    }
    await handlerDeControle()
    expect(banco.postsCriados).toBe(1)
    expect(banco.eventos.filter((e) => ['VEREDITO GRAVADO', 'POST CRIADO'].includes(e))).toEqual(['POST CRIADO'])
  })

  it('CONTROLE 2: uma tool que usasse o caminho HUMANO (agendarPost) também é pega — post sem veredito, e o marco agendarPost no rastro', async () => {
    const { agendarPost } = await import('@/lib/creatives/agendar')
    await agendarPost({ projectId: PROJETO, pageId: 'p1', generationId: 'g1', scheduledDatetime: '2026-10-14T13:00:00.000Z', situacao: 'rascunho', postType: 'STORY' } as never)
    expect(banco.eventos).toContain('agendarPost')
    expect(banco.postsCriados).toBe(1)
    expect(banco.eventos).not.toContain('VEREDITO GRAVADO')
  })
})

// ─── Complemento estático: o fecho de imports de cada handler ─────────────────

const raiz = process.cwd()
const ler = (c: string) => readFileSync(join(raiz, c), 'utf8')
function resolver(de: string, especificador: string): string | null {
  const base = especificador.startsWith('@/') ? join(raiz, 'src', especificador.slice(2)) : especificador.startsWith('.') ? resolve(dirname(join(raiz, de)), especificador) : null
  if (!base) return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c) && !c.endsWith('/')) {
    try {
      if (readFileSync(c).length >= 0) return c.replace(`${raiz}/`, '')
    } catch {
      /* diretório */
    }
  }
  return null
}
const ESPECIFICADORES = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g
function fecho(iniciais: string[]): string[] {
  const vistos = new Set<string>()
  const fila = [...iniciais]
  while (fila.length) {
    const c = fila.pop()!
    if (vistos.has(c) || !c.startsWith('src/')) continue
    vistos.add(c)
    for (const m of ler(c).matchAll(ESPECIFICADORES)) {
      const alvo = resolver(c, m[1])
      if (alvo && !vistos.has(alvo)) fila.push(alvo)
    }
  }
  return [...vistos].sort()
}
function handlerDe(nome: string): { arquivo: string; texto: string } {
  for (const c of ['src/lib/mcp/catalogo/compositor.ts', 'src/lib/mcp/catalogo/arte-ia.ts', 'src/lib/mcp/catalogo/fotos.ts']) {
    const texto = ler(c)
    const i = texto.indexOf(`nome: '${nome}'`)
    if (i < 0) continue
    const j = texto.indexOf("\n    nome: '", i + 1)
    return { arquivo: c, texto: texto.slice(i, j < 0 ? undefined : j) }
  }
  throw new Error(`handler de ${nome} não encontrado`)
}
const CRIA_POST = /criarPostDoAgendamento\(|socialPost\.create\(|agendarPost\(/

describe('C9 — fecho de imports de cada handler mutante (complemento estático)', () => {
  /**
   * LIMITE DITO: `agendar.ts` (e `agenda-acoes.ts`, que o importa) entram no fecho de TODAS as tools pelo módulo
   * compartilhado `tools.ts` — o fecho de imports não discrimina quem CHAMA `criarPostDoAgendamento`; por isso a prova
   * desta suíte é a EXECUÇÃO acima. O que o fecho prova: só `agendar-leva` alcança `agendar-itens.ts` (o produtor do
   * gate), e a lista de módulos que criam post no fecho de cada tool é FECHADA (um helper novo que criasse post apareceria aqui).
   */
  it('só agendar-leva alcança agendar-itens.ts; a lista de criadores de post no fecho de cada tool é a conhecida', () => {
    const porTool = Object.fromEntries(
      mutantes().map((nome) => {
        const h = handlerDe(nome)
        const iniciais = [...h.texto.matchAll(ESPECIFICADORES)].map((m) => resolver(h.arquivo, m[1])).filter((c): c is string => !!c)
        return [nome, fecho(iniciais).filter((c) => CRIA_POST.test(ler(c)))]
      }),
    )
    const compartilhados = ['src/lib/creatives/agendar.ts', 'src/lib/posts/agenda-acoes.ts']
    expect(porTool).toEqual({
      'agendar-leva': [...compartilhados, 'src/lib/lotes/agendar-itens.ts'].sort(),
      'ajustar-arte': compartilhados,
      'buscar-fotos': compartilhados,
      'compor-leva': compartilhados,
    })
  })
})
