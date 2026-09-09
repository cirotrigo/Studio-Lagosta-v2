/** Integração REAL, exclusivamente na instância descartável criada pelo protocolo. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { SpecDePeca } from '@/lib/compositor/spec'

async function main() {
  // Não lê .env, não aceita DATABASE_URL herdada nem conexão remota por argumento.
  const local = 'postgresql://piloto@127.0.0.1:55439/lagosta_pilot'
  process.env.DATABASE_URL = local
  process.env.DIRECT_URL = local
  const { db } = await import('@/lib/db')
  const { enfileirarComposicaoDoPlano } = await import('@/lib/planos/enfileirar-composicao')
  const { reapontarItemDoPlano } = await import('@/lib/compositor/fila')
  const resultados: Array<Record<string, unknown>> = []
  try {
    const identidade = await db.$queryRaw<Array<{ pasta: string }>>`SELECT current_setting('data_directory') AS pasta`
    assert.equal(identidade[0].pasta, resolve('.tmp-medicao-compositor/pgdata'), 'Recusa instância que não pertence a este piloto')
    const versao = await db.$queryRaw<Array<{ version: string }>>`SELECT version()`
    const user = await db.user.create({ data: { clerkId: 'piloto-' + Date.now() } })
    const project = await db.project.create({ data: { name: 'Piloto descartável', userId: user.id } })
    const template = await db.template.create({ data: { name: 'Piloto', projectId: project.id, createdBy: user.id, type: 'STORY', dimensions: '1080x1920', designData: {} } })
    const plano = await db.planoDeConteudo.create({ data: { projectId: project.id, inicio: new Date(), fim: new Date() } })
    const item = await db.itemDePlano.create({ data: { planoId: plano.id, projectId: project.id, formato: 'story', via: 'compor', copyProposta: ['Piloto'] } })
    const spec: SpecDePeca = { projectId: project.id, itemDePlanoId: item.id, planoId: plano.id, formato: 'story', fotosCandidatas: ['foto-a', 'foto-b'], blocos: [{ papel: 'headline', linhas: ['Piloto'] }] }
    const data = { status: 'PROCESSING' as const, templateId: template.id, projectId: project.id, createdBy: user.id, fieldValues: { spec } }
    const t = performance.now()
    const chamadas = await Promise.all(Array.from({ length: 8 }, () => enfileirarComposicaoDoPlano(spec, data, user.id, user.id, item.updatedAt)))
    assert.equal(new Set(chamadas.map((c) => c.generationId)).size, 1)
    assert.equal(await db.generation.count({ where: { projectId: project.id } }), 1)
    assert.equal(await db.generationJob.count({ where: { projectId: project.id } }), 1)
    resultados.push({ caso: '8 enfileiramentos simultâneos, mesmo item/revisão', ms: performance.now() - t, generations: 1, jobs: 1, ok: true })
    const primeira = chamadas[0]
    assert.equal((await enfileirarComposicaoDoPlano(spec, data, user.id, user.id)).jobId, primeira.jobId)
    await db.generation.update({ where: { id: primeira.generationId }, data: { status: 'COMPLETED', resultUrl: 'https://example.invalid/preview.png', fieldValues: { spec: { ...spec, fotosCandidatas: undefined, foto: { driveFileId: 'foto-b' } } } } })
    await db.itemDePlano.update({ where: { id: item.id }, data: { status: 'pronto' } })
    assert.equal((await enfileirarComposicaoDoPlano(spec, data, user.id, user.id)).generationId, primeira.generationId)
    resultados.push({ caso: 'resposta perdida e resultado concluído com spec resolvida', ok: true })

    const rollbackItem = await db.itemDePlano.create({ data: { id: 'rollback-' + Date.now(), planoId: plano.id, projectId: project.id, formato: 'story', via: 'compor' } })
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION piloto_falha_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->'spec'->>'itemDePlanoId' LIKE 'rollback-%' THEN RAISE EXCEPTION 'falha injetada apos Generation'; END IF; RETURN NEW; END $$`)
    await db.$executeRawUnsafe('CREATE TRIGGER piloto_falha BEFORE INSERT ON "GenerationJob" FOR EACH ROW EXECUTE FUNCTION piloto_falha_job()')
    await assert.rejects(enfileirarComposicaoDoPlano({ ...spec, itemDePlanoId: rollbackItem.id }, data, user.id, user.id))
    assert.equal(await db.generation.count({ where: { projectId: project.id } }), 1)
    assert.equal(await db.generationJob.count({ where: { projectId: project.id } }), 1)
    assert.equal((await db.itemDePlano.findUniqueOrThrow({ where: { id: rollbackItem.id } })).generationId, null)
    await db.$executeRawUnsafe('DROP TRIGGER piloto_falha ON "GenerationJob"')
    await enfileirarComposicaoDoPlano({ ...spec, itemDePlanoId: rollbackItem.id }, data, user.id, user.id)
    resultados.push({ caso: 'trigger falha depois de inserir Generation: rollback real, seguido de retomada', ok: true })

    const revisado = await db.itemDePlano.update({ where: { id: item.id }, data: { status: 'editado', copyProposta: ['Nova revisão'] } })
    const novaSpec = { ...spec, blocos: [{ papel: 'headline' as const, linhas: ['Nova revisão'] }] }
    const nova = await enfileirarComposicaoDoPlano(novaSpec, data, user.id, user.id, revisado.updatedAt)
    assert.notEqual(nova.generationId, primeira.generationId)
    resultados.push({ caso: 'conteúdo revisado em estado executável recebe nova geração', ok: true })

    let liberar!: () => void
    let confirmarLock!: () => void
    const gate = new Promise<void>((r) => { liberar = r })
    const lock = new Promise<void>((r) => { confirmarLock = r })
    const edicao = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ItemDePlano" WHERE id = ${item.id} FOR UPDATE`
      confirmarLock()
      await gate
      await tx.itemDePlano.update({ where: { id: item.id }, data: { status: 'editado', tema: 'Edição concorrente' } })
    }, { timeout: 10000 })
    await lock
    const callback = reapontarItemDoPlano(novaSpec, 'pronto', { generationEsperada: nova.generationId, generationId: nova.generationId, pageId: 'pagina-antiga' })
    let esperaObservada = false
    try {
      for (let i = 0; i < 100; i++) {
        const esperando = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = 'lagosta_pilot' AND wait_event_type = 'Lock' AND query LIKE 'UPDATE%ItemDePlano%'`
        if (Number(esperando[0].n) > 0) { esperaObservada = true; break }
        await new Promise((r) => setTimeout(r, 20))
      }
    } finally { liberar() }
    await edicao
    assert.equal(await callback, null)
    assert.equal(esperaObservada, true, 'Callback realmente deve disputar o lock antes da edição confirmar')
    const final = await db.itemDePlano.findUniqueOrThrow({ where: { id: item.id } })
    assert.equal(final.status, 'editado'); assert.equal(final.pageId, null)
    resultados.push({ caso: 'callback disputa lock com edição; CAS não sobrescreve revisão', esperaPostgresObservada: esperaObservada, ok: true })
    writeFileSync('.tmp-medicao-compositor/resultados-postgres.json', JSON.stringify({ versao: versao[0].version, local: '127.0.0.1:55439/lagosta_pilot', resultados }, null, 2))
    console.log('PostgreSQL descartável: ' + resultados.length + ' cenários reais passaram')
  } finally { await db.$disconnect() }
}
main().catch((e) => { console.error('Piloto PostgreSQL falhou:', e.code ?? e.name, e.message?.slice(0, 180)); process.exitCode = 1 })
