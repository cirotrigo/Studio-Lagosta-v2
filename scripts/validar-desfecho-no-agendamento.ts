/**
 * Prova a TERCEIRA superfície do desfecho de copy: AGENDAR um post nascido de
 * item de plano fecha a dica em vez de abrir uma linha paralela de
 * `escolha-propria`. É o ponto de maior volume dos três — todo post que entra
 * na agenda passa por `registrarCopyDoPost`.
 *
 * ⚠️ A Generation de teste precisa carregar a copy em `fieldValues.slotValues`:
 * sem ela, `agendarPost` resolve `copyFinal` como nulo e `registrarCopyDoPost`
 * sai na primeira linha — o teste passaria sem exercitar nada. Foi o que
 * aconteceu na primeira tentativa.
 *
 * Protocolo da casa: projeto 8, REMINDER, +7 dias, cleanup completo, guard por
 * COMPUTE contra produção.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ID = 8

function computeDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}
function garantirDev(): void {
  const atual = computeDe(process.env.DATABASE_URL)
  if (!atual) { console.error('DATABASE_URL inválida'); process.exit(1) }
  const env = resolve(process.cwd(), '.env')
  if (!existsSync(env)) return
  for (const l of readFileSync(env, 'utf8').split('\n')) {
    const m = l.trim().match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/)
    if (!m) continue
    if (computeDe(m[2].trim().replace(/^["']|["']$/g, '')) === atual) {
      console.error(`\n🔴 RECUSADO: ${atual} é PRODUÇÃO.\n`); process.exit(1)
    }
  }
}

let ok = 0, mau = 0
const conferir = (c: boolean, o: string, d = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${o}${d ? ` — ${d}` : ''}`); c ? ok++ : mau++
}

async function main() {
  garantirDev()
  console.log(`banco: ${computeDe(process.env.DATABASE_URL)} (dev)\n`)

  const { db } = await import('@/lib/db')
  const { criarPlano } = await import('@/lib/planos/plano-service')
  const { registrarDicasDeCopy, ancoraDaDica } = await import('@/lib/aprendizado/sinal-de-copy-do-plano')
  const { agendarPost } = await import('@/lib/creatives/agendar')
  const { VERSAO_DA_DICA } = await import('@/lib/planos/dica-de-copy')

  const proj = await db.project.findUnique({ where: { id: PROJECT_ID }, select: { userId: true } })
  if (!proj) throw new Error('projeto 8 não existe')

  const sinaisAntes = new Set(
    (await db.learningSignal.findMany({ where: { projectId: PROJECT_ID }, select: { id: true } })).map(s => s.id),
  )

  const daquiA = (d: number, h: string) => {
    const x = new Date(Date.now() + d * 86_400_000)
    return `${x.toISOString().slice(0, 10)} ${h}`
  }

  let planoId: string | null = null
  const posts: string[] = []
  const gens: string[] = []
  let erro: unknown = null

  try {
    console.log('1) plano com dica de copy registrada (como propor-semana faz)')
    const { plano } = await criarPlano({
      projectId: PROJECT_ID, titulo: '[demo-3a] leva', inicio: daquiA(7, '00:00'), fim: daquiA(9, '23:59'),
      origem: 'propor-semana', versao: 'demo',
      itens: [{ ordem: 0, quando: daquiA(7, '19:00'), tema: 'happy hour', formato: 'story',
        via: 'ia', copyProposta: ['SEXTA É HAPPY HOUR', 'chopp em dobro'] }],
    })
    planoId = plano.id
    const item = plano.itens[0]

    // A arte que o item produziu.
    const gen = await db.generation.create({
      data: { projectId: PROJECT_ID, templateId: (await db.template.findFirst({ where: { projectId: PROJECT_ID }, select: { id: true } }))!.id,
              status: 'COMPLETED', createdBy: proj.userId, resultUrl: 'https://example.invalid/demo-3a.png', fieldValues: { source: 'demo-3a', slotValues: { bloco1: 'SEXTA É HAPPY HOUR', bloco2: 'chopp em dobro' } } },
      select: { id: true },
    })
    gens.push(gen.id)
    await db.itemDePlano.update({ where: { id: item.id }, data: { generationId: gen.id } })

    await registrarDicasDeCopy({
      projectId: PROJECT_ID, servico: 'propor-semana', versao: VERSAO_DA_DICA,
      dicas: [{ ancora: ancoraDaDica(item)!, blocos: item.copyProposta, legenda: null }],
    })
    const emitidas = await db.learningSignal.count({
      where: { projectId: PROJECT_ID, tipo: 'copy', sugeridoEm: { not: null }, id: { notIn: [...sinaisAntes] } },
    })
    conferir(emitidas === 1, 'a dica de copy foi EMITIDA como proposta', `${emitidas} linha(s)`)

    console.log('\n2) agendar o post — o ponto de maior volume')
    const post = await agendarPost({
      projectId: PROJECT_ID, generationId: gen.id, scheduledDatetime: daquiA(7, '19:00'),
      situacao: 'rascunho', postType: 'STORY', superficie: 'bancada',
    })
    posts.push(post.postId)
    await db.socialPost.update({ where: { id: post.postId }, data: { publishType: 'REMINDER' } })
    // A transição do item não faz parte da prova: quem fecha a dica é o
    // agendarPost acima, e ela acontece antes de o item saber do post.

    const copySignals = await db.learningSignal.findMany({
      where: { projectId: PROJECT_ID, tipo: 'copy', id: { notIn: [...sinaisAntes] } },
      select: { id: true, sugeridoEm: true, desfecho: true },
    })
    conferir(copySignals.length === 1, '🔴 UMA linha de copy, não duas', `${copySignals.length} linha(s)`)
    conferir(!!copySignals[0]?.sugeridoEm, 'a linha continua sendo a PROPOSTA (tem sugeridoEm)')
    conferir(
      copySignals[0]?.desfecho === 'aceita-como-veio' || copySignals[0]?.desfecho === 'editada',
      'ela ganhou DESFECHO em vez de virar escolha-propria',
      String(copySignals[0]?.desfecho),
    )
    conferir(
      copySignals.every((s) => s.desfecho !== 'escolha-propria'),
      'nenhuma linha de escolha-propria foi aberta',
    )

    console.log(`\n${mau === 0 ? '✅' : '❌'} ${ok} conferências ok, ${mau} falharam`)
  } catch (e) {
    erro = e
    console.error('\n✗ ERRO:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    if (e instanceof Error && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  } finally {
    console.log('\ncleanup:')
    for (const id of posts) {
      await db.postLog.deleteMany({ where: { postId: id } })
      await db.socialPost.delete({ where: { id } }).catch(() => {})
    }
    if (planoId) await db.planoDeConteudo.delete({ where: { id: planoId } }).catch(() => {})
    for (const g of gens) await db.generation.delete({ where: { id: g } }).catch(() => {})
    const novos = (await db.learningSignal.findMany({ where: { projectId: PROJECT_ID }, select: { id: true } }))
      .map((s) => s.id).filter((id) => !sinaisAntes.has(id))
    if (novos.length) await db.learningSignal.deleteMany({ where: { id: { in: novos } } })
    console.log('  ', JSON.stringify({
      planos: await db.planoDeConteudo.count({ where: { titulo: { startsWith: '[demo-3a]' } } }),
      sinaisRemovidos: novos.length,
    }))
    await db.$disconnect()
    process.exit(mau === 0 && !erro ? 0 : 1)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
