/**
 * apply-reorg-seu-quinto.ts
 *
 * Executa o manifesto gerado por plan-reorg-seu-quinto.ts: cria as pastas de
 * destino que faltarem e move os arquivos no Drive do Seu Quinto.
 *
 * Grava um log de rollback (pasta de origem de cada arquivo movido) para que a
 * operação possa ser desfeita — ver undo-reorg-seu-quinto.ts.
 *
 * Uso:
 *   npx tsx scripts/apply-reorg-seu-quinto.ts --manifest <path> --rollback <path> [--dry-run] [--limit N]
 */

import { google } from 'googleapis'
import * as fs from 'fs'
import 'dotenv/config'

const IMAGES_FOLDER_ID = '1nfDJRMOQLjp7uqEyz4fOFBMcIjva_2Qs'

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

async function comRetry<T>(fn: () => Promise<T>, tentativas = 4): Promise<T> {
  let last: any
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn()
    } catch (e: any) {
      last = e
      const msg = String(e?.message ?? e)
      // rede/quota → espera crescente; erro de permissão não adianta repetir
      if (/403|404|permission/i.test(msg) && !/rate|quota|limit/i.test(msg)) throw e
      await sleep(1500 * 2 ** i)
    }
  }
  throw last
}

/** Mapa caminho→id de todas as pastas existentes, criando as que faltarem. */
class Pastas {
  private cache = new Map<string, string>()
  constructor(
    private drive: ReturnType<typeof getDrive>,
    private dryRun: boolean,
  ) {}

  async carregar(parentId = IMAGES_FOLDER_ID, depth = 4, prefix = '') {
    const res = await comRetry(() =>
      this.drive.files.list({
        q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 200,
      }),
    )
    for (const f of res.data.files ?? []) {
      const full = prefix ? `${prefix}/${f.name}` : f.name
      this.cache.set(full, f.id)
      if (depth > 1) await this.carregar(f.id, depth - 1, full)
    }
  }

  /** Devolve o id do caminho, criando cada nível que faltar. */
  async idDe(caminho: string): Promise<string> {
    if (caminho === '(raiz)') return IMAGES_FOLDER_ID
    const hit = this.cache.get(caminho)
    if (hit) return hit

    const partes = caminho.split('/')
    let paiId = IMAGES_FOLDER_ID
    let acc = ''
    for (const parte of partes) {
      acc = acc ? `${acc}/${parte}` : parte
      const existente = this.cache.get(acc)
      if (existente) {
        paiId = existente
        continue
      }
      if (this.dryRun) {
        const fake = `DRYRUN:${acc}`
        this.cache.set(acc, fake)
        paiId = fake
        continue
      }
      const criada = await comRetry(() =>
        this.drive.files.create({
          requestBody: {
            name: parte,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [paiId],
          },
          fields: 'id',
        }),
      )
      this.cache.set(acc, criada.data.id)
      paiId = criada.data.id
      console.log(`   + pasta criada: ${acc}`)
    }
    return paiId
  }
}

async function main() {
  const manifestPath = arg('manifest')!
  const rollbackPath = arg('rollback')!
  const dryRun = arg('dryRun') === 'true' || process.argv.includes('--dry-run')
  const limit = Number(arg('limit', '0'))
  const concurrency = Number(arg('concurrency', '5'))

  if (!manifestPath || !rollbackPath) throw new Error('--manifest e --rollback são obrigatórios')

  const drive = getDrive()
  const manifesto: any[] = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  let mover = manifesto.filter((l) => l.move)
  if (limit) mover = mover.slice(0, limit)

  console.log('═══════════════════════════════════════════════════')
  console.log('  Seu Quinto — aplicando reorganização do Drive')
  console.log('═══════════════════════════════════════════════════\n')
  console.log(`arquivos a mover: ${mover.length}${dryRun ? '  (--dry-run: nada será alterado)' : ''}`)

  console.log('\n1. Mapeando pastas existentes...')
  const pastas = new Pastas(drive, dryRun)
  await pastas.carregar()
  console.log('   ✓ árvore carregada')

  console.log('\n2. Resolvendo destinos (criando o que faltar)...')
  const destinos = [...new Set(mover.map((l) => l.para))].sort()
  const destinoId = new Map<string, string>()
  for (const d of destinos) destinoId.set(d, await pastas.idDe(d))
  console.log(`   ✓ ${destinos.length} pastas de destino prontas`)

  console.log('\n3. Movendo arquivos...\n')
  const rollback: any[] = []
  let ok = 0
  let erros = 0
  const errList: string[] = []
  let cursor = 0

  const gravarRollback = () =>
    fs.writeFileSync(rollbackPath, JSON.stringify({ criadoEm: new Date().toISOString(), movimentos: rollback }, null, 2))

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= mover.length) return
      const l = mover[i]
      try {
        const novoPai = destinoId.get(l.para)!
        if (!dryRun) {
          const meta = await comRetry(() => drive.files.get({ fileId: l.driveFileId, fields: 'parents' }))
          const paiAtual = (meta.data.parents ?? []).join(',')
          await comRetry(() =>
            drive.files.update({
              fileId: l.driveFileId,
              addParents: novoPai,
              removeParents: paiAtual,
              fields: 'id, parents',
            }),
          )
          rollback.push({ driveFileId: l.driveFileId, arquivo: l.arquivo, de: l.de, paraId: novoPai, paiOriginalId: paiAtual })
        }
        ok++
      } catch (e: any) {
        erros++
        errList.push(`${l.de}/${l.arquivo} → ${l.para}: ${String(e?.message).slice(0, 80)}`)
      }
      if ((ok + erros) % 50 === 0) {
        console.log(`   [${ok + erros}/${mover.length}] ok ${ok} · erros ${erros}`)
        if (!dryRun) gravarRollback()
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  if (!dryRun) gravarRollback()

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  ✓ movidos: ${ok} · erros: ${erros}`)
  if (!dryRun) console.log(`  ✓ rollback → ${rollbackPath}`)
  if (errList.length) {
    console.log('\n  Erros (até 15):')
    for (const e of errList.slice(0, 15)) console.log(`    ${e}`)
  }
  console.log('═══════════════════════════════════════════════════')
}

main().catch((e) => {
  console.error('\n✗ Fatal:', e?.message ?? e)
  process.exit(1)
})
