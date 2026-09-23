import { describe, expect, it, vi } from 'vitest'

const dns: Record<string, string[]> = {
  'files.oaiusercontent.com': ['20.60.1.2'],
  'cdn.exemplo.com': ['151.101.1.1'],
  'interno.exemplo.com': ['10.0.0.5'],
}
vi.mock('node:dns/promises', () => ({
  lookup: async (host: string) => (dns[host] ?? []).map((address) => ({ address, family: 4 })),
}))

const { baixarImagemExterna, enderecoInterno } = await import('../baixar-imagem-externa')

function resposta(status: number, corpo = '', headers: Record<string, string> = {}) {
  return new Response(status >= 300 && status < 400 ? null : corpo, { status, headers })
}

describe('enderecoInterno', () => {
  it('recusa privados, loopback, link-local (metadado de nuvem) e IPv6 internos', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.0.9', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(enderecoInterno(ip), ip).toBe(true)
    }
  })
  it('aceita endereço público', () => {
    expect(enderecoInterno('20.60.1.2')).toBe(false)
    expect(enderecoInterno('2606:4700::1111')).toBe(false)
  })
})

describe('baixarImagemExterna', () => {
  it('baixa por https de host público', async () => {
    const f = vi.fn(async () => resposta(200, 'PNGDATA', { 'content-type': 'image/png' }))
    const r = await baixarImagemExterna('https://files.oaiusercontent.com/x', { fetch: f as unknown as typeof fetch })
    expect(r.bytes.toString()).toBe('PNGDATA')
  })
  it('recusa http, host interno e IP literal interno sem chamar fetch', async () => {
    const f = vi.fn()
    for (const url of ['http://files.oaiusercontent.com/x', 'https://interno.exemplo.com/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://sumiu.exemplo.com/x']) {
      await expect(baixarImagemExterna(url, { fetch: f as unknown as typeof fetch }), url).rejects.toMatchObject({ code: 'URL_RECUSADA' })
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('confere o host de cada redirect', async () => {
    const f = vi.fn(async () => resposta(302, '', { location: 'https://interno.exemplo.com/segredo' }))
    await expect(baixarImagemExterna('https://files.oaiusercontent.com/x', { fetch: f as unknown as typeof fetch })).rejects.toMatchObject({ code: 'URL_RECUSADA' })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('segue redirect para host público e para depois de 3 saltos', async () => {
    const ok = vi.fn()
      .mockResolvedValueOnce(resposta(302, '', { location: 'https://cdn.exemplo.com/a' }))
      .mockResolvedValueOnce(resposta(200, 'OK'))
    expect((await baixarImagemExterna('https://files.oaiusercontent.com/x', { fetch: ok as unknown as typeof fetch })).bytes.toString()).toBe('OK')
    const loop = vi.fn(async () => resposta(302, '', { location: 'https://cdn.exemplo.com/a' }))
    await expect(baixarImagemExterna('https://files.oaiusercontent.com/x', { fetch: loop as unknown as typeof fetch })).rejects.toMatchObject({ code: 'DOWNLOAD_FALHOU' })
    expect(loop).toHaveBeenCalledTimes(4)
  })
  it('corta acima de 25MB mesmo sem Content-Length', async () => {
    const grande = new Uint8Array(25 * 1024 * 1024 + 1)
    const f = vi.fn(async () => new Response(grande, { status: 200 }))
    await expect(baixarImagemExterna('https://files.oaiusercontent.com/x', { fetch: f as unknown as typeof fetch })).rejects.toMatchObject({ code: 'ARQUIVO_GRANDE' })
  })
})
