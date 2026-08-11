/**
 * O KPI do aprendizado por uso — a medição que a fase F4 usa para decidir se a
 * autonomia do sistema pode subir.
 *
 * Existe para ser rodado **depois das 3 semanas de acúmulo** (a captura começou
 * em 11/08/2026), e é somente LEITURA: não decide nada, não escreve nada. Quem
 * decide é gente, olhando estes números.
 *
 * ── AS DUAS REGRAS QUE O PLANO IMPÔS, E QUE ESTE SCRIPT OBEDECE ────────────
 *
 * 1. 🔴 **O denominador é TODA sugestão EMITIDA**, não as que alguém respondeu.
 *    É por isso que a captura grava a proposta no momento em que ela aparece na
 *    tela, e não quando é aceita: sem isso a proposta ignorada some e a taxa de
 *    aceitação vale 100% por construção. Proposta que ninguém decidiu conta
 *    como `pendente` aqui e vira `expirada` no cron diário — em nenhum dos dois
 *    casos ela sai do denominador.
 *
 * 2. 🔴 **Aceitação sozinha NÃO autoriza subir autonomia.** Uma sugestão
 *    insossa é fácil de aceitar; um KPI que só olha aceitação premia
 *    exatamente isso. Por isso a segunda tabela: o desempenho das publicações
 *    que NASCERAM de sugestão contra as de escolha própria. A autonomia sobe
 *    quando as duas seguram.
 *
 * ── O QUE FICA DE FORA, E POR QUÊ ─────────────────────────────────────────
 * Só itens de escopo ROTINA entram na conta de aceitação: CAMPANHA vale para a
 * próxima edição daquela campanha e PONTUAL não ensina nada, então misturá-los
 * mediria outra coisa. `escolha-propria` é decisão SEM sugestão — fica fora do
 * denominador por construção, e é contada à parte porque o volume dela é o
 * retrato de quanto o sistema ainda não é consultado.
 *
 * USO
 *   npx tsx scripts/kpi-aprendizado.ts
 *   npx tsx scripts/kpi-aprendizado.ts --dias 21
 *   npx tsx scripts/kpi-aprendizado.ts --json
 */
import { db } from '../src/lib/db'

const DIAS_PADRAO = 21

/** Desfechos que contam como "a proposta serviu". */
const ACEITOS = new Set(['aceita-como-veio'])
/** Serviu depois de ajuste — vale menos, mas não é recusa. */
const APROVEITADOS = new Set(['aceita-como-veio', 'editada'])
/** Recusas explícitas. */
const RECUSADOS = new Set(['trocada', 'descartada'])

interface LinhaDeTipo {
  tipo: string
  emitidas: number
  aceitas: number
  editadas: number
  recusadas: number
  expiradas: number
  pendentes: number
  /** aceitas / emitidas */
  taxaDeAceite: number
  /** (aceitas + editadas) / emitidas */
  aproveitamento: number
}

function pct(v: number): string {
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—'
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOut = args.includes('--json')
  const iDias = args.indexOf('--dias')
  const dias = iDias >= 0 ? Number(args[iDias + 1]) || DIAS_PADRAO : DIAS_PADRAO
  const desde = new Date(Date.now() - dias * 24 * 3600_000)

  // ── 1. O funil das sugestões ──────────────────────────────────────────────
  //
  // Só linhas COM `sugeridoEm`: são as que o sistema propôs. Linha sem
  // sugestão é decisão absoluta e mora na seção 3.
  const sinais = await db.learningSignal.findMany({
    where: { sugeridoEm: { gte: desde, not: null } },
    select: { projectId: true, tipo: true, desfecho: true, postId: true },
    take: 100_000,
  })

  // Escopo do post ligado ao sinal — só ROTINA entra na conta.
  const postIds = [...new Set(sinais.map((s) => s.postId).filter(Boolean))] as string[]
  const posts = postIds.length
    ? await db.socialPost.findMany({
        where: { id: { in: postIds } },
        select: { id: true, learningScope: true },
      })
    : []
  const escopoDe = new Map(posts.map((p) => [p.id, p.learningScope]))

  const foraDeRotina = sinais.filter(
    (s) => s.postId && escopoDe.get(s.postId) && escopoDe.get(s.postId) !== 'ROTINA',
  ).length
  const deRotina = sinais.filter(
    (s) => !s.postId || !escopoDe.get(s.postId) || escopoDe.get(s.postId) === 'ROTINA',
  )

  const porTipo = new Map<string, LinhaDeTipo>()
  for (const s of deRotina) {
    const l =
      porTipo.get(s.tipo) ??
      ({ tipo: s.tipo, emitidas: 0, aceitas: 0, editadas: 0, recusadas: 0, expiradas: 0, pendentes: 0, taxaDeAceite: 0, aproveitamento: 0 } as LinhaDeTipo)
    l.emitidas += 1
    if (!s.desfecho) l.pendentes += 1
    else if (s.desfecho === 'expirada') l.expiradas += 1
    else if (ACEITOS.has(s.desfecho)) l.aceitas += 1
    else if (s.desfecho === 'editada') l.editadas += 1
    else if (RECUSADOS.has(s.desfecho)) l.recusadas += 1
    porTipo.set(s.tipo, l)
  }
  for (const l of porTipo.values()) {
    l.taxaDeAceite = l.emitidas > 0 ? l.aceitas / l.emitidas : NaN
    l.aproveitamento = l.emitidas > 0 ? (l.aceitas + l.editadas) / l.emitidas : NaN
  }

  // ── 2. O contrapeso: desempenho por ORIGEM ────────────────────────────────
  //
  // 🔴 As métricas de story moram no PRÓPRIO `SocialPost`
  // (`analyticsReach`/`analyticsImpressions`/`analyticsFetchedAt`), gravadas
  // pelo cron `fetch-story-insights`. NÃO use o model `InstagramStory`: ele
  // existe no schema, tem `mediaId` e parece o lugar certo — e está VAZIO
  // (0 linhas em 11/08/2026, contra 297 posts com métrica). Foi essa junção
  // errada que fez a primeira versão deste script devolver zero.
  //
  // Insight de story só existe nas 24h em que ele está no ar: post antigo
  // simplesmente não tem, e a cobertura é relatada junto para ninguém ler
  // média de amostra minúscula como se fosse veredito.
  const publicados = await db.socialPost.findMany({
    where: { status: 'POSTED', scheduledDatetime: { gte: desde }, learningScope: 'ROTINA' },
    select: { origem: true, analyticsReach: true, analyticsImpressions: true, analyticsFetchedAt: true },
    take: 20_000,
  })

  const desempenho = new Map<string, { posts: number; comMetrica: number; somaReach: number }>()
  for (const p of publicados) {
    const chave = p.origem
      ? p.origem.startsWith('sugerido')
        ? 'de sugestão'
        : 'escolha própria'
      : 'escolha própria'
    const d = desempenho.get(chave) ?? { posts: 0, comMetrica: 0, somaReach: 0 }
    d.posts += 1
    const alcance = p.analyticsReach || p.analyticsImpressions || 0
    if (p.analyticsFetchedAt && alcance > 0) {
      d.comMetrica += 1
      d.somaReach += alcance
    }
    desempenho.set(chave, d)
  }

  // ── 3. Decisões SEM sugestão ──────────────────────────────────────────────
  const absolutas = await db.learningSignal.count({
    where: { sugeridoEm: null, createdAt: { gte: desde } },
  })

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          dias,
          geradoEm: new Date().toISOString(),
          sugestoes: [...porTipo.values()],
          foraDeRotina,
          desempenho: [...desempenho.entries()].map(([origem, d]) => ({ origem, ...d })),
          decisoesSemSugestao: absolutas,
        },
        null,
        2,
      ),
    )
    await db.$disconnect()
    return
  }

  console.log(`\nKPI do aprendizado — últimos ${dias} dias (só escopo ROTINA)\n`)

  if (porTipo.size === 0) {
    console.log('  Nenhuma sugestão emitida no período. Nada a medir ainda.\n')
  } else {
    console.log(
      'tipo'.padEnd(10) + 'emitidas'.padStart(9) + 'aceitas'.padStart(9) + 'editadas'.padStart(9) +
        'recusadas'.padStart(10) + 'expirad.'.padStart(9) + 'pend.'.padStart(7) + '  aceite  aproveit.',
    )
    console.log('─'.repeat(84))
    for (const l of [...porTipo.values()].sort((a, b) => b.emitidas - a.emitidas)) {
      console.log(
        l.tipo.padEnd(10) + String(l.emitidas).padStart(9) + String(l.aceitas).padStart(9) +
          String(l.editadas).padStart(9) + String(l.recusadas).padStart(10) +
          String(l.expiradas).padStart(9) + String(l.pendentes).padStart(7) +
          pct(l.taxaDeAceite).padStart(8) + pct(l.aproveitamento).padStart(11),
      )
    }
    if (foraDeRotina > 0) {
      console.log(`\n  (${foraDeRotina} sinal(is) de campanha/pontual ficaram de fora, de propósito)`)
    }
  }

  console.log('\n\nCONTRAPESO — desempenho do que foi publicado, por origem\n')
  const linhas = [...desempenho.entries()]
  if (linhas.length === 0) {
    console.log('  Nada publicado no período.')
  } else {
    console.log('origem'.padEnd(18) + 'posts'.padStart(7) + 'c/ métrica'.padStart(12) + 'alcance médio'.padStart(15))
    console.log('─'.repeat(52))
    for (const [origem, d] of linhas) {
      const media = d.comMetrica > 0 ? Math.round(d.somaReach / d.comMetrica) : null
      console.log(
        origem.padEnd(18) + String(d.posts).padStart(7) + String(d.comMetrica).padStart(12) +
          (media === null ? '—' : String(media)).padStart(15),
      )
    }
    const semMetrica = linhas.reduce((t, [, d]) => t + (d.posts - d.comMetrica), 0)
    if (semMetrica > 0) {
      console.log(
        `\n  ⚠️ ${semMetrica} post(s) sem métrica. Insight de story só existe nas 24h em que` +
          ' ele está no ar — post mais antigo que a coleta não tem, e não há como recuperar.' +
          ' Amostra pequena não é veredito.',
      )
    }
  }

  console.log(`\n\nDecisões SEM sugestão no período: ${absolutas}`)
  console.log('  (o sistema não propôs — é o retrato de quanto ele ainda não é consultado)')

  console.log(
    '\n\nCOMO LER: aceitação sozinha NÃO autoriza subir autonomia — sugestão insossa\n' +
      'é fácil de aceitar. A autonomia sobe quando o aceite segura E o desempenho de\n' +
      'quem nasceu de sugestão não fica atrás de quem nasceu de escolha própria.\n' +
      'Proposta pendente e expirada continuam no denominador de propósito.\n',
  )

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
