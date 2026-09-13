/**
 * Do lote até os rascunhos (PR 12): `agendarItensDoLote` com banco falso e o
 * `agendarPost` de produção dividido em três (resolver, criar, efeitos).
 *
 * O banco falso modela o que o serviço depende do Postgres: as transações se
 * serializam (a trava real é por linha — esta é global, mais grossa, e por isso
 * não esconde corrida), a transação que lança volta atrás inteira, e a escrita
 * feita POR FORA de uma transação aberta sobrevive ao rollback dela (molde de
 * `fila-lote.test.ts`: sem isso gravar pelo `db` global dentro da transação
 * passaria como atômico).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pages: new Map<string, Record<string, unknown>>(),
  generations: new Map<string, Record<string, unknown>>(),
  posts: new Map<string, Record<string, unknown>>(),
  itensDeLote: new Map<string, Record<string, unknown>>(),
  itensDePlano: new Map<string, Record<string, unknown>>(),
  seq: 0,
  trava: Promise.resolve() as Promise<void>,
  emTransacao: 0,
  foraDaTransacao: [] as Array<() => void>,
  /** Chamado dentro de `socialPost.create` pela transação — o "outro caminho" do teste do compare-and-set. */
  aoCriarPostNaTransacao: null as null | (() => void),
  /** Chamado na PRIMEIRA trava da transação: o que outra chamada gravou enquanto esta esperava. */
  aoTravar: null as null | (() => void),
  /** Chamado depois da N-ésima leitura do item do plano FORA da transação (a leitura dos efeitos). */
  aoLerItemDoPlano: null as null | { depoisDaLeitura: number; fazer: () => void },
  leiturasDoItemDoPlano: 0,
}))

const efeitos = vi.hoisted(() => ({
  sinais: new Map<string, Record<string, unknown>>(),
  chamadasDeArtes: 0,
  movimentos: 0,
  refilagens: [] as Array<{ postId: string; quando: string }>,
  /** Quantas vezes o primeiro efeito deve lançar — a queda entre o commit e os efeitos. */
  derrubar: 0,
}))

vi.mock('@/lib/db', () => {
  type Tabela = 'pages' | 'generations' | 'posts' | 'itensDeLote' | 'itensDePlano'
  const valor = (v: unknown) => (v === undefined ? null : v)
  const casa = (linha: Record<string, unknown>, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (k === 'OR') return (cond as Array<Record<string, unknown>>).some((w) => casa(linha, w))
      if (k === 'NOT') return !casa(linha, cond as Record<string, unknown>)
      const atual = valor(linha[k])
      if (cond instanceof Date) return atual instanceof Date && atual.getTime() === cond.getTime()
      if (cond && typeof cond === 'object') {
        const c = cond as Record<string, unknown>
        if ('has' in c) return Array.isArray(atual) && atual.includes(c.has)
        if ('in' in c) return (c.in as unknown[]).includes(atual)
        // Como no SQL: `not` não casa com nulo.
        if ('not' in c) return atual !== null && atual !== c.not
      }
      return atual === valor(cond)
    })
  const escolher = (linha: Record<string, unknown>, select?: Record<string, unknown>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, linha[k] ?? null])) : linha
  const gravar = (tabela: Tabela, id: string, linha: Record<string, unknown>, naTransacao: boolean) => {
    banco[tabela].set(id, linha)
    if (!naTransacao && banco.emTransacao > 0) {
      const copia = structuredClone(linha)
      banco.foraDaTransacao.push(() => banco[tabela].set(id, structuredClone(copia)))
    }
  }
  const atualizarMuitos = (tabela: Tabela, naTransacao: boolean) => async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    let count = 0
    for (const [id, linha] of banco[tabela]) {
      if (!casa(linha, where)) continue
      // Como o @updatedAt do Prisma: toda escrita no item do plano muda o carimbo.
      gravar(tabela, id, { ...linha, ...data, ...(tabela === 'itensDePlano' ? { updatedAt: new Date(Date.parse('2026-09-12T00:00:00Z') + ++banco.seq) } : {}) }, naTransacao)
      count++
    }
    return { count }
  }

  const delegados = (naTransacao: boolean) => ({
    project: { findUnique: async ({ where }: { where: { id: number } }) => (where.id === 404 ? null : { id: where.id, name: 'Espeto Gaúcho', userId: 'dono-interno', instagramAccountId: null }) },
    knowledgeBaseEntry: { findFirst: async () => null },
    page: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        const p = banco.pages.get(where.id)
        return p ? escolher(p, select) : null
      },
    },
    generation: {
      findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const g = [...banco.generations.values()].find((x) => casa(x, where))
        return g ? escolher(g, select) : null
      },
    },
    socialPost: {
      create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const id = `post-${++banco.seq}`
        const linha = { id, createdAt: banco.seq, renderStatus: 'NOT_NEEDED', ...data }
        gravar('posts', id, linha, naTransacao)
        if (naTransacao) banco.aoCriarPostNaTransacao?.()
        return escolher(linha, select)
      },
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        const p = banco.posts.get(where.id)
        return p ? escolher(p, select) : null
      },
      findMany: async ({ where, select, take }: { where: Record<string, unknown>; select?: Record<string, unknown>; take?: number }) =>
        [...banco.posts.values()]
          .filter((p) => casa(p, where))
          .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
          .slice(0, take ?? Infinity)
          .map((p) => escolher(p, select)),
    },
    itemDeLote: {
      findUnique: async ({ where, select }: { where: { id?: string; projectId_loteId_itemId?: Record<string, unknown> }; select?: Record<string, unknown> }) => {
        const l = where.id ? banco.itensDeLote.get(where.id) : [...banco.itensDeLote.values()].find((x) => casa(x, where.projectId_loteId_itemId))
        return l ? escolher(l, select) : null
      },
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) =>
        [...banco.itensDeLote.values()].filter((l) => casa(l, where)).map((l) => escolher(l, select)),
      updateMany: atualizarMuitos('itensDeLote', naTransacao),
    },
    itemDePlano: {
      findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const i = [...banco.itensDePlano.values()].find((x) => casa(x, where))
        const lido = i ? escolher(structuredClone(i), select) : null
        if (!naTransacao) {
          banco.leiturasDoItemDoPlano++
          const gancho = banco.aoLerItemDoPlano
          if (gancho && banco.leiturasDoItemDoPlano === gancho.depoisDaLeitura) {
            banco.aoLerItemDoPlano = null
            gancho.fazer()
          }
        }
        return lido
      },
      updateMany: atualizarMuitos('itensDePlano', naTransacao),
    },
  })

  const $transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    const anterior = banco.trava
    let liberar!: () => void
    banco.trava = new Promise<void>((r) => {
      liberar = r
    })
    await anterior
    const foto = structuredClone({ pages: banco.pages, generations: banco.generations, posts: banco.posts, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano })
    banco.emTransacao++
    banco.foraDaTransacao = []
    try {
      return await run({
        ...delegados(true),
        $queryRaw: async () => {
          const gancho = banco.aoTravar
          banco.aoTravar = null
          gancho?.()
          return []
        },
      })
    } catch (erro) {
      Object.assign(banco, foto)
      for (const reaplicar of banco.foraDaTransacao) reaplicar()
      throw erro
    } finally {
      banco.emTransacao--
      banco.foraDaTransacao = []
      liberar()
    }
  }
  return { db: { ...delegados(false), $transaction } }
})

vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: vi.fn(async (urls: string[]) => ({ urls, falhas: [], importadas: 0 })) }))

// Os sinais são upsert por chave no código de produção: aqui também — a segunda escrita da mesma chave não muda nada.
const registrarSinal = (chave: string, dados: Record<string, unknown>) => {
  if (!efeitos.sinais.has(chave)) efeitos.sinais.set(chave, dados)
}
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({
  registrarSlotDoPost: async (e: { postId: string }) => registrarSinal(`slot:post:${e.postId}`, e),
  registrarCopyDoPost: async (e: { postId: string; copyFinal: unknown }) => {
    if (e.copyFinal) registrarSinal(`copy:post:${e.postId}`, e)
  },
  fecharSugestaoDeSlot: async () => undefined,
}))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarLegendaDoPost: async (e: { postId: string }) => registrarSinal(`legenda:post:${e.postId}`, e) }))
vi.mock('@/lib/posts/artes-do-post', () => ({
  registrarArtesDoPost: async () => {
    efeitos.chamadasDeArtes++
    if (efeitos.derrubar > 0) {
      efeitos.derrubar--
      throw new Error('a invocação morreu entre o commit e os efeitos')
    }
    return { registradas: 0, colunaVinculada: false, artes: [] }
  },
}))
vi.mock('@/lib/compositor/pastas', () => ({
  formatoDaPagina: (p: { tags?: string[]; width: number; height: number }) =>
    (p.tags ?? []).includes('feed') ? 'feed' : p.width === p.height ? 'quadrado' : p.height > p.width * 1.6 ? 'story' : 'feed',
  moverPaginaParaSemana: async () => {
    efeitos.movimentos++
    return { moveu: false, de: null, para: null }
  },
  refilarPaginasDoPost: async (postId: string, quando: Date) => {
    efeitos.refilagens.push({ postId, quando: new Date(quando).toISOString() })
    return { refiladas: 1, avisos: [] }
  },
}))
// C12-1: o item do plano vai de `pronto` para `agendado` por compare-and-set, nunca atravessando transições.
vi.mock('@/lib/planos/plano-service', () => ({
  transicionarItem: async () => {
    throw new Error('agendar-leva não pode atravessar transições do item do plano')
  },
}))

import { agendarItensDoLote } from '../agendar-itens'
import { agendarPost } from '@/lib/creatives/agendar'

const PROJETO = 6
const LOTE = 'semana-2026-09-14'
const BLOB = 'https://loja.public.blob.vercel-storage.com'

function criarPeca(n: number, opcoes: { status?: string; formato?: 'story' | 'feed'; quando?: string | null; slide?: boolean; itemDoPlano?: { status: string; generationId?: string | null; postId?: string | null } | 'ausente' } = {}) {
  const formato = opcoes.formato ?? 'story'
  const camadas = [{ id: 'headline', type: 'text', content: `Manchete ${n}`, position: { x: 10, y: 20 } }]
  const url = `${BLOB}/page-${n}-1757700000000.png`
  const status = opcoes.status ?? 'COMPLETED'
  banco.pages.set(`page-${n}`, {
    id: `page-${n}`,
    templateId: 42,
    isTemplate: false,
    width: 1080,
    height: formato === 'story' ? 1920 : 1350,
    tags: ['compositor', formato],
    thumbnail: status === 'COMPLETED' ? url : null,
    layers: camadas,
    Template: { projectId: PROJETO },
  })
  banco.generations.set(`gen-${n}`, {
    id: `gen-${n}`,
    projectId: PROJETO,
    status,
    resultUrl: status === 'COMPLETED' ? url : null,
    slideOrder: opcoes.slide ? 2 : null,
    sourcePageId: null,
    fieldValues: {
      source: 'compositor',
      ...(status === 'COMPLETED' ? { pageId: `page-${n}`, layersSnapshot: camadas } : {}),
      spec: {
        projectId: PROJETO,
        formato,
        ...(opcoes.quando !== null ? { quando: opcoes.quando ?? `2026-09-1${n} 19:00` } : {}),
        ...(opcoes.itemDoPlano ? { itemDePlanoId: `plano-item-${n}`, planoId: 'plano-1' } : {}),
      },
    },
  })
  if (opcoes.itemDoPlano && opcoes.itemDoPlano !== 'ausente') {
    banco.itensDePlano.set(`plano-item-${n}`, {
      id: `plano-item-${n}`, planoId: 'plano-1', projectId: PROJETO, postId: null, pageId: `page-${n}`,
      updatedAt: new Date('2026-09-10T12:00:00.000Z'), generationId: `gen-${n}`, ...opcoes.itemDoPlano,
    })
  }
  banco.itensDeLote.set(`lote-${n}`, {
    id: `lote-${n}`, projectId: PROJETO, loteId: LOTE, itemId: `item-${n}`, generationId: `gen-${n}`, jobId: `job-${n}`,
    situacao: 'enfileirado', postId: null, hashDoAgendamento: null, agendadoEm: null, efeitosDoAgendamentoEm: null,
  })
}

const agendar = (itens: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
  agendarItensDoLote({ projectId: PROJETO, loteId: LOTE, itens, decididoPor: 'u1', ...extra })
const item = (n: number, extra: Record<string, unknown> = {}) => ({ itemId: `item-${n}`, ...extra })
const postsDaPagina = (n: number) => [...banco.posts.values()].filter((p) => p.pageId === `page-${n}`)
/** Uma escrita que outra chamada já COMMITOU: vale mesmo que a transação desta volte atrás. */
const escreverPorFora = (tabela: 'pages' | 'posts' | 'itensDePlano', id: string, linha: Record<string, unknown>) => {
  banco[tabela].set(id, linha)
  banco.foraDaTransacao.push(() => banco[tabela].set(id, structuredClone(linha)))
}
const fotoDoBanco = () => structuredClone({ pages: banco.pages, generations: banco.generations, posts: banco.posts, itensDeLote: banco.itensDeLote, itensDePlano: banco.itensDePlano, sinais: efeitos.sinais })

beforeEach(() => {
  for (const m of [banco.pages, banco.generations, banco.posts, banco.itensDeLote, banco.itensDePlano, efeitos.sinais]) m.clear()
  banco.seq = 0
  banco.trava = Promise.resolve()
  banco.emTransacao = 0
  banco.foraDaTransacao = []
  banco.aoCriarPostNaTransacao = null
  banco.aoTravar = null
  banco.aoLerItemDoPlano = null
  banco.leiturasDoItemDoPlano = 0
  efeitos.chamadasDeArtes = 0
  efeitos.movimentos = 0
  efeitos.refilagens = []
  efeitos.derrubar = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('do lote até os rascunhos — a semana', () => {
  it('semana de 5 com falha no meio: exatamente os rascunhos previstos, com página editável e imagem atual; a repetição não duplica', async () => {
    for (const n of [1, 2, 4, 5]) criarPeca(n)
    criarPeca(3, { status: 'FAILED' })
    const semana = [1, 2, 3, 4, 5].map((n) => item(n))

    const primeira = await agendar(semana)
    expect(primeira.resumo).toEqual({ concluidos: 4, pendentes: 0, falhas: 1 })
    expect(primeira.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['criado', 'criado', 'PECA_FALHOU', 'criado', 'criado'])
    expect(banco.posts.size).toBe(4)
    for (const n of [1, 2, 4, 5]) {
      const [post] = postsDaPagina(n)
      expect(post).toMatchObject({
        status: 'DRAFT', postType: 'STORY', pageId: `page-${n}`, templateId: 42, generationId: `gen-${n}`,
        renderStatus: 'RENDERED', mediaUrls: [`${BLOB}/page-${n}-1757700000000.png`], scheduledDatetime: new Date(`2026-09-1${n}T22:00:00.000Z`),
      })
      expect(banco.itensDeLote.get(`lote-${n}`)).toMatchObject({ postId: post.id, hashDoAgendamento: expect.stringMatching(/^agendamento-v1:/) })
      expect(banco.itensDeLote.get(`lote-${n}`)!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
    }
    expect(primeira.itens[0]).toMatchObject({ situacao: 'concluido', pageId: 'page-1', generationId: 'gen-1', quando: '11/09/2026, 19:00', renderStatus: 'RENDERED', editUrl: 'https://studio.test/templates/42/editor?pageId=page-1' })
    expect(efeitos.sinais.size).toBe(12) // slot + copy + legenda por post

    const repetida = await agendar(semana)
    expect(repetida.resumo).toEqual(primeira.resumo)
    expect(repetida.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['reaproveitado', 'reaproveitado', 'PECA_FALHOU', 'reaproveitado', 'reaproveitado'])
    expect(repetida.itens.map((i) => i.postId)).toEqual(primeira.itens.map((i) => i.postId))
    expect(banco.posts.size).toBe(4)
    expect(efeitos.chamadasDeArtes).toBe(4) // nenhum efeito refeito: os carimbos estavam gravados

    // A composição do item 3 foi refeita (PR 11): a próxima repetição completa a semana.
    criarPeca(3)
    const completa = await agendar(semana)
    expect(completa.resumo).toEqual({ concluidos: 5, pendentes: 0, falhas: 0 })
    expect(completa.itens.map((i) => i.desfecho)).toEqual(['reaproveitado', 'reaproveitado', 'criado', 'reaproveitado', 'reaproveitado'])
    expect(banco.posts.size).toBe(5)
  })

  it('peça ainda na fila fica pendente e não escreve nada', async () => {
    criarPeca(1, { status: 'PROCESSING' })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'pendente', codigo: 'PECA_EM_ANDAMENTO', generationId: 'gen-1' })
    expect(banco.posts.size).toBe(0)
  })

  it('formato feed vira POST, nunca o STORY padrão de agendarPost', async () => {
    criarPeca(1, { formato: 'feed' })
    await agendar([item(1)])
    expect(postsDaPagina(1)[0]).toMatchObject({ postType: 'POST' })
  })


  it('campo do pedido inválido falha SÓ o item: quando vazio não derruba a leva (C12-1c)', async () => {
    criarPeca(1)
    criarPeca(2)
    const r = await agendar([item(1, { quando: '' }), item(2)])
    expect(r.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['DATA_INVALIDA', 'criado'])
    expect(r.resumo).toEqual({ concluidos: 1, pendentes: 0, falhas: 1 })
    expect(postsDaPagina(1)).toHaveLength(0)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: null })
  })

  it('horário do item diferente do da composição: o rascunho sai no pedido e a página é remarcada junto', async () => {
    criarPeca(1)
    const r = await agendar([item(1, { quando: '2026-09-20 12:00' })])
    expect(postsDaPagina(1)[0].scheduledDatetime).toEqual(new Date('2026-09-20T15:00:00.000Z'))
    expect(efeitos.refilagens).toEqual([{ postId: r.itens[0].postId, quando: '2026-09-20T15:00:00.000Z' }])
  })
})

describe('idempotência e concorrência', () => {
  it('par concorrente no mesmo item: UM post, as duas chamadas devolvem o mesmo', async () => {
    criarPeca(1)
    const [a, b] = await Promise.all([agendar([item(1)]), agendar([item(1)])])
    expect(banco.posts.size).toBe(1)
    expect(a.itens[0].postId).toBe(b.itens[0].postId)
    expect([a.itens[0].desfecho, b.itens[0].desfecho].sort()).toEqual(['criado', 'reaproveitado'])
    expect(efeitos.sinais.size).toBe(3)
  })

  it('queda entre o commit e os efeitos: o rascunho existe, e a repetição refaz SÓ os efeitos', async () => {
    criarPeca(1)
    efeitos.derrubar = 1
    const caiu = await agendar([item(1)])
    expect(caiu.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(caiu.itens[0].avisos?.join()).toContain('não terminou')
    expect(banco.posts.size).toBe(1)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: caiu.itens[0].postId, efeitosDoAgendamentoEm: null })
    expect(efeitos.sinais.size).toBe(0)

    const repetida = await agendar([item(1)])
    expect(repetida.itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId: caiu.itens[0].postId })
    expect(repetida.itens[0].avisos).toBeUndefined()
    expect(banco.posts.size).toBe(1)
    expect(efeitos.sinais.size).toBe(3)
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)

    await agendar([item(1)])
    expect(efeitos.chamadasDeArtes).toBe(2) // a terceira não refaz nada
  })

  it('vínculo por compare-and-set: se a linha foi ligada por outro caminho durante a criação, a transação volta atrás e nenhum post órfão fica', async () => {
    criarPeca(1)
    banco.aoCriarPostNaTransacao = () => {
      banco.aoCriarPostNaTransacao = null
      const linha = banco.itensDeLote.get('lote-1')!
      // Escrita POR FORA da transação (sem trava): sobrevive ao rollback.
      banco.itensDeLote.set('lote-1', { ...linha, postId: 'post-de-fora' })
      banco.foraDaTransacao.push(() => banco.itensDeLote.set('lote-1', { ...linha, postId: 'post-de-fora' }))
    }
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'LOTE_AGENDAMENTO_CONCORRENTE' })
    expect(banco.posts.size).toBe(0)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: 'post-de-fora' })
  })

  it('post que já tem a página (rascunho criado à mão) é ADOTADO, sem criar outro', async () => {
    criarPeca(1)
    banco.posts.set('post-manual', { id: 'post-manual', projectId: PROJETO, pageId: 'page-1', templateId: 42, status: 'DRAFT', postType: 'STORY', scheduledDatetime: new Date('2026-09-11T22:00:00.000Z'), mediaUrls: [], renderStatus: 'PENDING', createdAt: 0, caption: 'Legenda da equipe', campaignId: 'camp-da-equipe', sugestaoId: null, origem: null })
    const r = await agendar([item(1, { caption: 'Legenda do lote', campanhaId: 'camp-do-lote' })])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'adotado', postId: 'post-manual' })
    // C12-1b: os sinais descrevem o post ADOTADO, não o pedido do lote.
    expect(efeitos.sinais.get('legenda:post:post-manual')).toMatchObject({ legenda: 'Legenda da equipe', campaignId: 'camp-da-equipe' })
    expect(efeitos.sinais.get('slot:post:post-manual')).toMatchObject({ campaignId: 'camp-da-equipe' })
    expect(banco.posts.size).toBe(1)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: 'post-manual' })
    expect((await agendar([item(1, { caption: 'Legenda do lote', campanhaId: 'camp-do-lote' })])).itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId: 'post-manual' })
  })

  it('página já publicada não ganha segundo post', async () => {
    criarPeca(1)
    banco.posts.set('post-no-ar', { id: 'post-no-ar', projectId: PROJETO, pageId: 'page-1', status: 'POSTED', mediaUrls: [`${BLOB}/page-1-1757700000000.png`], createdAt: 0 })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PAGINA_JA_EM_POST', postId: 'post-no-ar' })
    expect(banco.posts.size).toBe(1)
  })

  it('post apagado da agenda não é recriado', async () => {
    criarPeca(1)
    const r = await agendar([item(1)])
    banco.posts.delete(r.itens[0].postId!)
    const depois = await agendar([item(1)])
    expect(depois.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'POST_REMOVIDO' })
    expect(banco.posts.size).toBe(0)
  })

  it('outro pedido sob o mesmo item é conflito, e os outros itens seguem; a remarcação da equipe vence o mesmo pedido', async () => {
    criarPeca(1)
    criarPeca(2)
    const r = await agendar([item(1), item(2)])
    const conflito = await agendar([item(1, { quando: '2026-09-11 20:00' }), item(2)])
    expect(conflito.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['LOTE_AGENDAMENTO_CONFLITO', 'reaproveitado'])
    expect(conflito.resumo).toEqual({ concluidos: 1, pendentes: 0, falhas: 1 })

    // A equipe remarcou o rascunho na agenda: o mesmo pedido devolve o post como está.
    const id = r.itens[0].postId!
    banco.posts.set(id, { ...banco.posts.get(id), scheduledDatetime: new Date('2026-09-12T13:00:00.000Z') })
    const mesma = await agendar([item(1)])
    expect(mesma.itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId: id, quando: '12/09/2026, 10:00' })
    expect(banco.posts.get(id)!.scheduledDatetime).toEqual(new Date('2026-09-12T13:00:00.000Z'))
    expect(banco.posts.size).toBe(2)
  })

  it('slide de carrossel e peça sem horário não viram post', async () => {
    criarPeca(1, { slide: true })
    criarPeca(2, { quando: null })
    const r = await agendar([item(1), item(2)])
    expect(r.itens.map((i) => i.codigo)).toEqual(['SLIDE_DE_CARROSSEL', 'SEM_HORARIO'])
    expect(banco.posts.size).toBe(0)
  })
})

describe('o item do plano manda na peça (C12-1)', () => {
  const fotoDoItem = (n: number) => structuredClone(banco.itensDePlano.get(`plano-item-${n}`))

  it('item PRONTO que aponta ESTA peça: o rascunho nasce e o item vai para agendado por compare-and-set, sem atravessar transições', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(r.itens[0].avisos).toBeUndefined()
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'agendado', postId: r.itens[0].postId, generationId: 'gen-1', pageId: 'page-1' })
    // A repetição não mexe no item que já está agendado com este post.
    const antes = fotoDoItem(1)
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ desfecho: 'reaproveitado' })
    expect(fotoDoItem(1)).toEqual(antes)
  })

  it.each([
    ['reprovado na bancada', { status: 'reprovado' }],
    ['reaberto para edição (mantém a peça antiga)', { status: 'editado' }],
    ['reaprovado para refazer (mantém a peça antiga)', { status: 'aprovado' }],
    ['refeito: pronto com OUTRA peça', { status: 'pronto', generationId: 'gen-refeita' }],
    ['em voo com a refação', { status: 'na-fila', generationId: 'gen-refeita' }],
  ])('item %s: PECA_SUPERADA_NO_PLANO, nenhum post, linha sem post, item intacto — e simular diz o mesmo', async (_caso, itemDoPlano) => {
    criarPeca(1, { itemDoPlano })
    criarPeca(2)
    const antes = fotoDoBanco()
    const simulada = await agendar([item(1), item(2)], { simular: true })
    expect(simulada.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['PECA_SUPERADA_NO_PLANO', 'criado'])
    expect(fotoDoBanco()).toEqual(antes)

    const r = await agendar([item(1), item(2)])
    expect(r.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['PECA_SUPERADA_NO_PLANO', 'criado'])
    expect(postsDaPagina(1)).toHaveLength(0)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: null, hashDoAgendamento: null })
    expect(banco.itensDePlano.get('plano-item-1')).toEqual(antes.itensDePlano.get('plano-item-1'))
  })

  it('item do plano apagado: ITEM_DO_PLANO_AUSENTE, sem post', async () => {
    criarPeca(1, { itemDoPlano: 'ausente' })
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'ITEM_DO_PLANO_AUSENTE' })
    expect(banco.posts.size).toBe(0)
  })

  it('o item muda entre a leitura dos efeitos e o vínculo: o compare-and-set recusa, o item fica como a pessoa deixou e o aviso diz', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    // Leituras fora da transação: 1 = decisão sem trava, 2 = efeitos. Logo depois da 2ª a pessoa reprova.
    banco.aoLerItemDoPlano = { depoisDaLeitura: 2, fazer: () => banco.itensDePlano.set('plano-item-1', { ...banco.itensDePlano.get('plano-item-1')!, status: 'reprovado', updatedAt: new Date('2026-09-12T15:00:00.000Z') }) }
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(r.itens[0].avisos?.join()).toContain('mudou enquanto')
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'reprovado', postId: null })
  })
})

describe('rechecagem SOB a trava (C12-1a)', () => {
  it('a página virou modelo enquanto a chamada esperava a trava: PAGINA_MODELO e nenhum post', async () => {
    criarPeca(1)
    banco.aoTravar = () => escreverPorFora('pages', 'page-1', { ...banco.pages.get('page-1')!, isTemplate: true })
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PAGINA_MODELO' })
    expect(banco.posts.size).toBe(0)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: null })
  })

  it('a arte entrou noutro post (agendada por generationId) enquanto a chamada esperava: PECA_JA_NA_AGENDA e nenhum post novo', async () => {
    criarPeca(1)
    banco.aoTravar = () => escreverPorFora('posts', 'post-por-generation', { id: 'post-por-generation', projectId: PROJETO, pageId: null, status: 'DRAFT', mediaUrls: [`${BLOB}/page-1-1757700000000.png`], createdAt: 0 })
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PECA_JA_NA_AGENDA', postId: 'post-por-generation' })
    expect(banco.posts.size).toBe(1)
  })

  it('o item do plano foi reprovado enquanto a chamada esperava: PECA_SUPERADA_NO_PLANO, nenhum post, item reprovado', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    banco.aoTravar = () => escreverPorFora('itensDePlano', 'plano-item-1', { ...banco.itensDePlano.get('plano-item-1')!, status: 'reprovado' })
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PECA_SUPERADA_NO_PLANO' })
    expect(banco.posts.size).toBe(0)
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'reprovado', postId: null })
  })
})

describe('imagem atual', () => {
  it('camada editada depois da composição (thumbnail velho): o rascunho nasce PENDING e o cron desenha a página atual', async () => {
    criarPeca(1)
    const pagina = banco.pages.get('page-1')!
    banco.pages.set('page-1', { ...pagina, layers: [{ id: 'headline', type: 'text', content: 'Editada no editor', position: { x: 10, y: 20 } }] })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ renderStatus: 'PENDING', imagem: null })
    const [post] = postsDaPagina(1)
    expect(post).toMatchObject({ renderStatus: 'PENDING', mediaUrls: [], pageId: 'page-1', templateId: 42 })
    expect(post.nextRenderAt).toBeInstanceOf(Date)
  })

  it('thumbnail que não é a peça do lote (outro render gravado na página) também vira PENDING', async () => {
    criarPeca(1)
    banco.pages.set('page-1', { ...banco.pages.get('page-1')!, thumbnail: `${BLOB}/outro-render.png` })
    await agendar([item(1)])
    expect(postsDaPagina(1)[0]).toMatchObject({ renderStatus: 'PENDING', mediaUrls: [] })
  })

  it('agendarPost fora do lote continua como sempre: reusa qualquer thumbnail do Blob', async () => {
    criarPeca(1)
    banco.pages.set('page-1', { ...banco.pages.get('page-1')!, thumbnail: `${BLOB}/outro-render.png` })
    const r = await agendarPost({ projectId: PROJETO, pageId: 'page-1', scheduledDatetime: '2026-09-11 19:00', postType: 'STORY' })
    expect(banco.posts.get(r.postId)).toMatchObject({ renderStatus: 'RENDERED', mediaUrls: [`${BLOB}/outro-render.png`], pageId: 'page-1', templateId: 42 })
    expect(r).toMatchObject({ situacao: 'rascunho', tipo: 'story', quando: '11/09/2026, 19:00' })
  })
})

describe('simular', () => {
  it('toma as mesmas decisões e devolve a mesma conta sem escrever NADA', async () => {
    for (const n of [1, 2, 4]) criarPeca(n)
    criarPeca(3, { status: 'FAILED' })
    criarPeca(5, { status: 'PROCESSING' })
    banco.posts.set('post-manual', { id: 'post-manual', projectId: PROJETO, pageId: 'page-4', templateId: 42, status: 'DRAFT', postType: 'STORY', scheduledDatetime: new Date('2026-09-14T22:00:00.000Z'), mediaUrls: [], renderStatus: 'PENDING', createdAt: 0 })
    const semana = [1, 2, 3, 4, 5].map((n) => item(n))
    const antes = fotoDoBanco()

    const simulada = await agendar(semana, { simular: true })
    expect(simulada.simulado).toBe(true)
    expect(fotoDoBanco()).toEqual(antes)
    expect(efeitos.chamadasDeArtes + efeitos.movimentos + efeitos.refilagens.length).toBe(0)

    const deVerdade = await agendar(semana)
    expect(simulada.resumo).toEqual(deVerdade.resumo)
    expect(simulada.itens.map((i) => [i.situacao, i.desfecho ?? i.codigo, i.renderStatus])).toEqual(deVerdade.itens.map((i) => [i.situacao, i.desfecho ?? i.codigo, i.renderStatus]))
  })

  it('recusa a leva inteira com identidade inválida antes de ler qualquer item', async () => {
    criarPeca(1)
    await expect(agendar([item(1), item(1)])).rejects.toMatchObject({ code: 'LOTE_IDENTIDADE_INVALIDA', status: 400 })
    await expect(agendarItensDoLote({ projectId: 404, loteId: LOTE, itens: [item(1)] })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    expect(banco.posts.size).toBe(0)
  })
})
