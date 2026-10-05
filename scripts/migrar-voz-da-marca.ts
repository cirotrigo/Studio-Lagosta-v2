import { randomUUID } from 'node:crypto'
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
  frasesDoDna,
  isolamentoDoCache,
  isolamentoDoIndexador,
  podeIndexar,
  problemasParaMigrar,
  type DestinoDaAplicacao,
  classificarFato,
  MARCA_DE_INDEXADO,
  CICLO_DE_INDEXACAO,
  divergenciasDoFato, type FatoEsperado,
  mesmoBanco,
  type LinhaDoFato,
  nomeDoBancoDe,
  computeDe as endpointDe,
  trechosRepetidos,
  ehPooler,
} from '../src/lib/brand/migracao-da-voz'
import { cicloDeIndexacaoDe, ehIndexacaoEmAndamento, metadataComoObjeto, perdeuOArrendamento } from '../src/lib/knowledge/marca-de-indexado'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const
const VECTOR_KEYS = ['UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN'] as const
const REDIS_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const

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
    // DIRECT_URL nunca é preservada de outro ambiente: sem ela no arquivo de dev, vale a própria DATABASE_URL
    // (a trava por projeto usa DIRECT_URL, e trava em outro banco não exclui nada — PR13-13).
    process.env.DATABASE_URL = dev.DATABASE_URL
    process.env.DIRECT_URL = dev.DIRECT_URL || dev.DATABASE_URL
  }
  if (!mesmoBanco(process.env.DIRECT_URL, process.env.DATABASE_URL)) {
    abortar('DIRECT_URL e DATABASE_URL apontam para bancos diferentes: as escritas iriam para um e a trava por projeto para outro.', [`DATABASE_URL → ${endpointDe(process.env.DATABASE_URL)}`, `DIRECT_URL → ${endpointDe(process.env.DIRECT_URL)}`])
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
  // O CACHE de busca (Redis) pela mesma régua (PR13-30): `invalidateProjectCache` roda ao criar e ao reindexar um
  // fato, e o Redis de produção herdado do .env em --dev teria a versão do cache de PRODUÇÃO incrementada. Em dev
  // só o Redis isolado do .env.development.local; sem ele, sem as variáveis — o cache vira no-op limpo.
  const cache = isolamentoDoCache(prod, dev)
  const fonteDoCache = opcoes.dev ? (cache === 'isolado' ? dev : {}) : prod
  for (const k of REDIS_KEYS) {
    if (fonteDoCache[k]) process.env[k] = fonteDoCache[k]
    else delete process.env[k]
  }
  if (opcoes.dev && cache !== 'isolado') console.log('  cache de busca (Redis): desligado neste processo — o .env.development.local não declara um UPSTASH_REDIS_* próprio (PR13-30)')
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
  const problemasDaVoz = problemasParaMigrar(proposta.voz, dnaDeTexto)
  const estado: EstadoDoCliente = {
    versaoDaPreviaAtual: versaoDaPrevia({ dna: dnaDeTexto, voz: proposta.voz }),
    trechosDeFato: fatosNoDna(dnaDeTexto).map((f) => f.trecho),
    frasesDoDna: frasesDoDna(dnaDeTexto),
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
  criarFato?: (fato: FatoACriar, autor: string, signal?: AbortSignal) => Promise<void>
  /**
   * O estado do fato com esta chave na base: `ausente`, `incompleto` (linha
   * sem a marca `indexadoEm` — o processo caiu entre o SQL e o vetor) ou
   * `completo`. O padrão consulta `metadata`; a prova injeta o próprio registro.
   */
  estadoDoFato?: (chave: string, projectId: number) => Promise<EstadoDoFatoNaBase>
  /** Reindexa a linha incompleta e a marca como indexada. O padrão é `reindexEntry` + `marcarFatoIndexado`; a prova injeta. */
  reindexarFato?: (entryId: string, fato: FatoACriar, autor: string, signal?: AbortSignal) => Promise<void>
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

export type EstadoDoFatoNaBase = { estado: 'ausente' } | { estado: 'incompleto' | 'completo'; entryId: string; linha: LinhaDoFato }

/** O estado do fato com esta chave na base deste projeto (consulta por `metadata.chaveDoFato`; `classificarFato` decide), COM a linha para conferir (PR13-14). */
export async function estadoDoFatoNaBase(db: Db, chave: string, projectId: number): Promise<EstadoDoFatoNaBase> {
  const linha = await db.knowledgeBaseEntry.findFirst({ where: { projectId, metadata: { path: ['chaveDoFato'], equals: chave } }, select: { id: true, metadata: true, content: true, category: true, status: true, expiresAt: true }, orderBy: { createdAt: 'asc' } })
  const estado = classificarFato(linha)
  return estado === 'ausente' || !linha ? { estado: 'ausente' } : { estado, entryId: linha.id, linha: { content: linha.content, category: linha.category, status: linha.status, expiresAt: linha.expiresAt } }
}

const TENTATIVAS_DA_MARCA = 5

/**
 * A marca durável de indexação concluída, gravada DEPOIS de o vetor existir — a linha existir não prova o vetor (PR13-11).
 *
 * Toca SÓ a chave da marca, por compare-and-set no `updatedAt` lido (e no token do ciclo, quando há um), relendo e
 * reconstruindo o metadata a cada conflito (PR13-48). Gravar o objeto capturado na leitura apagava o que uma edição
 * coordenada salvasse no meio — a edição de metadata da pessoa não troca o token, então a conferência só do token
 * deixava a escrita passar por cima dela.
 */
export async function marcarFatoIndexado(db: Db, entryId: string, em: Date = new Date(), signal?: AbortSignal, ciclo?: string): Promise<void> {
  for (let tentativa = 0; tentativa < TENTATIVAS_DA_MARCA; tentativa++) {
    const linha = await db.knowledgeBaseEntry.findUnique({ where: { id: entryId }, select: { metadata: true, updatedAt: true } })
    // A posse pode ter se perdido enquanto a leitura esperava (PR13-23): a marca de indexado de uma execução que
    // perdeu a trava faria a retomada ler `completo` uma linha que outra aplicação ainda está reindexando.
    if (signal?.aborted) throw new Error('a posse da trava se perdeu antes de gravar a marca de indexado: esta execução não a grava')
    if (!linha) throw new Error(`a entrada ${entryId} não existe mais: a marca de indexado não é gravada por esta execução`)
    // Com o token do ciclo (PR13-39), a marca só é publicada se NENHUMA outra indexação assumiu a entrada no meio
    // (a API administrativa de reindex não participa da trava): conferido na leitura E no próprio `updateMany`.
    const desteCiclo = { path: [CICLO_DE_INDEXACAO], equals: ciclo }
    if (ciclo && cicloDeIndexacaoDe(linha.metadata) !== ciclo) {
      throw new Error(`outra indexação assumiu a entrada ${entryId} durante esta (ciclo ${ciclo} não é mais o atual): a marca de indexado não é gravada por esta execução`)
    }
    const r = await db.knowledgeBaseEntry.updateMany({
      where: { id: entryId, updatedAt: linha.updatedAt, ...(ciclo ? { metadata: desteCiclo } : {}) },
      data: {
        metadata: { ...metadataComoObjeto(linha.metadata), [MARCA_DE_INDEXADO]: em.toISOString() } as never,
        updatedAt: new Date(Math.max(Date.now(), linha.updatedAt.getTime() + 1)),
      },
    })
    if (r.count === 1) return
    // A linha mudou entre a leitura e a escrita: relê e decide de novo (o token trocado é recusado na leitura).
  }
  throw new Error(`a entrada ${entryId} mudou ${TENTATIVAS_DA_MARCA} vezes seguidas enquanto a marca de indexado era publicada: ela não foi gravada`)
}

/**
 * O registrador PADRÃO de um fato novo: `criarEntradaBase` (grava e indexa) e a marca durável de indexado
 * (PR13-11). O ciclo é gerado AQUI, entregue a `criarEntradaBase` e publicado com o ciclo que ela devolve —
 * o token que a indexação carimbou (PR13-40). Com o token descartado no meio, todo fato novo caía num falso
 * "outra indexação assumiu a entrada".
 */
export async function criarFatoPeloIndexador(db: Db, fato: FatoACriar, autor: string, signal?: AbortSignal): Promise<void> {
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
  }, { signal, ciclo: randomUUID() })
  // `criarEntradaBase` só devolve depois de indexar; a marca durável é o que a retomada lê (PR13-11).
  if (signal?.aborted) throw new Error('a posse da trava se perdeu depois de indexar: a marca de indexado não é gravada por esta execução')
  await marcarFatoIndexado(db, entrada.id, new Date(), signal, entrada.ciclo)
}

/** O reindexador PADRÃO da linha incompleta: `reindexEntry` pelo MESMO id e a marca com o ciclo que ele devolve. */
export async function reindexarFatoPeloIndexador(db: Db, entryId: string, fato: FatoACriar, autor: string, signal?: AbortSignal): Promise<void> {
  const { reindexEntry } = await import('../src/lib/knowledge/indexer')
  const { ciclo } = await reindexEntry(entryId, { projectId: fato.projectId, userId: autor }, { signal })
  if (signal?.aborted) throw new Error('a posse da trava se perdeu depois de reindexar: a marca de indexado não é gravada por esta execução')
  await marcarFatoIndexado(db, entryId, new Date(), signal, ciclo)
  // A criação normal invalida o cache de busca do projeto (`criarEntradaBase`); a RETOMADA por
  // reindexação também tem de invalidar, senão uma busca cacheada no intervalo da falha continua
  // devolvendo o resultado sem o fato até o TTL (PR13-26). Best-effort, como na criação.
  if (signal?.aborted) return
  const { invalidateProjectCache } = await import('../src/lib/knowledge/cache')
  await invalidateProjectCache(fato.projectId).catch((e) => console.error('[migrar-voz] invalidateProjectCache falhou depois da reindexação:', e))
}

/**
 * A entrada do fato está sendo indexada por OUTRA execução (arrendamento vigente, ou tomado no meio — PR13-41):
 * o cliente é BLOQUEADO com o motivo, sem gravar voz nem ativar; a próxima aplicação retoma pela chave do fato.
 * `null` para qualquer outro erro, que segue como erro.
 */
export function motivoDeBloqueioPorIndexacao(erro: unknown, fato: Pick<FatoACriar, 'trecho'>): string | null {
  if (!ehIndexacaoEmAndamento(erro) && !perdeuOArrendamento(erro)) return null
  return `o fato "${fato.trecho.slice(0, 60)}" está sendo indexado por outra execução — ${erro.message}. Nada da voz foi gravado; aplique de novo depois`
}

/** A trava por projeto: duas aplicações do mesmo manifesto ao mesmo tempo criariam o mesmo fato duas vezes (PR13-10). */
export function chaveDaTrava(projectId: number): string {
  return `migracao-da-voz:${projectId}`
}

/**
 * O que o corpo recebe (PR13-15/18): `conferir()` confirma que a conexão da
 * trava continua viva — e LANÇA se ela se perdeu; `vigiar(promessa)` embrulha
 * uma escrita LONGA (criar/reindexar fato, que espera embeddings) numa corrida
 * com a vigilância da trava: perdida a trava no meio, a promessa embrulhada é
 * abandonada com erro e a aplicação para ali. O que já está em voo no
 * indexador não tem como ser cancelado (ele não recebe sinal de aborto) — o
 * que se garante é que NENHUMA escrita nova começa e que a aplicação não
 * segue para a voz.
 */
export interface TravaViva {
  conferir: () => Promise<void>
  /**
   * Embrulha uma escrita LONGA: `escrita(signal)` recebe um `AbortSignal` que é DISPARADO quando a vigilância
   * constata a perda da posse (PR13-20) — as escritas da base (`criarEntradaBase`/`reindexEntry`) conferem o sinal
   * antes de cada etapa e param sem compensar. A promessa é abandonada com erro.
   */
  vigiar: <T>(escrita: (signal: AbortSignal) => Promise<T>) => Promise<T>
  /** O `pg_backend_pid()` da sessão que detém a trava — a prova usa para derrubá-la de verdade. */
  pid: number
}
export type ComTrava = <T>(projectId: number, corpo: (trava: TravaViva) => Promise<T>) => Promise<T | { bloqueado: string }>

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
/** Uma URL do Postgres com `connection_limit=1`: a trava de SESSÃO mora numa conexão, e o client não pode rotacionar. */
function comUmaConexao(url: string): string {
  const u = new URL(url)
  u.searchParams.set('connection_limit', '1')
  return u.toString()
}

export function travaPorProjeto(
  url = process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  opcoes: {
    /** Costura da prova: devolve `false` para simular a perda da conexão da trava. Nunca usada pelo script. */
    travaViva?: () => boolean
    /**
     * Costura da prova: recebe o pid da sessão da trava assim que ela é tomada e um `executar` que roda SQL NESSA
     * sessão — é como a prova a derruba de verdade pelo servidor (`SET idle_session_timeout`), sem privilégio.
     */
    aoTravar?: (sessao: { pid: number; executar: (sql: string) => Promise<void> }) => void
    /** Intervalo da vigilância durante uma escrita longa (ms). */
    vigiaMs?: number
  } = {},
): ComTrava {
  return async (projectId, corpo) => {
    // A trava só vale no MESMO banco das escritas (PR13-13/16): em outro compute, ou em outro banco do mesmo compute,
    // ela não exclui ninguém (advisory lock é por banco).
    if (!url || !mesmoBanco(url, process.env.DATABASE_URL)) {
      return { bloqueado: `a conexão da trava por projeto (${endpointDe(url) ?? 'ilegível'}/${nomeDoBancoDe(url) ?? '?'}) não é o banco das escritas (${endpointDe(process.env.DATABASE_URL) ?? 'ilegível'}/${nomeDoBancoDe(process.env.DATABASE_URL) ?? '?'}); confira DIRECT_URL/DATABASE_URL antes de aplicar` }
    }
    // Trava de sessão por trás do POOLER (PgBouncer em modo transação) não fixa um backend: duas aplicações podem
    // "reentrar" na mesma trava e o unlock pode rodar em outro backend. Só conexão DIRETA (PR13-19).
    if (ehPooler(url)) {
      return { bloqueado: `a trava por projeto exige conexão DIRETA ao Postgres, e a URL da trava passa pelo pooler (${endpointDe(url) ?? 'ilegível'}-pooler): defina DIRECT_URL com o endpoint direto (sem "-pooler") antes de aplicar` }
    }
    const { PrismaClient } = await import('@prisma/client')
    // Trava de SESSÃO (`pg_try_advisory_lock`) numa conexão própria e ÚNICA — não de transação: transação tem
    // timeout, e uma que expirasse liberaria a exclusão com o corpo ainda escrevendo (PR13-15). A trava de sessão
    // vive enquanto a conexão viver; morre com o processo (e aí não há mais escritas). Liberada no fim.
    const cliente = new PrismaClient({ datasources: { db: { url: comUmaConexao(url) } } })
    const chave = chaveDaTrava(projectId)
    let travada = false
    let pid = 0
    try {
      // A trava e o pid da sessão que a detém, na MESMA consulta: é a identidade que `conferir` exige de volta.
      const trava = await cliente.$queryRaw<Array<{ ok: boolean; pid: number }>>`SELECT pg_try_advisory_lock(hashtext(${chave})) AS ok, pg_backend_pid() AS pid`
      if (!trava[0]?.ok) return { bloqueado: 'outra aplicação da migração deste cliente está em andamento (trava por projeto); tente de novo quando ela terminar' }
      travada = true
      pid = Number(trava[0].pid)
      opcoes.aoTravar?.({ pid, executar: async (sql) => { await cliente.$executeRawUnsafe(sql) } })
      /**
       * Conferir a POSSE, nunca "tentar pegar de novo": depois de uma reconexão do client a chave pode estar livre,
       * `pg_try_advisory_lock` devolveria `true` por ADQUIRIR uma trava nova, e a leitura como reentrância seguiria
       * sem exclusão (PR13-21). O que se confere é: a sessão ainda é a original (`pg_backend_pid()` igual) e ela
       * detém a trava em `pg_locks`. Sessão trocada invalida a execução para sempre.
       */
      const conferir = async () => {
        try {
          if (opcoes.travaViva && !opcoes.travaViva()) throw new Error('conexão da trava perdida (simulada pela prova)')
          const posse = await cliente.$queryRaw<Array<{ pid: number; detida: boolean }>>`
            SELECT pg_backend_pid() AS pid,
                   EXISTS (
                     SELECT 1 FROM pg_locks
                      WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid() AND objsubid = 1
                        AND classid = ((hashtext(${chave})::bigint >> 32) & 4294967295)::oid
                        AND objid = (hashtext(${chave})::bigint & 4294967295)::oid
                   ) AS detida`
          const agora = posse[0]
          if (!agora || Number(agora.pid) !== pid) throw new Error(`a sessão da trava trocou (pid ${pid} → ${agora ? agora.pid : '?'}): a conexão original caiu`)
          if (!agora.detida) throw new Error('a sessão da trava não a detém mais')
        } catch (e) {
          const detalhe = e instanceof Error ? e.message.split('\n')[0].trim() : String(e)
          throw new Error(`a trava por projeto se perdeu antes desta escrita — a aplicação parou aqui para não concorrer com outra: ${detalhe || 'a conexão da trava caiu (o servidor a encerrou)'}`)
        }
      }
      const vigiar = async <T,>(escrita: (signal: AbortSignal) => Promise<T>): Promise<T> => {
        const controlador = new AbortController()
        let parar = false
        const promessa = escrita(controlador.signal)
        const vigia = (async () => {
          while (!parar) {
            await new Promise((r) => setTimeout(r, opcoes.vigiaMs ?? 1000))
            if (parar) return undefined as never
            try {
              await conferir()
            } catch (e) {
              // Perdida a posse: o sinal manda a escrita parar antes da próxima etapa (e sem compensar) — PR13-20.
              controlador.abort(e instanceof Error ? e : new Error(String(e)))
              throw e
            }
          }
          return undefined as never
        })()
        try {
          return await Promise.race([promessa, vigia])
        } finally {
          parar = true
          // A promessa abandonada não pode virar "unhandled rejection" quando terminar sozinha.
          promessa.catch(() => undefined)
        }
      }
      return await corpo({ conferir, vigiar, pid })
    } finally {
      if (travada) await cliente.$queryRaw`SELECT pg_advisory_unlock(hashtext(${chave}))`.catch(() => undefined)
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
  const criarFato = opcoes.criarFato ?? ((fato: FatoACriar, autor: string, signal?: AbortSignal) => criarFatoPeloIndexador(db, fato, autor, signal))
  const estadoDoFato = opcoes.estadoDoFato ?? ((chave: string, projectId: number) => estadoDoFatoNaBase(db, chave, projectId))
  const reindexarFato = opcoes.reindexarFato ?? ((entryId: string, fato: FatoACriar, autor: string, signal?: AbortSignal) => reindexarFatoPeloIndexador(db, entryId, fato, autor, signal))
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
      const desfecho = await comTrava(acao.projectId, async (trava) => {
          // Trecho repetido no mesmo cliente é a mesma identidade de fato duas vezes: duas linhas numa só aplicação
          // (PR13-17). `lerManifesto` já recusa; aqui é a última porta antes de escrever.
          const repetidos = trechosRepetidos(acao.fatos)
          if (repetidos.length > 0) return { bloqueado: `fatosParaABase repete trecho — ${repetidos.map((r) => `"${r.trecho.slice(0, 50)}" (posições ${r.posicoes.join(', ')})`).join('; ')}: corrija o manifesto` }
          // 1ª passada, SEM escrever: o estado de cada fato e a conferência da linha encontrada. Linha editada ou
          // arquivada não é o fato aprovado — nem se reutiliza, nem se reindexa: bloqueia para decisão (PR13-14).
          const fatos = acao.fatos.map((f) => {
            const chave = chaveDoFato({ projectId: acao.projectId, versaoDaPrevia: cliente.versaoDaPrevia, trecho: f.trecho })
            const fato: FatoACriar = { projectId: acao.projectId, categoria: f.categoria, titulo: f.titulo, trecho: f.trecho, validaAte: f.validaAte ?? null, versaoDaPrevia: cliente.versaoDaPrevia, chave }
            return fato
          })
          const estados = await Promise.all(fatos.map((f) => estadoDoFato(f.chave, acao.projectId)))
          const divergentes = estados.flatMap((e, i) => (e.estado === 'ausente' ? [] : divergenciasDoFato(e.linha, fatos[i]).map((d) => `"${fatos[i].trecho.slice(0, 60)}" (${e.entryId}): ${d}`)))
          if (divergentes.length > 0) return { bloqueado: `linha da base com a chave do fato não é mais o fato aprovado — decida antes de aplicar: ${divergentes.join('; ')}` }
          // 2ª passada: as escritas, cada uma depois de conferir que a trava continua viva (PR13-15).
          for (const [i, fato] of fatos.entries()) {
            const estado = estados[i]
            if (estado.estado === 'completo') {
              fatosJaExistentes++
              continue
            }
            await trava.conferir()
            try {
              if (estado.estado === 'incompleto') {
                // A linha existe sem a marca: o processo anterior caiu entre o SQL e o vetor. Reindexar pelo MESMO id.
                await trava.vigiar((signal) => reindexarFato(estado.entryId, fato, autor, signal))
                fatosReindexados++
                continue
              }
              await trava.vigiar((signal) => criarFato(fato, autor, signal))
              fatosCriados++
            } catch (e) {
              const bloqueio = motivoDeBloqueioPorIndexacao(e, fato)
              if (bloqueio) return { bloqueado: bloqueio }
              throw e
            }
          }
          await trava.conferir()
          // Os ids das linhas que sustentam a voz, relidos POR CHAVE depois das escritas (o registrador padrão não
          // devolve id): a ativação os confere de novo dentro da transação dela (PR13-35).
          const fatosEsperados: FatoEsperado[] = []
          for (const fato of fatos) {
            const estado = await estadoDoFato(fato.chave, acao.projectId)
            if (estado.estado === 'ausente') throw new Error(`o fato "${fato.trecho.slice(0, 60)}" não está na base depois da escrita — nada foi ativado`)
            fatosEsperados.push({ entryId: estado.entryId, trecho: fato.trecho, categoria: fato.categoria, validaAte: fato.validaAte })
          }
          // A releitura acima são consultas por OUTRA conexão, e a sessão da trava pode ter caído enquanto elas
          // esperavam: a posse é conferida de novo IMEDIATAMENTE antes de gravar a voz — quem a perdeu não cria
          // nem incrementa a voz pendente (outra aplicação que tomou a trava e leu a versão anterior falharia no
          // CAS por causa dessa escrita) (PR13-37).
          await trava.conferir()
          // PR13-38: a posse é conferida DENTRO do serviço, depois das leituras dele e imediatamente antes de escrever.
          const gravada = await gravarVoz({ projectId: acao.projectId, voz: VOZES_PROPOSTAS[acao.projectId].voz, ...(acao.versaoEsperadaDaVoz > 0 ? { versaoEsperada: acao.versaoEsperadaDaVoz } : {}), antesDeEscrever: () => trava.conferir() })
          await opcoes.seams?.antesDeAtivar?.(acao.projectId)
          await trava.conferir()
          // A ativação confere, na mesma transação dela, que o DNA de texto ainda é o que a prévia aprovada leu (PR13-02)
          // e que os fatos aprovados continuam na base como foram conferidos (PR13-35).
          const migrada = await migrarParaVoz({ projectId: acao.projectId, versaoEsperada: gravada.versao, em: opcoes.agora, dnaEsperado: { toneOfVoice: dna.toneOfVoice, contentRules: dna.contentRules }, fatosEsperados, antesDeEscrever: () => trava.conferir() })
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
