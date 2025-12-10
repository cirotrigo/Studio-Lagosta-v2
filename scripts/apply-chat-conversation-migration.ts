import { PrismaClient } from '../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

const MIGRATION_NAME = '20251210153315_add_project_to_chat_conversation'

async function applyMigration() {
  console.log(`🚀 Aplicando migration: ${MIGRATION_NAME}\n`)

  try {
    // Ler arquivo SQL
    const sqlFile = path.join(
      process.cwd(),
      'prisma/migrations',
      MIGRATION_NAME,
      'migration.sql'
    )
    const sqlContent = fs.readFileSync(sqlFile, 'utf-8')

    console.log('📄 SQL a ser executado:')
    console.log('─'.repeat(60))
    console.log(sqlContent)
    console.log('─'.repeat(60))
    console.log('')

    // Verificar se migration já foi aplicada
    const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME}
    `

    if (Number(existing[0].count) > 0) {
      console.log('⚠️  Migration já foi aplicada anteriormente.')
      console.log('   Pulando aplicação.')
      return
    }

    // Aplicar migration
    console.log('🔄 Executando SQL...\n')

    // Split por statement e executar um por um
    const statements = sqlContent
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`  Executando: ${statement.substring(0, 50)}...`)
        await prisma.$executeRawUnsafe(statement)
      }
    }

    console.log('\n✅ SQL executado com sucesso!\n')

    // Registrar migration no histórico
    console.log('📝 Registrando migration no histórico...\n')

    const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex')

    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (
        id,
        checksum,
        finished_at,
        migration_name,
        logs,
        rolled_back_at,
        started_at,
        applied_steps_count
      ) VALUES (
        ${crypto.randomUUID()},
        ${checksum},
        NOW(),
        ${MIGRATION_NAME},
        NULL,
        NULL,
        NOW(),
        1
      )
    `

    console.log('✅ Migration registrada no histórico!\n')
    console.log('─'.repeat(60))
    console.log('🎉 Migration aplicada com sucesso!')
    console.log('─'.repeat(60))
    console.log('')
    console.log('Agora o campo ChatConversation.projectId está disponível!')
  } catch (error: any) {
    console.error('❌ Erro ao aplicar migration:', error)
    console.error('')
    console.error('Detalhes:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration()
