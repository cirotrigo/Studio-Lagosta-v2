import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkProjectsBehavior() {
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
        aiChatBehavior: true,
      },
    })

    console.log('\n=== Projetos Encontrados ===\n')

    for (const project of projects) {
      console.log(`ID: ${project.id}`)
      console.log(`Nome: ${project.name}`)
      console.log(`AI Chat Behavior:`)
      if (project.aiChatBehavior) {
        console.log('---')
        console.log(project.aiChatBehavior)
        console.log('---')
      } else {
        console.log('(não configurado)')
      }
      console.log('\n')
    }

    if (projects.length === 0) {
      console.log('Nenhum projeto encontrado com nome "Tero" ou "quintal"')
    }
  } catch (error) {
    console.error('Erro ao buscar projetos:', error)
  } finally {
    await db.$disconnect()
  }
}

checkProjectsBehavior()
