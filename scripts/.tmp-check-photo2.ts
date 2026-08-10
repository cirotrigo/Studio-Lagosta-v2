import { db } from '@/lib/db'
async function main() {
  const page = await db.page.findUniqueOrThrow({ where: { id: 'cms9wcgt10001l804a86a9g57' }, select: { layers: true } })
  let v: any = page.layers; let d = 0
  while (typeof v === 'string' && d < 3) { v = JSON.parse(v); d++ }
  const img = v.find((l: any) => l.type === 'image')
  console.log('URL COMPLETA:', img.fileUrl)
}
main().finally(() => db.$disconnect())
