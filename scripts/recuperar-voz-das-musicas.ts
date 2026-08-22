/**
 * Recupera a VOZ ISOLADA das músicas que já foram separadas.
 *
 * Até 22/08/2026 a separação do MVSEP devolvia dois arquivos — voz e
 * instrumental —, o cliente baixava os dois, guardava o instrumental e jogava a
 * voz fora. Este script vai atrás da voz que ficou para trás.
 *
 * Dois caminhos, nesta ordem:
 *
 *  1. DE GRAÇA, pelo hash guardado em MusicStemJob.mvsepJobHash. O MVSEP mantém
 *     o resultado por poucos dias (medido em 22/08: o job de 3 dias antes já
 *     respondia "not_found"), então isso alcança só as faixas recentes.
 *
 *  2. REPROCESSANDO no MVSEP (`--reprocessar`), o que devolve a faixa para a
 *     fila do cron. Custa uma separação nova por faixa e o cron processa UMA a
 *     cada 2 minutos — dezenas de faixas levam horas. Por isso é opt-in.
 *
 * A faixa NÃO fica sem áudio enquanto espera: o instrumental atual só é
 * substituído quando a separação nova termina.
 *
 * Uso:
 *   npx tsx scripts/recuperar-voz-das-musicas.ts               # dry-run
 *   npx tsx scripts/recuperar-voz-das-musicas.ts --confirmar   # recupera de graça
 *   npx tsx scripts/recuperar-voz-das-musicas.ts --confirmar --reprocessar
 */

import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { classificarStems, getFileName, getFileUrl } from '@/lib/mvsep/classificar-stems'

const MVSEP_API_KEY = process.env.MVSEP_API_KEY || 'BrIkx8zYQbvc4TggAZbsL96Mag9WN5'
const MVSEP_API_URL = 'https://mvsep.com/api'

const confirmar = process.argv.includes('--confirmar')
const reprocessar = process.argv.includes('--reprocessar')

async function main() {
  const semVoz = await db.musicLibrary.findMany({
    where: { hasInstrumentalStem: true, hasVocalsStem: false },
    include: { stemJob: true },
    orderBy: { id: 'asc' },
  })

  console.log(`\n${semVoz.length} faixas com instrumental e sem voz.\n`)
  if (semVoz.length === 0) return

  const recuperadas: string[] = []
  const expiradas: typeof semVoz = []
  const semHash: typeof semVoz = []

  for (const musica of semVoz) {
    const rotulo = `#${musica.id} ${musica.name}`

    if (!musica.stemJob?.mvsepJobHash) {
      semHash.push(musica)
      console.log(`⏭️  ${rotulo} — sem hash guardado`)
      continue
    }

    const resposta = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${musica.stemJob.mvsepJobHash}`
    )
    const dados: any = await resposta.json().catch(() => ({}))

    if (dados?.status !== 'done' || !dados?.data?.files?.length) {
      expiradas.push(musica)
      console.log(`⌛ ${rotulo} — resultado não está mais no MVSEP (${dados?.status ?? 'sem resposta'})`)
      continue
    }

    const { vocals, criterio } = classificarStems(dados.data.files)
    if (!vocals) {
      expiradas.push(musica)
      console.log(`❓ ${rotulo} — voz não identificada (${criterio})`)
      continue
    }

    const url = getFileUrl(vocals)
    if (!url) {
      expiradas.push(musica)
      console.log(`❓ ${rotulo} — voz sem URL de download`)
      continue
    }

    if (!confirmar) {
      console.log(`✅ ${rotulo} — voz disponível: ${getFileName(vocals)} (${criterio})`)
      recuperadas.push(rotulo)
      continue
    }

    try {
      const audio = await fetch(url)
      if (!audio.ok) throw new Error(`download ${audio.status}`)
      const buffer = Buffer.from(await audio.arrayBuffer())

      const blob = await put(`music/stems/${musica.id}_vocals.mp3`, buffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        addRandomSuffix: true,
      })

      await db.musicLibrary.update({
        where: { id: musica.id },
        data: { vocalsUrl: blob.url, vocalsSize: buffer.length, hasVocalsStem: true },
      })

      console.log(`✅ ${rotulo} — voz salva (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)
      recuperadas.push(rotulo)
    } catch (erro) {
      expiradas.push(musica)
      console.log(`❌ ${rotulo} — falhou: ${erro instanceof Error ? erro.message : erro}`)
    }
  }

  const pendentes = [...expiradas, ...semHash]

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Voz ${confirmar ? 'recuperada' : 'recuperável'} de graça: ${recuperadas.length}`)
  console.log(`Precisam de separação nova:                ${pendentes.length}`)

  if (pendentes.length > 0 && reprocessar) {
    if (!confirmar) {
      console.log(`\n(dry-run) ${pendentes.length} faixas seriam devolvidas à fila.`)
    } else {
      for (const musica of pendentes) {
        if (musica.stemJob) {
          await db.musicStemJob.update({
            where: { id: musica.stemJob.id },
            data: {
              status: 'pending',
              progress: 0,
              error: null,
              mvsepJobHash: null,
              mvsepStatus: null,
              startedAt: null,
              completedAt: null,
            },
          })
        } else {
          await db.musicStemJob.create({
            data: { musicId: musica.id, status: 'pending', progress: 0 },
          })
        }
      }
      console.log(`\n🔁 ${pendentes.length} faixas devolvidas à fila.`)
      console.log(`   O cron processa UMA a cada 2 minutos: ~${Math.ceil(pendentes.length * 2 / 60)}h para a fila toda.`)
      console.log(`   O instrumental atual continua no ar até cada separação terminar.`)
    }
  } else if (pendentes.length > 0) {
    console.log(`\nPara reprocessar essas: --confirmar --reprocessar`)
    console.log(`(uma separação nova por faixa no MVSEP, uma a cada 2 min pelo cron)`)
  }

  if (!confirmar) console.log(`\n⚠️  DRY-RUN. Nada foi gravado. Use --confirmar.`)

  await db.$disconnect()
}

main()
