/**
 * A MIGRAÇÃO DA VOZ, cliente a cliente (PR 13 de "Marca simples, copy
 * melhor", 12/09/2026). Entregar o script e aplicá-lo são coisas separadas.
 *
 * DRY-RUN (padrão) — só LEITURA: para cada cliente com voz proposta
 * (`scripts/lib/vozes-propostas.ts`) lê o DNA de texto como está e escreve a
 * PRÉVIA (antes × depois, regras aprendidas cobertas ou não, fatos que a voz
 * recusa) em `<saida>/previa/<id>-<nome>.md`, mais um MANIFESTO em branco
 * (`<saida>/manifesto.json`, tudo `pendente`) com a versão de cada prévia.
 * É o que o Ciro lê antes de decidir.
 *
 * APLICAR (`--aplicar --manifesto <arquivo>`): só faz o que o manifesto
 * decide, por cliente — `migrar` grava a voz proposta, liga a precedência
 * (`migrarParaVoz`, com a versão lida) e leva à base os fatos LISTADOS no
 * manifesto (trecho exato da prévia + categoria + título; nada por
 * inferência); `manter-legado` e `pendente` não escrevem nada. Prévia que
 * mudou desde a aprovação (DNA editado, voz retocada) BLOQUEIA o cliente:
 * refaça a prévia e peça aprovação nova. Cliente já migrado é `ja-migrado`.
 *
 * Onde roda: o banco é o do `.env` (PRODUÇÃO) para a prévia ser a real.
 * Aplicar em produção exige `--producao` explícito (e o PR 7 na main, com o
 * schema `BrandVoice` confirmado); `--dev` aponta para o branch de dev
 * (`.env.development.local`) — é como a prova de integração roda.
 *
 * USO:
 *   npx tsx scripts/migrar-voz-da-marca.ts [--projeto <id>] [--saida <pasta>] [--dev]
 *   npx tsx scripts/migrar-voz-da-marca.ts --aplicar --manifesto <arquivo> [--dev | --producao] [--saida <pasta>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { VOZES_PROPOSTAS, PROJETOS_COM_VOZ_PROPOSTA } from './lib/vozes-propostas'
import {
  fatosNoDna,
  lerManifesto,
  manifestoEmBranco,
  montarPrevia,
  planoDeAplicacao,
  previaParaMarkdown,
  versaoDaPrevia,
  type AcaoDoPlano,
  type CategoriaDeFato,
  type DnaDeTexto,
  type EstadoDoCliente,
  type Manifesto,
  type PreviaDaMigracao,
  chaveDoFato,
  isolamentoDoIndexador,
  podeIndexar,
  problemasParaMigrar,
  type DestinoDaAplicacao,
  classificarFato,
  MARCA_DE_INDEXADO,
} from '../src/lib/brand/migracao-da-voz'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const
const VECTOR_KEYS = ['UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN'] as const

function parseEnvFile(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {}
  const out: Record<string, string> = {}
  for (const linhaCrua of readFileSync(caminho, 'utf8').split('\n')) {
    const linha = linhaCrua.trim()
    if (!linha || linha.startsWith('#')) continue
    const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}
function endpointDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}
function abortar(titulo: string, linhas: string[] = []): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  process.exit(1)
}
function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
function flag(nome: string): boolean {
  return process.argv.includes(nome)
}

/** Resolve o banco: `--dev` aponta para o branch de dev; sem ele fica o `.env`. Devolve o endpoint e se ele é a PRODUÇÃO. */
export function resolverBanco(opcoes: { dev: boolean }): { endpoint: string; producao: boolean; destino: DestinoDaAplicacao } {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  if (opcoes.dev) {
    const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))
    if (!dev.DATABASE_URL) abortar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
    for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  }
  // O indexador de vetores da base é ATRIBUÍDO, nunca herdado: em produção o do .env, por cima do que o processo
  // trouxe do ambiente (um UPSTASH_VECTOR_* exportado antes mandaria os vetores para outro índice com o SQL em
  // produção — PR13-09); em dev só o isolado do .env.development.local, senão nenhum.
  const dev = opcoes.dev ? parseEnvFile(resolve(ROOT, '.env.development.local')) : prod
  const indexador = isolamentoDoIndexador(prod, dev)
  const fonteDoIndexador = opcoes.dev ? (indexador === 'isolado' ? dev : {}) : prod
  for (const k of VECTOR_KEYS) {
    if (fonteDoIndexador[k]) process.env[k] = fonteDoIndexador[k]
    else delete process.env[k]
  }
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producaoSet = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
  if (producaoSet.size === 0) abortar('o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.')
  if (!alvo) abortar('DATABASE_URL ilegível.')
  const producao = producaoSet.has(alvo)
  if (opcoes.dev && producao) abortar('--dev pediu o branch de dev, mas o banco resolvido é o de PRODUÇÃO.', [`DATABASE_URL aponta para ${alvo}.`])
  return { endpoint: alvo, producao, destino: { banco: producao ? 'producao' : 'dev', indexador, indexadorUrl: process.env.UPSTASH_VECTOR_REST_URL ?? null } }
}

type Db = Pick<PrismaClient, 'project' | 'brandDNA' | 'brandVoice' | 'knowledgeBaseEntry' | '$queryRaw'>

/**
 * O banco tem a tabela `BrandVoice` (migration do PR 7)? Em produção ela chega
 * com o `db:deploy`, e a PRÉVIA precisa sair ANTES disso. Sondada UMA vez, pelo
 * catálogo do Postgres (não por um erro P2021 a cada cliente, que o Prisma
 * loga antes de lançar). Sem a tabela nenhum cliente pode estar migrado; a
 * prévia sai do mesmo jeito e APLICAR falha em `gravarVoz`, dito por cliente.
 */
let tabelaDeVoz: boolean | null = null
async function temTabelaDeVoz(db: Db): Promise<boolean> {
  if (tabelaDeVoz === null) {
    const r = await db.$queryRaw<Array<{ existe: string | null }>>`SELECT to_regclass('public."BrandVoice"')::text AS existe`
    tabelaDeVoz = Boolean(r[0]?.existe)
  }
  return tabelaDeVoz
}
export function bancoSemTabelaDeVoz(): boolean {
  return tabelaDeVoz === false
}
async function lerRegistroTolerante(db: Db, projectId: number): Promise<{ versao: number; migradaEm: Date | null } | null> {
  if (!(await temTabelaDeVoz(db))) return null
  return db.brandVoice.findUnique({ where: { projectId }, select: { versao: true, migradaEm: true } })
}

export async function lerEstadoDoCliente(db: Db, projectId: number): Promise<{ nome: string; dna: DnaDeTexto; estado: EstadoDoCliente; previa: PreviaDaMigracao } | null> {
  const proposta = VOZES_PROPOSTAS[projectId]
  if (!proposta) return null
  const [projeto, dna, registro] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, userId: true } }),
    db.brandDNA.findUnique({ where: { projectId }, select: { toneOfVoice: true, contentRules: true, updatedAt: true } }),
    lerRegistroTolerante(db, projectId),
  ])
  if (!projeto) return null
  const dnaDeTexto: DnaDeTexto = { toneOfVoice: dna?.toneOfVoice ?? null, contentRules: dna?.contentRules ?? null, updatedAt: dna?.updatedAt ?? null }
  const previa = montarPrevia({ projectId, nome: proposta.nome, dna: dnaDeTexto, voz: proposta.voz })
  const problemasDaVoz = problemasParaMigrar(proposta.voz)
  const estado: EstadoDoCliente = {
    versaoDaPreviaAtual: versaoDaPrevia({ dna: dnaDeTexto, voz: proposta.voz }),
    trechosDeFato: fatosNoDna(dnaDeTexto).map((f) => f.trecho),
    registro: registro ? { versao: registro.versao, migradaEm: registro.migradaEm } : null,
    vozValida: problemasDaVoz.length === 0,
    problemasDaVoz,
  }
  return { nome: proposta.nome, dna: dnaDeTexto, estado, previa }
}

export async function gerarPrevias(db: Db, ids: number[]): Promise<PreviaDaMigracao[]> {
  const previas: PreviaDaMigracao[] = []
  for (const id of ids) {
    const lido = await lerEstadoDoCliente(db, id)
    if (lido) previas.push(lido.previa)
  }
  return previas
}

export interface FatoACriar {
  projectId: number
  categoria: CategoriaDeFato
  titulo: string
  trecho: string
  validaAte: string | null
  versaoDaPrevia: string
  /** `chaveDoFato(projectId, versaoDaPrevia, trecho)` — a identidade durável, gravada em `metadata.chaveDoFato`. */
  chave: string
}

export interface ResultadoDaAplicacao {
  projectId: number
  nome: string
  acao: AcaoDoPlano['acao']
  motivo?: string
  vozVersao?: number
  migradaEm?: string
  /** Contados mesmo quando a aplicação termina em `erro`: é o que uma retomada precisa saber. */
  fatosCriados?: number
  fatosJaExistentes?: number
  /** Linhas que existiam SEM a marca de indexado (interrupção entre o SQL e o vetor) e foram reindexadas (PR13-11). */
  fatosReindexados?: number
  erro?: string
}

export interface AplicarOpcoes {
  /** Quem grava o fato na base. O padrão é `criarEntradaBase` (indexa na busca); a prova injeta um registrador. */
  criarFato?: (fato: FatoACriar, autor: string) => Promise<void>
  /**
   * O estado do fato com esta chave na base: `ausente`, `incompleto` (linha
   * sem a marca `indexadoEm` — o processo caiu entre o SQL e o vetor) ou
   * `completo`. O padrão consulta `metadata`; a prova injeta o próprio registro.
   */
  estadoDoFato?: (chave: string, projectId: number) => Promise<{ estado: 'ausente' } | { estado: 'incompleto' | 'completo'; entryId: string }>
  /** Reindexa a linha incompleta e a marca como indexada. O padrão é `reindexEntry` + `marcarFatoIndexado`; a prova injeta. */
  reindexarFato?: (entryId: string, fato: FatoACriar, autor: string) => Promise<void>
  /**
   * Onde o registrador PADRÃO vai escrever (o de `resolverBanco`). Sem
   * `criarFato` injetado ele é obrigatório, e dev com indexador de produção
   * BLOQUEIA o cliente antes de qualquer escrita (PR13-01).
   */
  destino?: DestinoDaAplicacao
  agora?: Date
  /** A trava por projeto (PR13-10). O padrão é `travaPorProjeto()`; a prova injeta para simular a concorrência. */
  comTrava?: ComTrava
  /** Costuras para a prova: rodam entre etapas reais e nunca são usadas pelo script. */
  seams?: { antesDeAtivar?: (projectId: number) => Promise<void> }
}

/** O estado do fato com esta chave na base deste projeto (consulta por `metadata.chaveDoFato`; `classificarFato` decide). */
export async function estadoDoFatoNaBase(db: Db, chave: string, projectId: number): Promise<{ estado: 'ausente' } | { estado: 'incompleto' | 'completo'; entryId: string }> {
  const linha = await db.knowledgeBaseEntry.findFirst({ where: { projectId, metadata: { path: ['chaveDoFato'], equals: chave } }, select: { id: true, metadata: true }, orderBy: { createdAt: 'asc' } })
  const estado = classificarFato(linha)
  return estado === 'ausente' || !linha ? { estado: 'ausente' } : { estado, entryId: linha.id }
}

/** A marca durável de indexação concluída, gravada DEPOIS de o vetor existir — a linha existir não prova o vetor (PR13-11). */
export async function marcarFatoIndexado(db: Db, entryId: string, em: Date = new Date()): Promise<void> {
  const linha = await db.knowledgeBaseEntry.findUnique({ where: { id: entryId }, select: { metadata: true } })
  const metadata = linha?.metadata && typeof linha.metadata === 'object' && !Array.isArray(linha.metadata) ? (linha.metadata as Record<string, unknown>) : {}
  await db.knowledgeBaseEntry.update({ where: { id: entryId }, data: { metadata: { ...metadata, [MARCA_DE_INDEXADO]: em.toISOString() } as never } })
}

/** A trava por projeto: duas aplicações do mesmo manifesto ao mesmo tempo criariam o mesmo fato duas vezes (PR13-10). */
export function chaveDaTrava(projectId: number): string {
  return `migracao-da-voz:${projectId}`
}

export type ComTrava = <T>(projectId: number, corpo: () => Promise<T>) => Promise<T | { bloqueado: string }>

/**
 * A trava é um advisory lock de TRANSAÇÃO numa CONEXÃO PRÓPRIA (`DIRECT_URL`,
 * sem o pooler — advisory lock por trás do pgbouncer em modo transação não é
 * confiável), aberta só para isto. Não pode ser a conexão do `db` da
 * aplicação: o `DATABASE_URL` da casa tem `connection_limit=1`, e segurar uma
 * transação interativa nela enquanto os serviços de voz e da base consultam o
 * mesmo client esgota o pool (medido na prova, 12/09/2026: "Timed out
 * fetching a new connection… connection limit: 1"). O corpo roda nas conexões
 * de sempre; a transação da trava só existe para segurar a exclusão até a
 * ativação terminar. Quem não consegue a trava é `bloqueado` na hora.
 */
export function travaPorProjeto(url = process.env.DIRECT_URL ?? process.env.DATABASE_URL): ComTrava {
  return async (projectId, corpo) => {
    const { PrismaClient } = await import('@prisma/client')
    const cliente = new PrismaClient({ datasources: { db: { url } } })
    try {
      return await cliente.$transaction(
        async (tx) => {
          const trava = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${chaveDaTrava(projectId)})) AS ok`
          if (!trava[0]?.ok) return { bloqueado: 'outra aplicação da migração deste cliente está em andamento (trava por projeto); tente de novo quando ela terminar' }
          return corpo()
        },
        { maxWait: 30_000, timeout: 10 * 60_000 },
      )
    } finally {
      await cliente.$disconnect().catch(() => undefined)
    }
  }
}

/**
 * Aplica o manifesto: lê o estado ATUAL de cada cliente, monta o plano (puro)
 * e executa só as ações `migrar`. Fatos vão para a base ANTES da migração
 * (um fato perdido depois de a voz assumir é pior do que um fato duplicado
 * do DNA); a voz é gravada com a versão lida e a migração amarra a essa
 * versão. Cliente bloqueado não é adaptado: volta com o motivo.
 */
export async function aplicarManifesto(db: Db, manifesto: Manifesto, opcoes: AplicarOpcoes = {}): Promise<ResultadoDaAplicacao[]> {
  const { gravarVoz, migrarParaVoz } = await import('../src/lib/brand/voz-service')
  // O registrador padrão INDEXA (Upstash Vector). Sem um registrador injetado, o destino tem de estar declarado e
  // o indexador tem de ser o do banco escolhido — senão NENHUM cliente é escrito (PR13-01).
  // O indexador é conferido contra o que o PROCESSO usa agora (process.env), não só contra o destino declarado (PR13-09).
  const indexacao: ReturnType<typeof podeIndexar> = opcoes.criarFato ? { ok: true } : podeIndexar(opcoes.destino, { url: process.env.UPSTASH_VECTOR_REST_URL ?? null })
  const criarFato =
    opcoes.criarFato ??
    (async (fato: FatoACriar, autor: string) => {
      const { criarEntradaBase } = await import('../src/lib/knowledge/entries')
      const entrada = await criarEntradaBase({
        projectId: fato.projectId,
        category: fato.categoria,
        title: fato.titulo,
        content: fato.trecho,
        tags: ['migracao-da-voz'],
        expiresAt: fato.validaAte ? new Date(`${fato.validaAte}T23:59:59-03:00`) : null,
        metadata: { origem: 'migracao-da-voz', versaoDaPrevia: fato.versaoDaPrevia, chaveDoFato: fato.chave },
        autor,
      })
      // `criarEntradaBase` só devolve depois de indexar; a marca durável é o que a retomada lê (PR13-11).
      await marcarFatoIndexado(db, entrada.id)
    })
  const estadoDoFato = opcoes.estadoDoFato ?? ((chave: string, projectId: number) => estadoDoFatoNaBase(db, chave, projectId))
  const reindexarFato =
    opcoes.reindexarFato ??
    (async (entryId: string, fato: FatoACriar, autor: string) => {
      const { reindexEntry } = await import('../src/lib/knowledge/indexer')
      await reindexEntry(entryId, { projectId: fato.projectId, userId: autor })
      await marcarFatoIndexado(db, entryId)
    })
  const estados = new Map<number, EstadoDoCliente>()
  const dnas = new Map<number, DnaDeTexto>()
  const donos = new Map<number, string>()
  for (const c of manifesto.clientes) {
    const lido = await lerEstadoDoCliente(db, c.projectId)
    if (lido) {
      estados.set(c.projectId, lido.estado)
      dnas.set(c.projectId, lido.dna)
    }
    const projeto = await db.project.findUnique({ where: { id: c.projectId }, select: { userId: true } })
    if (projeto) donos.set(c.projectId, projeto.userId)
  }
  const plano = planoDeAplicacao(manifesto, estados)
  const resultados: ResultadoDaAplicacao[] = []
  for (const acao of plano) {
    if (acao.acao !== 'migrar') {
      resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: acao.acao, ...(acao.acao === 'bloqueado' ? { motivo: acao.motivo } : {}) })
      continue
    }
    if (indexacao.ok === false) {
      resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: 'bloqueado', motivo: `indexador da base: ${indexacao.motivo}` })
      continue
    }
    const cliente = manifesto.clientes.find((c) => c.projectId === acao.projectId)!
    const autor = donos.get(acao.projectId)
    const dna = dnas.get(acao.projectId)
    // Contados FORA do try: uma falha no meio devolve quantos fatos já estão na base (a retomada não os recria).
    let fatosCriados = 0
    let fatosJaExistentes = 0
    let fatosReindexados = 0
    try {
      if (!autor) throw new Error('projeto sem dono (userId) para assinar as entradas da base')
      if (!dna) throw new Error('o DNA de texto aprovado não foi lido')
      // A TRAVA por projeto (advisory lock do Postgres, em conexão própria — ver `travaPorProjeto`): duas aplicações
      // do mesmo manifesto ao mesmo tempo leriam "chave ausente" as duas e criariam o fato (e os vetores) duas
      // vezes — a chave em JSON não tem unicidade (PR13-10). Quem não consegue a trava é bloqueado, sem esperar.
      const comTrava = opcoes.comTrava ?? travaPorProjeto()
      const desfecho = await comTrava(acao.projectId, async () => {
          for (const f of acao.fatos) {
            const chave = chaveDoFato({ projectId: acao.projectId, versaoDaPrevia: cliente.versaoDaPrevia, trecho: f.trecho })
            const fato: FatoACriar = { projectId: acao.projectId, categoria: f.categoria, titulo: f.titulo, trecho: f.trecho, validaAte: f.validaAte ?? null, versaoDaPrevia: cliente.versaoDaPrevia, chave }
            const estado = await estadoDoFato(chave, acao.projectId)
            if (estado.estado === 'completo') {
              fatosJaExistentes++
              continue
            }
            if (estado.estado === 'incompleto') {
              // A linha existe sem a marca: o processo anterior caiu entre o SQL e o vetor. Reindexar pelo MESMO id.
              await reindexarFato(estado.entryId, fato, autor)
              fatosReindexados++
              continue
            }
            await criarFato(fato, autor)
            fatosCriados++
          }
          const gravada = await gravarVoz({ projectId: acao.projectId, voz: VOZES_PROPOSTAS[acao.projectId].voz, ...(acao.versaoEsperadaDaVoz > 0 ? { versaoEsperada: acao.versaoEsperadaDaVoz } : {}) })
          await opcoes.seams?.antesDeAtivar?.(acao.projectId)
          // A ativação confere, na mesma transação dela, que o DNA de texto ainda é o que a prévia aprovada leu (PR13-02).
          const migrada = await migrarParaVoz({ projectId: acao.projectId, versaoEsperada: gravada.versao, em: opcoes.agora, dnaEsperado: { toneOfVoice: dna.toneOfVoice, contentRules: dna.contentRules } })
          return { vozVersao: gravada.versao, migradaEm: migrada.migradaEm.toISOString() }
      })
      if ('bloqueado' in desfecho) {
        resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: 'bloqueado', motivo: desfecho.bloqueado })
        continue
      }
      resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: 'migrar', vozVersao: desfecho.vozVersao, migradaEm: desfecho.migradaEm, fatosCriados, fatosJaExistentes, fatosReindexados })
    } catch (e) {
      resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: 'migrar', erro: e instanceof Error ? e.message : String(e), fatosCriados, fatosJaExistentes, fatosReindexados })
    }
  }
  return resultados
}

function slug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function main() {
  const dev = flag('--dev')
  const aplicar = flag('--aplicar')
  const producaoPedida = flag('--producao')
  const { endpoint, producao, destino } = resolverBanco({ dev })
  const saida = argumento('--saida') ?? '.tmp-migrar-voz'
  mkdirSync(resolve(saida, 'previa'), { recursive: true })
  const { db } = await import('../src/lib/db')
  const projeto = argumento('--projeto')
  const ids = projeto ? [Number(projeto)] : PROJETOS_COM_VOZ_PROPOSTA
  console.log(`banco: ${endpoint}${producao ? ' (PRODUÇÃO)' : ' (dev)'} · modo: ${aplicar ? 'APLICAR' : 'prévia (só leitura)'} · saída: ${saida}`)

  if (!aplicar) {
    const previas = await gerarPrevias(db, ids)
    if (bancoSemTabelaDeVoz()) console.log('  (este banco ainda NÃO tem a tabela BrandVoice — a migration do PR 7 não foi aplicada aqui; a prévia sai do mesmo jeito, e nenhum cliente pode estar migrado)')
    for (const p of previas) {
      const arquivo = resolve(saida, 'previa', `${p.projectId}-${slug(p.nome)}.md`)
      writeFileSync(arquivo, previaParaMarkdown(p))
      const semCorrespondente = p.regrasLegadas.filter((r) => r.situacao === 'sem-correspondente').length
      console.log(`  ${p.projectId} ${p.nome}: prévia ${p.versaoDaPrevia} · DNA ${p.antes.toneOfVoiceChars + p.antes.contentRulesChars} chars → voz ${p.depois.chars} chars · regras legadas ${p.antes.regrasLegadas} (${semCorrespondente} sem correspondente) · fatos no DNA ${p.fatos.noLegado.length}${p.problemasDaVoz.length > 0 ? ' · ⚠️ VOZ INVÁLIDA' : ''}`)
    }
    const manifesto = manifestoEmBranco(previas)
    writeFileSync(resolve(saida, 'manifesto.json'), `${JSON.stringify(manifesto, null, 2)}\n`)
    console.log(`\n${previas.length} prévia(s) em ${resolve(saida, 'previa')}; manifesto em branco em ${resolve(saida, 'manifesto.json')}.`)
    console.log('Para aplicar: preencha decisao (migrar | manter-legado | pendente), aprovadoPor e aprovadoEm por cliente, liste em fatosParaABase os trechos da prévia que devem virar entrada da base, e rode com --aplicar --manifesto <arquivo>.')
    await db.$disconnect()
    return
  }

  const caminho = argumento('--manifesto')
  if (!caminho) abortar('--aplicar exige --manifesto <arquivo>.')
  if (producao && !producaoPedida) abortar('O banco resolvido é o de PRODUÇÃO e --producao não foi pedido.', ['Aplicar em produção exige o PR 7 na main com o schema BrandVoice confirmado, o OK do Ciro e a flag --producao.'])
  const lido = lerManifesto(JSON.parse(readFileSync(resolve(caminho), 'utf8')))
  if (!lido.manifesto) abortar('O manifesto não passa no contrato:', lido.problemas)
  console.log(`indexador de vetores da base: ${destino.indexador}`)
  const resultados = await aplicarManifesto(db, lido.manifesto, { destino })
  for (const r of resultados) {
    const fatos = r.fatosCriados !== undefined ? ` · fatos: ${r.fatosCriados} criado(s), ${r.fatosJaExistentes ?? 0} já na base, ${r.fatosReindexados ?? 0} reindexado(s)` : ''
    console.log(`  ${r.projectId} ${r.nome}: ${r.acao}${r.motivo ? ` — ${r.motivo}` : ''}${r.erro ? ` — ERRO: ${r.erro}` : ''}${r.vozVersao ? ` · voz v${r.vozVersao}, migrada em ${r.migradaEm}` : ''}${fatos}`)
  }
  const arquivo = resolve(saida, `resultado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(arquivo, `${JSON.stringify({ banco: endpoint, producao, manifesto: caminho, resultados }, null, 2)}\n`)
  console.log(`\nresultado em ${arquivo}`)
  await db.$disconnect()
  if (resultados.some((r) => r.erro)) process.exit(1)
}

if (process.argv[1] && /migrar-voz-da-marca\.(ts|js)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
