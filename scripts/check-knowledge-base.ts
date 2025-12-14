import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkKnowledgeBase() {
  try {
    const projects = await db.project.findMany({
      where: {
        OR: [
          { name: { contains: 'Tero', mode: 'insensitive' } },
          { name: { contains: 'quintal', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            knowledgeEntries: true,
          },
        },
      },
    })

    console.log('\n=== Base de Conhecimento ===\n')

    for (const project of projects) {
      console.log(`Projeto: ${project.name} (ID: ${project.id})`)
      console.log(`Documentos na base: ${project._count.knowledgeEntries}`)

      // Get sample knowledge entries
      const knowledge = await db.knowledgeBaseEntry.findMany({
        where: { projectId: project.id },
        take: 5,
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      if (knowledge.length > 0) {
        console.log('\nÚltimos documentos:')
        knowledge.forEach((k) => {
          console.log(`  - ${k.title} (${k.category}) [${k.status}]`)
        })
      }
      console.log('\n')
    }
  } catch (error) {
    console.error('Erro ao buscar base de conhecimento:', error)
  } finally {
    await db.$disconnect()
  }
}

checkKnowledgeBase()
