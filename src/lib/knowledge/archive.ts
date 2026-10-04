import { createHash, randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { arquivarComArrendamento } from './arrendamento'
import { passoArrendado } from './indexer'
import { deleteVectorsByEntry } from './vector-client'
import { invalidateProjectCacheWithReceipt } from './cache'
import { LIMPEZA_ARQUIVAMENTO_PENDENTE, metadataComoObjeto } from './marca-de-indexado'

import { hashDoConteudo } from './entry-fingerprint'
export { hashDoConteudo } from './entry-fingerprint'

/** Leitura direcionada para retomar limpeza, inclusive após queda antes do recibo. */
export async function lerEntradaParaArquivamento(entryId: string, projectId: number) {
  const entry = await db.knowledgeBaseEntry.findFirst({ where: { id: entryId, projectId } })
  if (!entry) throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
  return { entradaId: entry.id, projectId: entry.projectId, title: entry.title, status: entry.status,
    updatedAt: entry.updatedAt, contentHash: hashDoConteudo(entry.content), content: entry.content }
}

/** DB, Vector e Redis não formam uma transação: o recibo registra cada efeito confirmado. */
export async function arquivarEntradaBase(args: {
  entryId: string; projectId: number; autor: string; updatedAt: Date; contentHash: string
}) {
  const snapshot = await db.knowledgeBaseEntry.findUnique({ where: { id: args.entryId }, include: { chunks: true } })
  if (!snapshot || snapshot.projectId !== args.projectId) throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
  if (snapshot.updatedAt.getTime() !== args.updatedAt.getTime() || hashDoConteudo(snapshot.content) !== args.contentHash) {
    throw new CreativeError('CONFLITO_ARQUIVAMENTO', 'A entrada mudou. Consulte e confirme novamente.', 409)
  }
  const lease = await arquivarComArrendamento(args.entryId, args.projectId, args.updatedAt, args.autor, randomUUID())
  const controle = { emVoo: false }
  let vectors: { status: 'confirmed' | 'pending'; deleted?: number; issue?: string } = { status: 'pending' }
  let leaseReleased = false
  let cache: Awaited<ReturnType<typeof invalidateProjectCacheWithReceipt>> = { projectId: args.projectId, status: 'failed', deletedCount: 0 }
  try {
    const deleted = await passoArrendado('limpar vetores arquivados', lease, undefined, controle, signal =>
      deleteVectorsByEntry(args.entryId, { projectId: args.projectId, userId: args.autor }, {
        signal, confirmarAusencia: true, antesDeApagar: () => lease.renovar('limpar vetores arquivados'),
      }))
    // Confirma a posse mesmo quando a consulta do Vector não encontrou nenhum id.
    await lease.renovar('confirmar limpeza')
    vectors = { status: 'confirmed', deleted }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'VECTOR_UNCONFIRMED'
    vectors = { status: 'pending', issue: code }
    // A entrada já foi arquivada; retry deve partir de nova leitura, nunca desfazer o status.
  }
  try {
    cache = await invalidateProjectCacheWithReceipt(args.projectId)
    if (vectors.status === 'confirmed' && cache.status === 'confirmed') await lease.concluirLimpezaArquivada()
  } catch {
    // DB/posse/Redis não confirmados: o marcador gravado ANTES da limpeza permanece para retomada.
  } finally {
    if (!controle.emVoo) leaseReleased = await lease.liberar().catch(() => false)
  }
  const atual = await db.knowledgeBaseEntry.findUnique({ where: { id: args.entryId }, select: { status: true, content: true, projectId: true, updatedAt: true, metadata: true } }).catch(() => null)
  const database = !atual ? 'unverified' : atual.status === 'ARCHIVED' && atual.projectId === args.projectId && hashDoConteudo(atual.content) === args.contentHash ? 'archived' : 'changed'
  const cleanupPending = !atual || metadataComoObjeto(atual.metadata)[LIMPEZA_ARQUIVAMENTO_PENDENTE] === true
  return {
    cleanupPending,
    entradaId: args.entryId, arquivada: database === 'archived', database,
    status: !cleanupPending && database === 'archived' && vectors.status === 'confirmed' && cache.status === 'confirmed' && leaseReleased ? 'complete' : 'partial',
    vectors, cache, leaseReleased, snapshot,
    estadoAtual: atual ? { status: atual.status, updatedAt: atual.updatedAt, contentHash: hashDoConteudo(atual.content) } : null,
    snapshotHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
  }
}
