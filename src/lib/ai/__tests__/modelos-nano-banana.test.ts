/**
 * Família Nano Banana: IDs do Google, classificação do erro e o pedido da
 * alternativa no Replicate (21/11/2026).
 *
 * Roda o SDK REAL (`@google/genai`) com `fetch` falso: o texto do erro sai do
 * próprio SDK (`ApiError`, `message` = JSON do corpo), que é exatamente o que
 * a classificação antiga lia errado. Nada vai para a rede.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_IMAGE_MODELS } from '@/lib/ai/image-models-config'
import {
  GeminiImageError,
  classificarErroGemini,
  deveTentarAlternativaGemini,
  generateImageWithGemini,
  isGeminiRetryableError,
  resolverIdDoModeloGemini,
} from '@/lib/ai/gemini-image-client'
import { montarPredicaoReplicate } from '@/lib/ai/replicate-nano-banana'

const fetchFalso = vi.fn()

function respostaDeErro(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function respostaComImagem() {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('png').toString('base64') } }] } },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** O 404 que o Google devolve para modelo inexistente ou desligado. */
const notFoundClassico = (modelo: string) => ({
  error: {
    code: 404,
    message: `models/${modelo} is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.`,
    status: 'NOT_FOUND',
  },
})

async function falhaDe(model: 'nano-banana-2' | 'nano-banana-pro'): Promise<GeminiImageError> {
  try {
    await generateImageWithGemini({ model, prompt: 'um prato', aspectRatio: '9:16' })
  } catch (error) {
    expect(error).toBeInstanceOf(GeminiImageError)
    return error as GeminiImageError
  }
  throw new Error('a geração deveria ter falhado')
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'chave-de-teste')
  vi.stubEnv('GEMINI_IMAGE_MODEL_NANO_BANANA_2', '')
  vi.stubEnv('GEMINI_IMAGE_MODEL_NANO_BANANA_PRO', '')
  vi.stubGlobal('fetch', fetchFalso)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  fetchFalso.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('IDs do Google', () => {
  it('nano-banana-2 roda o Nano Banana 2.1 e nano-banana-pro a versão estável', () => {
    expect(resolverIdDoModeloGemini('nano-banana-2', {})).toBe('gemini-nano-banana-2.1')
    expect(resolverIdDoModeloGemini('nano-banana-pro', {})).toBe('gemini-3-pro-image')
  })

  it('nenhum modelo aponta para preview (os previews foram desligados em 25/06/2026)', () => {
    for (const config of Object.values(AI_IMAGE_MODELS)) {
      expect(config.version).not.toMatch(/preview/)
    }
  })

  it('o env troca o ID sem mexer no código, e valor vazio é ignorado', () => {
    expect(
      resolverIdDoModeloGemini('nano-banana-2', { GEMINI_IMAGE_MODEL_NANO_BANANA_2: ' gemini-novo ' }),
    ).toBe('gemini-novo')
    expect(resolverIdDoModeloGemini('nano-banana-pro', { GEMINI_IMAGE_MODEL_NANO_BANANA_PRO: '  ' })).toBe(
      'gemini-3-pro-image',
    )
  })

  it('a chamada sai para o ID novo', async () => {
    fetchFalso.mockResolvedValueOnce(respostaComImagem())
    const r = await generateImageWithGemini({ model: 'nano-banana-2', prompt: 'um prato', aspectRatio: '9:16' })
    expect(r.imageBuffer.toString()).toBe('png')
    expect(String(fetchFalso.mock.calls[0][0])).toContain('/models/gemini-nano-banana-2.1:generateContent')
  })
})

describe('classificação do erro do Gemini', () => {
  it.each(['nano-banana-2', 'nano-banana-pro'] as const)(
    '404 clássico (%s) é modelo indisponível, não limite de uso — e aciona a alternativa',
    async (model) => {
      fetchFalso.mockResolvedValueOnce(respostaDeErro(404, notFoundClassico(resolverIdDoModeloGemini(model, {}))))
      const erro = await falhaDe(model)

      // "generateContent" contém "rate": era assim que o 404 virava "Limite de uso".
      expect(erro.kind).toBe('modelo-indisponivel')
      expect(erro.httpStatus).toBe(404)
      expect(erro.message).toMatch(/Modelo de IA não disponível/)
      expect(erro.message).not.toMatch(/Limite de uso/)
      expect(isGeminiRetryableError(erro)).toBe(false)
      expect(deveTentarAlternativaGemini(erro)).toBe(true)
    },
  )

  it('404 com texto de desligamento ("migrate" também contém "rate") é modelo indisponível', async () => {
    fetchFalso.mockResolvedValueOnce(
      respostaDeErro(404, {
        error: { code: 404, message: 'This model has been shut down. Please migrate to a newer model.', status: 'NOT_FOUND' },
      }),
    )
    const erro = await falhaDe('nano-banana-pro')
    expect(erro.kind).toBe('modelo-indisponivel')
    expect(deveTentarAlternativaGemini(erro)).toBe(true)
  })

  it('429 é limite de uso: passageiro, com alternativa', async () => {
    fetchFalso.mockResolvedValueOnce(
      respostaDeErro(429, {
        error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' },
      }),
    )
    const erro = await falhaDe('nano-banana-2')
    expect(erro.kind).toBe('limite-de-uso')
    expect(erro.message).toMatch(/Limite de uso/)
    expect(isGeminiRetryableError(erro)).toBe(true)
    expect(deveTentarAlternativaGemini(erro)).toBe(true)
  })

  it('503 é instabilidade: mantém o texto original e é passageiro', async () => {
    fetchFalso.mockResolvedValueOnce(
      respostaDeErro(503, { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } }),
    )
    const erro = await falhaDe('nano-banana-2')
    expect(erro.kind).toBe('instabilidade')
    expect(erro.message).toMatch(/overloaded/)
    expect(isGeminiRetryableError(erro)).toBe(true)
    expect(deveTentarAlternativaGemini(erro)).toBe(true)
  })

  it('408 é instabilidade: passageiro, com alternativa', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response('<html><body>Request Timeout</body></html>', { status: 408, headers: { 'content-type': 'text/html' } }),
    )
    const erro = await falhaDe('nano-banana-2')
    expect(erro.kind).toBe('instabilidade')
    expect(deveTentarAlternativaGemini(erro)).toBe(true)
  })

  it('400 de chave inválida é autenticação, sem alternativa', async () => {
    fetchFalso.mockResolvedValueOnce(
      respostaDeErro(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }),
    )
    const erro = await falhaDe('nano-banana-pro')
    expect(erro.kind).toBe('autenticacao')
    expect(deveTentarAlternativaGemini(erro)).toBe(false)
  })

  it('resposta em texto que fala em "generate" não vira limite de uso', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'I will generate the image in a moment.' }] } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const erro = await falhaDe('nano-banana-2')
    expect(erro.kind).toBe('desconhecido')
    expect(erro.message).toMatch(/retornou texto ao invés de imagem/)
    expect(isGeminiRetryableError(erro)).toBe(false)
  })

  it('sem status, o texto do 404 clássico ainda é lido como modelo indisponível', () => {
    const semStatus = new Error(JSON.stringify(notFoundClassico('gemini-x')))
    expect(classificarErroGemini(semStatus).kind).toBe('modelo-indisponivel')
  })

  it('quem ainda passa só a mensagem: o texto cru do 404 não é passageiro', () => {
    expect(isGeminiRetryableError(JSON.stringify(notFoundClassico('gemini-x')))).toBe(false)
    expect(isGeminiRetryableError('⚠️ Limite de uso da API atingido.')).toBe(true)
    expect(isGeminiRetryableError('❌ Modelo de IA não disponível.')).toBe(false)
  })
})

describe('alternativa no Replicate', () => {
  it('vai para o modelo oficial no endpoint de modelo, sem `version`', () => {
    const { url, body } = montarPredicaoReplicate({
      model: 'nano-banana-pro',
      prompt: 'um prato',
      aspectRatio: '9:16',
      resolution: '2K',
      referenceImages: Array.from({ length: 16 }, (_, i) => `https://ref/${i}.jpg`),
    })
    expect(url).toBe('https://api.replicate.com/v1/models/google/nano-banana-pro/predictions')
    expect(body).not.toHaveProperty('version')
    expect(body.input).toMatchObject({
      prompt: 'um prato',
      aspect_ratio: '9:16',
      output_format: 'png',
      resolution: '2K',
      safety_filter_level: 'block_only_high',
    })
    expect(body.input.image_input).toHaveLength(14)
  })

  it('na edição vai a imagem base e depois as referências, como no Gemini', () => {
    const { body } = montarPredicaoReplicate({
      model: 'nano-banana-pro',
      prompt: 'troque o fundo',
      aspectRatio: '1:1',
      mode: 'edit',
      baseImage: 'https://base.png',
      referenceImages: ['https://ref.jpg'],
    })
    expect(body.input.image_input).toEqual(['https://base.png', 'https://ref.jpg'])
  })

  it('inpaint é tratado como edição: a imagem base não se perde', () => {
    const { body } = montarPredicaoReplicate({
      model: 'nano-banana-pro',
      prompt: 'tire o copo',
      aspectRatio: '1:1',
      mode: 'inpaint',
      baseImage: 'https://base.png',
    })
    expect(body.input.image_input).toEqual(['https://base.png'])
  })

  it('nenhum modelo usa um ID do Google como modelo do Replicate', () => {
    for (const config of Object.values(AI_IMAGE_MODELS)) {
      if (config.replicateModel) expect(config.replicateModel).toMatch(/^[a-z0-9-]+\/[a-z0-9._-]+$/)
      expect(config.replicateModel ?? '').not.toMatch(/^gemini-/)
    }
  })

  it('modelo sem replicateModel falha com mensagem clara', () => {
    expect(() =>
      montarPredicaoReplicate({ model: 'nano-banana-2', prompt: 'x', aspectRatio: '1:1' }),
    ).toThrow(/Replicate API error/)
  })
})
