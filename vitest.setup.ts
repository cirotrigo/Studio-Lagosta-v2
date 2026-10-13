/**
 * Testes unitários são HERMÉTICOS (H5 do Dot, 13/10/2026): nenhum banco, nenhuma rede.
 *
 * - Sem DATABASE_URL/DIRECT_URL: o `src/lib/db.ts` real lança no import, então um teste que alcance o banco de
 *   verdade (mock que vazou, import fora de ordem) quebra alto em vez de abrir conexão — o caso dos testes
 *   `ver-agenda-*`, que passavam ou falhavam conforme a env do shell.
 * - `fetch` e sockets TCP bloqueados: Zernio, Meta, Google Drive, IA, Vercel Blob e Postgres falam por aí. O
 *   teste que precisa de rede simula o cliente (vi.mock / vi.stubGlobal('fetch', …)); a chamada real falha com
 *   a origem no erro.
 *
 * O alcance, dito com precisão (revisão do Codex, H5): bloqueia toda REDE que sai do processo Node — `fetch`,
 * `http`/`https`, `tls` e `undici` passam por `net.Socket.connect` — e o Prisma não sobe sem DATABASE_URL.
 * Subprocesso local NÃO é interceptado: os testes de vídeo rodam o `ffmpeg` sobre arquivos locais, e é só isso
 * que eles fazem. Teste novo que suba processo com acesso à rede fica fora da suíte unitária.
 *
 * Teste de integração de verdade (banco, rede) não mora na suíte unitária: é script em `scripts/validar-*`.
 */
import net from 'node:net'
import { beforeEach } from 'vitest'

for (const chave of ['DATABASE_URL', 'DIRECT_URL', 'BLOB_READ_WRITE_TOKEN', 'OPENAI_API_KEY', 'LATE_API_KEY', 'ZERNIO_API_KEY']) {
  delete process.env[chave]
}

function acessoExterno(alvo: string): never {
  throw new Error(`Teste unitário tentou acesso externo (${alvo}). Simule o cliente com vi.mock ou vi.stubGlobal.`)
}

const fetchBloqueado = (async (entrada: unknown) =>
  acessoExterno(`fetch ${typeof entrada === 'string' ? entrada : (entrada as { url?: string })?.url ?? String(entrada)}`)) as typeof fetch

// Cada teste começa com o fetch bloqueado (um vi.stubGlobal de outro teste não vaza para este).
beforeEach(() => {
  globalThis.fetch = fetchBloqueado
})
globalThis.fetch = fetchBloqueado

const conectar = net.Socket.prototype.connect
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const opcoes = args[0] as { host?: string; port?: number; path?: string } | number | string
  const alvo = typeof opcoes === 'object' && opcoes ? `${opcoes.host ?? opcoes.path ?? '?'}:${opcoes.port ?? ''}` : String(opcoes)
  return acessoExterno(`socket ${alvo}`)
} as typeof conectar
