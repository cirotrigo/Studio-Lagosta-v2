/**
 * E2E da geração de arte do zero (Fase 1) — mesmo protocolo do improve E2E:
 * projeto 8 (Lagosta Criativa), caminho real sem sessão Clerk, cleanup ao
 * final. Custa 1 geração gpt-image-2 + créditos do projeto 8.
 *
 * Rodar: npx tsx scripts/.tmp-test-arte-ia-e2e.ts
 */
import { config } from 'dotenv'
config({ path: '.env' })

async function main() {
  const { db } = await import('../src/lib/db')
  const { startArtGeneration } = await import('../src/lib/ai/creative-generation-service')
  const { processArtGenerationInBackground } = await import('../src/lib/ai/creative-generation-runner')

  const PROJECT_ID = 8

  const project = await db.project.findUnique({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, userId: true },
  })
  if (!project) throw new Error('projeto 8 não encontrado')
  const user = await db.user.findUnique({ where: { id: project.userId }, select: { clerkId: true } })
  if (!user?.clerkId) throw new Error('dono do projeto 8 sem clerkId')

  // Foto-sujeito: qualquer imagem do Blob do projeto serve para validar o
  // encanamento (o teste é do pipeline, não da estética).
  const subject = await db.generation.findFirst({
    where: { projectId: PROJECT_ID, status: 'COMPLETED', resultUrl: { contains: 'public.blob.vercel-storage.com' } },
    orderBy: { createdAt: 'desc' },
    select: { resultUrl: true },
  })
  if (!subject?.resultUrl) throw new Error('nenhuma imagem no Blob do projeto 8 para usar de subject')
  console.log('subject:', subject.resultUrl.slice(0, 90))

  const started = await startArtGeneration({
    projectId: PROJECT_ID,
    track: 'arte',
    copy: ['TESTE ARTE IA', 'pipeline fase 1 ok'],
    pedido: 'peça de teste técnico, composição simples e limpa',
    formato: 'story',
    referencias: [{ role: 'subject', url: subject.resultUrl, label: 'imagem de teste' }],
    actorClerkId: user.clerkId,
  })
  console.log('job criado:', started.jobGenerationId, '| reused:', started.reused)
  if (!started.runnerArgs) throw new Error('sem runnerArgs')

  const t0 = Date.now()
  await processArtGenerationInBackground(started.runnerArgs)
  console.log(`runner terminou em ${Math.round((Date.now() - t0) / 1000)}s`)

  const result = await db.generation.findUnique({
    where: { id: started.jobGenerationId },
    select: { status: true, resultUrl: true, fieldValues: true },
  })
  const fv = (result?.fieldValues ?? {}) as Record<string, unknown>
  console.log('status:', result?.status)
  console.log('resultUrl:', result?.resultUrl)
  console.log('textCheck:', fv.textCheck, '| model:', fv.model, '| refs:', JSON.stringify(fv.refsUsadas))
  console.log('prompt gravado?', typeof fv.prompt === 'string' ? `sim (${(fv.prompt as string).length} chars)` : 'NÃO')

  // Cleanup: o teste não deixa lixo na galeria do projeto 8.
  await db.generation.delete({ where: { id: started.jobGenerationId } })
  console.log('cleanup: Generation removida')

  if (result?.status !== 'COMPLETED') {
    console.error('E2E FALHOU — fieldValues:', JSON.stringify(fv, null, 2).slice(0, 2000))
    process.exit(1)
  }
  console.log('✅ E2E OK')
  process.exit(0)
}

main().catch((e) => {
  console.error('E2E erro:', e)
  process.exit(1)
})
