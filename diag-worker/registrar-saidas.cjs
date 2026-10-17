/**
 * DIAGNÓSTICO (investigação da morte de workers, 17/10/2026) — carregado por NODE_OPTIONS=--require em TODO processo Node
 * (o Vitest e cada worker do pool herdam o env). Registra, em JSONL no arquivo DIAG_LOG:
 *  - `processo`: início de cada processo (pid, ppid, se é worker);
 *  - `spawn` / `exit`: cada filho criado e o evento exit(code, signal) DELE, visto pelo processo PAI — é o código/sinal do
 *    WORKER, não o `$?` do vitest;
 *  - `mem`: RSS/heap deste processo e memória livre do sistema a cada 2 s (melhor esforço).
 * Não toca teste, config oficial nem produção; não usa rede.
 */
const fs = require('node:fs')
const os = require('node:os')
const cp = require('node:child_process')
const LOG = process.env.DIAG_LOG
if (LOG) {
  const gravar = (o) => {
    try {
      fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), pid: process.pid, ...o }) + '\n')
    } catch {}
  }
  gravar({ ev: 'processo', ppid: process.ppid, worker: typeof process.send === 'function' })
  const original = cp.ChildProcess.prototype.spawn
  cp.ChildProcess.prototype.spawn = function (opcoes) {
    const r = original.apply(this, arguments)
    const inicio = Date.now()
    const filho = this.pid
    gravar({ ev: 'spawn', filho, arquivo: opcoes && opcoes.file, args: ((opcoes && opcoes.args) || []).slice(-2) })
    this.once('exit', (code, signal) => gravar({ ev: 'exit', filho, code, signal, vidaMs: Date.now() - inicio }))
    return r
  }
  const amostrar = () => {
    const m = process.memoryUsage()
    gravar({ ev: 'mem', rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576), livreSistemaMB: Math.round(os.freemem() / 1048576) })
  }
  setInterval(amostrar, 2000).unref()
}
