import { PrismaClient } from '../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

async function checkMigrationChecksums() {
  console.log('🔍 Verificando checksums das migrations...\n')

  try {
    // Buscar migrations aplicadas do banco
    const appliedMigrations = await prisma.$queryRaw<
      Array<{
        id: string
        checksum: string
        migration_name: string
        finished_at: Date
      }>
    >`
      SELECT id, checksum, migration_name, finished_at
      FROM "_prisma_migrations"
      ORDER BY finished_at ASC
    `

    console.log(`📦 ${appliedMigrations.length} migrations aplicadas no banco\n`)

    const migrationsDir = path.join(process.cwd(), 'prisma/migrations')
    const issues: any[] = []

    for (const dbMigration of appliedMigrations) {
      const migrationPath = path.join(migrationsDir, dbMigration.migration_name)
      const sqlFile = path.join(migrationPath, 'migration.sql')

      if (!fs.existsSync(sqlFile)) {
        console.log(`⚠️  ${dbMigration.migration_name}: Arquivo SQL não encontrado`)
        issues.push({
          name: dbMigration.migration_name,
          issue: 'SQL file missing',
        })
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
        console.log(`❌ ${dbMigration.migration_name}`)
        console.log(`   DB checksum:   ${dbChecksum}`)
        console.log(`   File checksum: ${currentChecksum}`)
        console.log(`   Status: MODIFICADO\n`)
        issues.push({
          name: dbMigration.migration_name,
          issue: 'Checksum mismatch',
          dbChecksum,
          fileChecksum: currentChecksum,
        })
      } else {
        console.log(`✅ ${dbMigration.migration_name}`)
      }
    }

    if (issues.length > 0) {
      console.log(`\n\n⚠️  ${issues.length} migration(s) modificada(s) detectada(s):\n`)
      issues.forEach((issue) => {
        console.log(`- ${issue.name}: ${issue.issue}`)
      })
      console.log('\n⚠️  ATENÇÃO: Migrations aplicadas foram modificadas!')
      console.log('Isso causará erro ao tentar criar novas migrations.\n')
      console.log('Soluções possíveis:')
      console.log('1. Restaurar migrations para estado original')
      console.log('2. Atualizar checksums no banco (não recomendado)')
      console.log('3. Usar migrate reset (PERDE DADOS)')
    } else {
      console.log('\n\n✅ Todos os checksums estão corretos!')
    }
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkMigrationChecksums()
