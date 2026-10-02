/**
 * Repara os vídeos que a limpeza de 90 dias quebrou.
 *
 * O defeito (medido em 02/10/2026): o export de vídeo guarda o backup do Drive
 * em `fieldValues.driveBackupUrl`, não na coluna `googleDriveBackupUrl`. O
 * Pass B de `cleanupGenerations` lia a coluna, tratava o vídeo como "arte sem
 * backup", reenviava o MP4 ao Drive pelo uploader de IMAGEM (PNG) e trocava
 * `Generation.resultUrl` — e, desde 05/09, as mídias dos posts — por um link
 * lh3 de imagem que responde 404. A limpeza foi consertada (pula vídeo, ver
 * `src/lib/cleanup/geracao-de-video.ts`); este script cuida do que já quebrou.
 *
 * Uso (o `tsx` não carrega arquivo de ambiente sozinho):
 *   npx tsx --env-file=.env scripts/reparar-videos-limpos.ts              # dry-run
 *   npx tsx --env-file=.env scripts/reparar-videos-limpos.ts --confirmar --limpeza-no-ar  # grava
 *
 * 🔴 `--confirmar` SÓ DEPOIS do deploy da limpeza que pula vídeo — por isso ele
 * exige a segunda flag `--limpeza-no-ar`, que é a pessoa afirmando que conferiu.
 * A linha reparada volta a ter `resultUrl` no Blob e continua com a coluna
 * `googleDriveBackupUrl` preenchida (o link morto): é exatamente o que o cron
 * diário `cleanupGenerationBlobs` procura. Com o código antigo no ar ele
 * desfaz o reparo, manda apagar o MP4 e reaponta para o link morto todo post
 * que ainda guarda o MP4 vivo. Como conferir: a resposta do cron de limpeza
 * passa a trazer `videosPulados`.
 *
 * O que ele faz, por Generation de vídeo com `fieldValues.videoUrl`:
 * 1. Confere que o MP4 ainda existe: resposta 2xx E content-type de vídeo E
 *    tamanho > 0. Um 403 com HTML é o desafio anti-bot do Blob, não um MP4
 *    apagado — sai como "não conferido", com o status e o tipo por extenso.
 * 2. MP4 vivo: `resultUrl` volta para `videoUrl`, e os posts que guardam o
 *    endereço morto (o `resultUrl` de hoje, ou a coluna `googleDriveBackupUrl`
 *    numa linha já reparada) voltam para `videoUrl`, por posição e com
 *    compare-and-swap. Os posts primeiro, a Generation por último e só se
 *    nenhum post perdeu a corrida: é o que deixa uma segunda rodada achar o
 *    que faltou.
 * 3. Post entregue ao publicador (`laterPostId`) e ainda NÃO publicado é só
 *    listado: quem vai ao ar é a cópia de lá. Post publicado é registro —
 *    reapontar é seguro.
 * 4. MP4 morto: não há o que restaurar por aqui. Sai por extenso com o backup
 *    de vídeo do Drive (`fieldValues.driveBackupUrl`) e o arquivo que a limpeza
 *    subiu como "PNG" (`googleDriveFileId` — os bytes são os do MP4).
 *
 * Não copia `driveBackupUrl` para `googleDriveBackupUrl`, não limpa a coluna,
 * não cria nem apaga nada, não gasta crédito.
 */
import { db } from '../src/lib/db'
import { substituirUrl } from '../src/lib/cleanup/reapontar-midias-contrato'
import { ehGeracaoDeVideo, videoUrlRegistrado } from '../src/lib/cleanup/geracao-de-video'

const CONFIRMAR = process.argv.includes('--confirmar')
const LIMPEZA_NO_AR = process.argv.includes('--limpeza-no-ar')

interface Conferencia {
  ok: boolean
  status: number
  tipo: string
  bytes: number
}

async function conferirMp4(url: string): Promise<Conferencia> {
  try {
    // GET de 1 byte em vez de HEAD: alguns hosts recusam HEAD, e o
    // `content-range` traz o tamanho total.
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
    const tipo = r.headers.get('content-type') ?? ''
    const total = r.headers.get('content-range')?.split('/')[1] ?? r.headers.get('content-length')
    const bytes = Number(total) || 0
    await r.body?.cancel()
    return { ok: r.ok && tipo.startsWith('video/') && bytes > 0, status: r.status, tipo, bytes }
  } catch (erro) {
    return { ok: false, status: 0, tipo: erro instanceof Error ? erro.message : String(erro), bytes: 0 }
  }
}

/** Em Brasília, que é como a agenda mostra — o ISO cru é UTC e levaria ao horário errado. */
const dia = (d: Date | null | undefined) =>
  d ? `${d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} (Brasília)` : '—'
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`
const campo = (fieldValues: unknown, chave: string) =>
  fieldValues && typeof fieldValues === 'object' ? (fieldValues as Record<string, unknown>)[chave] : undefined

async function main() {
  if (CONFIRMAR && !LIMPEZA_NO_AR) {
    console.error(
      'Recusado: --confirmar exige também --limpeza-no-ar.\n' +
        'Antes do deploy da limpeza que pula vídeo, o cron diário desfaz este reparo e quebra os posts\n' +
        'que ainda guardam o MP4 vivo. Confira que a resposta do cron de limpeza já traz videosPulados\n' +
        'e rode de novo com as duas flags.',
    )
    process.exit(1)
  }
  console.log(CONFIRMAR ? '🔴 GRAVANDO' : 'dry-run (nada é gravado)')

  // Filtro Json POSITIVO: aqui só interessa a linha que TEM o campo. Quem
  // decide é o mesmo predicado da limpeza.
  const candidatas = await db.generation.findMany({
    where: {
      OR: [
        { fieldValues: { path: ['isVideo'], equals: true } },
        { fieldValues: { path: ['videoExport'], equals: true } },
      ],
    },
    select: {
      id: true, projectName: true, status: true, createdAt: true, resultUrl: true,
      fieldValues: true, googleDriveBackupUrl: true, googleDriveFileId: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  const videos = candidatas.filter((g) => ehGeracaoDeVideo(g.fieldValues))

  const semRegistro = videos.filter(
    (g) => !videoUrlRegistrado(g.fieldValues) && g.googleDriveBackupUrl !== null,
  )
  // A assinatura da limpeza é a COLUNA preenchida. `resultUrl` diferente do MP4
  // com a coluna vazia é outra história (job que falhou e deixou outra coisa em
  // resultUrl): só informa, nunca escreve.
  const afetadas = videos.filter((g) => videoUrlRegistrado(g.fieldValues) !== null && g.googleDriveBackupUrl !== null)
  const divergentes = videos.filter((g) => {
    const mp4 = videoUrlRegistrado(g.fieldValues)
    return mp4 !== null && g.googleDriveBackupUrl === null && g.resultUrl !== mp4
  })
  console.log(
    `vídeos: ${videos.length} | tocados pela limpeza: ${afetadas.length} | tocados e sem videoUrl registrado: ${semRegistro.length}` +
      ` | resultUrl diferente do MP4 sem ter passado pela limpeza (só informo): ${divergentes.length}`,
  )

  const placar = { geracoes: 0, jaRestauradas: 0, mortas: 0, naoConferidas: 0, posts: 0, noPublicador: 0, perdidos: 0 }

  for (const g of afetadas) {
    const mp4 = videoUrlRegistrado(g.fieldValues)!
    const restaurar = g.resultUrl !== mp4
    const conf = await conferirMp4(mp4)
    const cabecalho = `${g.id} | ${g.projectName ?? '—'} | criada ${dia(g.createdAt)}`

    // O endereço morto: o resultUrl de hoje e, na linha já reparada, a coluna
    // que a limpeza preencheu.
    const mortos = [...new Set([g.resultUrl, g.googleDriveBackupUrl])].filter(
      (u): u is string => typeof u === 'string' && u !== mp4,
    )
    const posts = mortos.length
      ? await db.socialPost.findMany({
          where: { OR: [{ mediaUrls: { hasSome: mortos } }, { renderedImageUrl: { in: mortos } }] },
          select: {
            id: true, status: true, postType: true, mediaUrls: true, renderedImageUrl: true,
            laterPostId: true, sentAt: true, scheduledDatetime: true,
          },
        })
      : []

    if (!conf.ok) {
      // 403/429/5xx não provam que o MP4 sumiu; 404/410 provam.
      const morto = conf.status === 404 || conf.status === 410
      if (morto) placar.mortas++
      else placar.naoConferidas++
      console.log(`\n${morto ? '✖ MP4 MORTO' : '? MP4 NÃO CONFERIDO'} — ${cabecalho}`)
      console.log(`    videoUrl: ${mp4}`)
      console.log(`    resposta: HTTP ${conf.status} | ${conf.tipo || 'sem content-type'} | ${conf.bytes} bytes`)
      console.log(`    resultUrl hoje: ${g.resultUrl ?? '—'}`)
      console.log(`    backup de vídeo no Drive (fieldValues.driveBackupUrl): ${campo(g.fieldValues, 'driveBackupUrl') ?? '—'}`)
      console.log(`    arquivo que a limpeza subiu como PNG (googleDriveFileId): ${g.googleDriveFileId ?? '—'}`)
      // São estes posts que vão falhar na publicação — e aqui não há para onde reapontar.
      for (const post of posts) {
        console.log(`    post ${post.status} ${post.id} (${post.postType}, ${dia(post.scheduledDatetime ?? post.sentAt)}) guarda o link morto — NÃO mexo`)
      }
      continue
    }

    if (!restaurar) placar.jaRestauradas++
    else if (!CONFIRMAR) placar.geracoes++
    console.log(`\n${restaurar ? '▸ RESTAURAR' : '· já restaurada'} — ${cabecalho} | MP4 vivo (${conf.tipo}, ${mb(conf.bytes)})`)
    if (restaurar) {
      console.log(`    resultUrl hoje: ${g.resultUrl ?? '—'}`)
      console.log(`    volta para:     ${mp4}`)
    }

    let perdidosAqui = 0
    for (const post of posts) {
      const rotulo = `${post.status} ${post.id} (${post.postType}, ${dia(post.scheduledDatetime ?? post.sentAt)})`
      // POSTING é o envio em andamento: o publicador já leu as mídias antigas,
      // e trocar a URL aqui diria "reparado" enquanto o link morto vai ao ar.
      if (post.status === 'POSTING' || (post.status !== 'POSTED' && post.laterPostId)) {
        placar.noPublicador++
        console.log(
          `    post ${rotulo} — ${post.laterPostId ? `já no publicador (${post.laterPostId})` : 'sendo enviado agora'} e não publicado: NÃO mexo`,
        )
        continue
      }
      let novas = post.mediaUrls
      for (const morto of mortos) novas = substituirUrl(novas, morto, mp4).novas
      const trocaRender = post.renderedImageUrl !== null && mortos.includes(post.renderedImageUrl)
      console.log(`    post ${rotulo} → reapontar`)
      if (!CONFIRMAR) {
        placar.posts++
        continue
      }
      const r = await db.socialPost.updateMany({
        // O estado de publicação entra no compare-and-swap: se o envio começou
        // entre a leitura e esta escrita, perde a corrida em vez de contar como reparado.
        where: { id: post.id, mediaUrls: { equals: post.mediaUrls }, status: post.status, laterPostId: post.laterPostId },
        data: { mediaUrls: novas, ...(trocaRender ? { renderedImageUrl: mp4 } : {}) },
      })
      if (r.count === 1) placar.posts++
      else {
        perdidosAqui++
        placar.perdidos++
        console.log(`      ⚠️  PERDIDO no compare-and-swap (as mídias ou o envio mudaram no meio): post ${post.id} — confira se ele foi ao publicador com o link morto`)
      }
    }

    if (CONFIRMAR && restaurar) {
      if (perdidosAqui > 0) {
        console.log(`      ⚠️  Generation ${g.id} NÃO restaurada: há post perdido. Rode de novo.`)
        continue
      }
      const r = await db.generation.updateMany({
        where: { id: g.id, resultUrl: g.resultUrl },
        data: { resultUrl: mp4 },
      })
      if (r.count === 1) placar.geracoes++
      else {
        placar.perdidos++
        console.log(`      ⚠️  PERDIDA no compare-and-swap (resultUrl mudou no meio): Generation ${g.id}`)
      }
    }
  }

  if (divergentes.length) {
    console.log('\n? resultUrl diferente do MP4, SEM ter passado pela limpeza (não mexo):')
    for (const g of divergentes) {
      console.log(`  • ${g.id} | ${g.projectName ?? '—'} | ${g.status} | criada ${dia(g.createdAt)} | resultUrl: ${g.resultUrl ?? '—'}`)
    }
  }

  if (semRegistro.length) {
    console.log('\n? tocados pela limpeza e SEM fieldValues.videoUrl (não há para onde voltar):')
    for (const g of semRegistro) {
      console.log(`  • ${g.id} | ${g.projectName ?? '—'} | criada ${dia(g.createdAt)} | resultUrl: ${g.resultUrl ?? '—'} | googleDriveFileId: ${g.googleDriveFileId ?? '—'}`)
    }
  }

  console.log(
    `\n${CONFIRMAR ? '✅ gravado' : 'seriam gravados'} — Generations restauradas: ${placar.geracoes} | já restauradas: ${placar.jaRestauradas} | posts reapontados: ${placar.posts}` +
      ` | posts no publicador (não mexidos): ${placar.noPublicador} | MP4 morto: ${placar.mortas} | MP4 não conferido: ${placar.naoConferidas}` +
      (CONFIRMAR ? ` | perdidos no compare-and-swap: ${placar.perdidos}` : ''),
  )
  if (!CONFIRMAR) console.log('Para gravar: --confirmar --limpeza-no-ar — só depois do deploy da limpeza que pula vídeo.')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
