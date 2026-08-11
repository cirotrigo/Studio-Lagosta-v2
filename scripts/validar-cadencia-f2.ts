/**
 * Comparação ANTES/DEPOIS da cadência (F2), contra os dados REAIS de produção.
 *
 * ⚠️ **Somente leitura.** Não grava nada, nem sinal de aprendizado — por isso
 * ele reimplementa a heurística v1 aqui dentro e chama o módulo puro
 * `src/lib/posts/cadencia.ts` para a v2, em vez de invocar `sugerirPosts`
 * (que REGISTRA cada slot emitido como `LearningSignal`). Rodar uma validação
 * não pode sujar o corpus que a validação está medindo.
 *
 * Três cenários por projeto:
 *
 *   v1              — o que está no ar hoje: contagem crua, POSTED + SCHEDULED,
 *                     campanha valendo como rotina;
 *   v2              — peso por recência, só POSTED, desconto de auto-reforço;
 *   v2 + campanha   — o mesmo, com os posts do burst marcados como CAMPANHA em
 *                     MEMÓRIA (simula o clique de confirmação do Ciro, sem
 *                     escrever no banco).
 *
 * O terceiro cenário é o que responde à pergunta da tarefa: os horários
 * herdados de uma campanha caem quando a campanha é reconhecida?
 *
 * USO
 *   npx tsx scripts/validar-cadencia-f2.ts            # Wine Vix
 *   npx tsx scripts/validar-cadencia-f2.ts 11 7 6
 *   npx tsx scripts/validar-cadencia-f2.ts --termo "festival italiano"
 */
import { PrismaClient } from '../prisma/generated/client'
import {
  calcularCadencia,
  DIAS_SEMANA_CADENCIA,
  emBRT,
  horaLabel,
  BLOCO_MIN,
  type PostDoHistorico,
} from '../src/lib/posts/cadencia'

const db = new PrismaClient()

const JANELA = 56
const PROJETOS = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
const termoIndice = process.argv.indexOf('--termo')
const TERMO = termoIndice >= 0 ? (process.argv[termoIndice + 1] ?? '').toLowerCase() : 'festival italiano'

/** A heurística que está no ar hoje, reimplementada para servir de linha de base. */
function cadenciaV1(posts: Array<{ quando: Date }>) {
  const porDia = new Map<number, { blocos: Map<number, number>; datas: Set<string> }>()
  for (const p of posts) {
    const { dia, minutos, dataISO } = emBRT(p.quando)
    const cur = porDia.get(dia) ?? { blocos: new Map<number, number>(), datas: new Set<string>() }
    const bloco = Math.round(minutos / BLOCO_MIN) * BLOCO_MIN
    cur.blocos.set(bloco, (cur.blocos.get(bloco) ?? 0) + 1)
    cur.datas.add(dataISO)
    porDia.set(dia, cur)
  }
  const semanas = Math.max(1, Math.round(JANELA / 7))
  const saida = new Map<number, Array<{ hora: string; ocorrencias: number }>>()
  const porSemana = new Map<number, number>()
  for (const [dia, info] of porDia) {
    const minimo = Math.max(2, Math.ceil(info.datas.size / 2))
    const tipicos = [...info.blocos.entries()]
      .filter(([, n]) => n >= minimo)
      .sort((a, b) => a[0] - b[0])
      .map(([m, n]) => ({ hora: horaLabel(m), ocorrencias: n }))
    if (tipicos.length > 0) saida.set(dia, tipicos)
    porSemana.set(dia, Math.round(([...info.blocos.values()].reduce((a, b) => a + b, 0) / semanas) * 10) / 10)
  }
  return { slots: saida, porSemana }
}

function horariosDe(slots: Map<number, Array<{ hora: string }>>): Set<string> {
  const out = new Set<string>()
  for (const [dia, lista] of slots) for (const s of lista) out.add(`${DIAS_SEMANA_CADENCIA[dia]} ${s.hora}`)
  return out
}

function textoUtil(caption: string | null): string {
  return (caption || '').replace(/SL-[A-Za-z0-9]+-[A-Za-z0-9]+/g, '').replace(/\s+/g, ' ').trim()
}

async function main() {
  const agora = new Date()
  const inicio = new Date(agora.getTime() - JANELA * 24 * 3600_000)

  const projetos = await db.project.findMany({
    where: PROJETOS.length > 0 ? { id: { in: PROJETOS } } : { name: { contains: 'Wine' } },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  for (const projeto of projetos) {
    const brutos = await db.socialPost.findMany({
      where: {
        projectId: projeto.id,
        scheduledDatetime: { gte: inicio, lte: agora },
        learningScope: { not: 'PONTUAL' },
      },
      select: {
        id: true,
        status: true,
        scheduledDatetime: true,
        caption: true,
        origem: true,
        learningScope: true,
        campaignId: true,
      },
      orderBy: { scheduledDatetime: 'asc' },
    })

    const comData = brutos.filter((p) => p.scheduledDatetime)
    // v1: POSTED + SCHEDULED, tudo com peso 1.
    const v1Entrada = comData
      .filter((p) => p.status === 'POSTED' || p.status === 'SCHEDULED')
      .map((p) => ({ quando: p.scheduledDatetime! }))
    // v2: só POSTED.
    const publicados = comData.filter((p) => p.status === 'POSTED')

    const v2Entrada: PostDoHistorico[] = publicados.map((p) => ({
      quando: p.scheduledDatetime!,
      origem: p.origem as PostDoHistorico['origem'],
      escopo: p.learningScope,
      campaignId: p.campaignId,
      campanhaEncerrada: false,
    }))

    // Cenário 3: o burst reconhecido como campanha (em memória).
    const daCampanha = new Set(
      publicados.filter((p) => textoUtil(p.caption).toLowerCase().includes(TERMO)).map((p) => p.id),
    )
    const v3Entrada: PostDoHistorico[] = publicados.map((p) => ({
      quando: p.scheduledDatetime!,
      origem: p.origem as PostDoHistorico['origem'],
      escopo: daCampanha.has(p.id) ? ('CAMPANHA' as const) : p.learningScope,
      campaignId: daCampanha.has(p.id) ? 'campanha-simulada' : p.campaignId,
      campanhaEncerrada: false,
    }))

    const v1 = cadenciaV1(v1Entrada)
    const v2 = calcularCadencia(v2Entrada, { agora })
    const v3 = calcularCadencia(v3Entrada, { agora })

    console.log(`\n${'='.repeat(78)}`)
    console.log(`PROJETO ${projeto.id} — ${projeto.name}`)
    console.log(
      `histórico: ${comData.length} posts na janela (${publicados.length} publicados) | ` +
        `"${TERMO}": ${daCampanha.size} peças | semanas com atividade: ${v2.semanasComAtividade}`,
    )
    console.log('='.repeat(78))

    for (let dia = 0; dia < 7; dia++) {
      const a = v1.slots.get(dia) ?? []
      const b = v2.slotsPorDia.get(dia) ?? []
      const c = v3.slotsPorDia.get(dia) ?? []
      if (a.length === 0 && b.length === 0 && c.length === 0) continue
      console.log(`\n${DIAS_SEMANA_CADENCIA[dia]}`)
      console.log(`  v1            : ${a.map((s) => `${s.hora}(${s.ocorrencias}x)`).join(' ') || '—'}`)
      console.log(
        `  v2            : ${b.map((s) => `${s.hora}(${s.ocorrencias}x p=${s.pesoForte})`).join(' ') || '—'}`,
      )
      console.log(
        `  v2+campanha   : ${c.map((s) => `${s.hora}(${s.ocorrencias}x p=${s.pesoForte})`).join(' ') || '—'}`,
      )
      const caiu = b.filter((s) => !c.some((x) => x.hora === s.hora))
      if (caiu.length > 0) console.log(`  ↓ caiu ao reconhecer a campanha: ${caiu.map((s) => s.hora).join(' ')}`)
    }

    const h1 = horariosDe(v1.slots)
    const h2 = horariosDe(v2.slotsPorDia)
    const h3 = horariosDe(v3.slotsPorDia)
    console.log(`\nRESUMO: v1=${h1.size} horários típicos | v2=${h2.size} | v2+campanha=${h3.size}`)
    const soV1 = [...h1].filter((h) => !h2.has(h))
    const soV2 = [...h2].filter((h) => !h1.has(h))
    if (soV1.length) console.log(`  só na v1 (a v2 deixou de sugerir): ${soV1.join(', ')}`)
    if (soV2.length) console.log(`  só na v2 (a v2 passou a sugerir): ${soV2.join(', ')}`)
    const perdidosNaCampanha = [...h2].filter((h) => !h3.has(h))
    console.log(
      perdidosNaCampanha.length
        ? `  ↓ reconhecer a campanha derruba: ${perdidosNaCampanha.join(', ')}`
        : '  reconhecer a campanha não muda os horários típicos',
    )

    // Amostra dos posts da campanha, para conferência de olho.
    if (daCampanha.size > 0) {
      console.log(`\n  peças de "${TERMO}":`)
      for (const p of publicados.filter((x) => daCampanha.has(x.id))) {
        const d = new Date(p.scheduledDatetime!.getTime() - 3 * 3600_000)
        console.log(
          `    ${d.toISOString().slice(0, 16).replace('T', ' ')} ${DIAS_SEMANA_CADENCIA[d.getUTCDay()]} :: ${textoUtil(p.caption).slice(0, 60)}`,
        )
      }
    }
  }
}

main()
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
