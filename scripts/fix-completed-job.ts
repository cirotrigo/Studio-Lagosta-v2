/**
 * Script para corrigir job já processado e criar Generation
 * Execute: npx tsx scripts/fix-completed-job.ts
 */

import { db } from '../src/lib/db'

async function fixCompletedJob() {
  const jobId = 'cmgl0zf9t0002swkwxevo9b9b'

  console.log('🔍 Buscando job:', jobId)

  const job = await db.videoProcessingJob.findUnique({
    where: { id: jobId },
  })

  if (!job) {
    console.error('❌ Job não encontrado')
    return
  }

  console.log('📋 Job encontrado:')
  console.log('  Status:', job.status)
  console.log('  MP4 URL:', job.mp4ResultUrl)
  console.log('  Template ID:', job.templateId)
  console.log('  Project ID:', job.projectId)
  console.log('  User:', job.clerkUserId)

  if (job.status === 'COMPLETED' && job.mp4ResultUrl) {
    console.log('\n✅ Job está completo! Criando Generation...')

    // Verificar se já existe uma Generation
    const existingGen = await db.generation.findFirst({
      where: {
        fieldValues: {
          path: ['originalJobId'],
          equals: jobId,
        },
      },
    })

    if (existingGen) {
      console.log('⚠️  Generation já existe:', existingGen.id)
      console.log('   URL:', existingGen.resultUrl)
      return
    }

    // Criar Generation
    const generation = await db.generation.create({
      data: {
        templateId: job.templateId,
        projectId: job.projectId,
        createdBy: job.clerkUserId,
        status: 'COMPLETED',
        resultUrl: job.mp4ResultUrl,
        fieldValues: {
          videoExport: true,
          originalJobId: job.id,
        },
        templateName: job.videoName,
        completedAt: job.completedAt || new Date(),
        createdAt: job.createdAt,
      },
    })

    console.log('🎉 Generation criada com sucesso!')
    console.log('   ID:', generation.id)
    console.log('   URL:', generation.resultUrl)
    console.log('\n✅ Vídeo agora deve aparecer na aba Criativos!')
  } else {
    console.log('\n⚠️  Job não está completo ou sem MP4 URL')
  }
}

fixCompletedJob()
  .then(() => {
    console.log('\n✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erro:', error)
    process.exit(1)
  })
