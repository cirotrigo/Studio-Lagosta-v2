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
  /** Os sinais gravados pela captura REAL (`registrarDecisaoSemSugestao` → upsert por chave). */
  sinais: new Map<string, Record<string, unknown>>(),
  /** Prefixos de chave cujo PRÓXIMO upsert cai no banco (R12-02): a captura real engole o erro. */
  falharSinais: [] as string[],
  /** A próxima escrita no item do plano cai no banco (R12-02, reconciliação da linha legada). */
  falharEscritaDoItemDoPlano: 0,
  /** Quantas buscas da pasta da semana caem no banco (R12-02): a pasta de verdade engole o erro. */
  falharPasta: 0,
  /** R12-04: a conta pelo leitor não pode tocar o `db` global — tocar lança. */
  dbGlobalBloqueado: false,
}))

const efeitos = vi.hoisted(() => ({
  sinais: new Map<string, Record<string, unknown>>(),
  chamadasDeArtes: 0,
  /** Uma por chamada de `registrarSlotDoPost` — o primeiro efeito; é onde a queda é simulada. */
  chamadasDeSlot: 0,
  movimentos: 0,
  refilagens: [] as Array<{ postId: string; quando: string }>,
  /** Quantas vezes o primeiro efeito deve lançar — a queda entre o commit e os efeitos. */
  derrubar: 0,
  /** R12-02: os efeitos de VERDADE (a captura que engole o erro, a refilagem e a pasta da semana), não os falsos. */
  sinaisReais: false,
  pastasReais: false,
  /** R12-02: o catálogo de artes que engoliu a queda do banco (a prova do real mora em `artes-do-post-falha.test.ts`). */
  artesFalham: false,
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
    learningSignal: {
      upsert: async ({ where, create }: { where: { chave: string }; create: Record<string, unknown> }) => {
        const i = banco.falharSinais.findIndex((prefixo) => where.chave.startsWith(prefixo))
        if (i >= 0) {
          banco.falharSinais.splice(i, 1)
          throw new Error('a conexão com o banco caiu no meio do upsert')
        }
        if (!banco.sinais.has(where.chave)) banco.sinais.set(where.chave, { id: `sinal-${++banco.seq}`, ...create })
        return { id: banco.sinais.get(where.chave)!.id }
      },
    },
    // Só as funções REAIS de pastas chegam aqui (R12-02): a pasta da semana, que o banco pode derrubar.
    template: {
      findFirst: async () => {
        if (banco.falharPasta > 0) {
          banco.falharPasta--
          throw new Error('a conexão com o banco caiu ao procurar a pasta da semana')
        }
        return { id: 42, name: 'Stories · Semana 14 a 20/09' }
      },
    },
    page: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        const p = banco.pages.get(where.id)
        return p ? escolher(p, select) : null
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => [...banco.pages.values()].filter((p) => casa(p, where)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const linha = { ...banco.pages.get(where.id)!, ...data }
        gravar('pages', where.id, linha, naTransacao)
        return linha
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
      findMany: async ({ where }: { where: Record<string, unknown> }) => [...banco.itensDePlano.values()].filter((i) => casa(i, where)),
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!naTransacao && banco.falharEscritaDoItemDoPlano > 0) {
          banco.falharEscritaDoItemDoPlano--
          throw new Error('a conexão com o banco caiu ao marcar o item do plano')
        }
        return atualizarMuitos('itensDePlano', naTransacao)(args)
      },
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
  const global: Record<string, unknown> = { ...delegados(false), $transaction }
  /** R12-04: o leitor da conta de produção — as mesmas tabelas, e qualquer escrita lança (é o READ ONLY do banco). */
  const leitorSomenteLeitura = () =>
    Object.fromEntries(
      Object.entries(delegados(false)).map(([tabela, metodos]) => [
        tabela,
        new Proxy(metodos as Record<string, unknown>, {
          get: (alvo, metodo) => {
            if (typeof metodo === 'string' && /^(create|update|upsert|delete)/.test(metodo)) throw new Error(`escrita num leitor somente leitura: ${tabela}.${metodo}`)
            return alvo[metodo as string]
          },
        }),
      ]),
    )
  return {
    db: new Proxy(global, {
      get: (alvo, chave) => {
        if (banco.dbGlobalBloqueado) throw new Error(`a conta devia passar pelo leitor e usou o db global (${String(chave)})`)
        return alvo[chave as string]
      },
    }),
    leitorSomenteLeitura,
  }
})

vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: vi.fn(async (urls: string[]) => ({ urls, falhas: [], importadas: 0 })) }))

// Os sinais são upsert por chave no código de produção: aqui também — a segunda escrita da mesma chave não muda nada.
const registrarSinal = (chave: string, dados: object) => {
  if (!efeitos.sinais.has(chave)) efeitos.sinais.set(chave, dados as Record<string, unknown>)
}
vi.mock('@/lib/aprendizado/sinal-de-agendamento', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/aprendizado/sinal-de-agendamento')>()
  return {
    registrarSlotDoPost: async (e: Parameters<typeof real.registrarSlotDoPost>[0]) => {
      efeitos.chamadasDeSlot++
      if (efeitos.derrubar > 0) {
        efeitos.derrubar--
        throw new Error('a invocação morreu entre o commit e os efeitos')
      }
      if (efeitos.sinaisReais) return real.registrarSlotDoPost(e)
      registrarSinal(`slot:post:${e.postId}`, e)
      return true
    },
    registrarCopyDoPost: async (e: Parameters<typeof real.registrarCopyDoPost>[0]) => {
      if (efeitos.sinaisReais) return real.registrarCopyDoPost(e)
      if (e.copyFinal) registrarSinal(`copy:post:${e.postId}`, e)
      return true
    },
    fecharSugestaoDeSlot: async (e: Parameters<typeof real.fecharSugestaoDeSlot>[0]) => (efeitos.sinaisReais ? real.fecharSugestaoDeSlot(e) : true),
  }
})
vi.mock('@/lib/aprendizado/sinal-de-legenda', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/aprendizado/sinal-de-legenda')>()
  return {
    registrarLegendaDoPost: async (e: Parameters<typeof real.registrarLegendaDoPost>[0]) => {
      if (efeitos.sinaisReais) return real.registrarLegendaDoPost(e)
      registrarSinal(`legenda:post:${e.postId}`, e)
      return true
    },
  }
})
vi.mock('@/lib/posts/artes-do-post', () => ({
  registrarArtesDoPost: async () => {
    efeitos.chamadasDeArtes++
    return { registradas: 0, colunaVinculada: false, artes: [], ...(efeitos.artesFalham ? { falhou: true } : {}) }
  },
}))
vi.mock('@/lib/compositor/pastas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/compositor/pastas')>()
  return {
    formatoDaPagina: (p: { tags?: string[]; width: number; height: number }) =>
      (p.tags ?? []).includes('feed') ? 'feed' : p.width === p.height ? 'quadrado' : p.height > p.width * 1.6 ? 'story' : 'feed',
    moverPaginaParaSemana: async (pageId: string, quando: Date, userId: string) => {
      efeitos.movimentos++
      if (efeitos.pastasReais) return real.moverPaginaParaSemana(pageId, quando, userId)
      return { moveu: false, de: null, para: null }
    },
    refilarPaginasDoPost: async (postId: string, quando: Date, userId: string) => {
      efeitos.refilagens.push({ postId, quando: new Date(quando).toISOString() })
      if (efeitos.pastasReais) return real.refilarPaginasDoPost(postId, quando, userId)
      return { refiladas: 1, avisos: [] }
    },
  }
})
// C12-1: o item do plano vai de `pronto` para `agendado` por compare-and-set, nunca atravessando transições.
vi.mock('@/lib/planos/plano-service', () => ({
  transicionarItem: async () => {
    throw new Error('agendar-leva não pode atravessar transições do item do plano')
  },
}))

import { agendarItensDoLote } from '../agendar-itens'
import { agendarPost } from '@/lib/creatives/agendar'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'

const PROJETO = 6
const LOTE = 'semana-2026-09-14'
const BLOB = 'https://loja.public.blob.vercel-storage.com'

function criarPeca(n: number, opcoes: { status?: string; formato?: 'story' | 'feed'; quando?: string | null; slide?: boolean; itemDoPlano?: { status: string; generationId?: string | null; postId?: string | null; pageId?: string } | 'ausente' } = {}) {
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
      // A versão visual que o render grava junto do PNG (`renderPageAndRegister`) — é contra ela que a imagem é conferida (R12-01).
      ...(status === 'COMPLETED' ? { pageId: `page-${n}`, layersSnapshot: camadas, versaoRenderizada: versaoDaPagina({ width: 1080, height: formato === 'story' ? 1920 : 1350, background: null, layers: camadas }) } : {}),
      spec: {
        projectId: PROJETO,
        formato,
        tema: `Tema ${n}`,
        blocos: [{ papel: 'headline', linhas: [`Manchete ${n}`] }],
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
const escreverPorFora = (tabela: 'pages' | 'posts' | 'itensDePlano' | 'itensDeLote', id: string, linha: Record<string, unknown>) => {
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
  efeitos.chamadasDeSlot = 0
  efeitos.movimentos = 0
  efeitos.refilagens = []
  efeitos.derrubar = 0
  efeitos.sinaisReais = false
  efeitos.pastasReais = false
  banco.sinais.clear()
  banco.falharSinais = []
  banco.falharEscritaDoItemDoPlano = 0
  banco.falharPasta = 0
  banco.dbGlobalBloqueado = false
  efeitos.artesFalham = false
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
    expect(efeitos.chamadasDeSlot).toBe(4) // nenhum efeito refeito: os carimbos estavam gravados
    expect(efeitos.chamadasDeArtes).toBe(0) // o post do lote já nasce com a Generation da peça (C12-1x4)

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

describe('R12-04 — a conta pela transação READ ONLY é a decisão do serviço', () => {
  it('reprovação, peça superada, mídia já usada e post de outro item: o leitor somente leitura dá as MESMAS decisões da simulação, sem tocar o db global nem escrever', async () => {
    criarPeca(1, { itemDoPlano: { status: 'reprovado' } })
    criarPeca(2, { itemDoPlano: { status: 'pronto', generationId: 'gen-outra' } })
    banco.generations.set('gen-outra', { id: 'gen-outra', projectId: PROJETO, status: 'COMPLETED', resultUrl: `${BLOB}/outra.png`, createdAt: new Date('2026-09-12T10:00:00.000Z'), fieldValues: { pageId: 'page-outra' } })
    criarPeca(3)
    banco.posts.set('post-com-a-midia', { id: 'post-com-a-midia', projectId: PROJETO, pageId: null, status: 'DRAFT', postType: 'STORY', mediaUrls: [`${BLOB}/page-3-1757700000000.png`], createdAt: 0 })
    criarPeca(4)
    banco.posts.set('post-do-outro', { id: 'post-do-outro', projectId: PROJETO, pageId: 'page-4', status: 'DRAFT', postType: 'STORY', mediaUrls: [], createdAt: 0 })
    banco.itensDeLote.set('lote-outro', { id: 'lote-outro', projectId: PROJETO, loteId: LOTE, itemId: 'item-outro', generationId: null, postId: 'post-do-outro' })
    criarPeca(5)
    const itens = [1, 2, 3, 4, 5].map((n) => item(n))

    const pelaSimulacao = await agendar(itens, { simular: true })
    const antes = fotoDoBanco()
    const { leitorSomenteLeitura } = (await import('@/lib/db')) as unknown as { leitorSomenteLeitura: () => Record<string, unknown> }
    banco.dbGlobalBloqueado = true
    const peloLeitor = await agendar(itens, { simular: true, leitor: leitorSomenteLeitura() }).finally(() => {
      banco.dbGlobalBloqueado = false
    })
    expect(peloLeitor.itens.map((i) => i.desfecho ?? i.codigo)).toEqual(['PECA_SUPERADA_NO_PLANO', 'PECA_SUPERADA_NO_PLANO', 'PECA_JA_NA_AGENDA', 'POST_DE_OUTRO_ITEM', 'criado'])
    expect(peloLeitor.itens[1].arteAtualDoItem).toMatchObject({ generationId: 'gen-outra' })
    expect(peloLeitor).toEqual(pelaSimulacao)
    expect(fotoDoBanco()).toEqual(antes)
  })

  it('o leitor só vale em simulação: sem simular, a chamada é recusada antes de ler ou escrever', async () => {
    criarPeca(1)
    await expect(agendar([item(1)], { leitor: {} })).rejects.toMatchObject({ code: 'LEITOR_SO_EM_SIMULACAO' })
    expect(banco.posts.size).toBe(0)
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
    expect(efeitos.chamadasDeSlot).toBe(2) // a terceira não refaz nada
  })

  // R12-02: efeito que o banco derruba NÃO lança — a captura, a pasta e o catálogo engolem o erro. O carimbo tem de ficar nulo.
  it.each([
    ['slot:post:', 'o horário', {}],
    ['copy:post:', 'a copy', {}],
    ['legenda:post:', 'a legenda', { caption: 'Hoje tem happy hour.' }],
  ] as const)('R12-02: a captura REAL engole a queda do banco em "%s" — o carimbo fica nulo, o aviso diz o que faltou, e a repetição completa e carimba uma vez', async (prefixo, oQue, extra) => {
    efeitos.sinaisReais = true
    criarPeca(1)
    banco.falharSinais = [prefixo]
    const caiu = await agendar([item(1, extra)])
    const postId = caiu.itens[0].postId!
    expect(caiu.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(caiu.itens[0].avisos?.join(' ')).toContain(`parte do registro do agendamento não terminou (${oQue})`)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId, efeitosDoAgendamentoEm: null })
    expect(banco.sinais.has(`${prefixo}${postId}`)).toBe(false)
    // Os outros sinais do mesmo post gravaram: a falha é do efeito que caiu, não do post.
    expect(banco.sinais.size).toBe(Object.keys(extra).length > 0 ? 2 : 1)

    const repetida = await agendar([item(1, extra)])
    expect(repetida.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'reaproveitado', postId })
    expect(repetida.itens[0].avisos).toBeUndefined()
    expect(banco.posts.size).toBe(1)
    expect(banco.sinais.has(`${prefixo}${postId}`)).toBe(true)
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
    const chamadas = efeitos.chamadasDeSlot
    await agendar([item(1, extra)])
    expect(efeitos.chamadasDeSlot).toBe(chamadas) // carimbado: a terceira não refaz nada
  })

  it('R12-02: a refilagem REAL engole a queda do banco na pasta do dia — o carimbo fica nulo e a repetição leva a página', async () => {
    efeitos.pastasReais = true
    criarPeca(1)
    banco.pages.set('page-1', { ...banco.pages.get('page-1')!, name: 'Sex 11/09 · 19:00 · Tema 1', order: 0, Template: { id: 42, category: 'programacao', projectId: PROJETO } })
    banco.falharPasta = 1
    const caiu = await agendar([item(1, { quando: '2026-09-20 12:00' })])
    const postId = caiu.itens[0].postId!
    expect(caiu.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(caiu.itens[0].avisos?.join(' ')).toContain('não terminou (a página na pasta do dia)')
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId, efeitosDoAgendamentoEm: null })
    expect(banco.pages.get('page-1')!.name).toBe('Sex 11/09 · 19:00 · Tema 1')

    const repetida = await agendar([item(1, { quando: '2026-09-20 12:00' })])
    expect(repetida.itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId })
    expect(repetida.itens[0].avisos).toBeUndefined()
    expect(banco.pages.get('page-1')!.name).toContain('20/09 · 12:00')
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
    expect(banco.posts.size).toBe(1)
  })

  it('R12-02: a pasta da semana REAL engole a queda do banco ao mover a página das avulsas — o carimbo fica nulo e a repetição move', async () => {
    efeitos.pastasReais = true
    criarPeca(1)
    banco.pages.set('page-1', { ...banco.pages.get('page-1')!, name: 'Avulsa · Tema 1', order: 0, templateId: 77, Template: { id: 77, name: 'Avulsas · setembro', category: 'avulsas', projectId: PROJETO } })
    banco.falharPasta = 1
    const caiu = await agendar([item(1)])
    expect(caiu.itens[0].avisos?.join(' ')).toContain('não terminou (a pasta da semana)')
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeNull()
    expect(banco.pages.get('page-1')).toMatchObject({ templateId: 77 })

    const repetida = await agendar([item(1)])
    expect(repetida.itens[0].avisos).toBeUndefined()
    expect(banco.pages.get('page-1')).toMatchObject({ templateId: 42 })
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
  })

  it('R12-02: o catálogo das artes do post ADOTADO que não terminou deixa os efeitos pendentes', async () => {
    criarPeca(1)
    banco.posts.set('post-manual', { id: 'post-manual', projectId: PROJETO, pageId: 'page-1', templateId: 42, status: 'DRAFT', postType: 'STORY', scheduledDatetime: new Date('2026-09-11T22:00:00.000Z'), mediaUrls: [], renderStatus: 'PENDING', createdAt: 0, caption: '', sugestaoId: null, origem: null })
    efeitos.artesFalham = true
    const caiu = await agendar([item(1)])
    expect(caiu.itens[0]).toMatchObject({ desfecho: 'adotado', postId: 'post-manual' })
    expect(caiu.itens[0].avisos?.join(' ')).toContain('não terminou (as artes do post)')
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeNull()

    efeitos.artesFalham = false
    await agendar([item(1)])
    expect(efeitos.chamadasDeArtes).toBe(2)
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
  })

  it('R12-02: a reconciliação do item do plano que o banco derruba fica PENDENTE (antes virava aviso e o carimbo era gravado); a repetição leva o item a agendado', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    banco.posts.set('post-legado-1', { id: 'post-legado-1', projectId: PROJETO, pageId: 'page-1', templateId: 42, generationId: 'gen-1', status: 'DRAFT', postType: 'STORY', scheduledDatetime: new Date('2026-09-11T22:00:00.000Z'), mediaUrls: [], renderStatus: 'PENDING', createdAt: 0, caption: '' })
    const { hashDoAgendamento: hashDe, pedidoDoAgendamento: pedidoDe } = await import('../agendamento')
    const p = pedidoDe({ itemId: 'item-1' }, { quandoDaSpec: '2026-09-11 19:00', formato: 'story' })
    if (!('pedido' in p)) throw new Error('pedido')
    banco.itensDeLote.set('lote-1', { ...banco.itensDeLote.get('lote-1')!, postId: 'post-legado-1', hashDoAgendamento: hashDe(p.pedido), efeitosDoAgendamentoEm: null })
    banco.falharEscritaDoItemDoPlano = 1

    const caiu = await agendar([item(1)])
    expect(caiu.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'reaproveitado', postId: 'post-legado-1' })
    expect(caiu.itens[0].avisos?.join(' ')).toContain('não terminou')
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'pronto', postId: null })
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeNull()

    const repetida = await agendar([item(1)])
    expect(repetida.itens[0].avisos).toBeUndefined()
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'agendado', postId: 'post-legado-1' })
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
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
    // Post adotado SEM Generation continua sendo catalogado, como em agendarPost.
    expect(efeitos.chamadasDeArtes).toBe(1)
    expect((await agendar([item(1, { caption: 'Legenda do lote', campanhaId: 'camp-do-lote' })])).itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId: 'post-manual' })
  })

  it('R12-06: post ADOTADO já agendado (e já entregue para publicar) volta com o estado dele e nada muda nele; o criado é rascunho; a repetição depois de a equipe aprovar diz agendado', async () => {
    criarPeca(1)
    criarPeca(2)
    banco.posts.set('post-agendado', { id: 'post-agendado', projectId: PROJETO, pageId: 'page-1', templateId: 42, generationId: 'gen-1', status: 'SCHEDULED', postType: 'STORY', scheduledDatetime: new Date('2026-09-11T22:00:00.000Z'), mediaUrls: [`${BLOB}/page-1-1757700000000.png`], renderStatus: 'RENDERED', createdAt: 0, caption: '', sugestaoId: null, origem: null, campaignId: null, laterPostId: 'zernio-1' })
    const antes = structuredClone(banco.posts.get('post-agendado'))

    const simulada = await agendar([item(1), item(2)], { simular: true })
    expect(simulada.itens.map((i) => [i.desfecho, i.estadoDoPost, i.entregueParaPublicar])).toEqual([['adotado', 'agendado', true], ['criado', 'rascunho', undefined]])

    const r = await agendar([item(1), item(2)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'adotado', postId: 'post-agendado', estadoDoPost: 'agendado', entregueParaPublicar: true })
    expect(r.itens[1]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho' })
    expect(r.itens[1].entregueParaPublicar).toBeUndefined()
    expect(banco.posts.get('post-agendado')).toEqual(antes)

    // A equipe aprovou o rascunho do item 2: a repetição devolve o post como ele está, sem mexer nele.
    const id2 = r.itens[1].postId!
    banco.posts.set(id2, { ...banco.posts.get(id2)!, status: 'SCHEDULED' })
    const antes2 = structuredClone(banco.posts.get(id2))
    const repetida = await agendar([item(1), item(2)])
    expect(repetida.itens.map((i) => [i.desfecho, i.estadoDoPost])).toEqual([['reaproveitado', 'agendado'], ['reaproveitado', 'agendado']])
    expect(banco.posts.get('post-agendado')).toEqual(antes)
    expect(banco.posts.get(id2)).toEqual(antes2)
  })

  it('página já publicada não ganha segundo post', async () => {
    criarPeca(1)
    banco.posts.set('post-no-ar', { id: 'post-no-ar', projectId: PROJETO, pageId: 'page-1', status: 'POSTED', mediaUrls: [`${BLOB}/page-1-1757700000000.png`], createdAt: 0 })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PAGINA_JA_EM_POST', postId: 'post-no-ar' })
    expect(banco.posts.size).toBe(1)
  })

  it('post apagado da agenda (Ciro, 13/09/2026): não volta sozinho — o item avisa QUAL rascunho era; só a confirmação da pessoa o recria, com a mesma arte, e repetir a confirmação não cria outro', async () => {
    criarPeca(1)
    const r = await agendar([item(1)])
    const apagado = r.itens[0].postId!
    banco.posts.delete(apagado)

    const depois = await agendar([item(1)])
    expect(depois.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'POST_REMOVIDO', rascunhoApagado: { quando: '11/09/2026, 19:00', tema: 'Tema 1', manchete: 'Manchete 1' } })
    expect(depois.itens[0].motivo).toContain('pergunte')
    expect(banco.posts.size).toBe(0)
    // "true" em texto não é confirmação: falha só o item, nada é criado.
    expect((await agendar([item(1, { recriarRascunhoApagado: 'true' })])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PEDIDO_INVALIDO' })
    expect(banco.posts.size).toBe(0)

    const antes = fotoDoBanco()
    const simulada = await agendar([item(1, { recriarRascunhoApagado: true })], { simular: true })
    expect(simulada.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'recriado' })
    expect(fotoDoBanco()).toEqual(antes)

    const recriada = await agendar([item(1, { recriarRascunhoApagado: true })])
    expect(recriada.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'recriado', generationId: 'gen-1', pageId: 'page-1', quando: '11/09/2026, 19:00' })
    expect(recriada.itens[0].avisos).toEqual([expect.stringContaining('voltou para a agenda')])
    expect(recriada.itens[0].postId).not.toBe(apagado)
    expect(banco.posts.size).toBe(1)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: recriada.itens[0].postId })
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)

    const deNovo = await agendar([item(1, { recriarRascunhoApagado: true })])
    expect(deNovo.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'reaproveitado', postId: recriada.itens[0].postId })
    expect(banco.posts.size).toBe(1)
  })

  it('R12-05: rascunho apagado das 19h repetido com 21h — o horário da tentativa NÃO é apresentado como o do rascunho apagado', async () => {
    criarPeca(1)
    banco.posts.delete((await agendar([item(1)])).itens[0].postId!)
    for (const extra of [{}, { recriarRascunhoApagado: true }]) {
      const r = await agendar([item(1, { quando: '2026-09-11 21:00', ...extra })])
      expect(r.itens[0]).toMatchObject({ situacao: 'falhou', rascunhoApagado: { quando: null, tema: 'Tema 1', manchete: 'Manchete 1' } })
      expect(JSON.stringify(r.itens[0])).not.toContain('21:00')
    }
    // A repetição com o pedido original prova o horário.
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ codigo: 'POST_REMOVIDO', rascunhoApagado: { quando: '11/09/2026, 19:00' } })
    expect(banco.posts.size).toBe(0)
  })

  it('duas confirmações ao mesmo tempo: UM rascunho recriado, e as duas respostas apontam o mesmo post', async () => {
    criarPeca(1)
    banco.posts.delete((await agendar([item(1)])).itens[0].postId!)
    const [a, b] = await Promise.all([agendar([item(1, { recriarRascunhoApagado: true })]), agendar([item(1, { recriarRascunhoApagado: true })])])
    expect(banco.posts.size).toBe(1)
    expect(a.itens[0].postId).toBe(b.itens[0].postId)
    expect([a.itens[0].desfecho, b.itens[0].desfecho].sort()).toEqual(['reaproveitado', 'recriado'])
  })

  it('recriar é compare-and-set no post APAGADO: se a linha foi religada por outro caminho durante a recriação, tudo volta atrás e nenhum post órfão fica', async () => {
    criarPeca(1)
    banco.posts.delete((await agendar([item(1)])).itens[0].postId!)
    banco.aoCriarPostNaTransacao = () => {
      banco.aoCriarPostNaTransacao = null
      escreverPorFora('itensDeLote', 'lote-1', { ...banco.itensDeLote.get('lote-1')!, postId: 'post-de-fora' })
    }
    const r = await agendar([item(1, { recriarRascunhoApagado: true })])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'LOTE_AGENDAMENTO_CONCORRENTE' })
    expect(banco.posts.size).toBe(0)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: 'post-de-fora' })
  })

  it('confirmação com OUTRO pedido não recria: o rascunho apagado só volta com o pedido original', async () => {
    criarPeca(1)
    banco.posts.delete((await agendar([item(1)])).itens[0].postId!)
    const r = await agendar([item(1, { recriarRascunhoApagado: true, quando: '2026-09-11 21:00' })])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'LOTE_AGENDAMENTO_CONFLITO' })
    expect(r.itens[0].motivo).toContain('pedido original')
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

  it('recriando o rascunho apagado de peça com item do plano (Ciro, 13/09/2026): o item continua agendado e passa a apontar o recriado, no mesmo commit', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    const apagado = (await agendar([item(1)])).itens[0].postId!
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'agendado', postId: apagado })
    banco.posts.delete(apagado)
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'POST_REMOVIDO' })

    const recriada = await agendar([item(1, { recriarRascunhoApagado: true })])
    expect(recriada.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'recriado' })
    expect(recriada.itens[0].avisos).toEqual([expect.stringContaining('voltou para a agenda')])
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'agendado', postId: recriada.itens[0].postId, generationId: 'gen-1' })
    expect(banco.posts.size).toBe(1)
  })

  it('peça superada no plano (Ciro, 13/09/2026): com arte mais recente no item, a falha traz arteAtualDoItem e manda perguntar — e simular diz o mesmo', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto', generationId: 'gen-nova', pageId: 'page-nova' } })
    banco.generations.set('gen-nova', { id: 'gen-nova', projectId: PROJETO, status: 'COMPLETED', resultUrl: `${BLOB}/nova.png`, createdAt: new Date('2026-09-12T13:00:00.000Z'), slideOrder: null, fieldValues: {} })
    for (const simular of [true, false]) {
      const r = await agendar([item(1)], { simular })
      expect(r.itens[0]).toMatchObject({
        situacao: 'falhou',
        codigo: 'PECA_SUPERADA_NO_PLANO',
        arteAtualDoItem: { generationId: 'gen-nova', pageId: 'page-nova', feitaEm: '2026-09-12T13:00:00.000Z', feitaEmBrasilia: '12/09/2026, 10:00', situacao: 'pronta' },
      })
      expect(r.itens[0].motivo).toContain('pergunte')
    }
    expect(banco.posts.size).toBe(0)
  })

  it('item do plano apagado: ITEM_DO_PLANO_AUSENTE, sem post', async () => {
    criarPeca(1, { itemDoPlano: 'ausente' })
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'ITEM_DO_PLANO_AUSENTE' })
    expect(banco.posts.size).toBe(0)
  })

  it('C12-1x2: o item vai a agendado NO MESMO commit — a invocação que morre antes dos efeitos já deixa o item agendado com o post', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    efeitos.derrubar = 1
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(r.itens[0].avisos?.join()).toContain('não terminou')
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: r.itens[0].postId, efeitosDoAgendamentoEm: null })
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'agendado', postId: r.itens[0].postId, pageId: 'page-1' })
    // Nenhuma leitura do item fora da transação foi preciso para levá-lo a agendado.
    expect(banco.leiturasDoItemDoPlano).toBe(1)
  })

  it('C12-1x2: se o compare-and-set do item não pega DENTRO da transação, o post e o vínculo voltam atrás e o item recusa', async () => {
    criarPeca(1, { itemDoPlano: { status: 'pronto' } })
    // Outro escritor (que não respeita a trava) reprova o item enquanto o post é criado.
    banco.aoCriarPostNaTransacao = () => {
      banco.aoCriarPostNaTransacao = null
      escreverPorFora('itensDePlano', 'plano-item-1', { ...banco.itensDePlano.get('plano-item-1')!, status: 'reprovado', updatedAt: new Date('2026-09-12T15:00:00.000Z') })
    }
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'PECA_SUPERADA_NO_PLANO' })
    expect(banco.posts.size).toBe(0)
    expect(banco.itensDeLote.get('lote-1')).toMatchObject({ postId: null, hashDoAgendamento: null })
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'reprovado', postId: null })
    expect(efeitos.chamadasDeSlot).toBe(0)
  })

  it('reconciliação de linha ligada ANTES do commit único: efeitos pendentes levam o item pronto a agendado; se ele mudar no meio, o compare-and-set recusa e avisa', async () => {
    const ligarLegado = (n: number) => {
      criarPeca(n, { itemDoPlano: { status: 'pronto' } })
      banco.posts.set(`post-legado-${n}`, { id: `post-legado-${n}`, projectId: PROJETO, pageId: `page-${n}`, templateId: 42, generationId: `gen-${n}`, status: 'DRAFT', postType: 'STORY', scheduledDatetime: new Date(`2026-09-1${n}T22:00:00.000Z`), mediaUrls: [], renderStatus: 'PENDING', createdAt: 0, caption: '' })
    }
    ligarLegado(1)
    ligarLegado(2)
    // As linhas nascem ligadas pelo pedido de hoje, com os efeitos pendentes.
    for (const n of [1, 2]) {
      const simulada = await agendar([item(n)], { simular: true })
      expect(simulada.itens[0]).toMatchObject({ desfecho: 'adotado' })
    }
    const { hashDoAgendamento: hashDe, pedidoDoAgendamento: pedidoDe } = await import('../agendamento')
    for (const n of [1, 2]) {
      const p = pedidoDe({ itemId: `item-${n}` }, { quandoDaSpec: `2026-09-1${n} 19:00`, formato: 'story' })
      if (!('pedido' in p)) throw new Error('pedido')
      banco.itensDeLote.set(`lote-${n}`, { ...banco.itensDeLote.get(`lote-${n}`)!, postId: `post-legado-${n}`, hashDoAgendamento: hashDe(p.pedido), efeitosDoAgendamentoEm: null })
    }

    expect((await agendar([item(1)])).itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId: 'post-legado-1' })
    expect(banco.itensDePlano.get('plano-item-1')).toMatchObject({ status: 'agendado', postId: 'post-legado-1' })

    // Na linha 2 a pessoa reprova logo depois da leitura da reconciliação.
    banco.leiturasDoItemDoPlano = 0
    banco.aoLerItemDoPlano = { depoisDaLeitura: 1, fazer: () => banco.itensDePlano.set('plano-item-2', { ...banco.itensDePlano.get('plano-item-2')!, status: 'reprovado', updatedAt: new Date('2026-09-12T15:00:00.000Z') }) }
    const r = await agendar([item(2)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'reaproveitado' })
    expect(r.itens[0].avisos?.join()).toContain('mudou enquanto')
    expect(banco.itensDePlano.get('plano-item-2')).toMatchObject({ status: 'reprovado', postId: null })
  })

  it.each(['na-fila', 'gerando'])('C12-1x1: item "%s" que já aponta ESTA peça pronta é PENDENTE, sem escrever nada', async (status) => {
    criarPeca(1, { itemDoPlano: { status } })
    const antes = fotoDoBanco()
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'pendente', codigo: 'ITEM_DO_PLANO_EM_VOO' })
    expect(r.resumo).toEqual({ concluidos: 0, pendentes: 1, falhas: 0 })
    expect(fotoDoBanco()).toEqual(antes)
  })

  it('C12-1x4: repetição com efeitos pendentes depois de o cron renderizar o post não cataloga o PNG do render como arte nova', async () => {
    criarPeca(1)
    efeitos.derrubar = 1
    const caiu = await agendar([item(1)])
    const id = caiu.itens[0].postId!
    // O cron render-stories desenhou o post: a mídia virou o PNG dele, sem Generation.
    banco.posts.set(id, { ...banco.posts.get(id)!, renderStatus: 'RENDERED', mediaUrls: [`${BLOB}/${id}-1757700099999.png`] })
    const repetida = await agendar([item(1)])
    expect(repetida.itens[0]).toMatchObject({ desfecho: 'reaproveitado', postId: id })
    expect(efeitos.chamadasDeArtes).toBe(0)
    expect(banco.itensDeLote.get('lote-1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
  })

  it('C12-1x3: campo inválido num item que JÁ tem rascunho devolve o postId e não diz que nada está na agenda; sem rascunho, diz que nada foi alterado', async () => {
    criarPeca(1)
    criarPeca(2)
    const primeira = await agendar([item(1)])
    const r = await agendar([item(1, { quando: '' }), item(2, { caption: 'x'.repeat(2201) })])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'DATA_INVALIDA', postId: primeira.itens[0].postId })
    expect(r.itens[0].motivo).toContain('continua na agenda')
    expect(r.itens[0].motivo).not.toContain('Nada foi agendado')
    expect(r.itens[1]).toMatchObject({ situacao: 'falhou', codigo: 'PEDIDO_INVALIDO' })
    expect(r.itens[1].postId).toBeUndefined()
    expect(r.itens[1].motivo).toContain('Nada foi alterado')
    expect(banco.posts.size).toBe(1)
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

  it('a linha passou a apontar OUTRA peça (mesma página) enquanto esperava: LOTE_AGENDAMENTO_CONCORRENTE e nenhum post', async () => {
    criarPeca(1)
    banco.aoTravar = () => {
      const g = structuredClone(banco.generations.get('gen-1')!)
      banco.generations.set('gen-9', { ...g, id: 'gen-9' })
      banco.foraDaTransacao.push(() => banco.generations.set('gen-9', { ...g, id: 'gen-9' }))
      escreverPorFora('itensDeLote', 'lote-1', { ...banco.itensDeLote.get('lote-1')!, generationId: 'gen-9' })
    }
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'LOTE_AGENDAMENTO_CONCORRENTE', generationId: 'gen-9' })
    expect(banco.posts.size).toBe(0)
  })

  it('o pedido e a entrada do post saem da peça RELIDA sob a trava: o horário previsto mudou enquanto esperava', async () => {
    criarPeca(1)
    banco.aoTravar = () => {
      const g = banco.generations.get('gen-1')! as { fieldValues: { spec: Record<string, unknown> } }
      g.fieldValues.spec.quando = '2026-09-18 21:00'
    }
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado' })
    expect(postsDaPagina(1)[0].scheduledDatetime).toEqual(new Date('2026-09-19T00:00:00.000Z'))
    const { hashDoAgendamento: hashDe, pedidoDoAgendamento: pedidoDe } = await import('../agendamento')
    const p = pedidoDe({ itemId: 'item-1' }, { quandoDaSpec: '2026-09-18 21:00', formato: 'story' })
    if (!('pedido' in p)) throw new Error('pedido')
    expect(banco.itensDeLote.get('lote-1')!.hashDoAgendamento).toBe(hashDe(p.pedido))
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

  it.each([
    ['a largura', { width: 1000 }],
    ['a altura', { height: 1800 }],
    ['o fundo', { background: '#1a1a1a' }],
  ])('R12-01 — o PATCH mudou só %s da página (camadas e thumbnail iguais): o rascunho nasce PENDING, sem o PNG velho, e simular diz o mesmo', async (_campo, mudanca) => {
    criarPeca(1)
    banco.pages.set('page-1', { ...banco.pages.get('page-1')!, ...mudanca })
    expect((await agendar([item(1)], { simular: true })).itens[0]).toMatchObject({ renderStatus: 'PENDING', imagem: null })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', renderStatus: 'PENDING', imagem: null })
    const [post] = postsDaPagina(1)
    expect(post).toMatchObject({ renderStatus: 'PENDING', mediaUrls: [], pageId: 'page-1' })
    expect(post.nextRenderAt).toBeInstanceOf(Date)
  })

  it('R12-01, controle: a versão visual INTEIRA igual à registrada junto do PNG (fundo inclusive) reaproveita o PNG', async () => {
    criarPeca(1)
    const pagina = banco.pages.get('page-1')!
    banco.pages.set('page-1', { ...pagina, background: '#1a1a1a' })
    const g = banco.generations.get('gen-1')! as { fieldValues: Record<string, unknown> }
    g.fieldValues.versaoRenderizada = versaoDaPagina({ width: 1080, height: 1920, background: '#1a1a1a', layers: pagina.layers })
    const r = await agendar([item(1)])
    expect(r.itens[0]).toMatchObject({ renderStatus: 'RENDERED', imagem: pagina.thumbnail })
    expect(postsDaPagina(1)[0]).toMatchObject({ renderStatus: 'RENDERED', mediaUrls: [pagina.thumbnail] })
  })

  it('R12-01: arte SEM o registro da versão (renderizada antes dele) não prova que o PNG é o da página — PENDING', async () => {
    criarPeca(1)
    const g = banco.generations.get('gen-1')! as { fieldValues: Record<string, unknown> }
    delete g.fieldValues.versaoRenderizada
    expect((await agendar([item(1)])).itens[0]).toMatchObject({ renderStatus: 'PENDING', imagem: null })
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
    expect(efeitos.chamadasDeArtes).toBe(1) // o padrão de efeitosDoAgendamento continua registrando as artes
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
    expect(efeitos.chamadasDeArtes + efeitos.chamadasDeSlot + efeitos.movimentos + efeitos.refilagens.length).toBe(0)

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
