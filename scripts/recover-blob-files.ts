import { put } from '@vercel/blob'
import * as fs from 'fs'

const SCRATCH = '/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/e5585fc3-72d5-473a-acec-801d2cb45659/scratchpad'
const NEW_HOST = '2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const PROGRESS = `${SCRATCH}/copy-progress.jsonl`
const CONCURRENCY = 10

const { urls } = JSON.parse(fs.readFileSync(`${SCRATCH}/dead-urls.json`, 'utf8')) as { urls: string[] }

const done = new Set<string>()
if (fs.existsSync(PROGRESS)) {
  for (const line of fs.readFileSync(PROGRESS, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      if (r.status === 'ok' || r.status === 'gone') done.add(r.url)
    } catch {}
  }
}

const pending = urls.filter((u) => !done.has(u))
console.log(`total=${urls.length} done=${done.size} pending=${pending.length}`)

const log = fs.createWriteStream(PROGRESS, { flags: 'a' })
let ok = 0, gone = 0, fail = 0, mismatch = 0, idx = 0

async function copyOne(url: string): Promise<void> {
  const pathname = decodeURIComponent(new URL(url).pathname.slice(1))
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404 || res.status === 403) {
        gone++
        log.write(JSON.stringify({ url, status: 'gone', code: res.status }) + '\n')
        return
      }
      if (!res.ok || !res.body) throw new Error(`GET ${res.status}`)
      const len = Number(res.headers.get('content-length') || 0)
      const blob = await put(pathname, res.body as any, {
        access: 'public',
        addRandomSuffix: false,
        multipart: len === 0 || len > 40 * 1024 * 1024,
        contentType: res.headers.get('content-type') || undefined,
      })
      const gotPath = new URL(blob.url).pathname
      const expPath = new URL(url).pathname
      if (gotPath !== expPath) {
        mismatch++
        log.write(JSON.stringify({ url, status: 'ok', newUrl: blob.url, pathMismatch: true }) + '\n')
      } else {
        log.write(JSON.stringify({ url, status: 'ok' }) + '\n')
      }
      ok++
      return
    } catch (e: any) {
      if (attempt === 3) {
        fail++
        log.write(JSON.stringify({ url, status: 'fail', error: String(e?.message || e).slice(0, 200) }) + '\n')
        return
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

async function worker() {
  while (idx < pending.length) {
    const i = idx++
    await copyOne(pending[i])
    const n = ok + gone + fail
    if (n % 200 === 0) console.log(`progress: ${n}/${pending.length} ok=${ok} gone=${gone} fail=${fail} mismatch=${mismatch}`)
  }
}

async function main() {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`FIM: ok=${ok} gone=${gone} fail=${fail} mismatch=${mismatch} (pendentes eram ${pending.length})`)
  log.end()
}
main()
