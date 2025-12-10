import { PrismaClient } from '../prisma/generated/client'

const prisma = new PrismaClient()

async function checkChatConversationColumns() {
  console.log('🔍 Verificando colunas de ChatConversation...\n')

  try {
    const columns = await prisma.$queryRaw<
      Array<{
        column_name: string
        data_type: string
        is_nullable: string
      }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ChatConversation'
      ORDER BY ordinal_position
    `

    console.log('📋 Colunas existentes:\n')
    columns.forEach((col) => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(not null)'
      console.log(`  - ${col.column_name}: ${col.data_type} ${nullable}`)
    })

    const hasProjectId = columns.some((col) => col.column_name === 'projectId')

    console.log('\n')
    if (hasProjectId) {
      console.log('✅ Campo projectId JÁ EXISTE no banco')
    } else {
      console.log('❌ Campo projectId NÃO EXISTE no banco')
      console.log('\n📝 Será necessário criar migration para adicionar:')
      console.log('   ALTER TABLE "ChatConversation" ADD COLUMN "projectId" INTEGER;')
      console.log('   ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_projectId_fkey"')
      console.log('     FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;')
      console.log('   CREATE INDEX "ChatConversation_projectId_idx" ON "ChatConversation"("projectId");')
    }
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkChatConversationColumns()
