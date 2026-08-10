/**
 * E2E das tools novas do conector MCP (sessão 31/07/2026):
 * criar-arte → conferir-arte → ajustar-arte → marcar-como-modelo →
 * escolher-modelo → melhorar-arte (serviço + runner real) → ver-melhoria.
 *
 * Protocolo de teste em produção (mesmo das sessões 29-30/07):
 * - Projeto 8 (Lagosta Criativa). Nenhum post é criado — nada chega ao Zernio.
 * - 1 melhoria REAL ao final (créditos + OpenAI), validando o caminho novo
 *   inteiro: startImprovement → runner → textCheck com textos de arte-livre.
 * - Cleanup completo no fim (page + generations), inclusive em caso de erro.
 *
 * Uso: npx dotenv-cli -e .env -- npx tsx scripts/.tmp-test-mcp-arte-tools.ts [--sem-melhoria]
 */
import { db } from '@/lib/db'
import { runMcpTool } from '@/lib/mcp/tools'
import {
  extractExpectedTexts,
  loadExpectedTextsForGeneration,
} from '@/lib/ai/creative-text-verification'
import { startImprovement } from '@/lib/ai/creative-improvement-service'
import { processImprovementInBackground } from '@/lib/ai/creative-improvement-runner'

const PROJECT_ID = 8
// Clerk id REAL do Ciro — créditos são deduzidos deste usuário (mesmo protocolo
// do E2E de 30/07). Project.userId é o id interno e NÃO serve para créditos.
const CLERK_USER_ID = 'user_3348L5utqkVPHDPW0cTFzGzsLnD'
const COM_MELHORIA = !process.argv.includes('--sem-melhoria')

const service = { kind: 'service' as const }

let falhas = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? '  ✓' : '  ✗ FALHOU'} — ${label}`)
  if (!cond) falhas++
}

function parse(result: { isError?: boolean; content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((c) => c.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(`tool falhou: ${text}`)
  return JSON.parse(text)
}

async function main() {
  const generationsCriadas: string[] = []
  let pageId: string | null = null

  try {
    // ── Fase 0: extractExpectedTexts entende as formas da arte-livre ────────
    console.log('\n[fase 0] extractExpectedTexts (puro)')
    const deTextos = extractExpectedTexts({ source: 'arte-livre', textos: { titulo: 'HAPPY HOUR', detalhes: 'Até as 20h' } })
    check(deTextos.includes('HAPPY HOUR') && deTextos.includes('Até as 20h'), 'lê fv.textos (combinação)')
    const deLivres = extractExpectedTexts({ source: 'arte-livre', textosLivres: [{ texto: 'R$ 12,34' }, { texto: 'https://x.com' }] })
    check(deLivres.includes('R$ 12,34') && !deLivres.includes('https://x.com'), 'lê fv.textosLivres e filtra URL')

    // ── Fase 1: listar-modelos (read-only) ──────────────────────────────────
    console.log('\n[fase 1] listar-modelos')
    const modelos = parse(await runMcpTool('listar-modelos', { projectId: PROJECT_ID, incluirNaoMarcadas: true }, service))
    check(typeof modelos.countModelos === 'number', `responde (${modelos.countModelos} modelos, ${modelos.countCandidatas ?? 0} candidatas)`)

    // ── Fase 2: criar-arte (arte-livre com textosLivres, sem foto) ──────────
    console.log('\n[fase 2] criar-arte')
    const arte = parse(await runMcpTool('criar-arte', {
      projectId: PROJECT_ID,
      formato: 'story',
      backgroundColor: '#1a1a2e',
      textosLivres: [
        { texto: 'TESTE MCP — APAGAR', x: 0.1, y: 0.35, width: 0.8, fontSize: 72, role: 'title' },
        { texto: 'R$ 12,34 às 15h45', x: 0.1, y: 0.55, width: 0.8, fontSize: 44, role: 'body' },
      ],
      logo: false,
      name: 'E2E tools MCP — apagar',
    }, service))
    pageId = arte.pageId
    generationsCriadas.push(arte.generationId)
    check(Boolean(arte.generationId && arte.pageId && arte.url), `arte criada (gen=${arte.generationId})`)

    const esperados = await loadExpectedTextsForGeneration(arte.generationId)
    check(esperados.includes('TESTE MCP — APAGAR') && esperados.includes('R$ 12,34 às 15h45'),
      `textos esperados extraídos da Generation (${esperados.length})`)

    // ── Fase 3: conferir-arte (thumbnail + visão) ───────────────────────────
    console.log('\n[fase 3] conferir-arte')
    const conferida = await runMcpTool('conferir-arte', { projectId: PROJECT_ID, generationId: arte.generationId }, service)
    const temImagem = conferida.content.some((c: { type: string }) => c.type === 'image')
    const resumo = JSON.parse(conferida.content.find((c: { type: string }) => c.type === 'text')!.text!)
    check(temImagem, 'resposta traz a miniatura (bloco image)')
    check(resumo.largura === 1080 && resumo.altura === 1920, `dimensões corretas (${resumo.largura}x${resumo.altura})`)
    console.log('    verificacaoTexto:', JSON.stringify(resumo.verificacaoTexto))
    check(typeof resumo.verificacaoTexto === 'object' && resumo.verificacaoTexto.resultado === 'ok',
      'conferência de texto por visão passou')

    // ── Fase 4: ajustar-arte ────────────────────────────────────────────────
    console.log('\n[fase 4] ajustar-arte')
    const ajuste = parse(await runMcpTool('ajustar-arte', {
      projectId: PROJECT_ID,
      pageId,
      slotValues: { 'Texto 1': 'AJUSTADO PELO MCP' },
    }, service))
    generationsCriadas.push(ajuste.generationId)
    check(ajuste.ajustada === true && ajuste.generationId !== arte.generationId, 'nova Generation registrada')
    check(Array.isArray(ajuste.camposAlterados) && ajuste.camposAlterados.includes('Texto 1'),
      `camposAlterados: ${JSON.stringify(ajuste.camposAlterados)}`)
    check(ajuste.postsInvalidados === 0, 'nenhum post invalidado (não há posts com esta página)')
    const esperadosAjuste = await loadExpectedTextsForGeneration(ajuste.generationId)
    check(esperadosAjuste.includes('AJUSTADO PELO MCP') && esperadosAjuste.includes('R$ 12,34 às 15h45'),
      'slotValues finais refletem a página ajustada')

    // ── Fase 5: marcar-como-modelo + escolher-modelo acha por tema ──────────
    console.log('\n[fase 5] marcar-como-modelo')
    const marcada = parse(await runMcpTool('marcar-como-modelo', {
      projectId: PROJECT_ID, pageId, tags: ['teste-mcp-apagar'],
    }, service))
    check(marcada.page.isTemplate === true, 'página virou modelo')
    const escolhido = parse(await runMcpTool('escolher-modelo', {
      projectId: PROJECT_ID, theme: 'teste mcp apagar',
    }, service))
    check(escolhido.page?.id === pageId, 'escolher-modelo encontra o modelo pelo tema')
    const desmarcada = parse(await runMcpTool('marcar-como-modelo', {
      projectId: PROJECT_ID, pageId, marcar: false,
    }, service))
    check(desmarcada.page.isTemplate === false, 'despromovida no fim')

    // ── Fase 6: gates do melhorar-arte (sem custo) ──────────────────────────
    console.log('\n[fase 6] gates do startImprovement')
    try {
      await startImprovement({ generationId: arte.generationId, applyToPostId: 'post-inexistente', actorClerkId: CLERK_USER_ID })
      check(false, 'post inexistente deveria recusar')
    } catch (e: any) {
      check(e?.code === 'POST_NAO_ENCONTRADO', `post inexistente recusado (${e?.code})`)
    }
    try {
      await startImprovement({ generationId: 'gen-inexistente', actorClerkId: CLERK_USER_ID })
      check(false, 'generation inexistente deveria recusar')
    } catch (e: any) {
      check(e?.code === 'GENERATION_NOT_FOUND', `generation inexistente recusada (${e?.code})`)
    }

    if (COM_MELHORIA) {
      // ── Fase 7: melhoria REAL + dedupe + ver-melhoria ─────────────────────
      console.log('\n[fase 7] melhoria real (créditos + ~2 min)')
      const started = await startImprovement({
        generationId: ajuste.generationId,
        userRequest: 'Deixe o fundo com textura sutil e o texto mais integrado, mantendo a sobriedade',
        actorClerkId: CLERK_USER_ID,
        dedupeWindowMinutes: 10,
      })
      generationsCriadas.push(started.jobGenerationId)
      check(!started.reused && Boolean(started.runnerArgs), `job criado (${started.jobGenerationId})`)

      const dup = await startImprovement({
        generationId: ajuste.generationId,
        actorClerkId: CLERK_USER_ID,
        dedupeWindowMinutes: 10,
      })
      check(dup.reused && dup.jobGenerationId === started.jobGenerationId, 'dedupe reaproveita o job em andamento')

      const andamento = parse(await runMcpTool('ver-melhoria', { projectId: PROJECT_ID, melhoriaId: started.jobGenerationId }, service))
      check(andamento.situacao === 'em-andamento', 'ver-melhoria: em-andamento antes do runner')

      console.log('    rodando o runner (aguarde ~2 min)…')
      const t0 = Date.now()
      await processImprovementInBackground(started.runnerArgs!)
      console.log(`    runner terminou em ${Math.round((Date.now() - t0) / 1000)}s`)

      const final = parse(await runMcpTool('ver-melhoria', { projectId: PROJECT_ID, melhoriaId: started.jobGenerationId }, service))
      console.log('    ver-melhoria final:', JSON.stringify({ situacao: final.situacao, verificacaoTexto: final.verificacaoTexto, motivo: final.motivo }))
      check(final.situacao === 'pronta' || final.situacao === 'falhou', 'ver-melhoria reporta desfecho')
      if (final.situacao === 'pronta') {
        check(final.verificacaoTexto === 'passed' || final.verificacaoTexto === 'skipped',
          `textCheck da melhoria: ${final.verificacaoTexto}`)
        check(typeof final.url === 'string' && final.url.length > 0, 'arte melhorada tem URL')
      }
    } else {
      console.log('\n[fase 7] pulada (--sem-melhoria)')
    }
  } finally {
    console.log('\n[cleanup]')
    if (generationsCriadas.length > 0) {
      const del = await db.generation.deleteMany({ where: { id: { in: generationsCriadas } } })
      console.log(`  generations apagadas: ${del.count}/${generationsCriadas.length}`)
    }
    if (pageId) {
      await db.page.delete({ where: { id: pageId } }).then(
        () => console.log('  page de teste apagada'),
        (e) => console.log('  page NÃO apagada:', e?.message),
      )
    }
    await db.$disconnect()
  }

  console.log(falhas === 0 ? '\n✅ E2E passou' : `\n❌ E2E com ${falhas} falha(s)`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\n💥 E2E abortou:', e)
  process.exit(1)
})
