/**
 * Prova de integração do PR 12 de "Marca simples, copy melhor" (do lote até os
 * rascunhos: agendamento idempotente por item de lote), no BRANCH DE DEV do
 * Neon — contra o Postgres de verdade, onde as travas `SELECT … FOR UPDATE` na
 * linha do item e na página são as reais (o teste com banco falso só as
 * modela).
 *
 * O que ela prova, com dados criados e apagados por ela:
 *  1. uma semana de 5 peças compostas pela fila REAL, com a do meio falhando
 *     de forma determinística (texto que não cabe na coluna);
 *  2. `simular: true` dá a conta (4 concluídos, 1 falha) sem escrever nada;
 *  3. a chamada de verdade cria EXATAMENTE os 4 rascunhos previstos, cada um
 *     com pageId + templateId (página editável), tipo STORY, imagem = a peça
 *     (RENDERED) e os efeitos carimbados;
 *  4. a repetição da semana não duplica nada;
 *  5. duas chamadas simultâneas no mesmo item terminam com UM post;
 *  6. queda entre o commit e os efeitos (carimbo apagado à mão) é completada
 *     pela repetição, sem duplicar os sinais;
 *  7. rascunho que já tinha a página (criado por agendarPost) é ADOTADO;
 *  8. post apagado da agenda não é recriado (POST_REMOVIDO);
 *  9. outro pedido sob o mesmo item é LOTE_AGENDAMENTO_CONFLITO;
 * 10. camada editada depois da composição (sem refazer o thumbnail) → o
 *     rascunho nasce PENDING, sem o PNG velho;
 * 11. peça de feed vira POST;
 * 12. rascunho apagado pela equipe (decisões do Ciro, 13/09/2026), numa peça
 *     de ITEM DE PLANO: a repetição sem confirmação é `POST_REMOVIDO` com
 *     `rascunhoApagado { quando, tema, manchete }`, e nenhum post nasce;
 * 13. `simular` com `recriarRascunhoApagado: true` dá a conta (recriado) e não
 *     escreve nada;
 * 14. a confirmação com OUTRO horário é conflito (só o pedido original
 *     recria), e nada é criado;
 * 15. `"true"` em texto não é confirmação: o item é recusado, nada é criado;
 * 16. com a confirmação (`true` literal): UM rascunho novo, com a mesma arte,
 *     desfecho `recriado`, a linha e o item do plano reapontados;
 * 17. a segunda confirmação devolve `reaproveitado` e continua um post só.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada; sem `.env`
 * recusa rodar). Sobe PNG ao Blob de produção e apaga no cleanup (declarado).
 * A pasta da semana criada por `garantirPasta` fica (é reutilizada).
 *
 * MODO DE PRODUÇÃO, SÓ LEITURA (`--producao-somente-leitura`): aponta para o
 * banco do `.env` e roda SÓ SELECTs dentro de uma transação
 * `SET TRANSACTION READ ONLY` — o Postgres recusa qualquer escrita. Conta os
 * itens de lote (com e sem rascunho, efeitos pendentes) e páginas com mais de
 * um rascunho/agendado; com `--projeto <id> --lote <loteId> [--itens a,b]`,
 * faz a conta das operações daquele lote chamando o SERVIÇO em simulação com
 * as leituras pela transação READ ONLY (`leitor`, R12-04): a conta é a decisão
 * inteira dele — item do plano, mídia em outro post, post de outro item — e a
 * garantia de só-leitura continua sendo do banco, não da disciplina. Sem a
 * migration do PR 12 aplicada a conta por item não é feita (a decisão lê as
 * colunas dela).
 *
 * Cleanup (modo de dev): SÓ o que esta rodada criou (a MARCA e o lote desta
 * rodada, no projeto da prova). Passos independentes; falha de cleanup conta
 * como falha da prova (saída ≠ 0).
 *
 * USO: npx tsx scripts/validar-lote-ate-rascunhos.ts [--saida <pasta>]
 *      npx tsx scripts/validar-lote-ate-rascunhos.ts --producao-somente-leitura [--projeto 6 --lote semana-2026-09-14 [--itens a,b]]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const
const PRODUCAO_SOMENTE_LEITURA = process.argv.includes('--producao-somente-leitura')

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
/** Só no modo de leitura: o banco do `.env`, que é PRODUÇÃO — e nada além de SELECT sob READ ONLY. */
function apontarParaProducaoSomenteLeitura(): string {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  if (!prod.DATABASE_URL) abortar('o .env não define DATABASE_URL.')
  for (const [k, v] of Object.entries(prod)) process.env[k] = v
  return endpointDe(process.env.DATABASE_URL) ?? '(ilegível)'
}
const ENDPOINT = PRODUCAO_SOMENTE_LEITURA ? apontarParaProducaoSomenteLeitura() : apontarParaODev()

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const PROJETO = 8
const SAIDA = argumento('--saida') ?? '.tmp-validar-lote-ate-rascunhos'
const CARIMBO = new Date().toISOString()
const MARCA = `[PR12-RASCUNHOS ${CARIMBO}]`
const PREFIXO_DO_LOTE = 'pr12-rascunhos-'
const LOTE = `${PREFIXO_DO_LOTE}${CARIMBO}`

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}

async function contarProducao() {
  const { db } = await import('../src/lib/db')
  const agendamento = await import('../src/lib/lotes/agendamento')
  const { agendarItensDoLote } = await import('../src/lib/lotes/agendar-itens')
  const projeto = argumento('--projeto')
  const lote = argumento('--lote')
  const itensPedidos = argumento('--itens')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null
  console.log(`modo: PRODUÇÃO, só leitura (transação READ ONLY) | banco: ${ENDPOINT}`)
  const saida: Record<string, unknown> = { banco: ENDPOINT, modo: 'producao-somente-leitura' }
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        const colunas = await tx.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name FROM information_schema.columns WHERE table_name = 'ItemDeLote'`
        const nomes = new Set(colunas.map((c) => c.column_name))
        saida.tabelaItemDeLote = nomes.size > 0
        saida.migrationDoPr12 = ['postId', 'hashDoAgendamento', 'agendadoEm', 'efeitosDoAgendamentoEm'].every((c) => nomes.has(c))
        console.log(`  tabela ItemDeLote: ${saida.tabelaItemDeLote ? 'existe' : 'NÃO existe (migration do PR 11 não aplicada)'}; colunas do PR 12: ${saida.migrationDoPr12 ? 'aplicadas' : 'NÃO aplicadas'}`)

        // Rascunhos/agendados duplicados pela MESMA página nos últimos 60 dias — o defeito que o PR 12 fecha.
        const duplicadas = await tx.$queryRaw<Array<{ pageId: string; posts: bigint }>>`
          SELECT "pageId", COUNT(*) AS posts FROM "SocialPost"
          WHERE "pageId" IS NOT NULL AND status IN ('DRAFT', 'SCHEDULED') AND "createdAt" > NOW() - INTERVAL '60 days'
          GROUP BY "pageId" HAVING COUNT(*) > 1`
        saida.paginasComMaisDeUmRascunho = duplicadas.length
        console.log(`  páginas com mais de um rascunho/agendado (60 dias): ${duplicadas.length}`)

        if (saida.tabelaItemDeLote) {
          const [totais] = await tx.$queryRaw<Array<{ itens: bigint; lotes: bigint }>>`
            SELECT COUNT(*) AS itens, COUNT(DISTINCT ("projectId", "loteId")) AS lotes FROM "ItemDeLote"`
          saida.itensDeLote = Number(totais.itens)
          saida.lotes = Number(totais.lotes)
          console.log(`  itens de lote: ${saida.itensDeLote} em ${saida.lotes} lote(s)`)
          if (saida.migrationDoPr12) {
            const [ag] = await tx.$queryRaw<Array<{ comPost: bigint; efeitosPendentes: bigint }>>`
              SELECT COUNT(*) FILTER (WHERE "postId" IS NOT NULL) AS "comPost",
                     COUNT(*) FILTER (WHERE "postId" IS NOT NULL AND "efeitosDoAgendamentoEm" IS NULL) AS "efeitosPendentes"
              FROM "ItemDeLote"`
            saida.itensComRascunho = Number(ag.comPost)
            saida.efeitosPendentes = Number(ag.efeitosPendentes)
            console.log(`  com rascunho: ${saida.itensComRascunho}; efeitos pendentes: ${saida.efeitosPendentes}`)
          }
        }

        if (projeto && lote && saida.tabelaItemDeLote) {
          const projectId = Number(projeto)
          if (!saida.migrationDoPr12) {
            // O serviço lê as colunas da migration do PR 12: sem elas não há decisão a reproduzir.
            saida.lote = { projectId, loteId: lote, conta: 'não feita — a migration do PR 12 não está aplicada, e a decisão do serviço lê as colunas dela' }
            console.log('  conta do lote: não feita — a migration do PR 12 não está aplicada')
          } else {
            // R12-04: a conta É a decisão do serviço (simulação), com as leituras pela transação READ ONLY.
            const ids = itensPedidos ?? (await tx.$queryRaw<Array<{ itemId: string }>>`
              SELECT "itemId" FROM "ItemDeLote" WHERE "projectId" = ${projectId} AND "loteId" = ${lote} ORDER BY "itemId"`).map((l) => l.itemId)
            const conta: unknown[] = []
            for (let k = 0; k < ids.length; k += agendamento.MAX_ITENS_DO_AGENDAMENTO) {
              const parte = await agendarItensDoLote({ projectId, loteId: lote, itens: ids.slice(k, k + agendamento.MAX_ITENS_DO_AGENDAMENTO).map((itemId) => ({ itemId })), simular: true, leitor: tx })
              conta.push(...parte.itens)
            }
            saida.lote = { projectId, loteId: lote, resumo: agendamento.resumirAgendamento(conta as never), itens: conta }
            console.log(`  conta do lote ${lote}: ${JSON.stringify((saida.lote as { resumo: unknown }).resumo)}`)
          }
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    )
  } catch (erro) {
    console.error('\n✗ a contagem parou:', erro)
    mau++
  }
  mkdirSync(SAIDA, { recursive: true })
  writeFileSync(resolve(SAIDA, 'producao-somente-leitura.json'), JSON.stringify(saida, null, 2))
  console.log(`\nSaída em ${resolve(SAIDA, 'producao-somente-leitura.json')}`)
  await db.$disconnect()
  process.exit(mau > 0 ? 1 : 0)
}

async function main() {
  if (PRODUCAO_SOMENTE_LEITURA) return contarProducao()

  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { enfileirarPeca } = await import('../src/lib/compositor/fila')
  const { dispararJobAgora } = await import('../src/lib/ai/generation-queue-executor')
  const { agendarItensDoLote } = await import('../src/lib/lotes/agendar-itens')
  const { agendarPost } = await import('../src/lib/creatives/agendar')
  const { criarPlano } = await import('../src/lib/planos/plano-service')
  const { revisaoDoItem } = await import('../src/lib/planos/revisao-do-item')
  const { del } = await import('@vercel/blob')
  // O desafio anti-bot do Blob (403) sobre a logo derrubou a composição da prova-dev-4 do PR 11: cada imagem uma vez por URL, com nova tentativa espaçada.
  const { lerOBlobUmaVezPorUrl } = await import('./lib/leitura-do-blob')
  await lerOBlobUmaVezPorUrl('validar-lote-ate-rascunhos')
  type Resultado = Awaited<ReturnType<typeof agendarItensDoLote>>

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)

  const foto = await db.generation.findFirst({
    where: { projectId: PROJETO, status: 'COMPLETED', resultUrl: { contains: 'blob.vercel-storage.com' }, fieldValues: { path: ['track'], equals: 'imagem' } },
    orderBy: { createdAt: 'desc' },
    select: { resultUrl: true },
  })
  const fotoUrl = foto?.resultUrl ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600'
  const dia = (n: number) => new Date(Date.now() + (7 + n) * 86_400_000).toISOString().slice(0, 10)
  const peca = (n: number, extra: Record<string, unknown> = {}) => ({
    projectId: PROJETO,
    formato: 'story',
    foto: { url: fotoUrl },
    nome: `${MARCA} peça ${n}`,
    quando: `${dia(n)} 19:00`,
    tema: `${MARCA} teste`,
    blocos: [
      { papel: 'headline', linhas: [`Rascunho ${n}`] },
      { papel: 'apoio', linhas: ['Peça criada pela prova de integração.', 'Pode apagar.'] },
    ],
    ...extra,
  })
  const itemIds: string[] = []
  const planos: string[] = []
  // Posts que a prova apaga "como a equipe": os sinais deles ficam no banco e o cleanup os procura por aqui.
  const postsApagados: string[] = []
  async function compor(itemId: string, spec: unknown, opcoes: { itemRevisao?: string } = {}) {
    itemIds.push(itemId)
    const r = await enfileirarPeca(spec, { lote: { loteId: LOTE, itemId }, canal: 'claude-code', ...opcoes })
    await dispararJobAgora(r.jobId)
    return r
  }
  const agendar = (itens: Array<Record<string, unknown>>, simular = false) => agendarItensDoLote({ projectId: PROJETO, loteId: LOTE, itens, simular, superficie: 'chat' })
  const codigos = (r: Resultado) => r.itens.map((i) => i.desfecho ?? i.codigo)
  const linhaDo = (itemId: string) => db.itemDeLote.findUnique({ where: { projectId_loteId_itemId: { projectId: PROJETO, loteId: LOTE, itemId } } })
  const pageIdDo = async (itemId: string) => {
    const l = await linhaDo(itemId)
    const g = l?.generationId ? await db.generation.findUnique({ where: { id: l.generationId }, select: { fieldValues: true } }) : null
    return ((g?.fieldValues as Record<string, unknown> | null)?.pageId as string | undefined) ?? null
  }
  const postsDaPagina = (pageId: string | null) => (pageId ? db.socialPost.findMany({ where: { pageId } }) : Promise.resolve([]))
  const fotoDoBanco = async () => ({
    posts: await db.socialPost.count({ where: { projectId: PROJETO, OR: [{ pageId: { in: (await Promise.all(itemIds.map(pageIdDo))).filter((p): p is string => !!p) } }] } }),
    linhas: JSON.stringify(await db.itemDeLote.findMany({ where: { projectId: PROJETO, loteId: LOTE }, orderBy: { itemId: 'asc' } })),
  })

  try {
    // ── 1. a semana composta pela fila real ─────────────────────────────────
    console.log('1) semana de 5 peças, a do meio com texto que não cabe (falha determinística)')
    for (const n of [1, 2, 3, 4, 5]) {
      const spec = n === 3 ? peca(3, { blocos: [{ papel: 'headline', linhas: ['Esta manchete é comprida demais para caber em qualquer coluna de story'.repeat(4)] }] }) : peca(n)
      await compor(`item-${n}`, spec)
    }
    const status = await Promise.all([1, 2, 3, 4, 5].map(async (n) => (await db.generation.findUnique({ where: { id: (await linhaDo(`item-${n}`))!.generationId! }, select: { status: true } }))?.status))
    conferir('peças 1,2,4,5 prontas e a 3 falhou', JSON.stringify(status) === JSON.stringify(['COMPLETED', 'COMPLETED', 'FAILED', 'COMPLETED', 'COMPLETED']), JSON.stringify(status))
    const semana = [1, 2, 3, 4, 5].map((n) => ({ itemId: `item-${n}` }))

    // ── 2. simular ──────────────────────────────────────────────────────────
    console.log('2) simular dá a conta sem escrever nada')
    const antes = await fotoDoBanco()
    const simulada = await agendar(semana, true)
    conferir('conta: 4 concluídos, 1 falha', JSON.stringify(simulada.resumo) === JSON.stringify({ concluidos: 4, pendentes: 0, falhas: 1 }), JSON.stringify(simulada.resumo))
    conferir('nada mudou no banco', JSON.stringify(await fotoDoBanco()) === JSON.stringify(antes))

    // ── 3. de verdade ───────────────────────────────────────────────────────
    console.log('3) a chamada de verdade cria exatamente os 4 rascunhos, pela página, com a imagem da peça')
    const primeira = await agendar(semana)
    conferir('criado, criado, PECA_FALHOU, criado, criado', JSON.stringify(codigos(primeira)) === JSON.stringify(['criado', 'criado', 'PECA_FALHOU', 'criado', 'criado']), JSON.stringify(codigos(primeira)))
    for (const n of [1, 2, 4, 5]) {
      const pageId = await pageIdDo(`item-${n}`)
      const posts = await postsDaPagina(pageId)
      const linha = await linhaDo(`item-${n}`)
      const g = await db.generation.findUnique({ where: { id: linha!.generationId! }, select: { resultUrl: true } })
      const p = posts[0]
      conferir(`item ${n}: um rascunho STORY com página editável e a imagem da peça`, posts.length === 1 && p.status === 'DRAFT' && p.postType === 'STORY' && p.pageId === pageId && p.templateId != null && p.renderStatus === 'RENDERED' && p.mediaUrls[0] === g?.resultUrl, JSON.stringify({ n: posts.length, s: p?.status, t: p?.postType, tpl: p?.templateId, r: p?.renderStatus }))
      conferir(`item ${n}: a linha aponta o post e os efeitos terminaram`, linha?.postId === p?.id && !!linha?.hashDoAgendamento && !!linha?.efeitosDoAgendamentoEm)
    }
    conferir('a peça que falhou não virou post', (await postsDaPagina(await pageIdDo('item-3'))).length === 0)

    // ── 4. repetição ────────────────────────────────────────────────────────
    console.log('4) a repetição da semana não duplica')
    const repetida = await agendar(semana)
    conferir('reaproveitado ×4, mesmos posts', JSON.stringify(codigos(repetida)) === JSON.stringify(['reaproveitado', 'reaproveitado', 'PECA_FALHOU', 'reaproveitado', 'reaproveitado']) && repetida.itens.every((i, k) => i.postId === primeira.itens[k].postId), JSON.stringify(codigos(repetida)))

    // ── 5. concorrência ─────────────────────────────────────────────────────
    console.log('5) duas chamadas simultâneas no mesmo item: UM post')
    await compor('item-6', peca(6))
    const [a, b] = await Promise.all([agendar([{ itemId: 'item-6' }]), agendar([{ itemId: 'item-6' }])])
    conferir('o mesmo post nas duas, um só na página', a.itens[0].postId === b.itens[0].postId && (await postsDaPagina(await pageIdDo('item-6'))).length === 1, `${a.itens[0].desfecho} + ${b.itens[0].desfecho}`)

    // ── 6. queda entre commit e efeitos ─────────────────────────────────────
    console.log('6) queda entre o commit e os efeitos: a repetição completa, sem duplicar sinais')
    const linha1 = (await linhaDo('item-1'))!
    const sinaisAntes = await db.learningSignal.count({ where: { postId: linha1.postId! } })
    await db.itemDeLote.update({ where: { id: linha1.id }, data: { efeitosDoAgendamentoEm: null } })
    const completada = await agendar([{ itemId: 'item-1' }])
    const linha1Depois = await linhaDo('item-1')
    conferir('reaproveitado, carimbo de volta, sinais iguais', completada.itens[0].desfecho === 'reaproveitado' && !!linha1Depois?.efeitosDoAgendamentoEm && (await db.learningSignal.count({ where: { postId: linha1.postId! } })) === sinaisAntes, `sinais ${sinaisAntes}`)

    // ── 7. adoção ───────────────────────────────────────────────────────────
    console.log('7) rascunho que já tinha a página é adotado')
    await compor('item-7', peca(7))
    const pagina7 = (await pageIdDo('item-7'))!
    const manual = await agendarPost({ projectId: PROJETO, pageId: pagina7, scheduledDatetime: `${dia(7)} 19:00`, postType: 'STORY', superficie: 'editor' })
    const adotado = await agendar([{ itemId: 'item-7' }])
    conferir('adotado, o mesmo post, um só na página', adotado.itens[0].desfecho === 'adotado' && adotado.itens[0].postId === manual.postId && (await postsDaPagina(pagina7)).length === 1, JSON.stringify(adotado.itens[0]))

    // ── 8. post apagado ─────────────────────────────────────────────────────
    console.log('8) post apagado da agenda não é recriado')
    postsApagados.push(primeira.itens[1].postId!)
    await db.socialPost.delete({ where: { id: primeira.itens[1].postId! } })
    const apagado = await agendar([{ itemId: 'item-2' }])
    conferir('POST_REMOVIDO e nenhum post na página', apagado.itens[0].codigo === 'POST_REMOVIDO' && (await postsDaPagina(await pageIdDo('item-2'))).length === 0, JSON.stringify(apagado.itens[0]))

    // ── 9. conflito ─────────────────────────────────────────────────────────
    console.log('9) outro pedido sob o mesmo item é conflito')
    const conflito = await agendar([{ itemId: 'item-4', quando: `${dia(4)} 21:00` }])
    conferir('LOTE_AGENDAMENTO_CONFLITO, e o post intacto', conflito.itens[0].codigo === 'LOTE_AGENDAMENTO_CONFLITO' && (await postsDaPagina(await pageIdDo('item-4'))).length === 1, JSON.stringify(conflito.itens[0]))

    // ── 10. imagem atual ────────────────────────────────────────────────────
    console.log('10) camada editada depois da composição: o rascunho nasce PENDING')
    await compor('item-8', peca(8))
    const pagina8 = (await pageIdDo('item-8'))!
    const p8 = await db.page.findUnique({ where: { id: pagina8 }, select: { layers: true } })
    const camadas = typeof p8!.layers === 'string' ? JSON.parse(p8!.layers as string) : (p8!.layers as Array<Record<string, unknown>>)
    const editadas = (camadas as Array<Record<string, unknown>>).map((c) => (c.type === 'text' || c.type === 'rich-text' ? { ...c, content: `${String(c.content)} (editado)` } : c))
    // O PATCH de camada avulsa grava camadas SEM refazer o thumbnail.
    await db.page.update({ where: { id: pagina8 }, data: { layers: editadas as never } })
    const pendente = await agendar([{ itemId: 'item-8' }])
    const [post8] = await postsDaPagina(pagina8)
    conferir('PENDING, sem mídia, com a fila de render armada', pendente.itens[0].renderStatus === 'PENDING' && post8?.renderStatus === 'PENDING' && post8.mediaUrls.length === 0 && !!post8.nextRenderAt, JSON.stringify({ r: post8?.renderStatus, m: post8?.mediaUrls.length }))

    // ── 11. feed ────────────────────────────────────────────────────────────
    console.log('11) peça de feed vira POST')
    await compor('item-9', peca(9, { formato: 'feed' }))
    const feed = await agendar([{ itemId: 'item-9' }])
    const [post9] = await postsDaPagina(await pageIdDo('item-9'))
    conferir('POST', feed.itens[0].desfecho === 'criado' && post9?.postType === 'POST', post9?.postType ?? '(sem post)')

    // ── 12. rascunho de item de plano apagado pela equipe ───────────────────
    console.log('12) rascunho de peça de item de plano apagado pela equipe: sem confirmação, POST_REMOVIDO avisa qual era e nada é recriado')
    const MANCHETE_DO_PLANO = 'Rascunho do plano'
    const { plano } = await criarPlano({
      projectId: PROJETO,
      titulo: `${MARCA} plano`,
      inicio: dia(10),
      fim: dia(10),
      origem: 'chat',
      itens: [{ quando: `${dia(10)} 19:00`, tema: `${MARCA} teste`, formato: 'story', via: 'compor', copyProposta: [MANCHETE_DO_PLANO] }],
    } as never)
    planos.push(plano.id)
    const itemDoPlano = plano.itens[0]
    // Peça de item de plano com lote leva a revisão que o ver-plano devolveria (C11-1a).
    await compor('item-10', peca(10, { itemDePlanoId: itemDoPlano.id, planoId: plano.id, blocos: [{ papel: 'headline', linhas: [MANCHETE_DO_PLANO] }] }), { itemRevisao: revisaoDoItem(itemDoPlano) })
    const pagina10 = (await pageIdDo('item-10'))!
    const linha10 = (await linhaDo('item-10'))!
    const arte10 = await db.generation.findUnique({ where: { id: linha10.generationId! }, select: { status: true, resultUrl: true } })
    const itemDoPlanoPronto = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, generationId: true } })
    conferir('a peça do item de plano ficou pronta, e o item do plano também', arte10?.status === 'COMPLETED' && itemDoPlanoPronto?.status === 'pronto' && itemDoPlanoPronto.generationId === linha10.generationId, JSON.stringify({ arte: arte10?.status, item: itemDoPlanoPronto }))
    const agendada10 = await agendar([{ itemId: 'item-10' }])
    const postApagado = agendada10.itens[0].postId
    if (!postApagado) throw new Error(`o item-10 não foi agendado: ${JSON.stringify(agendada10.itens[0])}`)
    const itemAgendado = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, postId: true } })
    conferir('agendado: criado, e o item do plano agendado com o post', agendada10.itens[0].desfecho === 'criado' && itemAgendado?.status === 'agendado' && itemAgendado.postId === postApagado, JSON.stringify({ desfecho: agendada10.itens[0].desfecho, item: itemAgendado }))
    // A equipe apaga o rascunho na agenda.
    postsApagados.push(postApagado)
    await db.socialPost.delete({ where: { id: postApagado } })
    const retratoDoRascunho = async () =>
      JSON.stringify({
        postsDoProjeto: await db.socialPost.count({ where: { projectId: PROJETO } }),
        postsDaPagina: (await postsDaPagina(pagina10)).length,
        linha: await linhaDo('item-10'),
        itemDoPlano: await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id } }),
      })
    const postsDoProjetoSemORascunho = await db.socialPost.count({ where: { projectId: PROJETO } })
    const antesDoAviso = await retratoDoRascunho()
    const semConfirmacao = (await agendar([{ itemId: 'item-10' }])).itens[0]
    const [ano, mes, diaDoMes] = dia(10).split('-')
    const quandoDoRascunho = `${diaDoMes}/${mes}/${ano}, 19:00`
    conferir('POST_REMOVIDO com rascunhoApagado (dia e horário, tema, manchete), e o motivo manda perguntar', semConfirmacao.situacao === 'falhou' && semConfirmacao.codigo === 'POST_REMOVIDO' && semConfirmacao.rascunhoApagado?.quando === quandoDoRascunho && semConfirmacao.rascunhoApagado?.tema === `${MARCA} teste` && semConfirmacao.rascunhoApagado?.manchete === MANCHETE_DO_PLANO && !!semConfirmacao.motivo?.includes('pergunte'), JSON.stringify(semConfirmacao))
    conferir('nenhum post novo, e a linha e o item do plano ainda apontam o rascunho apagado', (await retratoDoRascunho()) === antesDoAviso && (await postsDaPagina(pagina10)).length === 0 && (await linhaDo('item-10'))?.postId === postApagado && (await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { postId: true } }))?.postId === postApagado)

    // ── 13. simular com a confirmação ───────────────────────────────────────
    console.log('13) simular com recriarRascunhoApagado: true dá a conta e não escreve nada')
    const simuladaRecriar = await agendar([{ itemId: 'item-10', recriarRascunhoApagado: true }], true)
    conferir('conta: concluído, recriado', simuladaRecriar.simulado && simuladaRecriar.itens[0].situacao === 'concluido' && simuladaRecriar.itens[0].desfecho === 'recriado', JSON.stringify(simuladaRecriar.itens[0]))
    conferir('nada foi escrito', (await retratoDoRascunho()) === antesDoAviso)

    // ── 14. confirmação com outro horário ───────────────────────────────────
    console.log('14) confirmação com outro horário é conflito: o rascunho só volta com o pedido original')
    const outroHorario = (await agendar([{ itemId: 'item-10', recriarRascunhoApagado: true, quando: `${dia(10)} 21:00` }])).itens[0]
    conferir('LOTE_AGENDAMENTO_CONFLITO, citando o pedido original', outroHorario.situacao === 'falhou' && outroHorario.codigo === 'LOTE_AGENDAMENTO_CONFLITO' && !!outroHorario.motivo?.includes('pedido original'), JSON.stringify(outroHorario))
    // R12-05: o horário DESTA chamada (21h) não é o do rascunho apagado — sem prova do original, vai nulo.
    conferir('o rascunho apagado não é apresentado com o horário da tentativa', outroHorario.rascunhoApagado?.quando === null && outroHorario.rascunhoApagado?.manchete === MANCHETE_DO_PLANO, JSON.stringify(outroHorario.rascunhoApagado))
    conferir('nada foi criado', (await retratoDoRascunho()) === antesDoAviso)

    // ── 15. "true" em texto ─────────────────────────────────────────────────
    console.log('15) "true" em texto não é confirmação')
    const emTexto = (await agendar([{ itemId: 'item-10', recriarRascunhoApagado: 'true' }])).itens[0]
    conferir('recusado (PEDIDO_INVALIDO)', emTexto.situacao === 'falhou' && emTexto.codigo === 'PEDIDO_INVALIDO', JSON.stringify(emTexto))
    conferir('nada foi criado', (await retratoDoRascunho()) === antesDoAviso)

    // ── 16. confirmação ─────────────────────────────────────────────────────
    console.log('16) com a confirmação da pessoa: um rascunho novo, com a mesma arte, e o item do plano reapontado')
    const recriada = (await agendar([{ itemId: 'item-10', recriarRascunhoApagado: true }])).itens[0]
    conferir('recriado, com o aviso de que voltou para a agenda', recriada.situacao === 'concluido' && recriada.desfecho === 'recriado' && !!recriada.postId && recriada.postId !== postApagado && recriada.generationId === linha10.generationId && recriada.pageId === pagina10 && !!recriada.avisos?.some((a) => a.includes('voltou para a agenda')), JSON.stringify(recriada))
    const postsRecriados = await postsDaPagina(pagina10)
    const postRecriado = postsRecriados[0]
    conferir('um post só na página: rascunho STORY com página editável e a imagem da peça', postsRecriados.length === 1 && postRecriado.id === recriada.postId && postRecriado.status === 'DRAFT' && postRecriado.postType === 'STORY' && postRecriado.templateId != null && postRecriado.mediaUrls[0] === arte10?.resultUrl, JSON.stringify({ n: postsRecriados.length, s: postRecriado?.status, t: postRecriado?.postType, r: postRecriado?.renderStatus }))
    conferir('exatamente um post novo no projeto', (await db.socialPost.count({ where: { projectId: PROJETO } })) === postsDoProjetoSemORascunho + 1)
    const linhaRecriada = await linhaDo('item-10')
    conferir('a linha aponta o recriado e os efeitos terminaram', linhaRecriada?.postId === recriada.postId && !!linhaRecriada?.efeitosDoAgendamentoEm, JSON.stringify({ postId: linhaRecriada?.postId, efeitos: linhaRecriada?.efeitosDoAgendamentoEm }))
    const itemReapontado = await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, postId: true, generationId: true, updatedAt: true } })
    conferir('o item do plano continua agendado e aponta o recriado, com a mesma arte', itemReapontado?.status === 'agendado' && itemReapontado.postId === recriada.postId && itemReapontado.generationId === linha10.generationId, JSON.stringify(itemReapontado))

    // ── 17. segunda confirmação ─────────────────────────────────────────────
    console.log('17) a segunda confirmação reaproveita: continua um post só')
    const deNovo = (await agendar([{ itemId: 'item-10', recriarRascunhoApagado: true }])).itens[0]
    conferir('reaproveitado, o mesmo post', deNovo.situacao === 'concluido' && deNovo.desfecho === 'reaproveitado' && deNovo.postId === recriada.postId, JSON.stringify(deNovo))
    conferir('continua um post só na página e no projeto, e o item do plano igual', (await postsDaPagina(pagina10)).length === 1 && (await db.socialPost.count({ where: { projectId: PROJETO } })) === postsDoProjetoSemORascunho + 1 && JSON.stringify(await db.itemDePlano.findUnique({ where: { id: itemDoPlano.id }, select: { status: true, postId: true, generationId: true, updatedAt: true } })) === JSON.stringify(itemReapontado))

    // ── 18. peça superada no plano, sem peça na linha ───────────────────────
    console.log('18) pedido para um item de plano que já tem outra arte: a compor-leva recusa como superada, e o agendar-leva da mesma linha diz qual é a arte atual — sem mandar compor, sem criar post')
    const itemAtual = await db.itemDePlano.findUniqueOrThrow({ where: { id: itemDoPlano.id } })
    const recusaDaLeva = await compor('item-11', peca(11, { itemDePlanoId: itemDoPlano.id, planoId: plano.id, blocos: [{ papel: 'headline', linhas: ['Outra manchete do plano'] }] }), { itemRevisao: revisaoDoItem(itemAtual) })
      .then(() => null, (e: unknown) => e as { code?: string; details?: { motivo?: string } })
    conferir('a compor-leva recusou como superada', recusaDaLeva?.code === 'ITEM_EXECUCAO_CONCORRENTE' && recusaDaLeva.details?.motivo === 'superada', JSON.stringify(recusaDaLeva))
    const linha11 = await linhaDo('item-11')
    conferir('a linha ficou reservada, sem peça', !!linha11 && linha11.generationId === null, JSON.stringify(linha11))
    const postsAntesDaSuperada = await db.socialPost.count({ where: { projectId: PROJETO } })
    for (const simular of [true, false]) {
      const r = (await agendar([{ itemId: 'item-11' }], simular)).itens[0]
      conferir(`${simular ? 'simulado' : 'de verdade'}: PECA_SUPERADA_NO_PLANO com a arte atual, sem mandar compor`, r.situacao === 'falhou' && r.codigo === 'PECA_SUPERADA_NO_PLANO' && r.arteAtualDoItem?.generationId === linha10.generationId && r.arteAtualDoItem?.situacao === 'pronta' && !r.motivo?.includes('antes de agendar'), JSON.stringify(r))
    }
    conferir('nenhum post novo', (await db.socialPost.count({ where: { projectId: PROJETO } })) === postsAntesDaSuperada)
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou, no projeto da prova)')
    const apagados = { posts: 0, sinais: 0, jobs: 0, generations: 0, pages: 0, planos: 0, lotes: 0, blobs: 0 }
    const falhasDoCleanup: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhasDoCleanup.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const blobs = new Set<string>()
    let idsDeGeracao: string[] = []
    let idsDePagina: string[] = []
    let idsDePost: string[] = []
    await passo('levantamento', async () => {
      const linhas = await db.itemDeLote.findMany({ where: { projectId: PROJETO, loteId: LOTE }, select: { generationId: true, postId: true } })
      const gens = await db.generation.findMany({
        where: { projectId: PROJETO, OR: [{ id: { in: linhas.map((l) => l.generationId).filter((g): g is string => !!g) } }, { fieldValues: { path: ['spec', 'nome'], string_contains: MARCA } }] },
        select: { id: true, resultUrl: true, fieldValues: true },
      })
      for (const g of gens) if (g.resultUrl) blobs.add(g.resultUrl)
      idsDeGeracao = gens.map((g) => g.id)
      idsDePagina = gens.map((g) => (g.fieldValues as Record<string, unknown> | null)?.pageId).filter((p): p is string => typeof p === 'string')
      const posts = await db.socialPost.findMany({ where: { projectId: PROJETO, OR: [{ id: { in: linhas.map((l) => l.postId).filter((p): p is string => !!p) } }, { pageId: { in: idsDePagina } }] }, select: { id: true, mediaUrls: true } })
      idsDePost = posts.map((p) => p.id)
      for (const p of posts) for (const u of p.mediaUrls) if (u.includes('blob.vercel-storage.com')) blobs.add(u)
    })
    await passo('sinais', async () => { apagados.sinais = (await db.learningSignal.deleteMany({ where: { projectId: PROJETO, OR: [{ postId: { in: [...idsDePost, ...postsApagados] } }, { pageId: { in: idsDePagina } }, { generationId: { in: idsDeGeracao } }] } })).count })
    await passo('posts', async () => { apagados.posts = (await db.socialPost.deleteMany({ where: { id: { in: idsDePost } } })).count })
    await passo('jobs', async () => { apagados.jobs = (await db.generationJob.deleteMany({ where: { generationId: { in: idsDeGeracao } } })).count })
    // As artes que `registrarArtesDoPost` catalogou a partir dos posts (source post-midia) apontam para os mesmos blobs.
    await passo('generations', async () => { apagados.generations = (await db.generation.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: idsDeGeracao } }, { resultUrl: { in: [...blobs] } }] } })).count })
    await passo('páginas', async () => { apagados.pages = (await db.page.deleteMany({ where: { id: { in: idsDePagina } } })).count })
    // Os itens do plano vão junto (FK com cascade).
    await passo('planos', async () => { apagados.planos = (await db.planoDeConteudo.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: planos } }, { titulo: { contains: MARCA } }] } })).count })
    await passo('lotes', async () => { apagados.lotes = (await db.itemDeLote.deleteMany({ where: { projectId: PROJETO, loteId: { startsWith: LOTE } } })).count })
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
