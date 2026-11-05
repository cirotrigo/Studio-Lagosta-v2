/**
 * Processo FILHO do teste canvas-renderer-sobrevive-ao-gc: o padrão `new CanvasRenderer(...).renderDesign(...)`
 * (o do G21c do gate.test.ts e do compositor) com o pool do libuv ocupado e GC forçado a cada tick enquanto há
 * renders pendentes — o renderDesign tem awaits antes do encode, então um gc() só no começo não pega a janela.
 * Sem o Canvas mantido vivo até o fim do encode, morre com SIGSEGV no skia (0.1.84: 3 de 3, 21/10/2026).
 * Uso: node --expose-gc --import tsx <este arquivo>
 */
import { pbkdf2 } from 'node:crypto'
import { CanvasRenderer } from '@/lib/canvas-renderer'

const gc = (globalThis as unknown as { gc: () => void }).gc
const design = { canvas: { width: 1024, height: 1024, backgroundColor: '#000000' }, layers: [] } as never

;(async () => {
  for (let rodada = 1; rodada <= 10; rodada++) {
    const ocupantes = Array.from({ length: 4 }, () => new Promise((res) => pbkdf2('a', 'b', 100_000, 32, 'sha512', res)))
    const pendentes = Array.from({ length: 8 }, () => new CanvasRenderer(1024, 1024).renderDesign(design, {}))
    let pronto = false
    const tudo = Promise.all([...pendentes, ...ocupantes]).finally(() => {
      pronto = true
    })
    while (!pronto) {
      gc()
      const lixo: Buffer[] = []
      for (let i = 0; i < 20; i++) lixo.push(Buffer.alloc(1 << 20, i))
      await new Promise((res) => setImmediate(res))
    }
    await tudo
  }
  process.stdout.write('ok\n')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
