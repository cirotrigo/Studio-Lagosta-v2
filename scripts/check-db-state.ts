import { PrismaClient } from '../prisma/generated/client'

const prisma = new PrismaClient()

async function checkDatabaseState() {
  console.log('🔍 Checking database state...\n')

  try {
    // Verificar tabelas existentes
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `

    console.log('📋 Tabelas existentes no banco:')
    console.log('=' .repeat(50))
    tables.forEach((t, i) => {
      console.log(`${i + 1}. ${t.tablename}`)
    })
    console.log(`\nTotal: ${tables.length} tabelas\n`)

    // Verificar FKs
    const fks = await prisma.$queryRaw<
      Array<{
        table_name: string
        constraint_name: string
        column_name: string
        foreign_table_name: string
      }>
    >`
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name
    `

    console.log('🔗 Foreign Keys:')
    console.log('=' .repeat(50))
    fks.forEach((fk) => {
      console.log(
        `${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}`
      )
    })
    console.log(`\nTotal: ${fks.length} FKs\n`)

    // Verificar migrations aplicadas
    const migrations = await prisma.$queryRaw<
      Array<{
        id: string
        checksum: string
        finished_at: Date
        migration_name: string
        logs: string
        rolled_back_at: Date
        started_at: Date
        applied_steps_count: number
      }>
    >`
      SELECT * FROM "_prisma_migrations"
      ORDER BY finished_at DESC
      LIMIT 10
    `

    console.log('📦 Últimas 10 migrations aplicadas:')
    console.log('=' .repeat(50))
    migrations.forEach((m, i) => {
      console.log(
        `${i + 1}. ${m.migration_name} (${m.finished_at?.toISOString() || 'N/A'})`
      )
    })
    console.log(`\nTotal migrations: ${migrations.length}\n`)

    // Verificar tabelas críticas
    const criticalTables = [
      'User',
      'Project',
      'Template',
      'Generation',
      'Organization',
      'MusicLibrary',
      'VideoProcessingJob',
      'YoutubeDownloadJob',
      'KnowledgeBaseEntry',
      'ChatConversation',
    ]

    console.log('⚠️  Status de tabelas críticas:')
    console.log('=' .repeat(50))
    for (const table of criticalTables) {
      const exists = tables.some((t) => t.tablename === table)
      const status = exists ? '✅' : '❌'
      console.log(`${status} ${table}`)
    }
    console.log('')

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkDatabaseState()
