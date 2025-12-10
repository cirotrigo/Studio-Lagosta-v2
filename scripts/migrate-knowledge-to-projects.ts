import { PrismaClient, KnowledgeCategory, EntryStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateKnowledgeToProjects() {
  console.log('🚀 Iniciando migração de conhecimento para projetos...')

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: { projectId: null },
  })

  console.log(`📊 Encontradas ${entries.length} entries sem projectId`)

  let migrated = 0
  let archived = 0
  let errors = 0

  for (const entry of entries) {
    try {
      let targetProjectId: number | null = null

      // 1) Tentar mapear via organização (workspaceId = clerkOrgId)
      if (entry.workspaceId) {
        const org = await prisma.organization.findUnique({
          where: { clerkOrgId: entry.workspaceId },
          select: { id: true },
        })

        if (org) {
          const orgProject = await prisma.organizationProject.findFirst({
            where: { organizationId: org.id },
            orderBy: { sharedAt: 'asc' },
          })

          targetProjectId = orgProject?.projectId ?? null
        }
      }

      // 2) Fallback: primeiro projeto do usuário
      if (!targetProjectId && entry.userId) {
        const userProject = await prisma.project.findFirst({
          where: { userId: entry.userId },
          orderBy: { createdAt: 'asc' },
        })

        targetProjectId = userProject?.id ?? null
      }

      if (targetProjectId) {
        await prisma.knowledgeBaseEntry.update({
          where: { id: entry.id },
          data: {
            projectId: targetProjectId,
            category: entry.category ?? KnowledgeCategory.ESTABELECIMENTO_INFO,
            createdBy: entry.createdBy || entry.userId || 'system',
            status: entry.status ?? EntryStatus.ACTIVE,
          },
        })
        migrated++
        console.log(`✅ "${entry.title}" → Projeto ${targetProjectId}`)
      } else {
        await prisma.knowledgeBaseEntry.update({
          where: { id: entry.id },
          data: {
            status: EntryStatus.ARCHIVED,
            createdBy: entry.createdBy || entry.userId || 'system',
          },
        })
        archived++
        console.log(`⚠️  "${entry.title}" arquivada (sem projeto identificado)`)
      }
    } catch (error) {
      errors++
      console.error(`❌ Erro ao migrar "${entry.title}":`, error)
    }
  }

  console.log('\n📊 RESUMO DA MIGRAÇÃO:')
  console.log(`✅ Migradas: ${migrated}`)
  console.log(`⚠️  Arquivadas: ${archived}`)
  console.log(`❌ Erros: ${errors}`)
}

migrateKnowledgeToProjects()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
