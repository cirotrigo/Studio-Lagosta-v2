/**
 * E2E das tools de gestão de agenda (01/08/2026): ver-agenda humanizado,
 * sugerir-posts (cadência do By Rock real), editar-post (rascunho + recusas)
 * e os gates do postar-agora — SEM publicar nada (o happy path do postar-agora
 * é o agendarPost já validado; aqui só o gate de conta ausente).
 *
 * Cleanup completo. Uso: npx dotenv-cli -e .env -- npx tsx scripts/.tmp-test-agenda-plus.ts
 */
import { db } from '@/lib/db'
import { runMcpTool } from '@/lib/mcp/tools'
import { sugerirPosts } from '@/lib/posts/sugerir-posts'
import { postarAgora } from '@/lib/creatives/agendar'

const BYROCK = 7
const service = { kind: 'service' as const }

let falhas = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? '  ✓' : '  ✗ FALHOU'} — ${label}`)
  if (!cond) falhas++
}
function parse(result: { isError?: boolean; content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((c) => c.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(`tool falhou: ${text}`)
  return JSON.parse(text)
}

async function main() {
  const postsCriados: string[] = []
  try {
    // ── ver-agenda humanizado ───────────────────────────────────────────────
    console.log('\n[1] ver-agenda')
    const agenda = parse(await runMcpTool('ver-agenda', { projectId: BYROCK }, service))
    check(typeof agenda.total === 'number' && Array.isArray(agenda.dias), `responde agrupado (${agenda.total} posts em ${agenda.dias.length} dias)`)
    const umPost = agenda.dias[0]?.posts?.[0]
    if (umPost) {
      console.log('    exemplo:', JSON.stringify(umPost).slice(0, 220))
      check(['rascunho', 'agendado', 'publicado', 'falhou', 'publicando'].includes(umPost.situacao), `situacao em PT: ${umPost.situacao}`)
      check(/^\d{2}:\d{2}$/.test(umPost.hora), `hora BRT: ${umPost.hora}`)
      check(typeof agenda.dias[0].diaSemana === 'string', `diaSemana: ${agenda.dias[0].diaSemana}`)
      check('capa' in umPost, 'capa presente')
    }
    const soRascunhos = parse(await runMcpTool('ver-agenda', { projectId: BYROCK, situacao: 'rascunho' }, service))
    check(soRascunhos.dias.every((d: any) => d.posts.every((p: any) => p.situacao === 'rascunho')), `filtro situacao=rascunho (${soRascunhos.total})`)

    // ── sugerir-posts (cadência real do By Rock) ────────────────────────────
    console.log('\n[2] sugerir-posts')
    const sug = parse(await runMcpTool('sugerir-posts', { projectId: BYROCK, dias: 7 }, service))
    console.log(`    histórico: ${sug.postsNoHistorico} posts | cadência: ${JSON.stringify(sug.cadencia).slice(0, 260)}`)
    check(sug.postsNoHistorico > 0, 'leu histórico')
    check(Array.isArray(sug.cadencia) && sug.cadencia.length > 0, `cadência detectada para ${sug.cadencia.length} dias da semana`)
    check(Array.isArray(sug.sugestoes), `${sug.sugestoes.length} sugestões`)
    for (const s of sug.sugestoes.slice(0, 4)) {
      console.log(`    → ${s.diaSemana} ${s.data} ${s.hora} | ${s.motivo}${s.modeloSugerido ? ` | modelo: ${s.modeloSugerido.template}` : ''}${s.campanhasDoDia ? ` | campanhas: ${s.campanhasDoDia.join('; ')}` : ''}`)
    }
    const todasFuturas = sug.sugestoes.every((s: any) => new Date(`${s.data}T${s.hora}:00-03:00`).getTime() > Date.now())
    check(todasFuturas, 'todas as sugestões são futuras')
    const quinta = sug.sugestoes.find((s: any) => s.diaSemana === 'quinta')
    if (quinta) {
      check(Array.isArray(quinta.campanhasDoDia) && quinta.campanhasDoDia.some((c: string) => /vinho/i.test(c)), `quinta puxou a campanha do dia: ${JSON.stringify(quinta.campanhasDoDia)}`)
    }

    // ── editar-post ─────────────────────────────────────────────────────────
    console.log('\n[3] editar-post')
    const rascunho = parse(await runMcpTool('colocar-na-agenda', {
      projectId: BYROCK,
      postType: 'STORY',
      caption: 'E2E agenda — apagar',
      scheduledDatetime: '2026-08-09 15:00',
      mediaUrls: ['https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1p01BBwHdWmZ4D8F_lCSPr-2IVKrquiKI-s1920.jpg'],
    }, service))
    postsCriados.push(rascunho.postId)
    check(rascunho.situacao === 'rascunho', 'rascunho de teste criado')

    const editado = parse(await runMcpTool('editar-post', {
      projectId: BYROCK, postId: rascunho.postId, caption: 'Legenda editada pelo E2E',
    }, service))
    check(editado.editado === true && editado.legenda === 'Legenda editada pelo E2E', 'legenda editada')

    const semNada = await runMcpTool('editar-post', { projectId: BYROCK, postId: rascunho.postId }, service)
    check(semNada.isError === true, 'sem campos → recusa')

    // agendado recusa edição (usa um SCHEDULED real da agenda, sem tocar nele)
    const agendado = await db.socialPost.findFirst({ where: { projectId: BYROCK, status: 'SCHEDULED' }, select: { id: true } })
    if (agendado) {
      const recusa = await runMcpTool('editar-post', { projectId: BYROCK, postId: agendado.id, caption: 'x' }, service)
      const texto = recusa.content[0].text ?? ''
      check(recusa.isError === true && texto.includes('voltar-para-rascunho'), 'agendado → recusa apontando o caminho')
    }

    // ── postar-agora: gate sem conta do Instagram ───────────────────────────
    console.log('\n[4] postar-agora (gates, sem publicar)')
    const semConta = await db.project.findFirst({ where: { instagramAccountId: null, status: 'ACTIVE' }, select: { id: true, name: true } })
    if (semConta) {
      try {
        await postarAgora({ projectId: semConta.id, mediaUrls: ['https://example.com/x.jpg'] })
        check(false, 'deveria recusar projeto sem conta')
      } catch (e: any) {
        check(e?.code === 'SEM_CONTA_INSTAGRAM', `projeto sem conta recusado (${semConta.name}: ${e?.code})`)
      }
    } else {
      console.log('    (todos os projetos têm conta — gate coberto pelo agendarPost; pulado)')
    }
  } finally {
    console.log('\n[cleanup]')
    if (postsCriados.length) {
      const del = await db.socialPost.deleteMany({ where: { id: { in: postsCriados } } })
      console.log(`  posts de teste apagados: ${del.count}`)
    }
    await db.$disconnect()
  }
  console.log(falhas === 0 ? '\n✅ E2E passou' : `\n❌ E2E com ${falhas} falha(s)`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
