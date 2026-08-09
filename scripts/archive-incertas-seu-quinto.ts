/**
 * archive-incertas-seu-quinto.ts
 *
 * Separa em `_ARQUIVO/` as fotos que NÃO batem 100% com o cardápio atual ou
 * sobre as quais a classificação automática não tem certeza, para triagem
 * manual. Não apaga nada — só move.
 *
 * Régua do que é "incerto":
 *   A. está em qualquer `_a-classificar`
 *   B. está na RAIZ de um grupo de prato (01–10) — não deu para dizer qual prato
 *   C. está numa subpasta de prato (01–10) mas o `menuItem` não bate exatamente
 *      com o prato daquela pasta
 *   D. é comida (menuCategory de prato) mas ficou em 12_ambiente ou 13_pessoas
 *
 * Grupos 11–17 (bebidas, ambiente, pessoas, programação, músicos, campanhas,
 * IA) não dependem do cardápio: só entram pela regra A ou D.
 *
 * Uso:
 *   npx tsx scripts/archive-incertas-seu-quinto.ts --dry-run
 *   npx tsx scripts/archive-incertas-seu-quinto.ts --rollback <path>
 */

import { google } from 'googleapis'
import * as fs from 'fs'
import 'dotenv/config'

const IMAGES_FOLDER_ID = '1nfDJRMOQLjp7uqEyz4fOFBMcIjva_2Qs'
const CATALOG_FILE_ID = '1p1toWBs2-eQTp_hDEo7Jx6ukbbw8SaFB'
const RAIZ_ARQUIVO = '_ARQUIVO'

function arg(name: string, dflt?: string) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : 'true'
}

function getDrive() {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  c.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const norm = (s: string) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

async function comRetry<T>(fn: () => Promise<T>, n = 4): Promise<T> {
  let last: any
  for (let i = 0; i < n; i++) {
    try { return await fn() } catch (e: any) {
      last = e
      const m = String(e?.message ?? e)
      if (/403|404|permission/i.test(m) && !/rate|quota|limit/i.test(m)) throw e
      await sleep(1500 * 2 ** i)
    }
  }
  throw last
}

const GRUPOS_DE_PRATO = ['01_', '02_', '03_', '04_', '05_', '06_', '07_', '08_', '09_', '10_']
const ehGrupoDePrato = (f: string) => GRUPOS_DE_PRATO.some((g) => f.startsWith(g))
const CAT_COMIDA = new Set(['PETISCOS_ENTRADAS', 'PRATOS_PRINCIPAIS', 'SOBREMESAS', 'SALADAS'])

function motivoDeArquivar(img: any): string | null {
  const f: string = img.folder ?? ''
  const partes = f.split('/')

  // A — indefinida por construção
  if (partes.some((p) => p.startsWith('_a-classificar'))) return 'A · sem subtipo definido'

  // D — comida parada em pasta que não é de comida
  if (f.startsWith('12_ambiente') || f.startsWith('13_pessoas')) {
    if (CAT_COMIDA.has(img.menuCategory) || img.menuItem) return 'D · comida em pasta de ambiente/pessoas'
    return null
  }

  if (!ehGrupoDePrato(f)) return null // 11_bebidas e 14–17 não dependem do cardápio

  // B — parou na raiz do grupo, sem prato
  if (partes.length === 1) return 'B · sem prato identificado'

  // C — está numa pasta de prato mas o metadado não confirma aquele prato
  const pratoDaPasta = norm(partes[1])
  if (!img.menuItem) return 'C · pasta de prato sem menuItem'
  if (norm(img.menuItem) !== pratoDaPasta) return `C · menuItem "${img.menuItem}" ≠ pasta`

  return null
}

class Pastas {
  private cache = new Map<string, string>()
  constructor(
    private drive: ReturnType<typeof getDrive>,
    private dryRun: boolean,
  ) {}
  async carregar(parentId = IMAGES_FOLDER_ID, depth = 4, prefix = '') {
    const res = await comRetry(() => this.drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)', pageSize: 200,
    }))
    for (const f of res.data.files ?? []) {
      const full = prefix ? `${prefix}/${f.name}` : f.name
      this.cache.set(full, f.id)
      if (depth > 1) await this.carregar(f.id, depth - 1, full)
    }
  }
  async idDe(caminho: string): Promise<string> {
    const hit = this.cache.get(caminho)
    if (hit) return hit
    let paiId = IMAGES_FOLDER_ID
    let acc = ''
    for (const parte of caminho.split('/')) {
      acc = acc ? `${acc}/${parte}` : parte
      const ex = this.cache.get(acc)
      if (ex) { paiId = ex; continue }
      if (this.dryRun) { this.cache.set(acc, `DRY:${acc}`); paiId = `DRY:${acc}`; continue }
      const criada = await comRetry(() => this.drive.files.create({
        requestBody: { name: parte, mimeType: 'application/vnd.google-apps.folder', parents: [paiId] },
        fields: 'id',
      }))
      this.cache.set(acc, criada.data.id)
      paiId = criada.data.id
      console.log(`   + ${acc}`)
    }
    return paiId
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const rollbackPath = arg('rollback')
  const concurrency = Number(arg('concurrency', '5'))
  const drive = getDrive()

  const cat: any = (await drive.files.get({ fileId: CATALOG_FILE_ID, alt: 'media' }, { responseType: 'json' })).data
  const ativos = cat.images.filter((i: any) => !i.ausenteNoDrive)

  const alvo: any[] = []
  for (const img of ativos) {
    const motivo = motivoDeArquivar(img)
    if (!motivo) continue
    // preserva a pasta de origem dentro do arquivo, pra triagem manual não virar sopa
    const destino = `${RAIZ_ARQUIVO}/${img.folder.split('/')[0]}`
    alvo.push({ ...img, motivo, destino })
  }

  console.log('═══════════════════════════════════════════════════')
  console.log('  Seu Quinto — separando incertas em _ARQUIVO')
  console.log('═══════════════════════════════════════════════════\n')
  console.log(`acervo ativo: ${ativos.length}`)
  console.log(`a arquivar  : ${alvo.length}`)
  console.log(`permanecem  : ${ativos.length - alvo.length}\n`)

  const porMotivo: any = {}
  for (const a of alvo) { const k = a.motivo.split(' · ')[0]; porMotivo[k] = (porMotivo[k] ?? 0) + 1 }
  console.log('por regra:', JSON.stringify(porMotivo))

  const porDestino = new Map<string, number>()
  for (const a of alvo) porDestino.set(a.destino, (porDestino.get(a.destino) ?? 0) + 1)
  console.log('\ndestino no arquivo:')
  for (const [k, v] of [...porDestino.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)

  const porOrigem = new Map<string, number>()
  for (const a of alvo) porOrigem.set(a.folder, (porOrigem.get(a.folder) ?? 0) + 1)
  console.log('\norigem (top 20):')
  for (const [k, v] of [...porOrigem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(4)}  ${k}`)

  if (dryRun) { console.log('\n(--dry-run: nada movido)'); return }

  console.log('\nCriando pastas de arquivo...')
  const pastas = new Pastas(drive, dryRun)
  await pastas.carregar()
  const destId = new Map<string, string>()
  for (const d of [...porDestino.keys()]) destId.set(d, await pastas.idDe(d))

  console.log('\nMovendo...\n')
  const rollback: any[] = []
  let ok = 0, erros = 0
  const errs: string[] = []
  let cursor = 0
  const gravar = () => rollbackPath && fs.writeFileSync(rollbackPath, JSON.stringify({ criadoEm: new Date().toISOString(), movimentos: rollback }, null, 2))

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= alvo.length) return
      const a = alvo[i]
      try {
        const meta = await comRetry(() => drive.files.get({ fileId: a.driveFileId, fields: 'parents' }))
        const paiAtual = (meta.data.parents ?? []).join(',')
        await comRetry(() => drive.files.update({
          fileId: a.driveFileId, addParents: destId.get(a.destino)!, removeParents: paiAtual, fields: 'id',
        }))
        rollback.push({ driveFileId: a.driveFileId, arquivo: a.fileName, de: a.folder, motivo: a.motivo, paiOriginalId: paiAtual })
        ok++
      } catch (e: any) { erros++; errs.push(`${a.folder}/${a.fileName}: ${String(e?.message).slice(0, 70)}`) }
      if ((ok + erros) % 25 === 0) { console.log(`   [${ok + erros}/${alvo.length}] ok ${ok} · erros ${erros}`); gravar() }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  gravar()

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  ✓ arquivados: ${ok} · erros: ${erros}`)
  if (rollbackPath) console.log(`  ✓ rollback → ${rollbackPath}`)
  for (const e of errs.slice(0, 10)) console.log(`    ${e}`)
  console.log('═══════════════════════════════════════════════════')
}

main().catch((e) => { console.error('\n✗ Fatal:', e?.message ?? e); process.exit(1) })
