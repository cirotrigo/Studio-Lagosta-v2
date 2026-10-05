/**
 * Baixa uma imagem de uma URL que veio de FORA (o `download_url` que o ChatGPT
 * passa em `openai/fileParams`). É fronteira de confiança: o argumento de tool
 * é texto do modelo, então a URL pode apontar para qualquer lugar.
 *
 * Travas (SSRF): só https; host que resolve para endereço privado, loopback,
 * link-local ou metadado de nuvem é recusado — conferido em CADA salto de
 * redirect (no máximo 3); teto de tempo e de bytes lido em streaming, não só
 * pelo Content-Length, que pode mentir.
 *
 * ponytail: a checagem de DNS é feita antes do fetch, não no socket — um
 * rebinding entre a consulta e a conexão ainda passaria. Fechar isso exige um
 * agente HTTP com `lookup` próprio; aceito porque a URL chega de um cliente
 * autenticado do próprio Studio.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { CreativeError } from './errors'

// O mesmo teto de MAX_ARTE_BYTES (arte-enviada.ts), repetido aqui porque
// aquele módulo importa o Prisma e este precisa ser testável sem banco.
const MAX_ARTE_BYTES = 25 * 1024 * 1024
const MAX_REDIRECTS = 3
const TEMPO_MS = 20_000

/** Endereço que não pode ser alvo de download vindo de fora. */
export function enderecoInterno(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    if (x === '::' || x === '::1') return true
    const mapeado = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapeado) return enderecoInterno(mapeado[1])
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x)
  }
  return true
}

async function conferirHost(url: URL): Promise<void> {
  if (url.protocol !== 'https:') {
    throw new CreativeError('URL_RECUSADA', 'Só baixo imagem por https.', 400)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const enderecos = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((e) => e.address)
  if (enderecos.length === 0) {
    throw new CreativeError('URL_RECUSADA', `Não achei o endereço ${url.hostname}.`, 400)
  }
  if (enderecos.some(enderecoInterno)) {
    throw new CreativeError('URL_RECUSADA', `O endereço ${url.hostname} aponta para uma rede interna.`, 400)
  }
}

export async function baixarImagemExterna(
  urlInicial: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ bytes: Buffer; contentType: string | null }> {
  const f = deps.fetch ?? fetch
  let url: URL
  try {
    url = new URL(urlInicial)
  } catch {
    throw new CreativeError('URL_RECUSADA', 'O endereço da imagem é inválido.', 400)
  }

  for (let salto = 0; ; salto++) {
    await conferirHost(url)
    const resp = await f(url, { redirect: 'manual', signal: AbortSignal.timeout(TEMPO_MS) })

    if (resp.status >= 300 && resp.status < 400) {
      const destino = resp.headers.get('location')
      if (!destino || salto >= MAX_REDIRECTS) {
        throw new CreativeError('DOWNLOAD_FALHOU', 'O endereço da imagem redirecionou demais.', 502)
      }
      url = new URL(destino, url)
      continue
    }
    if (!resp.ok || !resp.body) {
      throw new CreativeError('DOWNLOAD_FALHOU', `Não consegui baixar a imagem (HTTP ${resp.status}).`, 502)
    }

    const declarado = Number(resp.headers.get('content-length') ?? 0)
    if (declarado > MAX_ARTE_BYTES) {
      throw new CreativeError('ARQUIVO_GRANDE', 'A imagem passa de 25MB.', 413)
    }
    const partes: Uint8Array[] = []
    let total = 0
    const leitor = resp.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_ARTE_BYTES) {
        await leitor.cancel()
        throw new CreativeError('ARQUIVO_GRANDE', 'A imagem passa de 25MB.', 413)
      }
      partes.push(value)
    }
    return { bytes: Buffer.concat(partes), contentType: resp.headers.get('content-type') }
  }
}
