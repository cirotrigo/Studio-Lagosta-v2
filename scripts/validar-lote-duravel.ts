/**
 * Prova de integração do PR 11 de "Marca simples, copy melhor" (o lote
 * durável: identidade por item e reserva antes da fila), no BRANCH DE DEV do
 * Neon — contra o Postgres de verdade, onde a chave única composta e a trava
 * `SELECT … FOR UPDATE` são as reais (o teste com banco falso só as modela).
 *
 * O que ela prova, com dados criados e apagados por ela:
 *  1. uma leva de 3 itens com identidade cria 3 Generations e 3 jobs, e cada
 *     linha de `ItemDeLote` fica `enfileirado` apontando para a sua;
 *  2. a repetição IDÊNTICA da leva devolve as mesmas Generations e jobs, sem
 *     criar nada;
 *  3. o mesmo item com outro conteúdo é `LOTE_ITEM_CONFLITO` (409), com o que
 *     difere, e nada muda;
 *  4. duas chamadas simultâneas com a mesma chave terminam com UMA Generation
 *     (dentro de um processo só: com o pooler o cliente tem 1 conexão, então a
 *     disputa pela trava entre invocações diferentes não é exercitada aqui);
 *  5. reserva órfã (linha sem Generation) é retomada criando só o que falta;
 *  6. leva com falha no MEIO (o item de plano 2 recusa por revisão
 *     concorrente, dentro da transação) e repetição da leva: exatamente um job
 *     por item, o item de plano ligado à sua peça;
 *  7. a fila REAL compõe as peças (`dispararJobAgora`): cada Generation fica
 *     COMPLETED com página e imagem; e a repetição da leva devolve as peças
 *     prontas sem enfileirar de novo.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada; sem `.env`
 * recusa rodar). Sobe PNG ao Blob de produção e apaga no cleanup (declarado).
 * A pasta da semana criada por `garantirPasta` fica (é reutilizada, como na
 * prova da copy autoral).
 *
 * Cleanup: SÓ o que esta rodada criou (a MARCA e os lotes desta rodada, no
 * projeto da prova). `--varrer-antigas` apaga também o que rodadas anteriores
 * interrompidas deixaram com o prefixo da marca, SÓ neste projeto. Falha de
 * cleanup conta como falha da prova (saída ≠ 0).
 *
 * USO: npx tsx scripts/validar-lote-duravel.ts [--saida <pasta>] [--varrer-antigas]
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
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.', ['Worktree não herda o .env (gitignored): rode a partir de um checkout que o tenha.'])
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
const PROJETO = 8
const SAIDA = argumento('--saida') ?? '.tmp-validar-lote-duravel'
const VARRER_ANTIGAS = process.argv.includes('--varrer-antigas')
const CARIMBO = new Date().toISOString()
const MARCA = `[PR11-LOTE ${CARIMBO}]`
const PREFIXO_DO_LOTE = 'pr11-lote-'
const LOTE_A = `${PREFIXO_DO_LOTE}${CARIMBO}-a`
const LOTE_B = `${PREFIXO_DO_LOTE}${CARIMBO}-b`

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

  const { db } = await import('../src/lib/db')
  const { enfileirarPeca } = await import('../src/lib/compositor/fila')
  const { validarSpec } = await import('../src/lib/compositor/spec')
  const { hashDoPayload, payloadParaHash } = await import('../src/lib/lotes/identidade')
  const { dispararJobAgora } = await import('../src/lib/ai/generation-queue-executor')
  const { criarPlano } = await import('../src/lib/planos/plano-service')
  const { CreativeError } = await import('../src/lib/creatives/errors')
  const { del } = await import('@vercel/blob')
  type Peca = Awaited<ReturnType<typeof enfileirarPeca>>

  const planos: string[] = []

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)

  const foto = await db.generation.findFirst({
    where: { projectId: PROJETO, status: 'COMPLETED', resultUrl: { contains: 'blob.vercel-storage.com' }, fieldValues: { path: ['track'], equals: 'imagem' } },
    orderBy: { createdAt: 'desc' },
    select: { resultUrl: true },
  })
  const fotoUrl = foto?.resultUrl ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600'
  const dia = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const peca = (n: number, extra: Record<string, unknown> = {}) => ({
    projectId: PROJETO,
    formato: 'story',
    foto: { url: fotoUrl },
    nome: `${MARCA} peça ${n}`,
    quando: `${dia} ${String(9 + n).padStart(2, '0')}:00`,
    tema: `${MARCA} teste`,
    blocos: [
      { papel: 'headline', linhas: [`Lote durável ${n}`] },
      { papel: 'apoio', linhas: ['Peça criada pela prova de integração.', 'Pode apagar.'] },
    ],
    ...extra,
  })
  const identidade = (loteId: string, itemId: string) => ({ lote: { loteId, itemId }, canal: 'claude-code' as const })
  const linhasDoLote = (loteId: string) => db.itemDeLote.findMany({ where: { projectId: PROJETO, loteId }, orderBy: { itemId: 'asc' } })
  const contarPecasDaMarca = async () => db.generation.count({ where: { projectId: PROJETO, fieldValues: { path: ['spec', 'nome'], string_contains: MARCA } } })
  async function jobsPorGeracao(ids: string[]) {
    const jobs = await db.generationJob.findMany({ where: { generationId: { in: ids } }, select: { generationId: true } })
    const contagem = new Map<string, number>()
    for (const j of jobs) contagem.set(j.generationId, (contagem.get(j.generationId) ?? 0) + 1)
    return contagem
  }
  async function leva(loteId: string, itens: Array<{ itemId: string; spec: unknown; opcoes?: Record<string, unknown> }>) {
    const saida: Array<{ itemId: string; r?: Peca; erro?: unknown }> = []
    // Em SÉRIE, como `compor-leva`: a falha de um item não derruba os outros.
    for (const item of itens) {
      try {
        saida.push({ itemId: item.itemId, r: await enfileirarPeca(item.spec, { ...identidade(loteId, item.itemId), ...(item.opcoes ?? {}) }) })
      } catch (erro) {
        saida.push({ itemId: item.itemId, erro })
      }
    }
    return saida
  }
  const desfechos = (s: Awaited<ReturnType<typeof leva>>) => s.map((x) => (x.erro ? `erro:${x.erro instanceof CreativeError ? x.erro.code : String(x.erro)}` : x.r!.lote!.desfecho))

  try {
    // ── 1. leva com identidade ──────────────────────────────────────────────
    console.log('1) leva de 3 itens com identidade: 3 Generations, 3 jobs, 3 linhas enfileiradas')
    const itensA = [1, 2, 3].map((n) => ({ itemId: `item-${n}`, spec: peca(n) }))
    const primeira = await leva(LOTE_A, itensA)
    conferir('os 3 itens foram criados agora', JSON.stringify(desfechos(primeira)) === JSON.stringify(['criado', 'criado', 'criado']), JSON.stringify(desfechos(primeira)))
    const linhasA1 = await linhasDoLote(LOTE_A)
    conferir('3 linhas de ItemDeLote, enfileiradas, cada uma na sua Generation e no seu job', linhasA1.length === 3 && linhasA1.every((l, i) => l.situacao === 'enfileirado' && l.generationId === primeira[i].r?.generationId && l.jobId === primeira[i].r?.jobId && l.tentativas === 1))
    const idsA = primeira.map((x) => x.r!.generationId)
    conferir('um job por Generation', [...(await jobsPorGeracao(idsA)).values()].join() === '1,1,1')
    const pecasDepoisDaLeva = await contarPecasDaMarca()

    // ── 2. repetição idêntica ───────────────────────────────────────────────
    console.log('2) a repetição idêntica da leva não cria nada')
    const repetida = await leva(LOTE_A, itensA)
    conferir('os 3 itens foram reaproveitados, com as MESMAS Generations e jobs', repetida.every((x, i) => x.r?.lote?.desfecho === 'reaproveitado' && x.r.generationId === primeira[i].r!.generationId && x.r.jobId === primeira[i].r!.jobId), JSON.stringify(desfechos(repetida)))
    conferir('nenhuma Generation nova', (await contarPecasDaMarca()) === pecasDepoisDaLeva, `${pecasDepoisDaLeva} → ${await contarPecasDaMarca()}`)
    conferir('as linhas ficaram como estavam (sem nova tentativa)', (await linhasDoLote(LOTE_A)).every((l) => l.tentativas === 1))

    // ── 3. conflito ─────────────────────────────────────────────────────────
    console.log('3) o mesmo item com outro conteúdo é conflito e nada muda')
    const antesDoConflito = (await linhasDoLote(LOTE_A))[0]
    let conflito: unknown = null
    try {
      await enfileirarPeca(peca(1, { blocos: [{ papel: 'headline', linhas: ['Outra manchete'] }, { papel: 'apoio', linhas: ['Peça criada pela prova de integração.', 'Pode apagar.'] }] }), identidade(LOTE_A, 'item-1'))
    } catch (erro) {
      conflito = erro
    }
    const c = conflito as InstanceType<typeof CreativeError> | null
    conferir('LOTE_ITEM_CONFLITO (409), dizendo o que difere', c instanceof CreativeError && c.code === 'LOTE_ITEM_CONFLITO' && c.status === 409 && Array.isArray(c.details?.diferencas) && (c.details!.diferencas as string[]).includes('blocos[headline].linhas'), c ? `${(c as Error).message}`.slice(0, 160) : 'não lançou')
    const depoisDoConflito = (await linhasDoLote(LOTE_A))[0]
    conferir('a linha e a contagem de peças não mudaram', JSON.stringify(depoisDoConflito) === JSON.stringify(antesDoConflito) && (await contarPecasDaMarca()) === pecasDepoisDaLeva)

    // ── 4. concorrência ─────────────────────────────────────────────────────
    console.log('4) duas chamadas simultâneas com a mesma chave: UMA Generation')
    const [x, y] = await Promise.all([enfileirarPeca(peca(4), identidade(LOTE_A, 'item-concorrente')), enfileirarPeca(peca(4), identidade(LOTE_A, 'item-concorrente'))])
    const linhasConc = (await linhasDoLote(LOTE_A)).filter((l) => l.itemId === 'item-concorrente')
    conferir('as duas devolvem a mesma Generation e o mesmo job', x.generationId === y.generationId && x.jobId === y.jobId, `${x.lote?.desfecho} + ${y.lote?.desfecho}`)
    conferir('uma linha, uma Generation, um job', linhasConc.length === 1 && (await contarPecasDaMarca()) === pecasDepoisDaLeva + 1 && (await jobsPorGeracao([x.generationId])).get(x.generationId) === 1)

    // ── 5. reserva órfã ─────────────────────────────────────────────────────
    console.log('5) reserva órfã (linha sem Generation) é retomada criando só o que falta')
    const specOrfa = validarSpec(peca(5)).spec!
    const payloadOrfa = payloadParaHash(specOrfa)
    await db.itemDeLote.create({ data: { projectId: PROJETO, loteId: LOTE_A, itemId: 'item-orfao', hashDoPayload: hashDoPayload(payloadOrfa), payload: payloadOrfa as never } })
    const orfa = await enfileirarPeca(peca(5), identidade(LOTE_A, 'item-orfao'))
    const linhaOrfa = (await linhasDoLote(LOTE_A)).find((l) => l.itemId === 'item-orfao')
    conferir('retomada: uma Generation e um job, a linha ligada a eles', orfa.lote?.desfecho === 'retomado' && linhaOrfa?.generationId === orfa.generationId && linhaOrfa?.jobId === orfa.jobId && linhaOrfa?.situacao === 'enfileirado' && (await contarPecasDaMarca()) === pecasDepoisDaLeva + 2, orfa.lote?.desfecho)

    // ── 6. falha parcial e retomada ─────────────────────────────────────────
    console.log('6) leva com falha no meio (item de plano com revisão concorrente) e repetição: um job por item')
    const { plano } = await criarPlano({
      projectId: PROJETO,
      titulo: `${MARCA} plano`,
      inicio: dia,
      fim: dia,
      origem: 'chat',
      itens: [{ quando: `${dia} 15:00`, tema: `${MARCA} tema`, formato: 'story', via: 'compor', copyProposta: ['Lote durável do plano'] }],
    } as never)
    planos.push(plano.id)
    const itemDoPlano = plano.itens[0]
    const specDoItem = peca(6, { itemDePlanoId: itemDoPlano.id, planoId: plano.id, blocos: [{ papel: 'headline', linhas: ['Lote durável do plano'] }] })
    const itensB = [
      { itemId: 'b-1', spec: peca(7) },
      // Revisão que não confere: o caminho do plano recusa DENTRO da transação, depois da reserva.
      { itemId: 'b-2', spec: specDoItem, opcoes: { itemAtualizadoEm: new Date(0) } },
      { itemId: 'b-3', spec: peca(8) },
    ]
    const passadaComFalha = await leva(LOTE_B, itensB)
    conferir('primeira passada: criado, falha, criado', JSON.stringify(desfechos(passadaComFalha)) === JSON.stringify(['criado', 'erro:ITEM_EXECUCAO_CONCORRENTE', 'criado']), JSON.stringify(desfechos(passadaComFalha)))
    const linhaB2 = (await linhasDoLote(LOTE_B)).find((l) => l.itemId === 'b-2')
    const itemDepoisDaFalha = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true } })
    conferir('o item 2 ficou reservado SEM Generation, e o item de plano intocado (a transação voltou atrás)', linhaB2?.situacao === 'reservado' && linhaB2.generationId === null && itemDepoisDaFalha?.status === 'proposto' && itemDepoisDaFalha.generationId === null, JSON.stringify({ linha: linhaB2?.situacao, item: itemDepoisDaFalha }))
    // O item foi relido: a ficha de concorrência não entra no hash, então a repetição é o mesmo pedido.
    const retomada = await leva(LOTE_B, itensB.map((i) => ({ ...i, opcoes: undefined })))
    conferir('repetição: reaproveitado, retomado, reaproveitado', JSON.stringify(desfechos(retomada)) === JSON.stringify(['reaproveitado', 'retomado', 'reaproveitado']), JSON.stringify(desfechos(retomada)))
    const linhasB = await linhasDoLote(LOTE_B)
    const idsB = linhasB.map((l) => l.generationId).filter((g): g is string => !!g)
    conferir('exatamente um job por item', idsB.length === 3 && new Set(idsB).size === 3 && [...(await jobsPorGeracao(idsB)).values()].join() === '1,1,1')
    const itemRetomado = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true } })
    conferir('o item de plano está na fila, ligado à peça do item 2', itemRetomado?.status === 'na-fila' && itemRetomado.generationId === retomada[1].r?.generationId, JSON.stringify(itemRetomado))

    // ── 7. a fila real ──────────────────────────────────────────────────────
    console.log('7) a fila REAL compõe; a repetição devolve as peças prontas sem enfileirar de novo')
    const todasAsLinhas = [...(await linhasDoLote(LOTE_A)), ...linhasB]
    for (const l of todasAsLinhas) if (l.jobId) await dispararJobAgora(l.jobId)
    const geracoes = await db.generation.findMany({ where: { id: { in: todasAsLinhas.map((l) => l.generationId!).filter(Boolean) } }, select: { id: true, status: true, resultUrl: true, fieldValues: true } })
    const semPagina = geracoes.filter((g) => g.status !== 'COMPLETED' || !g.resultUrl || !(g.fieldValues as Record<string, unknown> | null)?.pageId)
    conferir('todas COMPLETED, com imagem e página', geracoes.length === todasAsLinhas.length && semPagina.length === 0, semPagina.map((g) => `${g.id}:${g.status}:${String((g.fieldValues as Record<string, unknown> | null)?.error ?? '').slice(0, 60)}`).join(' | '))
    const paginas = await db.page.count({ where: { id: { in: geracoes.map((g) => String((g.fieldValues as Record<string, unknown> | null)?.pageId ?? '')) } } })
    conferir('as páginas existem (editáveis)', paginas === geracoes.length, `${paginas}/${geracoes.length}`)
    const itemPronto = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true, pageId: true } })
    conferir('o item de plano saiu pronto, com página', itemPronto?.status === 'pronto' && !!itemPronto.pageId, JSON.stringify(itemPronto))
    const jobsAntes = await db.generationJob.count({ where: { generationId: { in: geracoes.map((g) => g.id) } } })
    const depoisDePronta = await leva(LOTE_A, itensA)
    conferir('repetição depois de pronta: reaproveitado e PRONTA, nos 3 itens', depoisDePronta.every((d, i) => d.r?.lote?.desfecho === 'reaproveitado' && d.r.lote.situacao === 'pronta' && d.r.generationId === primeira[i].r!.generationId), JSON.stringify(depoisDePronta.map((d) => d.r?.lote)))
    conferir('nenhum job novo', (await db.generationJob.count({ where: { generationId: { in: geracoes.map((g) => g.id) } } })) === jobsAntes)
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou, no projeto da prova)')
    const apagados = { lotes: 0, generations: 0, jobs: 0, pages: 0, planos: 0, blobs: 0 }
    const falhasDoCleanup: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhasDoCleanup.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const marcas = VARRER_ANTIGAS ? ['[PR11-LOTE '] : [MARCA]
    const filtroDeLote = VARRER_ANTIGAS ? { loteId: { startsWith: PREFIXO_DO_LOTE } } : { loteId: { in: [LOTE_A, LOTE_B] } }
    const blobs = new Set<string>()
    let idsDeGeracao: string[] = []
    let idsDePagina: string[] = []
    await passo('generations', async () => {
      const ligadas = (await db.itemDeLote.findMany({ where: { projectId: PROJETO, ...filtroDeLote }, select: { generationId: true } })).map((l) => l.generationId).filter((g): g is string => !!g)
      const gens = await db.generation.findMany({
        where: { projectId: PROJETO, OR: [{ id: { in: ligadas } }, ...marcas.map((m) => ({ fieldValues: { path: ['spec', 'nome'], string_contains: m } }))] },
        select: { id: true, resultUrl: true, fieldValues: true },
      })
      for (const g of gens) if (g.resultUrl) blobs.add(g.resultUrl)
      idsDeGeracao = gens.map((g) => g.id)
      idsDePagina = gens.map((g) => (g.fieldValues as Record<string, unknown> | null)?.pageId).filter((p): p is string => typeof p === 'string')
    })
    await passo('jobs', async () => { apagados.jobs = (await db.generationJob.deleteMany({ where: { generationId: { in: idsDeGeracao } } })).count })
    await passo('generations', async () => { apagados.generations = (await db.generation.deleteMany({ where: { id: { in: idsDeGeracao } } })).count })
    await passo('sinais', async () => { await db.learningSignal.deleteMany({ where: { projectId: PROJETO, OR: [{ pageId: { in: idsDePagina } }, { generationId: { in: idsDeGeracao } }] } }) })
    await passo('páginas', async () => { apagados.pages = (await db.page.deleteMany({ where: { id: { in: idsDePagina } } })).count })
    await passo('planos', async () => { apagados.planos = (await db.planoDeConteudo.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: planos } }, ...marcas.map((m) => ({ titulo: { contains: m } }))] } })).count })
    await passo('lotes', async () => { apagados.lotes = (await db.itemDeLote.deleteMany({ where: { projectId: PROJETO, ...filtroDeLote } })).count })
    for (const url of blobs) {
      await passo(`blob ${url.slice(-40)}`, async () => {
        await del(url)
        apagados.blobs++
      })
    }
    if (falhasDoCleanup.length) {
      console.error('  ✗ cleanup incompleto:', falhasDoCleanup.join(' | '))
      mau += falhasDoCleanup.length
    }
    console.log('  apagados:', JSON.stringify(apagados))
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ sha, branch, pendentes, banco: ENDPOINT, ok, falhas: mau, apagados, falhasDoCleanup }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
