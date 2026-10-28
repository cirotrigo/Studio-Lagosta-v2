/**
 * Upload do computador com nome repetido (smoke de produção, 27/10/2026).
 *
 * O cliente sobe com `file.name` cru e o Blob v2 recusa um caminho que já existe quando o token não pede sufixo nem
 * sobrescrita. No lote da grade, `Story-4-7-quadrada-28.png` já estava no Blob (enviada antes como avulsa): o envio
 * dela falhou, a `Feed-…` (nome inédito) entrou, e a primeira célula ficou vazia. Aqui roda o `handleUpload` REAL com
 * um token de leitura e escrita falso; o que se confere é o token de cliente ASSINADO que o Blob recebe. Só o Clerk é
 * dublê.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_teste' }) }))

import { POST } from '../route'

const LOJA = 'lojateste'

/** O que o SDK assina dentro do token de cliente: `vercel_blob_client_<loja>_base64(<chave>.<base64(json)>)` */
function opcoesDoToken(clientToken: string) {
  const prefixo = `vercel_blob_client_${LOJA}_`
  expect(clientToken.startsWith(prefixo)).toBe(true)
  const [, carga] = Buffer.from(clientToken.slice(prefixo.length), 'base64').toString().split('.')
  return JSON.parse(Buffer.from(carga, 'base64').toString()) as Record<string, unknown>
}

const pedirToken = (pathname: string) =>
  POST(
    new Request('https://lagostacriativa.com.br/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload: '{}', multipart: false } }),
    }),
  )

beforeEach(() => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', `vercel_blob_rw_${LOJA}_segredo`)
  vi.stubEnv('VERCEL', '0')
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/upload/signed-url · mesmo nome duas vezes', () => {
  it('os dois tokens pedem sufixo único e nenhum permite sobrescrever: o segundo envio não é recusado nem troca o primeiro', async () => {
    const nome = 'Story-4-7-quadrada-28.png'
    const respostas = [await pedirToken(nome), await pedirToken(nome)]
    expect(respostas.map((r) => r.status)).toEqual([200, 200])

    for (const resposta of respostas) {
      const corpo = (await resposta.json()) as { type: string; clientToken: string }
      expect(corpo.type).toBe('blob.generate-client-token')
      const opcoes = opcoesDoToken(corpo.clientToken)
      expect(opcoes).toMatchObject({ pathname: nome, addRandomSuffix: true, maximumSizeInBytes: 100 * 1024 * 1024 })
      expect(opcoes.allowedContentTypes).toContain('image/png')
      expect(opcoes.allowOverwrite).not.toBe(true)
    }
  })
})
