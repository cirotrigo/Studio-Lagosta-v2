import { db } from '@/lib/db'
db.chatUpload.deleteMany({ where: { id: 'cmsbvbcog0001l304azu0e6aw' } })
  .then((r) => console.log('smoke row apagada:', r.count))
  .finally(() => db.$disconnect())
