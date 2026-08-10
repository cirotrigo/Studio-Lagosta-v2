import { db } from '@/lib/db'
async function main() {
  const g = await db.generation.deleteMany({ where: { id: 'cms9v0apr0003jm048ysh6upt' } })
  await db.page.delete({ where: { id: 'cms9v08yn0001jm04oz3hzj80' } }).catch((e) => console.log('page:', e.message))
  console.log(`gen apagadas: ${g.count}; page apagada`)
}
main().finally(() => db.$disconnect())
