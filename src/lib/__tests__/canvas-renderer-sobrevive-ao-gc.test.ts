/**
 * `canvas.encode()` do @napi-rs/canvas roda numa thread do pool do libuv com um ponteiro CRU para a superfície do
 * skia (até a 1.0.5). No padrão `await new CanvasRenderer(...).renderDesign(...)` o GC pode coletar o Canvas no meio
 * do PNG e o finalizador destruir a superfície debaixo do encoder → SIGSEGV. Este caminho REAL, com GC forçado, foi
 * reproduzido (3 de 3 na 0.1.84, macOS, 21/10/2026). É compatível com o "Worker exited unexpectedly" do fork do
 * gate.test.ts no meio do G21c (run 39630953265, 2 tentativas), mas daquele CI não há core nem sinal: a causa lá
 * não está provada. O renderer agora lê o canvas DEPOIS do encode, o que o mantém alcançável até o fim.
 *
 * A prova é em processo filho, para o crash não derrubar o worker do vitest: com o conserto termina com 0 e `ok`;
 * sem ele, SIGSEGV.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FILHO = join(__dirname, 'suporte', 'renderer-sobrevive-ao-gc.filho.ts')

describe('CanvasRenderer — o encode sobrevive ao GC do Canvas', () => {
  it('o processo filho termina com 0 (nunca SIGSEGV) com o renderer fora de escopo durante o encode', () => {
    const r = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', FILHO], { encoding: 'utf8', timeout: 90_000 })
    expect({ status: r.status, signal: r.signal, stderr: r.stderr.slice(0, 500) }).toEqual({ status: 0, signal: null, stderr: '' })
    expect(r.stdout.trim().split('\n').at(-1)).toBe('ok')
  }, 120_000)
})
