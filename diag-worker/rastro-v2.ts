/** DIAGNÓSTICO v2: registra INÍCIO e FIM de cada `it` (com pid e DIAG_EXEC); grava só sob DIAG_DIR, como o registrador. */
import { appendFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { afterEach, beforeEach } from 'vitest'
const LOG = process.env.DIAG_LOG
const DIR = process.env.DIAG_DIR
const ok = Boolean(LOG && DIR && resolve(LOG).startsWith(resolve(DIR) + sep) && LOG.endsWith('.jsonl'))
const gravar = (ev: string, ctx: { task: { name: string; file?: { name: string }; result?: { state?: string } } }) => {
  if (!ok) return
  try {
    appendFileSync(LOG!, JSON.stringify({ t: new Date().toISOString(), exec: process.env.DIAG_EXEC ?? 'sem-id', pid: process.pid, ev, arquivo: ctx.task.file?.name, nome: ctx.task.name, ...(ev === 'it-fim' ? { estado: ctx.task.result?.state } : {}) }) + '\n')
  } catch {}
}
beforeEach((ctx) => gravar('it-inicio', ctx))
afterEach((ctx) => gravar('it-fim', ctx))
