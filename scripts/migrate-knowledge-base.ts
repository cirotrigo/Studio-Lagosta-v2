/**
 * Script de migração para associar entradas existentes da base de conhecimento a um usuário
 *
 * Este script é útil quando existem entradas sem userId e você precisa associá-las
 * a um usuário específico.
 *
 * Uso:
 * npx tsx scripts/migrate-knowledge-base.ts <CLERK_USER_ID>
 *
 * Exemplo:
 * npx tsx scripts/migrate-knowledge-base.ts user_2abc123xyz
 */

import { db } from '../src/lib/db'

async function migrateKnowledgeBase(clerkUserId: string) {
  console.log('🚀 Iniciando migração da base de conhecimento...\n')

  // Verificar se o usuário existe
  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  })

  if (!user) {
    console.error(`❌ Erro: Usuário com Clerk ID "${clerkUserId}" não encontrado.`)
    console.error('Certifique-se de que o usuário existe no banco de dados.')
    process.exit(1)
  }

  console.log(`✅ Usuário encontrado: ${user.name || user.email || user.id}\n`)

  // Buscar entradas sem userId
  const entriesWithoutUser = await db.knowledgeBaseEntry.findMany({
    where: {
      userId: null,
    },
  })

  console.log(`📊 Entradas sem usuário encontradas: ${entriesWithoutUser.length}`)

  if (entriesWithoutUser.length === 0) {
    console.log('\n✨ Nenhuma entrada precisa ser migrada. Todas as entradas já têm um usuário associado.')
    return
  }

  console.log('\n📝 Detalhes das entradas que serão migradas:')
  entriesWithoutUser.forEach((entry, index) => {
    console.log(`  ${index + 1}. ${entry.title} (${entry.status}) - Criada em: ${entry.createdAt.toLocaleDateString('pt-BR')}`)
  })

  console.log('\n🔄 Atualizando entradas...')

  // Atualizar todas as entradas sem userId
  const result = await db.knowledgeBaseEntry.updateMany({
    where: {
      userId: null,
    },
    data: {
      userId: clerkUserId,
    },
  })

  console.log(`\n✅ Migração concluída com sucesso!`)
  console.log(`📊 Total de entradas migradas: ${result.count}`)
  console.log(`👤 Todas as entradas agora pertencem ao usuário: ${user.name || user.email || clerkUserId}`)
}

// Executar script
const clerkUserId = process.argv[2]

if (!clerkUserId) {
  console.error('❌ Erro: Clerk User ID não fornecido.')
  console.error('\nUso: npx tsx scripts/migrate-knowledge-base.ts <CLERK_USER_ID>')
  console.error('Exemplo: npx tsx scripts/migrate-knowledge-base.ts user_2abc123xyz')
  process.exit(1)
}

migrateKnowledgeBase(clerkUserId)
  .then(() => {
    console.log('\n✨ Script finalizado.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erro durante a migração:', error)
    process.exit(1)
  })
