/**
 * Devolve à janela de congelamento os posts entregues ao Zernio sob a regra
 * ANTIGA — os que hoje estão armados dias antes do horário.
 *
 * CONTEXTO. Até 03/08/2026 o PRE-SEND do executor entregava TODO post futuro
 * assim que ficasse renderizado, sem teto de data (mediana de 39s após o
 * agendamento). A janela de 5 minutos corrigiu isso para o que for agendado
 * dali em diante, mas quem já estava no Zernio continuou lá: para esses,
 * editar o template segue sem efeito e a arte publicada é a antiga.
 * Eram 76 posts no dia do deploy.
 *
 * O QUE FAZ, por post: apaga a publicação no Zernio, limpa `laterPostId` e
 * `lateStatus`. O post volta a SCHEDULED puro — o executor o reentrega 5
 * minutos antes do horário, já com a arte atual.
 *
 * ⚠️  MEXE EM PUBLICAÇÃO REAL. Um post que saia daqui sem voltar para o Zernio
 * e sem `laterPostId` limpo é um post que não publica. Por isso:
 *   - dry-run é o padrão; `--apply` é explícito;
 *   - a limpeza local só acontece DEPOIS do delete remoto confirmar;
 *   - 404 no Zernio conta como sucesso (já não existia lá);
 *   - qualquer outro erro PULA o post e o deixa exatamente como estava;
 *   - `--limite` processa em lotes, para conferir antes de seguir.
 *
 * MARGEM DE SEGURANÇA: recusa post que publica em menos de 30 minutos. Perto
 * do horário não há tempo de reentregar se algo falhar, e o ganho é nulo — ele
 * ia congelar de qualquer jeito.
 *
 * Uso:
 *   npx tsx scripts/drenar-congelados-legado.ts                      # dry-run
 *   npx tsx scripts/drenar-congelados-legado.ts --limite 5           # dry-run dos 5 primeiros
 *   npx tsx scripts/drenar-congelados-legado.ts --apply --limite 5   # aplica em 5
 *   npx tsx scripts/drenar-congelados-legado.ts --apply --projeto 6  # só um cliente
 */
import { PrismaClient } from '@prisma/client'
import { getLaterClient } from '../src/lib/later'
import { LaterNotFoundError } from '../src/lib/later/errors'
import { FREEZE_WINDOW_MS } from '../src/lib/posts/freeze-window'

const db = new PrismaClient()

const APPLY = process.argv.includes('--apply')

const idxLimite = process.argv.indexOf('--limite')
const LIMITE = idxLimite >= 0 ? Number(process.argv[idxLimite + 1]) : null

const idxProjeto = process.argv.indexOf('--projeto')
const PROJETO = idxProjeto >= 0 ? Number(process.argv[idxProjeto + 1]) : null

/** Não mexe em quem publica logo: sem tempo de reentregar se algo falhar. */
const MARGEM_MINIMA_MS = 30 * 60 * 1000

const brt = (d: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'

async function main() {
  const agora = new Date()
  const pisoSeguro = new Date(agora.getTime() + MARGEM_MINIMA_MS)

  const alvos = await db.socialPost.findMany({
    where: {
      status: 'SCHEDULED',
      laterPostId: { not: null },
      scheduledDatetime: { gt: pisoSeguro },
      ...(PROJETO ? { projectId: PROJETO } : {}),
    },
    select: {
      id: true,
      projectId: true,
      laterPostId: true,
      scheduledDatetime: true,
      pageId: true,
      renderStatus: true,
      Project: { select: { name: true } },
    },
    // Mais longe primeiro: mais margem para perceber e corrigir um erro.
    orderBy: { scheduledDatetime: 'desc' },
    ...(LIMITE ? { take: LIMITE } : {}),
  })

  console.log(`${APPLY ? '🔧 APLICANDO' : '🔎 DRY-RUN'} — agora ${brt(agora)}`)
  console.log(`janela de congelamento: ${FREEZE_WINDOW_MS / 60000} min · margem mínima: ${MARGEM_MINIMA_MS / 60000} min\n`)

  if (alvos.length === 0) {
    console.log('nada a drenar.')
    return
  }

  console.log(`${alvos.length} post(s) congelado(s) sob a regra antiga:\n`)
  for (const p of alvos) {
    const horas = ((p.scheduledDatetime!.getTime() - agora.getTime()) / 3600_000).toFixed(1)
    console.log(`  ${p.id}  [${p.Project.name}]  publica ${brt(p.scheduledDatetime)} (em ${horas}h)  render=${p.renderStatus}`)
  }

  if (!APPLY) {
    console.log('\ndry-run: nada foi alterado. Rode com --apply para drenar.')
    console.log('Sugestão: comece com --apply --limite 5 e confira a agenda antes de seguir.')
    return
  }

  console.log('\n──── aplicando ────')
  const laterClient = getLaterClient()
  let drenados = 0
  const falhas: Array<{ id: string; motivo: string }> = []

  for (const p of alvos) {
    try {
      // Apaga no Zernio ANTES de mexer no banco: se o delete falhar, o post
      // continua armado lá e íntegro aqui — publica a arte velha, mas publica.
      try {
        await laterClient.deletePost(p.laterPostId!)
      } catch (error) {
        if (!(error instanceof LaterNotFoundError)) throw error
        // Já não existia por lá — limpar a referência local é seguro.
      }

      // Condicional: se o executor reentregou entre a leitura e agora, o
      // laterPostId mudou e esta limpeza apagaria a referência da entrega NOVA.
      const limpo = await db.socialPost.updateMany({
        where: { id: p.id, laterPostId: p.laterPostId },
        data: { laterPostId: null, lateStatus: null },
      })

      if (limpo.count === 0) {
        falhas.push({ id: p.id, motivo: 'o post mudou durante a execução — deixado como estava' })
        continue
      }

      drenados++
      console.log(`  ✅ ${p.id} [${p.Project.name}] — volta para a janela`)
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      falhas.push({ id: p.id, motivo })
      console.error(`  ❌ ${p.id} [${p.Project.name}] — ${motivo}`)
    }
  }

  console.log(`\n${drenados} drenado(s) · ${falhas.length} falha(s)`)
  if (falhas.length > 0) {
    console.log('\nos que falharam continuam armados no Zernio e vão publicar a arte antiga:')
    for (const f of falhas) console.log(`  ${f.id} — ${f.motivo}`)
  }

  // Conferência: nenhum dos drenados pode ter ficado sem agendamento
  const orfaos = await db.socialPost.count({
    where: { id: { in: alvos.map((p) => p.id) }, status: { not: 'SCHEDULED' } },
  })
  console.log(
    orfaos === 0
      ? '\n✅ conferência: todos seguem SCHEDULED — o executor reentrega 5 min antes do horário.'
      : `\n❌ conferência: ${orfaos} post(s) saíram de SCHEDULED. Investigue AGORA.`,
  )
}

main()
  .catch((error) => {
    console.error('erro fatal:', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
