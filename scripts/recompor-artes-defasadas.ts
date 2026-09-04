/**
 * A VARREDURA por conteúdo: quais artes da agenda não batem com a página.
 *
 * O gatilho no PATCH da página cobre daqui para a frente. Esta varredura cobre
 * o que JÁ está parado — em 04/09/2026, 11 das 65 artes agendadas do projeto 8
 * publicariam o texto anterior, e a única forma de descobrir isso era comparar
 * na mão, uma a uma.
 *
 * 🔴 A comparação é de CONTEÚDO, nunca de carimbo de hora. `Page.updatedAt`
 * muda em qualquer escrita: naquele mesmo dia um `update` de `order` em 30
 * páginas apagou o sinal de uma vez só.
 *
 * Caminho: post da agenda → `mediaUrls` → a Generation com aquele `resultUrl`
 * → a página que a gerou → o texto da página contra o `layersSnapshot` da
 * arte. Entrar pelo POST (e não varrendo todas as páginas do projeto) é o que
 * limita a conta às páginas que hoje têm arte na agenda.
 *
 * ⚠️ É LENTO: o levantamento custa três idas ao banco por página, em série.
 * Medido em 04/09/2026 contra produção — 160 páginas levaram ~20 minutos. Rode
 * por projeto (`--projeto`) quando quiser resposta rápida.
 *
 * Dry-run por padrão, como todo script que escreve nesta casa.
 *
 *   npx tsx scripts/recompor-artes-defasadas.ts                  # relatório
 *   npx tsx scripts/recompor-artes-defasadas.ts --projeto 8
 *   npx tsx scripts/recompor-artes-defasadas.ts --projeto 8 --confirmar
 *   npx tsx scripts/recompor-artes-defasadas.ts --fila --confirmar   # deixa o cron trabalhar
 */

import { db } from '@/lib/db'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { medirDefasagem } from '@/lib/compositor/defasagem'
import {
  enfileirarRecomposicaoDaPagina,
  levantarPagina,
  recomporPaginaDefasada,
} from '@/lib/compositor/recompor'

function arg(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  const junto = process.argv.find((a) => a.startsWith(`--${nome}=`))
  return junto ? junto.slice(nome.length + 3) : null
}

const confirmar = process.argv.includes('--confirmar')
const pelaFila = process.argv.includes('--fila')
const projeto = arg('projeto') ? Number(arg('projeto')) : null
const dias = Number(arg('dias') ?? 60)
const limite = Number(arg('limite') ?? 200)

async function main() {
  const agora = new Date()
  const ate = new Date(agora.getTime() + dias * 86_400_000)
  // Um dia para trás: post de ontem que ainda não publicou continua importando;
  // mais que isso é arqueologia, e a arte já foi (ou não vai mais).
  const desde = new Date(agora.getTime() - 86_400_000)

  const posts = await db.socialPost.findMany({
    where: {
      ...(projeto ? { projectId: projeto } : {}),
      status: { in: ['DRAFT', 'SCHEDULED'] },
      laterPostId: null,
      scheduledDatetime: { gte: desde, lte: ate },
    },
    select: { id: true, projectId: true, mediaUrls: true, scheduledDatetime: true },
    orderBy: { scheduledDatetime: 'asc' },
    take: limite,
  })
  const urls = [...new Set(posts.flatMap((p) => p.mediaUrls ?? []))]
  console.log(
    `${posts.length} post(s) na janela (${desde.toISOString().slice(0, 10)} → ${ate.toISOString().slice(0, 10)}), ` +
      `${urls.length} arte(s) distinta(s)${projeto ? ` no projeto ${projeto}` : ''}.`,
  )
  if (urls.length === 0) return

  const geracoes = await db.generation.findMany({
    where: { resultUrl: { in: urls } },
    select: { id: true, resultUrl: true, fieldValues: true },
  })
  const paginas = new Set<string>()
  for (const g of geracoes) {
    const fv = g.fieldValues && typeof g.fieldValues === 'object' ? (g.fieldValues as Record<string, unknown>) : {}
    if (typeof fv.pageId === 'string') paginas.add(fv.pageId)
  }
  console.log(`${geracoes.length} arte(s) reconhecida(s), de ${paginas.size} página(s).`)

  const defasadas: string[] = []
  let emDia = 0
  /**
   * Peça de imagem única: o post RENDERIZA da página e a invalidação já a
   * atende. Contá-la junto com as congeladas faria o relatório parecer sadio
   * sem ter olhado nenhuma arte que corre risco.
   */
  let pelaInvalidacao = 0
  const semComoConferir: string[] = []
  /**
   * Página SEM camada de texto — a arte do canvas de design (`arte-enviada`) é
   * uma imagem em tela cheia, com a copy dentro do PNG. Não há copy editável,
   * então o defeito não se aplica e "sem snapshot" aqui não é exposição
   * nenhuma. Medido em 04/09/2026: as 53 páginas sem snapshot da carteira eram
   * TODAS assim (`source: arte-enviada`, zero camadas de texto) — contá-las
   * como "não deu para conferir" fazia o relatório soar alarmante sem ter
   * nada a alarmar.
   */
  const naoSeAplica: string[] = []

  let conferidas = 0
  for (const pageId of paginas) {
    conferidas++
    // Progresso: sem isto a varredura da carteira inteira fica muda por ~20
    // minutos, e quem roda não sabe se ela travou.
    if (conferidas % 20 === 0) console.log(`  … ${conferidas}/${paginas.size} páginas conferidas`)
    const l = await levantarPagina(pageId)
    if (!l || !l.arte) continue
    if (l.slides.length === 0) {
      pelaInvalidacao++
      continue
    }
    const page = await db.page.findUnique({ where: { id: pageId }, select: { layers: true, name: true } })
    const d = medirDefasagem(page?.layers, l.arte.snapshot)
    if (d.ilegivel) {
      const texto = copyDeCamadas(page?.layers)
      if (texto && Object.keys(texto).length === 0) naoSeAplica.push(`${pageId} — ${l.nome}`)
      else semComoConferir.push(`${pageId} — ${l.nome}`)
      continue
    }
    if (!d.defasada) {
      emDia++
      continue
    }
    defasadas.push(pageId)
    console.log(
      `  ✗ ${l.nome} (${pageId}) — texto mudou em: ${d.papeis.join(', ')}; ` +
        `${l.slides.length} posição(ões) em ${new Set(l.slides.map((s) => s.postId)).size} post(s)` +
        (d.soTexto ? '' : ` | ajustada à mão: ${d.mexidoNaMao.join('; ')}`),
    )
  }

  console.log(
    `\nResumo: ${defasadas.length} defasada(s), ${emDia} congelada(s) em dia, ` +
      `${pelaInvalidacao} atendida(s) pela invalidação (imagem única), ` +
      `${naoSeAplica.length} sem texto editável (o defeito não se aplica), ` +
      `${semComoConferir.length} sem snapshot E com texto (só dá para conferir olhando).`,
  )
  if (semComoConferir.length > 0) {
    console.log('Com texto na página e sem snapshot para comparar:')
    for (const s of semComoConferir.slice(0, 20)) console.log(`  · ${s}`)
  }
  if (defasadas.length === 0) return

  if (!confirmar) {
    console.log('\nDry-run. Rode de novo com --confirmar para refazer estas artes (ou --fila --confirmar para deixar o cron).')
    return
  }

  for (const pageId of defasadas) {
    try {
      if (pelaFila) {
        const pedido = await enfileirarRecomposicaoDaPagina({ pageId, origem: 'varredura' })
        console.log(`  → ${pageId}: ${pedido ? `na fila (job ${pedido.jobId}, ${pedido.slides} posição(ões))` : 'nada a fazer'}`)
        continue
      }
      const r = await recomporPaginaDefasada({ pageId, origem: 'varredura' })
      console.log(
        `  ✓ ${pageId}: ${r.recomposta ? 'recomposta' : 're-renderizada'}, ` +
          `${r.trocados.length} trocado(s)` +
          (r.naoTrocados.length ? `, ${r.naoTrocados.length} não trocado(s) (${r.naoTrocados.map((n) => n.motivo).join('; ')})` : '') +
          (r.congelados.length ? `, ${r.congelados.length} congelado(s)` : '') +
          (r.avisos.length ? `\n      avisos: ${r.avisos.join(' | ')}` : ''),
      )
    } catch (erro) {
      console.log(`  ✗ ${pageId}: ${(erro as Error).message}`)
    }
  }
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
