/**
 * Semeia o rodízio do acervo (`PhotoUsage`) com o histórico de posts PUBLICADOS.
 *
 * O rodízio nasceu zerado em 12/08/2026: até ali nada escrevia o uso das fotos,
 * então toda foto do acervo responde "nunca usada" — inclusive as que já foram
 * ao ar. Este script reconstrói o que dá do passado.
 *
 * ⚠️ O RENDIMENTO É BAIXO, E ISSO É O ACHADO. Medido em 12/08/2026 contra a
 * produção: dos **7.832 posts publicados, 7.769 (99,2%) NÃO têm vínculo
 * recuperável** com uma foto do Drive. A razão é estrutural e já conhecida —
 * a maior parte das peças foi montada FORA do Studio, e `/api/external/posts`
 * aceita só `mediaUrls` e `caption`. Não há de onde tirar o id da foto.
 *
 * Sobram três fontes, nesta ordem de confiança:
 *
 * | fonte                                   | posts | período           |
 * |-----------------------------------------|------:|-------------------|
 * | 1. `Page.layers` com `drive-cache/{id}` |    47 | 26/03/26–09/08/26 |
 * | 2. `Generation.fieldValues.referencias` |    14 | 10/08/26–12/08/26 |
 * | 3. `backgroundImageUrl` (nome do arqui.)|     2 | 05/08–07/08       |
 *
 * A fonte 3 NÃO é usada: ela guarda uma URL do Blob com o nome original do
 * arquivo, e casá-lo com o catálogo por NOME é heurística — dois arquivos
 * podem repetir nome entre pastas, e uma marcação errada empurra para o fim da
 * fila uma foto que nunca foi usada. Duas linhas não pagam esse risco.
 *
 * O `usedAt` é a data REAL da publicação, nunca `now()`: semear tudo como
 * "usado hoje" faria o rodízio achar que o acervo inteiro acabou de sair.
 *
 * USO
 *   npx tsx scripts/semear-uso-de-fotos.ts              # dry-run: só conta
 *   npx tsx scripts/semear-uso-de-fotos.ts --confirmar  # grava
 *   npx tsx scripts/semear-uso-de-fotos.ts --projeto 6
 *   npx tsx scripts/semear-uso-de-fotos.ts --desfazer   # remove o que ELE gravou
 */
import 'dotenv/config'
import { PrismaClient } from '../prisma/generated/client'
import { lerCamadas } from '../src/lib/posts/page-layers'

const db = new PrismaClient()

const ORIGEM = 'historico'
const confirmar = process.argv.includes('--confirmar')
const desfazer = process.argv.includes('--desfazer')
const projetoArg = process.argv.indexOf('--projeto')
const projetoFiltro = projetoArg >= 0 ? Number(process.argv[projetoArg + 1]) : null

/**
 * Extrai o id do Drive de uma URL de camada.
 *
 * A cópia permanente é `drive-cache/{fileId}-s1920.jpg` — o `-s` do sufixo é o
 * separador, e o id não contém hífen seguido de `s` + dígitos. O formato
 * `/api/google-drive/image/{id}` também é aceito, embora não apareça no
 * histórico (as camadas antigas foram reapontadas para o cache em 01/08).
 */
function idDoDrive(url: string): string | null {
  const cache = url.match(/drive-cache\/([A-Za-z0-9_-]+?)-s\d+\./)
  if (cache?.[1]) return cache[1]
  const api = url.match(/\/api\/google-drive\/image\/([A-Za-z0-9_-]+)/)
  return api?.[1] ?? null
}

/** Todas as URLs de imagem que aparecem nas camadas da página. */
function fotosDaPagina(layers: unknown): string[] {
  const achados: string[] = []
  const visitar = (v: unknown) => {
    if (typeof v === 'string') {
      const id = idDoDrive(v)
      if (id) achados.push(id)
      return
    }
    if (Array.isArray(v)) return v.forEach(visitar)
    if (v && typeof v === 'object') Object.values(v).forEach(visitar)
  }
  visitar(layers)
  return [...new Set(achados)]
}

async function main() {
  if (desfazer) {
    const alvo = { origem: ORIGEM, ...(projetoFiltro ? { projectId: projetoFiltro } : {}) }
    const quantas = await db.photoUsage.count({ where: alvo })
    console.log(`\n${quantas} linha(s) de origem "${ORIGEM}"${projetoFiltro ? ` no projeto ${projetoFiltro}` : ''}.`)
    if (!confirmar) {
      console.log('Nada removido. Repita com --confirmar.\n')
      return
    }
    const r = await db.photoUsage.deleteMany({ where: alvo })
    console.log(`✓ ${r.count} removida(s).\n`)
    return
  }

  const posts = await db.socialPost.findMany({
    where: {
      status: 'POSTED',
      ...(projetoFiltro ? { projectId: projetoFiltro } : {}),
      OR: [{ pageId: { not: null } }, { generationId: { not: null } }],
    },
    select: {
      id: true,
      projectId: true,
      pageId: true,
      generationId: true,
      sentAt: true,
      scheduledDatetime: true,
      createdAt: true,
      caption: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const pageIds = posts.map((p) => p.pageId).filter((x): x is string => !!x)
  const genIds = posts.map((p) => p.generationId).filter((x): x is string => !!x)
  const [paginas, geracoes] = await Promise.all([
    db.page.findMany({ where: { id: { in: pageIds } }, select: { id: true, layers: true } }),
    db.generation.findMany({ where: { id: { in: genIds } }, select: { id: true, fieldValues: true } }),
  ])
  const porPagina = new Map(paginas.map((p) => [p.id, p]))
  const porGeracao = new Map(geracoes.map((g) => [g.id, g]))

  interface Achado {
    projectId: number
    driveFileId: string
    usedAt: Date
    tema: string | null
    fonte: 'pagina' | 'referencias'
  }
  const achados: Achado[] = []
  let ilegiveis = 0

  for (const post of posts) {
    const quando = post.sentAt ?? post.scheduledDatetime ?? post.createdAt
    const tema = post.caption?.slice(0, 120) ?? null

    // Fonte 1: as camadas da página apontam para a cópia permanente do Drive.
    if (post.pageId) {
      const pg = porPagina.get(post.pageId)
      if (pg) {
        // `lerCamadas` distingue "página sem texto" de "não consegui ler" — a
        // string é dupla-codificada e um parse ingênuo devolve [] em silêncio.
        const camadas = lerCamadas(pg.layers)
        if (!camadas.legivel) ilegiveis++
        for (const id of fotosDaPagina(camadas.camadas)) {
          achados.push({ projectId: post.projectId, driveFileId: id, usedAt: quando, tema, fonte: 'pagina' })
        }
      }
    }

    // Fonte 2: as referências declaradas da geração (arte-ia).
    if (post.generationId) {
      const g = porGeracao.get(post.generationId)
      const fv = (g?.fieldValues ?? {}) as Record<string, unknown>
      const refs = Array.isArray(fv.referencias) ? (fv.referencias as Array<Record<string, unknown>>) : []
      for (const r of refs) {
        if (typeof r.driveFileId === 'string' && r.driveFileId) {
          achados.push({
            projectId: post.projectId,
            driveFileId: r.driveFileId,
            usedAt: quando,
            tema,
            fonte: 'referencias',
          })
        }
      }
    }
  }

  // Uma linha por (projeto, foto, dia): o mesmo post pode citar a foto em mais
  // de uma camada, e isso é UM uso.
  const unicos = new Map<string, Achado>()
  for (const a of achados) {
    const chave = `${a.projectId}|${a.driveFileId}|${a.usedAt.toISOString().slice(0, 10)}`
    if (!unicos.has(chave)) unicos.set(chave, a)
  }

  const porFonte = new Map<string, number>()
  const porProjeto = new Map<number, number>()
  for (const a of unicos.values()) {
    porFonte.set(a.fonte, (porFonte.get(a.fonte) ?? 0) + 1)
    porProjeto.set(a.projectId, (porProjeto.get(a.projectId) ?? 0) + 1)
  }

  console.log(`\n${posts.length} posts publicados com página ou geração ligada.`)
  if (ilegiveis > 0) console.log(`⚠️  ${ilegiveis} página(s) com camadas ilegíveis — puladas, nunca contadas como "sem foto".`)
  console.log(`\n${unicos.size} uso(s) de foto reconstituído(s):`)
  for (const [f, n] of porFonte) console.log(`   ${f.padEnd(14)} ${n}`)
  console.log('\npor cliente:')
  for (const [pid, n] of [...porProjeto].sort((a, b) => b[1] - a[1])) console.log(`   projeto ${String(pid).padEnd(4)} ${n}`)

  if (unicos.size === 0) {
    console.log('\nNada a semear.\n')
    return
  }
  if (!confirmar) {
    console.log('\nNada foi gravado. Repita com --confirmar.\n')
    return
  }

  // Idempotência: não regravar o que uma passada anterior já semeou.
  const jaTem = await db.photoUsage.findMany({
    where: { origem: ORIGEM, ...(projetoFiltro ? { projectId: projetoFiltro } : {}) },
    select: { projectId: true, driveFileId: true, usedAt: true },
  })
  const existentes = new Set(
    jaTem.map((j) => `${j.projectId}|${j.driveFileId}|${j.usedAt.toISOString().slice(0, 10)}`),
  )
  const novos = [...unicos.entries()].filter(([chave]) => !existentes.has(chave)).map(([, a]) => a)
  if (novos.length === 0) {
    console.log('\nTudo já estava semeado — nada a fazer.\n')
    return
  }

  const r = await db.photoUsage.createMany({
    data: novos.map((a) => ({
      projectId: a.projectId,
      driveFileId: a.driveFileId,
      usedAt: a.usedAt,
      origem: ORIGEM,
      tema: a.tema,
    })),
  })
  console.log(`\n✓ ${r.count} linha(s) gravada(s) (${unicos.size - novos.length} já existiam).`)
  console.log('  Desfazer: npx tsx scripts/semear-uso-de-fotos.ts --desfazer --confirmar\n')
}

main()
  .catch((e) => {
    console.error('\n❌', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
