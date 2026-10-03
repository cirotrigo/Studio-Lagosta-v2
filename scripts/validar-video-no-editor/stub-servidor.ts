// Substitui banco, Blob, fontes, créditos e Drive nos bundles de SERVIDOR da
// validação — o render (render-servidor.ts: persist → page-to-design-data →
// camadasNoInstante → CanvasRenderer) e a fila de vídeo (processar-servidor.ts:
// processNextVideoJob → trilha → ffmpeg). O caminho é o real; só as pontas de
// fora viram arquivo. O que o put subiria (o PNG do render, o MP4 da fila) vai
// para PROVA_SAIDA; o áudio da página vem de PROVA_AUDIO (é a leitura que o
// persist faz do banco quando a página tem foto em movimento e quem chama não
// trouxe o áudio); o job e a música da fila, de PROVA_JOB e PROVA_MUSICA.
import fs from 'node:fs'

const audio = JSON.parse(process.env.PROVA_AUDIO ?? 'null')
const job = JSON.parse(process.env.PROVA_JOB ?? 'null')
let jobEntregue = false

/** O que a fila gravou por último na Generation (o aviso de áudio mora aqui). */
export const registro: { fieldValues: unknown } = { fieldValues: null }

export const db: Record<string, unknown> = {
  page: { findUnique: async () => ({ audio }), update: async () => ({}) },
  generation: {
    create: async () => ({ id: 'prova' }),
    update: async (a: { data?: { fieldValues?: unknown } }) => {
      if (a?.data?.fieldValues) registro.fieldValues = a.data.fieldValues
      return { id: 'prova' }
    },
  },
  videoProcessingJob: {
    findFirst: async () => {
      if (jobEntregue || !job) return null
      jobEntregue = true
      return job
    },
    update: async () => ({}),
  },
  project: { findUnique: async () => ({ googleDriveFolderId: null, googleDriveFolderName: null }) },
  musicLibrary: { findUnique: async () => JSON.parse(process.env.PROVA_MUSICA ?? 'null') },
  $executeRaw: async () => 1,
  $queryRaw: async () => [],
  $transaction: async (f: unknown) => (typeof f === 'function' ? (f as (tx: unknown) => unknown)(db) : Promise.all(f as unknown[])),
}

export async function put(_caminho: string, buffer: Buffer, opcoes?: { contentType?: string }) {
  // A miniatura do MP4 não é medida
  if (opcoes?.contentType === 'image/jpeg') return { url: 'file:///miniatura.jpg' }
  fs.writeFileSync(process.env.PROVA_SAIDA as string, buffer)
  return { url: `file://${process.env.PROVA_SAIDA}` }
}
export async function del() {}
export async function registerProjectFonts() {}
export async function deductCreditsForFeature() {}
export async function fetchBuffer(): Promise<Buffer> {
  throw new Error('sem rede na validação')
}
export const googleDriveService = { isEnabled: () => false }
