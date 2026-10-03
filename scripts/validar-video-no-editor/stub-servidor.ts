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

/** O que a fila gravou por último na Generation (o aviso de áudio mora aqui). */
export const registro: { fieldValues: unknown } = { fieldValues: null }

/**
 * O job com estado: a fila de vídeo reserva por compare-and-set
 * (`updateMany`), relê a linha, confere o arrendamento num `FOR UPDATE` e grava
 * a marca da cobrança no commit do débito. O dublê aplica cada escrita sobre a
 * linha (o `increment` inclusive) e devolve `count: 1`, como o banco faria com
 * uma execução só.
 */
const linha: Record<string, unknown> | null = job ? { status: 'PENDING', startedAt: null, attempts: 0, creditsDeducted: false, mp4ResultUrl: null, ...job } : null
function aplicar(data: Record<string, unknown> = {}) {
  if (!linha) return
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as object)) linha[k] = Number(linha[k] ?? 0) + Number((v as { increment: number }).increment)
    else linha[k] = v
  }
}

export const db: Record<string, unknown> = {
  page: { findUnique: async () => ({ audio }), update: async () => ({}) },
  generation: {
    create: async () => ({ id: 'prova' }),
    findUnique: async () => ({ id: 'prova', status: 'PROCESSING', resultUrl: null, fieldValues: registro.fieldValues ?? {} }),
    update: async (a: { data?: { fieldValues?: unknown } }) => {
      if (a?.data?.fieldValues) registro.fieldValues = a.data.fieldValues
      return { id: 'prova' }
    },
  },
  socialPost: { findFirst: async () => null },
  videoProcessingJob: {
    findFirst: async () => (linha && linha.status === 'PENDING' ? { id: linha.id } : null),
    findMany: async () => [],
    findUnique: async () => (linha ? { ...linha } : null),
    update: async (a: { data?: Record<string, unknown> }) => {
      aplicar(a?.data)
      return { ...linha }
    },
    updateMany: async (a: { data?: Record<string, unknown> }) => {
      aplicar(a?.data)
      return { count: linha ? 1 : 0 }
    },
  },
  project: { findUnique: async () => ({ googleDriveFolderId: null, googleDriveFolderName: null }) },
  musicLibrary: { findUnique: async () => JSON.parse(process.env.PROVA_MUSICA ?? 'null') },
  $executeRaw: async () => 1,
  // O `FOR UPDATE` do arrendamento lê o status e o início da linha.
  $queryRaw: async () => (linha ? [{ status: linha.status, startedAt: linha.startedAt }] : []),
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
/** O débito grava a marca da cobrança no mesmo commit (o gancho `noMesmoCommit`). */
export async function deductCreditsForFeature(a?: { noMesmoCommit?: (tx: unknown) => Promise<void> }) {
  await a?.noMesmoCommit?.(db)
}
export async function fetchBuffer(): Promise<Buffer> {
  throw new Error('sem rede na validação')
}
export const googleDriveService = { isEnabled: () => false }
