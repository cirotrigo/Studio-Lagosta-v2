import { db } from '@/lib/db'
async function main() {
  const page = await db.page.findUniqueOrThrow({ where: { id: 'cms9wcgt10001l804a86a9g57' }, select: { layers: true } })
  let v: any = page.layers; let d = 0
  while (typeof v === 'string' && d < 3) { v = JSON.parse(v); d++ }
  for (const l of v) {
    if (l.type === 'image' || l.type === 'logo') console.log(`${l.name}: ${l.fileUrl?.slice(0, 120)}`)
  }
}
main().finally(() => db.$disconnect())
