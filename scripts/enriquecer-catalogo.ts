/**
 * enriquecer-catalogo.ts
 *
 * Preenche EM LUGAR os registros em branco do `_image-catalog.json` de QUALQUER
 * cliente: as entradas que já existem no catálogo mas estão sem `description` e
 * sem `tags`, e que por isso a busca por TEMA não alcança.
 *
 * 🔴 Por que não dá para usar os outros dois caminhos:
 *
 * - `analyze-drive-images.ts` só analisa foto que está FORA do catálogo
 *   (`if (!existingIds.has(img.id))`). Foto já catalogada como registro vazio é
 *   ignorada, então ele encontra ZERO nesses casos. Some-se a janela de
 *   `--months 9`, que foi o que deixou centenas de fotos antigas de fora.
 * - `reconciliar-catalogo.ts` (o cron das 02:00) é um DIFF DE IDS e, por
 *   desenho, não toca em entrada existente.
 *
 * Generalizado em 24/08/2026 a partir de `enrich-catalog-seu-quinto.ts`, que
 * fazia exatamente isto mas com o projeto, a pasta e o prompt cravados no
 * código. O que mudou: projeto vem da linha de comando, a pasta de imagens vem
 * do banco, e o prompt é montado do DNA e dos PILARES daquele cliente — a
 * descrição escrita no vocabulário da marca vale muito mais que tag genérica de
 * restaurante, e era essa a virtude do script original.
 *
 * Uso:
 *   npx tsx scripts/enriquecer-catalogo.ts --project-id 7 --dry-run --limit 8
 *   npx tsx scripts/enriquecer-catalogo.ts --projeto "By Rock" --concurrency 6
 *   npx tsx scripts/enriquecer-catalogo.ts --project-id 7 --force   # re-analisa tudo
 *
 * Somente leitura no banco: escreve apenas no `_image-catalog.json` do Drive.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'
import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import 'dotenv/config'

// ─── Tipos ───────────────────────────────────────────────────────────
interface CatalogImage {
  driveFileId: string
  fileName: string
  folder: string
  folderId?: string
  createdTime?: string
  menuItem?: string | null
  menuCategory?: string | null
  description?: string
  tags?: string[]
  mood?: string
  bestFor?: string[]
  quality?: string
  zona?: string | null
  clienteIdentificavel?: boolean
  usageHistory?: { date: string; theme: string }[]
  analiseBloqueada?: boolean
  /** Preço legível no quadro — fere o DNA; o ranking rebaixa (01/09/2026). */
  precoLegivel?: boolean
  /** Marca de terceiro em destaque, ou null. */
  marcaDeTerceiro?: string | null
}

interface ImageCatalog {
  projectId: number
  projectName: string
  catalogFileId: string | null
  lastUpdated?: string
  images: CatalogImage[]
}

interface GeminiResult {
  zona: string | null
  menuItem: string | null
  menuCategory: string | null
  description: string
  tags: string[]
  mood: string
  bestFor: string[]
  quality: string
  clienteIdentificavel: boolean
  observacao?: string
  precoLegivel?: boolean
  marcaDeTerceiro?: string | null
}

// ─── CLI ─────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue
    const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (i + 1 < args.length && !args[i + 1].startsWith('--')) opts[key] = args[++i]
    else opts[key] = true
  }
  return opts
}

const prisma = new PrismaClient()
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

// `gemini-2.0-flash` foi APOSENTADO: devolve 404 embora siga aparecendo no
// ListModels. Mesma variável que o cron de reconciliação usa.
const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'
const model = genAI.getGenerativeModel({
  model: MODEL,
  generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
})

function getDrive() {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  c.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location).then(resolve).catch(reject)
        }
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode} ao baixar thumbnail`))
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

async function getFileMetaAndThumb(fileId: string) {
  const drive = getDrive()
  const meta = await drive.files.get({ fileId, fields: 'thumbnailLink, createdTime, parents' })
  if (!meta.data.thumbnailLink) throw new Error('sem thumbnail')
  const url = meta.data.thumbnailLink.replace(/=s\d+/, '=s512')
  const buf = await fetchBuffer(url)
  return { buffer: buf, createdTime: meta.data.createdTime ?? undefined, folderId: meta.data.parents?.[0] }
}

/** Varre a árvore de pastas da pasta de imagens (até 4 níveis). */
async function listarPastas(parentId: string, depth = 4, prefix = ''): Promise<{ id: string; name: string }[]> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 200,
  })
  const out: { id: string; name: string }[] = []
  for (const f of res.data.files ?? []) {
    const full = prefix ? `${prefix}/${f.name}` : f.name!
    out.push({ id: f.id!, name: full })
    if (depth > 1) out.push(...(await listarPastas(f.id!, depth - 1, full)))
  }
  return out
}

async function listarImagens(folderId: string) {
  const drive = getDrive()
  const out: { id: string; name: string; createdTime: string }[] = []
  let tok: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id, name, createdTime), nextPageToken',
      pageSize: 1000,
      pageToken: tok,
    })
    for (const f of res.data.files ?? []) out.push({ id: f.id!, name: f.name!, createdTime: f.createdTime! })
    tok = res.data.nextPageToken ?? undefined
  } while (tok)
  return out
}

/**
 * Reconcilia o catálogo com o estado real do Drive: atualiza `folder` do que foi
 * movido, acrescenta como stub o que ainda não está no catálogo e MARCA (nunca
 * apaga) o que sumiu do Drive.
 */
async function sincronizarComDrive(catalog: ImageCatalog, imagesFolderId: string) {
  const pastas = await listarPastas(imagesFolderId)
  pastas.push({ id: imagesFolderId, name: '(raiz)' })

  const noDrive = new Map<string, { folder: string; folderId: string; name: string; createdTime: string }>()
  for (const p of pastas) {
    for (const img of await listarImagens(p.id)) {
      noDrive.set(img.id, { folder: p.name, folderId: p.id, name: img.name, createdTime: img.createdTime })
    }
  }

  let movidas = 0, renomeadas = 0, ausentes = 0, novas = 0
  const porId = new Map(catalog.images.map((i) => [i.driveFileId, i]))

  for (const img of catalog.images) {
    const atual = noDrive.get(img.driveFileId)
    if (!atual) {
      if (!(img as any).ausenteNoDrive) ausentes++
      ;(img as any).ausenteNoDrive = true
      continue
    }
    delete (img as any).ausenteNoDrive
    if (img.folder !== atual.folder) {
      img.folder = atual.folder
      img.folderId = atual.folderId
      movidas++
    }
    if (img.fileName !== atual.name) {
      img.fileName = atual.name
      renomeadas++
    }
  }

  for (const [id, meta] of noDrive) {
    if (porId.has(id)) continue
    catalog.images.push({
      driveFileId: id,
      fileName: meta.name,
      folder: meta.folder,
      folderId: meta.folderId,
      createdTime: meta.createdTime,
      usageHistory: [],
    })
    novas++
  }

  return { movidas, renomeadas, ausentes, novas, totalDrive: noDrive.size, pastas: pastas.length }
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

async function readCatalog(fileId: string): Promise<ImageCatalog> {
  const drive = getDrive()
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' })
  return res.data as unknown as ImageCatalog
}

async function saveCatalog(catalog: ImageCatalog) {
  const drive = getDrive()
  const { Readable } = await import('stream')
  // O stream é criado A CADA chamada de propósito: `Readable` já consumido
  // subiria vazio numa segunda tentativa, zerando o catálogo sem erro nenhum.
  const stream = new Readable()
  stream.push(JSON.stringify(catalog, null, 2))
  stream.push(null)
  await drive.files.update({
    fileId: catalog.catalogFileId!,
    media: { mimeType: 'application/json', body: stream },
  })
}

// ─── Contexto da marca, montado por cliente ──────────────────────────
async function carregarCardapio(projectId: number): Promise<string> {
  const entries = await prisma.$queryRawUnsafe<{ content: string }[]>(
    `SELECT content FROM knowledge_base_entries WHERE "projectId" = $1 AND status = 'ACTIVE' AND (
      category = 'CARDAPIO'
      OR (category = 'ESTABELECIMENTO_INFO' AND (title ILIKE '%cardápio%' OR title ILIKE '%cardapio%'))
    ) ORDER BY CASE WHEN category = 'CARDAPIO' THEN 0 ELSE 1 END`,
    projectId,
  )
  return entries.map((e) => e.content).join('\n\n')
}

function cortar(texto: string | null | undefined, teto: number) {
  if (!texto) return ''
  return texto.length > teto ? `${texto.slice(0, teto)}…` : texto
}

/**
 * O contexto visual da marca vem do DNA — `photoDirection` descreve o salão
 * real, os props e a luz da casa, que é exatamente o que o modelo precisa para
 * reconhecer o lugar em vez de descrever "um restaurante".
 */
async function carregarContextoDaMarca(projectId: number, projectName: string) {
  const dna = await prisma.brandDNA.findUnique({ where: { projectId } })
  const partes: string[] = [`Você está catalogando o acervo fotográfico do ${projectName}.`]
  if (dna?.photoDirection) partes.push(`DIREÇÃO FOTOGRÁFICA E CENÁRIO DA CASA:\n${cortar(dna.photoDirection, 4500)}`)
  if (dna?.visualStyle) partes.push(`ESTÉTICA DA MARCA:\n${cortar(dna.visualStyle, 2000)}`)
  if (!dna?.photoDirection && !dna?.visualStyle) {
    partes.push('(Este cliente ainda não tem direção fotográfica no DNA — descreva de forma concreta o que vê.)')
  }
  return partes.join('\n\n')
}

/**
 * O vocabulário de tags sai dos PILARES aprovados do cliente e das PASTAS do
 * acervo — as duas taxonomias que gente já curou. Inventar um terceiro
 * vocabulário recriaria o problema que os pilares vieram resolver.
 */
function montarVocabulario(pilares: string[], pastas: string[]) {
  const linhas = [
    'VOCABULÁRIO CONTROLADO DE TAGS (prefira estas; pode acrescentar as específicas do que você vê, sempre em minúsculas e com hífen):',
  ]
  if (pilares.length) linhas.push(`Temas da marca (pilares aprovados): ${pilares.join(' · ')}`)
  if (pastas.length) linhas.push(`Assuntos do acervo (pastas): ${pastas.join(' · ')}`)
  linhas.push('NUNCA use como tag o caminho da pasta (nada de "08_sobremesas/rock\'n brownie" nem "_casting-artistas"): a tag é o ASSUNTO, em palavra minúscula com hífen.')
  linhas.push('Luz: golden-hour · luz-ambar-interna · sol-forte · noite · contraluz · penumbra')
  linhas.push('Ocasião: almoco · jantar · happy-hour · fim-de-semana · familia · grupo · casal · sozinho')
  linhas.push('Uso: story-abertura · story-oferta · story-conversao · prova-social · cardapio · ambiente · evento-sazonal')
  return linhas.join('\n')
}

function buildPrompt(folderName: string, menu: string, contexto: string, vocab: string): string {
  return `Você é um curador visual de acervo fotográfico de restaurante.
Analise esta foto do acervo. Ela está na pasta "${folderName}".

${contexto}

${menu ? `CARDÁPIO OFICIAL (use EXATAMENTE estes nomes ao identificar um prato):\n${menu}\n` : ''}
${vocab}

Retorne APENAS um JSON, sem markdown:
{
  "zona": "onde na casa a foto acontece, em uma palavra minúscula (fachada, salao, varanda, balcao, calcada, cozinha, area-kids, externa). null se for close de prato ou bebida sem ambiente reconhecível",
  "menuItem": "nome EXATO do item do cardápio acima, copiado letra por letra. null se não for comida/bebida ou se não der para identificar com segurança",
  "menuCategory": "PETISCOS_ENTRADAS | PRATOS_PRINCIPAIS | SALADAS | SOBREMESAS | BEBIDAS | AMBIENTE | MUSICA | AREA_KIDS | null",
  "description": "1 a 2 frases em português descrevendo CONCRETAMENTE o que aparece. Cite os marcadores da casa que reconhecer a partir da direção fotográfica acima. Seja específico, nunca genérico — esta frase é o que a busca por tema vai encontrar.",
  "tags": ["6 a 12 tags do vocabulário acima, mais as específicas do que você vê"],
  "mood": "uma palavra: casual, animado, aconchegante, familiar, festivo, sofisticado, documental",
  "bestFor": ["temas de post ideais, do vocabulário de Uso e dos pilares acima"],
  "quality": "alta | media | baixa",
  "clienteIdentificavel": true se houver rosto de CLIENTE reconhecível em primeiro plano (não conta equipe uniformizada nem músico no palco), senão false,
  "precoLegivel": true se há preço, valor em R$ ou cardápio com preços LEGÍVEIS no quadro (placa, carta, etiqueta, tela), senão false,
  "marcaDeTerceiro": "nome da marca de TERCEIRO em destaque no quadro (cerveja, refrigerante, loja vizinha — guarda-sol, geladeira, letreiro), ou null se não há",
  "observacao": "opcional, só se a foto tiver problema relevante (desfocada, escura demais, print de tela, arte pronta em vez de foto, imagem gerada por IA)"
}

CRITÉRIOS DE QUALIDADE:
- "alta": nítida, bem iluminada, composição boa, luz coerente com a casa, serve para virar arte.
- "media": utilizável com alguma limitação (enquadramento torto, luz mediana, fundo bagunçado).
- "baixa": desfocada, escura ou estourada demais, ruído alto, print de tela, duplicada de enquadramento ruim.

REGRAS:
1. menuItem DEVE ser copiado exatamente do cardápio. Não batendo com nenhum item, use null. NUNCA invente prato.
2. Ambiente, decoração, fachada ou área externa sem comida em destaque: menuItem null, menuCategory "AMBIENTE".
3. Chopp, cerveja, vinho, cachaça ou drink: menuCategory "BEBIDAS".
4. Músico ou roda de samba tocando: menuCategory "MUSICA".
5. description e tags em português, tags em minúsculas.
6. Seja honesto no quality — o objetivo é permitir descartar foto ruim.`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function analyze(buffer: Buffer, folderName: string, menu: string, contexto: string, vocab: string): Promise<GeminiResult> {
  const prompt = buildPrompt(folderName, menu, contexto, vocab)
  let lastErr: any
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: 'image/jpeg', data: buffer.toString('base64') } },
      ])
      const text = result.response.text().trim()
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```$/, '').trim()
      return JSON.parse(jsonStr) as GeminiResult
    } catch (e: any) {
      lastErr = e
      const msg = String(e?.message ?? e)
      // Foto que a visão RECUSA analisar não pode ficar fora do catálogo: sem a
      // entrada, o diff a redescobre TODA madrugada, uma chamada paga por dia.
      if (/PROHIBITED_CONTENT|SAFETY|blocked/i.test(msg)) throw Object.assign(new Error('recusada pela visão'), { bloqueada: true })
      const backoff = /429|503|overload|quota|rate/i.test(msg) ? 4000 * 2 ** attempt : 1000
      await sleep(backoff)
    }
  }
  throw lastErr
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()
  const dryRun = opts.dryRun === true
  const force = opts.force === true
  const limit = opts.limit ? parseInt(opts.limit as string, 10) : Infinity
  const concurrency = parseInt((opts.concurrency as string) ?? '6', 10)
  const saveEvery = parseInt((opts.saveEvery as string) ?? '50', 10)

  const projectId = opts.projectId ? parseInt(opts.projectId as string, 10) : null
  const projetoNome = typeof opts.projeto === 'string' ? opts.projeto : null
  if (!projectId && !projetoNome) {
    throw new Error('informe --project-id N ou --projeto "Nome do cliente"')
  }

  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId } })
    : await prisma.project.findFirst({ where: { name: { contains: projetoNome!, mode: 'insensitive' } } })
  if (!project) throw new Error(`cliente não encontrado (${projectId ?? projetoNome})`)
  if (!project.googleDriveImagesFolderId) {
    throw new Error(`"${project.name}" não tem pasta de imagens cadastrada (googleDriveImagesFolderId)`)
  }
  const imagesFolderId = project.googleDriveImagesFolderId

  console.log('═══════════════════════════════════════════════════')
  console.log(`  ${project.name} — enriquecimento do catálogo`)
  console.log('═══════════════════════════════════════════════════\n')

  console.log('1. Carregando cardápio e DNA da marca...')
  const menu = await carregarCardapio(project.id)
  const contexto = await carregarContextoDaMarca(project.id, project.name)
  const pilares = (
    await prisma.contentPillar.findMany({
      where: { projectId: project.id, aprovado: true },
      orderBy: { ordem: 'asc' },
      select: { slug: true },
    })
  ).map((p) => p.slug)
  console.log(`   ✓ cardápio ${menu.length} chars · contexto do DNA ${contexto.length} chars · ${pilares.length} pilares`)

  console.log('\n2. Lendo catálogo do Drive...')
  const catalogFileId = await findCatalogFile(imagesFolderId)
  if (!catalogFileId) throw new Error('_image-catalog.json não encontrado na pasta de imagens deste cliente')
  const catalog = await readCatalog(catalogFileId)
  catalog.catalogFileId = catalogFileId
  console.log(`   ✓ ${catalog.images.length} imagens no catálogo (fileId ${catalogFileId})`)

  if (catalog.projectId !== project.id || catalog.projectName !== project.name) {
    console.log(`   ⚠ cabeçalho: ${catalog.projectId} / "${catalog.projectName}" → ${project.id} / "${project.name}"`)
    catalog.projectId = project.id
    catalog.projectName = project.name
  }

  console.log('\n3. Sincronizando com o Drive...')
  const sync = await sincronizarComDrive(catalog, imagesFolderId)
  console.log(`   ✓ ${sync.totalDrive} imagens no Drive em ${sync.pastas} pastas`)
  console.log(`   · movidas de pasta: ${sync.movidas} · renomeadas: ${sync.renomeadas} · novas: ${sync.novas}`)
  if (sync.ausentes) console.log(`   ⚠ sumiram do Drive (marcadas, não apagadas): ${sync.ausentes}`)
  if (!dryRun && (sync.movidas || sync.novas || sync.renomeadas || sync.ausentes)) {
    await saveCatalog(catalog)
    console.log('   ✓ sincronia salva')
  }

  // Só a FOLHA do caminho, sem o prefixo numérico de ordenação: o modelo ecoa o
  // que recebe, e "08_sobremesas/rock'n brownie" como tag não é assunto nenhum.
  const pastas = [
    ...new Set(
      catalog.images
        .map((i) => (i.folder ?? '').split('/').pop() ?? '')
        .map((n) => n.replace(/^_+/, '').replace(/^\d+[_-]/, '').trim().toLowerCase().replace(/\s+/g, '-'))
        .filter((n) => n && n !== '(raiz)'),
    ),
  ].sort()
  const vocab = montarVocabulario(pilares, pastas)

  const pending = catalog.images.filter(
    (i) => force || ((!i.tags || i.tags.length === 0 || !i.description) && !i.analiseBloqueada),
  )
  const todo = pending.slice(0, limit === Infinity ? undefined : limit)
  console.log(`\n4. ${pending.length} imagens sem metadados · processando ${todo.length}`)
  if (dryRun) console.log('   (--dry-run: nada será salvo no Drive)')
  if (todo.length === 0) {
    console.log('\n   Nada a fazer.')
    await prisma.$disconnect()
    return
  }

  console.log(`\n5. Analisando com ${MODEL} (concorrência ${concurrency})...\n`)

  let done = 0, ok = 0, errors = 0, bloqueadas = 0
  const errorLog: { file: string; folder: string; error: string }[] = []
  const amostra: CatalogImage[] = []
  let cursor = 0
  let sinceSave = 0

  async function worker() {
    while (true) {
      const idx = cursor++
      if (idx >= todo.length) return
      const img = todo[idx]
      try {
        const { buffer, createdTime, folderId } = await getFileMetaAndThumb(img.driveFileId)
        const r = await analyze(buffer, img.folder, menu, contexto, vocab)

        img.createdTime = createdTime
        img.folderId = folderId
        img.zona = r.zona ?? null
        img.menuItem = r.menuItem ?? null
        img.menuCategory = r.menuCategory ?? null
        img.description = r.description ?? ''
        img.mood = r.mood ?? 'casual'
        img.bestFor = Array.isArray(r.bestFor) ? r.bestFor : []
        img.quality = r.quality ?? 'media'
        img.clienteIdentificavel = r.clienteIdentificavel === true
        // Só o que o modelo AFIRMOU: omitido fica ausente (neutro no ranking).
        if (typeof r.precoLegivel === 'boolean') img.precoLegivel = r.precoLegivel
        if (typeof r.marcaDeTerceiro === 'string' && r.marcaDeTerceiro.trim()) {
          img.marcaDeTerceiro = r.marcaDeTerceiro.trim().slice(0, 60)
        } else if (r.marcaDeTerceiro === null) {
          img.marcaDeTerceiro = null
        }
        img.usageHistory = img.usageHistory ?? []

        const tags = new Set<string>(
          (Array.isArray(r.tags) ? r.tags : [])
            .map((t) => String(t).toLowerCase().trim())
            .filter((t) => t && !t.includes('/') && !/^\d+_/.test(t)),
        )
        if (r.zona) tags.add(String(r.zona).toLowerCase())
        if (img.clienteIdentificavel) tags.add('cliente-identificavel')
        if (img.quality === 'baixa') tags.add('descarte-sugerido')
        img.tags = [...tags]

        if (amostra.length < 8) amostra.push(img)
        ok++
      } catch (e: any) {
        if (e?.bloqueada) {
          // Entra no catálogo com o que dá para saber sem vê-la (a pasta), para
          // o diff da madrugada não redescobri-la todo dia.
          img.description = img.description || `Foto da pasta ${img.folder}. A análise por visão foi recusada.`
          img.tags = img.tags?.length ? img.tags : [img.folder.split('/').pop()!.toLowerCase()]
          img.analiseBloqueada = true
          img.quality = img.quality ?? 'media'
          bloqueadas++
        } else {
          errors++
          errorLog.push({ file: img.fileName, folder: img.folder, error: String(e?.message ?? e).slice(0, 120) })
        }
      }
      done++
      sinceSave++
      if (done % 25 === 0 || done === todo.length) {
        console.log(`   [${done}/${todo.length}] ${((done / todo.length) * 100).toFixed(1)}% · ok ${ok} · erros ${errors}${bloqueadas ? ` · recusadas ${bloqueadas}` : ''}`)
      }
      if (!dryRun && sinceSave >= saveEvery) {
        sinceSave = 0
        catalog.lastUpdated = new Date().toISOString()
        try {
          await saveCatalog(catalog)
        } catch (e: any) {
          console.log(`   ⚠ falha ao salvar parcial: ${String(e?.message).slice(0, 80)}`)
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  if (!dryRun) {
    console.log('\n6. Salvando catálogo no Drive...')
    catalog.lastUpdated = new Date().toISOString()
    await saveCatalog(catalog)
    console.log('   ✓ salvo')
  }

  const reportPath = (opts.report as string) ?? ''
  if (reportPath && typeof reportPath === 'string') {
    fs.writeFileSync(reportPath, JSON.stringify(catalog, null, 2))
    console.log(`   ✓ cópia local → ${reportPath}`)
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  ✓ analisadas: ${ok} · erros: ${errors} · recusadas pela visão: ${bloqueadas}`)
  if (amostra.length) {
    console.log('\n  Amostra do que foi escrito:')
    for (const a of amostra.slice(0, 5)) {
      console.log(`\n    ${a.folder}/${a.fileName}`)
      console.log(`      zona: ${a.zona ?? '—'} · prato: ${a.menuItem ?? '—'} · qualidade: ${a.quality}`)
      console.log(`      ${a.description}`)
      console.log(`      tags: ${(a.tags ?? []).join(', ')}`)
    }
  }
  if (errorLog.length) {
    console.log('\n  Erros (até 15):')
    for (const e of errorLog.slice(0, 15)) console.log(`    ${e.folder}/${e.file}: ${e.error}`)
  }
  console.log('═══════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('\n✗ Fatal:', e?.message ?? e)
  prisma.$disconnect()
  process.exit(1)
})
