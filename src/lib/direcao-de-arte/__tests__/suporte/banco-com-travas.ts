/**
 * CP5e § 3.1 — o BANCO FALSO COM TRAVAS dos pilotos de autonomia, extraído do harness do CP5d
 * (`creatives/__tests__/ajustar-arte-gate.test.ts`) SEM mudar o que ele prova: fila por chave (quem pede a chave que outra
 * transação segura espera ela soltar, no fim da transação); `FOR UPDATE` devolve a linha DEPOIS da trava (quem segurava
 * pode ter escrito); toda escrita em Page move o `@updatedAt` como o Prisma; rollback só do que a transação escreveu;
 * timeout `P2028`; deadlock injetado (`40P01`); eventos ordenados com carimbo de relógio; escritores de fora
 * (`escreverFora`, `segurarFora`, `segurarVarias`, `segurarChave`); `reset()` por teste.
 *
 * O que ele NÃO prova (dito aqui e nos testes): a semântica REAL das travas e do SQL no Postgres (`FOR UPDATE`, advisory
 * locks, `P2028`), a persistência e o render no Blob, a autorização MCP e o comportamento do chat.
 */
export type Linha = Record<string, any>
export type Tabela = 'pages' | 'generations' | 'posts' | 'projects' | 'customFonts' | 'itensDeLote' | 'itensDePlano'

export function criarBancoComTravas() {
const banco = {
  pages: new Map<string, Linha>(),
  generations: new Map<string, Linha>(),
  posts: new Map<string, Linha>(),
  projects: new Map<string, Linha>(),
  customFonts: new Map<string, Linha>(),
  itensDeLote: new Map<string, Linha>(),
  itensDePlano: new Map<string, Linha>(),
  filas: new Map<string, Promise<void>>(),
  eventos: [] as Array<{ e: string; t: number }>,
  seq: 0,
  timeoutDaTransacao: null as number | null,
  deadlockEm: null as string | null,
  falharGravacao: false,
  aoTravarAgenda: null as null | (() => void | Promise<void>),
  aoRollback: null as null | (() => void),
}
  const evento = (e: string) => banco.eventos.push({ e, t: Date.now() })
  const valor = (v: unknown) => (v === undefined ? null : v)
  const porCaminho = (v: unknown, caminho: string[]) => caminho.reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Linha)[k] : undefined), v)
  const casa = (linha: Linha, where: Linha = {}): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (k === 'OR') return (cond as Linha[]).some((w) => casa(linha, w))
      if (k === 'AND') return (cond as Linha[]).every((w) => casa(linha, w))
      if (k === 'NOT') return !casa(linha, cond as Linha)
      const atual = valor(linha[k])
      if (cond instanceof Date) return atual instanceof Date && atual.getTime() === cond.getTime()
      if (cond && typeof cond === 'object') {
        const c = cond as Linha
        if ('path' in c) return valor(porCaminho(atual, c.path as string[])) === valor(c.equals)
        if ('has' in c) return Array.isArray(atual) && atual.includes(c.has)
        if ('in' in c) return (c.in as unknown[]).includes(atual)
        if ('not' in c) return atual !== null && atual !== c.not
        if ('gte' in c || 'lte' in c) return true
        return true
      }
      return atual === valor(cond)
    })
  const projetar = (linha: Linha, select?: Linha) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, linha[k] ?? null])) : linha)
  interface Tx {
    travas: Map<string, () => void>
    escritas: Array<[Tabela, string, Linha | undefined]>
    espera: number
    fechada: boolean
  }
  // Como o `@updatedAt` do Prisma: TODA escrita em Page (camadas, miniatura, nome…) move o carimbo — inclusive a do render
  // condicionado de outra chamada, que grava só a miniatura (Codex R3).
  const gravar = (tabela: Tabela, id: string, linha: Linha, tx: Tx | null) => {
    if (tx) tx.escritas.push([tabela, id, banco[tabela].get(id)])
    banco[tabela].set(id, tabela === 'pages' ? { ...linha, updatedAt: new Date(Date.parse('2026-10-17T00:00:00Z') + ++banco.seq) } : linha)
    evento(`escrita:${tabela}:${id}`)
  }
  const travar = async (chave: string, tx: Tx, modo: 'update' | 'share') => {
    if (tx.travas.has(chave)) return
    const anterior = banco.filas.get(chave) ?? Promise.resolve()
    let soltar!: () => void
    const minha = new Promise<void>((r) => (soltar = r))
    banco.filas.set(chave, anterior.then(() => minha))
    const inicio = Date.now()
    await anterior
    tx.espera += Date.now() - inicio
    tx.travas.set(chave, soltar)
    evento(`${modo === 'share' ? 'trava-share' : 'trava'}:${chave}`)
  }
  const fechada = () => Object.assign(new Error('Transaction already closed'), { code: 'P2028' })
  const tabela = (nome: Tabela, tx: Tx | null) => {
    const vivos = () => {
      if (tx?.fechada) throw fechada()
      return [...banco[nome].values()]
    }
    return {
      findUnique: async ({ where, select }: { where: Linha; select?: Linha; include?: Linha }) => {
        const l = where.id !== undefined ? banco[nome].get(String(where.id)) : vivos().find((x) => casa(x, where))
        return l ? projetar(l, select) : null
      },
      findFirst: async ({ where, select, orderBy }: { where?: Linha; select?: Linha; orderBy?: Linha }) => {
        const todos = vivos().filter((x) => casa(x, where))
        if (orderBy?.createdAt === 'desc') todos.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
        const l = todos[0]
        return l ? projetar(l, select) : null
      },
      findMany: async ({ where, select, take, orderBy }: { where?: Linha; select?: Linha; take?: number; orderBy?: Linha } = {}) => {
        const todos = vivos().filter((l) => casa(l, where))
        todos.sort((a, b) => (orderBy?.createdAt === 'desc' ? Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) : Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)))
        return todos.slice(0, take ?? Infinity).map((l) => projetar(l, select))
      },
      create: async ({ data, select }: { data: Linha; select?: Linha }) => {
        if (tx?.fechada) throw fechada()
        const id = String(data.id ?? `${nome}-${++banco.seq}`)
        const linha = { id, createdAt: ++banco.seq, ...data }
        gravar(nome, id, linha, tx)
        if (nome === 'generations') evento(`insert:generation:${id}:${data.status}`)
        return projetar(linha, select)
      },
      update: async ({ where, data, select }: { where: { id: string }; data: Linha; select?: Linha }) => {
        const atual = banco[nome].get(where.id)
        if (!atual) throw new Error(`${nome} ${where.id} não existe`)
        const linha = { ...atual, ...data }
        gravar(nome, where.id, linha, tx)
        return projetar(linha, select)
      },
      updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
        let count = 0
        for (const l of vivos()) {
          if (!casa(l, where)) continue
          gravar(nome, l.id, { ...l, ...data }, tx)
          count++
        }
        return { count }
      },
    }
  }
  const delegados = (tx: Tx | null) => ({
    project: tabela('projects', tx),
    customFont: tabela('customFonts', tx),
    page: tabela('pages', tx),
    generation: tabela('generations', tx),
    generationJob: { findUnique: async () => null },
    socialPost: tabela('posts', tx),
    itemDeLote: tabela('itensDeLote', tx),
    itemDePlano: tabela('itensDePlano', tx),
    knowledgeBaseEntry: { findFirst: async () => null },
    learningSignal: { upsert: async () => ({ id: 'sinal' }), findFirst: async () => null, findMany: async () => [] },
  })
  const MAPA: Record<string, Tabela> = { ItemDeLote: 'itensDeLote', ItemDePlano: 'itensDePlano', Page: 'pages', Generation: 'generations', Project: 'projects' }
  const idsDe = (v: unknown): string[] => (v && typeof v === 'object' && 'values' in (v as object) ? ((v as { values: unknown[] }).values as string[]) : [String(v)])
  const queryRaw = (tx: Tx) => async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    if (tx.fechada) throw fechada()
    const sql = partes.join('?')
    const nomeDaTabela = /FROM "(\w+)"/.exec(sql)?.[1] ?? ''
    if (banco.deadlockEm && nomeDaTabela === banco.deadlockEm) {
      banco.deadlockEm = null
      throw Object.assign(new Error('deadlock detected'), { code: 'P2010', meta: { code: '40P01' } })
    }
    if (sql.includes('pg_advisory_xact_lock')) {
      const chave = String(valores[0])
      await travar(`adv:${chave}`, tx, 'update')
      if (chave.startsWith('agenda-slot:') && banco.aoTravarAgenda) {
        const gancho = banco.aoTravarAgenda
        banco.aoTravarAgenda = null
        await gancho()
      }
      return [{ ok: 1 }]
    }
    const modo = sql.includes('FOR SHARE') ? 'share' : 'update'
    if (nomeDaTabela === 'SocialPost') {
      const escolhidos = [...banco.posts.values()].filter((p) => p.pageId === valores[0]).sort((a, b) => String(a.id).localeCompare(String(b.id)))
      for (const p of escolhidos) await travar(`posts:${p.id}`, tx, modo)
      evento(`travou-posts-da-pagina:${escolhidos.map((p) => p.id).join(',')}`)
      // Como no Postgres: `FOR UPDATE` devolve a versão da linha DEPOIS de obter a trava (quem segurava pode ter escrito).
      const posts = escolhidos.map((p) => banco.posts.get(p.id)!)
      return posts.map((p) => ({ id: p.id, status: p.status, laterPostId: p.laterPostId ?? null, postType: p.postType, generationId: p.generationId ?? null, projectId: p.projectId, pageId: p.pageId }))
    }
    if (nomeDaTabela === 'CustomFont') {
      for (const f of [...banco.customFonts.values()].filter((f) => f.projectId === valores[0])) await travar(`customFonts:${f.id}`, tx, modo)
      evento('travou-fontes')
      return []
    }
    const t = MAPA[nomeDaTabela]
    if (!t) throw new Error(`SQL inesperado no banco falso: ${sql.slice(0, 80)}`)
    const ids = sql.includes(' IN (') ? idsDe(valores[0]) : [String(valores[0])]
    for (const id of [...ids].sort()) await travar(`${t}:${id}`, tx, modo)
    if (t === 'generations' && ids.length > 1) evento(`travou-generations:${[...ids].sort().join(',')}`)
    return ids.map((id) => ({ id }))
  }
  const executeRaw = (tx: Tx | null) => async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    if (tx?.fechada) throw fechada()
    const sql = partes.join('?')
    if (!sql.startsWith('UPDATE "Generation"')) throw new Error(`SQL inesperado no banco falso: ${sql.slice(0, 80)}`)
    // fecharGenerationComoFalha: UMA instrução condicionada a PROCESSING.
    if (sql.includes(`SET "status" = 'FAILED'`)) {
      const [patch, id] = valores as [string, string]
      const g = banco.generations.get(id)
      if (!g || g.status !== 'PROCESSING') return 0
      gravar('generations', id, { ...g, status: 'FAILED', completedAt: new Date(), fieldValues: { ...g.fieldValues, ...JSON.parse(patch) } }, tx)
      evento(`fechou:FAILED:${id}`)
      return 1
    }
    if (banco.falharGravacao && sql.includes('EXISTS')) {
      banco.falharGravacao = false
      throw new Error('connection reset')
    }
    const [patch, id, projectId, pageId] = valores as [string, string, number?, string?]
    const g = banco.generations.get(id)
    if (!g) return 0
    if (sql.includes('EXISTS')) {
      const pagina = banco.pages.get(String(pageId))
      if (g.projectId !== projectId || g.fieldValues?.pageId !== pageId || !pagina || pagina.Template?.projectId !== projectId) return 0
      gravar('generations', id, { ...g, fieldValues: { ...g.fieldValues, ...JSON.parse(patch) } }, tx)
      evento(`gate:gravado:${id}`)
      return 1
    }
    gravar('generations', id, { ...g, fieldValues: { ...g.fieldValues, ...JSON.parse(patch) } }, tx)
    evento(`merge:${id}:${Object.keys(JSON.parse(patch)).join(',')}`)
    return 1
  }
  const $transaction = async (fn: unknown, opcoes?: { timeout?: number }) => {
    if (typeof fn !== 'function') return Promise.all(fn as unknown[])
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    const cliente = { ...delegados(tx), $queryRaw: queryRaw(tx), $executeRaw: executeRaw(tx), __tx: true }
    const prazo = banco.timeoutDaTransacao ?? opcoes?.timeout ?? 20_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const estouro = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        tx.fechada = true
        reject(fechada())
      }, prazo)
    })
    evento('tx:inicio')
    try {
      const r = await Promise.race([(fn as (tx: unknown) => Promise<unknown>)(cliente), estouro])
      evento(`espera:${tx.espera}`)
      evento('commit')
      return r
    } catch (erro) {
      for (const [t, id, antes] of [...tx.escritas].reverse()) {
        if (antes === undefined) banco[t].delete(id)
        else banco[t].set(id, antes)
      }
      evento('rollback')
      const gancho = banco.aoRollback
      banco.aoRollback = null
      gancho?.()
      throw erro
    } finally {
      clearTimeout(timer)
      for (const soltar of tx.travas.values()) soltar()
    }
  }
  const escreverFora = async (t: Tabela, id: string, mutar: (l: Linha) => Linha) => {
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    evento(`fora:quer:${t}:${id}`)
    await travar(`${t}:${id}`, tx, 'update')
    gravar(t, id, mutar(banco[t].get(id)!), null)
    for (const soltar of tx.travas.values()) soltar()
  }
  const segurarFora = async (t: Tabela, id: string, ms: number, mutar?: (l: Linha) => Linha) => {
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    await travar(`${t}:${id}`, tx, 'update')
    evento(`fora:segura:${t}:${id}`)
    await new Promise((r) => setTimeout(r, ms))
    if (mutar) gravar(t, id, mutar(banco[t].get(id)!), null)
    evento(`fora:solta:${t}:${id}`)
    for (const soltar of tx.travas.values()) soltar()
  }
  /** Outra transação segurando VÁRIAS linhas, adquiridas nesta ordem (o render condicionado: Page → Generation), por `ms`. */
  const segurarVarias = async (linhas: Array<[Tabela, string]>, ms: number, mutar?: Partial<Record<Tabela, (l: Linha) => Linha>>) => {
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    for (const [t, id] of linhas) {
      await travar(`${t}:${id}`, tx, 'update')
      evento(`fora:segura:${t}:${id}`)
    }
    await new Promise((r) => setTimeout(r, ms))
    for (const [t, id] of linhas) if (mutar?.[t]) gravar(t, id, mutar[t]!(banco[t].get(id)!), null)
    for (const [t, id] of linhas) evento(`fora:solta:${t}:${id}`)
    for (const soltar of tx.travas.values()) soltar()
  }
  /** Outra conexão segurando uma trava CONSULTIVA (a rota de fontes, o agendar-leva) por `ms`. */
  const segurarChave = async (chave: string, ms: number) => {
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    await travar(`adv:${chave}`, tx, 'update')
    evento(`fora:segura:adv:${chave}`)
    await new Promise((r) => setTimeout(r, ms))
    evento(`fora:solta:adv:${chave}`)
    for (const soltar of tx.travas.values()) soltar()
  }
  const reset = () => {
    for (const t of ['pages', 'generations', 'posts', 'projects', 'customFonts', 'itensDeLote', 'itensDePlano'] as const) banco[t].clear()
    banco.filas.clear()
    banco.eventos = []
    banco.seq = 0
    banco.timeoutDaTransacao = null
    banco.deadlockEm = null
    banco.falharGravacao = false
    banco.aoTravarAgenda = null
    banco.aoRollback = null
  }
  const db = { ...delegados(null), $transaction, $executeRaw: executeRaw(null), $queryRaw: async () => [] }
  return { banco, db, escreverFora, segurarFora, segurarVarias, segurarChave, reset }
}

export type BancoComTravas = ReturnType<typeof criarBancoComTravas>
