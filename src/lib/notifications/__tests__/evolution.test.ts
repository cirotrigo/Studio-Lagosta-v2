import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isEvolutionConfigured, sendWhatsAppMedia, sendWhatsAppText } from '../evolution'

const ENV = {
  WAHA_API_URL: 'https://waha.exemplo.com/',
  WAHA_API_KEY: 'chave-secreta',
  WAHA_SESSION: 'comercial',
  WAHA_NOTIFY_GROUP_ID: '120363000000000000@g.us',
}

describe('cliente de WhatsApp (WAHA)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    Object.assign(process.env, ENV)
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k]
    vi.unstubAllGlobals()
  })

  it('texto vai para /api/sendText com sessão, grupo e X-Api-Key', async () => {
    expect(await sendWhatsAppText('oi')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://waha.exemplo.com/api/sendText')
    expect(init.headers['X-Api-Key']).toBe('chave-secreta')
    expect(JSON.parse(init.body)).toEqual({
      session: 'comercial',
      chatId: '120363000000000000@g.us',
      text: 'oi',
    })
  })

  it('arte vai por sendImage, vídeo por sendVideo, com o arquivo pela URL', async () => {
    await sendWhatsAppMedia('https://blob/arte.png', { caption: 'legenda' })
    await sendWhatsAppMedia('https://blob/clip.mp4?x=1')
    const [img, vid] = fetchMock.mock.calls
    expect(img[0]).toBe('https://waha.exemplo.com/api/sendImage')
    expect(JSON.parse(img[1].body)).toMatchObject({
      session: 'comercial',
      caption: 'legenda',
      file: { url: 'https://blob/arte.png', mimetype: 'image/jpeg' },
    })
    expect(vid[0]).toBe('https://waha.exemplo.com/api/sendVideo')
  })

  it('recusa do WAHA vira false, sem lançar e sem vazar a chave', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response('chave-secreta inválida', { status: 401 }))
    expect(await sendWhatsAppText('oi')).toBe(false)
    expect(erro.mock.calls.flat().join(' ')).not.toContain('chave-secreta')
    erro.mockRestore()
  })

  it('sem as 4 variáveis não envia nada', async () => {
    delete process.env.WAHA_SESSION
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isEvolutionConfigured()).toBe(false)
    expect(await sendWhatsAppText('oi')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
