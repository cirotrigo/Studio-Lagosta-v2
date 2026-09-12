/**
 * Prova de integração do PR 6 de "Marca simples, copy melhor" (F2, o contexto
 * da semana), no BRANCH DE DEV do Neon. Sem Blob, sem API paga; a busca de
 * fotos lê o catálogo do Drive (só leitura).
 *
 * O que ela prova, com dados criados e apagados por ela:
 *  1. `sugerirPosts` com início e fim (a semana que vem) devolve a janela
 *     saneada, a GRADE COMPLETA (7 dias, com origem/formato/evidência), as
 *     exceções, a ocupação — e com `registrarSugestoes: false` NÃO grava
 *     nenhum LearningSignal (a prova desliga a emissão explicitamente);
 *  2. a ocupação é por FORMATO: um feed no horário de um slot de story não o
 *     ocupa; um story no horário de outro slot, sim — os dois aparecem em
 *     `ocupacao` com o formato;
 *  3. `ver-agenda` traz os TEXTOS completos da peça (da página do post e, sem
 *     página, do `slotValues`), `formato` e `legendaCompleta`;
 *  4. `consultar-base` com `em` confere a validade contra a DATA DE USO: a
 *     campanha que vence no dia D entra em D e sai em D+1, e a resposta diz a
 *     referência;
 *  5. `buscar-fotos` com `excluir` tira da lista a foto já escolhida e declara
 *     `excluidas`; `evitarUsadasDesde` tira as usadas a partir da data.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada).
 *
 * USO: npx tsx scripts/validar-contexto-da-semana.ts [--saida <pasta>]
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
/** O projeto é ESCOLHIDO na hora: o primeiro (nesta ordem) cujo histórico dá pelo menos dois slots de story na semana que vem — a prova é do contexto, não de um cliente. */
const CANDIDATOS = [8, 6, 3, 2, 7, 1, 5, 4, 9, 10, 11, 12]
const SAIDA = argumento('--saida') ?? '.tmp-validar-contexto-da-semana'
const MARCA = `[PR6-SEMANA ${new Date().toISOString()}]`

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}
function somarDias(dataISO: string, n: number): string {
  const d = new Date(`${dataISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { sugerirPosts } = await import('../src/lib/posts/sugerir-posts')
  const { dataBRT } = await import('../src/lib/posts/contexto-da-semana')
  const { executarToolLocal } = await import('../src/lib/mcp/catalogo/integracao')
  const { buscarNoAcervo } = await import('../src/lib/creatives/acervo')
  const principal = { kind: 'service' as const, clientId: 'claude-code-local' }
  const tool = async (nome: string, args: Record<string, unknown>) => {
    const r = await executarToolLocal(nome, args, principal)
    const texto = String((r.content[0] as { text?: unknown } | undefined)?.text ?? '{}')
    if (r.isError) throw new Error(`${nome}: ${texto.slice(0, 200)}`)
    return JSON.parse(texto) as Record<string, any>
  }

  const hoje = dataBRT(new Date())
  const diaDaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay()
  const segunda = somarDias(hoje, ((8 - diaDaSemana) % 7) || 7)
  const domingo = somarDias(segunda, 6)
  // Escolha do projeto: leitura pura (registrarSugestoes: false), nada gravado.
  let PROJETO = CANDIDATOS[0]
  let escolha: Awaited<ReturnType<typeof sugerirPosts>> | null = null
  for (const id of CANDIDATOS) {
    const existe = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!existe) continue
    const r = await sugerirPosts({ projectId: id, inicio: segunda, fim: domingo, registrarSugestoes: false })
    if (r.sugestoes.filter((x) => x.formato === 'story').length >= 2) {
      PROJETO = id
      escolha = r
      break
    }
  }
  if (!escolha) abortar('nenhum projeto do dev tem dois slots de story na semana que vem para exercitar a ocupação')
  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)
  console.log(`projeto da prova: ${PROJETO} (${projeto.name}) — ${escolha.sugestoes.length} sugestão(ões) na semana ${segunda}..${domingo}`)
  const posts: string[] = []
  const entradas: string[] = []
  const registro: Record<string, unknown> = { sha, branch, banco: ENDPOINT }

  try {
    // ── 1. a semana que vem, sem emitir sinal ───────────────────────────────
    console.log('1) sugerirPosts com início e fim (a semana que vem), sem registrar sinal')
    const sinaisAntes = await db.learningSignal.count({ where: { projectId: PROJETO, tipo: 'slot' } })
    const s1 = await sugerirPosts({ projectId: PROJETO, inicio: segunda, fim: domingo, registrarSugestoes: false })
    const sinaisDepois = await db.learningSignal.count({ where: { projectId: PROJETO, tipo: 'slot' } })
    conferir('a janela é segunda a domingo (7 dias), saneada', s1.janela.inicio === segunda && s1.janela.fim === domingo && s1.janela.dias === 7, JSON.stringify(s1.janela))
    conferir('a grade COMPLETA tem os 7 dias, cada horário com origem/formato/evidência; exceções são os dias vazios', s1.grade.length === 7 && s1.grade.every((d) => d.horarios.every((h) => ['combinado', 'historico', 'nova'].includes(h.origem) && ['story', 'feed'].includes(h.formato) && typeof h.evidenciaFraca === 'boolean')) && s1.excecoes.length === s1.grade.filter((d) => d.horarios.length === 0).length, JSON.stringify({ horarios: s1.grade.map((d) => d.horarios.length), excecoes: s1.excecoes, origens: [...new Set(s1.grade.flatMap((d) => d.horarios.map((h) => h.origem)))] }))
    conferir('NENHUM LearningSignal foi gravado (registrarSugestoes: false) e a resposta diz sinaisRegistrados = false', sinaisDepois === sinaisAntes && s1.sinaisRegistrados === false, `${sinaisAntes} → ${sinaisDepois}`)
    conferir('toda sugestão cai dentro da janela, traz formato e não tem sugestaoId', s1.sugestoes.every((s) => s.data >= segunda && s.data <= domingo && ['story', 'feed'].includes(s.formato)) && s1.sugestoes.every((s) => !s.sugestaoId), `${s1.sugestoes.length} sugestão(ões)`)
    const passado = await sugerirPosts({ projectId: PROJETO, inicio: somarDias(hoje, -10), fim: somarDias(hoje, 2), registrarSugestoes: false })
    const longa = await sugerirPosts({ projectId: PROJETO, inicio: segunda, fim: somarDias(segunda, 40), registrarSugestoes: false })
    conferir('início no passado vira hoje, com aviso; janela longa é cortada em 21 dias, com aviso', passado.janela.inicio === hoje && passado.avisos.some((a) => /já passou/.test(a)) && longa.janela.dias === 21 && longa.avisos.some((a) => /cortada/.test(a)))
    registro.semana = { janela: s1.janela, grade: s1.grade, sugestoes: s1.sugestoes.length, ocupacao: s1.ocupacao.length }
    writeFileSync(resolve(SAIDA, 'sugerir-posts.json'), JSON.stringify(s1, null, 2))

    // ── 2. ocupação por formato ─────────────────────────────────────────────
    console.log('2) um feed no horário do story NÃO ocupa o slot; um story, sim')
    const alvoStory = s1.sugestoes.find((s) => s.formato === 'story')
    const outroSlot = s1.sugestoes.find((s) => s !== alvoStory && s.formato === 'story')
    if (!alvoStory || !outroSlot) {
      conferir('há pelo menos dois slots de story sugeridos para exercitar a ocupação', false, `${s1.sugestoes.length} sugestão(ões), formatos ${JSON.stringify(s1.sugestoes.map((s) => s.formato))}`)
    } else {
      const quando = (s: { scheduledDatetime: string }) => new Date(`${s.scheduledDatetime.replace(' ', 'T')}:00-03:00`)
      const feed = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'POST', caption: `${MARCA} feed no horário do story`, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: quando(alvoStory), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
        select: { id: true },
      })
      posts.push(feed.id)
      const story = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'STORY', caption: `${MARCA} story no horário do outro slot`, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: quando(outroSlot), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
        select: { id: true },
      })
      posts.push(story.id)
      const s2 = await sugerirPosts({ projectId: PROJETO, inicio: segunda, fim: domingo, registrarSugestoes: false })
      const aindaSugerido = s2.sugestoes.some((s) => s.scheduledDatetime === alvoStory.scheduledDatetime && s.formato === 'story')
      const sumiu = !s2.sugestoes.some((s) => s.scheduledDatetime === outroSlot.scheduledDatetime && s.formato === 'story')
      conferir(`o slot de story ${alvoStory.scheduledDatetime} continua sugerido com um FEED no mesmo horário`, aindaSugerido)
      conferir(`o slot de story ${outroSlot.scheduledDatetime} saiu com um STORY no mesmo horário`, sumiu)
      const ocupFeed = s2.ocupacao.find((o) => o.postId === feed.id)
      const ocupStory = s2.ocupacao.find((o) => o.postId === story.id)
      conferir('a ocupação lista os dois, com formato, data/hora em Brasília e situação', ocupFeed?.formato === 'feed' && ocupFeed.situacao === 'rascunho' && ocupStory?.formato === 'story' && `${ocupStory.data} ${ocupStory.hora}` === outroSlot.scheduledDatetime, JSON.stringify({ feed: ocupFeed, story: ocupStory }).slice(0, 220))
    }

    // ── 3. ver-agenda com textos ────────────────────────────────────────────
    console.log('3) ver-agenda traz os textos completos, o formato e a legenda inteira')
    const dia3 = somarDias(hoje, 3)
    const legendaLonga = `${MARCA} ` + 'legenda comprida de prova '.repeat(8)
    const comSlots = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'POST', caption: legendaLonga, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3}T15:00:00-03:00`), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', slotValues: { headline: 'Texto de prova A', apoio: 'Segunda linha B', _imageUrl: 'https://x/y.png' } as never },
      select: { id: true },
    })
    posts.push(comSlots.id)
    const paginaComTexto = await db.$queryRaw<Array<{ id: string }>>`
      SELECT p.id FROM "Page" p JOIN "Template" t ON t.id = p."templateId"
      WHERE t."projectId" = ${PROJETO} AND p."isTemplate" = false AND p.layers::text LIKE '%text%'
      ORDER BY p."updatedAt" DESC LIMIT 1`
    let comPagina: { id: string } | null = null
    if (paginaComTexto[0]) {
      comPagina = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'STORY', caption: `${MARCA} story com página`, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3}T16:00:00-03:00`), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', pageId: paginaComTexto[0].id },
        select: { id: true },
      })
      posts.push(comPagina.id)
    }
    const agenda = await tool('ver-agenda', { projectId: PROJETO, from: dia3, to: dia3 })
    const itens = (agenda.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
    const itemSlots = itens.find((i) => i.postId === comSlots.id)
    // jsonb não guarda a ordem das chaves: compara como conjunto
    conferir('post sem página: `textos` vêm do slotValues (sem as chaves _), formato feed e legendaCompleta', !!itemSlots && JSON.stringify([...(itemSlots.textos as string[])].sort()) === JSON.stringify(['Segunda linha B', 'Texto de prova A']) && itemSlots.formato === 'feed' && itemSlots.legendaCompleta === legendaLonga && itemSlots.legenda.length === 140, JSON.stringify({ textos: itemSlots?.textos, formato: itemSlots?.formato, legenda: itemSlots?.legenda?.length }))
    if (comPagina) {
      const itemPagina = itens.find((i) => i.postId === comPagina!.id)
      conferir('post com página: `textos` são as camadas de texto da página (não vazios), formato story', !!itemPagina && Array.isArray(itemPagina.textos) && itemPagina.textos.length > 0 && itemPagina.formato === 'story', JSON.stringify(itemPagina?.textos).slice(0, 160))
    } else {
      conferir('projeto sem página com texto para exercitar `textos` pela página', false)
    }
    writeFileSync(resolve(SAIDA, 'ver-agenda.json'), JSON.stringify(agenda, null, 2))

    // ── 4. consultar-base por data de uso ───────────────────────────────────
    console.log('4) consultar-base com `em`: a campanha vale no dia D e some em D+1')
    const D = somarDias(hoje, 5)
    const campanha = await db.knowledgeBaseEntry.create({
      data: { projectId: PROJETO, title: `${MARCA} Semana do Croissant`, content: 'Croissant em dobro até o fim da semana. Vale de terça a domingo.', category: 'CAMPANHAS', tags: ['prova'], createdBy: projeto.userId, expiresAt: new Date(`${D}T23:59:59.999-03:00`) },
      select: { id: true },
    })
    entradas.push(campanha.id)
    const emD = await tool('consultar-base', { projectId: PROJETO, category: 'CAMPANHAS', em: D })
    const emD1 = await tool('consultar-base', { projectId: PROJETO, category: 'CAMPANHAS', em: somarDias(D, 1) })
    const semEm = await tool('consultar-base', { projectId: PROJETO, category: 'CAMPANHAS' })
    const tem = (r: Record<string, any>) => (r.entries as Array<{ id: string; validade: string | null }>).find((e) => e.id === campanha.id)
    conferir(`em = ${D}: a campanha entra, com validade e a referência do dia`, !!tem(emD) && tem(emD)!.validade !== null && emD.referencia === D, JSON.stringify({ referencia: emD.referencia, validade: tem(emD)?.validade }))
    conferir(`em = ${somarDias(D, 1)}: a campanha SAI (venceu antes da peça)`, !tem(emD1) && emD1.referencia === somarDias(D, 1))
    conferir('sem `em`: vale hoje — a campanha entra e a referência é hoje', !!tem(semEm) && semEm.referencia === hoje)
    const e4 = await (async () => { try { await tool('consultar-base', { projectId: PROJETO, em: '31/12/2026' }); return null } catch (e) { return e instanceof Error ? e.message : String(e) } })()
    conferir('data inválida em `em` é recusada com mensagem', !!e4 && /Data inválida/.test(e4), String(e4).slice(0, 80))

    // ── 5. buscar-fotos com exclusão ────────────────────────────────────────
    console.log('5) buscar-fotos: excluir a foto já escolhida e evitar as usadas desde uma data')
    const r1 = await buscarNoAcervo({ projectId: PROJETO, limit: 5, registrarSugestao: false })
    if (r1.total < 2) {
      conferir(`o acervo do projeto ${PROJETO} tem menos de 2 fotos catalogadas (${r1.total}) — exclusão não exercitada`, false)
    } else {
      const escolhida = r1.images[0].driveFileId
      const r2 = await buscarNoAcervo({ projectId: PROJETO, limit: 5, registrarSugestao: false, excluirDriveFileIds: [escolhida, 'id-que-nao-existe'] })
      conferir('a foto escolhida saiu da lista; `excluidas` diz porId 1 e o id desconhecido em naoEncontrados; total cai em 1', !r2.images.some((i) => i.driveFileId === escolhida) && r2.images[0]?.driveFileId === r1.images[1]?.driveFileId && (r2 as any).excluidas?.porId === 1 && JSON.stringify((r2 as any).excluidas?.naoEncontrados) === '["id-que-nao-existe"]' && r2.total === r1.total - 1, JSON.stringify((r2 as any).excluidas))
      const r3 = await buscarNoAcervo({ projectId: PROJETO, limit: 5, registrarSugestao: false, evitarUsadasDesde: '2000-01-01' })
      conferir('evitarUsadasDesde 2000-01-01 tira TODA foto com uso registrado (total = antes − porUso); a lista que sobra só tem "nunca"', r3.total === r1.total - (r3 as any).excluidas.porUso && r3.images.every((i) => i.ultimoUso === 'nunca'), JSON.stringify({ antes: r1.total, depois: r3.total, porUso: (r3 as any).excluidas?.porUso }))
      const r4 = await buscarNoAcervo({ projectId: PROJETO, limit: 3, registrarSugestao: false, evitarUsadasDesde: '01/01/2000' })
      conferir('data inválida em evitarUsadasDesde não exclui nada e vira aviso', r4.total === r1.total && (r4.avisos ?? []).some((a) => /evitarUsadasDesde ignorado/.test(a)))
      const semPedido = await buscarNoAcervo({ projectId: PROJETO, limit: 3, registrarSugestao: false })
      conferir('sem pedido de exclusão a resposta não traz `excluidas`', !('excluidas' in semPedido))
    }
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou)')
    const falhas: string[] = []
    const apagados = { posts: 0, entradas: 0 }
    try {
      apagados.posts = (await db.socialPost.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: posts } }, { caption: { contains: MARCA } }] } })).count
    } catch (e) { falhas.push(`posts: ${e instanceof Error ? e.message : String(e)}`) }
    try {
      apagados.entradas = (await db.knowledgeBaseEntry.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: entradas } }, { title: { contains: MARCA } }] } })).count
    } catch (e) { falhas.push(`entradas: ${e instanceof Error ? e.message : String(e)}`) }
    if (falhas.length) {
      console.error('  ✗ cleanup incompleto:', falhas.join(' | '))
      mau += falhas.length
    } else console.log('  apagados:', JSON.stringify(apagados))
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ ...registro, pendentes, ok, falhas: mau, apagados, falhasDoCleanup: falhas }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
