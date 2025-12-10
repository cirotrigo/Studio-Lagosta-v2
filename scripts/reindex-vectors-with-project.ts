import { PrismaClient } from '@prisma/client'
import { generateEmbeddings } from '../src/lib/knowledge/embeddings'
import { deleteVector, upsertVectors } from '../src/lib/knowledge/vector-client'

const prisma = new PrismaClient()

async function reindexVectorsWithProject() {
  console.log('🔄 Reindexando vetores com metadata de projeto/categoria...')

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      // Prisma não aceita `not: null` para ints; usar um guard explícito
      projectId: { gt: 0 },
      status: 'ACTIVE',
    },
    include: {
      chunks: true,
    },
  })

  console.log(`📊 Entries encontradas: ${entries.length}`)

  let reindexed = 0
  let errors = 0

  for (const entry of entries) {
    try {
      console.log(`\n➡️  ${entry.title} (${entry.chunks.length} chunks)`)

      // Delete old vectors (regardless of metadata)
      for (const chunk of entry.chunks) {
        await deleteVector(chunk.vectorId)
      }

      const orderedChunks = entry.chunks.sort((a, b) => a.ordinal - b.ordinal)
      const embeddings = await generateEmbeddings(orderedChunks.map((c) => c.content))

      const vectors = orderedChunks.map((chunk, index) => ({
        id: chunk.vectorId,
        vector: embeddings[index],
        metadata: {
          entryId: chunk.entryId,
          ordinal: chunk.ordinal,
          projectId: entry.projectId!,
          category: entry.category,
          status: entry.status,
          userId: entry.userId || undefined,
          workspaceId: entry.workspaceId || undefined,
        },
      }))

      await upsertVectors(vectors)
      reindexed++
      console.log(`✅ Reindexado`)
    } catch (error) {
      errors++
      console.error(`❌ Erro ao reindexar "${entry.title}":`, error)
    }
  }

  console.log('\n📊 RESUMO DA REINDEXAÇÃO:')
  console.log(`✅ Entries reindexadas: ${reindexed}`)
  console.log(`❌ Erros: ${errors}`)
}

reindexVectorsWithProject()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
