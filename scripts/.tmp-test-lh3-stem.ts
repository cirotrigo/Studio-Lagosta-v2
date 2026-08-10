/**
 * Testa se o miolo do thumbnailLink (lh3.googleusercontent.com/drive-storage/…)
 * é estável por arquivo: pega os pares conhecidos (Generation.fieldValues com
 * imageUrl lh3 + driveImageId), busca o thumbnailLink ATUAL do mesmo fileId e
 * compara os stems (sem o sufixo =sNNN). Só lê.
 */
import { db } from '@/lib/db'
import { googleDriveService } from '@/server/google-drive-service'

const LH3 = /lh3\.googleusercontent\.com\//

function stem(url: string): string {
  return url.replace(/=s\d+(-[a-z]+)?$/, '')
}

async function main() {
  const gens = await db.generation.findMany({
    where: { projectId: { in: [3, 6, 7] } },
    select: { id: true, projectId: true, fieldValues: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const pares: Array<{ genId: string; projectId: number; url: string; driveId: string; createdAt: Date }> = []
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    if (
      typeof fv.imageUrl === 'string' &&
      LH3.test(fv.imageUrl) &&
      typeof fv.driveImageId === 'string' &&
      fv.driveImageId
    ) {
      pares.push({ genId: g.id, projectId: g.projectId, url: fv.imageUrl, driveId: fv.driveImageId, createdAt: g.createdAt })
    }
  }
  console.log(`pares (imageUrl lh3 + driveImageId) nas Generations: ${pares.length}`)

  // dedup por driveId, mantendo o mais antigo (URL mais distante no tempo = teste mais forte)
  const porDrive = new Map<string, (typeof pares)[number]>()
  for (const p of pares) {
    const cur = porDrive.get(p.driveId)
    if (!cur || p.createdAt < cur.createdAt) porDrive.set(p.driveId, p)
  }

  let iguais = 0
  let diferentes = 0
  for (const p of [...porDrive.values()].slice(0, 12)) {
    try {
      const meta = (await googleDriveService.getFileMetadata(p.driveId, 'thumbnailLink')) as {
        thumbnailLink?: string
      }
      if (!meta.thumbnailLink) {
        console.log(`  ${p.driveId}: SEM thumbnailLink atual`)
        continue
      }
      const antigo = stem(p.url)
      const atual = stem(meta.thumbnailLink)
      const ok = antigo === atual
      ok ? iguais++ : diferentes++
      console.log(
        `  ${p.driveId} proj=${p.projectId} gen=${p.createdAt.toISOString().slice(0, 10)}: ${ok ? 'STEM IGUAL' : 'STEM DIFERENTE'}`,
      )
      if (!ok) {
        console.log(`    antigo: ${antigo.slice(0, 110)}`)
        console.log(`    atual : ${atual.slice(0, 110)}`)
      }
    } catch (e) {
      console.log(`  ${p.driveId}: erro ${(e as Error).message.slice(0, 80)}`)
    }
  }
  console.log(`\nstems iguais: ${iguais}, diferentes: ${diferentes}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
