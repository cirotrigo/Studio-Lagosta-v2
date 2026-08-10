/**
 * Lista o Blob store atrás de uploads da era RW (mar-abr/2026) que possam ser
 * as fotos de fundo expurgadas do Drive (gnocchi, fish & chips, mesa RW).
 * Também imprime a URL completa das camadas blob conhecidas (formato do path).
 * Só lê.
 */
import { list } from '@vercel/blob'
import { db } from '@/lib/db'

function parseLayers(raw: unknown): any[] {
  let v: unknown = raw
  let d = 0
  while (typeof v === 'string' && d < 3) {
    try {
      v = JSON.parse(v)
      d++
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? v : []
}

async function main() {
  // formato do path dos uploads conhecidos
  for (const id of ['cmn7s0b7j0001swcks2kl813o', 'cmnifps8p000xswnvftl5ff7g']) {
    const p = await db.page.findUnique({ where: { id }, select: { name: true, layers: true } })
    for (const l of parseLayers(p?.layers)) {
      if (typeof l.fileUrl === 'string' && l.fileUrl.includes('/uploads/'))
        console.log(`página "${p?.name}" camada "${l.name}": ${l.fileUrl}`)
    }
  }

  // listagem completa do store por prefixo uploads/ (para grep externo)
  let cursor: string | undefined
  let total = 0
  const linhas: string[] = []
  do {
    const res = await list({ prefix: 'uploads/', cursor, limit: 1000 })
    total += res.blobs.length
    for (const b of res.blobs) linhas.push(`${b.pathname}\t${b.size}\t${b.uploadedAt}\t${b.url}`)
    cursor = res.cursor ?? undefined
  } while (cursor)
  console.log(`\nuploads/ no store: ${total}`)
  const fs = await import('fs')
  fs.writeFileSync(process.env.BLOB_LIST_OUT ?? '/tmp/blob-uploads.tsv', linhas.join('\n'))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
