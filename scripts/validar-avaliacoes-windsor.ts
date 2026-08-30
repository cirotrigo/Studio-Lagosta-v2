/**
 * Valida o ciclo de avaliações do Google (Windsor → AvaliacaoGoogle →
 * rascunhos → aviso) contra o banco REAL, sem mandar WhatsApp nunca.
 *
 * Dry-run por padrão: mostra a coleta sem escrever nada.
 * `--confirmar` grava as avaliações, gera os rascunhos (gpt-4o-mini, sem
 * crédito) e IMPRIME o aviso que o cron mandaria — o envio de verdade fica
 * com o cron das 09h BRT, que tem a trava `avisadaEm`.
 *
 *   npx tsx scripts/validar-avaliacoes-windsor.ts
 *   npx tsx scripts/validar-avaliacoes-windsor.ts --confirmar [--dias 60]
 */
import { db } from '../src/lib/db'
import { coletarAvaliacoesViaWindsor } from '../src/lib/windsor/coleta-avaliacoes'
import { cicloDiarioDeAvaliacoes } from '../src/lib/avaliacoes/ciclo-diario'
import { isWindsorConfigured } from '../src/lib/windsor/client'

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const iDias = process.argv.indexOf('--dias')
  const dias = iDias > -1 ? Number(process.argv[iDias + 1]) || 30 : 30

  if (!isWindsorConfigured()) {
    console.error('WINDSOR_API_KEY ausente no .env — nada a validar.')
    process.exit(1)
  }
  console.log(`Modo: ${confirmar ? 'GRAVAÇÃO (sem WhatsApp)' : 'dry-run'} · janela: ${dias} dias\n`)

  if (!confirmar) {
    const coleta = await coletarAvaliacoesViaWindsor({ sinceDays: dias, dryRun: true })
    if (coleta.erro) {
      console.error('FALHOU:', coleta.erro)
      process.exit(1)
    }
    console.log(`linhas da API: ${coleta.linhasDaApi}`)
    for (const p of coleta.porProjeto) console.log(`  ${p.nome} (projeto ${p.projectId}): ${p.avaliacoes} avaliações`)
    console.log('\nNada foi escrito. Use --confirmar para gravar e gerar rascunhos.')
    return
  }

  // Grava avaliações e gera rascunhos de verdade; o aviso sai só em PREVIEW
  // (enviarAviso: false) — mandar no grupo é papel do cron das 09h BRT.
  const resumo = await cicloDiarioDeAvaliacoes({ sinceDays: dias, enviarAviso: false })

  console.log(`gravadas: ${resumo.coleta.gravadas} de ${resumo.coleta.linhasDaApi} linhas`)
  for (const p of resumo.coleta.porProjeto) console.log(`  ${p.nome}: ${p.avaliacoes}`)
  console.log(`rascunhos gerados: ${resumo.rascunhosGerados}`)

  const amostra = await db.avaliacaoGoogle.findMany({
    where: { respostaSugerida: { not: null } },
    orderBy: [{ estrelas: 'asc' }, { criadaEm: 'desc' }],
    take: 3,
    select: { estrelas: true, autor: true, texto: true, respostaSugerida: true, projectId: true },
  })
  console.log('\n== Amostra de rascunhos ==')
  for (const a of amostra) {
    console.log(`\n[projeto ${a.projectId}] ${'★'.repeat(a.estrelas)} ${a.autor ?? 'anônimo'}: "${(a.texto ?? '').slice(0, 120)}"`)
    console.log(`→ ${a.respostaSugerida}`)
  }

  const pendentes = await db.avaliacaoGoogle.count({ where: { estrelas: { lte: 3 }, respondidaEm: null, avisadaEm: null } })
  console.log(`\nnegativas aguardando aviso do cron: ${pendentes}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
