// Substitui banco, Blob, fontes e Drive no bundle do RENDER DE SERVIDOR da
// validação (render-servidor.ts): o caminho é o real (persist →
// page-to-design-data → camadasNoInstante → CanvasRenderer), só as pontas de
// fora viram arquivo. O PNG que o put subiria vai para PROVA_SAIDA, e o áudio
// da página vem de PROVA_AUDIO — é a leitura que o persist faz do banco quando
// a página tem foto em movimento e quem chama não trouxe o áudio.
import fs from 'node:fs'

const audio = JSON.parse(process.env.PROVA_AUDIO ?? 'null')

export const db: Record<string, unknown> = {
  page: { findUnique: async () => ({ audio }), update: async () => ({}) },
  generation: { create: async () => ({ id: 'prova' }), update: async () => ({ id: 'prova' }) },
  $executeRaw: async () => 1,
  $queryRaw: async () => [],
  $transaction: async (f: unknown) => (typeof f === 'function' ? (f as (tx: unknown) => unknown)(db) : Promise.all(f as unknown[])),
}

export async function put(_caminho: string, buffer: Buffer) {
  fs.writeFileSync(process.env.PROVA_SAIDA as string, buffer)
  return { url: `file://${process.env.PROVA_SAIDA}` }
}
export async function del() {}
export async function registerProjectFonts() {}
export async function fetchBuffer(): Promise<Buffer> {
  throw new Error('sem rede na validação')
}
export const googleDriveService = { isEnabled: () => false }
