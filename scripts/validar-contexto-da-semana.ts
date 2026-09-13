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
 * Seção 3j (C6-01/C6-03 da pré-revisão do HEAD f0eee811): a copy visual
 * regravada no re-render vale no agendamento, na troca de arte e na agenda
 * entregue, mesmo depois de uma recusa da recomposição; sem o marcador, segue
 * invalidada.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada).
 *
 * USO: npx tsx scripts/validar-contexto-da-semana.ts [--saida <pasta>]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { limparRodada, type BancoDaLimpeza } from './lib/limpeza-contexto-da-semana'
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
// A caixa é a do render (R16): na arte de modelo o texto sai na caixa da camada
// (R46 aplica `textTransform`). A sequência e a quantidade continuam exatas; só a
// caixa fica fora da comparação — o teste unitário confere a caixa exata.
const mesmaSequenciaSemCaixa = (lista: unknown, esperado: string[]) =>
  Array.isArray(lista) && JSON.stringify(lista.map((t) => String(t).toUpperCase())) === JSON.stringify(esperado.map((t) => t.toUpperCase()))

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
  const generationsDaProva: string[] = []
  const entradas: string[] = []
  const sinaisDaProva = new Set<string>()
  const sinaisDeSlotDaProva = new Set<string>()
  const geracoes: string[] = []
  const usosDaProva: string[] = []
  const inicioDaProva = new Date()
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
    // R33 (revisão de 4bf1d0a3): a proposta REGISTRADA leva o formato na chave e no `sugerido`; reemitir devolve o
    // MESMO id; story e feed no mesmo horário seriam ids diferentes. Registra no DEV de propósito (é o branch de
    // prova) e apaga no cleanup.
    console.log('2c) emissão REGISTRADA (dev): a chave do sinal termina no formato, o sugerido carrega o formato e a reemissão devolve o mesmo id')
    // R43: o id de cada proposta entra no cleanup LOGO depois da chamada que a registrou, antes do próximo `await` —
    // falhando a chamada seguinte, a anterior não fica no aprendizado.
    const e1 = await sugerirPosts({ projectId: PROJETO, inicio: segunda, fim: domingo })
    for (const s of e1.sugestoes) if (typeof s.sugestaoId === 'string') sinaisDeSlotDaProva.add(s.sugestaoId)
    const e2 = await sugerirPosts({ projectId: PROJETO, inicio: segunda, fim: domingo })
    for (const s of e2.sugestoes) if (typeof s.sugestaoId === 'string') sinaisDeSlotDaProva.add(s.sugestaoId)
    const comId = e1.sugestoes.filter((s) => typeof s.sugestaoId === 'string')
    const sinais = await db.learningSignal.findMany({ where: { id: { in: comId.map((s) => s.sugestaoId as string) } }, select: { id: true, chave: true, sugerido: true } })
    const porId = new Map(sinais.map((s) => [s.id, s]))
    const todasComFormato = comId.length > 0 && comId.every((s) => { const g = porId.get(s.sugestaoId as string); return !!g && g.chave.endsWith(`|${s.formato}`) && (g.sugerido as Record<string, unknown> | null)?.formato === s.formato })
    const mesmosIds = e2.sugestoes.length === e1.sugestoes.length && e2.sugestoes.every((s, i) => s.sugestaoId === e1.sugestoes[i].sugestaoId)
    conferir('R33: toda proposta registrada tem a chave terminando no formato e `sugerido.formato`; a reemissão reutiliza os mesmos ids', e1.sinaisRegistrados === true && todasComFormato && mesmosIds, JSON.stringify({ propostas: e1.sugestoes.length, comId: comId.length, exemploChave: sinais[0]?.chave, mesmosIds }).slice(0, 200))
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

      // ── 2b. a borda da janela (R27) ──
      console.log('2b) um story 15 min ANTES do início da janela é visto pela detecção de conflito, mas não entra na listagem (ocupação/jaNaAgenda) nem move a janela')
      const inicioDaJanela = new Date(`${segunda}T00:00:00-03:00`)
      const naBorda = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'STORY', caption: `${MARCA} story 15 min antes da janela`, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(inicioDaJanela.getTime() - 15 * 60_000), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
        select: { id: true },
      })
      posts.push(naBorda.id)
      const s2b = await sugerirPosts({ projectId: PROJETO, inicio: segunda, fim: domingo, registrarSugestoes: false })
      conferir('o story da borda NÃO aparece em ocupacao nem conta em jaNaAgenda; a janela não mudou', !s2b.ocupacao.some((o) => o.postId === naBorda.id) && s2b.jaNaAgenda === s2.jaNaAgenda && s2b.janela.inicio === segunda && s2b.janela.fim === domingo, JSON.stringify({ jaNaAgenda: [s2.jaNaAgenda, s2b.jaNaAgenda] }))
      const slotColado = s2.sugestoes.find((s) => s.formato === 'story' && Math.abs(new Date(`${s.scheduledDatetime.replace(' ', 'T')}:00-03:00`).getTime() - inicioDaJanela.getTime()) <= 30 * 60_000)
      if (slotColado) conferir(`o slot de story colado ao início (${slotColado.scheduledDatetime}) deixou de ser sugerido por causa do story da borda`, !s2b.sugestoes.some((s) => s.scheduledDatetime === slotColado.scheduledDatetime && s.formato === 'story'))
      else console.log('  ○ não há slot de story a até 30 min do início da janela neste cliente: o bloqueio pela borda fica com o teste unitário (janelaDeConsultaDeOcupacao + slotOcupado)')
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
    // R29: post deste projeto apontando para uma PÁGINA DE OUTRO PROJETO — a agenda não pode entregar os textos dela.
    // R31: a candidata é escolhida lendo as camadas de verdade (`textosDaPagina`, que aceita array, string JSON e
    // dupla codificação) — um LIKE no texto do JSONB pulava páginas válidas e a prova era dada como não exercitada.
    const { textosDaPagina: textosDePagina } = await import('../src/lib/posts/page-layers')
    // A página de OUTRO projeto tem de ser uma página PARADA (mexida há mais de 1 h): a mais recente do dev costuma
    // ser a de outra prova em andamento (a do revisor da arte, no projeto 8), que muda e some no meio — e a
    // Generation que criamos apontando para ela também sequestrava a recomposição de lá (REV-2CEB-02 do PR 0).
    const candidatasDeOutro = await db.page.findMany({ where: { Template: { projectId: { not: PROJETO } }, updatedAt: { lt: new Date(Date.now() - 3_600_000) }, NOT: { name: { contains: 'PR0-REVISOR' } } }, select: { id: true, layers: true }, orderBy: { updatedAt: 'desc' }, take: 40 })
    const paginaDeOutro = candidatasDeOutro.map((c) => ({ id: c.id, layers: c.layers, textos: Object.values(textosDePagina(c.layers)) })).filter((c) => c.textos.length > 0).slice(0, 1)
    let deOutroProjeto: { id: string } | null = null
    let porGeneracaoDeOutro: { id: string; url: string } | null = null
    if (paginaDeOutro[0]) {
      deOutroProjeto = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'STORY', caption: `${MARCA} página de outro projeto`, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3}T17:30:00-03:00`), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', pageId: paginaDeOutro[0].id },
        select: { id: true },
      })
      posts.push(deOutroProjeto.id)
      // e o outro caminho: a ARTE (Generation deste projeto) cujo fieldValues.pageId aponta para a página de B
      const templateDaqui = await db.template.findFirst({ where: { projectId: PROJETO }, select: { id: true } })
      if (templateDaqui) {
        const url = `https://exemplo.invalid/${MARCA}-r29-${Date.now()}.png`
        const gen = await db.generation.create({ data: { projectId: PROJETO, templateId: templateDaqui.id, status: 'COMPLETED', resultUrl: url, fieldValues: { pageId: paginaDeOutro[0].id, prova: MARCA }, createdBy: projeto.userId }, select: { id: true } })
        generationsDaProva.push(gen.id)
        const postVivo = await db.socialPost.create({
          data: { projectId: PROJETO, userId: projeto.userId, postType: 'STORY', caption: `${MARCA} arte com página de outro projeto`, mediaUrls: [url], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3}T17:45:00-03:00`), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', generationId: gen.id },
          select: { id: true },
        })
        posts.push(postVivo.id)
        porGeneracaoDeOutro = { id: postVivo.id, url }
      }
    }
    const agenda = await tool('ver-agenda', { projectId: PROJETO, from: dia3, to: dia3 })
    const itens = (agenda.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
    const itemSlots = itens.find((i) => i.postId === comSlots.id)
    if (deOutroProjeto) {
      const textosDeB = paginaDeOutro[0].textos
      const vazouEm = (item: Record<string, any> | undefined) => (item?.textos as string[] | undefined)?.some((t) => textosDeB.includes(t)) || JSON.stringify(item?.textosPorSlide ?? []).split('"').some((t) => textosDeB.includes(t))
      const itemB = itens.find((i) => i.postId === deOutroProjeto!.id)
      conferir('R29/R30: post com pageId de OUTRO projeto volta SEM os textos daquela página e a fonte é declarada INDISPONÍVEL (não "sem página")', !!itemB && !vazouEm(itemB) && !(itemB.textos as string[] | undefined)?.length && /não pôde ser carregada/.test(String(itemB.textosIndisponiveis ?? '')), JSON.stringify({ textos: itemB?.textos, origem: itemB?.textosOrigem, indisponiveis: itemB?.textosIndisponiveis, deB: textosDeB.length }).slice(0, 220))
      if (porGeneracaoDeOutro) {
        const itemG = itens.find((i) => i.postId === porGeneracaoDeOutro!.id)
        conferir('R29/R32 pela ARTE: post vivo de MÍDIA ÚNICA cuja Generation aponta (fieldValues.pageId) para página de OUTRO projeto volta sem os textos dela E com a fonte declarada INDISPONÍVEL ("a arte desta peça não afirma texto"), sem `textos`', !!itemG && !vazouEm(itemG) && !(itemG.textos as string[] | undefined)?.length && /a arte desta peça não afirma texto/.test(String(itemG.textosIndisponiveis ?? '')), JSON.stringify({ textos: itemG?.textos, porSlide: itemG?.textosPorSlide, indisponiveis: itemG?.textosIndisponiveis }).slice(0, 220))
      }
    } else {
      conferir('R29: há página com texto em outro projeto do dev para exercitar o isolamento', false, `nenhuma entre ${candidatasDeOutro.length} candidatas`)
    }
    // jsonb não guarda a ordem das chaves: compara como conjunto
    conferir('post sem página: `textos` vêm do slotValues (sem as chaves _), formato feed e legendaCompleta', !!itemSlots && JSON.stringify([...(itemSlots.textos as string[])].sort()) === JSON.stringify(['Segunda linha B', 'Texto de prova A']) && itemSlots.formato === 'feed' && itemSlots.legendaCompleta === legendaLonga && itemSlots.legenda.length === 140, JSON.stringify({ textos: itemSlots?.textos, formato: itemSlots?.formato, legenda: itemSlots?.legenda?.length }))
    if (comPagina) {
      const itemPagina = itens.find((i) => i.postId === comPagina!.id)
      conferir('post com página: `textos` são as camadas de texto da página (não vazios), origem "pagina", formato story', !!itemPagina && Array.isArray(itemPagina.textos) && itemPagina.textos.length > 0 && itemPagina.textosOrigem === 'pagina' && itemPagina.formato === 'story', String(JSON.stringify(itemPagina?.textos)).slice(0, 160))

      // R1/R3 (revisão de 619e7877): a mesma precedência do render, e a arte entregue não segue a página.
      console.log('3b) ver-agenda: copy PRÓPRIA por cima da página; cópia da página não sobrepõe; arte entregue não segue a página')
      const { textosDaPagina } = await import('../src/lib/posts/page-layers')
      const pagina = await db.page.findUnique({ where: { id: paginaComTexto[0].id }, select: { layers: true } })
      const textosDoModelo = Object.entries(textosDaPagina(pagina!.layers))
      const [chaveDoTexto, textoDoModelo] = textosDoModelo.find(([k]) => !k.includes('#')) ?? textosDoModelo[0]
      const dia3b = somarDias(hoje, 4)
      const criar = (hora: string, extra: Record<string, unknown>) =>
        db.socialPost.create({
          data: { projectId: PROJETO, userId: projeto.userId, postType: 'STORY', caption: `${MARCA} 3b`, mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3b}T${hora}:00-03:00`), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', pageId: paginaComTexto[0].id, ...(extra as object) },
          select: { id: true },
        })
      const propriaA = await criar('09:00', { slotValues: { [chaveDoTexto]: `${MARCA} headline A` } })
      const propriaB = await criar('10:00', { slotValues: { [chaveDoTexto]: { content: `${MARCA} headline B` } } })
      const copiaDaPagina = await criar('11:00', { slotValues: { [chaveDoTexto]: 'texto velho da cópia', _copiaDaPagina: true } })
      const entregueComRegistro = await criar('12:00', { status: 'POSTED', slotValues: { [chaveDoTexto]: 'o que foi ao ar', _copiaDaPagina: true } })
      const entregueSemNada = await criar('13:00', { status: 'SCHEDULED', laterPostId: `prova-${Date.now()}`, slotValues: null as never })
      posts.push(propriaA.id, propriaB.id, copiaDaPagina.id, entregueComRegistro.id, entregueSemNada.id)
      const agenda3b = await tool('ver-agenda', { projectId: PROJETO, from: dia3b, to: dia3b })
      const itens3b = (agenda3b.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const item = (id: string) => itens3b.find((i) => i.postId === id)
      const iA = item(propriaA.id), iB = item(propriaB.id), iC = item(copiaDaPagina.id), iD = item(entregueComRegistro.id), iE = item(entregueSemNada.id)
      // A CAIXA é a do render (R16): a camada pode ter textTransform, então a comparação ignora caixa — o teste unitário confere a caixa exata.
      const temSemCaixa = (lista: string[] | undefined, alvo: string) => (lista ?? []).some((t) => t.toUpperCase() === alvo.toUpperCase())
      conferir('dois posts sobre a MESMA página com copy própria voltam cada um com a SUA headline (não o texto do modelo), origem "pagina-com-copy-do-post"', !!iA && !!iB && temSemCaixa(iA.textos, `${MARCA} headline A`) && !temSemCaixa(iA.textos, textoDoModelo) && temSemCaixa(iB.textos, `${MARCA} headline B`) && !temSemCaixa(iB.textos, textoDoModelo) && iA.textosOrigem === 'pagina-com-copy-do-post' && iB.textosOrigem === 'pagina-com-copy-do-post', JSON.stringify({ chave: chaveDoTexto, a: iA?.textos?.[0], b: iB?.textos?.[0] }).slice(0, 200))
      conferir('a cópia da página (_copiaDaPagina) NÃO sobrepõe: os textos são os da página, origem "pagina"', !!iC && temSemCaixa(iC.textos, textoDoModelo) && !temSemCaixa(iC.textos, 'texto velho da cópia') && iC.textosOrigem === 'pagina', String(JSON.stringify(iC?.textos)).slice(0, 160))
      conferir('post PUBLICADO com cópia registrada: volta o que foi registrado na entrega, NÃO o texto atual da página — e declarado PARCIAL (sem a caixa do render nem a ordem)', !!iD && JSON.stringify(iD.textos) === JSON.stringify(['o que foi ao ar']) && iD.textosOrigem === 'copy-registrada-na-entrega' && iD.textosParciais === true && /ANTES da caixa/.test(iD.textosNota ?? ''), JSON.stringify({ textos: iD?.textos, origem: iD?.textosOrigem, parciais: iD?.textosParciais }))
      conferir('post no publicador (laterPostId) sem registro nenhum: `textosIndisponiveis` declarado e nenhum texto da página atribuído', !!iE && !('textos' in iE) && typeof iE.textosIndisponiveis === 'string' && /entregue/.test(iE.textosIndisponiveis), JSON.stringify({ textos: iE?.textos, indisponiveis: iE?.textosIndisponiveis }).slice(0, 200))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3b.json'), JSON.stringify(agenda3b, null, 2))

      // R8/R9/R11 (revisão de 0585363f): carrossel slide a slide, copy própria parcial depois da entrega, slot vazio com a semântica do render.
      console.log('3c) ver-agenda: carrossel publicado lê CADA slide pela arte; copy própria sem snapshot é PARCIAL; slot vazio segue o render')
      const dia3c = somarDias(hoje, 6)
      const paginaDoTemplate = await db.page.findUnique({ where: { id: paginaComTexto[0].id }, select: { templateId: true } })
      const snap = (texto: string) => [{ id: 'l1', name: 'headline', type: 'text', content: texto, visible: true }]
      const marcaUrl = `https://prova.invalid/${Date.now()}`
      // R23: o snapshot do slide 1 vem FORA DE ORDEM no array (order 2 antes do order 1) — a agenda devolve na ordem do render.
      const snapForaDeOrdem = [{ id: 'l2', name: 'apoio', type: 'text', content: `${MARCA} slide um — linha 2`, visible: true, order: 2 }, { id: 'l1', name: 'headline', type: 'text', content: `${MARCA} slide um`, visible: true, order: 1 }]
      const genA = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/slide-1.png`, fieldValues: { layersSnapshot: snapForaDeOrdem, source: 'prova' } as never }, select: { id: true } })
      geracoes.push(genA.id) // R44: coletado ANTES do próximo await
      const genB = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/slide-2.png`, fieldValues: { layersSnapshot: snap(`${MARCA} slide dois`), source: 'prova' } as never }, select: { id: true } })
      geracoes.push(genB.id) // R44: coletado ANTES do próximo await
      const carrossel = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} 3c carrossel`, mediaUrls: [`${marcaUrl}/slide-1.png`, `${marcaUrl}/slide-2.png`, `${marcaUrl}/slide-3-sem-arte.png`], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3c}T09:00:00-03:00`), status: 'POSTED', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', generationId: genA.id },
        select: { id: true },
      })
      const parcialPropria = await criar('10:00', { status: 'POSTED', scheduledDatetime: new Date(`${dia3c}T10:00:00-03:00`), slotValues: { [chaveDoTexto]: `${MARCA} só o título` } })
      const slotVazio = await criar('11:00', { scheduledDatetime: new Date(`${dia3c}T11:00:00-03:00`), slotValues: { [chaveDoTexto]: '' } })
      const slotApaga = await criar('12:00', { scheduledDatetime: new Date(`${dia3c}T12:00:00-03:00`), slotValues: { [chaveDoTexto]: { content: '' } } })
      posts.push(carrossel.id, parcialPropria.id, slotVazio.id, slotApaga.id)
      const agenda3c = await tool('ver-agenda', { projectId: PROJETO, from: dia3c, to: dia3c })
      const itens3c = (agenda3c.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const item3c = (id: string) => itens3c.find((i) => i.postId === id)
      const iCar = item3c(carrossel.id), iPar = item3c(parcialPropria.id), iVaz = item3c(slotVazio.id), iApa = item3c(slotApaga.id)
      conferir('carrossel PUBLICADO com 3 mídias: os textos dos slides 1 e 2 em ordem (pela URL, não só pelo generationId; dentro do slide 1 na ordem do RENDER, não do array), o 3º declarado sem arte, leitura parcial', !!iCar && JSON.stringify(iCar.textos) === JSON.stringify([`${MARCA} slide um`, `${MARCA} slide um — linha 2`, `${MARCA} slide dois`]) && iCar.textosOrigem === 'arte' && iCar.textosParciais === true && Array.isArray(iCar.textosPorSlide) && iCar.textosPorSlide.length === 3 && iCar.textosPorSlide[2].textos.length === 0 && /nenhuma arte/.test(iCar.textosPorSlide[2].indisponiveis ?? ''), JSON.stringify({ textos: iCar?.textos, slides: iCar?.textosPorSlide?.map((s: any) => s.origem ?? s.indisponiveis) }).slice(0, 260))
      conferir('post PUBLICADO com copy própria e sem snapshot: só o título sobrescrito, marcado PARCIAL (não completa pela página atual)', !!iPar && JSON.stringify(iPar.textos) === JSON.stringify([`${MARCA} só o título`]) && iPar.textosOrigem === 'copy-do-post' && iPar.textosParciais === true && /sobrescreveu/.test(iPar.textosNota ?? ''), JSON.stringify({ textos: iPar?.textos, parciais: iPar?.textosParciais }).slice(0, 200))
      conferir('slot "" mantém o texto da página (como o render); slot { content: "" } o apaga (como o render) — e a leitura vazia é definitiva (textos sai, mesmo vazio)', !!iVaz && temSemCaixa(iVaz.textos, textoDoModelo) && !!iApa && Array.isArray(iApa.textos) && !temSemCaixa(iApa.textos, textoDoModelo) && typeof iApa.textosOrigem === 'string', JSON.stringify({ vazio: iVaz?.textos?.[0], apaga: iApa?.textos, origem: iApa?.textosOrigem }).slice(0, 200))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3c.json'), JSON.stringify(agenda3c, null, 2))

      // R12/R13 (revisão de 6ad711bd): o snapshot de OUTRA versão da mídia nunca é atribuído à publicação.
      console.log('3d) ver-agenda: mídia nova sem Generation casada (R12) e arte re-renderizada (R13) não devolvem o snapshot antigo — vale a cópia registrada')
      const dia3d = somarDias(hoje, 7)
      const genAntiga = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/versao-A.png`, fieldValues: { layersSnapshot: snap(`${MARCA} texto A antigo`), source: 'prova' } as never }, select: { id: true } })
      geracoes.push(genAntiga.id) // R44: coletado ANTES do próximo await
      const genReRender = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/re-render.png`, fieldValues: { layersSnapshot: snap(`${MARCA} texto A antigo`), recomposicao: { estado: 're-renderizada' }, source: 'prova' } as never }, select: { id: true } })
      geracoes.push(genReRender.id) // R44: coletado ANTES do próximo await
      const r12 = await criar('09:00', { status: 'POSTED', scheduledDatetime: new Date(`${dia3d}T09:00:00-03:00`), mediaUrls: [`${marcaUrl}/versao-B.png`], generationId: genAntiga.id, slotValues: { [chaveDoTexto]: `${MARCA} texto B registrado`, _copiaDaPagina: true } })
      const r13 = await criar('10:00', { status: 'POSTED', scheduledDatetime: new Date(`${dia3d}T10:00:00-03:00`), mediaUrls: [`${marcaUrl}/re-render.png`], generationId: genReRender.id, slotValues: { [chaveDoTexto]: `${MARCA} texto B registrado`, _copiaDaPagina: true } })
      posts.push(r12.id, r13.id)
      const agenda3d = await tool('ver-agenda', { projectId: PROJETO, from: dia3d, to: dia3d })
      const itens3d = (agenda3d.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const i12 = itens3d.find((i) => i.postId === r12.id), i13 = itens3d.find((i) => i.postId === r13.id)
      conferir('R12: mídia B publicada com generationId da versão A (URL não casa): volta a cópia registrada B (parcial), NUNCA o snapshot A', !!i12 && JSON.stringify(i12.textos) === JSON.stringify([`${MARCA} texto B registrado`]) && i12.textosOrigem === 'copy-registrada-na-entrega' && i12.textosParciais === true && !JSON.stringify(i12).includes('texto A antigo'), JSON.stringify({ textos: i12?.textos, origem: i12?.textosOrigem }).slice(0, 200))
      conferir('R13: URL casa, mas a arte foi RE-RENDERIZADA por cima do snapshot: volta a cópia registrada B (parcial), NUNCA o snapshot A', !!i13 && JSON.stringify(i13.textos) === JSON.stringify([`${MARCA} texto B registrado`]) && i13.textosOrigem === 'copy-registrada-na-entrega' && i13.textosParciais === true && !JSON.stringify(i13).includes('texto A antigo'), JSON.stringify({ textos: i13?.textos, origem: i13?.textosOrigem }).slice(0, 200))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3d.json'), JSON.stringify(agenda3d, null, 2))

      // R36 (revisão final de bf4650f2): a arte de `post-schedule` desenhou um MODELO com a copy do post por cima.
      // Reagendada por generationId (post sem página), a agenda lia a PÁGINA da arte — o modelo — e devolvia
      // "Título do modelo" por uma mídia que mostra "Costela no bafo". Vale a copy registrada na arte, PARCIAL — e só com o
      // REGISTRO das camadas que o render desenhou (R47): as artes daqui o carregam; a 3i prova a arte sem ele.
      console.log('3f) ver-agenda: arte de post-schedule (modelo + copy) reagendada por generationId NÃO devolve o texto do modelo (R36)')
      const dia3f = somarDias(hoje, 8)
      const copyA = `${MARCA} copy A do reagendado`, copyB = `${MARCA} copy B do reagendado`
      const genModA = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/modelo-A.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: copyA }, layersSnapshot: pagina!.layers } as never }, select: { id: true } })
      geracoes.push(genModA.id) // R44: coletado ANTES do próximo await
      const genModB = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/modelo-B.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: copyB }, layersSnapshot: pagina!.layers } as never }, select: { id: true } })
      geracoes.push(genModB.id) // R44: coletado ANTES do próximo await
      // R37: a arte de post-schedule RE-RENDERIZADA (o PNG novo é a página atual) não afirma mais a copy antiga.
      const genModRR = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${marcaUrl}/modelo-rerender.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy ANTIGA do re-render` }, recomposicao: { estado: 're-renderizada' } } as never }, select: { id: true } })
      geracoes.push(genModRR.id) // R44: coletado ANTES do próximo await
      const reagendadoRR = await criar('10:00', { scheduledDatetime: new Date(`${dia3f}T10:00:00-03:00`), pageId: null, mediaUrls: [`${marcaUrl}/modelo-rerender.png`], generationId: genModRR.id, slotValues: null })
      posts.push(reagendadoRR.id)
      const reagendado = await criar('11:00', { scheduledDatetime: new Date(`${dia3f}T11:00:00-03:00`), pageId: null, mediaUrls: [`${marcaUrl}/modelo-A.png`], generationId: genModA.id, slotValues: null })
      const carrosselDeModelo = await criar('12:00', { postType: 'POST', scheduledDatetime: new Date(`${dia3f}T12:00:00-03:00`), pageId: null, mediaUrls: [`${marcaUrl}/modelo-A.png`, `${marcaUrl}/modelo-B.png`], generationId: genModA.id, slotValues: null })
      posts.push(reagendado.id, carrosselDeModelo.id)
      const agenda3f = await tool('ver-agenda', { projectId: PROJETO, from: dia3f, to: dia3f })
      const itens3f = (agenda3f.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const i36 = itens3f.find((i) => i.postId === reagendado.id), i36c = itens3f.find((i) => i.postId === carrosselDeModelo.id)
      conferir('R36: post VIVO reagendado por generationId de uma arte post-schedule volta com a copy registrada na arte (parcial, origem "arte"), NUNCA o texto cru do modelo', !!i36 && mesmaSequenciaSemCaixa(i36.textos, [copyA]) && i36.textosOrigem === 'arte' && i36.textosParciais === true && !temSemCaixa(i36.textos, textoDoModelo) && !JSON.stringify(i36).includes(textoDoModelo), JSON.stringify({ textos: i36?.textos, origem: i36?.textosOrigem, parcial: i36?.textosParciais }).slice(0, 220))
      conferir('R36: duas mídias com copies DISTINTAS sobre o MESMO modelo voltam cada uma com a sua, slide a slide, sem o texto do modelo', !!i36c && (i36c.textosPorSlide as Array<{ textos: string[] }> | undefined)?.length === 2 && mesmaSequenciaSemCaixa((i36c.textosPorSlide as Array<{ textos: string[] }>)[0].textos, [copyA]) && mesmaSequenciaSemCaixa((i36c.textosPorSlide as Array<{ textos: string[] }>)[1].textos, [copyB]) && i36c.textosParciais === true && !JSON.stringify(i36c).includes(textoDoModelo), String(JSON.stringify(i36c?.textosPorSlide)).slice(0, 220))
      const i37 = itens3f.find((i) => i.postId === reagendadoRR.id)
      conferir('R37: arte de post-schedule RE-RENDERIZADA num post vivo volta com a PÁGINA atual (origem "pagina"), nunca a copy antiga preservada no fieldValues', !!i37 && i37.textosOrigem === 'pagina' && temSemCaixa(i37.textos, textoDoModelo) && !JSON.stringify(i37).includes('copy ANTIGA'), JSON.stringify({ textos: i37?.textos, origem: i37?.textosOrigem }).slice(0, 220))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3f.json'), JSON.stringify(agenda3f, null, 2))

      // R38 (revisão final de 8c60437c): reagendar PELO SERVIÇO uma Generation re-renderizada não copia a copy
      // antiga para o post — depois da entrega, sem registro confiável, os textos são declarados indisponíveis;
      // o controle é a Generation NÃO re-renderizada, cuja copy é legítima e volta (parcial).
      console.log('3g) agendarPost por generationId de uma arte post-schedule RE-RENDERIZADA não herda a copy antiga: entregue, os textos ficam indisponíveis (R38); a não re-renderizada é o controle')
      const { agendarPost } = await import('../src/lib/creatives/agendar')
      const blobHost = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/prova-pr6'
      const genRR2 = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-rerender-B.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy A invalidada` }, recomposicao: { estado: 're-renderizada' } } as never }, select: { id: true, resultUrl: true } })
      geracoes.push(genRR2.id) // R44: coletado ANTES do próximo await
      const genCtl = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-controle-B.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy B legítima` }, layersSnapshot: pagina!.layers } as never }, select: { id: true } })
      geracoes.push(genCtl.id) // R44: coletado ANTES do próximo await
      const dia3g = somarDias(hoje, 9)
      const agRR = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3g} 10:00`, generationId: genRR2.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3g re-renderizada` })
      const agCtl = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3g} 11:00`, generationId: genCtl.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3g controle` })
      posts.push(agRR.postId, agCtl.postId)
      const postRR = await db.socialPost.findUnique({ where: { id: agRR.postId }, select: { slotValues: true, pageId: true, mediaUrls: true } })
      const postCtl = await db.socialPost.findUnique({ where: { id: agCtl.postId }, select: { slotValues: true } })
      conferir('R38: o post reagendado da arte re-renderizada nasce sem página, com a mídia dela e SEM cópia textual (a copy A não é copiada); o serviço avisa', postRR?.pageId === null && postRR.mediaUrls[0] === genRR2.resultUrl && !JSON.stringify(postRR.slotValues ?? {}).includes('copy A invalidada') && /re-renderizada/.test(String((agRR as { aviso?: string }).aviso ?? '')), JSON.stringify({ slot: postRR?.slotValues, aviso: (agRR as { aviso?: string }).aviso }).slice(0, 200))
      conferir('controle: o post da arte NÃO re-renderizada nasce com a copy B legítima', JSON.stringify(postCtl?.slotValues ?? {}).includes('copy B legítima'), String(JSON.stringify(postCtl?.slotValues)).slice(0, 120))
      // entregues (no publicador e publicado): sem registro confiável da mídia B, os textos são declarados; a copy A não aparece
      await db.socialPost.update({ where: { id: agRR.postId }, data: { status: 'SCHEDULED', laterPostId: `prova-${Date.now()}` } })
      await db.socialPost.update({ where: { id: agCtl.postId }, data: { status: 'POSTED' } })
      const agenda3g = await tool('ver-agenda', { projectId: PROJETO, from: dia3g, to: dia3g })
      const itens3g = (agenda3g.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const iRR = itens3g.find((i) => i.postId === agRR.postId), iCtl = itens3g.find((i) => i.postId === agCtl.postId)
      conferir('R38: entregue (no publicador), a arte re-renderizada volta com `textosIndisponiveis` — nunca a copy A', !!iRR && !('textos' in iRR) && !!iRR.textosIndisponiveis && !JSON.stringify(iRR).includes('copy A invalidada'), JSON.stringify({ ind: iRR?.textosIndisponiveis, textos: iRR?.textos }).slice(0, 200))
      conferir('controle: publicada, a arte não re-renderizada volta com a copy B legítima (parcial, origem "arte")', !!iCtl && mesmaSequenciaSemCaixa(iCtl.textos, [`${MARCA} copy B legítima`]) && iCtl.textosParciais === true && iCtl.textosOrigem === 'arte', JSON.stringify({ textos: iCtl?.textos, origem: iCtl?.textosOrigem, parcial: iCtl?.textosParciais }).slice(0, 200))
      // POSTED também
      await db.socialPost.update({ where: { id: agRR.postId }, data: { status: 'POSTED' } })
      const agenda3gB = await tool('ver-agenda', { projectId: PROJETO, from: dia3g, to: dia3g })
      const iRRB = (agenda3gB.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts).find((i) => i.postId === agRR.postId)
      conferir('R38: publicada, idem — indisponível, sem a copy A', !!iRRB && !('textos' in iRRB) && !!iRRB.textosIndisponiveis && !JSON.stringify(iRRB).includes('copy A invalidada'))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3g.json'), JSON.stringify(agenda3gB, null, 2))

      // R42 (revisão final de be055fe0): a ordem INVERSA de 3g — agendar pela arte AINDA legítima (a copy A é copiada
      // para o post, sem página), RE-RENDERIZAR depois (a Generation ganha URL nova e `recomposicao.estado`; o post só
      // tem a mídia trocada, como `recompor.ts` faz), entregar, consultar: a copy A herdada não pode ser atribuída à mídia B.
      console.log('3h) agendar → re-renderizar → entregar → consultar: a copy A herdada no agendamento não é atribuída à mídia B (R42); o controle é a mesma arte NÃO re-renderizada, cuja copy é legítima')
      const genH = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-3h-A.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy A herdada 3h` } } as never }, select: { id: true, resultUrl: true } })
      geracoes.push(genH.id) // R44: coletado ANTES do próximo await — a falha na criação seguinte não deixa esta fora do cleanup
      const genHCtl = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-3h-ctl.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy A legítima 3h` }, layersSnapshot: pagina!.layers } as never }, select: { id: true } })
      geracoes.push(genHCtl.id)
      const dia3h = somarDias(hoje, 10)
      const agH = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3h} 12:00`, generationId: genH.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3h herdada` })
      const agHCtl = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3h} 13:00`, generationId: genHCtl.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3h controle` })
      posts.push(agH.postId, agHCtl.postId)
      const postH0 = await db.socialPost.findUnique({ where: { id: agH.postId }, select: { slotValues: true, pageId: true, mediaUrls: true } })
      conferir('3h: agendada ANTES da re-renderização, a copy A é copiada para o post (legítima naquele momento), sem página', postH0?.pageId === null && JSON.stringify(postH0.slotValues ?? {}).includes('copy A herdada 3h'), String(JSON.stringify(postH0)).slice(0, 200))
      // a re-renderização como o sistema faz: URL nova + `recomposicao.estado` na Generation; no post só a mídia trocada
      const urlB3h = `${blobHost}/${Date.now()}-3h-B.png`
      await db.generation.update({ where: { id: genH.id }, data: { resultUrl: urlB3h, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy A herdada 3h` }, recomposicao: { estado: 're-renderizada', urlsAnteriores: [genH.resultUrl] } } as never } })
      await db.socialPost.update({ where: { id: agH.postId }, data: { mediaUrls: [urlB3h] } })
      const agenda3hVivo = await tool('ver-agenda', { projectId: PROJETO, from: dia3h, to: dia3h })
      const iHv = (agenda3hVivo.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts).find((i) => i.postId === agH.postId)
      conferir('3h vivo: a peça sem página lê a página ATUAL da arte re-renderizada (é a mídia B) — a copy A herdada não aparece', !!iHv && Array.isArray(iHv.textos) && !JSON.stringify(iHv).includes('copy A herdada 3h'), String(JSON.stringify(iHv)).slice(0, 300))
      await db.socialPost.update({ where: { id: agH.postId }, data: { status: 'POSTED' } })
      await db.socialPost.update({ where: { id: agHCtl.postId }, data: { status: 'POSTED' } })
      const agenda3h = await tool('ver-agenda', { projectId: PROJETO, from: dia3h, to: dia3h })
      const itens3h = (agenda3h.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const iH = itens3h.find((i) => i.postId === agH.postId), iHCtl = itens3h.find((i) => i.postId === agHCtl.postId)
      conferir('R42: entregue, a copy A herdada NÃO é atribuída à mídia B — `textosIndisponiveis` diz que a arte foi re-renderizada e que não há registro textual confiável (sem afirmar cronologia — R45)', !!iH && !('textos' in iH) && /re-renderizada .*não guarda registro textual confiável/.test(iH.textosIndisponiveis ?? '') && !/DEPOIS do agendamento/.test(iH.textosIndisponiveis ?? '') && !JSON.stringify(iH).includes('copy A herdada 3h'), String(JSON.stringify(iH)).slice(0, 300))
      conferir('controle 3h: a mesma arte NÃO re-renderizada volta com a copy legítima (parcial, origem "arte")', !!iHCtl && mesmaSequenciaSemCaixa(iHCtl.textos, [`${MARCA} copy A legítima 3h`]) && iHCtl.textosParciais === true && iHCtl.textosOrigem === 'arte', String(JSON.stringify(iHCtl)).slice(0, 300))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3h.json'), JSON.stringify(agenda3h, null, 2))

      // C6-01 e C6-03 (pré-revisão do HEAD f0eee811) + o marcador do PR 0: a copy VISUAL regravada no re-render
      // (`recomposicao.copyVisualRegravada`) vale no agendamento, na troca de arte e na agenda entregue — e uma RECUSA
      // posterior da recomposição não apaga o registro do re-render nem o marcador (a recusa mora em
      // `recusaDaRecomposicao`). O controle é a mesma arte re-renderizada SEM o marcador, que segue invalidada (R38/R42).
      console.log('3j) arte re-renderizada COM a copy visual regravada vale para o post e para a agenda mesmo depois de uma recusa; sem o marcador, segue invalidada (C6-01, C6-03)')
      const { registrarRecusa } = await import('../src/lib/compositor/recompor')
      const { trocarArteDoPost } = await import('../src/lib/posts/trocar-arte-do-post')
      const { CreativeError } = await import('../src/lib/creatives/errors')
      const dia3j = somarDias(hoje, 15)
      const fvReRender3j = (copy: string, comMarcador: boolean) => ({
        source: 'ajuste-arte',
        pageId: paginaComTexto[0].id,
        slotValues: { [chaveDoTexto]: copy },
        recomposicao: { estado: 're-renderizada', em: new Date().toISOString(), urlsAnteriores: [`${blobHost}/3j-anterior.png`], ...(comMarcador ? { copyVisualRegravada: true } : {}) },
      })
      const genJ = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-3j-regravada.png`, fieldValues: fvReRender3j(`${MARCA} copy B regravada 3j`, true) as never }, select: { id: true, resultUrl: true } })
      geracoes.push(genJ.id) // R44: coletado ANTES do próximo await
      const genJSem = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-3j-sem-marcador.png`, fieldValues: fvReRender3j(`${MARCA} copy A sem marcador 3j`, false) as never }, select: { id: true, resultUrl: true } })
      geracoes.push(genJSem.id)
      const genJBase = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: `${blobHost}/${Date.now()}-3j-base.png`, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: `${MARCA} copy base 3j` }, layersSnapshot: pagina!.layers } as never }, select: { id: true } })
      geracoes.push(genJBase.id)
      // A recusa da recomposição seguinte, como o runner a grava (sem posts: a prova não precisa de histórico).
      for (const id of [genJ.id, genJSem.id]) {
        await registrarRecusa({ pageId: paginaComTexto[0].id, generationId: id, postIds: [], erro: new CreativeError('TEXTO_NAO_CABE_NA_COLUNA', `${MARCA} a linha não cabe (prova 3j)`, 422) })
      }
      const fvJ = (await db.generation.findUnique({ where: { id: genJ.id }, select: { fieldValues: true } }))?.fieldValues as Record<string, any> | undefined
      const fvJSem = (await db.generation.findUnique({ where: { id: genJSem.id }, select: { fieldValues: true } }))?.fieldValues as Record<string, any> | undefined
      conferir(
        'C6-01: a recusa grava `recusaDaRecomposicao` e NÃO troca o registro do re-render — estado, marcador e rastro ficam',
        fvJ?.recomposicao?.estado === 're-renderizada' && fvJ.recomposicao.copyVisualRegravada === true && Array.isArray(fvJ.recomposicao.urlsAnteriores) && fvJ.recusaDaRecomposicao?.errorCode === 'TEXTO_NAO_CABE_NA_COLUNA' && fvJSem?.recomposicao?.estado === 're-renderizada' && !('copyVisualRegravada' in (fvJSem.recomposicao ?? {})) && fvJSem.recusaDaRecomposicao?.errorCode === 'TEXTO_NAO_CABE_NA_COLUNA',
        JSON.stringify({ comMarcador: fvJ?.recomposicao, recusa: fvJ?.recusaDaRecomposicao?.errorCode, semMarcador: fvJSem?.recomposicao?.estado }).slice(0, 260),
      )
      const agJ = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3j} 10:00`, generationId: genJ.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3j regravada` })
      posts.push(agJ.postId)
      const agJSem = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3j} 11:00`, generationId: genJSem.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3j sem marcador` })
      posts.push(agJSem.postId)
      const postJ = await db.socialPost.findUnique({ where: { id: agJ.postId }, select: { slotValues: true } })
      const postJSem = await db.socialPost.findUnique({ where: { id: agJSem.postId }, select: { slotValues: true } })
      const avisoJ = String((agJ as { aviso?: string }).aviso ?? ''), avisoJSem = String((agJSem as { aviso?: string }).aviso ?? '')
      conferir('marcador + recusa: o post agendado pela arte herda a copy B regravada, sem o aviso do R38', JSON.stringify(postJ?.slotValues ?? {}).includes('copy B regravada 3j') && !/re-renderizada/.test(avisoJ), JSON.stringify({ slot: postJ?.slotValues, aviso: avisoJ }).slice(0, 220))
      conferir('controle (sem marcador + recusa): o post NÃO herda a copy A e o serviço avisa — o R38 continua de pé depois da recusa', !JSON.stringify(postJSem?.slotValues ?? {}).includes('copy A sem marcador 3j') && /re-renderizada/.test(avisoJSem), JSON.stringify({ slot: postJSem?.slotValues, aviso: avisoJSem }).slice(0, 220))
      // C6-03: trocar a arte de um rascunho pelas duas artes da galeria.
      const agT = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3j} 12:00`, generationId: genJBase.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3j troca com marcador` })
      posts.push(agT.postId)
      const agTSem = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${dia3j} 13:00`, generationId: genJBase.id, situacao: 'rascunho', lembrete: true, caption: `${MARCA} 3j troca sem marcador` })
      posts.push(agTSem.postId)
      const tJ = await trocarArteDoPost({ projectId: PROJETO, postId: agT.postId, generationId: genJ.id })
      const tJSem = await trocarArteDoPost({ projectId: PROJETO, postId: agTSem.postId, generationId: genJSem.id })
      const postT = await db.socialPost.findUnique({ where: { id: agT.postId }, select: { slotValues: true, mediaUrls: true } })
      const postTSem = await db.socialPost.findUnique({ where: { id: agTSem.postId }, select: { slotValues: true, mediaUrls: true } })
      conferir('C6-03: trocar pela arte COM o marcador leva a copy B regravada para o post, sem aviso', postT?.mediaUrls[0] === genJ.resultUrl && JSON.stringify(postT.slotValues ?? {}).includes('copy B regravada 3j') && !(tJ.avisos ?? []).some((a) => /re-renderizada/.test(a)), JSON.stringify({ slot: postT?.slotValues, avisos: tJ.avisos }).slice(0, 220))
      conferir('C6-03: trocar pela arte SEM o marcador deixa o post SEM cópia textual (nem a copy A, nem a da arte anterior) e avisa', postTSem?.mediaUrls[0] === genJSem.resultUrl && postTSem.slotValues === null && (tJSem.avisos ?? []).some((a) => /re-renderizada/.test(a)), JSON.stringify({ slot: postTSem?.slotValues, avisos: tJSem.avisos }).slice(0, 220))
      // Entregue: a agenda afirma a copy regravada da arte; sem o marcador, indisponível — nunca a copy A.
      await db.socialPost.update({ where: { id: agJ.postId }, data: { status: 'POSTED' } })
      await db.socialPost.update({ where: { id: agJSem.postId }, data: { status: 'POSTED' } })
      const agenda3j = await tool('ver-agenda', { projectId: PROJETO, from: dia3j, to: dia3j })
      const itens3j = (agenda3j.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const iJ = itens3j.find((i) => i.postId === agJ.postId), iJSem = itens3j.find((i) => i.postId === agJSem.postId)
      conferir('marcador + recusa, publicada: a agenda afirma a copy B regravada pela mídia (origem "arte", parcial)', !!iJ && mesmaSequenciaSemCaixa(iJ.textos, [`${MARCA} copy B regravada 3j`]) && iJ.textosOrigem === 'arte' && iJ.textosParciais === true, JSON.stringify({ textos: iJ?.textos, origem: iJ?.textosOrigem, parcial: iJ?.textosParciais }).slice(0, 220))
      conferir('controle (sem marcador + recusa), publicada: indisponível, sem a copy A — R13/R42 continuam de pé depois da recusa', !!iJSem && !('textos' in iJSem) && !!iJSem.textosIndisponiveis && !JSON.stringify(iJSem).includes('copy A sem marcador 3j'), JSON.stringify({ ind: iJSem?.textosIndisponiveis, textos: iJSem?.textos }).slice(0, 220))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3j.json'), JSON.stringify(agenda3j, null, 2))

      // R47 (oitava revisão final de 74afb769): a arte de modelo só afirma com o REGISTRO das camadas desenhadas. A de
      // `post-schedule` sem ele (a do serviço de post guarda slots e pageId, sem camadas) não pode ser lida pela página de
      // HOJE do modelo — em estado nenhum; e a com registro de OUTRA estrutura responde só pelo que o registro aplica.
      console.log('3i) arte de post-schedule SEM registro das camadas: a página atual do modelo não diz o que a mídia mostra — indisponível viva, publicada e no publicador (R47); com registro, só o que ele aplicou')
      const dia3i = somarDias(hoje, 11)
      const copyAtual3i = `${MARCA} só casa com a página atual 3i`
      const aplicada3i = `${MARCA} aplicada pelo registro 3i`, descartada3i = `${MARCA} descartada pelo render 3i`
      const urlSemReg = `${marcaUrl}/3i-sem-registro.png`, urlComReg = `${marcaUrl}/3i-com-registro.png`
      const genSemReg = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: urlSemReg, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, slotValues: { [chaveDoTexto]: copyAtual3i } } as never }, select: { id: true } })
      geracoes.push(genSemReg.id)
      // o registro é de OUTRA estrutura: a camada `r47-l1` chamada `r47-headline`; o slot pelo nome é descartado pelo render
      // e o slot pela chave da página de hoje não casa com camada nenhuma do registro
      const registro3i = [{ id: 'r47-l1', name: 'r47-headline', type: 'text', content: 'modelo antigo', visible: true, order: 1 }]
      const genComReg = await db.generation.create({ data: { projectId: PROJETO, templateId: paginaDoTemplate!.templateId, createdBy: projeto.userId, status: 'COMPLETED', resultUrl: urlComReg, fieldValues: { source: 'post-schedule', pageId: paginaComTexto[0].id, layersSnapshot: registro3i, slotValues: { 'r47-l1': aplicada3i, 'r47-headline': descartada3i, [chaveDoTexto]: copyAtual3i } } as never }, select: { id: true } })
      geracoes.push(genComReg.id)
      const base3i = { projectId: PROJETO, userId: projeto.userId, postType: 'STORY' as const, scheduleType: 'SCHEDULED' as const, publishType: 'REMINDER' as const, renderStatus: 'NOT_NEEDED' as const, pageId: null }
      const vivo3i = await db.socialPost.create({ data: { ...base3i, caption: `${MARCA} 3i vivo`, mediaUrls: [urlSemReg], scheduledDatetime: new Date(`${dia3i}T10:00:00-03:00`), status: 'DRAFT', generationId: genSemReg.id, slotValues: { [chaveDoTexto]: copyAtual3i } as never }, select: { id: true } })
      posts.push(vivo3i.id)
      const publicado3i = await db.socialPost.create({ data: { ...base3i, caption: `${MARCA} 3i publicado`, mediaUrls: [urlSemReg], scheduledDatetime: new Date(`${dia3i}T11:00:00-03:00`), status: 'POSTED', generationId: genSemReg.id, slotValues: { [chaveDoTexto]: copyAtual3i } as never }, select: { id: true } })
      posts.push(publicado3i.id)
      const publicador3i = await db.socialPost.create({ data: { ...base3i, postType: 'CAROUSEL', caption: `${MARCA} 3i carrossel no publicador`, mediaUrls: [urlSemReg, urlComReg], scheduledDatetime: new Date(`${dia3i}T12:00:00-03:00`), status: 'SCHEDULED', laterPostId: `prova-3i-${Date.now()}`, generationId: genSemReg.id }, select: { id: true } })
      posts.push(publicador3i.id)
      const agenda3i = await tool('ver-agenda', { projectId: PROJETO, from: dia3i, to: dia3i })
      const itens3i = (agenda3i.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts)
      const iV3i = itens3i.find((i) => i.postId === vivo3i.id), iP3i = itens3i.find((i) => i.postId === publicado3i.id), iK3i = itens3i.find((i) => i.postId === publicador3i.id)
      const semCopyAtual = (i: unknown) => !JSON.stringify(i).includes('só casa com a página atual 3i') && !JSON.stringify(i).includes('descartada pelo render 3i')
      conferir('R47: VIVO, a arte de modelo sem registro (com a página do modelo carregada) e a copy que o post herdou dela NÃO são afirmadas — `textosIndisponiveis`, sem a copy', !!iV3i && !('textos' in iV3i) && /sem registro das camadas/.test(iV3i.textosIndisponiveis ?? '') && semCopyAtual(iV3i), JSON.stringify({ ind: iV3i?.textosIndisponiveis, textos: iV3i?.textos }).slice(0, 260))
      conferir('R47: PUBLICADA, idem — indisponível, sem a copy herdada', !!iP3i && !('textos' in iP3i) && /sem registro das camadas/.test(iP3i.textosIndisponiveis ?? '') && semCopyAtual(iP3i), JSON.stringify({ ind: iP3i?.textosIndisponiveis, textos: iP3i?.textos }).slice(0, 260))
      const slides3i = (iK3i?.textosPorSlide as Array<{ textos: string[]; indisponiveis?: string; origem?: string }> | undefined) ?? []
      conferir('R47: carrossel NO PUBLICADOR — o slide sem registro declara; o com registro de outra estrutura devolve só o que o registro aplicou (id vence nome), nunca a copy que casaria com a página de hoje', !!iK3i && slides3i.length === 2 && slides3i[0].textos.length === 0 && /sem registro das camadas/.test(slides3i[0].indisponiveis ?? '') && mesmaSequenciaSemCaixa(slides3i[1].textos, [aplicada3i]) && slides3i[1].origem === 'arte' && mesmaSequenciaSemCaixa(iK3i.textos, [aplicada3i]) && iK3i.textosParciais === true && semCopyAtual(iK3i), JSON.stringify({ textos: iK3i?.textos, slides: slides3i }).slice(0, 300))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3i.json'), JSON.stringify(agenda3i, null, 2))

      // R15 (revisão de 3f784e1a): carrossel entregue sem slide confiável — a cópia da página no post NÃO prova o que foi ao ar.
      console.log('3e) carrossel PUBLICADO com cópia A no post, slide re-renderizado e slide sem arte: nada é afirmado — indisponível, slide a slide')
      const dia3e = somarDias(hoje, 8)
      const carrosselA = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} 3e carrossel`, mediaUrls: [`${marcaUrl}/re-render.png`, `${marcaUrl}/sem-arte.png`], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3e}T09:00:00-03:00`), status: 'POSTED', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', generationId: genReRender.id, slotValues: { [chaveDoTexto]: `${MARCA} cópia A da página`, _copiaDaPagina: true } as never },
        select: { id: true },
      })
      posts.push(carrosselA.id)
      const agenda3e = await tool('ver-agenda', { projectId: PROJETO, from: dia3e, to: dia3e })
      const i3e = (agenda3e.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts).find((i) => i.postId === carrosselA.id)
      conferir('R15: nem "cópia A" nem "texto A antigo" aparecem; `textosIndisponiveis` declara o carrossel e `textosPorSlide` diz o porquê de cada mídia', !!i3e && !('textos' in i3e) && /carrossel já entregue/.test(i3e.textosIndisponiveis ?? '') && Array.isArray(i3e.textosPorSlide) && i3e.textosPorSlide.length === 2 && i3e.textosPorSlide.every((sl: any) => sl.textos.length === 0 && typeof sl.indisponiveis === 'string') && !JSON.stringify(i3e).includes('cópia A') && !JSON.stringify(i3e).includes('texto A antigo'), JSON.stringify({ indisponiveis: i3e?.textosIndisponiveis?.slice(0, 60), slides: i3e?.textosPorSlide?.map((sl: any) => sl.indisponiveis?.slice(0, 40)) }))
      writeFileSync(resolve(SAIDA, 'ver-agenda-3e.json'), JSON.stringify(agenda3e, null, 2))
      // R20: o mesmo carrossel EDITÁVEL (rascunho), com copy no post — nada é afirmado; declaração por slide.
      const carrosselVivo = await db.socialPost.create({
        data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} 3e carrossel vivo`, mediaUrls: [`${marcaUrl}/re-render.png`, `${marcaUrl}/sem-arte.png`], scheduleType: 'SCHEDULED', scheduledDatetime: new Date(`${dia3e}T10:00:00-03:00`), status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED', slotValues: { [chaveDoTexto]: `${MARCA} copy solta no post` } as never },
        select: { id: true },
      })
      posts.push(carrosselVivo.id)
      const agenda3eVivo = await tool('ver-agenda', { projectId: PROJETO, from: dia3e, to: dia3e })
      const i3eVivo = (agenda3eVivo.dias as Array<{ posts: Array<Record<string, any>> }>).flatMap((d) => d.posts).find((i) => i.postId === carrosselVivo.id)
      conferir('R20: carrossel EDITÁVEL sem slide legível (arte re-renderizada sem página + mídia sem arte): `textosIndisponiveis` + `textosPorSlide`, e a copy do post NÃO é apresentada como cobertura', !!i3eVivo && !('textos' in i3eVivo) && /carrossel sem página legível/.test(i3eVivo.textosIndisponiveis ?? '') && Array.isArray(i3eVivo.textosPorSlide) && i3eVivo.textosPorSlide.length === 2 && !JSON.stringify(i3eVivo).includes('copy solta'), JSON.stringify({ indisponiveis: i3eVivo?.textosIndisponiveis?.slice(0, 60), slides: i3eVivo?.textosPorSlide?.length }))
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
    const e5 = await (async () => { try { await tool('consultar-base', { projectId: PROJETO, em: '2026-02-31' }); return null } catch (e) { return e instanceof Error ? e.message : String(e) } })()
    conferir('dia que NÃO existe (2026-02-31) em `em` é recusado, não normalizado para março (R7)', !!e5 && /Data inválida/.test(e5), String(e5).slice(0, 80))

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
      const r5 = await buscarNoAcervo({ projectId: PROJETO, limit: 3, registrarSugestao: false, evitarUsadasDesde: '2026-02-31' })
      conferir('dia que NÃO existe em evitarUsadasDesde não exclui nada e vira aviso (R7)', r5.total === r1.total && (r5.avisos ?? []).some((a) => /evitarUsadasDesde ignorado/.test(a)), JSON.stringify(r5.avisos))

      // R2 (revisão de 619e7877): a exclusão entra na identidade da proposta registrada.
      console.log('5b) a proposta de fotos COM exclusão é outra proposta; a mesma exclusão em outra ordem é a mesma')
      const pasta = r1.images[0].folder
      const p1 = await tool('buscar-fotos', { projectId: PROJETO, limit: 3, folder: pasta })
      if (typeof p1.sugestaoId === 'string') sinaisDaProva.add(p1.sugestaoId) // R43: coletado antes do próximo await
      const p2 = await tool('buscar-fotos', { projectId: PROJETO, limit: 3, folder: pasta, excluir: [escolhida, 'id-que-nao-existe'] })
      if (typeof p2.sugestaoId === 'string') sinaisDaProva.add(p2.sugestaoId)
      const p3 = await tool('buscar-fotos', { projectId: PROJETO, limit: 3, folder: pasta, excluir: ['id-que-nao-existe', ` ${escolhida} `] })
      if (typeof p3.sugestaoId === 'string') sinaisDaProva.add(p3.sugestaoId)
      const sinalP2 = p2.sugestaoId ? await db.learningSignal.findUnique({ where: { id: p2.sugestaoId }, select: { sugerido: true, createdAt: true } }) : null
      const criteriosP2 = (sinalP2?.sugerido as { criterios?: { excluir?: string[] } } | null)?.criterios
      conferir('com exclusão a proposta é OUTRA (sugestaoId diferente) e o topo registrado já não é a foto excluída', typeof p1.sugestaoId === 'string' && typeof p2.sugestaoId === 'string' && p1.sugestaoId !== p2.sugestaoId && p2.propostaTopo !== escolhida && p2.propostaTopo !== p1.propostaTopo, JSON.stringify({ p1: p1.sugestaoId, p2: p2.sugestaoId, topo1: p1.propostaTopo, topo2: p2.propostaTopo }))
      conferir('a mesma exclusão em outra ordem (e com espaço) REUTILIZA a proposta; os critérios registrados trazem `excluir` normalizado', p3.sugestaoId === p2.sugestaoId && JSON.stringify(criteriosP2?.excluir) === JSON.stringify([escolhida, 'id-que-nao-existe'].sort()) && !!sinalP2, JSON.stringify({ p3: p3.sugestaoId, excluir: criteriosP2?.excluir }))

      // R21 (revisão de 941d8e77): com corte por uso, um uso novo no meio do dia muda a lista vista — e a proposta.
      console.log('5c) a proposta com evitarUsadasDesde muda quando uma foto do topo é usada no meio do dia; sem mudança, reutiliza')
      const desde = somarDias(hoje, -30)
      const u1 = await tool('buscar-fotos', { projectId: PROJETO, limit: 3, folder: pasta, evitarUsadasDesde: desde })
      const topoU1 = u1.propostaTopo as string | null
      if (typeof u1.sugestaoId === 'string') sinaisDaProva.add(u1.sugestaoId)
      if (topoU1) {
        const uso = await db.photoUsage.create({ data: { projectId: PROJETO, driveFileId: topoU1, origem: 'prova-pr6', tema: MARCA }, select: { id: true } })
        usosDaProva.push(uso.id)
        const u2 = await tool('buscar-fotos', { projectId: PROJETO, limit: 3, folder: pasta, evitarUsadasDesde: desde })
        if (typeof u2.sugestaoId === 'string') sinaisDaProva.add(u2.sugestaoId) // R43
        const u3 = await tool('buscar-fotos', { projectId: PROJETO, limit: 3, folder: pasta, evitarUsadasDesde: desde })
        if (typeof u3.sugestaoId === 'string') sinaisDaProva.add(u3.sugestaoId)
        conferir('depois do uso do topo, a MESMA busca registra OUTRA proposta (id novo), com o topo seguinte — e a busca seguinte reutiliza essa', typeof u1.sugestaoId === 'string' && typeof u2.sugestaoId === 'string' && u2.sugestaoId !== u1.sugestaoId && u2.propostaTopo !== topoU1 && u3.sugestaoId === u2.sugestaoId && (u2 as any).excluidas?.porUso >= 1, JSON.stringify({ u1: [u1.sugestaoId, topoU1], u2: [u2.sugestaoId, u2.propostaTopo], u3: u3.sugestaoId, porUso: (u2 as any).excluidas?.porUso }))
      } else {
        conferir('a busca com evitarUsadasDesde não devolveu topo para exercitar R21 (pasta sem foto nunca usada?)', false, JSON.stringify({ total: u1.total }))
      }
    }
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou)')
    // R48 (oitava revisão final de 74afb769): cada exclusão num passo protegido e independente — a falha de uma não
    // pula as outras, e cada falha entra no placar (saída ≠ 0). As Generations do isolamento entre projetos e as das
    // seções 3c–3i vão no MESMO passo; antes a primeira exclusão estava fora da proteção e derrubava o cleanup inteiro.
    const { apagados, falhas } = await limparRodada(db as unknown as BancoDaLimpeza, {
      projeto: PROJETO,
      marca: MARCA,
      inicio: inicioDaProva,
      posts,
      geracoes: [...generationsDaProva, ...geracoes],
      entradas,
      usos: usosDaProva,
      sinais: [...sinaisDaProva],
      sinaisDeSlot: [...sinaisDeSlotDaProva],
    })
    if (falhas.length) {
      console.error('  ✗ cleanup incompleto:', falhas.join(' | '))
      mau += falhas.length
    } else console.log('  apagados:', JSON.stringify(apagados))
    try {
      writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ ...registro, pendentes, ok, falhas: mau, apagados, falhasDoCleanup: falhas }, null, 2))
    } catch (e) {
      console.error('  ✗ resultado.json não foi gravado:', e instanceof Error ? e.message : e)
      mau++
    }
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect().catch(() => {})
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
