// Render de SERVIDOR de uma página pela porta real (`renderPageAndRegister`),
// para comparar com o primeiro quadro do vídeo do editor. Uso (o rodar.mjs
// monta o bundle e chama): node render-servidor.cjs <pagina.json>
import fs from 'node:fs'
import { renderPageAndRegister } from '../../src/lib/creatives/persist'

const pagina = JSON.parse(fs.readFileSync(process.argv[2] as string, 'utf8'))
renderPageAndRegister({
  project: { id: 1, name: 'Validação', userId: 'validacao' },
  templateId: 1,
  templateName: 'Validação',
  page: pagina,
  fieldValues: { source: 'validacao' },
  authorName: 'validacao',
}).then(
  () => process.exit(0),
  (erro) => {
    console.error(erro)
    process.exit(1)
  },
)
