/**
 * `canvas.encode('png')` do @napi-rs/canvas roda numa thread do pool do libuv. Até a 1.0.5 a tarefa guardava um
 * ponteiro CRU para a superfície do skia: se o Canvas saísse de escopo e o GC o coletasse antes do PNG terminar
 * (o padrão `await new CanvasRenderer(...).renderDesign(...)` dos testes e do compositor), o finalizador destruía a
 * superfície debaixo do encoder → SIGSEGV em `skia.darwin-arm64.node` / `node::ThreadPoolWork` e o fork do vitest
 * morria com "Worker exited unexpectedly" (~1 em cada 2–3 rodadas completas, 15/10/2026). A 1.0.6 conta referências
 * da superfície (Brooooooklyn/canvas#1312). Este teste é a prova em processo filho: na 0.1.84 ele morre com SIGSEGV
 * em 3 de 3 execuções; na 1.0.11 passa.
 *
 * `CANVAS_PACOTE=<caminho>` aponta para outra instalação do pacote, para medir uma versão sem trocar a do repositório.
 */
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const FILHO = `
const { createCanvas } = require(process.argv[1])
const { pbkdf2 } = require('node:crypto')
;(async () => {
  for (let rodada = 1; rodada <= 10; rodada++) {
    // ocupa o pool para a tarefa de encode ficar na fila enquanto o GC roda
    const ocupantes = Array.from({ length: 4 }, () => new Promise((res) => pbkdf2('a', 'b', 100_000, 32, 'sha512', res)))
    const pendentes = Array.from({ length: 8 }, () => {
      const c = createCanvas(1024, 1024)
      c.getContext('2d').fillRect(0, 0, 1024, 1024)
      return c.encode('png') // o Canvas sai de escopo aqui: só a Promise fica viva
    })
    global.gc()
    const lixo = []
    for (let i = 0; i < 100; i++) lixo.push(Buffer.alloc(1 << 20, i))
    global.gc()
    await Promise.all([...pendentes, ...ocupantes])
  }
  console.log('ok')
})().catch((e) => { console.error(e); process.exit(1) })
`

describe('@napi-rs/canvas — encode assíncrono sobrevive ao GC do Canvas', () => {
  it('o processo filho termina com 0 (nunca SIGSEGV) com o Canvas coletado durante o encode', () => {
    const pacote = process.env.CANVAS_PACOTE ?? require.resolve('@napi-rs/canvas')
    const r = spawnSync(process.execPath, ['--expose-gc', '-e', FILHO, pacote], { encoding: 'utf8', timeout: 90_000 })
    expect({ status: r.status, signal: r.signal, stderr: r.stderr.slice(0, 500) }).toEqual({ status: 0, signal: null, stderr: '' })
    expect(r.stdout.trim()).toBe('ok')
  }, 120_000)
})
