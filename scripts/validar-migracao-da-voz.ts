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
 *  4. aplicar com o manifesto aprovado: os fatos listados vão ao registrador
 *     (trecho exato, categoria, título, autor = dono do projeto), a voz é
 *     gravada (v1), a migração liga a precedência (`fonte: 'voz'` no serviço
 *     e no `loadBrandContext`) e o DNA de texto fica arquivado;
 *  5. aplicar de novo é `ja-migrado` — nada muda, registrador quieto;
 *  6. desfeita a migração e EDITADO o DNA, aplicar bloqueia ("a prévia mudou");
 *     restaurado o DNA, aplicar migra de novo pelo CAS (v2);
 *  7. `manter-legado` e `pendente` não escrevem nada;
 *  8. nada além de BrandVoice foi criado desde o início (base, sinais,
 *     páginas, artes do projeto).
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
function abortar(titulo: string, linhas: string[] = []): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  process.exit(1)
}
function apontarParaODev(): string {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  if (!dev.DATABASE_URL) abortar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producao = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
  if (producao.size === 0) abortar('o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.')
  if (!alvo || producao.has(alvo)) abortar('O banco resolvido é o de PRODUÇÃO.', [`DATABASE_URL aponta para ${alvo ?? '(ilegível)'}.`])
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
  const { aplicarManifesto, bancoSemTabelaDeVoz, gerarPrevias, lerEstadoDoCliente } = await import('./migrar-voz-da-marca')
  type FatoACriar = import('./migrar-voz-da-marca').FatoACriar
  const { lerManifesto, manifestoEmBranco, previaParaMarkdown, VERSAO_DO_MANIFESTO } = await import('../src/lib/brand/migracao-da-voz')
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
  const vozAntes = await db.brandVoice.findUnique({ where: { projectId: PROJETO } })
  if (vozAntes) await db.brandVoice.delete({ where: { projectId: PROJETO } })
  const registro: Record<string, unknown> = { sha, branch, banco: ENDPOINT, projeto: PROJETO }

  // O registrador de fatos da prova: só ANOTA — a base de conhecimento não é escrita (indexaria no vetor de produção).
  const fatosAnotados: Array<{ fato: FatoACriar; autor: string }> = []
  const criarFato = async (fato: FatoACriar, autor: string) => {
    fatosAnotados.push({ fato, autor })
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

    // ── 4. aplicar de verdade (com o stub de fatos) ────────────────────────
    console.log('4) aplicar o manifesto aprovado: fatos listados vão ao registrador, a voz é gravada (v1), a migração liga a precedência e o DNA fica arquivado')
    const fatosDaPrevia = previa.fatos.noLegado.slice(0, 2).map((f, i) => ({ trecho: f.trecho, categoria: (f.tipos.includes('horario') ? 'HORARIOS' : 'ESTABELECIMENTO_INFO') as 'HORARIOS' | 'ESTABELECIMENTO_INFO', titulo: `Fato ${i + 1} da prévia (prova)`, ...(i === 1 ? { validaAte: '2026-12-31' } : {}) }))
    const aprovado = lerManifesto(manifestoCom({ versaoDaPrevia: previa.versaoDaPrevia, decisao: 'migrar', ...APROVACAO, fatosParaABase: fatosDaPrevia }))
    if (!aprovado.manifesto) abortar('o manifesto aprovado não passou no contrato', aprovado.problemas)
    const agora4 = new Date()
    const r4 = await aplicarManifesto(db, aprovado.manifesto, { criarFato, agora: agora4 })
    conferir(`migrou: voz v1, ${fatosDaPrevia.length} fato(s) registrado(s) (${previa.fatos.noLegado.length} disponíveis na prévia)`, r4[0]?.acao === 'migrar' && !r4[0].erro && r4[0].vozVersao === 1 && r4[0].fatosCriados === fatosDaPrevia.length && r4[0].migradaEm === agora4.toISOString(), JSON.stringify(r4[0]))
    conferir('cada fato foi ao registrador com o trecho EXATO da prévia, a categoria, o título, a validade e o autor = dono do projeto', fatosAnotados.length === fatosDaPrevia.length && fatosAnotados.every((a, i) => a.fato.trecho === fatosDaPrevia[i].trecho && a.fato.categoria === fatosDaPrevia[i].categoria && a.fato.titulo === fatosDaPrevia[i].titulo && a.fato.validaAte === (fatosDaPrevia[i].validaAte ?? null) && a.fato.versaoDaPrevia === previa.versaoDaPrevia && a.autor === projeto.userId), JSON.stringify(fatosAnotados.map((a) => [a.fato.categoria, a.fato.validaAte])))
    const reg4 = await lerRegistroDaVoz(PROJETO)
    conferir('BrandVoice: versão 1, migradaEm gravada, dnaArquivado com o toneOfVoice/contentRules de antes', reg4?.versao === 1 && reg4.migradaEm !== null && !!reg4.dnaArquivado && JSON.stringify((reg4.dnaArquivado as { toneOfVoice?: unknown }).toneOfVoice ?? null) === JSON.stringify(dnaAntes.toneOfVoice) , JSON.stringify({ versao: reg4?.versao, migradaEm: reg4?.migradaEm }))
    const c4 = await contextoDeVoz(PROJETO)
    const b4 = await loadBrandContext(PROJETO)
    const promptEsperado = vozParaPrompt(VOZES_PROPOSTAS[PROJETO].voz, { escopo: 'copy' })
    conferir('a precedência: fonte "voz" no serviço e no loader, com o texto compacto da voz proposta', c4.fonte === 'voz' && c4.versao === 1 && c4.texto === promptEsperado && b4?.voz.fonte === 'voz' && b4.voz.texto === promptEsperado, JSON.stringify({ fonte: c4.fonte, chars: c4.texto?.length }))

    // ── 5. de novo: já migrado ─────────────────────────────────────────────
    console.log('5) aplicar de novo o mesmo manifesto é "ja-migrado": nada muda, registrador quieto')
    const antes5 = fatosAnotados.length
    const r5 = await aplicarManifesto(db, aprovado.manifesto, { criarFato })
    const reg5 = await lerRegistroDaVoz(PROJETO)
    conferir('ja-migrado; versão continua 1; nenhum fato novo', r5[0]?.acao === 'ja-migrado' && reg5?.versao === 1 && fatosAnotados.length === antes5, JSON.stringify(r5[0]))

    // ── 6. desfazer + DNA editado → bloqueado; DNA restaurado → migra pelo CAS ──
    console.log('6) desfeita a migração e EDITADO o DNA, aplicar bloqueia ("a prévia mudou"); restaurado o DNA, migra de novo pelo CAS (v2)')
    const d6 = await desfazerMigracao({ projectId: PROJETO })
    await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: `${dnaAntes.contentRules ?? ''}\n- Linha de prova da migração (não é regra) [PR13 ${sha.slice(0, 8)}]` } })
    const r6a = await aplicarManifesto(db, aprovado.manifesto, { criarFato })
    const reg6a = await lerRegistroDaVoz(PROJETO)
    conferir('desfeita e com o DNA editado: bloqueado ("a prévia mudou"), a voz continua v1 e NÃO migrada, registrador quieto', d6.desfeita && r6a[0]?.acao === 'bloqueado' && /prévia mudou/.test(r6a[0].motivo ?? '') && reg6a?.versao === 1 && reg6a.migradaEm === null && fatosAnotados.length === antes5, r6a[0]?.motivo)
    await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: dnaAntes.contentRules ?? null } })
    const lido6 = await lerEstadoDoCliente(db, PROJETO)
    conferir('com o DNA restaurado a versão da prévia volta a ser a aprovada e o estado traz o registro v1 (não migrado)', lido6?.estado.versaoDaPreviaAtual === previa.versaoDaPrevia && lido6.estado.registro?.versao === 1 && lido6.estado.registro.migradaEm === null)
    const r6b = await aplicarManifesto(db, aprovado.manifesto, { criarFato })
    const reg6b = await lerRegistroDaVoz(PROJETO)
    conferir('migra de novo pelo CAS: voz v2 (versão esperada 1), migradaEm gravada; os fatos foram registrados de novo (é o manifesto que decide)', r6b[0]?.acao === 'migrar' && !r6b[0].erro && r6b[0].vozVersao === 2 && reg6b?.versao === 2 && reg6b.migradaEm !== null && fatosAnotados.length === antes5 + fatosDaPrevia.length, JSON.stringify(r6b[0]))

    // ── 7. manter-legado e pendente não escrevem ───────────────────────────
    console.log('7) "manter-legado" e "pendente" não escrevem nada')
    const antes7 = fatosAnotados.length
    const migradaEm7 = reg6b?.migradaEm?.toISOString()
    const r7a = await aplicarManifesto(db, lerManifesto(manifestoCom({ versaoDaPrevia: 'qualquer-coisa-16', decisao: 'manter-legado', ...APROVACAO })).manifesto!, { criarFato })
    const r7b = await aplicarManifesto(db, lerManifesto(manifestoCom({ versaoDaPrevia: 'qualquer-coisa-16', decisao: 'pendente' })).manifesto!, { criarFato })
    const reg7 = await lerRegistroDaVoz(PROJETO)
    conferir('manter-legado e pendente voltam como tal (sem olhar a versão da prévia), a voz fica v2 migrada, registrador quieto', r7a[0]?.acao === 'manter-legado' && r7b[0]?.acao === 'pendente' && reg7?.versao === 2 && reg7.migradaEm?.toISOString() === migradaEm7 && fatosAnotados.length === antes7)

    // ── 8. nada além de BrandVoice ─────────────────────────────────────────
    console.log('8) nada além de BrandVoice foi criado desde o início da prova')
    const criados = {
      base: await db.knowledgeBaseEntry.count({ where: { projectId: PROJETO, createdAt: { gte: inicio } } }),
      sinais: await db.learningSignal.count({ where: { projectId: PROJETO, createdAt: { gte: inicio } } }),
      paginas: await db.page.count({ where: { Template: { projectId: PROJETO }, createdAt: { gte: inicio } } }),
      artes: await db.generation.count({ where: { projectId: PROJETO, createdAt: { gte: inicio } } }),
    }
    conferir('0 entradas na base, 0 sinais, 0 páginas, 0 artes do projeto criadas desde o início (o registrador de fatos é o stub)', Object.values(criados).every((n) => n === 0), JSON.stringify(criados))
    registro.fatosAnotados = fatosAnotados.map((a) => a.fato.trecho.slice(0, 80))
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
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

main()
