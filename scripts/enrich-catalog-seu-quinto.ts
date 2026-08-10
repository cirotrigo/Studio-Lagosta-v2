/**
 * enrich-catalog-seu-quinto.ts
 *
 * Enriquece EM LUGAR o _image-catalog.json do Seu Quinto (projectId 4).
 *
 * Diferente de analyze-drive-images.ts, que só analisa imagens NOVAS (ainda
 * fora do catálogo), este script preenche os metadados das entradas que já
 * existem no catálogo mas estão em branco (stubs sem tags/description/quality).
 *
 * O prompt do Gemini é específico do Seu Quinto: usa o vocabulário do DNA da
 * marca (zonas da casa, marcadores visuais do salão, temas de uso) em vez das
 * tags genéricas de restaurante.
 *
 * Uso:
 *   npx tsx scripts/enrich-catalog-seu-quinto.ts --dry-run --limit 10
 *   npx tsx scripts/enrich-catalog-seu-quinto.ts --concurrency 6
 *   npx tsx scripts/enrich-catalog-seu-quinto.ts --force   # re-analisa tudo
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'
import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import 'dotenv/config'

const PROJECT_ID = 4
const PROJECT_NAME = 'Seu Quinto'
const IMAGES_FOLDER_ID = '1nfDJRMOQLjp7uqEyz4fOFBMcIjva_2Qs'

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
  usageHistory?: { date: string; theme: string }[]
  // campos específicos Seu Quinto
  zona?: string | null
  clienteIdentificavel?: boolean
  texturaRara?: string[]
  syncedFrom?: unknown
}

interface ImageCatalog {
  projectId: number
  projectName: string
  catalogFileId: string | null
  lastUpdated?: string
  images: CatalogImage[]
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

// ─── Clientes ────────────────────────────────────────────────────────
const prisma = new PrismaClient()
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

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
  return {
    buffer: buf,
    createdTime: meta.data.createdTime ?? undefined,
    folderId: meta.data.parents?.[0],
  }
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
 * Reconcilia o catálogo com o estado real do Drive:
 * - atualiza `folder` das imagens que o cliente moveu de pasta
 * - acrescenta como stub as imagens que ainda não estão no catálogo
 * - marca com `ausenteNoDrive` as entradas cujo arquivo sumiu (não apaga)
 */
async function sincronizarComDrive(catalog: ImageCatalog) {
  const pastas = await listarPastas(IMAGES_FOLDER_ID)
  pastas.push({ id: IMAGES_FOLDER_ID, name: '(raiz)' })

  const noDrive = new Map<string, { folder: string; folderId: string; name: string; createdTime: string }>()
  for (const p of pastas) {
    for (const img of await listarImagens(p.id)) {
      noDrive.set(img.id, { folder: p.name, folderId: p.id, name: img.name, createdTime: img.createdTime })
    }
  }

  let movidas = 0
  let renomeadas = 0
  let ausentes = 0
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

  let novas = 0
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

async function findCatalogFile(): Promise<string | null> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${IMAGES_FOLDER_ID}' in parents and name = '_image-catalog.json' and trashed = false`,
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
  const stream = new Readable()
  stream.push(JSON.stringify(catalog, null, 2))
  stream.push(null)
  await drive.files.update({
    fileId: catalog.catalogFileId!,
    media: { mimeType: 'application/json', body: stream },
  })
}

// ─── Cardápio (knowledge base) ───────────────────────────────────────
async function loadMenu(): Promise<string> {
  const entries = await prisma.$queryRawUnsafe<{ content: string }[]>(
    `SELECT content FROM knowledge_base_entries WHERE "projectId" = $1 AND (
      category = 'CARDAPIO'
      OR (category = 'ESTABELECIMENTO_INFO' AND (title ILIKE '%cardápio%' OR title ILIKE '%cardapio%'))
    ) ORDER BY CASE WHEN category = 'CARDAPIO' THEN 0 ELSE 1 END`,
    PROJECT_ID,
  )
  return entries.map((e) => e.content).join('\n\n')
}

// ─── Prompt específico do Seu Quinto (DNA §8 e §9) ───────────────────
const DNA_CONTEXT = `
O Seu Quinto Botequim é um boteco e chopperia na Praia do Canto, Vitória/ES.
Boteco raiz de verdade em bairro nobre: estufa quente e fria, tira-gosto,
cachaça e chopp gelado. NÃO é gastrobar, não é fine dining, não é bar
instagramável.

A CASA TEM TRÊS ZONAS VISUAIS DISTINTAS:

ZONA "fachada" (rua, luz de dia): casa térrea com telhado de telha colonial
cerâmica entre prédios altos. Volume lateral verde-oliva com o selo Q em
formato de tampinha de garrafa (disco verde, Q branco cursivo). Muro de pedra
bege com o letreiro "Seu Quinto Botequim" em lettering vermelho. Toldo bege,
arco de pedra na entrada, escada de concreto com corrimão de inox, guarda-sóis
pretos com logo AMSTEL.

ZONA "varanda" (área externa coberta / quintal): parede laranja-terracota
queimado e trecho de parede amarelo-ouro. Cordão de lâmpadas Edison âmbar
(string lights) cruzando o teto — assinatura noturna da casa. Climatizador
industrial cinza redondo. Vasos de barro com cordyline vermelho-vinho. Pergolado
metálico, telhado colonial, arco de pedra rústica.

ZONA "salao" (salão interno, luz âmbar quente 2400K) — marcadores obrigatórios:
- azulejo branco quadriculado 10x10 com REJUNTE VERMELHO/salmão (textura mais
  identificadora da casa; cobre o balcão frontal e a meia-parede)
- engradados de cerveja plásticos VERDES e VERMELHOS fixados na parede como
  luminária, RETROILUMINADOS por dentro, brilhando âmbar
- painel de backbar: azulejo branco iluminado por trás com o logo pintado
- parede de cartazes: colagem densa de pôsteres ilustrados retrô amarelos,
  vermelhos e azuis com frases populares brasileiras
- trilho de spot preto no teto, estrutura de metal expandido preto com plantas
- prateleiras de madeira com garrafas de cachaça
- estufa/vitrine de vidro no balcão com travessas Pyrex e bandejas de inox
- piso de cimento queimado, cadeiras plásticas pretas monobloco misturadas com
  cadeiras de madeira dobráveis
- geladeiras/expositores Amstel vermelhos

ZONA "calcada": mesas na calçada da Praia do Canto, guarda-sóis Amstel,
golden hour ou noite com flash direto.

ZONA "balcao": close no balcão de azulejo, chopeira, drinks sendo finalizados.

LOUÇA E SERVIÇO DA CASA: travessa oval de inox (a mais usada) · prato de
porcelana branca com faixa floral colorida · caneca de chopp de vidro CANELADA
COM ALÇA (o ícone) · copo americano · caneca de esmalte vermelha pequena para
molho · panelinha de pedra-sabão · balde verde Heineken · jogo americano de
papel com o logo. Porção sempre farta e transbordando, nunca empratamento
mínimo.

UNIFORME DA EQUIPE: camisa social manga curta vermelho-alaranjada com estampa
geométrica de losangos na barra, logo bordado no peito.
`

const TAG_VOCAB = `
VOCABULÁRIO CONTROLADO DE TAGS (use PREFERENCIALMENTE estas; pode acrescentar
outras específicas do que você vê, sempre em minúsculas e com hífen):

Zona/local: fachada · varanda · salao · balcao · calcada
Marcadores visuais: azulejo-rejunte-vermelho · engradado-retroiluminado ·
  parede-de-cartazes · string-lights · selo-Q · backbar · travessa-inox ·
  jogo-americano · geladeira-amstel · guarda-sol-amstel · telha-colonial
Conteúdo: chopp · caneca · caldereta · cachaca · cerveja · drink · petisco ·
  estufa · prato-dividir · mesa-cheia · brinde · turma · familia · crianca ·
  cachorro · musico · samba · equipe · uniforme · feijoada · galeto · ostra ·
  camarao · torresmo · rabada · lingua-de-boi · moela · carne-de-onca ·
  caldinho · sobremesa
Luz: golden-hour · flash-direto · luz-ambar-interna · sol-forte · noite
Uso: story-abertura · story-hh · story-conversao · prova-social · samba-sabado ·
  almoco-domingo · cardapio · evento-sazonal · musica-ao-vivo
`

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
  texturaRara: string[]
  observacao?: string
}

function buildPrompt(folderName: string, menu: string): string {
  return `Você é um curador visual do acervo fotográfico do Seu Quinto Botequim.
Analise esta foto do acervo. Ela está na pasta "${folderName}".

${DNA_CONTEXT}

CARDÁPIO OFICIAL (use EXATAMENTE estes nomes ao identificar um prato):
${menu}

${TAG_VOCAB}

Retorne APENAS um JSON, sem markdown:
{
  "zona": "fachada | varanda | salao | balcao | calcada | null (se for close de prato sem ambiente reconhecível)",
  "menuItem": "nome EXATO do item do cardápio acima, copiado letra por letra. null se não for comida/bebida ou se não der pra identificar com segurança",
  "menuCategory": "PETISCOS_ENTRADAS | PRATOS_PRINCIPAIS | SALADAS | SOBREMESAS | BEBIDAS | AMBIENTE | MUSICA | null",
  "description": "1-2 frases em português descrevendo concretamente o que aparece na foto. Cite os marcadores da casa que você reconhecer (azulejo de rejunte vermelho, engradado retroiluminado, parede de cartazes, string lights, travessa de inox, caneca canelada). Seja específico, não genérico.",
  "tags": ["6 a 12 tags do vocabulário acima, mais as específicas do que você vê"],
  "mood": "uma palavra: casual, animado, aconchegante, familiar, festivo, documental",
  "bestFor": ["temas de post ideais, do vocabulário de Uso acima"],
  "quality": "alta | media | baixa",
  "clienteIdentificavel": true se houver rosto de CLIENTE reconhecível em primeiro plano (não conta equipe uniformizada nem músico no palco), senão false,
  "texturaRara": ["marque APENAS se aparecer com destaque: 'chopeira-canecas' (torre de chopp/chopeira trabalhando com canecas alinhadas), 'estufa-rabada' (rabada em close), 'estufa-lingua' (língua de boi em close), 'estufa-moela' (moela em close), 'cachaca-princesa-isabel' (garrafa da cachaça Princesa Isabel em close legível). Array vazio se nenhuma."],
  "observacao": "opcional, só se a foto tiver algum problema relevante (desfocada, escura demais, print de tela, arte pronta em vez de foto, imagem gerada por IA)"
}

CRITÉRIOS DE QUALIDADE:
- "alta": nítida, bem iluminada, composição boa, luz quente coerente com a casa, serve pra virar arte.
- "media": utilizável mas com alguma limitação (enquadramento torto, luz mediana, fundo bagunçado).
- "baixa": desfocada, escura ou estourada demais, ruído alto, print de tela, foto duplicada de enquadramento ruim. Descarte provável.

REGRAS:
1. menuItem DEVE ser copiado exatamente do cardápio. Se não bater com nenhum item, use null. NUNCA invente prato.
2. Se for ambiente, decoração, fachada ou área externa sem comida em destaque: menuItem null, menuCategory "AMBIENTE".
3. Se for chopp, cerveja, cachaça ou drink: menuCategory "BEBIDAS".
4. Se for foto de músico/roda de samba tocando: menuCategory "MUSICA".
5. Escreva description e tags em português, minúsculas nas tags.
6. Seja honesto no quality — o objetivo é permitir descartar foto ruim.`
}

// ─── Análise com retry ───────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// gemini-2.0-flash foi aposentado (generateContent devolve 404 mesmo ainda
// aparecendo no ListModels). 2.5-flash é o substituto vigente.
const MODEL = process.env.SQ_GEMINI_MODEL ?? 'gemini-2.5-flash'
const model = genAI.getGenerativeModel({
  model: MODEL,
  generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
})

async function analyze(buffer: Buffer, folderName: string, menu: string): Promise<GeminiResult> {
  const prompt = buildPrompt(folderName, menu)
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
      // 429 / 503 → backoff exponencial; erro de parse → tenta de novo
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

  console.log('═══════════════════════════════════════════════════')
  console.log('  Seu Quinto — enriquecimento do catálogo de imagens')
  console.log('═══════════════════════════════════════════════════\n')

  console.log('1. Carregando cardápio da knowledge base...')
  const menu = await loadMenu()
  console.log(`   ✓ cardápio: ${menu.length} chars`)

  console.log('\n2. Lendo catálogo do Drive...')
  const catalogFileId = await findCatalogFile()
  if (!catalogFileId) throw new Error('_image-catalog.json não encontrado na pasta de imagens')
  const catalog = await readCatalog(catalogFileId)
  catalog.catalogFileId = catalogFileId
  console.log(`   ✓ ${catalog.images.length} imagens no catálogo (fileId ${catalogFileId})`)

  // Correção do cabeçalho: o arquivo estava carimbado com outro projeto
  if (catalog.projectId !== PROJECT_ID || catalog.projectName !== PROJECT_NAME) {
    console.log(
      `   ⚠ cabeçalho errado: projectId ${catalog.projectId} / "${catalog.projectName}" → corrigindo para ${PROJECT_ID} / "${PROJECT_NAME}"`,
    )
    catalog.projectId = PROJECT_ID
    catalog.projectName = PROJECT_NAME
  }

  // Reconcilia com o Drive antes de analisar: o cliente move e acrescenta
  // arquivo entre uma rodada e outra, então o `folder` do catálogo envelhece.
  console.log('\n3. Sincronizando com o Drive...')
  const sync = await sincronizarComDrive(catalog)
  console.log(`   ✓ ${sync.totalDrive} imagens no Drive em ${sync.pastas} pastas`)
  console.log(`   · caminho atualizado (movidas): ${sync.movidas}`)
  if (sync.renomeadas) console.log(`   · arquivos renomeados: ${sync.renomeadas}`)
  console.log(`   · novas acrescentadas ao catálogo: ${sync.novas}`)
  if (sync.ausentes) console.log(`   ⚠ sumiram do Drive (marcadas, não apagadas): ${sync.ausentes}`)
  if (!dryRun && (sync.movidas || sync.novas || sync.renomeadas || sync.ausentes)) {
    await saveCatalog(catalog)
    console.log('   ✓ sincronia salva')
  }

  const pending = catalog.images.filter(
    (i) => force || !i.tags || i.tags.length === 0 || !i.description,
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

  let done = 0
  let ok = 0
  let errors = 0
  const errorLog: { file: string; folder: string; error: string }[] = []
  let cursor = 0
  let sinceSave = 0

  async function worker(workerId: number) {
    while (true) {
      const idx = cursor++
      if (idx >= todo.length) return
      const img = todo[idx]
      try {
        const { buffer, createdTime, folderId } = await getFileMetaAndThumb(img.driveFileId)
        const r = await analyze(buffer, img.folder, menu)

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
        img.texturaRara = Array.isArray(r.texturaRara) ? r.texturaRara : []
        img.usageHistory = img.usageHistory ?? []

        // tags = tags do modelo + zona + texturas raras + flag de cliente,
        // para que a busca semântica por `theme` alcance todos esses eixos
        const tags = new Set<string>((Array.isArray(r.tags) ? r.tags : []).map((t) => String(t).toLowerCase().trim()).filter(Boolean))
        if (r.zona) tags.add(String(r.zona).toLowerCase())
        for (const t of img.texturaRara) tags.add(String(t).toLowerCase())
        if (img.clienteIdentificavel) tags.add('cliente-identificavel')
        if (img.quality === 'baixa') tags.add('descarte-sugerido')
        img.tags = [...tags]

        ok++
      } catch (e: any) {
        errors++
        errorLog.push({ file: img.fileName, folder: img.folder, error: String(e?.message ?? e).slice(0, 120) })
      }
      done++
      sinceSave++
      if (done % 25 === 0 || done === todo.length) {
        const pct = ((done / todo.length) * 100).toFixed(1)
        console.log(`   [${done}/${todo.length}] ${pct}% · ok ${ok} · erros ${errors}`)
      }
      // salvamento incremental: torna a corrida retomável
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

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)))

  if (!dryRun) {
    console.log('\n6. Salvando catálogo no Drive...')
    catalog.lastUpdated = new Date().toISOString()
    await saveCatalog(catalog)
    console.log('   ✓ salvo')
  }

  // Relatório local para inspeção
  const reportPath = (opts.report as string) ?? ''
  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify(catalog, null, 2))
    console.log(`   ✓ cópia local → ${reportPath}`)
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  ✓ analisadas: ${ok} · erros: ${errors}`)
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
