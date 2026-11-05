/**
 * B1d (checkpoint e): a guarda de envio do contrato semântico num Postgres DE VERDADE.
 *
 * O teste unitário confere o texto do SQL; só o banco diz se o gate decide certo. Este script roda o MESMO
 * fragmento do `sendToLater` (`CONTRATO_PODE_SER_ENVIADO`) dentro do mesmo `UPDATE … RETURNING`, contra o branch
 * de DESENVOLVIMENTO, cada caso numa transação que SEMPRE volta atrás — nada fica gravado.
 *
 *   npx tsx scripts/dev-db.ts npx tsx scripts/validar-guarda-de-envio-da-prova.ts
 *
 * Recusa rodar contra o banco de produção (o compute do `.env`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeDe } from '../src/lib/compute-do-banco'

const VOLTA_ATRAS = 'VOLTA_ATRAS'

async function main() {
  const prodEnv = readFileSync(resolve(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1]
  const alvo = process.env.DATABASE_URL
  if (!alvo || !prodEnv || computeDe(alvo) === computeDe(prodEnv)) {
    console.error('Recusado: rode pelo runner do banco de dev (npx tsx scripts/dev-db.ts npx tsx scripts/validar-guarda-de-envio-da-prova.ts).')
    process.exit(1)
  }
  const { db } = await import('../src/lib/db')
  const { CONTRATO_PODE_SER_ENVIADO } = await import('../src/lib/posts/later-scheduler')

  const [a, b] = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SocialPost" ORDER BY "createdAt" DESC LIMIT 2`
  if (!a || !b) throw new Error('o branch de dev precisa de dois posts')
  const U0 = 'https://prova.test/u0.png'
  const U1 = 'https://prova.test/u1.png'
  const contrato = JSON.stringify({ _slots: { manchete: 'X' } })

  type Caso = { nome: string; espera: number; slotValues: string | null; renderStatus: string; mediaUrls: string[]; renderedImageUrl: string | null; provas: Array<[string, string]>; duasVezes?: boolean }
  const casos: Caso[] = [
    { nome: 'I. contrato + RENDERED + prova DESTE post para a URL atual', espera: 1, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [[a.id, U1]] },
    { nome: 'J. contrato + RENDERED sem prova', espera: 0, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [] },
    { nome: 'K. prova só da URL ANTERIOR', espera: 0, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [[a.id, U0]] },
    { nome: 'L. prova de OUTRO post com a mesma URL', espera: 0, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [[b.id, U1]] },
    { nome: 'M. pedido mudou e invalidou a mídia (PENDING, sem mídia), prova antiga existe', espera: 0, slotValues: contrato, renderStatus: 'PENDING', mediaUrls: [], renderedImageUrl: null, provas: [[a.id, U1]] },
    { nome: 'M2. voltou a rascunho (PENDING com a URL provada ainda lá)', espera: 0, slotValues: contrato, renderStatus: 'PENDING', mediaUrls: [U1], renderedImageUrl: U1, provas: [[a.id, U1]] },
    { nome: 'renderedImageUrl diferente da mídia', espera: 0, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U0, provas: [[a.id, U1], [a.id, U0]] },
    { nome: 'duas mídias (carrossel) com prova da primeira', espera: 0, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1, U0], renderedImageUrl: U1, provas: [[a.id, U1]] },
    { nome: '`_papeis` também exige prova', espera: 0, slotValues: JSON.stringify({ _papeis: { headline: 'X' } }), renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [] },
    { nome: 'N. legado sem prova: como hoje', espera: 1, slotValues: JSON.stringify({ 't-h': 'X' }), renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [] },
    { nome: 'N2. legado com slotValues null: como hoje', espera: 1, slotValues: 'null', renderStatus: 'NOT_NEEDED', mediaUrls: [U1, U0], renderedImageUrl: null, provas: [] },
    { nome: 'N3. legado com slotValues SQL NULL: como hoje', espera: 1, slotValues: null, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [] },
    { nome: 'O. duas execuções: uma reserva só', espera: 1, slotValues: contrato, renderStatus: 'RENDERED', mediaUrls: [U1], renderedImageUrl: U1, provas: [[a.id, U1]], duasVezes: true },
  ]

  let falhas = 0
  for (const c of casos) {
    let obtido: string = ''
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "SocialPost" SET "slotValues" = ${c.slotValues}::jsonb, "renderStatus" = ${c.renderStatus}::"RenderStatus",
            "mediaUrls" = ${c.mediaUrls}::text[], "renderedImageUrl" = ${c.renderedImageUrl},
            "status" = 'SCHEDULED'::"PostStatus", "laterPostId" = NULL
          WHERE "id" = ${a.id}`
        for (const [postId, url] of c.provas) {
          await tx.$executeRaw`INSERT INTO "PostRenderProof" ("postId", "mediaUrl", "layersSnapshot") VALUES (${postId}, ${url}, '[]'::jsonb)`
        }
        const reservar = () => tx.$queryRaw<Array<{ mediaUrls: string[] }>>`
          UPDATE "SocialPost"
          SET "status" = 'POSTING'::"PostStatus", "processingStartedAt" = now(), "updatedAt" = now()
          WHERE "id" = ${a.id}
            AND "laterPostId" IS NULL
            AND "status" NOT IN ('POSTING'::"PostStatus", 'POSTED'::"PostStatus")
            AND ${CONTRATO_PODE_SER_ENVIADO}
          RETURNING "mediaUrls", "slotValues"`
        const primeira = await reservar()
        const segunda = c.duasVezes ? await reservar() : []
        obtido = `${primeira.length}${c.duasVezes ? `+${segunda.length}` : ''}${primeira[0] ? ` mídia=${JSON.stringify(primeira[0].mediaUrls)}` : ''}`
        const ok = primeira.length === c.espera && segunda.length === 0
        if (!ok) falhas++
        console.log(`${ok ? '✓' : '✗'} ${c.nome} → reservas ${obtido} (esperado ${c.espera}${c.duasVezes ? '+0' : ''})`)
        throw new Error(VOLTA_ATRAS)
      })
    } catch (e) {
      if (!(e instanceof Error) || e.message !== VOLTA_ATRAS) {
        falhas++
        console.log(`✗ ${c.nome} → erro: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  const restaram = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM "PostRenderProof" WHERE "mediaUrl" LIKE 'https://prova.test/%'`
  console.log(`\nprovas de teste que restaram no banco: ${restaram[0].n}`)
  await db.$disconnect()
  if (falhas > 0 || restaram[0].n !== 0) process.exit(1)
}

void main()
