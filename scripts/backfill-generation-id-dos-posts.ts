/**
 * Backfill: dá Generation à arte dos posts que ainda podem ser revisados.
 *
 * A barra "Revisão da arte" da agenda só existe quando a mídia do post tem uma
 * Generation atrás — e arte que chegou ao Studio como URL pronta (canvas de
 * design renderizado e subido ao Drive, export de outra ferramenta) nunca
 * passou por `upload-creative`, então nunca virou Generation. Foi assim que o
 * carrossel de domingo do Bacana (30/08/2026) ficou sem revisão: 7 slides no
 * Drive, ZERO Generations.
 *
 * `agendarPost` passou a registrar na criação; este script alcança o que já
 * estava lá. Ele NÃO renderiza nada e NÃO cobra crédito — só cataloga o arquivo
 * que o post já tem, reusando `registrarArtesDoPost` (a mesma regra da criação,
 * nunca uma segunda implementação).
 *
 * ⚠️ **Só posts DRAFT e SCHEDULED, de propósito.** O que já foi publicado não é
 * revisado — e o histórico sem vínculo é quase todo import do Zernio (medido em
 * 30/08/2026: 5.714 posts sem `generationId`, dos quais apenas 9 casariam com
 * alguma Generation existente). Registrar aquilo encheria a galeria de
 * Criativos de milhares de peças montadas fora do Studio, que é o oposto do que
 * a galeria é. Na janela revisável são 110 posts e 174 slides.
 *
 * ⚠️ **E só a agenda VIVA** (`--desde`, padrão 7 dias atrás). Medido em
 * 30/08/2026: dos 28 posts alcançados sem janela, 20 eram SCHEDULED de
 * dezembro/2025 e janeiro/2026 — os zumbis que `checkStuckPosts` nunca
 * varreu. Ninguém vai revisar nem publicar aquilo, e catalogar a arte deles
 * jogaria 20 peças mortas na galeria de Criativos de seis clientes, todas com
 * data de hoje. Poluir a superfície curada para consertar o que ninguém olha é
 * o pior dos dois erros.
 *
 * Uso:
 *   npx tsx scripts/backfill-generation-id-dos-posts.ts               # dry-run
 *   npx tsx scripts/backfill-generation-id-dos-posts.ts --projeto 5
 *   npx tsx scripts/backfill-generation-id-dos-posts.ts --desde 2026-01-01
 *   npx tsx scripts/backfill-generation-id-dos-posts.ts --confirmar   # grava
 */

import { db } from '../src/lib/db'
import { lerArtesDoPost, registrarArtesDoPost, ehVideo } from '../src/lib/posts/artes-do-post'

/** Janela padrão: a agenda viva. Post de ontem ainda é revisado; o de dezembro não. */
const DIAS_PARA_TRAS = 7

interface Opcoes {
  confirmar: boolean
  projeto: number | null
  desde: Date
}

function lerOpcoes(argv: string[]): Opcoes {
  const valor = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const projetoBruto = Number(valor('--projeto'))
  const desdeBruto = valor('--desde')
  const desde = desdeBruto ? new Date(`${desdeBruto}T00:00:00.000-03:00`) : null

  return {
    confirmar: argv.includes('--confirmar'),
    projeto: Number.isInteger(projetoBruto) ? projetoBruto : null,
    desde:
      desde && !Number.isNaN(desde.getTime())
        ? desde
        : new Date(Date.now() - DIAS_PARA_TRAS * 24 * 3600_000),
  }
}

interface Placar {
  projectId: number
  nome: string
  posts: number
  /** Posts em que falta Generation para pelo menos uma mídia. */
  postsIncompletos: number
  /** Mídias catalogáveis sem Generation. */
  slidesSemArte: number
  /** Posts cuja coluna `generationId` está vazia e seria preenchida. */
  colunasVazias: number
  registradas: number
  colunasVinculadas: number
}

async function main() {
  const { confirmar, projeto, desde } = lerOpcoes(process.argv.slice(2))

  console.log(
    `\n=== Backfill de arte dos posts revisáveis (${confirmar ? 'GRAVANDO' : 'DRY-RUN'}) ===`,
  )
  console.log(`Janela: agendados a partir de ${desde.toISOString().slice(0, 10)}`)
  if (projeto) console.log(`Projeto: ${projeto}`)

  const posts = await db.socialPost.findMany({
    where: {
      status: { in: ['DRAFT', 'SCHEDULED'] },
      // Post sem data é rascunho recém-criado que ainda não ganhou horário —
      // fica dentro da janela, senão ele nunca seria alcançado.
      OR: [{ scheduledDatetime: { gte: desde } }, { scheduledDatetime: null }],
      ...(projeto ? { projectId: projeto } : {}),
    },
    orderBy: { scheduledDatetime: 'asc' },
    select: {
      id: true,
      projectId: true,
      postType: true,
      status: true,
      scheduledDatetime: true,
      mediaUrls: true,
      generationId: true,
      Project: { select: { name: true } },
    },
  })

  const placares = new Map<number, Placar>()
  const placar = (projectId: number, nome: string): Placar => {
    let p = placares.get(projectId)
    if (!p) {
      p = {
        projectId,
        nome,
        posts: 0,
        postsIncompletos: 0,
        slidesSemArte: 0,
        colunasVazias: 0,
        registradas: 0,
        colunasVinculadas: 0,
      }
      placares.set(projectId, p)
    }
    return p
  }

  const detalhes: string[] = []

  for (const post of posts) {
    const p = placar(post.projectId, post.Project?.name ?? `projeto ${post.projectId}`)
    p.posts += 1

    // Só mídia catalogável entra na conta: vídeo tem trilha própria e `data:`
    // não é arquivo publicado — nem um nem outro vira arte na galeria.
    const catalogaveis = post.mediaUrls.filter((u) => u && !u.startsWith('data:') && !ehVideo(u))
    if (catalogaveis.length === 0) continue

    const artes = await lerArtesDoPost(post.id)
    const semArte = artes.filter(
      (a) => !a.generationId && a.mediaUrl && !a.mediaUrl.startsWith('data:') && !ehVideo(a.mediaUrl),
    )
    const colunaVazia = !post.generationId

    if (semArte.length === 0 && !colunaVazia) continue

    p.postsIncompletos += semArte.length > 0 ? 1 : 0
    p.slidesSemArte += semArte.length
    p.colunasVazias += colunaVazia ? 1 : 0

    const quando = post.scheduledDatetime
      ? post.scheduledDatetime.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : 's/ data'

    if (confirmar) {
      const r = await registrarArtesDoPost(post.id)
      p.registradas += r.registradas
      p.colunasVinculadas += r.colunaVinculada ? 1 : 0
      detalhes.push(
        `  [${post.projectId}] ${post.id} ${post.postType} ${post.status} ${quando} — ` +
          `${r.registradas} arte(s) registrada(s)${r.colunaVinculada ? ', capa vinculada' : ''}`,
      )
    } else {
      detalhes.push(
        `  [${post.projectId}] ${post.id} ${post.postType} ${post.status} ${quando} — ` +
          `${semArte.length} de ${catalogaveis.length} mídia(s) sem arte` +
          `${colunaVazia ? ', coluna vazia' : ''}`,
      )
    }
  }

  console.log(`\n--- Posts alcançados (${detalhes.length}) ---`)
  for (const linha of detalhes.slice(0, 60)) console.log(linha)
  if (detalhes.length > 60) console.log(`  … e mais ${detalhes.length - 60}`)

  console.log('\n--- Placar por cliente ---')
  const ordenados = [...placares.values()].sort((a, b) => b.slidesSemArte - a.slidesSemArte)
  let tPosts = 0
  let tSlides = 0
  let tColunas = 0
  let tRegistradas = 0
  let tVinculadas = 0
  for (const p of ordenados) {
    tPosts += p.postsIncompletos
    tSlides += p.slidesSemArte
    tColunas += p.colunasVazias
    tRegistradas += p.registradas
    tVinculadas += p.colunasVinculadas
    if (p.slidesSemArte === 0 && p.colunasVazias === 0) continue
    console.log(
      `  [${String(p.projectId).padStart(2)}] ${p.nome.slice(0, 24).padEnd(26)} ` +
        `posts=${String(p.posts).padStart(3)} incompletos=${String(p.postsIncompletos).padStart(3)} ` +
        `slidesSemArte=${String(p.slidesSemArte).padStart(3)} colunasVazias=${String(p.colunasVazias).padStart(3)}` +
        (confirmar ? ` → registradas=${p.registradas} vinculadas=${p.colunasVinculadas}` : ''),
    )
  }

  console.log(
    `\nTOTAL: ${tPosts} post(s) incompleto(s), ${tSlides} slide(s) sem arte, ${tColunas} coluna(s) vazia(s)` +
      (confirmar ? ` → ${tRegistradas} registrada(s), ${tVinculadas} vinculada(s)` : ''),
  )
  if (!confirmar) console.log('\n(dry-run — nada foi gravado. Use --confirmar para aplicar.)')
}

main()
  .then(() => db.$disconnect())
  .catch(async (erro) => {
    console.error(erro)
    await db.$disconnect()
    process.exit(1)
  })
