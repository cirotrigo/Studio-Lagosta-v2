/**
 * CP5c — o GATE do perfil draft-only em `agendar-leva` (`docs/PLANO-2026-10-16-CP5C-CONTRATO.md`, § 9: C1–C22).
 *
 * O banco falso modela o que o contrato depende do Postgres: TRAVAS DE LINHA por chave (`tabela:id`, exclusivas —
 * `FOR SHARE` é tratado como exclusivo diante de um escritor, que é o que importa), travas consultivas por chave,
 * fila por trava (quem chega depois espera o commit/rollback de quem segura), rollback só do que a transação
 * escreveu, `timeout` da transação (`P2028`, e a transação fechada recusa comandos depois dele) e deadlock injetado
 * (`40P01`). Cada operação vira um EVENTO com carimbo de tempo: é pela ORDEM dos eventos que a maioria dos casos é
 * provada. A MEDIÇÃO é trocável: `limpa` (a peça limpa do gate, com as camadas reais da página), `reprovada`
 * (colisão medida), `outra-pagina` (a medida de outra página), `lenta`, e `real` (a de produção, para a rede presa
 * — C21 — e o orçamento — C18 — sobre páginas sintéticas).
 *
 * P11 (`direcao-de-arte/__tests__/piloto-portao.test.ts`) prova a medição REAL sobre a fixture do piloto; o harness de
 * `agendar-itens.test.ts` prova que o resto do serviço não mudou. Aqui, a TRANSAÇÃO do gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Linha = Record<string, any>
type Tabela = 'pages' | 'generations' | 'posts' | 'itensDeLote' | 'itensDePlano' | 'projects' | 'customFonts'

const banco = vi.hoisted(() => ({
  pages: new Map<string, Linha>(),
  generations: new Map<string, Linha>(),
  posts: new Map<string, Linha>(),
  itensDeLote: new Map<string, Linha>(),
  itensDePlano: new Map<string, Linha>(),
  projects: new Map<string, Linha>(),
  customFonts: new Map<string, Linha>(),
  /** A fila de cada trava (`tabela:id` ou `adv:<chave>`): quem chega depois espera quem segura. */
  filas: new Map<string, Promise<void>>(),
  eventos: [] as Array<{ e: string; t: number }>,
  seq: 0,
  /** Sobrepõe o `timeout` que o serviço passa à transação (para simular o estouro sem esperar 20 s). */
  timeoutDaTransacao: null as number | null,
  /** A próxima trava nesta tabela "detecta deadlock" (SQLSTATE 40P01). */
  deadlockEm: null as string | null,
  /** O próximo `UPDATE "Generation"` (a gravação do registro) cai no banco. */
  falharGravacao: false,
  /** O próximo `UPDATE "Generation"` devolve 0 linhas (o vínculo não casou) — o `'sem-vinculo'` de `gravarGateDaArte`. */
  gravacaoSemVinculo: false,
  /** As próximas N leituras de página FORA de transação caem no banco (a releitura do `editUrl` depois do rollback). */
  falharLeituraDaPaginaFora: 0,
  /** Roda logo DEPOIS do rollback de uma transação: o que o mundo fez entre o rollback e a releitura. */
  aoRollback: null as null | (() => void),
  /** Roda logo depois da PRIMEIRA trava (a consultiva da agenda): o que outra chamada gravou enquanto esta esperava. */
  aoTravarAgenda: null as null | (() => void | Promise<void>),
}))
const medicao = vi.hoisted(() => ({
  modo: 'limpa' as 'limpa' | 'reprovada' | 'real' | 'outra-pagina' | 'lenta',
  /** Página COM foto de fundo nos modos simulados: assunto de CATÁLOGO (coerente, APTO) ou foto LIDA sem assunto localizável (caso C). */
  assunto: 'catalogo' as 'catalogo' | 'nenhum',
  /** Modos consumidos em ordem, uma chamada cada (vazia = `modo`). */
  fila: [] as Array<'limpa' | 'reprovada'>,
  chamadas: [] as Array<{ naTransacao: boolean; camadas: unknown[]; composicaoReaproveitavel: boolean | undefined; generationDaPeca: string | null | undefined; nomeDaPagina: string }>,
  /** Roda DURANTE a medição, com as travas seguras: o lugar das escritas concorrentes. */
  durante: null as null | (() => void | Promise<void>),
}))
const rede = vi.hoisted(() => ({ pendurar: null as null | 'fonte' | 'assunto' | 'logo' | 'regua', pendurados: 0, abortos: 0 }))
const efeitos = vi.hoisted(() => ({ agendamento: 0, refilagens: 0, lembretes: 0 }))

vi.mock('@/lib/db', () => {
  const evento = (e: string) => banco.eventos.push({ e, t: Date.now() })
  const valor = (v: unknown) => (v === undefined ? null : v)
  const porCaminho = (v: unknown, caminho: string[]) => caminho.reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Linha)[k] : undefined), v)
  const casa = (linha: Linha, where: Linha = {}): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (k === 'OR') return (cond as Linha[]).some((w) => casa(linha, w))
      if (k === 'NOT') return !casa(linha, cond as Linha)
      const atual = valor(linha[k])
      if (cond instanceof Date) return atual instanceof Date && atual.getTime() === cond.getTime()
      if (cond && typeof cond === 'object') {
        const c = cond as Linha
        if ('path' in c) return valor(porCaminho(atual, c.path as string[])) === valor(c.equals)
        if ('has' in c) return Array.isArray(atual) && atual.includes(c.has)
        if ('in' in c) return (c.in as unknown[]).includes(atual)
        if ('not' in c) return atual !== null && atual !== c.not
        if ('gte' in c || 'lte' in c) {
          const t = atual instanceof Date ? atual.getTime() : Number(atual)
          return (!('gte' in c) || t >= (c.gte as Date).getTime()) && (!('lte' in c) || t <= (c.lte as Date).getTime())
        }
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
    const acha = (where: Linha) => {
      if (where.id !== undefined) return banco[nome].get(String(where.id)) ?? null
      if (where.projectId_loteId_itemId) return vivos().find((l) => casa(l, where.projectId_loteId_itemId)) ?? null
      return vivos().find((l) => casa(l, where)) ?? null
    }
    return {
      findUnique: async ({ where, select }: { where: Linha; select?: Linha }) => {
        if (nome === 'pages' && !tx && banco.falharLeituraDaPaginaFora > 0) {
          banco.falharLeituraDaPaginaFora--
          throw new Error('connection reset na releitura da página')
        }
        const l = acha(where)
        return l ? projetar(l, select) : null
      },
      findFirst: async ({ where, select }: { where: Linha; select?: Linha }) => {
        const l = vivos().find((x) => casa(x, where))
        return l ? projetar(l, select) : null
      },
      findMany: async ({ where, select, take }: { where?: Linha; select?: Linha; take?: number; orderBy?: unknown }) =>
        vivos()
          .filter((l) => casa(l, where))
          .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))
          .slice(0, take ?? Infinity)
          .map((l) => projetar(l, select)),
      create: async ({ data, select }: { data: Linha; select?: Linha }) => {
        if (tx?.fechada) throw fechada()
        const id = String(data.id ?? `${nome}-${++banco.seq}`)
        const linha = { id, createdAt: ++banco.seq, ...data }
        gravar(nome, id, linha, tx)
        if (nome === 'posts') evento('insert:post')
        return projetar(linha, select)
      },
      update: async ({ where, data, select }: { where: { id: string }; data: Linha; select?: Linha }) => {
        const linha = { ...banco[nome].get(where.id)!, ...data }
        gravar(nome, where.id, linha, tx)
        return projetar(linha, select)
      },
      updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
        let count = 0
        for (const l of vivos()) {
          if (!casa(l, where)) continue
          gravar(nome, l.id, { ...l, ...data, ...(nome === 'itensDePlano' ? { updatedAt: new Date(Date.parse('2026-10-14T00:00:00Z') + ++banco.seq) } : {}) }, tx)
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
  })

  const MAPA: Record<string, Tabela> = { ItemDeLote: 'itensDeLote', ItemDePlano: 'itensDePlano', Page: 'pages', Generation: 'generations', Project: 'projects' }
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
      const posts = [...banco.posts.values()].filter((p) => p.pageId === valores[0]).sort((a, b) => String(a.id).localeCompare(String(b.id)))
      for (const p of posts) await travar(`posts:${p.id}`, tx, modo)
      evento(`travou-posts-da-pagina:${posts.map((p) => p.id).join(',')}`)
      return posts.map((p) => ({ id: p.id, status: p.status, laterPostId: p.laterPostId ?? null, postType: p.postType, generationId: p.generationId ?? null, projectId: p.projectId, pageId: p.pageId }))
    }
    if (nomeDaTabela === 'CustomFont') {
      for (const f of [...banco.customFonts.values()].filter((f) => f.projectId === valores[0])) await travar(`customFonts:${f.id}`, tx, modo)
      evento('travou-fontes')
      return []
    }
    const t = MAPA[nomeDaTabela]
    if (!t) throw new Error(`SQL inesperado no banco falso: ${sql.slice(0, 80)}`)
    await travar(`${t}:${valores[0]}`, tx, modo)
    return [{ id: valores[0] }]
  }
  const executeRaw = (tx: Tx) => async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    if (tx.fechada) throw fechada()
    const sql = partes.join('?')
    if (!sql.startsWith('UPDATE "Generation"')) throw new Error(`SQL inesperado no banco falso: ${sql.slice(0, 80)}`)
    if (banco.falharGravacao) {
      banco.falharGravacao = false
      throw new Error('connection reset')
    }
    if (banco.gravacaoSemVinculo) {
      banco.gravacaoSemVinculo = false
      return 0
    }
    const [patch, id, projectId, pageId] = valores as [string, string, number, string]
    const g = banco.generations.get(id)
    const pagina = banco.pages.get(pageId)
    if (!g || g.projectId !== projectId || g.fieldValues?.pageId !== pageId || !pagina || pagina.Template?.projectId !== projectId) return 0
    gravar('generations', id, { ...g, fieldValues: { ...g.fieldValues, ...JSON.parse(patch) } }, tx)
    evento('gate:gravado')
    return 1
  }

  const $transaction = async (fn: (tx: unknown) => Promise<unknown>, opcoes?: { timeout?: number }) => {
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
      const r = await Promise.race([fn(cliente), estouro])
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
  /** Um escritor de FORA (o editor, um worker): pega a trava da linha como o Postgres faria e escreve. */
  const escreverFora = async (t: Tabela, id: string, mutar: (l: Linha) => Linha) => {
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    evento(`fora:quer:${t}:${id}`)
    await travar(`${t}:${id}`, tx, 'update')
    gravar(t, id, mutar(banco[t].get(id)!), null)
    for (const soltar of tx.travas.values()) soltar()
  }
  /** Uma linha NOVA (que nenhuma trava de linha impede), de fora. */
  const inserirFora = (t: Tabela, linha: Linha) => gravar(t, linha.id, { createdAt: ++banco.seq, ...linha }, null)
  /** Um escritor de fora que SEGURA a trava da linha por `ms` (um worker no meio da escrita): quem precisar dela espera. */
  const segurarFora = async (t: Tabela, id: string, ms: number) => {
    const tx: Tx = { travas: new Map(), escritas: [], espera: 0, fechada: false }
    await travar(`${t}:${id}`, tx, 'update')
    evento(`fora:segura:${t}:${id}`)
    await new Promise((r) => setTimeout(r, ms))
    evento(`fora:solta:${t}:${id}`)
    for (const soltar of tx.travas.values()) soltar()
  }
  return { db: { ...delegados(null), $transaction }, escreverFora, inserirFora, segurarFora }
})

vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/compositor/pastas', async () => {
  const { formatoDaPaginaGravada } = await import('@/lib/compositor/formato')
  return {
    formatoDaPagina: (p: { tags?: string[]; width: number; height: number }) => formatoDaPaginaGravada(p),
    refilarPaginasDoPost: async () => {
      efeitos.refilagens++
      return { avisos: [], falhou: false }
    },
  }
})
vi.mock('@/lib/creatives/agendar', () => ({
  resolverAgendamento: async (input: Linha) => ({ input, avisos: [], quando: new Date(input.scheduledDatetime), project: { userId: 'dono', name: 'Cliente' } }),
  criarPostDoAgendamento: async (tx: { socialPost: { create: (a: Linha) => Promise<Linha> } }, r: { input: Linha }) =>
    tx.socialPost.create({
      data: {
        projectId: r.input.projectId, pageId: r.input.pageId, generationId: r.input.generationId, postType: r.input.postType, status: 'DRAFT',
        scheduledDatetime: new Date(r.input.scheduledDatetime), mediaUrls: [], renderStatus: 'PENDING', laterPostId: null, publishType: r.input.lembrete ? 'REMINDER' : 'DIRECT',
      },
      select: { id: true },
    }),
  efeitosDoAgendamento: async () => {
    efeitos.agendamento++
    return { falhas: [] }
  },
  contextoDosEfeitos: () => ({}),
}))
vi.mock('@/lib/notifications/reminder-notifier', () => ({ sendPublishReminder: async () => void efeitos.lembretes++ }))

/** O download que pode ficar PRESO (C21): nunca resolve; rejeita só pelo sinal — e conta os abortos que recebeu. */
const pendurar = (sinal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    rede.pendurados++
    sinal?.addEventListener('abort', () => {
      rede.abortos++
      reject(sinal.reason instanceof Error ? sinal.reason : new Error('abortado'))
    })
  })
const bytesDaDataUrl = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
vi.mock('@/lib/posts/register-project-fonts', () => ({
  registerProjectFonts: async (_projectId: number, opcoes?: { signal?: AbortSignal }) => (rede.pendurar === 'fonte' ? pendurar(opcoes?.signal) : undefined),
  fetchBuffer: async (url: string, opcoes?: { signal?: AbortSignal }) => {
    if (rede.pendurar === 'assunto') return pendurar(opcoes?.signal)
    if (url.startsWith('data:')) return bytesDaDataUrl(url)
    throw new Error(`sem rede no teste: ${url.slice(0, 40)}`)
  },
  familiasNaoCarregadas: async () => new Set<string>(),
}))
vi.mock('@/lib/compositor/legibilidade-da-logo', async (original) => {
  const real = await original<typeof import('@/lib/compositor/legibilidade-da-logo')>()
  return { ...real, medirLogosDaPeca: async (args: Parameters<typeof real.medirLogosDaPeca>[0]) => (rede.pendurar === 'logo' ? pendurar() : real.medirLogosDaPeca(args)) }
})
vi.mock('@napi-rs/canvas', async (original) => {
  const m = await original<typeof import('@napi-rs/canvas')>()
  // As famílias sintéticas não existem no ambiente: declaradas presentes só para `fontesQueFaltam` (artefato do teste).
  const GlobalFonts = new Proxy(m.GlobalFonts, {
    get(alvo, prop, receptor) {
      if (prop === 'has') return () => true
      const v = Reflect.get(alvo, prop, receptor)
      return typeof v === 'function' ? v.bind(alvo) : v
    },
  })
  return { ...m, GlobalFonts, loadImage: (...args: Parameters<typeof m.loadImage>) => (rede.pendurar === 'regua' ? pendurar() : m.loadImage(...args)) }
})
vi.mock('@/lib/creatives/revisao/revisar-arte', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/creatives/revisao/revisar-arte')>()
  const { medida, metrica, leitura, medidaDaLogo } = await import('../../creatives/revisao/__tests__/suporte/corpus-do-gate')
  const { formatoDaPaginaGravada } = await import('@/lib/compositor/formato')
  type Camada = { id: string; type: string; visible?: boolean }
  const SEM_FUNDO = { assunto: null, assuntoNaoSeAplica: true as const, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' }
  // Página COM foto de fundo (cenarioReal): o contexto diz um assunto de CATÁLOGO numa região sem texto — coerente com a página
  // (o gate vê a `bg-foto`; dizer "sem foto" aqui é entrada contraditória e, com o caso C em 'humano', iria ao humano).
  // O retângulo fica entre o apoio (y 560) e o serviço (y 1500): nenhuma caixa de texto o cruza.
  const COM_CATALOGO = { assunto: { rect: { x: 0, y: 900, width: 1080, height: 500 }, origem: 'catalogo' as const } }
  // Caso C: a foto foi LIDA e não tem assunto localizável — a política efetiva (owner, 17/10/2026) manda ao humano.
  const FOTO_SEM_ASSUNTO = { assunto: null, assuntoNaoSeAplica: true as const, motivoSemAssunto: 'a foto foi lida e não tem assunto localizável (mapa de calma sem região forte): nada a proteger' }
  const temFotoDeFundo = (camadas: Camada[]) => camadas.some((l) => l.visible !== false && (l.id === 'bg-foto' || l.type === 'image'))
  const assuntoDa = (camadas: Camada[]) => (temFotoDeFundo(camadas) ? (medicao.assunto === 'nenhum' ? FOTO_SEM_ASSUNTO : COM_CATALOGO) : SEM_FUNDO)
  return {
    ...real,
    contextoDaMedicao: async (args: Parameters<typeof real.contextoDaMedicao>[0]) => {
      medicao.chamadas.push({
        naTransacao: (args.cliente as { __tx?: boolean } | undefined)?.__tx === true,
        camadas: args.camadas,
        composicaoReaproveitavel: args.composicaoReaproveitavel,
        generationDaPeca: args.generationDaPeca === undefined ? undefined : (args.generationDaPeca?.id ?? null),
        nomeDaPagina: args.page.name,
      })
      if (medicao.modo === 'real') return real.contextoDaMedicao(args)
      return {
        projectId: args.projectId,
        canvas: { width: args.page.width, height: args.page.height },
        formato: formatoDaPaginaGravada(args.page),
        background: '#000000',
        faixa: [0.45, 0.9] as [number, number],
        referencias: { headline: { fontSize1080: 84, entrelinha: null, origem: 'assinatura' } },
        referencia: 'assinatura',
        ...assuntoDa(args.camadas as Camada[]),
        origensDaLogo: new Map(),
        cacheDeLogos: new Map(),
        cliente: args.cliente,
        sinal: args.sinal,
      }
    },
    medirCamadasDaPeca: async (camadas: Camada[], ctx: Parameters<typeof real.medirCamadasDaPeca>[1], opcoes?: { corrigir?: boolean }) => {
      banco.eventos.push({ e: 'medicao', t: Date.now() })
      await medicao.durante?.()
      const modo = medicao.fila.shift() ?? medicao.modo
      if (modo === 'real') return real.medirCamadasDaPeca(camadas as never, ctx, opcoes)
      if (modo === 'lenta') await new Promise((r) => setTimeout(r, 150))
      const base = modo === 'outra-pagina' ? camadasLimpas('outra') : camadas
      const textos = (base as Camada[]).filter((l) => l.type === 'text' && l.visible !== false)
      const logos = (base as Camada[]).filter((l) => l.type === 'logo' && l.visible !== false)
      return medida({
        canvas: ctx.canvas,
        formato: ctx.formato,
        camadas: base as never,
        metricas: textos.map((l) => metrica(l as never)),
        referencias: ctx.referencias as never,
        leituraDaLogo: logos.map((l) => leitura(l.id, medidaDaLogo())),
        ...assuntoDa(base as Camada[]),
        ...(modo === 'reprovada' ? { geometria: [{ tipo: 'colisao', camadas: ['headline', 'apoio'], layerIds: ['headline', 'apoio'], px: 60, detalhe: 'sobrepõem' } as never] } : {}),
      })
    },
  }
})

import type { Layer } from '@/types/template'
import { db } from '@/lib/db'
import { agendarItensDoLote, AVISO_EFEITOS_NAO_RODAM_NO_DRAFT_ONLY, MOTIVO_RASCUNHO_JA_EXISTENTE, PRAZO_DA_MEDICAO_MS, type ItemAgendadoDoLote } from '../agendar-itens'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { chaveDasFontes, comTravaPorChave } from '@/lib/trava-por-chave'
import { dataUrl } from '../../direcao-de-arte/__tests__/suporte/fixture'
import { fotoSintetica, logoSintetica } from '../../direcao-de-arte/__tests__/suporte/sinteticos'

const { escreverFora, inserirFora, segurarFora } = (await import('@/lib/db')) as unknown as {
  escreverFora: (t: Tabela, id: string, mutar: (l: Linha) => Linha) => Promise<void>
  inserirFora: (t: Tabela, l: Linha) => void
  segurarFora: (t: Tabela, id: string, ms: number) => Promise<void>
}

const PROJETO = 8
const LOTE = 'dot-8-2026-S42'
const QUANDO = '2026-10-14 10:00'
const ASSINATURA = 'assinatura-story'

// ─── A peça limpa: fundo liso, três textos claros, sem foto e sem logo (a mesma do controle de P11) ───
function camadasLimpas(sufixo = ''): Layer[] {
  const texto = (id: string, papel: string, y: number, fontSize: number): Layer =>
    ({ id, name: id, type: 'text', visible: true, locked: false, order: 3, content: `Texto ${id}${sufixo}`, position: { x: 100, y }, size: { width: 880, height: Math.round(fontSize * 1.5) }, style: { fontSize, lineHeight: 1.2, textAlign: 'left', color: '#FFFFFF' }, metadata: { compositor: { papel } } }) as Layer
  return [texto('headline', 'headline', 400, 84), texto('apoio', 'apoio', 560, 40), texto('servico', 'servico', 1500, 32)]
}
const copyDe = (camadas: Layer[]) => ({
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat' },
  revisoes: [],
  blocos: camadas.filter((l) => l.type === 'text').map((l, i) => ({ id: l.id, funcao: (l.metadata as Linha)?.compositor?.papel ?? l.id, ordem: i, linhas: String(l.content).split('\n') })),
})
const URL_DA_ARTE = (g: string) => `https://blob.test/${g}.png`

function pagina(id: string, opcoes: { formato?: 'story' | 'feed'; layers?: Layer[]; audio?: unknown; copy?: unknown } = {}) {
  const formato = opcoes.formato ?? 'story'
  const layers = opcoes.layers ?? camadasLimpas()
  const linha = {
    id, templateId: 42, isTemplate: false, name: `Página ${id}`, tags: ['compositor', formato], width: 1080, height: formato === 'story' ? 1920 : 1350,
    background: '#000000', layers, copyAutoral: opcoes.copy ?? copyDe(layers), audio: opcoes.audio ?? null, thumbnail: null, updatedAt: new Date('2026-10-14T00:00:00Z'), Template: { projectId: PROJETO },
  }
  banco.pages.set(id, linha)
  return linha
}
function peca(id: string, pageId: string, opcoes: { formato?: 'story' | 'feed'; renderizadaDe?: Linha; composicao?: Linha; quando?: string } = {}) {
  const pag = banco.pages.get(pageId)!
  const renderizada = opcoes.renderizadaDe ?? pag
  const linha = {
    id, projectId: PROJETO, status: 'COMPLETED', resultUrl: URL_DA_ARTE(id), slideOrder: null, sourcePageId: null, createdAt: ++banco.seq,
    fieldValues: {
      source: 'compositor', pageId, versaoRenderizada: versaoDaPagina(renderizada as { width: number; height: number; background?: string | null; layers: unknown }, { audio: renderizada.audio ?? null }),
      composicao: opcoes.composicao ?? { assinatura: { pageId: ASSINATURA } },
      spec: { projectId: PROJETO, formato: opcoes.formato ?? 'story', quando: opcoes.quando ?? QUANDO, tema: 'tema', blocos: [{ papel: 'headline', linhas: ['Texto headline'] }] },
    },
  }
  banco.generations.set(id, linha)
  return linha
}
function item(itemId: string, generationId: string) {
  banco.itensDeLote.set(`lote-${itemId}`, { id: `lote-${itemId}`, projectId: PROJETO, loteId: LOTE, itemId, generationId, postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null })
  return { itemId }
}
/** O cenário padrão: uma peça limpa pronta para agendar (página p1, Generation g1, item i1). */
function cenarioLimpo() {
  pagina('p1')
  peca('g1', 'p1')
  return item('i1', 'g1')
}
const agendar = (itens: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
  agendarItensDoLote({ projectId: PROJETO, loteId: LOTE, itens, apenasRascunho: true, principal: { tipo: 'user', id: 'dot' }, ...extra })
const eventos = () => banco.eventos.map((x) => x.e)
const depoisDe = (marca: string) => {
  const i = eventos().lastIndexOf(marca)
  return i < 0 ? [] : eventos().slice(i + 1)
}
const posts = () => [...banco.posts.values()]
const registroDe = (g: string) => (banco.generations.get(g)!.fieldValues as Linha).gateDaArte as Linha | undefined

beforeEach(() => {
  for (const t of ['pages', 'generations', 'posts', 'itensDeLote', 'itensDePlano', 'projects', 'customFonts'] as const) banco[t].clear()
  banco.filas.clear()
  banco.eventos = []
  banco.seq = 0
  banco.timeoutDaTransacao = null
  banco.deadlockEm = null
  banco.falharGravacao = false
  banco.gravacaoSemVinculo = false
  banco.falharLeituraDaPaginaFora = 0
  banco.aoRollback = null
  banco.aoTravarAgenda = null
  medicao.modo = 'limpa'
  medicao.fila = []
  medicao.chamadas = []
  medicao.durante = null
  rede.pendurar = null
  rede.pendurados = 0
  rede.abortos = 0
  efeitos.agendamento = 0
  efeitos.refilagens = 0
  efeitos.lembretes = 0
  banco.projects.set(String(PROJETO), { id: PROJETO, name: 'Cliente', userId: 'dono', instagramAccountId: null, assinatura: { gradiente: { forcaMinima: 0.45, forcaMaxima: 0.9 } } })
  banco.customFonts.set('f1', { id: 'f1', projectId: PROJETO, fontFamily: 'Sintetica Display', fileUrl: 'https://blob.test/f1.otf' })
  banco.pages.set(ASSINATURA, { id: ASSINATURA, templateId: 7, isTemplate: true, name: 'Assinatura — story', tags: [], width: 1080, height: 1920, background: '#FFFFFF', layers: camadasLimpas(), copyAutoral: null, audio: null, Template: { projectId: PROJETO } })
})
afterEach(() => {
  vi.useRealTimers()
})

// ─────────────────────────────────────────────────────────────────────────

describe('C1 — draft-only, criar, peça APTO: a ordem da transação', () => {
  it('travas (agenda, fontes, item, posts da página, página, Generation, FOR SHARE) → medição pela transação → registro → INSERT do post → CAS da linha → commit; revisao APTO', async () => {
    const i1 = cenarioLimpo()
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho', revisao: { tipo: 'medida', resultado: 'APTO', versaoDoGate: 'gate-v4' }, achados: [], motivos: [] })
    const ordem = eventos().filter((e) => /^(trava|trava-share|travou|medicao|gate:gravado|insert:post|escrita:itensDeLote|commit)/.test(e))
    expect(ordem).toEqual([
      `trava:adv:agenda-slot:${PROJETO}`,
      `trava:adv:fontes:${PROJETO}`,
      'trava:itensDeLote:lote-i1',
      'travou-posts-da-pagina:',
      'trava:pages:p1',
      'trava:generations:g1',
      `trava-share:projects:${PROJETO}`,
      `trava-share:pages:${ASSINATURA}`,
      'trava-share:customFonts:f1',
      'travou-fontes',
      'medicao',
      'gate:gravado',
      'insert:post',
      'escrita:itensDeLote:lote-i1',
      'commit',
    ])
    // A medição leu pela TRANSAÇÃO (não pelo db), as camadas reais da página, com a composição reaproveitável e a Generation da peça.
    expect(medicao.chamadas).toEqual([{ naTransacao: true, camadas: banco.pages.get('p1')!.layers, composicaoReaproveitavel: true, generationDaPeca: 'g1', nomeDaPagina: 'Página p1' }])
    expect(registroDe('g1')).toMatchObject({ gate: { resultado: 'APTO' }, origem: 'agendar-leva', principal: { tipo: 'user', id: 'dot' }, identidade: { projectId: PROJETO, generationId: 'g1', pageId: 'p1' } })
    expect(posts()).toHaveLength(1)
  })
})

describe('C2/C3 — peça reprovada: nenhum post; o commit leva só o registro; o registro anterior não decide nada', () => {
  it('C2: falhou REVISAO_HUMANA_NECESSARIA com generationId, pageId, editUrl, achados e motivos; o commit só tem o UPDATE do registro', async () => {
    const i1 = cenarioLimpo()
    medicao.modo = 'reprovada'
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', editUrl: 'https://studio.test/templates/42/editor?pageId=p1', revisao: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA' } })
    expect((r.itens[0].achados ?? []).some((a) => a.regra === 'colisao' && a.camadas.includes('headline'))).toBe(true)
    expect(r.itens[0].motivos?.map((m) => m.regra)).toContain('colisao')
    expect(posts()).toEqual([])
    expect(eventos().filter((e) => e.startsWith('escrita:'))).toEqual(['escrita:generations:g1'])
    expect(eventos()).toContain('commit')
    expect(registroDe('g1')).toMatchObject({ gate: { resultado: 'REVISAO_HUMANA_NECESSARIA' } })
    expect(banco.itensDeLote.get('lote-i1')!.postId).toBeNull()
  })

  it('C3: Generation JÁ com registro APTO coincidente + medida nova reprovada → igual a C2; o registro novo substitui o antigo; o resultado não depende do registro gravado', async () => {
    const i1 = cenarioLimpo()
    // 1ª chamada: APTO de verdade, registro gravado — e o rascunho criado é apagado pela equipe (a linha volta a zero).
    await agendar([i1])
    const anterior = registroDe('g1')!
    expect(anterior.gate.resultado).toBe('APTO')
    banco.posts.clear()
    banco.itensDeLote.set('lote-i1', { ...banco.itensDeLote.get('lote-i1')!, postId: null, hashDoAgendamento: null })
    banco.eventos = []
    medicao.modo = 'reprovada'
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA' })
    expect(posts()).toEqual([])
    expect(registroDe('g1')).toMatchObject({ gate: { resultado: 'REVISAO_HUMANA_NECESSARIA' } })
    expect(registroDe('g1')!.medidoEm >= anterior.medidoEm).toBe(true)
    // O mesmo cenário com um registro REPROVADO antigo e a medida limpa → APTO: o que decide é a medida de agora.
    banco.eventos = []
    medicao.modo = 'limpa'
    expect((await agendar([i1])).itens[0]).toMatchObject({ desfecho: 'criado', revisao: { resultado: 'APTO' } })
  })
})

describe('C4 — edição concorrente da página espera a trava; a chamada seguinte mede a versão nova', () => {
  it('a escrita do editor só aplica depois do commit; a 1ª chamada mediu as camadas de antes e a 2ª as de depois', async () => {
    const i1 = cenarioLimpo()
    const antes = banco.pages.get('p1')!.layers
    const depois = camadasLimpas(' editado')
    let edicao: Promise<void> | null = null
    medicao.durante = () => {
      edicao = escreverFora('pages', 'p1', (p) => ({ ...p, layers: depois, copyAutoral: copyDe(depois), updatedAt: new Date('2026-10-14T01:00:00Z') }))
    }
    const r1 = await agendar([i1])
    await edicao!
    expect(r1.itens[0]).toMatchObject({ desfecho: 'criado' })
    expect(medicao.chamadas[0].camadas).toEqual(antes)
    const ev = eventos()
    expect(ev.indexOf('fora:quer:pages:p1')).toBeLessThan(ev.indexOf('commit'))
    expect(ev.indexOf('escrita:pages:p1')).toBeGreaterThan(ev.indexOf('commit'))
    // A repetição (linha já ligada) não mede; uma peça NOVA da mesma página mede a versão nova.
    peca('g2', 'p1')
    const i2 = item('i2', 'g2')
    banco.posts.clear()
    await agendar([i2])
    expect(medicao.chamadas.at(-1)!.camadas).toEqual(depois)
  })
})

describe('C5 — medida de OUTRA página: sem vínculo, sem achados', () => {
  it('REVISAO_HUMANA_NECESSARIA com revisao.tipo sem-vinculo, nenhum post, nenhum registro', async () => {
    const i1 = cenarioLimpo()
    medicao.modo = 'outra-pagina'
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', revisao: { tipo: 'sem-vinculo' } })
    expect(r.itens[0].achados).toBeUndefined()
    expect(posts()).toEqual([])
    expect(eventos()).not.toContain('gate:gravado')
  })
})

describe('C5b/C12 — adotar e o post aprovado', () => {
  const rascunho = (extra: Linha = {}) =>
    banco.posts.set('d1', { id: 'd1', projectId: PROJETO, pageId: 'p1', postType: 'STORY', status: 'DRAFT', scheduledDatetime: new Date('2026-10-14T13:00:00Z'), mediaUrls: [], renderStatus: 'PENDING', generationId: 'g1', laterPostId: null, createdAt: 1, ...extra })

  it('adota o rascunho DRAFT da peça: um dos travados, medido APTO, nada escrito no post', async () => {
    const i1 = cenarioLimpo()
    rascunho()
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ desfecho: 'adotado', postId: 'd1', revisao: { tipo: 'medida', resultado: 'APTO' } })
    expect(eventos()).toContain('travou-posts-da-pagina:d1')
    expect(banco.posts.get('d1')).toMatchObject({ status: 'DRAFT', generationId: 'g1' })
    expect(eventos().filter((e) => e.startsWith('escrita:posts'))).toEqual([])
  })

  it('DRAFT STORY numa página FEED → sem vínculo (o formato pede POST)', async () => {
    pagina('p1', { formato: 'feed' })
    peca('g1', 'p1', { formato: 'feed' })
    const i1 = item('i1', 'g1')
    rascunho({ postType: 'STORY' })
    expect((await agendar([i1])).itens[0]).toMatchObject({ codigo: 'REVISAO_HUMANA_NECESSARIA', revisao: { tipo: 'sem-vinculo' } })
  })

  it('generationId nulo ou de OUTRA arte → REVISAO_HUMANA_NECESSARIA (decisão 8.5), sem medir e sem tocar no post', async () => {
    const i1 = cenarioLimpo()
    for (const generationId of [null, 'g-outra']) {
      rascunho({ generationId })
      banco.eventos = []
      medicao.chamadas = []
      const r = await agendar([i1])
      expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', postId: 'd1', generationId: 'g1', pageId: 'p1', editUrl: 'https://studio.test/templates/42/editor?pageId=p1', revisao: { tipo: 'nao-medida' } })
      expect(r.itens[0].motivo).toMatch(/outra arte/)
      expect(medicao.chamadas).toEqual([])
      expect(banco.posts.get('d1')!.generationId).toBe(generationId)
      // A simulação dá a mesma resposta, com as mesmas referências.
      const sim = await agendar([i1], { simular: true })
      expect(sim.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', postId: 'd1', generationId: 'g1', pageId: 'p1', editUrl: expect.stringContaining('pageId=p1'), revisao: { tipo: 'nao-medida' } })
    }
  })

  it('DRAFT que virou SCHEDULED entre as duas decisões → POST_APROVADO_INTOCAVEL, como hoje', async () => {
    const i1 = cenarioLimpo()
    rascunho()
    banco.aoTravarAgenda = () => void banco.posts.set('d1', { ...banco.posts.get('d1')!, status: 'SCHEDULED' })
    expect((await agendar([i1])).itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'POST_APROVADO_INTOCAVEL' })
    expect(medicao.chamadas).toEqual([])
  })

  it('página com música → não medida (o CP5a manda ao humano), nenhum post', async () => {
    // A trilha como o editor grava (`fatiaDaMusica`): música da biblioteca com fatia — a página é um vídeo.
    pagina('p1', { audio: { source: 'library', musicId: 'm1', startTime: 0, endTime: 15 } })
    peca('g1', 'p1')
    const i1 = item('i1', 'g1')
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ codigo: 'REVISAO_HUMANA_NECESSARIA', revisao: { tipo: 'nao-medida' } })
    expect(r.itens[0].revisao).toMatchObject({ motivo: expect.stringMatching(/música|vídeo/i) })
    expect(posts()).toEqual([])
  })

  it('C12: página com post aprovado (SCHEDULED) ou entregue (laterPostId) → POST_APROVADO_INTOCAVEL antes de medir', async () => {
    const i1 = cenarioLimpo()
    for (const extra of [{ status: 'SCHEDULED' }, { laterPostId: 'z1' }]) {
      rascunho(extra)
      medicao.chamadas = []
      banco.eventos = []
      expect((await agendar([i1])).itens[0]).toMatchObject({ codigo: 'POST_APROVADO_INTOCAVEL' })
      expect(medicao.chamadas).toEqual([])
      expect(eventos()).not.toContain('gate:gravado')
    }
  })
})

describe('C6/C7 — efeitos pós-commit e o fluxo humano', () => {
  it('C6: no draft-only, depois do COMMIT nenhuma escrita acontece; efeitos nunca rodam; o carimbo fica nulo; o aviso é o fixo', async () => {
    const i1 = cenarioLimpo()
    const r = await agendar([i1])
    expect(r.itens[0].avisos).toContain(AVISO_EFEITOS_NAO_RODAM_NO_DRAFT_ONLY)
    expect(depoisDe('commit').filter((e) => e.startsWith('escrita:'))).toEqual([])
    expect(efeitos).toMatchObject({ agendamento: 0, refilagens: 0 })
    expect(banco.itensDeLote.get('lote-i1')!.efeitosDoAgendamentoEm).toBeNull()
    // Reaproveitar (linha já ligada, efeitos pendentes): devolve como está, sem rodar nada e SEM veredito desta chamada.
    banco.eventos = []
    const r2 = await agendar([i1])
    expect(r2.itens[0]).toMatchObject({ desfecho: 'reaproveitado', revisao: { tipo: 'nao-medida', motivo: MOTIVO_RASCUNHO_JA_EXISTENTE } })
    expect(r2.itens[0].avisos).toContain(AVISO_EFEITOS_NAO_RODAM_NO_DRAFT_ONLY)
    expect(eventos().filter((e) => e.startsWith('escrita:'))).toEqual([])
    expect(efeitos.agendamento).toBe(0)
    // A repetição HUMANA do mesmo pedido (perfil normal, mesmo hash) encontra os efeitos pendentes e os completa.
    const humana = await agendar([i1], { apenasRascunho: false })
    expect(humana.itens[0]).toMatchObject({ desfecho: 'reaproveitado' })
    expect(humana.itens[0].revisao).toBeUndefined()
    expect(efeitos.agendamento).toBe(1)
    expect(banco.itensDeLote.get('lote-i1')!.efeitosDoAgendamentoEm).toBeInstanceOf(Date)
  })

  it('C7: perfil normal, a mesma peça: sem medição, sem registro, sem travas novas, sem revisao; os efeitos rodam como hoje', async () => {
    const i1 = cenarioLimpo()
    const r = await agendar([i1], { apenasRascunho: false })
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado' })
    expect(r.itens[0].revisao).toBeUndefined()
    expect(r.itens[0].achados).toBeUndefined()
    expect(medicao.chamadas).toEqual([])
    expect(eventos()).not.toContain('gate:gravado')
    expect(eventos().filter((e) => /adv:fontes|travou-posts|trava:generations|trava-share/.test(e))).toEqual([])
    expect(eventos().filter((e) => e.startsWith('trava'))).toEqual([`trava:adv:agenda-slot:${PROJETO}`, 'trava:itensDeLote:lote-i1', 'trava:pages:p1'])
    expect(efeitos.agendamento).toBe(1)
    expect(registroDe('g1')).toBeUndefined()
  })
})

describe('C8 — simular no draft-only: mede e decide pelo leitor, não grava nada', () => {
  it('reprovada → falhou igual à chamada de verdade; limpa → concluido com revisao; zero escritas, nem o registro', async () => {
    const i1 = cenarioLimpo()
    medicao.modo = 'reprovada'
    const s1 = await agendar([i1], { simular: true })
    expect(s1.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', editUrl: expect.stringContaining('pageId=p1'), revisao: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA' } })
    expect(s1.itens[0].avisos).toContain('Simulação: nada foi gravado.')
    medicao.modo = 'limpa'
    const s2 = await agendar([i1], { simular: true })
    expect(s2.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho', revisao: { tipo: 'medida', resultado: 'APTO' }, achados: [], motivos: [] })
    expect(eventos().filter((e) => e.startsWith('escrita:') || e === 'gate:gravado' || e.startsWith('trava'))).toEqual([])
    expect(medicao.chamadas.every((c) => !c.naTransacao)).toBe(true)
    expect(registroDe('g1')).toBeUndefined()
  })
})

describe('C10/C18 — exceções do gate e o prazo da transação', () => {
  it('C10: gravarGateDaArte lança → rollback, falhou REVISAO_HUMANA_NECESSARIA (não ERRO), nenhum post', async () => {
    const i1 = cenarioLimpo()
    banco.falharGravacao = true
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', editUrl: expect.stringContaining('pageId=p1'), revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/connection reset/) } })
    expect(posts()).toEqual([])
    expect(eventos()).toContain('rollback')
    expect(registroDe('g1')).toBeUndefined()
  })

  it('C10/§ 6: a página muda de PASTA (templateId) depois da leitura sem trava; o timeout recusa com o editUrl do template ATUAL', async () => {
    const i1 = cenarioLimpo()
    banco.timeoutDaTransacao = 40
    medicao.modo = 'lenta'
    // Entre a decisão sem trava e as travas, a refilagem move a página para a pasta 99.
    banco.aoTravarAgenda = () => void banco.pages.set('p1', { ...banco.pages.get('p1')!, templateId: 99 })
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ codigo: 'REVISAO_HUMANA_NECESSARIA', editUrl: 'https://studio.test/templates/99/editor?pageId=p1' })
    await new Promise((resolve) => setTimeout(resolve, 200))
  })

  it('C10/§ 6: a gravação falha E a releitura da página depois do rollback também falha → ainda REVISAO_HUMANA_NECESSARIA (não ERRO), com as referências e o link da leitura de antes', async () => {
    const i1 = cenarioLimpo()
    banco.falharGravacao = true
    banco.aoRollback = () => void (banco.falharLeituraDaPaginaFora = 1)
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', editUrl: 'https://studio.test/templates/42/editor?pageId=p1', revisao: { tipo: 'nao-medida' } })
    expect(posts()).toEqual([])
  })

  it('C10/§ 6: a página some depois do rollback → recusa com generationId, pageId e revisao, SEM editUrl (não há template atual confirmado)', async () => {
    const i1 = cenarioLimpo()
    banco.falharGravacao = true
    banco.aoRollback = () => void banco.pages.delete('p1')
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', revisao: { tipo: 'nao-medida' } })
    expect(r.itens[0].editUrl).toBeUndefined()
  })

  it('C10: o registro APTO não grava (0 linhas: sem vínculo) → RecusaSobTrava, rollback, REVISAO_HUMANA_NECESSARIA com editUrl e revisao; nenhum post', async () => {
    const i1 = cenarioLimpo()
    banco.gravacaoSemVinculo = true
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', editUrl: expect.stringContaining('pageId=p1'), revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/sem-vinculo/) } })
    expect(posts()).toEqual([])
    expect(eventos()).toContain('rollback')
  })

  it('C18: timeout da transação durante a medição → recusa REVISAO_HUMANA_NECESSARIA sem post parcial; travas liberadas (a próxima chamada não espera)', async () => {
    const i1 = cenarioLimpo()
    banco.timeoutDaTransacao = 40
    medicao.modo = 'lenta'
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', editUrl: expect.stringContaining('pageId=p1'), revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/prazo/) } })
    expect(posts()).toEqual([])
    // A medição lenta ainda termina em segundo plano: a transação FECHADA recusa a gravação e o post — nada vaza.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(posts()).toEqual([])
    expect(registroDe('g1')).toBeUndefined()
    banco.timeoutDaTransacao = null
    medicao.modo = 'limpa'
    banco.eventos = []
    const t0 = Date.now()
    expect((await agendar([i1])).itens[0]).toMatchObject({ desfecho: 'criado' })
    expect(Date.now() - t0).toBeLessThan(2_000)
  })

  it('C18: o orçamento no banco falso — a espera por um escritor que SEGURA a Generation da peça aparece separada da medição e do resto', async () => {
    const i1 = cenarioLimpo()
    // Um worker segura a linha da Generation da peça por 120 ms: o gate ESPERA por ela (trava de linha), e a espera é medida à parte.
    const segurando = segurarFora('generations', 'g1', 120)
    while (!eventos().includes('fora:segura:generations:g1')) await new Promise((r) => setImmediate(r))
    const chamada = agendar([i1])
    await segurando
    const r = await chamada
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado' })
    const ev = eventos()
    // O primeiro `trava:generations:g1` é o do worker; o do gate vem DEPOIS de ele soltar.
    expect(ev.lastIndexOf('trava:generations:g1')).toBeGreaterThan(ev.indexOf('fora:solta:generations:g1'))
    const t = (e: string) => banco.eventos.find((x) => x.e === e)!.t
    const espera = Number(ev.find((e) => e.startsWith('espera:'))!.slice(7))
    const medicaoMs = t('gate:gravado') - t('medicao')
    const resto = t('commit') - t('gate:gravado')
    const total = t('commit') - t('tx:inicio')
    console.info(`[C18] espera pelas travas ${espera} ms · medição ${medicaoMs} ms · resto ${resto} ms · total ${total} ms`)
    expect(espera).toBeGreaterThanOrEqual(80)
    expect(total).toBeGreaterThanOrEqual(espera)
    expect(medicaoMs).toBeLessThan(10_000)
    expect(total).toBeLessThan(20_000)
  })
})

describe('C11 — lembrete no draft-only', () => {
  it('o DRAFT nasce REMINDER; o lembrete do WhatsApp e o publicador nunca são chamados pelo agendamento', async () => {
    const i1 = cenarioLimpo()
    const r = await agendar([{ ...i1, lembrete: true }])
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado', estadoDoPost: 'rascunho' })
    expect(posts()[0]).toMatchObject({ status: 'DRAFT', publishType: 'REMINDER' })
    expect(efeitos.lembretes).toBe(0)
  })
})

describe('C13 — deadlock e a intercalação com ajustar-arte', () => {
  it('deadlock detectado pelo Postgres (40P01) numa trava do gate → LOTE_AGENDAMENTO_CONCORRENTE ("repita"), nunca ERRO; nada escrito', async () => {
    const i1 = cenarioLimpo()
    banco.deadlockEm = 'Generation'
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'LOTE_AGENDAMENTO_CONCORRENTE', motivo: expect.stringMatching(/Repita/) })
    expect(posts()).toEqual([])
    expect(eventos()).toContain('rollback')
  })

  it('ajustar-arte (posts da página ORDER BY id FOR UPDATE → Page) durante o gate: espera o commit, sem espera cruzada; dois posts na página adquiridos na mesma ordem', async () => {
    const i1 = cenarioLimpo()
    banco.posts.set('d2', { id: 'd2', projectId: PROJETO, pageId: 'p1', postType: 'STORY', status: 'DRAFT', scheduledDatetime: new Date('2026-10-14T13:00:00Z'), mediaUrls: [], renderStatus: 'PENDING', generationId: 'g1', laterPostId: null, createdAt: 2 })
    banco.posts.set('d1', { id: 'd1', projectId: PROJETO, pageId: 'p1', postType: 'STORY', status: 'DRAFT', scheduledDatetime: new Date('2026-10-14T13:00:00Z'), mediaUrls: [], renderStatus: 'PENDING', generationId: 'g1', laterPostId: null, createdAt: 1 })
    let ajuste: Promise<unknown> | null = null
    medicao.durante = () => {
      // O que `ajustarArte` faz na transação da página (arte-rapida.ts): posts da página em ORDER BY id, depois a página.
      ajuste = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "status"::text AS status, "laterPostId" FROM "SocialPost" WHERE "pageId" = ${'p1'} ORDER BY "id" FOR UPDATE`
        await tx.$queryRaw`SELECT "id" FROM "Page" WHERE "id" = ${'p1'} FOR UPDATE`
        await tx.page.update({ where: { id: 'p1' }, data: { name: 'ajustada' } })
      })
    }
    const r = await agendar([i1])
    await ajuste!
    expect(r.itens[0]).toMatchObject({ desfecho: 'adotado' })
    const ev = eventos()
    expect(ev).toContain('travou-posts-da-pagina:d1,d2')
    // O ajuste só escreveu DEPOIS do commit do gate, e os dois commits aconteceram (sem espera cruzada).
    expect(ev.indexOf('escrita:pages:p1')).toBeGreaterThan(ev.indexOf('commit'))
    expect(ev.filter((e) => e === 'commit')).toHaveLength(2)
  })
})

/**
 * C13 — intercalação. LIMITE DITO: a prova é da SEQUÊNCIA SQL de `ajustarArte` reproduzida no banco falso (as duas
 * instruções do arquivo, na ordem do arquivo — o inventário `inventario-gate-agendar-leva.test.ts` confere o texto delas),
 * não da chamada real de `ajustarArte` (render, Blob e fontes são outro harness: `ajustar-arte-concorrencia.test.ts`).
 */
describe('C13 — intercalação: ajustar-arte toma os posts ANTES de o gate chegar a eles', () => {
  const ajusteComoArteRapida = () =>
    db.$transaction(async (tx) => {
      // As DUAS instruções de `ajustarArte` (arte-rapida.ts), na ordem do arquivo: posts da página em ORDER BY id, depois a página.
      await tx.$queryRaw`SELECT "status"::text AS status, "laterPostId" FROM "SocialPost" WHERE "pageId" = ${'p1'} ORDER BY "id" FOR UPDATE`
      await new Promise((r) => setTimeout(r, 40))
      await tx.$queryRaw`SELECT "id" FROM "Page" WHERE "id" = ${'p1'} FOR UPDATE`
      await tx.page.update({ where: { id: 'p1' }, data: { name: 'ajustada' } })
    })

  it('o gate tomou a agenda e o item; o ajuste já tem os posts (d1, d2) e vai pegar a página: o gate espera o commit do ajuste e depois adota — sem espera cruzada, sem deadlock', async () => {
    const i1 = cenarioLimpo()
    for (const id of ['d2', 'd1']) banco.posts.set(id, { id, projectId: PROJETO, pageId: 'p1', postType: 'STORY', status: 'DRAFT', scheduledDatetime: new Date('2026-10-14T13:00:00Z'), mediaUrls: [], renderStatus: 'PENDING', generationId: 'g1', laterPostId: null, createdAt: id === 'd1' ? 1 : 2 })
    let ajuste: Promise<unknown> | null = null
    // Logo depois da trava da agenda (antes do item, dos posts e da página), o ajuste entra e toma os posts primeiro.
    banco.aoTravarAgenda = async () => {
      ajuste = ajusteComoArteRapida()
      while (!eventos().some((e) => e.startsWith('travou-posts-da-pagina:d1,d2'))) await new Promise((r) => setImmediate(r))
    }
    const r = await agendar([i1])
    await ajuste!
    expect(r.itens[0]).toMatchObject({ desfecho: 'adotado', postId: 'd1' })
    const ev = eventos()
    const commitDoAjuste = ev.indexOf('commit')
    // O ajuste travou posts → página e commitou ANTES de o gate conseguir os posts; o gate então adquiriu na mesma ordem (d1, d2) e seguiu.
    expect(ev.indexOf('escrita:pages:p1')).toBeLessThan(commitDoAjuste)
    expect(ev.filter((e) => e === 'travou-posts-da-pagina:d1,d2')).toHaveLength(2)
    expect(ev.lastIndexOf('travou-posts-da-pagina:d1,d2')).toBeGreaterThan(commitDoAjuste)
    expect(ev.filter((e) => e === 'commit')).toHaveLength(2)
    expect(ev).not.toContain('rollback')
    // A MEDIÇÃO leu a página JÁ ajustada (o nome novo chegou ao contexto da medição): é a leitura sob a trava que vale.
    expect(medicao.chamadas.at(-1)!.nomeDaPagina).toBe('ajustada')
    expect(banco.pages.get('p1')!.name).toBe('ajustada')
  })
})

describe('C14 — duas chamadas sobre a MESMA página', () => {
  it('A reprova e B aprova, serializadas pela trava: a ordem de commit define o último registro; o DRAFT só nasce na que aprovou', async () => {
    pagina('p1')
    peca('g1', 'p1')
    peca('g2', 'p1')
    const i1 = item('i1', 'g1')
    const i2 = item('i2', 'g2')
    medicao.fila = ['reprovada', 'limpa']
    const [a, b] = await Promise.all([agendar([i1]), agendar([i2])])
    expect(a.itens[0]).toMatchObject({ codigo: 'REVISAO_HUMANA_NECESSARIA' })
    expect(b.itens[0]).toMatchObject({ desfecho: 'criado' })
    expect(posts()).toHaveLength(1)
    expect(posts()[0].generationId).toBe('g2')
    expect(registroDe('g1')).toMatchObject({ gate: { resultado: 'REVISAO_HUMANA_NECESSARIA' } })
    expect(registroDe('g2')).toMatchObject({ gate: { resultado: 'APTO' } })
    // Nenhuma gravação fora de transação: todo `gate:gravado` está entre um tx:inicio e o seu commit.
    const ev = eventos()
    for (const i of ev.map((e, j) => (e === 'gate:gravado' ? j : -1)).filter((j) => j >= 0)) {
      expect(ev.slice(i).indexOf('commit')).toBeLessThan(ev.slice(i).indexOf('tx:inicio') < 0 ? Infinity : ev.slice(i).indexOf('tx:inicio'))
    }
    expect(ev.filter((e) => e === 'commit')).toHaveLength(2)
  })
})

describe('C15/C15b/C22 — o que a medição lê está travado; o que não entra na decisão não trava', () => {
  it('C15: Project, CustomFont, a página de assinatura e a Generation DA PEÇA esperam o commit; uma Generation ANTIGA da página não espera', async () => {
    const i1 = cenarioLimpo()
    inserirFora('generations', { id: 'g-antiga', projectId: PROJETO, status: 'COMPLETED', resultUrl: URL_DA_ARTE('g-antiga'), sourcePageId: null, fieldValues: { source: 'compositor', pageId: 'p1' } })
    const pendentes: Promise<void>[] = []
    medicao.durante = () => {
      pendentes.push(
        escreverFora('projects', String(PROJETO), (p) => ({ ...p, assinatura: { gradiente: { forcaMinima: 0.6, forcaMaxima: 0.9 } } })),
        escreverFora('customFonts', 'f1', (f) => ({ ...f, fileUrl: 'https://blob.test/f1-v2.otf' })),
        escreverFora('pages', ASSINATURA, (p) => ({ ...p, name: 'Assinatura v2' })),
        escreverFora('generations', 'g1', (g) => ({ ...g, fieldValues: { ...g.fieldValues, composicao: { ...g.fieldValues.composicao, mexida: true } } })),
        escreverFora('generations', 'g-antiga', (g) => ({ ...g, fieldValues: { ...g.fieldValues, worker: 'mexeu' } })),
      )
    }
    const r = await agendar([i1])
    await Promise.all(pendentes)
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado' })
    const ev = eventos()
    const commit = ev.indexOf('commit')
    for (const chave of [`projects:${PROJETO}`, 'customFonts:f1', `pages:${ASSINATURA}`, 'generations:g1']) {
      expect(ev.indexOf(`fora:quer:${chave}`), chave).toBeLessThan(commit)
      expect(ev.lastIndexOf(`escrita:${chave}`), chave).toBeGreaterThan(commit)
    }
    expect(ev.indexOf('escrita:generations:g-antiga')).toBeLessThan(commit)
    // A chamada seguinte (peça nova) mede com o novo: a assinatura renomeada é a que a transação relê.
    expect(banco.pages.get(ASSINATURA)!.name).toBe('Assinatura v2')
  })

  it('C15b: a ROTA de fontes (comTravaPorChave da chave das fontes) espera a trava consultiva do gate; a fonte nova só entra depois do commit', async () => {
    const i1 = cenarioLimpo()
    let insercao: Promise<unknown> | null = null
    medicao.durante = () => {
      insercao = comTravaPorChave(chaveDasFontes(PROJETO), (tx) => tx.customFont.create({ data: { id: 2, projectId: PROJETO, fontFamily: 'Nova', fileUrl: 'https://blob.test/f2.otf', name: 'Nova', uploadedBy: 'u' } }))
    }
    const r = await agendar([i1])
    await insercao!
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado' })
    const ev = eventos()
    expect(ev.indexOf(`trava:adv:fontes:${PROJETO}`)).toBeLessThan(ev.indexOf('medicao'))
    expect(ev.indexOf('escrita:customFonts:2')).toBeGreaterThan(ev.indexOf('commit'))
    expect(banco.customFonts.has('2')).toBe(true)
  })

  it('C22: uma Generation NOVA da página inserida durante a transação não entra: a medição lê só a Generation da peça, e o resultado é o mesmo', async () => {
    const i1 = cenarioLimpo()
    medicao.durante = () => inserirFora('generations', { id: 'g-nova', projectId: PROJETO, status: 'COMPLETED', resultUrl: URL_DA_ARTE('g-nova'), sourcePageId: 'modelo-x', fieldValues: { source: 'compositor', pageId: 'p1', composicao: { assinatura: { pageId: 'outra' } } } })
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado', revisao: { resultado: 'APTO' } })
    expect(medicao.chamadas[0].generationDaPeca).toBe('g1')
    const ev = eventos()
    expect(ev.indexOf('escrita:generations:g-nova')).toBeLessThan(ev.indexOf('commit'))
    expect(ev).not.toContain('trava-share:pages:outra')
  })
})

describe('C17/C19/C20 — tipo do post, decisão que mudou, composição reaproveitável', () => {
  it('C17: o item pede POST numa página story → o vínculo diverge do formato → sem-vinculo (nunca um post do tipo errado)', async () => {
    const i1 = cenarioLimpo()
    const r = await agendar([{ ...i1, postType: 'POST' }])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', revisao: { tipo: 'sem-vinculo', motivo: expect.stringMatching(/POST.*STORY/) } })
    expect(posts()).toEqual([])
  })

  it('C19: a decisão sem trava era criar e, sob a trava, há um rascunho novo da página (adotar) → LOTE_AGENDAMENTO_CONCORRENTE, nada escrito', async () => {
    const i1 = cenarioLimpo()
    banco.aoTravarAgenda = () => void banco.posts.set('d-novo', { id: 'd-novo', projectId: PROJETO, pageId: 'p1', postType: 'STORY', status: 'DRAFT', scheduledDatetime: new Date(), mediaUrls: [], renderStatus: 'PENDING', generationId: 'g1', laterPostId: null, createdAt: 9 })
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'LOTE_AGENDAMENTO_CONCORRENTE' })
    expect(medicao.chamadas).toEqual([])
    expect(eventos().filter((e) => e.startsWith('escrita:'))).toEqual([])
    // A repetição vê o rascunho e o adota (um dos travados).
    expect((await agendar([i1])).itens[0]).toMatchObject({ desfecho: 'adotado', postId: 'd-novo' })
  })

  it('C20: `Page.layers` novo com `versaoRenderizada` antiga → a medição NÃO reaproveita a composição (e mede mesmo assim)', async () => {
    const p1 = pagina('p1')
    peca('g1', 'p1', { renderizadaDe: { ...p1, layers: camadasLimpas(' v0') } })
    const i1 = item('i1', 'g1')
    const r = await agendar([i1])
    expect(r.itens[0]).toMatchObject({ desfecho: 'criado', revisao: { tipo: 'medida' } })
    expect(medicao.chamadas[0].composicaoReaproveitavel).toBe(false)
  })
})

describe('C21 — rede presa em cada caminho: o prazo da medição cobre a cadeia inteira', () => {
  /** Uma peça com foto e logo sintéticas (data URL: o render não vai à rede) para a medição REAL. */
  async function cenarioReal() {
    const foto = dataUrl(await fotoSintetica((_x, y) => (y < 960 ? 40 : 230)))
    const logo = dataUrl(await logoSintetica('#F5F5F5'))
    const layers: Layer[] = [
      { id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: foto, style: { objectFit: 'cover' } } as Layer,
      ...camadasLimpas(),
      { id: 'logo', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 830, y: 220 }, size: { width: 160, height: 80 }, fileUrl: logo, style: { objectFit: 'contain' } } as Layer,
    ]
    pagina('p1', { layers })
    peca('g1', 'p1', { composicao: { assinatura: { pageId: ASSINATURA } } })
    medicao.modo = 'real'
    return item('i1', 'g1')
  }
  /** Espera a cadeia chegar ao ponto preso (tempo real), depois avança o relógio falso até o prazo. */
  async function venceOPrazo(chamada: Promise<unknown>) {
    // `Date.now` é real (só setTimeout é falso): o render da régua leva centenas de ms antes de a cadeia chegar à logo.
    const inicio = Date.now()
    while (rede.pendurados === 0 && Date.now() - inicio < 15_000) await new Promise((r) => setImmediate(r))
    expect(rede.pendurados, 'a cadeia chegou ao ponto preso').toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(PRAZO_DA_MEDICAO_MS + 1)
    return chamada
  }

  for (const caminho of ['fonte', 'assunto', 'logo', 'regua'] as const) {
    it(`${caminho} presa → nao-medida no prazo; nenhum post; nada gravado; as travas são liberadas (a chamada seguinte não espera)`, async () => {
      const i1 = await cenarioReal()
      rede.pendurar = caminho
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const r = (await venceOPrazo(agendar([i1]))) as { itens: ItemAgendadoDoLote[] }
      expect(r.itens[0]).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', generationId: 'g1', pageId: 'p1', revisao: { tipo: 'nao-medida', motivo: expect.stringMatching(/prazo/) } })
      expect(posts()).toEqual([])
      expect(eventos()).not.toContain('gate:gravado')
      // Onde há sinal (fonte, foto do assunto), o download foi ABORTADO de verdade; render e logo não aceitam sinal — o race cobre.
      if (caminho === 'fonte' || caminho === 'assunto') expect(rede.abortos).toBe(1)
      vi.useRealTimers()
      rede.pendurar = null
      medicao.modo = 'limpa'
      banco.eventos = []
      const t0 = Date.now()
      expect((await agendar([i1])).itens[0]).toMatchObject({ desfecho: 'criado' })
      expect(Date.now() - t0).toBeLessThan(5_000)
    }, 60_000)
  }
  it('caso C da política do assunto (owner, 17/10/2026): foto LIDA sem assunto localizável → REVISAO_HUMANA_NECESSARIA por texto-sobre-assunto NAO_COMPROVADA, nenhum DRAFT; com assunto de catálogo a mesma página cria; sem foto de fundo (caso E) cria', async () => {
    const i1 = await cenarioReal()
    medicao.modo = 'limpa'
    medicao.assunto = 'nenhum'
    const r = (await agendar([i1])).itens[0]
    expect(r).toMatchObject({ situacao: 'falhou', codigo: 'REVISAO_HUMANA_NECESSARIA', revisao: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA' } })
    expect((r as { motivos?: Array<{ regra: string; codigo: string }> }).motivos).toEqual([expect.objectContaining({ regra: 'texto-sobre-assunto', codigo: 'NAO_COMPROVADA' })])
    expect(posts()).toEqual([])
    // A mesma página com assunto de CATÁLOGO numa região sem texto: APTO → DRAFT.
    medicao.assunto = 'catalogo'
    expect((await agendar([i1])).itens[0]).toMatchObject({ desfecho: 'criado' })
    expect(posts()).toHaveLength(1)
    // Caso E (sem foto de fundo) não depende da política: cria.
    medicao.assunto = 'nenhum'
    pagina('p2', { layers: camadasLimpas() })
    peca('g2', 'p2', { quando: '2026-10-22 10:00' }) // outro horário: o DRAFT de i1 já ocupa o padrão
    expect((await agendar([item('i2', 'g2')])).itens[0]).toMatchObject({ desfecho: 'criado' })
    medicao.assunto = 'catalogo'
  })


  /**
   * C18 (sintético). LIMITE DITO: o contrato fala em "benchmark sintético do CP3"; não existe um harness com esse nome no
   * repositório (o "benchmark REA" da fixture é externo). O que há de sintético são as páginas de `sinteticos.ts` (CP0/CP2):
   * três delas, com foto e textos, medidas de VERDADE dentro da transação falsa — medição, resto e total por página.
   */
  it('C18 (sintético): a medição REAL de três páginas sintéticas, dentro da transação, cabe no orçamento — medição, resto e total', async () => {
    const tempos: Array<{ espera: number; medicao: number; resto: number; total: number }> = []
    for (const [n, luz] of [[1, (_x: number, y: number) => (y < 960 ? 40 : 230)], [2, () => 60], [3, (x: number) => (x < 540 ? 30 : 220)]] as const) {
      banco.eventos = []
      banco.pages.delete(`p${n}`)
      const foto = dataUrl(await fotoSintetica(luz))
      const layers: Layer[] = [{ id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: foto, style: { objectFit: 'cover' } } as Layer, ...camadasLimpas()]
      pagina(`p${n}`, { layers })
      peca(`g${n}`, `p${n}`)
      medicao.modo = 'real'
      // Na primeira página, um worker SEGURA a Generation da peça por 150 ms: a espera entra no orçamento da MESMA execução.
      const segurando = n === 1 ? segurarFora('generations', 'g1', 150) : null
      if (segurando) while (!eventos().includes('fora:segura:generations:g1')) await new Promise((r) => setImmediate(r))
      const r = await agendar([item(`i${n}`, `g${n}`)])
      if (segurando) await segurando
      expect(r.itens[0].revisao?.tipo, JSON.stringify(r.itens[0])).toBe('medida')
      const t = (e: string) => banco.eventos.find((x) => x.e === e)!.t
      const espera = Number(eventos().find((e) => e.startsWith('espera:'))!.slice(7))
      tempos.push({ espera, medicao: t('gate:gravado') - t('medicao'), resto: t('commit') - t('gate:gravado'), total: t('commit') - t('tx:inicio') })
    }
    expect(tempos[0].espera).toBeGreaterThanOrEqual(100)
    console.info(`[C18 sintético] por página: ${tempos.map((t) => `espera ${t.espera} ms · medição ${t.medicao} ms · resto ${t.resto} ms · total ${t.total} ms`).join(' | ')}`)
    for (const t of tempos) {
      expect(t.medicao).toBeLessThan(10_000)
      expect(t.total).toBeLessThan(20_000)
    }
  }, 120_000)
})
