/**
 * generate-creatives.ts
 *
 * Full autonomous pipeline for generating Instagram Story creatives:
 * 1. Reads project knowledge base (tone, menu, hours)
 * 2. Lists images from Google Drive by folder/theme
 * 3. Downloads thumbnails for visual analysis cataloging
 * 4. Selects best images based on theme + catalog
 * 5. Renders creatives using template layers + @napi-rs/canvas
 * 6. Uploads to Vercel Blob
 * 7. Creates SocialPost records as DRAFT
 *
 * Usage:
 *   npx tsx scripts/generate-creatives.ts --project "By Rock" --date 2026-03-25
 *   npx tsx scripts/generate-creatives.ts --project-id 7 --date tomorrow
 *
 * Options:
 *   --project <name>      Project name (fuzzy match)
 *   --project-id <id>     Project ID (exact)
 *   --date <date>         Target date (YYYY-MM-DD or "tomorrow")
 *   --dry-run             Render locally but don't upload or create posts
 *   --skip-upload         Render and save locally only
 */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { google } from 'googleapis'
import { put } from '@vercel/blob'
import { PrismaClient } from '../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import 'dotenv/config'

// ─── Types ───────────────────────────────────────────────────────────
interface Layer {
  id: string
  type: string
  name?: string
  visible?: boolean
  locked?: boolean
  order?: number
  position: { x: number; y: number }
  size: { width: number; height: number }
  rotation?: number
  content?: string
  fileUrl?: string
  isDynamic?: boolean
  style?: Record<string, any>
  textboxConfig?: Record<string, any>
  effects?: Record<string, any>
}

interface StoryConfig {
  label: string
  localTime: string       // HH:MM in BRT
  utcTime: string         // HH:MM in UTC
  theme: string           // theme for image selection
  templatePageId: string
  texts: Record<string, string>
  driveImageId?: string
  driveImageName?: string
}

interface ImageCatalogEntry {
  driveFileId: string
  fileName: string
  folder: string
  folderId: string
  createdTime?: string
  menuItem?: string | null
  menuCategory?: string | null
  description?: string
  tags?: string[]
  mood?: string
  bestFor?: string[]
  quality: string
  usageHistory: { date: string; theme: string }[]
}

interface ImageCatalog {
  projectId: number
  projectName: string
  catalogFileId?: string | null
  lastUpdated: string
  images: ImageCatalogEntry[]
}

// ─── CLI Args ────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts: Record<string, string | boolean> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') { opts.dryRun = true; continue }
    if (args[i] === '--skip-upload') { opts.skipUpload = true; continue }
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      opts[key] = args[++i]
    }
  }

  // Default: tomorrow
  if (!opts.date) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    opts.date = tomorrow.toISOString().split('T')[0]
  } else if (opts.date === 'tomorrow') {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    opts.date = tomorrow.toISOString().split('T')[0]
  }

  return opts
}

// ─── Prisma & Google Drive ───────────────────────────────────────────
const prisma = new PrismaClient()

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

async function downloadDriveImage(fileId: string): Promise<Buffer> {
  const drive = getDrive()
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

async function downloadDriveThumbnail(fileId: string): Promise<Buffer> {
  const drive = getDrive()
  const meta = await drive.files.get({ fileId, fields: 'thumbnailLink' })
  if (!meta.data.thumbnailLink) throw new Error('No thumbnail')
  const thumbUrl = meta.data.thumbnailLink.replace(/=s\d+/, '=s400')
  return fetchBuffer(thumbUrl)
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

// ─── Image Catalog (from Google Drive) ───────────────────────────────

async function findCatalogFileId(imagesFolderId: string): Promise<string | null> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${imagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  return res.data.files?.[0]?.id ?? null
}

async function loadCatalogFromDrive(imagesFolderId: string): Promise<ImageCatalog | null> {
  const fileId = await findCatalogFileId(imagesFolderId)
  if (!fileId) return null
  const drive = getDrive()
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' })
  const catalog = res.data as unknown as ImageCatalog
  catalog.catalogFileId = fileId
  return catalog
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
      },
      media: { mimeType: 'application/json', body: stream },
      fields: 'id',
    })
    catalog.catalogFileId = res.data.id!
  }
}

function selectImageForTheme(
  catalog: ImageCatalog,
  theme: string,
  targetDate: string,
  alreadySelected: Set<string>,
): ImageCatalogEntry | null {
  const notSelected = (img: ImageCatalogEntry) => !alreadySelected.has(img.driveFileId)
  const highQuality = (img: ImageCatalogEntry) => img.quality !== 'baixa'

  // 1. Try bestFor match (most precise — uses Gemini analysis)
  let candidates = catalog.images.filter(
    (img) => notSelected(img) && highQuality(img)
      && img.bestFor?.some((b) => b.toLowerCase().includes(theme.toLowerCase())),
  )

  // 2. Try tags match
  if (!candidates.length) {
    candidates = catalog.images.filter(
      (img) => notSelected(img) && highQuality(img)
        && img.tags?.some((t) => t.toLowerCase().includes(theme.toLowerCase())),
    )
  }

  // 3. Try menuCategory match
  if (!candidates.length) {
    const categoryMap: Record<string, string[]> = {
      'abertura': ['AMBIENTE', 'AREA_KIDS'],
      'almoco': ['PRATOS_PRINCIPAIS', 'PRATOS_BY_ROCK'],
      'happy-hour': ['BEBIDAS', 'PETISCOS_ENTRADAS'],
      'churrasco': ['PRATOS_PRINCIPAIS', 'CHAPAS'],
      'burger': ['BURGERS'],
      'sobremesa': ['SOBREMESAS'],
      'petiscos': ['PETISCOS_ENTRADAS'],
    }
    const categories = categoryMap[theme] ?? []
    if (categories.length) {
      candidates = catalog.images.filter(
        (img) => notSelected(img) && highQuality(img)
          && img.menuCategory && categories.includes(img.menuCategory),
      )
    }
  }

  // 4. Fallback: folder name match
  if (!candidates.length) {
    const folderMap: Record<string, string[]> = {
      'abertura': ['ambiente', 'area kids'],
      'almoco': ['pratos', 'entradas', 'organizar'],
      'happy-hour': ['chopp', 'drinks'],
      'churrasco': ['pratos', 'chapas'],
    }
    const folders = folderMap[theme] ?? [theme]
    candidates = catalog.images.filter(
      (img) => notSelected(img)
        && folders.some((f) => img.folder.toLowerCase().includes(f)),
    )
  }

  // 5. Last resort: any unused image
  if (!candidates.length) {
    candidates = catalog.images.filter(notSelected)
  }

  if (!candidates.length) return null

  // Sort: prefer least recently used, then highest quality
  candidates.sort((a, b) => {
    const aLast = a.usageHistory?.length ? a.usageHistory[a.usageHistory.length - 1].date : '2000-01-01'
    const bLast = b.usageHistory?.length ? b.usageHistory[b.usageHistory.length - 1].date : '2000-01-01'
    if (aLast !== bLast) return aLast.localeCompare(bLast)
    // Prefer alta > media > baixa
    const qOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
    return (qOrder[a.quality] ?? 1) - (qOrder[b.quality] ?? 1)
  })

  const selected = candidates[0]
  const reason = selected.menuItem
    ? `${selected.menuItem} (${selected.folder})`
    : `${selected.folder}/${selected.fileName}`
  console.log(`  ✓ ${theme}: ${selected.fileName} → ${reason}`)

  return candidates[0]
}

// ─── Knowledge Base ──────────────────────────────────────────────────
interface KBContext {
  tone: string
  hours: string
  menu: string
  postingRules: string
}

async function loadKnowledgeBase(projectId: number): Promise<KBContext> {
  const entries = await prisma.$queryRawUnsafe<{ title: string; category: string; content: string }[]>(
    `SELECT title, category, content FROM knowledge_base_entries WHERE "projectId" = $1`,
    projectId,
  )

  const ctx: KBContext = { tone: '', hours: '', menu: '', postingRules: '' }
  for (const entry of entries) {
    switch (entry.category) {
      case 'TOM_DE_VOZ': ctx.tone = entry.content; break
      case 'HORARIOS': ctx.hours = entry.content; break
      case 'CARDAPIO': ctx.menu = entry.content.slice(0, 500); break // truncate large menus
    }
  }

  // Extract posting rules from tone
  const rulesMatch = ctx.tone.match(/### FREQUÊNCIA[\s\S]*?(?=###|$)/)
  if (rulesMatch) ctx.postingRules = rulesMatch[0]

  return ctx
}

// ─── Template Selection ──────────────────────────────────────────────
async function getTemplateForDay(
  projectId: number,
  dayOfWeek: string,
): Promise<{ templateId: number; pages: { id: string; name: string; layers: string }[] }> {
  // Get all templates with their template pages
  const templates = await prisma.template.findMany({ where: { projectId } })
  const templatePages = await prisma.page.findMany({
    where: { templateId: { in: templates.map((t) => t.id) }, isTemplate: true },
    select: { id: true, name: true, layers: true, templateId: true },
  })

  // Group pages by template
  const pagesByTemplate = new Map<number, typeof templatePages>()
  for (const p of templatePages) {
    const list = pagesByTemplate.get(p.templateId) ?? []
    list.push(p)
    pagesByTemplate.set(p.templateId, list)
  }

  // Match by day name
  const dayTemplate = templates.find(
    (t) => t.name.toLowerCase().includes(dayOfWeek.toLowerCase())
      && (pagesByTemplate.get(t.id)?.length ?? 0) > 0,
  )

  const chosen = dayTemplate
    ?? templates.find((t) => (pagesByTemplate.get(t.id)?.length ?? 0) > 0)

  if (!chosen) throw new Error(`No templates with pages found for project ${projectId}`)
  const chosenPages = pagesByTemplate.get(chosen.id) ?? []

  return {
    templateId: chosen.id,
    pages: chosenPages.map((p) => ({
      id: p.id,
      name: p.name,
      layers: typeof p.layers === 'string' ? p.layers : JSON.stringify(p.layers),
    })),
  }
}

// ─── Story Configuration ────────────────────────────────────────────
function buildStoryConfigs(
  kb: KBContext,
  templatePages: { id: string; name: string; layers: string }[],
  dayOfWeek: string,
): StoryConfig[] {
  // Identify which template page is for happy hour vs general
  const hhPage = templatePages.find((p) => {
    const layers: Layer[] = JSON.parse(p.layers)
    return layers.some((l) =>
      (l.content?.toLowerCase().includes('happy') || l.name?.toLowerCase().includes('happy')),
    )
  })
  const generalPage = templatePages.find((p) => p !== hhPage) ?? templatePages[0]

  const configs: StoryConfig[] = [
    {
      label: 'Abertura do dia',
      localTime: '09:00',
      utcTime: '12:00',
      theme: 'abertura',
      templatePageId: generalPage.id,
      texts: {
        title: getDayTitle(dayOfWeek),
        subtitle: 'ROCK',
        info: 'aberto das 11h à meia-noite',
        address: 'Rua Eugênio Netto, 82 – Praia do Canto, Vitória',
        body: 'No volume máximo hoje!',
      },
    },
    {
      label: 'Almoço executivo',
      localTime: '11:00',
      utcTime: '14:00',
      theme: 'almoco',
      templatePageId: generalPage.id,
      texts: {
        title: 'ALMOÇO',
        subtitle: 'EXECUTIVO',
        info: 'segunda a sexta | 11h às 16h',
        address: 'Rua Eugênio Netto, 82 – Praia do Canto, Vitória',
        body: 'Sabor no volume máximo hoje!',
      },
    },
    {
      label: 'Happy Hour',
      localTime: '12:00',
      utcTime: '15:00',
      theme: 'happy-hour',
      templatePageId: hhPage?.id ?? generalPage.id,
      texts: {
        title: 'HAPPY',
        subtitle: 'HOUR',
        info: 'todo dia',
      },
    },
  ]

  return configs
}

function getDayTitle(day: string): string {
  const map: Record<string, string> = {
    'domingo': 'DOMINGO',
    'segunda': 'SEGUNDA',
    'terca': 'TERÇA',
    'quarta': 'QUARTA',
    'quinta': 'QUINTA',
    'sexta': 'SEXTA',
    'sabado': 'SÁBADO',
  }
  return map[day.toLowerCase()] ?? day.toUpperCase()
}

function getDayOfWeek(dateStr: string): string {
  const days = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
  const date = new Date(dateStr + 'T12:00:00')
  return days[date.getDay()]
}

// ─── Font Management ─────────────────────────────────────────────────
async function downloadAndRegisterFonts(projectId: number) {
  const fonts = await prisma.customFont.findMany({ where: { projectId } })
  const fontDir = `/tmp/studio-lagosta-fonts/${projectId}`
  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true })

  for (const font of fonts) {
    const ext = path.extname(font.fileUrl) || '.otf'
    const filePath = path.join(fontDir, `${font.fontFamily}${ext}`)
    if (!fs.existsSync(filePath)) {
      const buf = await fetchBuffer(font.fileUrl)
      fs.writeFileSync(filePath, buf)
    }
    GlobalFonts.registerFromPath(filePath, font.fontFamily)
  }
  console.log(`  ✓ ${fonts.length} fonts registered`)
}

// ─── Render Engine ───────────────────────────────────────────────────
function applyOpacityToColor(color: string, opacity: number): string {
  if (opacity >= 1) return color
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${opacity})`
  }
  return color
}

function buildFontString(size: number, style: Record<string, any>): string {
  const fontStyle = style.fontStyle ?? 'normal'
  const weight = style.fontWeight ?? 'normal'
  const family = style.fontFamily ?? 'sans-serif'
  return `${fontStyle} ${weight} ${Math.max(1, Math.floor(size))}px "${family}"`
}

function getTextX(width: number, align: string): number {
  switch (align) {
    case 'center': return width / 2
    case 'right': case 'end': return width
    default: return 0
  }
}

function breakTextIntoLines(ctx: any, content: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of content.split(/\r?\n/)) {
    if (!paragraph.trim()) { lines.push(''); continue }
    const words = paragraph.split(/\s+/)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate
      } else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

async function renderLayer(ctx: any, layer: Layer, imageCache: Map<string, any>) {
  if (layer.visible === false) return

  const { width, height } = layer.size
  const { x, y } = layer.position

  ctx.save()
  ctx.translate(x, y)

  if (layer.rotation) {
    ctx.translate(width / 2, height / 2)
    ctx.rotate((layer.rotation * Math.PI) / 180)
    ctx.translate(-width / 2, -height / 2)
  }

  if (layer.style?.opacity !== undefined) {
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.style.opacity))
  }

  if (layer.effects?.shadow?.enabled) {
    const s = layer.effects.shadow
    ctx.shadowOffsetX = s.shadowOffsetX ?? 0
    ctx.shadowOffsetY = s.shadowOffsetY ?? 0
    ctx.shadowBlur = s.shadowBlur ?? 0
    ctx.shadowColor = s.shadowColor ?? '#000000'
  }

  switch (layer.type) {
    case 'image': case 'logo': case 'element': {
      if (!layer.fileUrl) break
      let img = imageCache.get(layer.fileUrl)
      if (!img) {
        try {
          const buf = await fetchBuffer(layer.fileUrl)
          img = await loadImage(buf)
          imageCache.set(layer.fileUrl, img)
        } catch (e: any) {
          console.warn(`    ⚠ Failed to load: ${layer.name} - ${e.message}`)
          break
        }
      }
      const imgW = img.width, imgH = img.height
      const scale = Math.max(width / imgW, height / imgH)
      const dW = imgW * scale, dH = imgH * scale
      ctx.drawImage(img, 0, 0, imgW, imgH, (width - dW) / 2, (height - dH) / 2, dW, dH)
      break
    }
    case 'gradient': case 'gradient2': {
      const style = layer.style ?? {}
      const stops = style.gradientStops ?? []
      if (!stops.length) break
      const angle = (style.gradientAngle ?? 0) * (Math.PI / 180)
      const cx2 = Math.cos(angle), cy2 = Math.sin(angle)
      const gradient = ctx.createLinearGradient(
        width / 2 - (cx2 * width) / 2, height / 2 - (cy2 * height) / 2,
        width / 2 + (cx2 * width) / 2, height / 2 + (cy2 * height) / 2,
      )
      for (const stop of stops) {
        let color = stop.color
        if (stop.opacity !== undefined && stop.opacity < 1)
          color = applyOpacityToColor(stop.color, stop.opacity)
        gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), color)
      }
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
      break
    }
    case 'text': case 'rich-text': {
      const style = layer.style ?? {}
      const fontSize = Math.max(1, style.fontSize ?? 16)
      ctx.font = buildFontString(fontSize, style)
      ctx.fillStyle = style.color ?? '#000000'
      ctx.textAlign = style.textAlign ?? 'left'
      ctx.textBaseline = 'top'
      let content = layer.content ?? ''
      if (style.textTransform === 'uppercase') content = content.toUpperCase()
      else if (style.textTransform === 'lowercase') content = content.toLowerCase()
      const lineHeight = (style.lineHeight ?? 1.2) * fontSize
      const lines = breakTextIntoLines(ctx, content, width)
      const textX = getTextX(width, ctx.textAlign)
      let currentY = 0
      for (const line of lines) {
        ctx.fillText(line, textX, currentY, width)
        currentY += lineHeight
        if (currentY > height) break
      }
      break
    }
  }
  ctx.restore()
}

async function renderPage(layers: Layer[], imageCache: Map<string, any>): Promise<Buffer> {
  const canvas = createCanvas(1080, 1920)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, 1080, 1920)

  const sorted = [...layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  for (const layer of sorted) {
    await renderLayer(ctx, layer, imageCache)
  }
  return canvas.toBuffer('image/png')
}

// ─── Layer Manipulation ──────────────────────────────────────────────
function prepareLayers(
  layers: Layer[],
  driveImageUrl: string,
  texts: Record<string, string>,
): Layer[] {
  const prepared = layers.map((l) => ({ ...l }))

  // Find and swap dynamic background
  const bgLayer = prepared.find((l) => l.isDynamic && l.type === 'image')
  if (bgLayer) {
    bgLayer.fileUrl = driveImageUrl
  }

  // Hide layer 1 (fixed secondary image) if it's a non-dynamic full-size image
  // that would overlap the background — only keep it if it's the same template
  const layer1 = prepared.find((l) => l.order === 1 && l.type === 'image' && !l.isDynamic)
  if (layer1 && bgLayer) {
    // If layer 1 is full-size (same as canvas), it's a secondary background — hide it
    if (layer1.size.width >= 1080 && layer1.size.height >= 1900) {
      layer1.visible = false
    }
  }

  // Update text layers
  for (const layer of prepared) {
    if (layer.type !== 'text') continue
    const name = (layer.name ?? '').toLowerCase()

    if (name.includes('título principal copy') || name.includes('titulo principal copy')) {
      if (texts.subtitle) layer.content = texts.subtitle
    } else if (name.includes('título principal') || name.includes('titulo principal')) {
      if (texts.title) layer.content = texts.title
    } else if (name.includes('subtítulo copy') || name.includes('subtitulo copy')) {
      if (texts.address) layer.content = texts.address
      else if (texts.info) layer.content = texts.info
    } else if (name.includes('subtítulo') || name.includes('subtitulo')) {
      if (texts.info) layer.content = texts.info
    } else if (name.includes('corpo') || name.includes('body')) {
      if (texts.body) layer.content = texts.body
    }
  }

  return prepared
}

// ─── Main Pipeline ───────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()
  const targetDate = opts.date as string
  const dryRun = !!opts.dryRun
  const skipUpload = !!opts.skipUpload

  console.log('═══════════════════════════════════════════════════')
  console.log('  Studio Lagosta — Creative Generation Pipeline')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Date: ${targetDate}`)
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : skipUpload ? 'LOCAL ONLY' : 'FULL'}`)
  console.log('')

  // 1. Find project
  console.log('1. Finding project...')
  let project: any
  if (opts.projectId) {
    project = await prisma.project.findUnique({ where: { id: Number(opts.projectId) } })
  } else if (opts.project) {
    const all = await prisma.project.findMany({ where: { status: 'ACTIVE' } })
    project = all.find((p) =>
      p.name.toLowerCase().includes((opts.project as string).toLowerCase()),
    )
  } else {
    throw new Error('Provide --project <name> or --project-id <id>')
  }
  if (!project) throw new Error(`Project not found: ${opts.project ?? opts.projectId}`)
  console.log(`  ✓ ${project.name} (ID: ${project.id}, @${project.instagramUsername})`)

  // 2. Load knowledge base
  console.log('\n2. Loading knowledge base...')
  const kb = await loadKnowledgeBase(project.id)
  console.log(`  ✓ Tone: ${kb.tone ? 'loaded' : 'empty'}`)
  console.log(`  ✓ Hours: ${kb.hours ? 'loaded' : 'empty'}`)
  console.log(`  ✓ Menu: ${kb.menu ? 'loaded' : 'empty'}`)

  // 3. Register fonts
  console.log('\n3. Registering fonts...')
  await downloadAndRegisterFonts(project.id)

  // 4. Load image catalog from Drive
  console.log('\n4. Loading image catalog from Drive...')
  const imagesFolderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!imagesFolderId) throw new Error('No Google Drive folder configured for this project')
  const catalog = await loadCatalogFromDrive(imagesFolderId)
  if (!catalog || !catalog.images.length) {
    throw new Error('No image catalog found! Run: npx tsx scripts/analyze-drive-images.ts --project "' + project.name + '"')
  }
  const analyzed = catalog.images.filter((i) => i.menuItem || i.bestFor?.length).length
  console.log(`  ✓ Catalog loaded: ${catalog.images.length} images (${analyzed} analyzed)`)

  // 5. Get template for target day
  const dayOfWeek = getDayOfWeek(targetDate)
  console.log(`\n5. Loading template for "${dayOfWeek}"...`)
  const template = await getTemplateForDay(project.id, dayOfWeek)
  console.log(`  ✓ Template ID: ${template.templateId} (${template.pages.length} pages)`)
  for (const p of template.pages) console.log(`    - ${p.name} (${p.id})`)

  // 6. Build story configs
  console.log('\n6. Building story configurations...')
  const storyConfigs = buildStoryConfigs(kb, template.pages, dayOfWeek)

  // 7. Select images for each story (using Gemini analysis from catalog)
  console.log('\n7. Selecting images from catalog (Gemini-analyzed)...')
  const selectedIds = new Set<string>()
  for (const story of storyConfigs) {
    const entry = selectImageForTheme(catalog, story.theme, targetDate, selectedIds)
    if (entry) {
      story.driveImageId = entry.driveFileId
      story.driveImageName = entry.fileName
      selectedIds.add(entry.driveFileId)
    } else {
      console.warn(`  ⚠ ${story.label}: no image found for theme "${story.theme}"`)
    }
  }

  // 8. Render creatives
  console.log('\n8. Rendering creatives...')
  const imageCache = new Map<string, any>()
  const outputDir = `/tmp/studio-lagosta-creatives/${project.id}`
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const results: { story: StoryConfig; localPath: string; blobUrl?: string }[] = []

  for (let i = 0; i < storyConfigs.length; i++) {
    const story = storyConfigs[i]
    if (!story.driveImageId) {
      console.log(`  ⊘ Skipping ${story.label} — no image`)
      continue
    }

    console.log(`\n  [${i + 1}/${storyConfigs.length}] ${story.label}`)

    // Get template layers
    const page = template.pages.find((p) => p.id === story.templatePageId) ?? template.pages[0]
    const rawLayers: Layer[] = JSON.parse(page.layers)

    // Download Drive image
    console.log(`    Downloading: ${story.driveImageName}...`)
    const driveImageBuf = await downloadDriveImage(story.driveImageId!)
    const driveImage = await loadImage(driveImageBuf)
    const tempUrl = `drive://${story.driveImageId}`
    imageCache.set(tempUrl, driveImage)

    // Prepare layers
    const layers = prepareLayers(rawLayers, tempUrl, story.texts)
    console.log(`    ✓ ${layers.filter((l) => l.visible !== false).length} visible layers`)

    // Render
    const pngBuffer = await renderPage(layers, imageCache)
    const localPath = path.join(outputDir, `story-${targetDate}-${i + 1}-${story.theme}.png`)
    fs.writeFileSync(localPath, pngBuffer)
    console.log(`    ✓ Rendered (${(pngBuffer.length / 1024).toFixed(0)} KB) → ${localPath}`)

    let blobUrl: string | undefined
    if (!dryRun && !skipUpload) {
      try {
        const blob = await put(
          `creatives/${project.name.toLowerCase().replace(/\s+/g, '-')}/${targetDate}-${i + 1}.png`,
          pngBuffer,
          { access: 'public', contentType: 'image/png' },
        )
        blobUrl = blob.url
        console.log(`    ✓ Uploaded: ${blobUrl}`)
      } catch (e: any) {
        console.error(`    ✗ Upload failed: ${e.message}`)
      }
    }

    results.push({ story, localPath, blobUrl })
  }

  // 9. Create SocialPost records
  if (!dryRun && results.length > 0) {
    console.log('\n9. Creating SocialPost records...')
    for (const { story, blobUrl } of results) {
      const scheduledDatetime = new Date(`${targetDate}T${story.utcTime}:00.000Z`)
      const post = await prisma.socialPost.create({
        data: {
          projectId: project.id,
          userId: project.userId,
          postType: 'STORY',
          caption: buildCaption(story),
          mediaUrls: blobUrl ? [blobUrl] : [],
          scheduleType: 'SCHEDULED',
          scheduledDatetime,
          status: 'DRAFT',
        },
      })
      console.log(`  ✓ ${post.id} — ${story.label} @ ${story.localTime} BRT`)
    }

    // Update catalog usage
    for (const { story } of results) {
      if (!story.driveImageId) continue
      const entry = catalog.images.find((i) => i.driveFileId === story.driveImageId)
      if (entry) {
        entry.usageHistory.push({ date: targetDate, theme: story.theme })
      }
    }
    await saveCatalogToDrive(catalog, imagesFolderId)
    console.log('  ✓ Catalog usage history updated (saved to Drive)')
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  ✓ ${results.length} creatives generated for ${targetDate}`)
  console.log(`  ✓ Project: ${project.name} (@${project.instagramUsername})`)
  console.log(`  ✓ Template: ${dayOfWeek}`)
  for (const { story, localPath, blobUrl } of results) {
    console.log(`  • ${story.localTime} ${story.label}`)
    console.log(`    Image: ${story.driveImageName}`)
    console.log(`    Local: ${localPath}`)
    if (blobUrl) console.log(`    Blob: ${blobUrl}`)
  }
  console.log('═══════════════════════════════════════════════════')

  await prisma.$disconnect()
}

function buildCaption(story: StoryConfig): string {
  const parts: string[] = []
  if (story.texts.title && story.texts.subtitle) {
    parts.push(`${story.texts.title} ${story.texts.subtitle}!`)
  }
  if (story.texts.body) parts.push(story.texts.body)
  if (story.texts.info) parts.push(story.texts.info)
  return parts.join('\n\n')
}

main().catch((e) => {
  console.error('\n✗ Fatal error:', e.message ?? e)
  prisma.$disconnect()
  process.exit(1)
})
