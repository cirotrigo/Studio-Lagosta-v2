/**
 * analyze-all-projects.ts
 *
 * Multi-project image catalog analysis using Gemini 2.0 Flash.
 * Iterates over all ACTIVE projects with a Google Drive images folder
 * and runs the same analysis pipeline as analyze-drive-images.ts.
 *
 * Usage:
 *   npx tsx scripts/analyze-all-projects.ts              # All projects
 *   npx tsx scripts/analyze-all-projects.ts --only-new    # Only projects without catalog
 *   npx tsx scripts/analyze-all-projects.ts --incremental # Only new photos (default)
 *   npx tsx scripts/analyze-all-projects.ts --project "By Rock"  # Single project
 *   npx tsx scripts/analyze-all-projects.ts --months 6    # Last 6 months (default: 9)
 *   npx tsx scripts/analyze-all-projects.ts --batch 50    # Max 50 per project
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
    if (args[i] === '--only-new') { opts.onlyNew = true; continue }
    if (args[i] === '--incremental') { opts.incremental = true; continue }
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

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

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
      fields: 'files(id, name, createdTime), nextPageToken',
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
    await drive.files.update({
      fileId: catalog.catalogFileId,
      media: { mimeType: 'application/json', body: stream },
    })
  } else {
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
  projectName: string,
): Promise<Omit<ImageAnalysis, 'driveFileId' | 'fileName' | 'folder' | 'folderId' | 'createdTime' | 'usageHistory'>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `Analise esta foto de um restaurante chamado "${projectName}".

A foto está na pasta "${folderName}" do acervo do restaurante.

${menu ? `CARDÁPIO DO RESTAURANTE:\n${menu}\n` : '(Cardápio não disponível)'}

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
- Se for comida, tente associar ao prato EXATO do cardápio pela aparência
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
  const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
  try {
    return JSON.parse(jsonStr)
  } catch {
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

// ─── Process Single Project ─────────────────────────────────────────
async function processProject(
  project: { id: number; name: string; googleDriveImagesFolderId: string | null; googleDriveFolderId: string | null },
  months: number,
  batchSize: number,
): Promise<{ analyzed: number; errors: number; total: number }> {
  const imagesFolderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!imagesFolderId) {
    console.log(`  ⊘ No Drive folder — skipping`)
    return { analyzed: 0, errors: 0, total: 0 }
  }

  // Load menu
  const menu = await loadMenu(project.id)

  // Load or create catalog
  const catalogFileId = await findCatalogFile(imagesFolderId)
  let catalog: ImageCatalog
  if (catalogFileId) {
    catalog = await readCatalogFromDrive(catalogFileId)
    catalog.catalogFileId = catalogFileId
    console.log(`  Existing catalog: ${catalog.images.length} images`)
  } else {
    catalog = {
      projectId: project.id,
      projectName: project.name,
      catalogFileId: null,
      lastUpdated: new Date().toISOString(),
      images: [],
    }
    console.log(`  New catalog`)
  }

  const existingIds = new Set(catalog.images.map((i) => i.driveFileId))

  // List images
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffISO = cutoff.toISOString()

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

  console.log(`  ${newImages.length} new images to analyze`)

  if (newImages.length === 0) {
    return { analyzed: 0, errors: 0, total: catalog.images.length }
  }

  const toProcess = newImages.slice(0, batchSize)
  let analyzed = 0
  let errors = 0

  for (const img of toProcess) {
    try {
      const thumbBuf = await downloadThumbnail(img.id)
      const result = await analyzeImage(thumbBuf, img.name, img.folder, menu, project.name)

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

      analyzed++
      // Rate limit: ~15 req/min for free tier
      await sleep(1200)
    } catch (e: any) {
      errors++
      await sleep(2000)
    }
  }

  // Save catalog
  catalog.lastUpdated = new Date().toISOString()
  await saveCatalogToDrive(catalog, imagesFolderId)
  console.log(`  ✓ ${analyzed} analyzed, ${errors} errors, ${catalog.images.length} total`)

  return { analyzed, errors, total: catalog.images.length }
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()
  const months = parseInt(opts.months as string ?? '9', 10)
  const batchSize = parseInt(opts.batch as string ?? '200', 10)
  const onlyNew = !!opts.onlyNew
  const filterProject = opts.project as string | undefined

  console.log('═══════════════════════════════════════════════════')
  console.log('  Studio Lagosta — Multi-Project Image Analysis')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Months: ${months} | Batch: ${batchSize} | Only new: ${onlyNew}`)
  console.log('')

  // Get all active projects with Drive folders
  const allProjects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      googleDriveImagesFolderId: true,
      googleDriveFolderId: true,
    },
    orderBy: { name: 'asc' },
  })

  let projects = allProjects.filter(
    (p) => p.googleDriveImagesFolderId || p.googleDriveFolderId,
  )

  if (filterProject) {
    projects = projects.filter((p) =>
      p.name.toLowerCase().includes(filterProject.toLowerCase()),
    )
  }

  console.log(`Found ${projects.length} projects with Drive folders\n`)

  if (onlyNew) {
    // Filter to only projects without existing catalog
    const projectsWithoutCatalog: typeof projects = []
    for (const p of projects) {
      const folderId = p.googleDriveImagesFolderId ?? p.googleDriveFolderId
      if (!folderId) continue
      const catalogId = await findCatalogFile(folderId)
      if (!catalogId) projectsWithoutCatalog.push(p)
    }
    projects = projectsWithoutCatalog
    console.log(`  Filtered to ${projects.length} projects without catalog\n`)
  }

  const results: { name: string; analyzed: number; errors: number; total: number }[] = []

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]
    console.log(`\n[${i + 1}/${projects.length}] ${project.name} (ID: ${project.id})`)

    try {
      const result = await processProject(project, months, batchSize)
      results.push({ name: project.name, ...result })
    } catch (e: any) {
      console.error(`  ✗ Error: ${e.message?.slice(0, 80)}`)
      results.push({ name: project.name, analyzed: 0, errors: 1, total: 0 })
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  Summary')
  console.log('═══════════════════════════════════════════════════')
  let totalAnalyzed = 0
  let totalErrors = 0
  let totalImages = 0
  for (const r of results) {
    console.log(`  ${r.name}: ${r.analyzed} new, ${r.errors} errors, ${r.total} total`)
    totalAnalyzed += r.analyzed
    totalErrors += r.errors
    totalImages += r.total
  }
  console.log(`\n  Total: ${totalAnalyzed} analyzed, ${totalErrors} errors, ${totalImages} catalog images`)
  console.log('═══════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('\n✗ Fatal:', e.message ?? e)
  prisma.$disconnect()
  process.exit(1)
})
