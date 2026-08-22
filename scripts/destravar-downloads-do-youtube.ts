/**
 * Completa downloads do YouTube que ficaram parados em "downloading".
 *
 * POR QUE ISSO ACONTECE: a última etapa — baixar o MP3 do CDN e subir para o
 * Blob — roda NO NAVEGADOR, porque o CDN do RapidAPI (123tokyo.xyz) responde
 * 404 para IPs de datacenter e só serve IPs residenciais. Se a aba da
 * biblioteca de músicas for fechada antes da transferência, ninguém retoma:
 * nenhum ramo do cron cobre "downloading COM link", e em ~2h o link expira e
 * o job é marcado como falho.
 *
 * Este script faz o papel do navegador. Só funciona de uma máquina com IP
 * RESIDENCIAL — de dentro da Vercel o CDN recusa.
 *
 * Uso:
 *   npx tsx scripts/destravar-downloads-do-youtube.ts              # dry-run
 *   npx tsx scripts/destravar-downloads-do-youtube.ts --confirmar
 *   npx tsx scripts/destravar-downloads-do-youtube.ts --confirmar --job 96
 */

import { db } from '@/lib/db'
import { saveClientDownloadedMp3 } from '@/lib/youtube/video-download-client'

const confirmar = process.argv.includes('--confirmar')
const idxJob = process.argv.indexOf('--job')
const jobEscolhido = idxJob >= 0 ? Number(process.argv[idxJob + 1]) : null

/** O CDN assina o link com uma expiração em `s` (unix). Passou disso, é lixo. */
function expiraEm(link: string): Date | null {
  try {
    const s = new URL(link).searchParams.get('s')
    return s ? new Date(Number(s) * 1000) : null
  } catch {
    return null
  }
}

async function main() {
  const parados = await db.youtubeDownloadJob.findMany({
    where: {
      status: 'downloading',
      musicId: null,
      ...(jobEscolhido ? { id: jobEscolhido } : {}),
    },
    orderBy: { id: 'asc' },
  })

  console.log(`\n${parados.length} download(s) parado(s) em "downloading".\n`)

  for (const job of parados) {
    const rotulo = `job ${job.id} — "${(job.title ?? job.requestedName ?? '—').slice(0, 50)}"`
    const link = job.videoApiJobId

    if (!link?.startsWith('http')) {
      console.log(`⏭️  ${rotulo} — ainda sem link do CDN (o cron cuida deste caso)`)
      continue
    }

    const expira = expiraEm(link)
    if (expira && expira < new Date()) {
      console.log(`⌛ ${rotulo} — link EXPIROU em ${expira.toISOString()}; precisa baixar de novo`)
      continue
    }

    if (!confirmar) {
      console.log(`✅ ${rotulo} — recuperável (link vale até ${expira?.toISOString() ?? '?'})`)
      continue
    }

    try {
      const r = await fetch(link)
      if (!r.ok) throw new Error(`o CDN respondeu ${r.status} (de IP de datacenter isso é esperado)`)
      const buffer = Buffer.from(await r.arrayBuffer())
      if (buffer.length < 10000) throw new Error('arquivo pequeno demais')

      await saveClientDownloadedMp3(job.id, buffer, `${job.title ?? job.id}.mp3`)

      const atualizado = await db.youtubeDownloadJob.findUnique({ where: { id: job.id } })
      console.log(
        `✅ ${rotulo} — ${(buffer.length / 1024 / 1024).toFixed(2)} MB | música #${atualizado?.musicId} | separação enfileirada`
      )
    } catch (erro) {
      console.log(`❌ ${rotulo} — ${erro instanceof Error ? erro.message : erro}`)
    }
  }

  if (!confirmar && parados.length > 0) {
    console.log(`\n⚠️  DRY-RUN. Nada foi gravado. Use --confirmar.`)
  }

  await db.$disconnect()
}

main()
