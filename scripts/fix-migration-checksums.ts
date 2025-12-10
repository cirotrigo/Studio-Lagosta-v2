import { PrismaClient } from '../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

async function fixMigrationChecksums() {
  console.log('🔧 Corrigindo checksums das migrations...\n')

  try {
    // Buscar migrations aplicadas do banco
    const appliedMigrations = await prisma.$queryRaw<
      Array<{
        id: string
        checksum: string
        migration_name: string
      }>
    >`
      SELECT id, checksum, migration_name
      FROM "_prisma_migrations"
      ORDER BY finished_at ASC
    `

    const migrationsDir = path.join(process.cwd(), 'prisma/migrations')
    let fixed = 0
    let skipped = 0

    for (const dbMigration of appliedMigrations) {
      const migrationPath = path.join(migrationsDir, dbMigration.migration_name)
      const sqlFile = path.join(migrationPath, 'migration.sql')

      if (!fs.existsSync(sqlFile)) {
        console.log(`⚠️  ${dbMigration.migration_name}: Arquivo SQL não encontrado - pulando`)
        skipped++
        continue
      }

      // Calcular checksum do arquivo atual
      const fileContent = fs.readFileSync(sqlFile, 'utf-8')
      const currentChecksum = crypto
        .createHash('sha256')
        .update(fileContent)
        .digest('hex')

      const dbChecksum = dbMigration.checksum

      if (currentChecksum !== dbChecksum) {
        console.log(`🔧 ${dbMigration.migration_name}`)
        console.log(`   Antigo: ${dbChecksum}`)
        console.log(`   Novo:   ${currentChecksum}`)

        // Atualizar checksum no banco
        await prisma.$executeRaw`
          UPDATE "_prisma_migrations"
          SET checksum = ${currentChecksum}
          WHERE migration_name = ${dbMigration.migration_name}
        `

        console.log(`   ✅ Checksum atualizado\n`)
        fixed++
      } else {
        console.log(`✅ ${dbMigration.migration_name} (já correto)`)
        skipped++
      }
    }

    console.log(`\n\n📊 Resumo:`)
    console.log(`✅ Checksums corrigidos: ${fixed}`)
    console.log(`⏭️  Já corretos: ${skipped}`)
    console.log(`📦 Total: ${appliedMigrations.length}`)

    if (fixed > 0) {
      console.log('\n✅ Checksums atualizados com sucesso!')
      console.log('Agora você pode criar novas migrations normalmente.')
    }
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

fixMigrationChecksums()
