/**
 * Script de recovery: reconstrói registros Generation a partir do que está no Drive.
 *
 * Para cada projeto com googleDriveFolderId:
 *   1. Localiza o subfolder ARTES LAGOSTA
 *   2. Lista todas as imagens com createdTime
 *   3. Para cada imagem do Drive sem Generation correspondente, cria um stub
 *
 * Uso:
 *   npx tsx scripts/recover-deleted-generations.ts                    # dry-run (default)
 *   npx tsx scripts/recover-deleted-generations.ts --apply            # cria os registros
 *   npx tsx scripts/recover-deleted-generations.ts --project-id 5     # escopa por projeto
 */

import { db } from '../src/lib/db'
import { googleDriveService } from '../src/server/google-drive-service'
import {
  KONVA_PROJECT_EXPORT_CATEGORY,
  getKonvaProjectTemplateConfig,
} from '../src/lib/konva-project-creatives'
import { TemplateType } from '../src/lib/prisma-types'

interface CliArgs {
  apply: boolean
  projectId?: number
}

interface ProjectStats {
  projectId: number
  projectName: string
  driveFiles: number
  alreadyTracked: number
  recovered: number
  skipped: number
  errors: number
}

function parseArgs(): CliArgs {
  const args: CliArgs = { apply: false }
  for (const arg of process.argv.slice(2)) {
    if (arg === '--apply') args.apply = true
    else if (arg.startsWith('--project-id')) {
      const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1]
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) {
        args.projectId = parsed
      }
    }
  }
  return args
}

async function pickTemplateForRecovery(projectId: number): Promise<{ id: number; type: TemplateType } | null> {
  // Preferência: template do sistema KONVA_EXPORT_STORY
  const storyConfig = getKonvaProjectTemplateConfig('STORY')
  const systemTemplate = await db.template.findFirst({
    where: {
      projectId,
      category: KONVA_PROJECT_EXPORT_CATEGORY,
      name: storyConfig.templateName,
    },
    select: { id: true, type: true },
  })
  if (systemTemplate) return systemTemplate

  // Fallback: qualquer template do projeto
  const anyTemplate = await db.template.findFirst({
    where: { projectId },
    select: { id: true, type: true },
    orderBy: { createdAt: 'asc' },
  })
  return anyTemplate
}

async function recoverProject(
  project: { id: number; name: string; userId: string; googleDriveFolderId: string },
  apply: boolean,
): Promise<ProjectStats> {
  const stats: ProjectStats = {
    projectId: project.id,
    projectName: project.name,
    driveFiles: 0,
    alreadyTracked: 0,
    recovered: 0,
    skipped: 0,
    errors: 0,
  }

  const artesFolderId = await googleDriveService.findArtesLagostaFolder(project.googleDriveFolderId)
  if (!artesFolderId) {
    console.log(`  [${project.name}] Sem subfolder ARTES LAGOSTA, pulando.`)
    return stats
  }

  const driveFiles = await googleDriveService.listImagesInFolder(artesFolderId)
  stats.driveFiles = driveFiles.length

  if (driveFiles.length === 0) {
    return stats
  }

  // Buscar todos os fileIds já rastreados nesse projeto de uma vez
  const tracked = await db.generation.findMany({
    where: {
      projectId: project.id,
      googleDriveFileId: { in: driveFiles.map((f) => f.id) },
    },
    select: { googleDriveFileId: true },
  })
  const trackedSet = new Set(tracked.map((g) => g.googleDriveFileId))
  stats.alreadyTracked = trackedSet.size

  const orphans = driveFiles.filter((f) => !trackedSet.has(f.id))
  if (orphans.length === 0) {
    return stats
  }

  const template = await pickTemplateForRecovery(project.id)
  if (!template) {
    console.warn(`  [${project.name}] Sem template disponível, pulando ${orphans.length} arquivos.`)
    stats.skipped = orphans.length
    return stats
  }

  for (const driveFile of orphans) {
    try {
      const driveUrl = googleDriveService.getPublicUrl(driveFile.id)
      const createdAt = driveFile.createdTime ? new Date(driveFile.createdTime) : new Date()

      if (!apply) {
        console.log(
          `  [${project.name}] DRY-RUN — recuperaria: ${driveFile.name} (${driveFile.id}, ${createdAt.toISOString()})`,
        )
        stats.recovered++
        continue
      }

      await db.generation.create({
        data: {
          templateId: template.id,
          projectId: project.id,
          status: 'COMPLETED',
          resultUrl: driveUrl,
          googleDriveFileId: driveFile.id,
          googleDriveBackupUrl: driveUrl,
          fileName: null,
          fieldValues: {
            source: 'recovery_script',
            recoveredAt: new Date().toISOString(),
            driveName: driveFile.name,
          },
          templateName: 'Criativo recuperado',
          projectName: project.name,
          createdBy: project.userId,
          createdAt,
          completedAt: createdAt,
        },
      })
      stats.recovered++
    } catch (error) {
      console.error(`  [${project.name}] Erro recuperando ${driveFile.name}:`, error)
      stats.errors++
    }
  }

  return stats
}

async function main() {
  const args = parseArgs()
  const mode = args.apply ? 'APPLY' : 'DRY-RUN'

  console.log(`🔍 Recovery script — modo: ${mode}`)
  if (args.projectId) {
    console.log(`   Escopo: projectId=${args.projectId}`)
  }

  if (!googleDriveService.isEnabled()) {
    console.error('❌ Google Drive integration não configurada (cheque GOOGLE_DRIVE_* env vars)')
    process.exit(1)
  }

  const projects = await db.project.findMany({
    where: {
      googleDriveFolderId: { not: null },
      ...(args.projectId ? { id: args.projectId } : {}),
    },
    select: {
      id: true,
      name: true,
      userId: true,
      googleDriveFolderId: true,
    },
    orderBy: { id: 'asc' },
  })

  console.log(`\n📁 ${projects.length} projeto(s) com Drive configurado\n`)

  const allStats: ProjectStats[] = []

  for (const project of projects) {
    if (!project.googleDriveFolderId) continue
    console.log(`\n→ ${project.name} (id=${project.id})`)
    try {
      const stats = await recoverProject(
        { ...project, googleDriveFolderId: project.googleDriveFolderId },
        args.apply,
      )
      allStats.push(stats)
      console.log(
        `  ✓ Drive=${stats.driveFiles} | já rastreados=${stats.alreadyTracked} | ${
          args.apply ? 'recuperados' : 'recuperaria'
        }=${stats.recovered} | pulados=${stats.skipped} | erros=${stats.errors}`,
      )
    } catch (error) {
      console.error(`  ✗ Falha no projeto ${project.name}:`, error)
    }
  }

  // Resumo total
  const totals = allStats.reduce(
    (acc, s) => ({
      driveFiles: acc.driveFiles + s.driveFiles,
      alreadyTracked: acc.alreadyTracked + s.alreadyTracked,
      recovered: acc.recovered + s.recovered,
      skipped: acc.skipped + s.skipped,
      errors: acc.errors + s.errors,
    }),
    { driveFiles: 0, alreadyTracked: 0, recovered: 0, skipped: 0, errors: 0 },
  )

  console.log('\n══════════════════════════════════════════')
  console.log(`📊 Total — modo: ${mode}`)
  console.log(`   Arquivos no Drive: ${totals.driveFiles}`)
  console.log(`   Já rastreados:     ${totals.alreadyTracked}`)
  console.log(`   ${args.apply ? 'Recuperados' : 'Recuperaria'}:       ${totals.recovered}`)
  console.log(`   Pulados:           ${totals.skipped}`)
  console.log(`   Erros:             ${totals.errors}`)
  console.log('══════════════════════════════════════════')

  if (!args.apply && totals.recovered > 0) {
    console.log('\n💡 Rode com --apply para criar os registros.')
  }
}

main()
  .catch((error) => {
    console.error('💥 Erro fatal:', error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
