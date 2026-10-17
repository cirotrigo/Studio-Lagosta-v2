/**
 * CP5d — o GATE do perfil draft-only em `ajustarArte` (`docs/PLANO-2026-10-17-CP5D-CONTRATO.md`, § 9: A1–A18).
 *
 * O banco falso é o do CP5c (`lotes/__tests__/agendar-itens-gate.test.ts`): travas de linha por chave, fila por
 * trava, rollback só do que a transação escreveu, timeout `P2028`, deadlock injetado, eventos ordenados com carimbo.
 * O executor do CP4 é trocável (`aceita` = o puro `aplicarAjustes`; `recusa-tudo`); a medição do gate é trocável
 * (`limpa`, `reprovada`, `lenta`); o render é trocável (`ok` fecha a Generation PROCESSING; `falha`; `pagina-mudou`).
 * `recompor.ts` (alvo e trava da recomposição) é o REAL — é a equivalência dele que A17 prova. A medição REAL sobre a
 * fixture está em `direcao-de-arte/__tests__/piloto-ciclo.test.ts` (P11); aqui, a TRANSAÇÃO.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Linha = Record<string, any>
type Tabela = 'pages' | 'generations' | 'posts' | 'projects' | 'customFonts' | 'itensDeLote' | 'itensDePlano'

const banco = vi.hoisted(() => ({
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
}))
const medicao = vi.hoisted(() => ({
  modo: 'limpa' as 'limpa' | 'reprovada' | 'lenta',
  chamadas: [] as Array<{ naTransacao: boolean; camadas: unknown[]; composicaoReaproveitavel: boolean | undefined; generationDaPeca: string | null | undefined; assinaturaDaOrigem: string | null; nomeDaPagina: string; formato: string }>,
  durante: null as null | (() => void | Promise<void>),
}))
const cp4 = vi.hoisted(() => ({ modo: 'aceita' as 'aceita' | 'recusa-tudo' | 'nao-medido' | 'ocultado' }))
const render = vi.hoisted(() => ({ modo: 'ok' as 'ok' | 'falha' | 'pagina-mudou', chamadas: [] as Array<{ generationId?: string; versaoEsperada?: string }> }))
const espioes = vi.hoisted(() => ({ invalidar: vi.fn(async () => ({ invalidados: 0, congelados: [] as string[] })) }))

vi.mock('@/lib/db', () => {
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
  const gravar = (tabela: Tabela, id: string, linha: Linha, tx: Tx | null) => {
    if (tx) tx.escritas.push([tabela, id, banco[tabela].get(id)])
    banco[tabela].set(id, linha)
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
          gravar(nome, l.id, { ...l, ...data, ...(nome === 'pages' ? { updatedAt: new Date(Date.parse('2026-10-17T00:00:00Z') + ++banco.seq) } : {}) }, tx)
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
  return { db: { ...delegados(null), $transaction, $executeRaw: executeRaw(null), $queryRaw: async () => [] }, escreverFora, segurarFora, segurarVarias, segurarChave }
})

vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (c: string) => ({ url: `https://blob.test/${c}` })), del: vi.fn(async () => undefined) }))
vi.mock('@/lib/canvas-renderer', () => ({ CanvasRenderer: class { async renderDesign() { return Buffer.from('png-falso') } } }))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: async () => undefined, fetchBuffer: async () => { throw new Error('sem rede') }, familiasNaoCarregadas: async () => new Set<string>() }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextMeasurer: async () => () => 100, createServerTextBoxMeasurer: async () => () => ({ width: 100, height: 100, maxLineWidth: 100, lineCount: 1 }) }))
vi.mock('@/lib/creatives/text-autofix', () => ({ aplicarAutofixOuFalhar: async (a: { layers: unknown[] }) => ({ layers: a.layers, autocorrecao: { necessaria: false, aplicada: false, iteracoes: 0, ajustes: [], pendencias: [] }, avisos: [] }) }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: (...a: unknown[]) => espioes.invalidar(...(a as [])) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null), registrarSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ fecharDicaDeCopyDaPagina: async () => ({ estado: 'sem-plano' }), caiNaEscolhaPropria: () => false }))
// O executor do CP4: o puro `aplicarAjustes` (aceita o estrutural) ou "recusa tudo" (a piora).
vi.mock('@/lib/creatives/revisao/ajustar-sem-piorar', async () => {
  const { aplicarAjustes } = await import('@/lib/creatives/revisao/aplicar-ajustes')
  const vazio = { achados: 0, problemas: 0, naoAvaliadas: [] as string[] }
  return {
    aplicarAjustesSemPiorar: async (a: { page: { width: number; height: number }; camadas: unknown[]; ajustes: Array<{ tipo: string; achado?: string }>; medir: unknown }) => {
      if (cp4.modo !== 'aceita') {
        const codigo = cp4.modo === 'recusa-tudo' ? 'AJUSTE_PIOROU_ARTE' : cp4.modo === 'nao-medido' ? 'AJUSTE_NAO_MEDIDO' : 'CONTEUDO_NAO_PODE_SER_OCULTADO'
        return { camadas: a.camadas, aplicados: [], recusados: a.ajustes.map((aj, indice) => ({ indice, tipo: aj.tipo, codigo, motivo: `recusa do CP4 (${codigo})` })), alteradas: [] }
      }
      return { ...aplicarAjustes(a.camadas as never, a.ajustes as never, { canvas: { width: a.page.width, height: a.page.height }, medir: a.medir as never }), medidas: { antes: vazio, depois: vazio } }
    },
  }
})
// recompor.ts é REAL (alvo e trava da recomposição); só a recomposição congelada do fluxo humano é desligada.
vi.mock('@/lib/compositor/recompor', async (original) => ({ ...(await original<typeof import('@/lib/compositor/recompor')>()), pedirRecomposicaoDaArteCongelada: vi.fn(async () => null) }))
// O render: fecha a Generation PROCESSING (ok), lança (falha) ou descarta a versão (pagina-mudou).
vi.mock('@/lib/creatives/persist', async (original) => {
  const real = await original<typeof import('@/lib/creatives/persist')>()
  const { CreativeError } = await import('@/lib/creatives/errors')
  return {
    ...real,
    getPublicAppUrl: () => 'https://studio.test',
    resolveImageUrl: async () => ({ url: null }),
    renderPageAndRegister: async (input: { page: { id: string; name: string; width: number; height: number }; generationId?: string | null; versaoEsperada?: string; fieldValues: Record<string, unknown>; templateId: number; templateName: string }) => {
      render.chamadas.push({ generationId: input.generationId ?? undefined, versaoEsperada: input.versaoEsperada })
      if (render.modo === 'falha') throw new Error('o Blob caiu')
      if (render.modo === 'pagina-mudou') throw new CreativeError('PAGINA_MUDOU_DURANTE', 'A página mudou enquanto a arte era renderizada', 409, { pageId: input.page.id })
      const { db } = (await import('@/lib/db')) as unknown as { db: Linha }
      const url = `https://blob.test/${input.page.id}-${++banco.seq}.png`
      let generationId = input.generationId ?? null
      if (generationId) {
        await db.$executeRaw(Object.assign(['UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = \'object\' THEN "fieldValues" ELSE \'{}\'::jsonb END) || ', '::jsonb WHERE "id" = ', ''], { raw: [] }) as never, JSON.stringify(input.fieldValues), generationId)
        await db.generation.update({ where: { id: generationId }, data: { status: 'COMPLETED', resultUrl: url, completedAt: new Date() } })
      } else {
        const g = await db.generation.create({ data: { status: 'COMPLETED', resultUrl: url, projectId: 8, templateId: input.templateId, fieldValues: input.fieldValues }, select: { id: true } })
        generationId = g.id
      }
      await db.page.update({ where: { id: input.page.id }, data: { thumbnail: url } })
      return { generationId, pageId: input.page.id, templateId: input.templateId, templateName: input.templateName, url, editUrl: `https://studio.test/templates/${input.templateId}/editor?pageId=${input.page.id}`, galleryUrl: 'https://studio.test/galeria', width: input.page.width, height: input.page.height, sizeKB: 1 }
    },
  }
})
// A medição do gate: trocável; registra pelo que leu (cliente, camadas, Generation de origem).
vi.mock('@/lib/creatives/revisao/revisar-arte', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/creatives/revisao/revisar-arte')>()
  const { medida, metrica } = await import('../revisao/__tests__/suporte/corpus-do-gate')
  const { formatoDaPaginaGravada } = await import('@/lib/compositor/formato')
  const SEM_FUNDO = { assunto: null, assuntoNaoSeAplica: true as const, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' }
  type Camada = { id: string; type: string; visible?: boolean }
  return {
    ...real,
    contextoDaMedicao: async (args: Parameters<typeof real.contextoDaMedicao>[0]) => {
      medicao.chamadas.push({
        naTransacao: (args.cliente as { __tx?: boolean } | undefined)?.__tx === true,
        camadas: args.camadas,
        composicaoReaproveitavel: args.composicaoReaproveitavel,
        generationDaPeca: args.generationDaPeca === undefined ? undefined : (args.generationDaPeca?.id ?? null),
        assinaturaDaOrigem: ((args.generationDaPeca?.fieldValues as Linha | undefined)?.composicao?.assinatura?.pageId as string | undefined) ?? null,
        nomeDaPagina: args.page.name,
        formato: formatoDaPaginaGravada(args.page),
      })
      // Sem Generation de origem não há referência nenhuma (A18) — como no código real.
      const referencias = args.generationDaPeca ? { headline: { fontSize1080: 84, entrelinha: null, origem: 'assinatura' } } : {}
      return { projectId: args.projectId, canvas: { width: args.page.width, height: args.page.height }, formato: formatoDaPaginaGravada(args.page), background: '#000000', faixa: [0.45, 0.9] as [number, number], referencias, referencia: args.generationDaPeca ? 'assinatura' : null, ...SEM_FUNDO, origensDaLogo: new Map(), cacheDeLogos: new Map(), cliente: args.cliente, sinal: args.sinal }
    },
    medirCamadasDaPeca: async (camadas: Camada[], ctx: Parameters<typeof real.medirCamadasDaPeca>[1]) => {
      banco.eventos.push({ e: 'medicao', t: Date.now() })
      await medicao.durante?.()
      if (medicao.modo === 'lenta') await new Promise((r) => setTimeout(r, 150))
      const textos = camadas.filter((l) => l.type === 'text' && l.visible !== false)
      return medida({
        canvas: ctx.canvas,
        formato: ctx.formato,
        camadas: camadas as never,
        metricas: textos.map((l) => metrica(l as never)),
        referencias: ctx.referencias as never,
        leituraDaLogo: [],
        ...SEM_FUNDO,
        ...(medicao.modo === 'reprovada' ? { geometria: [{ tipo: 'colisao', camadas: ['headline', 'apoio'], layerIds: ['headline', 'apoio'], px: 60, detalhe: 'sobrepõem' } as never] } : {}),
      })
    },
  }
})
// A9: o agendar-leva sobre a mesma página (o serviço real do lote; o agendamento de post é falso).
vi.mock('@/lib/creatives/agendar', () => ({
  resolverAgendamento: async (input: Linha) => ({ input, avisos: [], quando: new Date(input.scheduledDatetime), project: { userId: 'dono', name: 'Cliente' } }),
  criarPostDoAgendamento: async (tx: { socialPost: { create: (a: Linha) => Promise<Linha> } }, r: { input: Linha }) =>
    tx.socialPost.create({ data: { projectId: r.input.projectId, pageId: r.input.pageId, generationId: r.input.generationId, postType: r.input.postType, status: 'DRAFT', scheduledDatetime: new Date(r.input.scheduledDatetime), mediaUrls: [], renderStatus: 'PENDING', laterPostId: null }, select: { id: true } }),
  efeitosDoAgendamento: async () => ({ falhas: [] }),
  contextoDosEfeitos: () => ({}),
}))
vi.mock('@/lib/compositor/pastas', async () => {
  const { formatoDaPaginaGravada } = await import('@/lib/compositor/formato')
  return { formatoDaPagina: (p: { tags?: string[]; width: number; height: number }) => formatoDaPaginaGravada(p), refilarPaginasDoPost: async () => ({ avisos: [], falhou: false }), garantirPasta: async () => ({ id: 42, name: 'Pasta' }) }
})

import type { Layer } from '@/types/template'
import type { Ajuste } from '@/lib/creatives/revisao/contrato'
import { db } from '@/lib/db'
import { ajustarArte, MOTIVO_PAGINA_MUDOU_ANTES_DO_RENDER, MOTIVO_RENDER_DO_AJUSTE_FALHOU, MOTIVO_SEM_VERSAO_NOVA } from '../arte-rapida'
import { CreativeError } from '../errors'
import { versaoDaPagina, copyVersionDe } from '../revisao/versao'
import { PRAZO_DA_MEDICAO_MS } from '../revisao/gate-no-fluxo'
import { fecharGenerationComoFalha } from '../mesclar-field-values'
import { alvoDaRecomposicao, travarRecomposicaoDaArte } from '@/lib/compositor/recompor'
import { agendarItensDoLote } from '@/lib/lotes/agendar-itens'

const { escreverFora, segurarFora, segurarVarias, segurarChave } = (await import('@/lib/db')) as unknown as {
  escreverFora: (t: Tabela, id: string, mutar: (l: Linha) => Linha) => Promise<void>
  segurarFora: (t: Tabela, id: string, ms: number, mutar?: (l: Linha) => Linha) => Promise<void>
  segurarVarias: (linhas: Array<[Tabela, string]>, ms: number, mutar?: Partial<Record<Tabela, (l: Linha) => Linha>>) => Promise<void>
  segurarChave: (chave: string, ms: number) => Promise<void>
}

const PROJETO = 8
const ASSINATURA = 'assinatura-story'
const texto = (id: string, papel: string, y: number, fontSize: number): Layer =>
  ({ id, name: id, type: 'text', visible: true, locked: false, order: 3, content: `Texto ${id}`, position: { x: 100, y }, size: { width: 880, height: Math.round(fontSize * 1.5) }, style: { fontSize, lineHeight: 1.2, textAlign: 'left', color: '#FFFFFF' }, metadata: { compositor: { papel } } }) as Layer
const camadasLimpas = (): Layer[] => [texto('headline', 'headline', 400, 84), texto('apoio', 'apoio', 560, 40), texto('servico', 'servico', 1300, 32)]
const copyDe = (camadas: Layer[]) => ({ versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat' }, revisoes: [], blocos: camadas.filter((l) => l.type === 'text').map((l, i) => ({ id: l.id, funcao: (l.metadata as Linha)?.compositor?.papel ?? l.id, ordem: i, linhas: String(l.content).split('\n') })) })

function pagina(id: string, opcoes: { layers?: Layer[]; copy?: unknown; audio?: unknown } = {}) {
  const layers = opcoes.layers ?? camadasLimpas()
  const linha = { id, templateId: 42, isTemplate: false, name: `Página ${id}`, tags: ['compositor', 'story'], width: 1080, height: 1920, background: '#000000', layers, copyAutoral: 'copy' in opcoes ? opcoes.copy : copyDe(layers), audio: opcoes.audio ?? null, thumbnail: 'https://blob.test/anterior.png', updatedAt: new Date('2026-10-17T00:00:00Z'), Template: { id: 42, name: 'Pasta', projectId: PROJETO } }
  banco.pages.set(id, linha)
  return linha
}
function geracaoDoCompositor(id: string, pageId: string, extra: Linha = {}) {
  const pag = banco.pages.get(pageId)! as never
  const linha = { id, projectId: PROJETO, status: 'COMPLETED', resultUrl: `https://blob.test/${id}.png`, slideOrder: null, sourcePageId: null, createdAt: ++banco.seq, fieldValues: { source: 'compositor', pageId, versaoRenderizada: versaoDaPagina(pag), composicao: { assinatura: { pageId: ASSINATURA } }, spec: { projectId: PROJETO, formato: 'story', quando: '2026-10-17 10:00', tema: 'tema', blocos: [{ papel: 'headline', linhas: ['Texto headline'] }] } }, ...extra }
  banco.generations.set(id, linha)
  return linha
}
const MOVER_APOIO: Ajuste[] = [{ tipo: 'mover', camadas: ['apoio'], dy: -20 } as unknown as Ajuste]
const ajustar = (extra: Record<string, unknown> = {}) =>
  ajustarArte({ projectId: PROJETO, pageId: 'p1', versaoEsperada: versaoDe('p1'), ajustes: MOVER_APOIO, apenasRascunho: true, principal: { tipo: 'user', id: 'dot' }, ...extra })
const erroDe = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)
const eventos = () => banco.eventos.map((x) => x.e)
const versaoDe = (id: string) => versaoDaPagina(banco.pages.get(id)! as never)!
const generations = () => [...banco.generations.values()]
const novas = () => generations().filter((g) => g.fieldValues?.source === 'ajuste-arte')
const registroDe = (id: string) => banco.generations.get(id)?.fieldValues?.gateDaArte as Linha | undefined

beforeEach(() => {
  for (const t of ['pages', 'generations', 'posts', 'projects', 'customFonts', 'itensDeLote', 'itensDePlano'] as const) banco[t].clear()
  banco.filas.clear()
  banco.eventos = []
  banco.seq = 0
  banco.timeoutDaTransacao = null
  banco.deadlockEm = null
  banco.falharGravacao = false
  banco.aoTravarAgenda = null
  banco.aoRollback = null
  medicao.modo = 'limpa'
  medicao.chamadas = []
  medicao.durante = null
  cp4.modo = 'aceita'
  render.modo = 'ok'
  render.chamadas = []
  espioes.invalidar.mockClear()
  banco.projects.set(String(PROJETO), { id: PROJETO, name: 'Cliente', userId: 'dono', instagramAccountId: null, assinatura: { gradiente: { forcaMinima: 0.45, forcaMaxima: 0.9 } } })
  banco.customFonts.set('f1', { id: 'f1', projectId: PROJETO, fontFamily: 'Sintetica', fileUrl: 'https://blob.test/f1.otf' })
  banco.pages.set(ASSINATURA, { id: ASSINATURA, templateId: 7, isTemplate: true, name: 'Assinatura — story', tags: [], width: 1080, height: 1920, background: '#FFFFFF', layers: camadasLimpas(), copyAutoral: null, audio: null, Template: { id: 7, name: 'Assinaturas', projectId: PROJETO } })
  pagina('p1')
  geracaoDoCompositor('g-comp', 'p1')
})
afterEach(() => vi.useRealTimers())

describe('A1/A3/A4 — draft-only, ajuste aceito pelo CP4, candidata APTA', () => {
  it('ordem: agenda → fontes → posts → Page → Generation de origem (= alvo) → FOR SHARE → INSERT PROCESSING → medição pela tx → registro → UPDATE Page → trava de recomposição → commit → render fecha a MESMA Generation → invalidação só de rascunhos', async () => {
    const r = await ajustar()
    const nova = novas()[0]
    expect(r).toMatchObject({ ajustada: true, generationId: nova.id, revisao: { tipo: 'medida', resultado: 'APTO', generationId: nova.id } })
    const ate = eventos()
    const ordem = ate.slice(0, ate.indexOf('commit') + 1).filter((e) => /^(trava|trava-share|travou|insert:generation|medicao|gate:gravado|escrita:pages|merge:|commit)/.test(e))
    expect(ordem).toEqual([
      `trava:adv:agenda-slot:${PROJETO}`,
      `trava:adv:fontes:${PROJETO}`,
      'travou-posts-da-pagina:',
      'trava:pages:p1',
      'trava:generations:g-comp',
      `trava-share:projects:${PROJETO}`,
      `trava-share:pages:${ASSINATURA}`,
      'trava-share:customFonts:f1',
      'travou-fontes',
      `insert:generation:${nova.id}:PROCESSING`,
      'medicao',
      `gate:gravado:${nova.id}`,
      'escrita:pages:p1',
      'merge:g-comp:somenteReRender',
      'commit',
    ])
    // A medição leu pela TRANSAÇÃO, a candidata final (apoio movido), SEM reaproveitar a composição e com a Generation de origem.
    expect(medicao.chamadas).toHaveLength(1)
    expect(medicao.chamadas[0]).toMatchObject({ naTransacao: true, composicaoReaproveitavel: false, generationDaPeca: 'g-comp', nomeDaPagina: 'Página p1' })
    expect((medicao.chamadas[0].camadas as Layer[]).find((l) => l.id === 'apoio')!.position.y).toBe(540)
    // A3: a identidade do registro é a da versão GRAVADA.
    const paginaGravada = banco.pages.get('p1')!
    expect(paginaGravada.layers.find((l: Layer) => l.id === 'apoio').position.y).toBe(540)
    expect(registroDe(nova.id)).toMatchObject({ origem: 'ajustar-arte', principal: { tipo: 'user', id: 'dot' }, identidade: { generationId: nova.id, pageId: 'p1', pageVersion: versaoDe('p1'), copyVersion: copyVersionDe(paginaGravada.copyAutoral) }, gate: { resultado: 'APTO' } })
    // A4: o render fechou a Generation criada na transação (mesmo id), o registro sobreviveu ao merge do render.
    expect(render.chamadas).toEqual([{ generationId: nova.id, versaoEsperada: versaoDe('p1') }])
    expect(banco.generations.get(nova.id)).toMatchObject({ status: 'COMPLETED', fieldValues: { source: 'ajuste-arte', gateDaArte: expect.any(Object) } })
    expect(espioes.invalidar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pageIds: ['p1'], apenasRascunho: true }))
    expect(banco.generations.get('g-comp')!.fieldValues.somenteReRender).toBeTruthy()
  })
})

describe('A2 — candidata NÃO apta: rollback inteiro', () => {
  it('REVISAO_HUMANA_NECESSARIA 422 com achados/motivos/editUrl; página intacta; nenhuma Generation; render e invalidação não chamados', async () => {
    medicao.modo = 'reprovada'
    const antes = JSON.stringify(banco.pages.get('p1'))
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro).toBeInstanceOf(CreativeError)
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(erro.details).toMatchObject({ ajusteGravado: false, pageId: 'p1', editUrl: 'https://studio.test/templates/42/editor?pageId=p1', revisao: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA' }, ajustesAplicados: [expect.objectContaining({ tipo: 'mover' })] })
    expect((erro.details as { achados: Array<{ regra: string }> }).achados.some((a) => a.regra === 'colisao')).toBe(true)
    expect(JSON.stringify(banco.pages.get('p1'))).toBe(antes)
    expect(novas()).toEqual([])
    expect(eventos()).toContain('rollback')
    expect(eventos().filter((e) => e.startsWith('escrita:') && !e.startsWith('escrita:generations')).length).toBe(0)
    expect(render.chamadas).toEqual([])
    expect(espioes.invalidar).not.toHaveBeenCalled()
    expect(banco.generations.get('g-comp')!.fieldValues.somenteReRender).toBeUndefined()
  })
})

describe('A6/A7/A8 — fluxo humano e as recusas do CP4', () => {
  it('A6: perfil normal — sem medição, sem registro, sem travas novas, sem revisao; a Generation nasce no render como hoje', async () => {
    const r = await ajustar({ apenasRascunho: false, principal: undefined })
    expect(r.revisao).toBeUndefined()
    expect(medicao.chamadas).toEqual([])
    expect(eventos().filter((e) => e.startsWith('trava') || e.startsWith('gate:') || e.startsWith('insert:generation:') && e.endsWith(':PROCESSING'))).toEqual([])
    expect(render.chamadas).toEqual([{ generationId: undefined, versaoEsperada: versaoDe('p1') }])
    // A Generation do fluxo humano nasce no render (COMPLETED direto, sem PROCESSING e sem registro do gate).
    expect(novas()).toMatchObject([{ status: 'COMPLETED', fieldValues: { source: 'ajuste-arte' } }])
    expect(registroDe(novas()[0].id)).toBeUndefined()
  })

  it('A7: todos os ajustes recusados pelo CP4 no draft-only → o CÓDIGO é REVISAO_HUMANA_NECESSARIA, details.causa = AJUSTE_PIOROU_ARTE, revisao nao-medida; nada medido; perfil normal mantém o código do CP4', async () => {
    cp4.modo = 'recusa-tudo'
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(erro.details).toMatchObject({ causa: 'AJUSTE_PIOROU_ARTE', ajusteGravado: false, recusados: [expect.objectContaining({ codigo: 'AJUSTE_PIOROU_ARTE' })], revisao: { tipo: 'nao-medida', motivo: MOTIVO_SEM_VERSAO_NOVA } })
    expect(erro.message).toMatch(/Revisão humana necessária\.$/)
    expect(medicao.chamadas).toEqual([])
    expect(eventos()).not.toContain('tx:inicio')
    const humano = (await erroDe(ajustar({ apenasRascunho: false }))) as CreativeError
    expect(humano.code).toBe('AJUSTE_PIOROU_ARTE')
    expect((humano.details as Linha).causa).toBeUndefined()
  })

  it('A7 (demais causas do contrato): AJUSTE_NAO_MEDIDO e CONTEUDO_NAO_PODE_SER_OCULTADO também viram REVISAO_HUMANA_NECESSARIA com `details.causa`; o perfil normal mantém o código', async () => {
    for (const [modo, causa] of [['nao-medido', 'AJUSTE_NAO_MEDIDO'], ['ocultado', 'CONTEUDO_NAO_PODE_SER_OCULTADO']] as const) {
      cp4.modo = modo
      const erro = (await erroDe(ajustar())) as CreativeError
      expect(erro.code, modo).toBe('REVISAO_HUMANA_NECESSARIA')
      expect(erro.details, modo).toMatchObject({ causa, ajusteGravado: false, revisao: { tipo: 'nao-medida', motivo: MOTIVO_SEM_VERSAO_NOVA } })
      const humano = (await erroDe(ajustar({ apenasRascunho: false }))) as CreativeError
      expect(humano.code, modo).toBe(causa)
    }
    expect(medicao.chamadas).toEqual([])
    expect(eventos()).not.toContain('tx:inicio')
  })

  it('A8: slotValues que esvaziam texto no draft-only → CONTEUDO_NAO_PODE_SER_REMOVIDO antes de qualquer medida ou transação', async () => {
    const erro = (await erroDe(ajustarArte({ projectId: PROJETO, pageId: 'p1', apenasRascunho: true, slotValues: { apoio: '' } }))) as CreativeError
    expect(erro.code).toBe('CONTEUDO_NAO_PODE_SER_REMOVIDO')
    expect(medicao.chamadas).toEqual([])
    expect(eventos()).not.toContain('tx:inicio')
  })
})

describe('A5/A14/A17 — o que a medição lê está travado; a conferência sob trava', () => {
  it('A5: edição concorrente da página espera a trava e aplica depois do commit; a chamada seguinte recusa VERSAO_DIVERGENTE', async () => {
    let edicao: Promise<void> | null = null
    medicao.durante = () => {
      edicao = escreverFora('pages', 'p1', (p) => ({ ...p, name: 'editada no editor', updatedAt: new Date('2026-10-17T01:00:00Z') }))
    }
    const versao = versaoDe('p1')
    const r = await ajustar({ versaoEsperada: versao })
    await edicao!
    expect(r.ajustada).toBe(true)
    const ev = eventos()
    expect(ev.indexOf('fora:quer:pages:p1')).toBeLessThan(ev.indexOf('commit'))
    expect(ev.lastIndexOf('escrita:pages:p1')).toBeGreaterThan(ev.indexOf('commit'))
    // A versão esperada antiga já não vale: a conferência de versão recusa antes de medir.
    medicao.chamadas = []
    const erro = (await erroDe(ajustar({ versaoEsperada: versao }))) as CreativeError
    expect(erro.code).toBe('VERSAO_DIVERGENTE')
    expect(medicao.chamadas).toEqual([])
  })

  it('A5b: a assinatura, a fonte, o projeto e a Generation de origem editados DURANTE a medição esperam o commit', async () => {
    const pendentes: Promise<void>[] = []
    medicao.durante = () => {
      pendentes.push(
        escreverFora('pages', ASSINATURA, (p) => ({ ...p, name: 'Assinatura v2' })),
        escreverFora('customFonts', 'f1', (f) => ({ ...f, fileUrl: 'https://blob.test/f1-v2.otf' })),
        escreverFora('projects', String(PROJETO), (p) => ({ ...p, assinatura: {} })),
        escreverFora('generations', 'g-comp', (g) => ({ ...g, fieldValues: { ...g.fieldValues, worker: 'mexeu' } })),
      )
    }
    await ajustar()
    await Promise.all(pendentes)
    const ev = eventos()
    const commit = ev.indexOf('commit')
    for (const chave of [`pages:${ASSINATURA}`, 'customFonts:f1', `projects:${PROJETO}`, 'generations:g-comp']) {
      expect(ev.indexOf(`fora:quer:${chave}`), chave).toBeLessThan(commit)
      expect(ev.lastIndexOf(`escrita:${chave}`), chave).toBeGreaterThan(commit)
    }
  })

  it('A14b (Codex R1, BLOQUEADOR 2): tags trocadas de story para feed entre a leitura e a transação, SEM mexer nas camadas (a versão não muda) → a conferência sob trava recusa, nada medido', async () => {
    banco.aoTravarAgenda = () => void banco.pages.set('p1', { ...banco.pages.get('p1')!, tags: ['compositor', 'feed'] })
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('VERSAO_DIVERGENTE')
    expect(medicao.chamadas).toEqual([])
    expect(novas()).toEqual([])
    // Controle: a mesma troca ANTES da chamada é lida e medida como feed (o formato que o gate registra é o gravado).
    banco.eventos = []
    const feed = (await erroDe(ajustar({ versaoEsperada: versaoDe('p1') }))) as CreativeError | null
    expect(medicao.chamadas).toHaveLength(1)
    expect(medicao.chamadas[0].formato).toBe('feed')
    expect(feed === null || feed.code === 'REVISAO_HUMANA_NECESSARIA').toBe(true)
  })

  it('A14c (Codex R1, BLOQUEADOR 2): o nome da página trocado por fora entre a leitura e a transação → a conferência sob trava recusa', async () => {
    banco.aoTravarAgenda = () => void banco.pages.set('p1', { ...banco.pages.get('p1')!, name: 'renomeada no editor' })
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('VERSAO_DIVERGENTE')
    expect(medicao.chamadas).toEqual([])
  })

  it('A14: música adicionada à página entre a leitura inicial e a transação → a conferência sob trava recusa, nada medido, nada gravado', async () => {
    banco.aoTravarAgenda = () => void banco.pages.set('p1', { ...banco.pages.get('p1')!, audio: { source: 'library', musicId: 'm1', startTime: 0, endTime: 15 } })
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('VERSAO_DIVERGENTE')
    expect(medicao.chamadas).toEqual([])
    expect(novas()).toEqual([])
    expect(eventos()).toContain('rollback')
  })

  it('A13 (Codex R1, BLOQUEADOR 1): o worker da fila SEGURA a Generation de origem e regrava a composição antes de soltar → o ajuste espera a trava (espera medida à parte) e mede com a composição RELIDA: a referência nova é a travada em FOR SHARE', async () => {
    banco.pages.set('assinatura-v2', { ...banco.pages.get(ASSINATURA)!, id: 'assinatura-v2', name: 'Assinatura v2' })
    const worker = segurarFora('generations', 'g-comp', 80, (g) => ({ ...g, fieldValues: { ...g.fieldValues, composicao: { assinatura: { pageId: 'assinatura-v2' } } } }))
    await new Promise((r) => setImmediate(r))
    const r = await ajustar()
    await worker
    expect(r.ajustada).toBe(true)
    const ev = eventos()
    // (`lastIndexOf`: quem segura por fora também emite a aquisição; a do ajuste é a última.)
    expect(ev.indexOf('fora:solta:generations:g-comp')).toBeLessThan(ev.lastIndexOf('trava:generations:g-comp'))
    expect(ev.lastIndexOf('trava:generations:g-comp')).toBeLessThan(ev.indexOf('medicao'))
    expect(ev).toContain('trava-share:pages:assinatura-v2')
    expect(ev).not.toContain(`trava-share:pages:${ASSINATURA}`)
    expect(medicao.chamadas[0]).toMatchObject({ generationDaPeca: 'g-comp', assinaturaDaOrigem: 'assinatura-v2' })
    const espera = Number(ev.find((e) => e.startsWith('espera:'))!.slice(7))
    expect(espera).toBeGreaterThanOrEqual(50)
  })

  it('A13b (Codex R1, BLOQUEADOR 1): a linha escolhida como origem deixa de ser a arte do compositor DESTA página enquanto o ajuste espera → AJUSTE_CONCORRENTE ("repita"), nada gravado', async () => {
    const worker = segurarFora('generations', 'g-comp', 40, (g) => ({ ...g, fieldValues: { ...g.fieldValues, pageId: 'outra-pagina' } }))
    await new Promise((r) => setImmediate(r))
    const erro = (await erroDe(ajustar())) as CreativeError
    await worker
    expect(erro.code).toBe('AJUSTE_CONCORRENTE')
    expect(erro.details).toMatchObject({ ajusteGravado: false })
    expect(medicao.chamadas).toEqual([])
    expect(novas()).toEqual([])
    expect(eventos()).toContain('rollback')
  })

  it('A13c: a rota de fontes segurando a trava consultiva das fontes → o ajuste espera e segue (ordem agenda → fontes mantida)', async () => {
    const rota = segurarChave(`fontes:${PROJETO}`, 60)
    await new Promise((r) => setImmediate(r))
    const r = await ajustar()
    await rota
    expect(r.ajustada).toBe(true)
    const ev = eventos()
    expect(ev.indexOf(`fora:solta:adv:fontes:${PROJETO}`)).toBeLessThan(ev.lastIndexOf(`trava:adv:fontes:${PROJETO}`))
    expect(ev.indexOf(`trava:adv:agenda-slot:${PROJETO}`)).toBeLessThan(ev.lastIndexOf(`trava:adv:fontes:${PROJETO}`))
  })

  it('A13d: o publicador (later-scheduler) segurando o DRAFT da página e entregando-o ao Zernio antes de soltar → o ajuste espera e a conferência sob trava recusa POST_APROVADO_INTOCAVEL, nada medido', async () => {
    banco.posts.set('post-1', { id: 'post-1', projectId: PROJETO, pageId: 'p1', generationId: 'g-comp', postType: 'STORY', status: 'DRAFT', laterPostId: null })
    const publicador = segurarFora('posts', 'post-1', 60, (p) => ({ ...p, status: 'SCHEDULED', laterPostId: 'zernio-1' }))
    await new Promise((r) => setImmediate(r))
    const erro = (await erroDe(ajustar())) as CreativeError
    await publicador
    expect(erro.code).toBe('POST_APROVADO_INTOCAVEL')
    const ev = eventos()
    expect(ev.indexOf('fora:solta:posts:post-1')).toBeLessThan(ev.indexOf('travou-posts-da-pagina:post-1'))
    expect(medicao.chamadas).toEqual([])
    expect(novas()).toEqual([])
  })

  it('A13e (Codex R2): o render CONDICIONADO de outra chamada (persist.ts: Page FOR UPDATE → Generation) segura a página e a Generation da arte e regrava a miniatura antes de soltar → o ajuste espera na Page (mesma ordem, sem deadlock), confere a versão sob trava e segue; nenhuma escrita cruzada', async () => {
    const render = segurarVarias([['pages', 'p1'], ['generations', 'g-comp']], 70, { pages: (p) => ({ ...p, thumbnail: 'https://blob.test/render-condicionado.png' }), generations: (g) => ({ ...g, resultUrl: 'https://blob.test/render-condicionado.png' }) })
    await new Promise((r) => setImmediate(r))
    const r = await ajustar()
    await render
    expect(r.ajustada).toBe(true)
    const ev = eventos()
    expect(ev.indexOf('fora:solta:pages:p1')).toBeLessThan(ev.lastIndexOf('trava:pages:p1'))
    expect(ev.lastIndexOf('trava:pages:p1')).toBeLessThan(ev.lastIndexOf('trava:generations:g-comp'))
    expect(ev).not.toContain('rollback')
    // A miniatura que o render de fora gravou sobreviveu até a escrita do ajuste (que grava a sua depois, pelo próprio render).
    expect(ev.indexOf('fora:solta:pages:p1')).toBeLessThan(ev.lastIndexOf('escrita:pages:p1'))
    expect(banco.generations.get('g-comp')!.resultUrl).toBe('https://blob.test/render-condicionado.png')
    expect(Number(ev.find((e) => e.startsWith('espera:'))!.slice(7))).toBeGreaterThanOrEqual(50)
  })

  it('A13f (Codex R2): o recompor (CAS da Page fora de transação, depois a Generation) entre a leitura inicial do ajuste e a trava → a conferência sob trava recusa, nada medido; a escrita dele na Generation DURANTE a medição do ajuste espera o commit', async () => {
    // 1) o recompor passa ANTES da trava: CAS da Page (camadas e carimbo novos) e a Generation regravada.
    banco.aoTravarAgenda = async () => {
      await escreverFora('pages', 'p1', (p) => ({ ...p, layers: p.layers.map((l: Layer) => (l.id === 'headline' ? { ...l, content: 'Recomposta' } : l)), updatedAt: new Date('2026-10-17T02:00:00Z') }))
      await escreverFora('generations', 'g-comp', (g) => ({ ...g, fieldValues: { ...g.fieldValues, versaoRenderizada: 'recomposta' } }))
    }
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('VERSAO_DIVERGENTE')
    expect(medicao.chamadas).toEqual([])
    expect(novas()).toEqual([])
    // 2) o recompor chega DURANTE a medição do ajuste: a Generation está travada, ele espera o commit; a página não muda por baixo.
    banco.eventos = []
    let recompor: Promise<void> | null = null
    medicao.durante = () => {
      recompor = escreverFora('generations', 'g-comp', (g) => ({ ...g, fieldValues: { ...g.fieldValues, versaoRenderizada: 'recomposta-2' } }))
    }
    const r = await ajustar({ versaoEsperada: versaoDe('p1') })
    await recompor!
    expect(r.ajustada).toBe(true)
    const ev = eventos()
    expect(ev.indexOf('fora:quer:generations:g-comp')).toBeLessThan(ev.indexOf('commit'))
    expect(ev.lastIndexOf('escrita:generations:g-comp')).toBeGreaterThan(ev.indexOf('commit'))
    expect(medicao.chamadas).toHaveLength(1)
  })

  it('A17: SEGUNDO ajuste na mesma página — a Generation de origem (compositor) e o alvo da recomposição (a do primeiro ajuste) são travadas em ordem de id ANTES dos shares, e a trava de recomposição cai na linha travada', async () => {
    await ajustar()
    const primeira = novas()[0]
    banco.eventos = []
    const r2 = await ajustar({ versaoEsperada: versaoDe('p1'), ajustes: [{ tipo: 'mover', camadas: ['apoio'], dy: -10 } as unknown as Ajuste] })
    const segunda = novas().find((g) => g.id !== primeira.id)!
    expect(r2.generationId).toBe(segunda.id)
    const ev = eventos()
    const ids = [primeira.id, 'g-comp'].sort()
    expect(ev).toContain(`travou-generations:${ids.join(',')}`)
    expect(ev.indexOf(`travou-generations:${ids.join(',')}`)).toBeLessThan(ev.indexOf(`trava-share:projects:${PROJETO}`))
    // A trava de recomposição escreveu o ALVO real (a arte mais recente com resultUrl: a do primeiro ajuste), não a do compositor.
    expect(ev).toContain(`merge:${primeira.id}:somenteReRender`)
    expect(banco.generations.get(primeira.id)!.fieldValues.somenteReRender).toBeTruthy()
  })

  it('A17 (equivalência): travarRecomposicaoDaArte com e sem `alvo` escreve a MESMA linha com a MESMA marca; com a marca já gravada, nenhum dos dois escreve; com `alvo`, nenhuma busca', async () => {
    const alvo = await alvoDaRecomposicao(db, 'p1', { projectId: PROJETO })
    expect(alvo?.id).toBe('g-comp')
    banco.eventos = []
    expect(await travarRecomposicaoDaArte('p1', 'teste', { projectId: PROJETO, alvo: alvo!.id })).toBe(true)
    const comAlvo = eventos()
    expect(comAlvo).toEqual(['escrita:generations:g-comp', 'merge:g-comp:somenteReRender'])
    const marca = banco.generations.get('g-comp')!.fieldValues.somenteReRender
    // Já gravada: os dois caminhos devolvem true e não escrevem.
    banco.eventos = []
    expect(await travarRecomposicaoDaArte('p1', 'teste', { projectId: PROJETO, alvo: alvo!.id })).toBe(true)
    expect(await travarRecomposicaoDaArte('p1', 'teste', { projectId: PROJETO })).toBe(true)
    expect(eventos()).toEqual([])
    expect(banco.generations.get('g-comp')!.fieldValues.somenteReRender).toEqual(marca)
    // Sem a marca, o caminho SEM alvo escreve a mesma linha.
    banco.generations.set('g-comp', { ...banco.generations.get('g-comp')!, fieldValues: { ...banco.generations.get('g-comp')!.fieldValues, somenteReRender: undefined } })
    banco.eventos = []
    expect(await travarRecomposicaoDaArte('p1', 'teste', { projectId: PROJETO })).toBe(true)
    expect(eventos()).toEqual(['escrita:generations:g-comp', 'merge:g-comp:somenteReRender'])
  })
})

describe('A10/A12/A18 — exceções do gate, prazo, página sem arte do compositor', () => {
  it('A10: gravação do registro falha → rollback, REVISAO_HUMANA_NECESSARIA (não ERRO), revisao nao-medida, nenhuma Generation', async () => {
    banco.falharGravacao = true
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(erro.details).toMatchObject({ ajusteGravado: false, revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/connection reset/) } })
    expect(novas()).toEqual([])
    expect(eventos()).toContain('rollback')
  })

  it('A10: timeout da transação durante a medição → REVISAO_HUMANA_NECESSARIA sem escrita parcial; a transação fechada recusa o que a medição lenta tentar depois', async () => {
    banco.timeoutDaTransacao = 40
    medicao.modo = 'lenta'
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(erro.details).toMatchObject({ revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/prazo/) } })
    await new Promise((r) => setTimeout(r, 200))
    expect(novas()).toEqual([])
    expect(banco.pages.get('p1')!.layers.find((l: Layer) => l.id === 'apoio').position.y).toBe(560)
  })

  it('A10: deadlock (40P01) numa trava do gate → AJUSTE_CONCORRENTE ("repita"), nada gravado', async () => {
    banco.deadlockEm = 'Generation'
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('AJUSTE_CONCORRENTE')
    expect(novas()).toEqual([])
    expect(eventos()).toContain('rollback')
  })

  it('A12: a medição não cabe no prazo (race de 8 s, relógio falso) → nao-medida, rollback, travas liberadas (a chamada seguinte não espera)', async () => {
    medicao.durante = () => new Promise(() => {}) // presa para sempre
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const chamada = erroDe(ajustar())
    const inicio = Date.now()
    while (!eventos().includes('medicao') && Date.now() - inicio < 10_000) await new Promise((r) => setImmediate(r))
    await vi.advanceTimersByTimeAsync(PRAZO_DA_MEDICAO_MS + 1)
    const erro = (await chamada) as CreativeError
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(erro.details).toMatchObject({ revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/prazo/) } })
    expect(novas()).toEqual([])
    vi.useRealTimers()
    medicao.durante = null
    banco.eventos = []
    const t0 = Date.now()
    expect((await ajustar()).ajustada).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2_000)
  })

  it('A18: página sem Generation do compositor (arte livre) → medição sem referências → o gate recusa (texto-pequeno do título não comprovada), nada gravado', async () => {
    banco.generations.delete('g-comp')
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(medicao.chamadas[0].generationDaPeca).toBeNull()
    expect((erro.details as { motivos: Array<{ regra: string }> }).motivos.some((m) => m.regra === 'texto-pequeno')).toBe(true)
    expect(novas()).toEqual([])
  })

  it('A11: página sem contrato de copy no draft-only → copy-completa não comprovada → recusa dita; nada gravado', async () => {
    banco.pages.set('p1', { ...banco.pages.get('p1')!, copyAutoral: null })
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('REVISAO_HUMANA_NECESSARIA')
    expect((erro.details as { motivos: Array<{ regra: string }> }).motivos.some((m) => m.regra === 'copy-completa')).toBe(true)
    expect(novas()).toEqual([])
  })
})

describe('A15/A16 — depois do commit: o render falha ou a página muda; a corrida com o cron', () => {
  it('A16: o render lança → a Generation PROCESSING fecha como FAILED numa instrução (error, registro preservado); a página fica gravada; invalidação com renderFalhou', async () => {
    render.modo = 'falha'
    const erro = (await erroDe(ajustar())) as Error
    expect(erro.message).toBe('o Blob caiu')
    const nova = novas()[0]
    expect(nova).toMatchObject({ status: 'FAILED', fieldValues: { error: MOTIVO_RENDER_DO_AJUSTE_FALHOU, gateDaArte: expect.any(Object) } })
    expect(eventos()).toContain(`fechou:FAILED:${nova.id}`)
    expect(banco.pages.get('p1')!.layers.find((l: Layer) => l.id === 'apoio').position.y).toBe(540)
    expect(espioes.invalidar).toHaveBeenCalled()
  })

  it('A15: a página muda antes de o render fechar (PAGINA_MUDOU_DURANTE) → FAILED com o motivo próprio, registro presente, erro relançado com ajusteGravado: true', async () => {
    render.modo = 'pagina-mudou'
    const erro = (await erroDe(ajustar())) as CreativeError
    expect(erro.code).toBe('PAGINA_MUDOU_DURANTE')
    expect(erro.details).toMatchObject({ ajusteGravado: true })
    const nova = novas()[0]
    expect(nova).toMatchObject({ status: 'FAILED', fieldValues: { error: MOTIVO_PAGINA_MUDOU_ANTES_DO_RENDER, gateDaArte: expect.any(Object) } })
  })

  it('A16 (corrida): fechamento explícito × cron — quem fecha PRIMEIRO vence nas duas ordens; o segundo escreve 0 linhas; registro e campos do cron preservados', async () => {
    for (const primeiro of ['ajuste', 'cron'] as const) {
      banco.generations.set('g-proc', { id: 'g-proc', projectId: PROJETO, status: 'PROCESSING', resultUrl: null, createdAt: ++banco.seq, fieldValues: { source: 'ajuste-arte', pageId: 'p1', gateDaArte: { gate: { resultado: 'APTO' } } } })
      const doAjuste = () => fecharGenerationComoFalha(db, 'g-proc', { error: MOTIVO_RENDER_DO_AJUSTE_FALHOU })
      const doCron = () => fecharGenerationComoFalha(db, 'g-proc', { error: 'órfã', failedAt: '2026-10-17T00:30:00.000Z', recuperadaPelaFila: true })
      const [a, b] = primeiro === 'ajuste' ? [await doAjuste(), await doCron()] : [await doCron(), await doAjuste()]
      expect([a, b]).toEqual([1, 0])
      const g = banco.generations.get('g-proc')!
      expect(g.status).toBe('FAILED')
      expect(g.fieldValues.gateDaArte).toEqual({ gate: { resultado: 'APTO' } })
      expect(g.fieldValues.error).toBe(primeiro === 'ajuste' ? MOTIVO_RENDER_DO_AJUSTE_FALHOU : 'órfã')
      if (primeiro === 'cron') expect(g.fieldValues).toMatchObject({ failedAt: '2026-10-17T00:30:00.000Z', recuperadaPelaFila: true })
      else expect(g.fieldValues.recuperadaPelaFila).toBeUndefined()
    }
  })
})

describe('A9/A13 — com o agendar-leva (CP5c) na mesma página', () => {
  const item = () => {
    banco.itensDeLote.set('lote-i1', { id: 'lote-i1', projectId: PROJETO, loteId: 'dot-8-2026-S42', itemId: 'i1', generationId: 'g-comp', postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null })
    return { itemId: 'i1' }
  }
  const agendar = () => agendarItensDoLote({ projectId: PROJETO, loteId: 'dot-8-2026-S42', itens: [item()], apenasRascunho: true, principal: { tipo: 'user', id: 'dot' } })

  it('A9: ajuste APTO gravado → o lote mede de novo a Generation do ITEM (a do compositor, composição não reaproveitável) e cria o DRAFT; dois registros, um por Generation, ambos da mesma pageVersion', async () => {
    const r = await ajustar()
    const doAjuste = r.generationId
    medicao.chamadas = []
    const lote = await agendar()
    expect(lote.itens[0]).toMatchObject({ desfecho: 'criado', revisao: { tipo: 'medida', resultado: 'APTO' } })
    expect(medicao.chamadas[0]).toMatchObject({ generationDaPeca: 'g-comp', composicaoReaproveitavel: false })
    expect([...banco.posts.values()]).toHaveLength(1)
    expect([...banco.posts.values()][0].generationId).toBe('g-comp')
    const pageVersion = versaoDe('p1')
    expect(registroDe(doAjuste)).toMatchObject({ origem: 'ajustar-arte', identidade: { generationId: doAjuste, pageVersion } })
    expect(registroDe('g-comp')).toMatchObject({ origem: 'agendar-leva', identidade: { generationId: 'g-comp', pageVersion } })
  })

  it('A13 (ordem inversa): o agendar-leva entra enquanto o ajustar-arte mede a mesma página: espera o commit do ajuste e mede a página JÁ ajustada; os dois commitam', async () => {
    let lote: Promise<Awaited<ReturnType<typeof agendar>>> | null = null
    medicao.durante = () => {
      if (!lote) lote = agendar()
    }
    const r = await ajustar()
    const l = await lote!
    expect(r.ajustada).toBe(true)
    expect(l.itens[0]).toMatchObject({ desfecho: 'criado' })
    const ev = eventos()
    const commits = ev.map((e, i) => (e === 'commit' ? i : -1)).filter((i) => i >= 0)
    expect(commits).toHaveLength(2)
    expect(ev).not.toContain('rollback')
    // O lote travou a agenda DEPOIS do commit do ajuste e mediu as camadas ajustadas (apoio em 540).
    expect(ev.lastIndexOf(`trava:adv:agenda-slot:${PROJETO}`)).toBeGreaterThan(commits[0])
    expect((medicao.chamadas[1].camadas as Layer[]).find((c) => c.id === 'apoio')!.position.y).toBe(540)
  })

  it('A13: ajustar-arte entra enquanto o agendar-leva mede a mesma página (trava da agenda): espera o commit do lote e só então mede e grava; os dois commitam, nenhum rollback', async () => {
    let ajuste: Promise<unknown> | null = null
    medicao.durante = () => {
      if (!ajuste) ajuste = ajustar()
    }
    const lote = await agendar()
    const r = (await ajuste!) as Awaited<ReturnType<typeof ajustarArte>>
    expect(lote.itens[0]).toMatchObject({ desfecho: 'criado' })
    expect(r.ajustada).toBe(true)
    const ev = eventos()
    const commits = ev.map((e, i) => (e === 'commit' ? i : -1)).filter((i) => i >= 0)
    expect(commits).toHaveLength(2)
    expect(ev).not.toContain('rollback')
    // O ajuste travou a agenda DEPOIS do commit do lote.
    expect(ev.lastIndexOf(`trava:adv:agenda-slot:${PROJETO}`)).toBeGreaterThan(commits[0])
    // O ajuste travou também o DRAFT recém-criado (posts da página) antes de medir.
    const post = [...banco.posts.values()][0]
    expect(ev).toContain(`travou-posts-da-pagina:${post.id}`)
  })
})
