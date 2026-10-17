/**
 * DIAGNÓSTICO v2 (revisão R1 do Codex). Carregado por NODE_OPTIONS=--require em todo processo Node. COBERTURA DECLARADA: filhos
 * criados de forma ASSÍNCRONA por `ChildProcess.prototype.spawn` (spawn/fork/execFile assíncronos) — é o caminho do pool `forks`
 * do Vitest. NÃO cobre `worker_threads` (pool `threads`) nem `spawnSync`/`execSync`; se o pai morrer, o `exit` do filho não é
 * registrado (a ausência de linha `exit` é dita na análise, nunca lida como "saída normal").
 *
 * Segurança: grava SÓ em `DIAG_LOG` que esteja DENTRO de DIAG_DIR (diretório de evidências declarado) e termine em `.jsonl`;
 * caminho fora → não grava nada. Não grava argumentos nem env de filho: só o NOME do executável (basename) e um papel
 * classificado (`worker-forks`, `esbuild`, `shell`, `outro`). Cada linha leva DIAG_EXEC (id da execução) para não confundir pid.
 * Falha de gravação incrementa um contador que vai na próxima linha (`falhasDeGravacao`).
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const cp = require('node:child_process')
const LOG = process.env.DIAG_LOG
const DIR = process.env.DIAG_DIR
const EXEC = process.env.DIAG_EXEC || 'sem-id'
const permitido =
  LOG && DIR && path.resolve(LOG).startsWith(path.resolve(DIR) + path.sep) && LOG.endsWith('.jsonl')
if (permitido) {
  let falhas = 0
  const gravar = (o) => {
    try {
      fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), exec: EXEC, pid: process.pid, ...o, ...(falhas ? { falhasDeGravacao: falhas } : {}) }) + '\n')
    } catch {
      falhas++
    }
  }
  const papel = (arquivo, args) => {
    const nome = path.basename(String(arquivo || ''))
    if ((args || []).some((a) => /[\\/]vitest[\\/].*forks\.js$/.test(String(a)))) return 'worker-forks'
    if (nome === 'esbuild') return 'esbuild'
    if (nome === 'sh' || nome === 'bash' || nome === 'zsh') return 'shell'
    return 'outro'
  }
  gravar({ ev: 'processo', ppid: process.ppid, temIpc: typeof process.send === 'function' })
  const original = cp.ChildProcess.prototype.spawn
  cp.ChildProcess.prototype.spawn = function (opcoes) {
    const r = original.apply(this, arguments)
    const inicio = Date.now()
    const filho = this.pid
    const p = papel(opcoes && opcoes.file, opcoes && opcoes.args)
    gravar({ ev: 'spawn', filho, papel: p, executavel: path.basename(String((opcoes && opcoes.file) || '')) })
    this.once('exit', (code, signal) => gravar({ ev: 'exit', filho, papel: p, code, signal, vidaMs: Date.now() - inicio }))
    return r
  }
  setInterval(() => {
    const m = process.memoryUsage()
    gravar({ ev: 'mem', rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576), livreSistemaMB: Math.round(os.freemem() / 1048576) })
  }, 2000).unref()
}
