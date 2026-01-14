import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@/../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

/**
 * Cron job para backup diário do banco de dados
 * Executa todo dia às 3h da manhã
 * Configurar na Vercel: https://vercel.com/docs/cron-jobs
 */
export async function GET(request: NextRequest) {
  try {
    // Validar secret do cron job
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[BACKUP_CRON] Iniciando backup diário...')

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
    const backupDir = path.join(process.cwd(), 'backups')
    const backupFile = path.join(backupDir, `backup_${timestamp}.json`)

    // Criar diretório se não existir
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const backup: any = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: process.env.DATABASE_URL?.includes('neondb') ? 'neondb' : 'unknown',
      tables: {},
    }

    // Tabelas críticas para backup
    const tables = [
      { name: 'User', query: () => prisma.user.findMany() },
      { name: 'Organization', query: () => prisma.organization.findMany() },
      { name: 'Project', query: () => prisma.project.findMany() },
      { name: 'CreditBalance', query: () => prisma.creditBalance.findMany() },
      { name: 'UsageHistory', query: () => prisma.usageHistory.findMany() },
      { name: 'Template', query: () => prisma.template.findMany() },
      { name: 'Generation', query: () => prisma.generation.findMany() },
      { name: 'CustomFont', query: () => prisma.customFont.findMany() },
      { name: 'Element', query: () => prisma.element.findMany() },
      { name: 'Logo', query: () => prisma.logo.findMany() },
      { name: 'BrandColor', query: () => prisma.brandColor.findMany() },
      { name: 'SocialPost', query: () => prisma.socialPost.findMany() },
      { name: 'MusicLibrary', query: () => prisma.musicLibrary.findMany() },
      { name: 'VideoProcessingJob', query: () => prisma.videoProcessingJob.findMany() },
      { name: 'YoutubeDownloadJob', query: () => prisma.youtubeDownloadJob.findMany() },
      { name: 'ChatConversation', query: () => prisma.chatConversation.findMany() },
      { name: 'Prompt', query: () => prisma.prompt.findMany() },
      { name: 'PromptLibrary', query: () => prisma.promptLibrary.findMany() },
      { name: 'Plan', query: () => prisma.plan.findMany() },
      { name: 'AdminSettings', query: () => prisma.adminSettings.findMany() },
    ]

    let totalRecords = 0
    let tablesSuccess = 0

    for (const table of tables) {
      try {
        const data = await table.query()
        const count = Array.isArray(data) ? data.length : 0
        backup.tables[table.name] = { count, data }
        totalRecords += count
        tablesSuccess++
        console.log(`[BACKUP_CRON] ${table.name}: ${count} registros`)
      } catch (error: any) {
        console.error(`[BACKUP_CRON] Erro em ${table.name}:`, error.message)
        backup.tables[table.name] = { count: 0, error: error.message }
      }
    }

    // Salvar backup
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2))
    const stats = fs.statSync(backupFile)
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)

    // Atualizar link latest
    const latestLink = path.join(backupDir, 'latest.json')
    if (fs.existsSync(latestLink)) {
      fs.unlinkSync(latestLink)
    }
    fs.symlinkSync(path.basename(backupFile), latestLink)

    // Limpar backups antigos (manter últimos 7 dias)
    const files = fs.readdirSync(backupDir)
    const backupFiles = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => ({ name: f, path: path.join(backupDir, f) }))
      .sort((a, b) => b.name.localeCompare(a.name))

    if (backupFiles.length > 7) {
      const toDelete = backupFiles.slice(7)
      toDelete.forEach(file => {
        fs.unlinkSync(file.path)
        console.log(`[BACKUP_CRON] Backup antigo removido: ${file.name}`)
      })
    }

    console.log(`[BACKUP_CRON] ✅ Backup concluído: ${totalRecords} registros, ${sizeInMB} MB`)

    return NextResponse.json({
      success: true,
      backup: {
        file: backupFile,
        timestamp: backup.timestamp,
        size: `${sizeInMB} MB`,
        totalRecords,
        tablesSuccess,
        tablesTotal: tables.length,
      },
    })
  } catch (error: any) {
    console.error('[BACKUP_CRON] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao fazer backup', message: error.message },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
