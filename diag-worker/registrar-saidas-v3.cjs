/**
 * DIAGNÓSTICO v3. Carregado por NODE_OPTIONS=--require em todo processo Node. COBERTURA DECLARADA: filhos criados de forma
 * ASSÍNCRONA por `ChildProcess.prototype.spawn` (spawn/fork/execFile assíncronos) — o caminho do pool `forks` do Vitest. NÃO
 * cobre `worker_threads` (pool `threads`) nem `spawnSync`/`execSync`; se o pai morrer, não há linha `exit` do filho (ausência
 * de `exit` = inconclusivo, nunca "saída normal"). Escrita só por `diario-seguro.cjs`; nada de args/env de filho.
 */
const os = require('node:os')
const path = require('node:path')
const cp = require('node:child_process')
const { gravar, texto } = require('./diario-seguro.cjs')
if (process.env.DIAG_LOG) {
  const papel = (arquivo, args) => {
    const nome = path.basename(String(arquivo || ''))
    if ((args || []).some((a) => /[\\/]vitest[\\/].*forks\.js$/.test(String(a)))) return 'worker-forks'
    if (nome === 'esbuild') return 'esbuild'
    if (nome === 'sh' || nome === 'bash' || nome === 'zsh') return 'shell'
    if (nome === 'node') return 'node'
    return 'outro'
  }
  gravar({ ev: 'processo', ppid: process.ppid, temIpc: typeof process.send === 'function' })
  const original = cp.ChildProcess.prototype.spawn
  cp.ChildProcess.prototype.spawn = function (opcoes) {
    const r = original.apply(this, arguments)
    const inicio = Date.now()
    const filho = this.pid
    const p = papel(opcoes && opcoes.file, opcoes && opcoes.args)
    gravar({ ev: 'spawn', filho, papel: p })
    this.once('exit', (code, signal) => gravar({ ev: 'exit', filho, papel: p, code, signal: signal ? texto(signal) : null, vidaMs: Date.now() - inicio }))
    return r
  }
  setInterval(() => {
    const m = process.memoryUsage()
    gravar({ ev: 'mem', rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576), livreSistemaMB: Math.round(os.freemem() / 1048576) })
  }, 2000).unref()
}
