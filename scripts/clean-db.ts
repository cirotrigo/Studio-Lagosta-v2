/**
 * Limpeza de dados velhos do banco.
 *
 * ⚠️  RODA CONTRA PRODUÇÃO. O `.env` aponta para o banco de produção, e este
 * script não passa pelo runner de dev (`scripts/dev-db.ts`) de propósito:
 * limpar log velho de produção é a função dele. Por isso o padrão é DRY-RUN.
 *
 * Uso:
 *   npx tsx scripts/clean-db.ts                          # dry-run (padrão)
 *   npx tsx scripts/clean-db.ts --apply                  # apaga de verdade
 *   npx tsx scripts/clean-db.ts --apply --incluir-criativos
 *
 * Por que os criativos ficam atrás de uma flag própria (medido em 30/07/2026):
 * apagar Generations com mais de 30 dias levaria 3.804 das 4.227 existentes —
 * 90% da galeria de Criativos. Pior, `SocialPost.Generation` é relação
 * opcional sem `onDelete` declarado, então o Prisma aplica **SetNull**: os
 * posts sobrevivem mas perdem o `generationId`, que é o vínculo que habilita
 * "Melhorar com IA" e que o CLAUDE.md registra como irrecuperável. A linhagem
 * das melhorias (`sourceGenerationId`) também fica órfã. E os arquivos no
 * Vercel Blob NÃO são apagados aqui: virariam armazenamento pago e
 * inalcançável.
 *
 * O ganho real de espaço está nos PostLogs (item 6), que são ~99% do volume e
 * não têm esse efeito colateral.
 */
import { db } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')
const INCLUIR_CRIATIVOS = process.argv.includes('--incluir-criativos')

const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

// Cada tarefa declara o `where` UMA vez e o compartilha entre contar e apagar.
// É o que garante que o dry-run mostre exatamente o que o --apply faria.
const WHERE_GENERATIONS = { createdAt: { lt: dias(30) } }
const WHERE_STORAGE = { deletedAt: { not: null } }
const WHERE_USAGE = { timestamp: { lt: dias(90) } }
const WHERE_VIDEO_OK = { status: 'COMPLETED' as const, completedAt: { lt: dias(7) } }
const WHERE_VIDEO_FAIL = { status: 'FAILED' as const, createdAt: { lt: dias(7) } }
const WHERE_POSTLOG = { createdAt: { lt: dias(30) } }
const WHERE_RETRY = {
  OR: [
    { status: 'SUCCESS' as const },
    { status: 'FAILED' as const },
    { createdAt: { lt: dias(7) } },
  ],
}
const WHERE_SUBSCRIPTION = { occurredAt: { lt: dias(180) } }

interface Tarefa {
  numero: number
  label: string
  contar: () => Promise<number>
  apagar: () => Promise<{ count: number }>
  /** Exige --incluir-criativos; apaga conteúdo do produto, não telemetria. */
  perigoso?: boolean
}

const TAREFAS: Tarefa[] = [
  {
    numero: 1,
    label: 'Generations com mais de 30 dias (GALERIA DE CRIATIVOS)',
    contar: () => db.generation.count({ where: WHERE_GENERATIONS }),
    apagar: () => db.generation.deleteMany({ where: WHERE_GENERATIONS }),
    perigoso: true,
  },
  {
    numero: 2,
    label: 'StorageObjects já marcados como deletados',
    contar: () => db.storageObject.count({ where: WHERE_STORAGE }),
    apagar: () => db.storageObject.deleteMany({ where: WHERE_STORAGE }),
  },
  {
    numero: 3,
    label: 'UsageHistory com mais de 90 dias',
    contar: () => db.usageHistory.count({ where: WHERE_USAGE }),
    apagar: () => db.usageHistory.deleteMany({ where: WHERE_USAGE }),
  },
  {
    numero: 4,
    label: 'VideoProcessingJobs concluídos há mais de 7 dias',
    contar: () => db.videoProcessingJob.count({ where: WHERE_VIDEO_OK }),
    apagar: () => db.videoProcessingJob.deleteMany({ where: WHERE_VIDEO_OK }),
  },
  {
    numero: 5,
    label: 'VideoProcessingJobs falhados há mais de 7 dias',
    contar: () => db.videoProcessingJob.count({ where: WHERE_VIDEO_FAIL }),
    apagar: () => db.videoProcessingJob.deleteMany({ where: WHERE_VIDEO_FAIL }),
  },
  {
    numero: 6,
    label: 'PostLogs com mais de 30 dias',
    contar: () => db.postLog.count({ where: WHERE_POSTLOG }),
    apagar: () => db.postLog.deleteMany({ where: WHERE_POSTLOG }),
  },
  {
    numero: 7,
    label: 'PostRetries concluídos ou com mais de 7 dias',
    contar: () => db.postRetry.count({ where: WHERE_RETRY }),
    apagar: () => db.postRetry.deleteMany({ where: WHERE_RETRY }),
  },
  {
    numero: 8,
    label: 'SubscriptionEvents com mais de 180 dias',
    contar: () => db.subscriptionEvent.count({ where: WHERE_SUBSCRIPTION }),
    apagar: () => db.subscriptionEvent.deleteMany({ where: WHERE_SUBSCRIPTION }),
  },
]

/** Efeitos colaterais da exclusão de Generations que a contagem não mostra. */
async function diagnosticarCriativos(): Promise<string[]> {
  const [postsAfetados, linhagemPerdida, linhagemOrfa] = await Promise.all([
    db.socialPost.count({
      where: { generationId: { not: null }, Generation: WHERE_GENERATIONS },
    }),
    db.generation.count({
      where: { sourceGenerationId: { not: null }, ...WHERE_GENERATIONS },
    }),
    db.generation.count({
      where: { sourceGenerationId: { not: null }, createdAt: { gte: dias(30) } },
    }),
  ])
  return [
    `${postsAfetados} SocialPosts perderiam o generationId (SetNull) — sem ele não dá para "Melhorar com IA", e não há como recuperar`,
    `${linhagemPerdida} melhorias com linhagem seriam apagadas`,
    `${linhagemOrfa} melhorias sobreviveriam com a origem apagada — o antes/depois quebra`,
    'os arquivos no Vercel Blob NÃO são apagados por este script',
  ]
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  Limpeza do banco — ⚠️  BANCO DE PRODUÇÃO')
  console.log('═══════════════════════════════════════════════════════')
  console.log(
    APPLY
      ? '⚠️  MODO APPLY — os registros abaixo SERÃO apagados\n'
      : '🔍 DRY-RUN — nada será apagado (use --apply para apagar)\n',
  )

  let total = 0
  try {
    for (const tarefa of TAREFAS) {
      const puladaPorFlag = tarefa.perigoso && !INCLUIR_CRIATIVOS
      const quantidade = await tarefa.contar()

      if (puladaPorFlag) {
        console.log(`${tarefa.numero}. ${tarefa.label}`)
        console.log(`   ⏭️  PULADA — ${quantidade} registros (use --incluir-criativos)`)
        if (quantidade > 0) {
          for (const linha of await diagnosticarCriativos()) {
            console.log(`      · ${linha}`)
          }
        }
        console.log('')
        continue
      }

      console.log(`${tarefa.numero}. ${tarefa.label}`)
      if (tarefa.perigoso && quantidade > 0) {
        console.log('   ⚠️  ATENÇÃO — isto apaga conteúdo do produto:')
        for (const linha of await diagnosticarCriativos()) {
          console.log(`      · ${linha}`)
        }
      }

      if (!APPLY) {
        console.log(`   🔍 apagaria ${quantidade} registros\n`)
        total += quantidade
        continue
      }

      const { count } = await tarefa.apagar()
      console.log(`   ✓ apagados ${count} registros\n`)
      total += count
    }

    console.log('═══════════════════════════════════════════════════════')
    console.log(
      APPLY
        ? `✅ Limpeza concluída — ${total} registros apagados`
        : `🔍 Dry-run concluído — ${total} registros seriam apagados. Nada foi tocado.`,
    )
    console.log('═══════════════════════════════════════════════════════\n')

    if (APPLY && total > 0) {
      console.log('💡 Para recuperar espaço em disco, rode no SQL Editor do Neon:')
      console.log('   VACUUM FULL;')
      console.log('   REINDEX DATABASE neondb;\n')
    }
    if (!APPLY) {
      console.log('   Para apagar de verdade:  npx tsx scripts/clean-db.ts --apply\n')
    }
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error)
    process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}

main()
