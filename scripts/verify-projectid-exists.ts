import { PrismaClient } from '../prisma/generated/client'

const prisma = new PrismaClient()

async function verify() {
  console.log('🔍 Verificando se projectId existe em ChatConversation...\n')

  try {
    // Verificar diretamente via SQL
    const result = await prisma.$queryRaw<any[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ChatConversation'
        AND column_name = 'projectId'
    `

    if (result.length > 0) {
      console.log('✅ Campo projectId EXISTE!')
      console.log('\nDetalhes:')
      console.log(`  - Nome: ${result[0].column_name}`)
      console.log(`  - Tipo: ${result[0].data_type}`)
      console.log(`  - Nullable: ${result[0].is_nullable}`)
    } else {
      console.log('❌ Campo projectId NÃO EXISTE')
      console.log('\nVerificando se ALTER TABLE foi executado...')

      // Tentar executar novamente
      console.log('\n🔄 Tentando executar ALTER TABLE novamente...')
      await prisma.$executeRaw`
        ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "projectId" INTEGER
      `
      console.log('✅ Coluna adicionada!')
    }

    // Verificar FKs
    const fks = await prisma.$queryRaw<any[]>`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'ChatConversation'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'ChatConversation_projectId_fkey'
    `

    if (fks.length > 0) {
      console.log('\n✅ Foreign key ChatConversation_projectId_fkey EXISTE')
    } else {
      console.log('\n⚠️  Foreign key ChatConversation_projectId_fkey NÃO EXISTE')
      console.log('Criando...')
      await prisma.$executeRaw`
        ALTER TABLE "ChatConversation"
        ADD CONSTRAINT "ChatConversation_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
      `
      console.log('✅ FK criada!')
    }

    // Verificar índices
    const indexes = await prisma.$queryRaw<any[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'ChatConversation'
        AND indexname LIKE '%projectId%'
    `

    console.log('\n📊 Índices com projectId:')
    if (indexes.length > 0) {
      indexes.forEach((idx) => console.log(`  ✅ ${idx.indexname}`))
    } else {
      console.log('  ⚠️  Nenhum índice encontrado')
      console.log('\nCriando índices...')
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "ChatConversation_projectId_idx"
        ON "ChatConversation"("projectId")
      `
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "ChatConversation_projectId_userId_idx"
        ON "ChatConversation"("projectId", "userId")
      `
      console.log('✅ Índices criados!')
    }
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

verify()
