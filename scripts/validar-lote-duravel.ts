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
 *     prontas sem enfileirar de novo;
 *  8. controle positivo (decisões do Ciro, 13/09/2026): o item do plano é
 *     reaberto e editado, e o caminho recomendado — reler a revisão do item
 *     (o `itemRevisao` do ver-plano), itemId NOVO, itemRevisao atual — PRODUZ
 *     a arte nova pelo `compor-leva` de verdade, e a fila a compõe;
 *  9. peça superada no plano (decisões do Ciro, 13/09/2026): a leva antiga
 *     repetida pelo `compor-leva` depois de o item ganhar a arte nova não
 *     cria nada — a peça vai para `superadas`, com `arteAtualDoItem` (arte,
 *     página, data e situação) e a nota que manda contar e perguntar; nenhuma
 *     Generation, job ou página nova, e linhas do lote e item do plano
 *     intocados;
 * 10. PR11-F01 — o estado que a main ANTERIOR ao PR 11 deixa no banco, gravado
 *     À MÃO: item de plano na fila, Generation da peça e job COMPOR com
 *     `payload.planoRevisao` no formato dela (a string do json-stable-stringify
 *     de 15 campos). O mesmo pedido é reaproveitado sem lote e com lote (pelo
 *     `compor-leva` de verdade), e o job morto é refeito — antes do conserto,
 *     `superada` e `revisado`;
 * 11. PR11-F02 — peça COMPLETED SEM ARQUIVO não volta como pronta: a repetição
 *     recupera com Generation e job novos, e a seguinte reaproveita.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada; sem `.env`
 * recusa rodar). Sobe PNG ao Blob de produção e apaga no cleanup (declarado).
 * Lê cada imagem do Blob UMA vez por URL, com nova tentativa espaçada em
 * 403/429/5xx (`scripts/lib/leitura-do-blob.ts`): na prova-dev-4 o desafio
 * anti-bot do Blob derrubou a composição do passo 8, e a prova acusou o código.
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
const LOTE_C = `${PREFIXO_DO_LOTE}${CARIMBO}-c`

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
  const { atualizarItem, transicionarItem } = await import('../src/lib/planos/plano-service')
  const { toolsDoCompositor } = await import('../src/lib/mcp/catalogo/compositor')
  const { CLIENT_ID_LOCAL } = await import('../src/lib/mcp/tools')
  const { del } = await import('@vercel/blob')
  const { lerOBlobUmaVezPorUrl } = await import('./lib/leitura-do-blob')
  const { default: stableStringify } = await import('json-stable-stringify')
  await lerOBlobUmaVezPorUrl('validar-lote-duravel')
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
  // O `compor-leva` DE VERDADE (schema + handler), como o conector o chama — é
  // ele que separa `superadas` de `pecas` e `falhas` (decisões do Ciro, 13/09/2026).
  const comporLeva = toolsDoCompositor.find((t) => t.nome === 'compor-leva')
  if (!comporLeva) abortar('compor-leva não está no catálogo de tools')
  const principalLocal = { kind: 'service' as const, clientId: CLIENT_ID_LOCAL }
  type ArteAtual = { generationId?: string; pageId?: string | null; feitaEm?: string | null; feitaEmBrasilia?: string | null; situacao?: string }
  type RespostaDaLeva = {
    enfileiradas: number
    retomadas: number
    pecas: Array<{ indice: number; itemId: string | null; generationId: string; desfecho: string; situacao: string }>
    falhas: Array<{ indice: number; erro: string; codigo?: string; motivo?: string }>
    conflitos: Array<{ indice: number; itemId: string | null; diferencas: string[] }>
    superadas: Array<{ indice: number; itemId: string | null; arteDestePedido: string | null; arteAtualDoItem: ArteAtual | null }>
    nota: string
  }
  /** A spec da prova como item do `compor-leva`: sem o projectId (vai na raiz) e com a foto como `fotoUrl`. */
  const itemDaLeva = (spec: Record<string, unknown>, itemId: string, extra: Record<string, unknown> = {}) => {
    const foto = spec.foto as { url?: string } | undefined
    const campos = Object.fromEntries(Object.entries(spec).filter(([chave]) => chave !== 'projectId' && chave !== 'foto'))
    return { ...campos, itemId, ...(foto?.url ? { fotoUrl: foto.url } : {}), ...extra }
  }
  async function comporLevaPeloConector(loteId: string, itens: Array<Record<string, unknown>>): Promise<RespostaDaLeva> {
    const args = comporLeva!.schema.parse({ projectId: PROJETO, loteId, itens })
    return (await comporLeva!.handler(args as never, principalLocal as never)) as RespostaDaLeva
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
    // A revisão que o ver-plano devolveria para o item: peça de item de plano com lote exige (C11-1a).
    const { revisaoDoItem } = await import('../src/lib/planos/revisao-do-item')
    const itemRevisao = revisaoDoItem(itemDoPlano)
    const itensB = [
      { itemId: 'b-1', spec: peca(7) },
      // Revisão que não confere: o caminho do plano recusa DENTRO da transação, depois da reserva.
      { itemId: 'b-2', spec: specDoItem, opcoes: { itemAtualizadoEm: new Date(0), itemRevisao } },
      { itemId: 'b-3', spec: peca(8) },
    ]
    const passadaComFalha = await leva(LOTE_B, itensB)
    conferir('primeira passada: criado, falha, criado', JSON.stringify(desfechos(passadaComFalha)) === JSON.stringify(['criado', 'erro:ITEM_EXECUCAO_CONCORRENTE', 'criado']), JSON.stringify(desfechos(passadaComFalha)))
    const linhaB2 = (await linhasDoLote(LOTE_B)).find((l) => l.itemId === 'b-2')
    const itemDepoisDaFalha = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true } })
    conferir('o item 2 ficou reservado SEM Generation, e o item de plano intocado (a transação voltou atrás)', linhaB2?.situacao === 'reservado' && linhaB2.generationId === null && itemDepoisDaFalha?.status === 'proposto' && itemDepoisDaFalha.generationId === null, JSON.stringify({ linha: linhaB2?.situacao, item: itemDepoisDaFalha }))
    // O item foi relido: a ficha de concorrência não entra no hash, então a repetição é o mesmo pedido.
    const retomada = await leva(LOTE_B, itensB.map((i) => ({ ...i, opcoes: i.itemId === 'b-2' ? { itemRevisao } : undefined })))
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

    // ── 8. controle positivo: o caminho recomendado produz ──────────────────
    console.log('8) o item é reaberto e editado; o caminho recomendado (reler a revisão, itemId novo, itemRevisao atual) produz a arte nova')
    const arteAntigaDoItem = retomada[1].r!.generationId
    // A pessoa quer refazer: reprova a arte pronta e edita a copy (reprovado → editado).
    await transicionarItem({ projectId: PROJETO, planoId: plano.id, itemId: itemDoPlano.id, para: 'reprovado', motivo: `${MARCA} reaberto pela prova` })
    const COPY_V2 = 'Lote durável do plano, revisto'
    await atualizarItem({ projectId: PROJETO, planoId: plano.id, itemId: itemDoPlano.id, patch: { copyProposta: [COPY_V2] } })
    // O que o ver-plano devolveria agora: a revisão do item RELIDO.
    const itemRelido = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id } })
    const itemRevisaoAtual = itemRelido ? revisaoDoItem(itemRelido) : ''
    conferir('o item editado é executável, ainda aponta a arte antiga, e a revisão mudou', itemRelido?.status === 'editado' && itemRelido.generationId === arteAntigaDoItem && !!itemRevisaoAtual && itemRevisaoAtual !== itemRevisao, JSON.stringify({ status: itemRelido?.status, generationId: itemRelido?.generationId, revisaoMudou: itemRevisaoAtual !== itemRevisao }))
    const specV2 = peca(6, { itemDePlanoId: itemDoPlano.id, planoId: plano.id, blocos: [{ papel: 'headline', linhas: [COPY_V2] }] })
    const pecasAntesDoCaminho = await contarPecasDaMarca()
    const caminho = await comporLevaPeloConector(LOTE_B, [itemDaLeva(specV2, 'b-2-v2', { itemRevisao: itemRevisaoAtual })])
    const pecaNova = caminho.pecas[0]
    // `criado`, não `retomado`: a arte antiga não falhou nem se perdeu, e o chat lê em `enfileiradas`/`retomadas` o que aconteceu (prova-dev-4).
    conferir('produz: a peça nova vai para pecas como criada (1 enfileirada, 0 retomadas), nada em superadas, falhas ou conflitos', caminho.pecas.length === 1 && pecaNova.itemId === 'b-2-v2' && pecaNova.desfecho === 'criado' && caminho.enfileiradas === 1 && caminho.retomadas === 0 && pecaNova.generationId !== arteAntigaDoItem && caminho.superadas.length === 0 && caminho.falhas.length === 0 && caminho.conflitos.length === 0, JSON.stringify({ enfileiradas: caminho.enfileiradas, retomadas: caminho.retomadas, pecas: caminho.pecas, superadas: caminho.superadas, falhas: caminho.falhas, conflitos: caminho.conflitos }))
    const linhaV2 = (await linhasDoLote(LOTE_B)).find((l) => l.itemId === 'b-2-v2')
    conferir('uma Generation nova e um job, e a linha nova ligada a eles com a revisão atual', !!pecaNova && (await contarPecasDaMarca()) === pecasAntesDoCaminho + 1 && (await jobsPorGeracao([pecaNova.generationId])).get(pecaNova.generationId) === 1 && linhaV2?.generationId === pecaNova.generationId && linhaV2.situacao === 'enfileirado' && linhaV2.planoRevisao === itemRevisaoAtual, JSON.stringify({ linha: linhaV2?.situacao, revisao: linhaV2?.planoRevisao === itemRevisaoAtual }))
    const itemNaFila = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true } })
    conferir('o item de plano está na fila, ligado à peça nova', itemNaFila?.status === 'na-fila' && itemNaFila.generationId === pecaNova?.generationId, JSON.stringify(itemNaFila))
    if (linhaV2?.jobId) await dispararJobAgora(linhaV2.jobId)
    const itemComArteNova = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true, pageId: true, postId: true, updatedAt: true } })
    const arteNova = pecaNova ? await db.generation.findUnique({ where: { id: pecaNova.generationId }, select: { status: true, resultUrl: true, createdAt: true } }) : null
    conferir('a fila compôs a arte nova: o item saiu pronto com ela e com página', itemComArteNova?.status === 'pronto' && itemComArteNova.generationId === pecaNova?.generationId && !!itemComArteNova.pageId && arteNova?.status === 'COMPLETED' && !!arteNova.resultUrl, JSON.stringify({ item: itemComArteNova, arte: arteNova?.status }))

    // ── 9. peça superada no plano ───────────────────────────────────────────
    console.log('9) a leva antiga repetida depois de o item ganhar a arte nova: superada, com a arte atual do item, e nada é criado')
    const camposDaLinha = async () => JSON.stringify((await linhasDoLote(LOTE_B)).map((l) => [l.itemId, l.situacao, l.generationId, l.jobId, l.tentativas, l.hashDoPayload, l.planoRevisao]))
    const retratoDoProjeto = async () => ({
      generations: await db.generation.count({ where: { projectId: PROJETO } }),
      jobs: await db.generationJob.count({ where: { projectId: PROJETO } }),
      paginas: await db.page.count({ where: { Template: { projectId: PROJETO } } }),
      linhas: await camposDaLinha(),
      item: JSON.stringify(await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true, pageId: true, postId: true, updatedAt: true } })),
    })
    const antesDaRepeticao = await retratoDoProjeto()
    // A leva antiga, exatamente como foi pedida: mesma loteId, mesmos itemId, mesma copy e a itemRevisao ANTIGA do b-2.
    const repeticao = await comporLevaPeloConector(LOTE_B, itensB.map((i) => itemDaLeva(i.spec, i.itemId, i.itemId === 'b-2' ? { itemRevisao } : {})))
    const superada = repeticao.superadas[0]
    conferir('b-2 vai para superadas (fora de pecas e de falhas), com a peça deste pedido', repeticao.superadas.length === 1 && superada.itemId === 'b-2' && superada.indice === 1 && superada.arteDestePedido === arteAntigaDoItem && !repeticao.pecas.some((p) => p.itemId === 'b-2') && repeticao.falhas.length === 0 && repeticao.conflitos.length === 0, JSON.stringify({ superadas: repeticao.superadas, falhas: repeticao.falhas, conflitos: repeticao.conflitos }))
    const arteAtual = superada?.arteAtualDoItem ?? null
    conferir('arteAtualDoItem é a arte nova do item: arte, página, data e situação', arteAtual?.generationId === pecaNova?.generationId && arteAtual?.pageId === itemComArteNova?.pageId && arteAtual?.feitaEm === arteNova?.createdAt.toISOString() && !!arteAtual?.feitaEmBrasilia && arteAtual?.situacao === 'pronta', JSON.stringify(arteAtual))
    conferir('os outros itens da leva antiga seguem reaproveitados e prontos', JSON.stringify(repeticao.pecas.map((p) => `${p.itemId}:${p.desfecho}:${p.situacao}`)) === JSON.stringify(['b-1:reaproveitado:pronta', 'b-3:reaproveitado:pronta']), JSON.stringify(repeticao.pecas))
    conferir('a nota manda contar à pessoa e perguntar, sem refazer sozinho', repeticao.nota.includes('Superadas') && repeticao.nota.includes('pergunte') && repeticao.nota.includes('Não refaça sem ela pedir'), repeticao.nota.slice(0, 160))
    const depoisDaRepeticao = await retratoDoProjeto()
    conferir('nenhuma Generation, job ou página nova; linhas do lote e item do plano intocados', JSON.stringify(depoisDaRepeticao) === JSON.stringify(antesDaRepeticao), JSON.stringify({ antes: { g: antesDaRepeticao.generations, j: antesDaRepeticao.jobs, p: antesDaRepeticao.paginas }, depois: { g: depoisDaRepeticao.generations, j: depoisDaRepeticao.jobs, p: depoisDaRepeticao.paginas } }))

    // ── 10. PR11-F01: a revisão que a main gravava ANTES do PR 11 ───────────
    console.log('10) item enfileirado pela main ANTES do PR 11, o estado dela gravado À MÃO (planoRevisao legado no job): o mesmo pedido é reaproveitado com e sem lote, e o job morto é refeito')
    const { plano: plano10 } = await criarPlano({
      projectId: PROJETO,
      titulo: `${MARCA} legado`,
      inicio: dia,
      fim: dia,
      origem: 'chat',
      itens: [{ quando: `${dia} 16:00`, tema: `${MARCA} legado`, formato: 'story', via: 'compor', copyProposta: ['Peça da main antiga'] }],
    } as never)
    planos.push(plano10.id)
    const item10 = await db.itemDePlano.findUniqueOrThrow({ where: { id: plano10.itens[0].id } })
    // A string que a main (6405bfd5, enfileirar-composicao.ts:32–38) grava em `payload.planoRevisao`, escrita
    // À MÃO chave por chave na ordem do json-stable-stringify (`formato` antes de `foto`); da linha real vêm só
    // os valores. Nunca calculada pelo código novo.
    const j = (v: unknown) => JSON.stringify(v)
    const legada = `{"ajuste":${j(item10.ajusteDaFoto)},"campanha":${j(item10.campaignId)},"candidatas":${j(item10.fotoCandidatas)},"cliente":${j(item10.clienteProjectId)},"copy":${j(item10.copyProposta)},"direcao":${j(item10.direcao)},"escopo":${j(item10.escopo)},"formato":${j(item10.formato)},"foto":[${j(item10.fotoDriveId)},${j(item10.fotoUrl)}],"legenda":${j(item10.legenda)},"modelo":${j(item10.sourcePageId)},"quando":${j(item10.quando)},"referencias":${j(item10.referencias)},"tema":${j(item10.tema)},"via":${j(item10.via)}}`
    // Régua da FIXTURE (não do código): a expressão literal da main sobre a mesma linha.
    const daMain = stableStringify({ candidatas: item10.fotoCandidatas, copy: item10.copyProposta, foto: [item10.fotoDriveId, item10.fotoUrl], formato: item10.formato, quando: item10.quando, tema: item10.tema, legenda: item10.legenda, via: item10.via, modelo: item10.sourcePageId, direcao: item10.direcao, ajuste: item10.ajusteDaFoto, referencias: item10.referencias, cliente: item10.clienteProjectId, escopo: item10.escopo, campanha: item10.campaignId })
    conferir('a fixture escrita à mão é, byte a byte, a string que a main gravaria para esta linha', legada === daMain, legada)
    const spec10 = peca(10, { itemDePlanoId: item10.id, planoId: plano10.id, blocos: [{ papel: 'headline', linhas: ['Peça da main antiga'] }] })
    const specGravada10 = JSON.parse(JSON.stringify(validarSpec(spec10).spec))
    const pasta10 = await db.generation.findUniqueOrThrow({ where: { id: primeira[0].r!.generationId }, select: { templateId: true, templateName: true, createdBy: true } })
    const gen10 = await db.generation.create({
      data: { status: 'PROCESSING', templateId: pasta10.templateId, templateName: pasta10.templateName, projectId: PROJETO, createdBy: pasta10.createdBy, authorName: 'compositor', fieldValues: { source: 'compositor', spec: specGravada10, fila: 'aguardando' } },
      select: { id: true },
    })
    const job10 = await db.generationJob.create({
      data: { generationId: gen10.id, projectId: PROJETO, kind: 'COMPOR', status: 'RUNNING', attempts: 1, maxAttempts: 3, payload: { generationId: gen10.id, projectId: PROJETO, spec: specGravada10, decididoPor: null, autor: null, planoRevisao: legada } },
      select: { id: true },
    })
    await db.itemDePlano.update({ where: { id: item10.id }, data: { status: 'na-fila', generationId: gen10.id, pageId: null, erro: null } })
    const contarDoProjeto = async () => JSON.stringify({ g: await db.generation.count({ where: { projectId: PROJETO } }), j: await db.generationJob.count({ where: { projectId: PROJETO } }) })
    const antes10 = await contarDoProjeto()
    const semLote10 = await enfileirarPeca(spec10)
    conferir('sem lote (a bancada, o executar-plano): o mesmo pedido reaproveita a peça viva legada — antes do conserto, superada', semLote10.generationId === gen10.id && semLote10.jobId === job10.id, JSON.stringify({ generationId: semLote10.generationId }))
    const itemRelido10 = await db.itemDePlano.findUniqueOrThrow({ where: { id: item10.id } })
    const comLote10 = await comporLevaPeloConector(LOTE_C, [itemDaLeva(spec10, 'legado-1', { itemRevisao: revisaoDoItem(itemRelido10) })])
    const peca10 = comLote10.pecas[0]
    conferir('com lote (compor-leva de verdade): reaproveitada e pendente, a MESMA peça, nada em superadas, falhas ou conflitos — antes do conserto, superada', comLote10.pecas.length === 1 && peca10?.generationId === gen10.id && peca10.desfecho === 'reaproveitado' && peca10.situacao === 'pendente' && comLote10.superadas.length === 0 && comLote10.falhas.length === 0 && comLote10.conflitos.length === 0, JSON.stringify({ pecas: comLote10.pecas, superadas: comLote10.superadas.length, falhas: comLote10.falhas }))
    const linha10 = (await linhasDoLote(LOTE_C)).find((l) => l.itemId === 'legado-1')
    conferir('a linha nova do lote adota a peça legada, e nada foi criado no projeto', linha10?.generationId === gen10.id && (await contarDoProjeto()) === antes10, JSON.stringify({ antes: antes10, depois: await contarDoProjeto() }))
    await db.generationJob.update({ where: { id: job10.id }, data: { status: 'FAILED' } })
    const refeita10 = await enfileirarPeca(spec10)
    const jobRefeito10 = await db.generationJob.findUnique({ where: { id: refeita10.jobId }, select: { status: true, generationId: true, payload: true } })
    const item10Depois = await db.itemDePlano.findUniqueOrThrow({ where: { id: item10.id }, select: { status: true, generationId: true } })
    conferir('job morto com o item na fila: Generation e job NOVOS e executáveis, o item religado, com a revisão nova no job — antes do conserto, revisado', refeita10.generationId !== gen10.id && jobRefeito10?.status === 'PENDING' && jobRefeito10.generationId === refeita10.generationId && item10Depois.status === 'na-fila' && item10Depois.generationId === refeita10.generationId && (jobRefeito10.payload as { planoRevisao?: string }).planoRevisao === revisaoDoItem(itemRelido10), JSON.stringify({ item: item10Depois, job: jobRefeito10?.status }))

    // ── 11. PR11-F02: peça COMPLETED sem arquivo ────────────────────────────
    console.log('11) peça COMPLETED SEM ARQUIVO não volta como pronta: a repetição recupera com peça nova, e a seguinte reaproveita')
    const [s1] = await leva(LOTE_C, [{ itemId: 'sem-arquivo', spec: peca(11) }])
    await db.generation.update({ where: { id: s1.r!.generationId }, data: { status: 'COMPLETED', resultUrl: null } })
    await db.generationJob.update({ where: { id: s1.r!.jobId }, data: { status: 'DONE' } })
    const [s2] = await leva(LOTE_C, [{ itemId: 'sem-arquivo', spec: peca(11) }])
    const job11 = s2.r ? await db.generationJob.findUnique({ where: { id: s2.r.jobId }, select: { status: true, generationId: true } }) : null
    conferir('a repetição devolve Generation e job NOVOS, pendentes — antes do conserto, "reaproveitado/pronta" sem imagem', !!s2.r && s2.r.generationId !== s1.r!.generationId && s2.r.lote?.desfecho === 'retomado' && s2.r.lote.situacao === 'pendente' && job11?.status === 'PENDING' && job11.generationId === s2.r.generationId, JSON.stringify(s2.r?.lote ?? String(s2.erro)))
    const linha11 = (await linhasDoLote(LOTE_C)).find((l) => l.itemId === 'sem-arquivo')
    conferir('a linha do lote aponta a peça nova', !!s2.r && linha11?.generationId === s2.r.generationId && linha11.jobId === s2.r.jobId)
    const [s3] = await leva(LOTE_C, [{ itemId: 'sem-arquivo', spec: peca(11) }])
    conferir('a repetição seguinte reaproveita a peça nova, pendente, sem criar nada', !!s3.r && s3.r.generationId === s2.r?.generationId && s3.r.lote?.desfecho === 'reaproveitado' && s3.r.lote.situacao === 'pendente', JSON.stringify(s3.r?.lote ?? String(s3.erro)))
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
    const filtroDeLote = VARRER_ANTIGAS ? { loteId: { startsWith: PREFIXO_DO_LOTE } } : { loteId: { in: [LOTE_A, LOTE_B, LOTE_C] } }
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
