/**
 * plan-week.ts
 *
 * Automated weekly story planning:
 * - For each day (Mon-Sun), selects a template + 3 images from catalog
 * - Creates 3 DRAFT SocialPost records per day (abertura, almoço, happy hour)
 * - Posts reference pageId + slotValues (no image rendering needed yet)
 * - Total: 21 DRAFTs for manual review before scheduling
 *
 * Usage:
 *   npx tsx scripts/plan-week.ts --project "By Rock" --week 2026-03-24
 *   npx tsx scripts/plan-week.ts --project-id 7 --week next
 *   npx tsx scripts/plan-week.ts --project "By Rock"  # defaults to next Monday
 */

import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'
import * as https from 'https'
import * as http from 'http'
import 'dotenv/config'

// ─── Types ───────────────────────────────────────────────────────────
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

interface DayPlan {
  date: string
  dayOfWeek: string
  stories: {
    label: string
    localTime: string
    utcTime: string
    theme: string
    pageId: string
    pageName: string
    driveImageId?: string
    driveImageName?: string
    texts: Record<string, string>
  }[]
}

// ─── CLI Args ────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') { opts.dryRun = true; continue }
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      opts[key] = args[++i]
    }
  }
  return opts
}

// ─── Clients ─────────────────────────────────────────────────────────
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

// ─── Date Helpers ────────────────────────────────────────────────────
function getWeekStart(weekStr: string): Date {
  if (weekStr === 'next') {
    const today = new Date()
    const day = today.getDay()
    const daysUntilMonday = day === 0 ? 1 : 8 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + daysUntilMonday)
    return monday
  }
  return new Date(weekStr + 'T12:00:00')
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

const DAY_NAMES = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
const DAY_TITLES: Record<string, string> = {
  domingo: 'DOMINGO', segunda: 'SEGUNDA', terca: 'TERÇA',
  quarta: 'QUARTA', quinta: 'QUINTA', sexta: 'SEXTA', sabado: 'SÁBADO',
}

// ─── Catalog ─────────────────────────────────────────────────────────
async function loadCatalog(imagesFolderId: string): Promise<ImageCatalog | null> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${imagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  const fileId = res.data.files?.[0]?.id
  if (!fileId) return null

  const content = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' })
  const catalog = content.data as unknown as ImageCatalog
  catalog.catalogFileId = fileId
  return catalog
}

function selectImage(
  catalog: ImageCatalog,
  theme: string,
  targetDate: string,
  alreadySelected: Set<string>,
): ImageCatalogEntry | null {
  const notSelected = (img: ImageCatalogEntry) => !alreadySelected.has(img.driveFileId)
  const highQuality = (img: ImageCatalogEntry) => img.quality !== 'baixa'

  // 1. bestFor match
  let candidates = catalog.images.filter(
    (img) => notSelected(img) && highQuality(img)
      && img.bestFor?.some((b) => b.toLowerCase().includes(theme.toLowerCase())),
  )

  // 2. tags match
  if (!candidates.length) {
    candidates = catalog.images.filter(
      (img) => notSelected(img) && highQuality(img)
        && img.tags?.some((t) => t.toLowerCase().includes(theme.toLowerCase())),
    )
  }

  // 3. menuCategory match
  if (!candidates.length) {
    const categoryMap: Record<string, string[]> = {
      abertura: ['AMBIENTE', 'AREA_KIDS'],
      almoco: ['PRATOS_PRINCIPAIS', 'PRATOS_BY_ROCK'],
      'happy-hour': ['BEBIDAS', 'PETISCOS_ENTRADAS'],
    }
    const categories = categoryMap[theme] ?? []
    if (categories.length) {
      candidates = catalog.images.filter(
        (img) => notSelected(img) && highQuality(img)
          && img.menuCategory && categories.includes(img.menuCategory),
      )
    }
  }

  // 4. Fallback: any unused
  if (!candidates.length) {
    candidates = catalog.images.filter(notSelected)
  }

  if (!candidates.length) return null

  // Sort by least recently used
  candidates.sort((a, b) => {
    const aLast = a.usageHistory?.length ? a.usageHistory[a.usageHistory.length - 1].date : '2000-01-01'
    const bLast = b.usageHistory?.length ? b.usageHistory[b.usageHistory.length - 1].date : '2000-01-01'
    return aLast.localeCompare(bLast)
  })

  return candidates[0]
}

// ─── Knowledge Base ──────────────────────────────────────────────────
async function loadKB(projectId: number) {
  const entries = await prisma.$queryRawUnsafe<{ category: string; content: string }[]>(
    `SELECT category, content FROM knowledge_base_entries WHERE "projectId" = $1`,
    projectId,
  )
  const kb: Record<string, string> = {}
  for (const e of entries) kb[e.category] = e.content
  return kb
}

// ─── Template Selection ──────────────────────────────────────────────
async function getTemplatePages(projectId: number) {
  const templates = await prisma.template.findMany({
    where: { projectId, type: 'STORY' },
    include: {
      Page: {
        where: { isTemplate: true },
        select: { id: true, name: true, templateId: true },
      },
    },
  })

  // Flatten all pages
  const allPages = templates.flatMap((t) =>
    t.Page.map((p) => ({ ...p, templateName: t.name, templateId: t.id })),
  )

  return { templates, pages: allPages }
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()
  const dryRun = !!opts.dryRun

  console.log('═══════════════════════════════════════════════════')
  console.log('  Studio Lagosta — Weekly Story Planner')
  console.log('═══════════════════════════════════════════════════\n')

  // 1. Find project
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
  if (!project) throw new Error('Project not found')
  console.log(`Project: ${project.name} (ID: ${project.id})`)

  // 2. Determine week
  const weekStr = (opts.week as string) || 'next'
  const weekStart = getWeekStart(weekStr)
  console.log(`Week starting: ${formatDate(weekStart)}`)

  // 3. Load catalog
  const imagesFolderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!imagesFolderId) throw new Error('No Drive folder configured')
  const catalog = await loadCatalog(imagesFolderId)
  if (!catalog || !catalog.images.length) {
    throw new Error('No image catalog found! Run analyze-all-projects.ts first.')
  }
  console.log(`Catalog: ${catalog.images.length} images`)

  // 4. Load KB & templates
  const kb = await loadKB(project.id)
  const { pages } = await getTemplatePages(project.id)
  if (pages.length === 0) throw new Error('No template pages found')
  console.log(`Template pages: ${pages.length}`)

  // 5. Plan each day
  const weekPlan: DayPlan[] = []
  const selectedImages = new Set<string>()
  const storyConfigs = [
    { label: 'Abertura', localTime: '09:00', utcTime: '12:00', theme: 'abertura' },
    { label: 'Almoço', localTime: '11:00', utcTime: '14:00', theme: 'almoco' },
    { label: 'Happy Hour', localTime: '17:00', utcTime: '20:00', theme: 'happy-hour' },
  ]

  for (let d = 0; d < 7; d++) {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + d)
    const dateStr = formatDate(date)
    const dayOfWeek = DAY_NAMES[date.getDay()]

    // Select page for this day (prefer matching by day name)
    const dayPage = pages.find((p) =>
      p.templateName.toLowerCase().includes(dayOfWeek) || p.name.toLowerCase().includes(dayOfWeek),
    ) ?? pages[0]

    const stories = storyConfigs.map((config) => {
      const image = selectImage(catalog, config.theme, dateStr, selectedImages)
      if (image) selectedImages.add(image.driveFileId)

      return {
        ...config,
        pageId: dayPage.id,
        pageName: dayPage.name,
        driveImageId: image?.driveFileId,
        driveImageName: image?.fileName,
        texts: {
          title: DAY_TITLES[dayOfWeek] ?? dayOfWeek.toUpperCase(),
          subtitle: config.label.toUpperCase(),
        },
      }
    })

    weekPlan.push({ date: dateStr, dayOfWeek, stories })
  }

  // 6. Display plan
  console.log('\n─── Week Plan ───────────────────────────────────\n')
  for (const day of weekPlan) {
    console.log(`  ${day.date} (${day.dayOfWeek})`)
    for (const s of day.stories) {
      const img = s.driveImageName ?? '(sem imagem)'
      console.log(`    ${s.localTime} ${s.label} — ${s.pageName} — ${img}`)
    }
  }

  // 7. Create DRAFTs
  if (!dryRun) {
    console.log('\n─── Creating DRAFT posts ────────────────────────\n')
    let created = 0

    for (const day of weekPlan) {
      for (const story of day.stories) {
        const scheduledDatetime = new Date(`${day.date}T${story.utcTime}:00.000Z`)

        const slotValues: Record<string, unknown> = { ...story.texts }
        if (story.driveImageId) {
          slotValues._driveImageId = story.driveImageId
        }

        await prisma.socialPost.create({
          data: {
            projectId: project.id,
            userId: project.userId,
            postType: 'STORY',
            caption: `${story.texts.title} ${story.texts.subtitle}`,
            mediaUrls: [],
            scheduleType: 'SCHEDULED',
            scheduledDatetime,
            status: 'DRAFT',
            pageId: story.pageId,
            templateId: pages.find((p) => p.id === story.pageId)?.templateId ?? null,
            slotValues: slotValues as any,
            renderStatus: 'NOT_NEEDED', // Will be set to PENDING when status changes to SCHEDULED
          },
        })
        created++
      }
    }

    console.log(`  ✓ ${created} DRAFT posts created for review`)
    console.log(`  Next: Review drafts in the UI and change status to SCHEDULED`)
  } else {
    console.log('\n  (dry run — no posts created)')
  }

  console.log('\n═══════════════════════════════════════════════════')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('\n✗ Fatal:', e.message ?? e)
  prisma.$disconnect()
  process.exit(1)
})
