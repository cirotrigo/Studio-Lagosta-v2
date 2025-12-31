/**
 * Fix Bacana Organization Association
 * Associates Bacana project to Lagosta Criativa organization
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function fixBacanaOrganization() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔧 FIX BACANA ORGANIZATION ASSOCIATION')
    console.log('='.repeat(80) + '\n')

    // Get Bacana project
    const bacana = await db.project.findFirst({
      where: { name: 'Bacana' },
      include: {
        organizationProjects: {
          include: {
            organization: true
          }
        }
      }
    })

    if (!bacana) {
      console.log('❌ Projeto Bacana não encontrado!\n')
      return
    }

    console.log(`📊 Projeto Bacana (ID: ${bacana.id})`)
    console.log(`   User ID: ${bacana.userId}`)
    console.log(`   Organizações atuais: ${bacana.organizationProjects.length}`)

    // Get Lagosta Criativa organization
    const lagostaCriativa = await db.organization.findFirst({
      where: {
        clerkOrgId: 'org_342GciA7Ykk1PgsrZsyv1lAwzLe'
      }
    })

    if (!lagostaCriativa) {
      console.log('❌ Organização Lagosta Criativa não encontrada!\n')
      return
    }

    console.log(`\n🏢 Organização: ${lagostaCriativa.name}`)
    console.log(`   ID: ${lagostaCriativa.id}`)
    console.log(`   Clerk Org ID: ${lagostaCriativa.clerkOrgId}`)

    // Check if already associated
    const existingAssociation = bacana.organizationProjects.find(
      op => op.organizationId === lagostaCriativa.id
    )

    if (existingAssociation) {
      console.log('\n✅ Bacana já está associado à organização Lagosta Criativa!')
      console.log('   Nenhuma ação necessária.\n')
      return
    }

    // Create association
    console.log('\n🔧 Criando associação...')

    const association = await db.organizationProject.create({
      data: {
        organizationId: lagostaCriativa.id,
        projectId: bacana.id,
        sharedBy: bacana.userId, // User who owns the project
      }
    })

    console.log('✅ Associação criada com sucesso!')
    console.log(`   Association ID: ${association.id}`)

    // Verify
    const updatedBacana = await db.project.findUnique({
      where: { id: bacana.id },
      include: {
        organizationProjects: {
          include: {
            organization: true
          }
        }
      }
    })

    console.log('\n📊 Verificação:')
    console.log(`   Bacana agora tem ${updatedBacana?.organizationProjects.length} organização(ões)`)
    updatedBacana?.organizationProjects.forEach(op => {
      console.log(`     ✅ ${op.organization.name} (${op.organization.clerkOrgId})`)
    })

    console.log('\n' + '='.repeat(80))
    console.log('🎉 BACANA FOI RESTAURADO!')
    console.log('   O projeto agora deve aparecer na interface.')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

fixBacanaOrganization()
