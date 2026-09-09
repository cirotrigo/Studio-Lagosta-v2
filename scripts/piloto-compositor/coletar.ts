/** Captura restrita, somente leitura. Segredos ficam apenas em memória. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { parse } from 'dotenv'
import { google } from 'googleapis'
import { PrismaClient } from '../../prisma/generated/client'

async function main() {
  const source = process.argv[2]
  if (!source) throw new Error('Informe o checkout fonte autorizado')
  const out = resolve('.tmp-medicao-compositor')
  mkdirSync(out, { recursive: true })
  const env = { ...parse(readFileSync(resolve(source, '.env'))), ...parse(readFileSync(resolve(source, '.env.local'))) }
  if (!env.DATABASE_URL) throw new Error('Credencial de leitura não disponível')
  const evidencias = JSON.parse(readFileSync(resolve(source, 'docs/investigacao-mcp-editor-2026-09-09/evidencias.json'), 'utf8'))
    .filter((e: { name: string }) => ['TERO', 'O Quintal Parrilla', 'Real Gelateria'].includes(e.name))
  const inicio = performance.now()
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] })
  let snapshot
  try {
    snapshot = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      const casos = []
      for (const e of evidencias) {
        const projeto = await tx.project.findUniqueOrThrow({ where: { id: e.id }, select: {
          id: true, name: true, assinatura: true, googleDriveImagesFolderId: true,
          Logo: { where: { isProjectLogo: true }, select: { fileUrl: true } },
        } })
        const template = await tx.template.findFirstOrThrow({ where: { projectId: e.id, name: 'Assinatura' }, select: { id: true } })
        const paginas = await tx.page.findMany({ where: { templateId: template.id }, orderBy: { order: 'asc' }, select: { id: true, name: true, width: true, height: true, layers: true, background: true, tags: true, updatedAt: true } })
        const fontes = await tx.customFont.findMany({ where: { projectId: e.id }, select: { fontFamily: true, fileUrl: true } })
        const historica = await tx.generation.findUnique({ where: { id: e.art.generationId }, select: { fieldValues: true, createdAt: true } })
        casos.push({ evidencia: e, projeto, template, paginas, fontes, historica })
      }
      return casos
    }, { timeout: 60_000 })
  } finally { await db.$disconnect() }
  const bancoMs = performance.now() - inicio
  const oauth = new google.auth.OAuth2(env.GOOGLE_DRIVE_CLIENT_ID, env.GOOGLE_DRIVE_CLIENT_SECRET)
  oauth.setCredentials({ refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth: oauth })
  const assets: Record<string, string> = {}
  const hashes: Record<string, string> = {}
  const guardar = (key: string, bytes: Buffer) => {
    const sha = createHash('sha256').update(bytes).digest('hex')
    const path = resolve(out, sha + '.asset')
    writeFileSync(path, bytes); assets[key] = path; hashes[key] = sha
  }
  for (const c of snapshot) {
    const t = performance.now()
    const id = c.evidencia.spec.fotoDriveId
    const foto = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer', timeout: 30_000 })
    guardar(id, Buffer.from(foto.data as ArrayBuffer))
    const fotoOriginalPath = assets[id]
    const fv = c.historica?.fieldValues as { imageUrl?: string } | null
    if (fv?.imageUrl) {
      const r = await fetch(fv.imageUrl, { signal: AbortSignal.timeout(30_000) })
      if (!r.ok) throw new Error('Foto histórica de render indisponível')
      guardar(id, Buffer.from(await r.arrayBuffer()))
    }
    Object.assign(c, { fotoOriginalPath, fotoDeRenderOrigem: fv?.imageUrl ? 'imageUrl registrada na Generation histórica' : 'original do Drive; reprodução histórica parcial' })
    const urls = new Set<string>([...c.fontes.map((f) => f.fileUrl), ...c.projeto.Logo.map((l) => l.fileUrl)])
    for (const pagina of c.paginas) {
      let layers = pagina.layers
      while (typeof layers === 'string') layers = JSON.parse(layers)
      for (const layer of layers as Array<{ fileUrl?: string }>) if (layer.fileUrl?.startsWith('https://')) urls.add(layer.fileUrl)
    }
    for (const url of urls) {
      if (assets[url]) continue
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!r.ok) throw new Error('Ativo de marca indisponível')
      guardar(url, Buffer.from(await r.arrayBuffer()))
    }
    let catalogo = null
    if (c.projeto.googleDriveImagesFolderId) {
      const lista = await drive.files.list({ q: `'${c.projeto.googleDriveImagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`, fields: 'files(id)', pageSize: 10 }, { timeout: 30_000 })
      if (lista.data.files?.[0]?.id) {
        const r = await drive.files.get({ fileId: lista.data.files[0].id, alt: 'media' }, { responseType: 'json', timeout: 30_000 })
        catalogo = (r.data as unknown as { images?: Array<{ driveFileId: string }> }).images?.filter((i) => i.driveFileId === id) ?? []
      }
    }
    Object.assign(c, { catalogo, preparacaoMs: performance.now() - t })
    console.log(`${c.projeto.name}: ${c.paginas.length} páginas, ${c.fontes.length} fontes; insumos capturados`)
  }
  writeFileSync(resolve(out, 'snapshot.json'), JSON.stringify({ capturadoEm: new Date().toISOString(), bancoMs, preparacaoTotalMs: performance.now() - inicio, casos: snapshot, assets, hashes }, null, 2))
}
main().catch((e) => { console.error('Falha na captura; código:', e.code ?? e.name, '(detalhes sensíveis omitidos)'); process.exitCode = 1 })
