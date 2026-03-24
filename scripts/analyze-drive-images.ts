/**
 * analyze-drive-images.ts
 *
 * Analyzes project images from Google Drive using Gemini 2.0 Flash (vision):
 * - Downloads thumbnails
 * - Identifies food/scene in each photo
 * - Associates to menu items from the knowledge base
 * - Updates _image-catalog.json on Google Drive
 *
 * Usage:
 *   npx tsx scripts/analyze-drive-images.ts --project "By Rock"
 *   npx tsx scripts/analyze-drive-images.ts --project-id 7 --months 9
 *   npx tsx scripts/analyze-drive-images.ts --project-id 7 --batch 50
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'
import * as https from 'https'
import * as http from 'http'
import 'dotenv/config'

// ─── Types ───────────────────────────────────────────────────────────
interface ImageAnalysis {
  driveFileId: string
  fileName: string
  folder: string
  folderId: string
  createdTime: string
  menuItem: string | null
  menuCategory: string | null
  description: string
  tags: string[]
  mood: string
  bestFor: string[]
  quality: string
  usageHistory: { date: string; theme: string }[]
}

interface ImageCatalog {
  projectId: number
  projectName: string
  catalogFileId: string | null
  lastUpdated: string
  images: ImageAnalysis[]
}

// ─── CLI Args ────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      opts[key] = args[++i]
    }
  }
  return opts
}

// ─── Clients ─────────────────────────────────────────────────────────
const prisma = new PrismaClient()
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return client
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() })
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ─── Drive Helpers ───────────────────────────────────────────────────
async function listSubfolders(parentId: string) {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 50,
  })
  return res.data.files ?? []
}

async function listFolderImages(folderId: string, cutoffDate: string) {
  const drive = getDrive()
  const all: { id: string; name: string; createdTime: string }[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false and createdTime > '${cutoffDate}'`,
      fields: 'files(id, name, createdTime, thumbnailLink), nextPageToken',
      pageSize: 100,
      orderBy: 'createdTime desc',
      pageToken,
    })
    for (const f of res.data.files ?? []) {
      all.push({ id: f.id!, name: f.name!, createdTime: f.createdTime! })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return all
}

async function downloadThumbnail(fileId: string): Promise<Buffer> {
  const drive = getDrive()
  const meta = await drive.files.get({ fileId, fields: 'thumbnailLink' })
  if (!meta.data.thumbnailLink) throw new Error('No thumbnail')
  const thumbUrl = meta.data.thumbnailLink.replace(/=s\d+/, '=s400')
  return fetchBuffer(thumbUrl)
}

async function findCatalogFile(imagesFolderId: string): Promise<string | null> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${imagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  return res.data.files?.[0]?.id ?? null
}

async function readCatalogFromDrive(fileId: string): Promise<ImageCatalog> {
  const drive = getDrive()
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' })
  return res.data as unknown as ImageCatalog
}

async function saveCatalogToDrive(catalog: ImageCatalog, imagesFolderId: string) {
  const drive = getDrive()
  const { Readable } = await import('stream')
  const content = JSON.stringify(catalog, null, 2)
  const stream = new Readable()
  stream.push(content)
  stream.push(null)

  if (catalog.catalogFileId) {
    // Update existing
    await drive.files.update({
      fileId: catalog.catalogFileId,
      media: { mimeType: 'application/json', body: stream },
    })
  } else {
    // Create new
    const res = await drive.files.create({
      requestBody: {
        name: '_image-catalog.json',
        parents: [imagesFolderId],
        mimeType: 'application/json',
        description: 'Catálogo de imagens analisadas — Studio Lagosta (auto-gerado)',
      },
      media: { mimeType: 'application/json', body: stream },
      fields: 'id',
    })
    catalog.catalogFileId = res.data.id!
  }
}

// ─── Knowledge Base ──────────────────────────────────────────────────
async function loadMenu(projectId: number): Promise<string> {
  const entries = await prisma.$queryRawUnsafe<{ content: string }[]>(
    `SELECT content FROM knowledge_base_entries WHERE "projectId" = $1 AND category = 'CARDAPIO'`,
    projectId,
  )
  return entries[0]?.content ?? ''
}

// ─── Gemini Analysis ─────────────────────────────────────────────────
async function analyzeImage(
  imageBuffer: Buffer,
  fileName: string,
  folderName: string,
  menu: string,
): Promise<Omit<ImageAnalysis, 'driveFileId' | 'fileName' | 'folder' | 'folderId' | 'createdTime' | 'usageHistory'>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `Analise esta foto de um restaurante/steakhouse chamado "By Rock" (steakhouse rock & roll).

A foto está na pasta "${folderName}" do acervo do restaurante.

CARDÁPIO DO RESTAURANTE:
${menu}

Retorne um JSON com:
{
  "menuItem": "Nome do prato do cardápio que aparece na foto (null se não for comida ou não conseguir identificar)",
  "menuCategory": "Categoria: PRATOS_PRINCIPAIS, PETISCOS_ENTRADAS, BURGERS, CHAPAS, SALADAS, SOBREMESAS, BEBIDAS, AMBIENTE, AREA_KIDS, MUSICA, ou null",
  "description": "Descrição curta em português do que aparece na foto (1-2 frases)",
  "tags": ["lista", "de", "tags", "relevantes"],
  "mood": "Uma palavra: casual, aconchegante, animado, dramatico, elegante, familiar, festivo",
  "bestFor": ["lista de temas de post ideais para esta foto: almoco, happy-hour, abertura, area-kids, churrasco, etc"],
  "quality": "alta, media, ou baixa (baseado em foco, iluminação, composição)"
}

IMPORTANTE:
- Se for comida, tente associar ao prato EXATO do cardápio pela aparência dos ingredientes
- Se não for comida (ambiente, pessoas, decoração), menuItem = null
- Responda APENAS o JSON, sem markdown`

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBuffer.toString('base64'),
      },
    },
  ])

  const text = result.response.text().trim()

  // Parse JSON (handle potential markdown wrapping)
  const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
  try {
    return JSON.parse(jsonStr)
  } catch {
    console.warn(`    ⚠ Failed to parse JSON for ${fileName}, using fallback`)
    return {
      menuItem: null,
      menuCategory: folderName === 'Ambiente' ? 'AMBIENTE' : null,
      description: `Foto do restaurante (pasta: ${folderName})`,
      tags: [folderName.toLowerCase()],
      mood: 'casual',
      bestFor: ['generico'],
      quality: 'media',
    }
  }
}

// ─── Rate Limiter ────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()
  const months = parseInt(opts.months as string ?? '9', 10)
  const batchSize = parseInt(opts.batch as string ?? '200', 10)

  console.log('═══════════════════════════════════════════════════')
  console.log('  Studio Lagosta — Image Analysis (Gemini Flash)')
  console.log('═══════════════════════════════════════════════════\n')

  // 1. Find project
  let project: any
  if (opts.projectId) {
    project = await prisma.project.findUnique({ where: { id: Number(opts.projectId) } })
  } else if (opts.project) {
    const all = await prisma.project.findMany({ where: { status: 'ACTIVE' } })
    project = all.find((p) => p.name.toLowerCase().includes((opts.project as string).toLowerCase()))
  } else {
    throw new Error('Provide --project <name> or --project-id <id>')
  }
  if (!project) throw new Error('Project not found')
  console.log(`Project: ${project.name} (ID: ${project.id})`)

  const imagesFolderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!imagesFolderId) throw new Error('No Drive folder configured')

  // 2. Load menu
  console.log('\n1. Loading menu from knowledge base...')
  const menu = await loadMenu(project.id)
  console.log(`  ✓ Menu loaded (${menu.length} chars)`)

  // 3. Load or create catalog
  console.log('\n2. Loading catalog from Drive...')
  const catalogFileId = await findCatalogFile(imagesFolderId)
  let catalog: ImageCatalog

  if (catalogFileId) {
    catalog = await readCatalogFromDrive(catalogFileId)
    catalog.catalogFileId = catalogFileId
    console.log(`  ✓ Existing catalog: ${catalog.images.length} images`)
  } else {
    catalog = {
      projectId: project.id,
      projectName: project.name,
      catalogFileId: null,
      lastUpdated: new Date().toISOString(),
      images: [],
    }
    console.log('  ○ No catalog found, creating new one')
  }

  const existingIds = new Set(catalog.images.map((i) => i.driveFileId))

  // 4. List images from Drive (last N months)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffISO = cutoff.toISOString()
  console.log(`\n3. Listing images (since ${cutoffISO.split('T')[0]})...`)

  const subfolders = await listSubfolders(imagesFolderId)
  const newImages: { id: string; name: string; createdTime: string; folder: string; folderId: string }[] = []

  for (const folder of subfolders) {
    const images = await listFolderImages(folder.id!, cutoffISO)
    for (const img of images) {
      if (!existingIds.has(img.id)) {
        newImages.push({ ...img, folder: folder.name!, folderId: folder.id! })
      }
    }
  }

  console.log(`  ✓ ${newImages.length} new images to analyze (${existingIds.size} already cataloged)`)

  if (newImages.length === 0) {
    console.log('\n  Nothing to do — catalog is up to date!')
    await prisma.$disconnect()
    return
  }

  // Limit batch
  const toProcess = newImages.slice(0, batchSize)
  if (toProcess.length < newImages.length) {
    console.log(`  → Processing batch of ${toProcess.length} (${newImages.length - toProcess.length} remaining)`)
  }

  // 5. Analyze each image
  console.log(`\n4. Analyzing ${toProcess.length} images with Gemini 2.0 Flash...\n`)
  let analyzed = 0
  let errors = 0

  for (const img of toProcess) {
    const progress = `[${analyzed + 1}/${toProcess.length}]`
    process.stdout.write(`  ${progress} ${img.folder}/${img.name}...`)

    try {
      // Download thumbnail
      const thumbBuf = await downloadThumbnail(img.id)

      // Analyze with Gemini
      const result = await analyzeImage(thumbBuf, img.name, img.folder, menu)

      // Add to catalog
      catalog.images.push({
        driveFileId: img.id,
        fileName: img.name,
        folder: img.folder,
        folderId: img.folderId,
        createdTime: img.createdTime,
        menuItem: result.menuItem,
        menuCategory: result.menuCategory,
        description: result.description,
        tags: result.tags,
        mood: result.mood,
        bestFor: result.bestFor,
        quality: result.quality,
        usageHistory: [],
      })

      const menuLabel = result.menuItem ? ` → ${result.menuItem}` : ''
      console.log(` ✓${menuLabel}`)
      analyzed++

      // Rate limit: ~15 req/min for free tier
      await sleep(1200)
    } catch (e: any) {
      console.log(` ✗ ${e.message?.slice(0, 60)}`)
      errors++
      await sleep(2000)
    }
  }

  // 6. Save catalog to Drive
  console.log(`\n5. Saving catalog to Drive...`)
  catalog.lastUpdated = new Date().toISOString()
  await saveCatalogToDrive(catalog, imagesFolderId)
  console.log(`  ✓ Catalog saved (${catalog.catalogFileId})`)

  // 7. Summary
  const menuAssociations = catalog.images.filter((i) => i.menuItem).length
  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  ✓ Analyzed: ${analyzed} images (${errors} errors)`)
  console.log(`  ✓ Total catalog: ${catalog.images.length} images`)
  console.log(`  ✓ Menu associations: ${menuAssociations} photos linked to menu items`)
  console.log('')

  // Top menu items
  const menuCounts: Record<string, number> = {}
  for (const img of catalog.images) {
    if (img.menuItem) menuCounts[img.menuItem] = (menuCounts[img.menuItem] ?? 0) + 1
  }
  const topItems = Object.entries(menuCounts).sort(([, a], [, b]) => b - a).slice(0, 10)
  if (topItems.length) {
    console.log('  Top menu items by photo count:')
    for (const [item, count] of topItems) {
      console.log(`    ${count}x ${item}`)
    }
  }

  console.log('═══════════════════════════════════════════════════')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('\n✗ Fatal:', e.message ?? e)
  prisma.$disconnect()
  process.exit(1)
})
