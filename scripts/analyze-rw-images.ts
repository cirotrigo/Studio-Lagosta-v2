import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'
import { GoogleGenerativeAI } from '@google/generative-ai'
import https from 'https'
import { Readable } from 'stream'

const prisma = new PrismaClient()

interface CatalogEntry {
  driveFileId: string
  fileName: string
  folder: string
  folderId: string
  createdTime: string
  menuItem: string | null
  menuCategory: string
  tags: string[]
  bestFor: string[]
  quality: string
  mood: string
  description: string
  usageHistory: any[]
}

interface Catalog {
  projectId: number
  catalogFileId: string
  lastUpdated: string
  images: CatalogEntry[]
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth })

  const rwFolderId = '1cLOBxRYuGkOXwe5qLdEUnwNY-gvPt_Xq'

  // List subfolders of "Restaurat Week"
  const subRes = await drive.files.list({
    q: `'${rwFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 20,
  })

  // Collect all images from subfolders
  const allImages: { id: string; name: string; createdTime: string; folder: string }[] = []

  for (const folder of subRes.data.files ?? []) {
    const imgRes = await drive.files.list({
      q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id,name,createdTime)',
      pageSize: 200,
      orderBy: 'createdTime desc',
    })
    for (const f of imgRes.data.files ?? []) {
      allImages.push({
        id: f.id!,
        name: f.name!,
        createdTime: f.createdTime!,
        folder: `Restaurat Week/${folder.name}`,
      })
    }
  }

  console.log(`Found ${allImages.length} images in Restaurant Week subfolders`)

  // Load existing catalog
  const project = await prisma.project.findUnique({ where: { id: 3 } })
  const imagesFolderId = project!.googleDriveImagesFolderId ?? project!.googleDriveFolderId
  if (!imagesFolderId) throw new Error('No images folder')

  const catListRes = await drive.files.list({
    q: `'${imagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  const catalogFileId = catListRes.data.files?.[0]?.id
  if (!catalogFileId) throw new Error('No catalog file found')

  const catData = await drive.files.get({ fileId: catalogFileId, alt: 'media' })
  const catalog = catData.data as unknown as Catalog

  console.log(`Existing catalog: ${catalog.images.length} images`)

  const existingIds = new Set(catalog.images.map((i) => i.driveFileId))
  const newImages = allImages.filter((f) => !existingIds.has(f.id))
  console.log(`New images to analyze: ${newImages.length}`)

  if (newImages.length === 0) {
    console.log('Nothing to do!')
    await prisma.$disconnect()
    return
  }

  // Analyze with Gemini
  // gemini-2.0-flash foi aposentado: `generateContent` devolve 404 ainda que o
  // nome continue aparecendo no ListModels. Override por env se precisar fixar
  // outra versão.
  // GEMINI_API_KEY não existe no .env do repo — o resto dos scripts usa
  // GOOGLE_GENERATIVE_AI_API_KEY; mantido como fallback.
  const genAI = new GoogleGenerativeAI(
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY)!,
  )
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash',
  })

  const menu = `Restaurant Week TERO: Almoço R$95 (Brasil: Coxinha+Cupim Prensado+Brigadeiro / Itália: Carpaccio+Linguini Carbonara+Velluto Limão). Jantar R$115 (Argentina: Empanada Salteña+Chorizo na Parrilla+Flan / França: Croissant Salmão+Entrecôte au Poivre+Pêra ao Vinho).`

  const prompt = `Analyze this restaurant photo. Menu context: ${menu}. Reply JSON only: {"menuItem":"item name or null","menuCategory":"ENTRADAS|PRATOS_PRINCIPAIS|PARRILLA|SOBREMESAS|BEBIDAS|AMBIENTE|DETALHES","tags":["3-5 tags"],"bestFor":["almoco","jantar","restaurant-week","abertura"],"quality":"alta|media|baixa","mood":"sofisticado|casual|dramatico|acolhedor","description":"1 line description"}`

  let added = 0
  for (const img of newImages) {
    try {
      const meta = await drive.files.get({ fileId: img.id, fields: 'thumbnailLink' })
      const thumbUrl = meta.data.thumbnailLink?.replace(/=s\d+$/, '=s512')
      if (!thumbUrl) {
        console.log(`  SKIP (no thumb): ${img.name}`)
        continue
      }

      const thumbBuffer = await fetchBuffer(thumbUrl)

      const result = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: thumbBuffer.toString('base64') } },
        { text: prompt },
      ])

      const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim()
      const analysis = JSON.parse(text)

      catalog.images.push({
        driveFileId: img.id,
        fileName: img.name,
        folder: img.folder,
        folderId: rwFolderId,
        createdTime: img.createdTime,
        ...analysis,
        usageHistory: [],
      })
      added++
      console.log(`  [${added}/${newImages.length}] ${img.name} ✓ ${analysis.menuItem || analysis.menuCategory}`)
    } catch (e: any) {
      console.log(`  ERROR: ${img.name} — ${e.message?.substring(0, 80)}`)
    }
  }

  // Save catalog
  catalog.lastUpdated = new Date().toISOString()
  const content = JSON.stringify(catalog, null, 2)
  await drive.files.update({
    fileId: catalog.catalogFileId,
    media: { mimeType: 'application/json', body: Readable.from(content) },
  })

  console.log(`\nDone! Added ${added} Restaurant Week images. Total catalog: ${catalog.images.length}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
