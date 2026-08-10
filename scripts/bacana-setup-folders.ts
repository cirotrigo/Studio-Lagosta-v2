/**
 * Cria a estrutura completa de pastas do acervo Bacana no Google Drive.
 * Seguro de rodar múltiplas vezes — pula pastas que já existem.
 *
 * Uso: npx dotenv-cli -e .env -- npx tsx scripts/bacana-setup-folders.ts
 */
import { googleDriveService } from '../src/server/google-drive-service'
import * as fs from 'fs'
import * as path from 'path'

const ROOT_ID = '1odItv9IZ1IUHl7r0ux19iWjGigqDHoQ3' // BACANA CHURRASCARIA

// Estrutura completa de pastas
// Formato: [nome, [subpastas...]]
type FolderDef = [string, FolderDef[]?]

const STRUCTURE: FolderDef[] = [
  ['_sistema', [
    ['manifests'],
    ['logs'],
    ['guias-de-referencia'],
  ]],
  ['00_Cardapio', [
    ['Paginas-e-Capas'],
    ['PDFs-Completos'],
  ]],
  ['01_Carnes', [
    ['No-Espeto', [
      ['Picanha-Bovina'],
      ['Picanha-Suina'],
      ['Ancho'],
      ['Alcatra'],
      ['Maminha'],
      ['Fraldinha'],
      ['Cordeiro'],
      ['Espeto-Misto'],
    ]],
    ['Chapas'],
    ['Chapas-Especiais'],
    ['Cortes-Especiais'],
    ['Pratos-Especiais-Recheados'],
    ['Pratos-Especiais-com-Molho'],
    ['Pratos-Montados'],
  ]],
  ['02_Outros-Pratos', [
    ['Almoco-Bacana'],
    ['Executivos'],
    ['Kids-Bacaninha'],
    ['Grandes-Porcoes'],
  ]],
  ['03_Peixes-e-Frutos-do-Mar', [
    ['Tilapia'],
    ['Camarao'],
    ['Peroa'],
  ]],
  ['04_Entradas-e-Porcoes', [
    ['Paes-Queijos-Linguicas'],
    ['Frango-Porcoes'],
    ['Frutos-do-Mar-Porcoes'],
    ['Alcatra-a-Palito'],
    ['Calabresa-e-Torresmo'],
    ['Pasteis'],
    ['Cebola-e-Outros'],
  ]],
  ['05_Saladas-e-Caldos', [
    ['Saladas'],
    ['Caldo-Amigo'],
  ]],
  ['06_Sobremesas', [
    ['Tacas-e-Cremes'],
    ['Quentes-com-Sorvete'],
    ['Churros-e-Casquinhas'],
  ]],
  ['07_Bebidas', [
    ['Cervejas'],
    ['Sucos-Naturais'],
    ['Drinks-e-Destilados'],
    ['Refrigerantes-Aguas-Cafes'],
  ]],
  ['08_Ambiente', [
    ['Dia'],
    ['Noite'],
  ]],
  ['09_Espaco-Kids'],
  ['10_Clientes-e-Pessoas', [
    ['Sem-Rostos-Uso-Livre'],
    ['Com-Rostos-Aguardando-Autorizacao'],
    ['Autorizados'],
    ['Reviews-e-Depoimentos'],
  ]],
  ['11_Equipe-e-Bastidores', [
    ['Churrasqueiro-em-Acao'],
    ['Churrasqueira-e-Grelha'],
    ['Cozinha-Preparo'],
    ['Atendimento-Garcom'],
  ]],
  ['12_Eventos-e-Datas'],
  ['99_A-Classificar'],
  ['99_Revisar-Manual'],
]

// Mapa nome→id salvo localmente para uso nos outros scripts
const FOLDER_MAP_PATH = path.join(__dirname, '../.bacana-folders.json')

const folderMap: Record<string, string> = {}

async function ensureFolder(name: string, parentId: string): Promise<string> {
  // Tenta achar pasta existente com esse nome no pai
  const items = await googleDriveService.listFolderFiles(parentId)
  const existing = items.find(
    (f) => f.name === name && f.mimeType === 'application/vnd.google-apps.folder'
  )
  if (existing) {
    console.log(`  ✓ (já existe) ${name}`)
    return existing.id!
  }
  const id = await googleDriveService.createFolder(name, parentId)
  console.log(`  + criada     ${name}`)
  return id
}

async function buildTree(defs: FolderDef[], parentId: string, prefix = '') {
  for (const [name, children] of defs) {
    const id = await ensureFolder(name, parentId)
    const fullPath = prefix ? `${prefix}/${name}` : name
    folderMap[fullPath] = id
    if (children?.length) {
      await buildTree(children, id, fullPath)
    }
  }
}

async function main() {
  console.log('=== Configuração de Pastas — Bacana Churrascaria ===\n')
  folderMap[''] = ROOT_ID

  await buildTree(STRUCTURE, ROOT_ID)

  // Salva mapa de IDs localmente
  fs.writeFileSync(FOLDER_MAP_PATH, JSON.stringify(folderMap, null, 2))
  console.log(`\n✓ Estrutura criada. ${Object.keys(folderMap).length} pastas mapeadas.`)
  console.log(`✓ Mapa salvo em: ${FOLDER_MAP_PATH}`)
  console.log(`\nPróximo passo: coloque as fotos em 99_A-Classificar/ e rode bacana-analyze.ts`)
}

main().catch(console.error)
