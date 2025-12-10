import { PrismaClient } from '../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const backupDir = path.join(process.cwd(), 'backups')
  const backupFile = path.join(backupDir, `backup_${timestamp}.json`)

  console.log('🔄 Iniciando backup do banco de dados...\n')

  try {
    // Criar diretório de backups se não existir
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const backup: any = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'neondb',
      tables: {},
    }

    // Tabelas críticas para backup (em ordem de dependências)
    const tables = [
      // Core
      { name: 'User', query: () => prisma.user.findMany() },
      { name: 'Organization', query: () => prisma.organization.findMany() },
      { name: 'Project', query: () => prisma.project.findMany() },

      // Credits
      { name: 'CreditBalance', query: () => prisma.creditBalance.findMany() },
      { name: 'UsageHistory', query: () => prisma.usageHistory.findMany() },

      // Templates
      { name: 'Template', query: () => prisma.template.findMany() },
      { name: 'Generation', query: () => prisma.generation.findMany() },

      // Assets
      { name: 'CustomFont', query: () => prisma.customFont.findMany() },
      { name: 'Element', query: () => prisma.element.findMany() },
      { name: 'Logo', query: () => prisma.logo.findMany() },
      { name: 'BrandColor', query: () => prisma.brandColor.findMany() },

      // Social
      { name: 'SocialPost', query: () => prisma.socialPost.findMany() },

      // Video/Music
      { name: 'MusicLibrary', query: () => prisma.musicLibrary.findMany() },
      { name: 'VideoProcessingJob', query: () => prisma.videoProcessingJob.findMany() },
      { name: 'YoutubeDownloadJob', query: () => prisma.youtubeDownloadJob.findMany() },

      // AI/Chat
      { name: 'ChatConversation', query: () => prisma.chatConversation.findMany() },
      { name: 'Prompt', query: () => prisma.prompt.findMany() },
      { name: 'PromptLibrary', query: () => prisma.promptLibrary.findMany() },

      // Settings
      { name: 'Plan', query: () => prisma.plan.findMany() },
      { name: 'AdminSettings', query: () => prisma.adminSettings.findMany() },
    ]

    console.log(`📦 Exportando ${tables.length} tabelas...\n`)

    for (const table of tables) {
      try {
        const data = await table.query()
        backup.tables[table.name] = {
          count: Array.isArray(data) ? data.length : 0,
          data: data,
        }
        console.log(`✅ ${table.name}: ${backup.tables[table.name].count} registros`)
      } catch (error: any) {
        console.log(`⚠️  ${table.name}: Erro - ${error.message}`)
        backup.tables[table.name] = { count: 0, error: error.message }
      }
    }

    // Salvar backup
    console.log(`\n💾 Salvando backup em: ${backupFile}`)
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2))

    const stats = fs.statSync(backupFile)
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`\n✅ Backup concluído!`)
    console.log(`📁 Arquivo: ${backupFile}`)
    console.log(`📊 Tamanho: ${sizeInMB} MB`)
    console.log(`📅 Data: ${backup.timestamp}`)

    // Resumo
    const totalRecords = Object.values(backup.tables).reduce(
      (sum: number, table: any) => sum + (table.count || 0),
      0
    )
    console.log(`📈 Total de registros: ${totalRecords}`)

    // Criar link simbólico para latest
    const latestLink = path.join(backupDir, 'latest.json')
    if (fs.existsSync(latestLink)) {
      fs.unlinkSync(latestLink)
    }
    fs.symlinkSync(path.basename(backupFile), latestLink)
    console.log(`🔗 Link criado: backups/latest.json`)

  } catch (error) {
    console.error('❌ Erro ao fazer backup:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

backupDatabase()
