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
} from '../src/lib/brand/migracao-da-voz'
import { lerVoz } from '../src/lib/brand/voz'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const

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
export function resolverBanco(opcoes: { dev: boolean }): { endpoint: string; producao: boolean } {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  if (opcoes.dev) {
    const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))
    if (!dev.DATABASE_URL) abortar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
    for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  }
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producaoSet = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
  if (producaoSet.size === 0) abortar('o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.')
  if (!alvo) abortar('DATABASE_URL ilegível.')
  const producao = producaoSet.has(alvo)
  if (opcoes.dev && producao) abortar('--dev pediu o branch de dev, mas o banco resolvido é o de PRODUÇÃO.', [`DATABASE_URL aponta para ${alvo}.`])
  return { endpoint: alvo, producao }
}

type Db = Pick<PrismaClient, 'project' | 'brandDNA' | 'brandVoice' | '$queryRaw'>

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
  const estado: EstadoDoCliente = {
    versaoDaPreviaAtual: versaoDaPrevia({ dna: dnaDeTexto, voz: proposta.voz }),
    trechosDeFato: fatosNoDna(dnaDeTexto).map((f) => f.trecho),
    registro: registro ? { versao: registro.versao, migradaEm: registro.migradaEm } : null,
    vozValida: lerVoz(proposta.voz).voz !== null,
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
}

export interface ResultadoDaAplicacao {
  projectId: number
  nome: string
  acao: AcaoDoPlano['acao']
  motivo?: string
  vozVersao?: number
  migradaEm?: string
  fatosCriados?: number
  erro?: string
}

export interface AplicarOpcoes {
  /** Quem grava o fato na base. O padrão é `criarEntradaBase` (indexa na busca); a prova injeta um registrador. */
  criarFato?: (fato: FatoACriar, autor: string) => Promise<void>
  agora?: Date
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
  const criarFato =
    opcoes.criarFato ??
    (async (fato: FatoACriar, autor: string) => {
      const { criarEntradaBase } = await import('../src/lib/knowledge/entries')
      await criarEntradaBase({
        projectId: fato.projectId,
        category: fato.categoria,
        title: fato.titulo,
        content: fato.trecho,
        tags: ['migracao-da-voz'],
        expiresAt: fato.validaAte ? new Date(`${fato.validaAte}T23:59:59-03:00`) : null,
        metadata: { origem: 'migracao-da-voz', versaoDaPrevia: fato.versaoDaPrevia },
        autor,
      })
    })
  const estados = new Map<number, EstadoDoCliente>()
  const donos = new Map<number, string>()
  for (const c of manifesto.clientes) {
    const lido = await lerEstadoDoCliente(db, c.projectId)
    if (lido) estados.set(c.projectId, lido.estado)
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
    const cliente = manifesto.clientes.find((c) => c.projectId === acao.projectId)!
    const autor = donos.get(acao.projectId)
    try {
      if (!autor) throw new Error('projeto sem dono (userId) para assinar as entradas da base')
      let fatosCriados = 0
      for (const f of acao.fatos) {
        await criarFato({ projectId: acao.projectId, categoria: f.categoria, titulo: f.titulo, trecho: f.trecho, validaAte: f.validaAte ?? null, versaoDaPrevia: cliente.versaoDaPrevia }, autor)
        fatosCriados++
      }
      const gravada = await gravarVoz({ projectId: acao.projectId, voz: VOZES_PROPOSTAS[acao.projectId].voz, ...(acao.versaoEsperadaDaVoz > 0 ? { versaoEsperada: acao.versaoEsperadaDaVoz } : {}) })
      const migrada = await migrarParaVoz({ projectId: acao.projectId, versaoEsperada: gravada.versao, em: opcoes.agora })
      resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: 'migrar', vozVersao: gravada.versao, migradaEm: migrada.migradaEm.toISOString(), fatosCriados })
    } catch (e) {
      resultados.push({ projectId: acao.projectId, nome: acao.nome, acao: 'migrar', erro: e instanceof Error ? e.message : String(e) })
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
  const { endpoint, producao } = resolverBanco({ dev })
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
  const resultados = await aplicarManifesto(db, lido.manifesto)
  for (const r of resultados) {
    console.log(`  ${r.projectId} ${r.nome}: ${r.acao}${r.motivo ? ` — ${r.motivo}` : ''}${r.erro ? ` — ERRO: ${r.erro}` : ''}${r.vozVersao ? ` · voz v${r.vozVersao}, migrada em ${r.migradaEm}, ${r.fatosCriados} fato(s) na base` : ''}`)
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
