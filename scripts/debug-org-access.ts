import { db } from '../src/lib/db'

async function debugOrgAccess() {
  console.log('🔍 Verificando acesso de organizações aos projetos...\n')

  try {
    // Listar todas as organizações
    const orgs = await db.organization.findMany({
      select: {
        id: true,
        clerkOrgId: true,
        name: true,
        slug: true,
      },
    })

    console.log('📊 Organizações cadastradas:')
    orgs.forEach(org => {
      console.log(`  - ${org.name} (${org.clerkOrgId})`)
    })
    console.log()

    // Listar todos os projetos compartilhados com organizações
    const sharedProjects = await db.organizationProject.findMany({
      include: {
        organization: {
          select: {
            clerkOrgId: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
      },
    })

    console.log('📊 Projetos compartilhados com organizações:')
    if (sharedProjects.length === 0) {
      console.log('  ❌ Nenhum projeto compartilhado encontrado!')
    } else {
      sharedProjects.forEach(share => {
        console.log(`  - Projeto: ${share.project.name} (ID: ${share.project.id})`)
        console.log(`    Organização: ${share.organization.name} (${share.organization.clerkOrgId})`)
        console.log(`    Dono do projeto: ${share.project.userId}`)
        console.log(`    Pode editar: ${share.defaultCanEdit}`)
        console.log()
      })
    }

    // Listar todos os templates
    const templates = await db.template.findMany({
      select: {
        id: true,
        name: true,
        projectId: true,
        createdBy: true,
        Project: {
          select: {
            name: true,
            userId: true,
          },
        },
      },
    })

    console.log('📊 Templates cadastrados:')
    templates.forEach(template => {
      console.log(`  - Template: ${template.name} (ID: ${template.id})`)
      console.log(`    Projeto: ${template.Project.name} (ID: ${template.projectId})`)
      console.log(`    Dono do projeto: ${template.Project.userId}`)
      console.log(`    Criado por: ${template.createdBy}`)
      console.log()
    })

  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await db.$disconnect()
  }
}

debugOrgAccess()
