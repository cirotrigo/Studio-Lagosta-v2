/**
 * Prova de integração do PR 13 de "Marca simples, copy melhor" (F5, a
 * migração da voz por manifesto), no BRANCH DE DEV do Neon. Não toca no Blob
 * nem em API paga; a base de conhecimento NÃO é escrita (o registrador de
 * fatos é substituído por um stub que só anota o que teria sido criado —
 * `criarEntradaBase` indexa no vetor de produção).
 *
 * O que ela prova, no projeto 6 (Espeto Gaúcho), com o que cria apagado e o
 * DNA restaurado no cleanup:
 *  1. a PRÉVIA (dry-run) sai do DNA real: versão do conteúdo, voz válida, sem
 *     dado na voz, markdown e manifesto em branco (tudo pendente);
 *  2. `lerManifesto` recusa "migrar" sem aprovadoPor/aprovadoEm;
 *  3. fato citado no manifesto que a prévia NÃO lista bloqueia o cliente —
 *     nada gravado, o registrador não é chamado;
 *  3b. o caminho REAL (sem registrador injetado) em dev com o indexador de
 *     vetores de produção (ou sem indexador) é BLOQUEADO antes de qualquer
 *     escrita (PR13-01); 3c. destino validado com um indexador e o processo
 *     usando OUTRO (UPSTASH_VECTOR_* herdado) também bloqueia (PR13-09);
 *  4a. falha parcial: uma linha REAL com a chave do 1º fato e SEM a marca de
 *     indexado é `incompleto` e é REINDEXADA pelo mesmo id (PR13-11); o
 *     registrador quebra na 2ª criação — o cliente volta em erro com as
 *     contagens, voz não gravada (PR13-03);
 *  4b. com a trava do projeto tomada por outra transação, a aplicação é
 *     bloqueada sem escrever nada (PR13-10);
 *  4. aplicar com o manifesto aprovado: a retomada NÃO recria os fatos que já
 *     existem, cria só os que faltam (trecho exato, categoria, título, autor
 *     = dono do projeto), a voz é gravada (v1), a migração liga a precedência
 *     (`fonte: 'voz'` no serviço e no `loadBrandContext`) e o DNA de texto
 *     fica arquivado;
 *  5. aplicar de novo é `ja-migrado` — nada muda, registrador quieto;
 *  6. desfeita a migração e EDITADO o DNA, aplicar bloqueia ("a prévia mudou");
 *     restaurado o DNA, aplicar migra de novo pelo CAS (v2), sem recriar fato;
 *  6c. DNA editado ENTRE a leitura e a ativação (costura `antesDeAtivar`): a
 *     ativação recusa (`VOZ_DNA_DIVERGENTE`), o legado continua mandando;
 *     restaurado o DNA, migra (PR13-02);
 *  7. `manter-legado` e `pendente` não escrevem nada;
 *  8. nada além de BrandVoice (e da linha de base da prova, apagada no
 *     cleanup) foi criado desde o início (base, sinais, páginas, artes).
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada).
 *
 * USO: npx tsx scripts/validar-migracao-da-voz.ts [--saida <pasta>]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
/** Falha de pré-requisito ANTES de qualquer conexão (ambiente, compute): pode encerrar o processo na hora. */
function sairAntesDeComecar(titulo: string, linhas: string[] = []): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  process.exit(1)
}
class ProvaAbortada extends Error {
  constructor(titulo: string, readonly linhas: string[] = []) {
    super(titulo)
    this.name = 'ProvaAbortada'
  }
}
/**
 * Falha de pré-requisito ou de passo DEPOIS de a prova ter tocado o banco: LANÇA, para o `finally` restaurar
 * a voz anterior e o DNA. `process.exit` aqui pulava o cleanup — com uma `BrandVoice` no projeto 6 e um DNA
 * que produzisse menos de três fatos, a voz anterior era apagada e nunca restaurada (PR13-28).
 */
function abortar(titulo: string, linhas: string[] = []): never {
  throw new ProvaAbortada(titulo, linhas)
}
function apontarParaODev(): string {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))
  if (!existsSync(resolve(ROOT, '.env'))) sairAntesDeComecar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  if (!dev.DATABASE_URL) sairAntesDeComecar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  // PR13-30: o cache de busca (Redis) e o indexador (Vector) herdados do .env seriam os de PRODUÇÃO — em dev só o
  // isolado do .env.development.local, senão nenhum (a invalidação do cache vira no-op).
  for (const [urlKey, tokenKey] of [['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], ['UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN']] as const) {
    const isolado = dev[urlKey]?.trim() && dev[tokenKey]?.trim() && dev[urlKey].trim() !== prod[urlKey]?.trim()
    for (const k of [urlKey, tokenKey]) {
      if (isolado) process.env[k] = dev[k]
      else delete process.env[k]
    }
  }
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producao = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
  if (producao.size === 0) sairAntesDeComecar('o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.')
  if (!alvo || producao.has(alvo)) sairAntesDeComecar('O banco resolvido é o de PRODUÇÃO.', [`DATABASE_URL aponta para ${alvo ?? '(ilegível)'}.`])
  return alvo
}
const ENDPOINT = apontarParaODev()

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const PROJETO = 6
const SAIDA = argumento('--saida') ?? '.tmp-validar-migracao-da-voz'
const APROVACAO = { aprovadoPor: 'prova de integração (PR 13)', aprovadoEm: '2026-09-12' }

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })
  const inicio = new Date(Date.now() - 1000)

  const { db } = await import('../src/lib/db')
  const { aplicarManifesto, bancoSemTabelaDeVoz, chaveDaTrava, estadoDoFatoNaBase, gerarPrevias, lerEstadoDoCliente, marcarFatoIndexado, travaPorProjeto } = await import('./migrar-voz-da-marca')
  type FatoACriar = import('./migrar-voz-da-marca').FatoACriar
  const { chaveDoFato, isolamentoDoIndexador, lerManifesto, manifestoEmBranco, previaParaMarkdown, VERSAO_DO_MANIFESTO } = await import('../src/lib/brand/migracao-da-voz')
  const { VOZES_PROPOSTAS } = await import('./lib/vozes-propostas')
  const { contextoDeVoz, desfazerMigracao, lerRegistroDaVoz } = await import('../src/lib/brand/voz-service')
  const { loadBrandContext } = await import('../src/lib/brand/brand-context')
  const { vozParaPrompt } = await import('../src/lib/brand/voz')
  type Manifesto = import('../src/lib/brand/migracao-da-voz').Manifesto

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)
  if (!VOZES_PROPOSTAS[PROJETO]) abortar(`o projeto ${PROJETO} não tem voz proposta`)
  const dnaAntes = await db.brandDNA.findUnique({ where: { projectId: PROJETO }, select: { toneOfVoice: true, contentRules: true } })
  if (!dnaAntes) abortar(`o projeto ${PROJETO} não tem BrandDNA no dev — a prova precisa de um DNA de texto real`)
  // PR13-28: TODO pré-requisito é conferido ANTES da primeira mutação (a exclusão da voz anterior, logo abaixo).
  // Quem falha aqui ainda pode encerrar sem restaurar nada, porque nada foi tocado.
  const previaDeEntrada = (await lerEstadoDoCliente(db, PROJETO))?.previa
  if (!previaDeEntrada) sairAntesDeComecar('lerEstadoDoCliente devolveu null antes de a prova começar')
  if (previaDeEntrada.fatos.noLegado.length < 3) sairAntesDeComecar(`a prévia do projeto ${PROJETO} tem só ${previaDeEntrada.fatos.noLegado.length} fato(s) no DNA; a prova precisa de 3`)
  if (previaDeEntrada.problemasDaVoz.length > 0) sairAntesDeComecar(`a voz proposta do projeto ${PROJETO} não passa no contrato`, previaDeEntrada.problemasDaVoz.map((p) => `${p.caminho}: ${p.mensagem}`))
  const vozAntes = await db.brandVoice.findUnique({ where: { projectId: PROJETO } })
  if (vozAntes) await db.brandVoice.delete({ where: { projectId: PROJETO } })
  const registro: Record<string, unknown> = { sha, branch, banco: ENDPOINT, projeto: PROJETO }

  const TAG_DA_PROVA = 'prova-migracao-da-voz-pr13'
  const linhasDeBaseDaProva: string[] = []
  // O registrador de fatos da prova: grava a LINHA REAL na base (com a chave do fato e a marca de indexado, como o
  // padrão deixa), SEM indexar — `criarEntradaBase` indexaria no vetor de produção. A linha real é o que permite à
  // ativação conferir os fatos dentro da transação (PR13-35); a tag da prova é o que o cleanup apaga.
  const fatosAnotados: Array<{ fato: FatoACriar; autor: string }> = []
  const registrarFato = async (fato: FatoACriar, autor: string) => {
    const linha = await db.knowledgeBaseEntry.create({
      data: {
        projectId: fato.projectId, category: fato.categoria, title: `${fato.titulo} [fato da prova]`, content: fato.trecho, tags: [TAG_DA_PROVA, 'migracao-da-voz'], status: 'ACTIVE',
        expiresAt: fato.validaAte ? new Date(`${fato.validaAte}T23:59:59-03:00`) : null,
        metadata: { origem: 'migracao-da-voz', versaoDaPrevia: fato.versaoDaPrevia, chaveDoFato: fato.chave, indexadoEm: new Date().toISOString(), prova: true },
        createdBy: autor, userId: autor,
      },
      select: { id: true },
    })
    linhasDeBaseDaProva.push(linha.id)
    fatosAnotados.push({ fato, autor })
  }
  const criarFato = async (fato: FatoACriar, autor: string) => { await registrarFato(fato, autor) }
  // O estado do fato é a consulta PADRÃO do script (por `metadata.chaveDoFato`): as linhas da prova são reais.
  const estadoDoFato = (chave: string, projectId: number) => estadoDoFatoNaBase(db, chave, projectId)
  // O reindexador da prova: anota e grava a marca durável (o que o padrão faz depois do `reindexEntry`).
  const reindexados: Array<{ entryId: string; chave: string }> = []
  const reindexarFato = async (entryId: string, fato: FatoACriar) => {
    reindexados.push({ entryId, chave: fato.chave })
    await marcarFatoIndexado(db, entryId)
  }
  const manifestoCom = (cliente: Partial<Manifesto['clientes'][number]>): Manifesto => ({
    versao: VERSAO_DO_MANIFESTO,
    geradoEm: new Date().toISOString(),
    clientes: [{ projectId: PROJETO, nome: VOZES_PROPOSTAS[PROJETO].nome, versaoDaPrevia: '', decisao: 'pendente', fatosParaABase: [], ...cliente }],
  })

  try {
    // ── 1. a prévia ────────────────────────────────────────────────────────
    console.log('1) a PRÉVIA (dry-run) sai do DNA real do dev: versão do conteúdo, voz válida, sem dado na voz, markdown e manifesto em branco')
    conferir('o banco de dev tem a tabela BrandVoice (a migration do PR 7 está aplicada aqui)', bancoSemTabelaDeVoz() === false)
    const lido1 = await lerEstadoDoCliente(db, PROJETO)
    if (!lido1) abortar('lerEstadoDoCliente devolveu null')
    const previa = lido1.previa
    writeFileSync(resolve(SAIDA, `previa-${PROJETO}.md`), previaParaMarkdown(previa))
    conferir(`prévia com versão de 16 hex, voz válida (0 problemas), prompt ${previa.depois.chars}/${previa.depois.teto}, sem dado na voz`, /^[0-9a-f]{16}$/.test(previa.versaoDaPrevia) && previa.problemasDaVoz.length === 0 && previa.depois.chars > 0 && previa.depois.chars <= previa.depois.teto && previa.fatos.naVoz.length === 0, JSON.stringify({ versao: previa.versaoDaPrevia, regrasLegadas: previa.antes.regrasLegadas, fatosNoDna: previa.fatos.noLegado.length }))
    const md1 = previaParaMarkdown(previa)
    conferir('o "antes" traz o toneOfVoice e o contentRules INTEGRAIS (iguais ao banco) e o markdown os reproduz verbatim (PR13-05)', previa.antes.toneOfVoice === dnaAntes.toneOfVoice && previa.antes.contentRules === dnaAntes.contentRules && (!dnaAntes.toneOfVoice || md1.includes(dnaAntes.toneOfVoice)) && (!dnaAntes.contentRules || md1.includes(dnaAntes.contentRules)))
    const rodapesComoFato = previa.fatos.noLegado.filter((f) => /^\(?\d{4}-\d{2}-\d{2}\s*[—–-]/.test(f.trecho) || /\(\d{4}-\d{2}-\d{2}\s*[—–-][^)]*$/.test(f.trecho))
    conferir('nenhum rodapé "(data — motivo)" de regra aprendida aparece como fato do DNA (PR13-08)', rodapesComoFato.length === 0, JSON.stringify(rodapesComoFato.map((f) => f.trecho.slice(0, 80))))
    conferir('o estado lido: sem registro de voz, voz válida, versão da prévia atual = a da prévia, trechos de fato = os da prévia', lido1.estado.registro === null && lido1.estado.vozValida && lido1.estado.versaoDaPreviaAtual === previa.versaoDaPrevia && JSON.stringify(lido1.estado.trechosDeFato) === JSON.stringify(previa.fatos.noLegado.map((f) => f.trecho)))
    const previas = await gerarPrevias(db, [PROJETO, 999999])
    conferir('gerarPrevias devolve só quem existe (o projeto inexistente é ignorado) com a mesma versão', previas.length === 1 && previas[0].versaoDaPrevia === previa.versaoDaPrevia)
    const emBranco = manifestoEmBranco(previas)
    writeFileSync(resolve(SAIDA, 'manifesto-em-branco.json'), `${JSON.stringify(emBranco, null, 2)}\n`)
    conferir('o manifesto em branco tem o cliente como "pendente" com a versão da prévia e passa em lerManifesto', emBranco.clientes[0].decisao === 'pendente' && emBranco.clientes[0].versaoDaPrevia === previa.versaoDaPrevia && lerManifesto(emBranco).manifesto !== null)

    // ── 2. silêncio não é aprovação ────────────────────────────────────────
    console.log('2) lerManifesto recusa "migrar" sem aprovadoPor/aprovadoEm')
    const semAprovacao = lerManifesto(manifestoCom({ versaoDaPrevia: previa.versaoDaPrevia, decisao: 'migrar' }))
    conferir('recusado, com o problema dito', semAprovacao.manifesto === null && semAprovacao.problemas.some((p) => /silêncio não é aprovação/.test(p)), semAprovacao.problemas.join(' | '))

    // ── 3. fato fora da prévia bloqueia ────────────────────────────────────
    console.log('3) fato citado no manifesto que a prévia NÃO lista bloqueia o cliente: nada gravado, registrador quieto')
    const foraDaPrevia = lerManifesto(manifestoCom({ versaoDaPrevia: previa.versaoDaPrevia, decisao: 'migrar', ...APROVACAO, fatosParaABase: [{ trecho: 'Frase inventada que a prévia não lista, das 17h às 19h', categoria: 'HORARIOS', titulo: 'inventado' }] }))
    const r3 = await aplicarManifesto(db, foraDaPrevia.manifesto!, { criarFato })
    conferir('bloqueado, com o motivo citando o trecho', r3[0]?.acao === 'bloqueado' && /prévia não lista/.test(r3[0].motivo ?? '') && /Frase inventada/.test(r3[0].motivo ?? ''), r3[0]?.motivo)
    conferir('nenhuma voz gravada e nenhum fato registrado', (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0 && fatosAnotados.length === 0)

    const fatosDaPrevia = previa.fatos.noLegado.slice(0, 3).map((f, i) => ({ trecho: f.trecho, categoria: (f.tipos.includes('horario') ? 'HORARIOS' : 'ESTABELECIMENTO_INFO') as 'HORARIOS' | 'ESTABELECIMENTO_INFO', titulo: `Fato ${i + 1} da prévia (prova)`, ...(i === 1 ? { validaAte: '2026-12-31' } : {}) }))
    if (fatosDaPrevia.length < 3) abortar(`a prévia do projeto ${PROJETO} tem só ${fatosDaPrevia.length} fato(s) no DNA; a prova precisa de 3`)
    const aprovado = lerManifesto(manifestoCom({ versaoDaPrevia: previa.versaoDaPrevia, decisao: 'migrar', ...APROVACAO, fatosParaABase: fatosDaPrevia }))
    if (!aprovado.manifesto) abortar('o manifesto aprovado não passou no contrato', aprovado.problemas)
    const chaves = fatosDaPrevia.map((f) => chaveDoFato({ projectId: PROJETO, versaoDaPrevia: previa.versaoDaPrevia, trecho: f.trecho }))

    // ── 3b. o caminho REAL em dev com indexador de produção é bloqueado (PR13-01) ──
    console.log('3b) o caminho REAL (sem registrador injetado) em dev: indexador de vetores de produção ou ausente BLOQUEIA antes de qualquer escrita (PR13-01)')
    const indexadorDaqui = isolamentoDoIndexador(parseEnvFile(resolve(ROOT, '.env')), parseEnvFile(resolve(ROOT, '.env.development.local')))
    const baseAntes3b = await db.knowledgeBaseEntry.count({ where: { projectId: PROJETO } })
    const r3b = await aplicarManifesto(db, aprovado.manifesto, { destino: { banco: 'dev', indexador: indexadorDaqui === 'isolado' ? 'producao' : indexadorDaqui, indexadorUrl: process.env.UPSTASH_VECTOR_REST_URL ?? null } })
    const r3c = await aplicarManifesto(db, aprovado.manifesto, {})
    conferir(`destino dev com indexador "${indexadorDaqui === 'isolado' ? 'producao' : indexadorDaqui}" e destino não declarado: os dois bloqueados com o motivo do indexador`, r3b[0]?.acao === 'bloqueado' && /indexador da base/.test(r3b[0].motivo ?? '') && r3c[0]?.acao === 'bloqueado' && /não foi declarado/.test(r3c[0].motivo ?? ''), `${r3b[0]?.motivo} || ${r3c[0]?.motivo}`)
    // 3c (PR13-09): o destino foi validado com um indexador isolado, mas o PROCESSO usa outro (UPSTASH_VECTOR_* herdado)
    const urlAntes3c = process.env.UPSTASH_VECTOR_REST_URL
    process.env.UPSTASH_VECTOR_REST_URL = 'https://herdado-do-ambiente.exemplo.upstash.io'
    const r3d = await aplicarManifesto(db, aprovado.manifesto, { destino: { banco: 'dev', indexador: 'isolado', indexadorUrl: 'https://isolado-validado.exemplo.upstash.io' } })
    if (urlAntes3c === undefined) delete process.env.UPSTASH_VECTOR_REST_URL
    else process.env.UPSTASH_VECTOR_REST_URL = urlAntes3c
    conferir('destino "isolado" validado com uma URL e o processo usando OUTRA: bloqueado ("não é o validado"), nada escrito (PR13-09)', r3d[0]?.acao === 'bloqueado' && /não é o validado/.test(r3d[0].motivo ?? ''), r3d[0]?.motivo)
    conferir('nenhuma voz gravada, nenhuma entrada na base, registrador quieto', (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0 && (await db.knowledgeBaseEntry.count({ where: { projectId: PROJETO } })) === baseAntes3b && fatosAnotados.length === 0)

    // ── 4a. falha parcial e a chave durável (PR13-03) ──────────────────────
    console.log('4a) falha parcial: uma linha REAL na base carrega a chave do 1º fato SEM a marca de indexado (reindexada pelo mesmo id, PR13-11); o registrador quebra na 2ª criação — erro com as contagens, voz não gravada')
    const linha4a = await db.knowledgeBaseEntry.create({
      data: { projectId: PROJETO, category: fatosDaPrevia[0].categoria, title: `${fatosDaPrevia[0].titulo} [linha da prova]`, content: fatosDaPrevia[0].trecho, tags: [TAG_DA_PROVA], status: 'ACTIVE', metadata: { origem: 'migracao-da-voz', versaoDaPrevia: previa.versaoDaPrevia, chaveDoFato: chaves[0], prova: true }, createdBy: projeto.userId, userId: projeto.userId },
      select: { id: true },
    })
    linhasDeBaseDaProva.push(linha4a.id)
    conferir('a consulta padrão vê o 1º fato como INCOMPLETO (linha sem indexadoEm) e o 2º como ausente', (await estadoDoFatoNaBase(db, chaves[0], PROJETO)).estado === 'incompleto' && (await estadoDoFatoNaBase(db, chaves[1], PROJETO)).estado === 'ausente')
    let chamadas4a = 0
    const criarFatoQueQuebra = async (fato: FatoACriar, autor: string) => {
      chamadas4a++
      if (chamadas4a === 2) throw new Error('costura de prova: o registrador quebrou no 2º fato (PR13-03)')
      await registrarFato(fato, autor)
    }
    const r4a = await aplicarManifesto(db, aprovado.manifesto, { criarFato: criarFatoQueQuebra, reindexarFato })
    conferir('erro dito, com fatosReindexados 1 (a linha real, pelo id dela), fatosCriados 1 (o 2º fato), 0 já existentes; o 3º não foi tentado; voz NÃO gravada', /quebrou no 2º fato/.test(r4a[0]?.erro ?? '') && r4a[0]?.fatosReindexados === 1 && reindexados.length === 1 && reindexados[0].entryId === linha4a.id && reindexados[0].chave === chaves[0] && r4a[0]?.fatosJaExistentes === 0 && r4a[0]?.fatosCriados === 1 && chamadas4a === 2 && fatosAnotados.length === 1 && fatosAnotados[0].fato.chave === chaves[1] && (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0, JSON.stringify(r4a[0]))
    conferir('a linha reindexada ficou com a marca durável (agora é "completo")', (await estadoDoFatoNaBase(db, chaves[0], PROJETO)).estado === 'completo')

    // ── 4c. a linha da chave não é mais o fato aprovado (PR13-14) ─────────
    console.log('4c) a linha com a chave do 1º fato foi EDITADA e, depois, ARQUIVADA: a aplicação bloqueia para decisão, sem escrever nada')
    await db.knowledgeBaseEntry.update({ where: { id: linha4a.id }, data: { content: `${fatosDaPrevia[0].trecho} — editado por alguém depois` } })
    const r4cEditada = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    await db.knowledgeBaseEntry.update({ where: { id: linha4a.id }, data: { content: fatosDaPrevia[0].trecho, status: 'ARCHIVED' } })
    const r4cArquivada = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    await db.knowledgeBaseEntry.update({ where: { id: linha4a.id }, data: { status: 'ACTIVE' } })
    conferir('editada → bloqueado ("conteúdo editado"); arquivada → bloqueado ("status ARCHIVED"); nenhuma voz gravada, registrador e reindexador quietos', r4cEditada[0]?.acao === 'bloqueado' && /conteúdo editado/.test(r4cEditada[0].motivo ?? '') && r4cArquivada[0]?.acao === 'bloqueado' && /status ARCHIVED/.test(r4cArquivada[0].motivo ?? '') && (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0 && fatosAnotados.length === 1 && reindexados.length === 1, `${r4cEditada[0]?.motivo?.slice(0, 120)} || ${r4cArquivada[0]?.motivo?.slice(0, 120)}`)

    // ── 4b. a trava por projeto (PR13-10) ──────────────────────────────────
    console.log('4b) com a trava do projeto tomada por OUTRA transação (outra aplicação em andamento), a aplicação é bloqueada sem escrever nada')
    // "A outra aplicação": uma conexão própria (a mesma forma da trava real) segura o advisory lock do projeto
    // enquanto `aplicarManifesto` — com a trava PADRÃO, em outra conexão própria — tenta pegá-lo.
    const { PrismaClient } = await import('@prisma/client')
    const outraAplicacao = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } })
    let r4b: Awaited<ReturnType<typeof aplicarManifesto>> = []
    try {
      r4b = await outraAplicacao.$transaction(
        async (tx) => {
          const t = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${chaveDaTrava(PROJETO)})) AS ok`
          if (!t[0]?.ok) abortar('a prova não conseguiu a trava do projeto para simular a concorrência')
          return aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
        },
        { maxWait: 30_000, timeout: 120_000 },
      )
    } finally {
      await outraAplicacao.$disconnect().catch(() => undefined)
    }
    conferir('bloqueado pela trava por projeto; nenhuma voz gravada; registrador e reindexador quietos', r4b[0]?.acao === 'bloqueado' && /trava por projeto/.test(r4b[0].motivo ?? '') && (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0 && fatosAnotados.length === 1 && reindexados.length === 1, r4b[0]?.motivo)
    // 4b'. a trava apontada para OUTRO banco não vale (PR13-13): bloqueado antes de conectar, nada escrito
    const urlDeOutroBanco = String(process.env.DATABASE_URL).replace(/\/\/([^@]*@)?([^./]+)/, (m, cred, host) => `//${cred ?? ''}${host}-x-outro-compute`)
    const r4bOutro = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato, comTrava: travaPorProjeto(urlDeOutroBanco) })
    const urlDeOutroNome = String(process.env.DATABASE_URL).replace(/\/([^/?]+)(\?|$)/, '/outro_banco_da_prova$2')
    const r4bNome = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato, comTrava: travaPorProjeto(urlDeOutroNome) })
    // PR13-19: a URL do POOLER (é a própria DATABASE_URL do dev, com -pooler) é recusada para a trava — mesmo compute, mesmo banco
    const urlDoPooler = String(process.env.DATABASE_URL)
    const r4bPooler = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato, comTrava: travaPorProjeto(urlDoPooler) })
    conferir('PR13-19: trava pela URL do POOLER → bloqueado ("exige conexão DIRETA"), nenhuma voz gravada; a DIRECT_URL do dev é direta', /-pooler\./.test(urlDoPooler) && r4bPooler[0]?.acao === 'bloqueado' && /exige conexão DIRETA/.test(r4bPooler[0].motivo ?? '') && !/-pooler\./.test(String(process.env.DIRECT_URL)) && (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0, `${r4bPooler[0]?.motivo?.slice(0, 120)}`)
    conferir('trava em OUTRO compute, ou em outro BANCO do mesmo compute (PR13-16): bloqueado ("não é o banco das escritas"), nenhuma voz gravada', r4bOutro[0]?.acao === 'bloqueado' && /não é o banco das escritas/.test(r4bOutro[0].motivo ?? '') && r4bNome[0]?.acao === 'bloqueado' && /não é o banco das escritas/.test(r4bNome[0].motivo ?? '') && (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0, `${r4bOutro[0]?.motivo?.slice(0, 90)} || ${r4bNome[0]?.motivo?.slice(0, 90)}`)

    // ── 4. aplicar de verdade (com o stub de fatos) — a retomada ──────────
    console.log('4) aplicar o manifesto aprovado (retomada): só o fato que falta é criado, a voz é gravada (v1), a migração liga a precedência e o DNA fica arquivado')
    const agora4 = new Date()
    const r4 = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato, agora: agora4 })
    conferir(`migrou: voz v1, 1 fato criado, 2 já existentes (a linha reindexada e o do stub), 0 reindexados (${previa.fatos.noLegado.length} disponíveis na prévia)`, r4[0]?.acao === 'migrar' && !r4[0].erro && r4[0].vozVersao === 1 && r4[0].fatosCriados === 1 && r4[0].fatosJaExistentes === 2 && r4[0].fatosReindexados === 0 && r4[0].migradaEm === agora4.toISOString(), JSON.stringify(r4[0]))
    const anotadosPorChave = new Map(fatosAnotados.map((a) => [a.fato.chave, a]))
    conferir('cada fato criado foi ao registrador com o trecho EXATO da prévia, a categoria, o título, a validade, a chave e o autor = dono do projeto; o 1º (já na base) nunca foi criado', fatosAnotados.length === 2 && !anotadosPorChave.has(chaves[0]) && [1, 2].every((i) => { const a = anotadosPorChave.get(chaves[i]); const f = fatosDaPrevia[i]; return !!a && a.fato.trecho === f.trecho && a.fato.categoria === f.categoria && a.fato.titulo === f.titulo && a.fato.validaAte === (f.validaAte ?? null) && a.fato.versaoDaPrevia === previa.versaoDaPrevia && a.autor === projeto.userId }), JSON.stringify(fatosAnotados.map((a) => [a.fato.categoria, a.fato.validaAte])))
    const reg4 = await lerRegistroDaVoz(PROJETO)
    conferir('BrandVoice: versão 1, migradaEm gravada, dnaArquivado com o toneOfVoice/contentRules de antes', reg4?.versao === 1 && reg4.migradaEm !== null && !!reg4.dnaArquivado && JSON.stringify((reg4.dnaArquivado as { toneOfVoice?: unknown }).toneOfVoice ?? null) === JSON.stringify(dnaAntes.toneOfVoice) , JSON.stringify({ versao: reg4?.versao, migradaEm: reg4?.migradaEm }))
    const c4 = await contextoDeVoz(PROJETO)
    const b4 = await loadBrandContext(PROJETO)
    const promptEsperado = vozParaPrompt(VOZES_PROPOSTAS[PROJETO].voz, { escopo: 'copy' })
    conferir('a precedência: fonte "voz" no serviço e no loader, com o texto compacto da voz proposta', c4.fonte === 'voz' && c4.versao === 1 && c4.texto === promptEsperado && b4?.voz.fonte === 'voz' && b4.voz.texto === promptEsperado, JSON.stringify({ fonte: c4.fonte, chars: c4.texto?.length }))

    // ── 5. de novo: já migrado ─────────────────────────────────────────────
    console.log('5) aplicar de novo o mesmo manifesto é "ja-migrado": nada muda, registrador quieto')
    const antes5 = fatosAnotados.length
    const r5 = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    const reg5 = await lerRegistroDaVoz(PROJETO)
    conferir('ja-migrado; versão continua 1; nenhum fato novo', r5[0]?.acao === 'ja-migrado' && reg5?.versao === 1 && fatosAnotados.length === antes5, JSON.stringify(r5[0]))

    // ── 6. desfazer + DNA editado → bloqueado; DNA restaurado → migra pelo CAS ──
    console.log('6) desfeita a migração e EDITADO o DNA, aplicar bloqueia ("a prévia mudou"); restaurado o DNA, migra de novo pelo CAS (v2)')
    const d6 = await desfazerMigracao({ projectId: PROJETO })
    await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: `${dnaAntes.contentRules ?? ''}\n- Linha de prova da migração (não é regra) [PR13 ${sha.slice(0, 8)}]` } })
    const r6a = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    const reg6a = await lerRegistroDaVoz(PROJETO)
    conferir('desfeita e com o DNA editado: bloqueado ("a prévia mudou"), a voz continua v1 e NÃO migrada, registrador quieto', d6.desfeita && r6a[0]?.acao === 'bloqueado' && /prévia mudou/.test(r6a[0].motivo ?? '') && reg6a?.versao === 1 && reg6a.migradaEm === null && fatosAnotados.length === antes5, r6a[0]?.motivo)
    await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: dnaAntes.contentRules ?? null } })
    const lido6 = await lerEstadoDoCliente(db, PROJETO)
    conferir('com o DNA restaurado a versão da prévia volta a ser a aprovada e o estado traz o registro v1 (não migrado)', lido6?.estado.versaoDaPreviaAtual === previa.versaoDaPrevia && lido6.estado.registro?.versao === 1 && lido6.estado.registro.migradaEm === null)
    const r6b = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    const reg6b = await lerRegistroDaVoz(PROJETO)
    conferir('migra de novo pelo CAS: voz v2 (versão esperada 1), migradaEm gravada; nenhum fato recriado (os 3 já existem para esta prévia)', r6b[0]?.acao === 'migrar' && !r6b[0].erro && r6b[0].vozVersao === 2 && r6b[0].fatosCriados === 0 && r6b[0].fatosJaExistentes === 3 && reg6b?.versao === 2 && reg6b.migradaEm !== null && fatosAnotados.length === antes5, JSON.stringify(r6b[0]))

    // ── 6c. DNA editado ENTRE a leitura e a ativação (PR13-02) ─────────────
    console.log('6c) DNA editado ENTRE a leitura e a ativação (costura antesDeAtivar): a ativação recusa, o legado continua mandando; restaurado o DNA, migra')
    const d6c = await desfazerMigracao({ projectId: PROJETO })
    const r6c = await aplicarManifesto(db, aprovado.manifesto, {
      criarFato,
      estadoDoFato,
      reindexarFato,
      seams: { antesDeAtivar: async () => { await db.brandDNA.update({ where: { projectId: PROJETO }, data: { toneOfVoice: `${dnaAntes.toneOfVoice ?? ''}\n- Edição concorrente da prova [PR13-02 ${sha.slice(0, 8)}]` } }) } },
    })
    const reg6c = await lerRegistroDaVoz(PROJETO)
    const c6c = await contextoDeVoz(PROJETO)
    conferir('desfeita; a ativação recusou com VOZ_DNA_DIVERGENTE citando toneOfVoice; a voz foi gravada (v3) mas NÃO migrada; a copy continua lendo o legado', d6c.desfeita && /DNA de texto mudou/.test(r6c[0]?.erro ?? '') && /toneOfVoice/.test(r6c[0]?.erro ?? '') && reg6c?.versao === 3 && reg6c.migradaEm === null && c6c.fonte !== 'voz', JSON.stringify({ erro: r6c[0]?.erro, versao: reg6c?.versao, migradaEm: reg6c?.migradaEm, fonte: c6c.fonte }))
    await db.brandDNA.update({ where: { projectId: PROJETO }, data: { toneOfVoice: dnaAntes.toneOfVoice ?? null } })
    const r6d = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    const reg6d = await lerRegistroDaVoz(PROJETO)
    conferir('com o DNA restaurado migra: voz v4 (CAS sobre a v3), migradaEm gravada, nenhum fato recriado', r6d[0]?.acao === 'migrar' && !r6d[0].erro && r6d[0].vozVersao === 4 && r6d[0].fatosCriados === 0 && reg6d?.versao === 4 && reg6d.migradaEm !== null, JSON.stringify(r6d[0]))

    // ── 6e. a trava se PERDE enquanto um fato longo é escrito (PR13-15/18) ──
    // A conexão da trava é de sessão (sem timeout); a perda simulada pela costura acontece NO MEIO de um `criarFato`
    // lento (o indexador esperando embeddings): a vigilância abandona a escrita, nada mais é escrito e a voz não é
    // gravada nem ativada. O que já estava em voo não é cancelável — o que se prova é que a aplicação PARA.
    console.log('6e) a trava se perde DURANTE um fato longo: a vigilância abandona a escrita, o fato seguinte não é criado, a voz não é gravada')
    const d6e = await desfazerMigracao({ projectId: PROJETO })
    // um fato NOVO (fora dos 3 já existentes) para haver o que criar, e um registrador lento
    const fatoNovo6e = previa.fatos.noLegado.slice(3, 4).map((f) => ({ trecho: f.trecho, categoria: 'ESTABELECIMENTO_INFO' as const, titulo: 'Fato 4 da prévia (prova, lento)' }))
    if (fatoNovo6e.length < 1) throw new Error('a prévia precisa de um 4º fato para o 6e')
    const manifesto6e = lerManifesto(manifestoCom({ versaoDaPrevia: previa.versaoDaPrevia, decisao: 'migrar', ...APROVACAO, fatosParaABase: [...fatosDaPrevia, ...fatoNovo6e, ...previa.fatos.noLegado.slice(4, 5).map((f) => ({ trecho: f.trecho, categoria: 'ESTABELECIMENTO_INFO' as const, titulo: 'Fato 5 da prévia (prova)' }))] })).manifesto!
    let lentosIniciados = 0
    let pidDaTrava6e = 0
    let executarNaTrava6e: ((sql: string) => Promise<void>) | null = null
    let sinalAbortado6e: boolean | null = null
    let sinalAbortadoAntesDeGravar6e = false
    // A sessão da trava é DERRUBADA DE VERDADE pelo SERVIDOR: 300 ms depois de o 1º fato lento começar, a prova
    // manda `SET idle_session_timeout = '200ms'` nessa sessão (o papel do Neon não tem `pg_terminate_backend`), e
    // com a vigilância a cada 600 ms o Postgres encerra a conexão ociosa antes da conferência seguinte — no meio
    // da escrita, não antes dela. A conferência falha (a conexão caiu) e o sinal aborta a escrita (PR13-20/21).
    const criarFatoLento = async (fato: FatoACriar, autor: string, signal?: AbortSignal) => {
      lentosIniciados++
      setTimeout(() => { void executarNaTrava6e?.(`SET idle_session_timeout = '200ms'`).catch(() => undefined) }, 300)
      await new Promise((r) => setTimeout(r, 2_500))
      // como `criarEntradaBase` faz: o sinal é conferido ANTES de escrever — abortado, nada é anotado (PR13-20)
      sinalAbortado6e = signal?.aborted ?? null
      if (signal?.aborted) { sinalAbortadoAntesDeGravar6e = true; return }
      await registrarFato(fato, autor)
    }
    const anotadosAntes6e = fatosAnotados.length
    const r6e = await aplicarManifesto(db, manifesto6e, {
      criarFato: criarFatoLento,
      estadoDoFato,
      reindexarFato,
      comTrava: travaPorProjeto(undefined, { vigiaMs: 600, aoTravar: (sessao) => { pidDaTrava6e = sessao.pid; executarNaTrava6e = sessao.executar } }),
    })
    await new Promise((r) => setTimeout(r, 2_600))
    const reg6e = await lerRegistroDaVoz(PROJETO)
    conferir('desfeita; a sessão da trava foi DERRUBADA pelo servidor no meio do 1º fato novo: erro "a trava por projeto se perdeu", só UM fato lento iniciado (o 2º nunca começou), voz continua v4 e NÃO migrada', d6e.desfeita && /trava por projeto se perdeu/.test(r6e[0]?.erro ?? '') && lentosIniciados === 1 && reg6e?.versao === 4 && reg6e.migradaEm === null && pidDaTrava6e > 0, JSON.stringify({ erro: r6e[0]?.erro?.slice(0, 160), lentos: lentosIniciados, versao: reg6e?.versao, pid: pidDaTrava6e }))
    conferir('PR13-20: o AbortSignal da escrita foi disparado pela perda da posse e a escrita lenta parou ANTES de gravar (nada anotado)', sinalAbortado6e === true && sinalAbortadoAntesDeGravar6e && fatosAnotados.length - anotadosAntes6e === 0, JSON.stringify({ abortado: sinalAbortado6e, antesDeGravar: sinalAbortadoAntesDeGravar6e, anotados: fatosAnotados.length - anotadosAntes6e }))
    // PR13-17 (com a migração ainda desfeita): trecho repetido é recusado por lerManifesto e, se passasse, pela aplicação — antes de qualquer escrita
    const repetido = lerManifesto(manifestoCom({ versaoDaPrevia: previa.versaoDaPrevia, decisao: 'migrar', ...APROVACAO, fatosParaABase: [fatosDaPrevia[0], { ...fatosDaPrevia[0], categoria: 'HORARIOS' as const }] }))
    const r6g = await aplicarManifesto(db, { ...aprovado.manifesto, clientes: aprovado.manifesto.clientes.map((c) => ({ ...c, fatosParaABase: [fatosDaPrevia[1], fatosDaPrevia[1]] })) }, { criarFato, estadoDoFato, reindexarFato })
    conferir('PR13-17: trecho repetido → lerManifesto recusa (posições ditas) e aplicarManifesto bloqueia antes de escrever', repetido.manifesto === null && repetido.problemas.some((p) => /repete o trecho.*posições 0, 1/.test(p)) && r6g[0]?.acao === 'bloqueado' && /repete trecho/.test(r6g[0].motivo ?? ''), `${repetido.problemas[0]?.slice(0, 120)} || ${r6g[0]?.motivo?.slice(0, 100)}`)
    const r6f = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    const reg6f = await lerRegistroDaVoz(PROJETO)
    conferir('com a trava normal migra de novo: voz v5, migradaEm gravada', r6f[0]?.acao === 'migrar' && !r6f[0].erro && reg6f?.versao === 5 && reg6f.migradaEm !== null, JSON.stringify(r6f[0]))

    // ── 6x. um fato aprovado é ARQUIVADO entre a conferência e a ativação (PR13-35) ──
    console.log('6x) um fato já conferido é ARQUIVADO entre a 2ª passada e a ativação (costura antesDeAtivar): a ativação recusa, a voz fica gravada e NÃO migrada, o legado manda, a edição concorrente fica; restaurado, migra')
    const d6x = await desfazerMigracao({ projectId: PROJETO })
    const fato6x = await estadoDoFatoNaBase(db, chaves[2], PROJETO)
    if (fato6x.estado === 'ausente') throw new Error('6x: o 3º fato da prévia deveria estar na base (criado na etapa 4)')
    const anotadosAntes6x = fatosAnotados.length
    const r6x = await aplicarManifesto(db, aprovado.manifesto, {
      criarFato, estadoDoFato, reindexarFato,
      seams: { antesDeAtivar: async () => { await db.knowledgeBaseEntry.update({ where: { id: fato6x.entryId }, data: { status: 'ARCHIVED' } }) } },
    })
    const reg6x = await lerRegistroDaVoz(PROJETO)
    const c6x = await contextoDeVoz(PROJETO)
    const linha6x = await db.knowledgeBaseEntry.findUnique({ where: { id: fato6x.entryId }, select: { status: true } })
    conferir('desfeita; a ativação recusou com VOZ_FATOS_DIVERGENTES citando a linha e "status ARCHIVED"; a voz foi gravada (v6) mas NÃO migrada; a copy continua lendo o legado; a linha arquivada FICOU arquivada (edição concorrente preservada); registrador quieto', d6x.desfeita && /fatos aprovados mudaram/.test(r6x[0]?.erro ?? '') && r6x[0]?.erro?.includes(fato6x.entryId) === true && /status ARCHIVED/.test(r6x[0]?.erro ?? '') && reg6x?.versao === 6 && reg6x.migradaEm === null && c6x.fonte === 'legado' && linha6x?.status === 'ARCHIVED' && fatosAnotados.length === anotadosAntes6x, JSON.stringify({ r: r6x[0], versao: reg6x?.versao, migradaEm: reg6x?.migradaEm, fonte: c6x.fonte, status: linha6x?.status }))
    await db.knowledgeBaseEntry.update({ where: { id: fato6x.entryId }, data: { status: 'ACTIVE' } })
    const r6y = await aplicarManifesto(db, aprovado.manifesto, { criarFato, estadoDoFato, reindexarFato })
    const reg6y = await lerRegistroDaVoz(PROJETO)
    conferir('restaurada a linha, migra: voz v7 (CAS sobre a v6), migradaEm gravada, os 3 fatos já existentes, nenhum recriado', r6y[0]?.acao === 'migrar' && !r6y[0].erro && r6y[0].vozVersao === 7 && r6y[0].fatosCriados === 0 && r6y[0].fatosJaExistentes === 3 && reg6y?.versao === 7 && reg6y.migradaEm !== null, JSON.stringify(r6y[0]))

    // ── 7. manter-legado e pendente não escrevem ───────────────────────────
    console.log('7) "manter-legado" e "pendente" não escrevem nada')
    const antes7 = fatosAnotados.length
    const migradaEm7 = reg6y?.migradaEm?.toISOString()
    const r7a = await aplicarManifesto(db, lerManifesto(manifestoCom({ versaoDaPrevia: 'qualquer-coisa-16', decisao: 'manter-legado', ...APROVACAO })).manifesto!, { criarFato, estadoDoFato, reindexarFato })
    const r7b = await aplicarManifesto(db, lerManifesto(manifestoCom({ versaoDaPrevia: 'qualquer-coisa-16', decisao: 'pendente' })).manifesto!, { criarFato, estadoDoFato, reindexarFato })
    const reg7 = await lerRegistroDaVoz(PROJETO)
    conferir('manter-legado e pendente voltam como tal (sem olhar a versão da prévia), a voz fica v7 migrada, registrador quieto', r7a[0]?.acao === 'manter-legado' && r7b[0]?.acao === 'pendente' && reg7?.versao === 7 && reg7.migradaEm?.toISOString() === migradaEm7 && fatosAnotados.length === antes7)

    // ── 8. nada além de BrandVoice ─────────────────────────────────────────
    console.log('8) nada além de BrandVoice (e da linha de base da própria prova) foi criado desde o início da prova')
    const criados = {
      base: await db.knowledgeBaseEntry.count({ where: { projectId: PROJETO, createdAt: { gte: inicio }, NOT: { tags: { has: TAG_DA_PROVA } } } }),
      sinais: await db.learningSignal.count({ where: { projectId: PROJETO, createdAt: { gte: inicio } } }),
      paginas: await db.page.count({ where: { Template: { projectId: PROJETO }, createdAt: { gte: inicio } } }),
      artes: await db.generation.count({ where: { projectId: PROJETO, createdAt: { gte: inicio } } }),
    }
    conferir('0 entradas na base além das linhas da prova (marcadas com a tag), 0 sinais, 0 páginas, 0 artes do projeto criadas desde o início (o registrador da prova grava sem indexar)', Object.values(criados).every((n) => n === 0), JSON.stringify(criados))
    registro.fatosAnotados = fatosAnotados.map((a) => a.fato.trecho.slice(0, 80))
  } catch (erro) {
    if (erro instanceof ProvaAbortada) {
      console.error(`\n✗ a prova parou: ${erro.message}`)
      for (const l of erro.linhas) console.error(`  ${l}`)
    } else console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    console.log('\ncleanup (a voz da prova sai; o DNA volta ao que era)')
    const falhasDoCleanup: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhasDoCleanup.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await passo('voz da prova', async () => { await db.brandVoice.deleteMany({ where: { projectId: PROJETO } }) })
    await passo('linha de base da prova', async () => {
      const r = await db.knowledgeBaseEntry.deleteMany({ where: { projectId: PROJETO, tags: { has: TAG_DA_PROVA } } })
      if (r.count !== linhasDeBaseDaProva.length) throw new Error(`apagadas ${r.count}, criadas ${linhasDeBaseDaProva.length}`)
    })
    if (vozAntes) {
      await passo('voz anterior recriada', async () => {
        const { id: _id, createdAt: _c, updatedAt: _u, ...resto } = vozAntes as Record<string, unknown> & { id: number; createdAt: Date; updatedAt: Date }
        await db.brandVoice.create({ data: resto as never })
      })
    }
    await passo('DNA restaurado', async () => { await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: dnaAntes?.contentRules ?? null, toneOfVoice: dnaAntes?.toneOfVoice ?? null } }) })
    const dnaDepois = await db.brandDNA.findUnique({ where: { projectId: PROJETO }, select: { toneOfVoice: true, contentRules: true } })
    if (dnaDepois?.contentRules !== (dnaAntes?.contentRules ?? null) || dnaDepois?.toneOfVoice !== (dnaAntes?.toneOfVoice ?? null)) falhasDoCleanup.push('o DNA não voltou ao que era')
    if ((await db.brandVoice.count({ where: { projectId: PROJETO } })) !== (vozAntes ? 1 : 0)) falhasDoCleanup.push('BrandVoice não voltou ao estado anterior')
    if ((await db.knowledgeBaseEntry.count({ where: { projectId: PROJETO, tags: { has: TAG_DA_PROVA } } })) !== 0) falhasDoCleanup.push('a linha de base da prova ficou')
    if (falhasDoCleanup.length) {
      console.error('  ✗ cleanup incompleto:', falhasDoCleanup.join(' | '))
      mau += falhasDoCleanup.length
    } else console.log('  ✓ BrandVoice e DNA como antes')
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ ...registro, pendentes, ok, falhas: mau, falhasDoCleanup }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main().catch((erro) => {
  // Falha ANTES do try/finally (pré-requisito de banco): nada foi tocado, e o processo encerra dizendo por quê.
  if (erro instanceof ProvaAbortada) {
    console.error(`\n✗ ${erro.message}\n`)
    for (const l of erro.linhas) console.error(`  ${l}`)
  } else console.error('\n✗ a prova falhou antes de começar:', erro instanceof Error ? erro.stack ?? erro.message : erro)
  process.exit(1)
})
