import { db } from '@/lib/db'
db.chatUpload.deleteMany({ where: { id: 'cmsbv24t30001swkmtczfsu4r' } })
  .then((r) => console.log('dev row apagada:', r.count))
  .finally(() => db.$disconnect())
