/** DIAGNÓSTICO: registra o `it` INICIADO (não só o último que imprimiu), com o pid do worker. Só nas execuções de diagnóstico. */
import { appendFileSync } from 'node:fs'
import { beforeEach } from 'vitest'
const LOG = process.env.DIAG_LOG
beforeEach((ctx) => {
  if (!LOG) return
  try {
    appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), pid: process.pid, ev: 'it-inicio', arquivo: ctx.task.file?.name, nome: ctx.task.name }) + '\n')
  } catch {}
})
