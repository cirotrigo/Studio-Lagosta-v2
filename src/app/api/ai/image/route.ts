import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateUserAuthentication } from '@/lib/auth-utils'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { type FeatureKey } from '@/lib/credits/feature-config'

type ImageUrl = {
  type?: string
  image_url?: { url: string } | string
  url?: string
  b64_json?: string
  b64?: string
  image_base64?: string
}

type AssistantMessage = {
  role?: string
  content?: string
  images?: ImageUrl[]
}

type Choice = {
  message?: AssistantMessage
}

type ChatCompletionsResponse = {
  choices?: Choice[]
  error?: { message?: string } | string
}

const AttachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
})

const BodySchema = z
  .object({
    // For now we support only OpenRouter for images
    model: z
      .string()
      .min(3)
      // basic vendor/model pattern used by OpenRouter
      .regex(/^[a-z0-9-]+\/[a-z0-9_.:-]+$/i, 'Invalid OpenRouter model id')
      .max(100)
      .default('google/gemini-2.5-flash-image-preview'),
    prompt: z.string().min(1).max(2000),
    // Optional knobs kept for API stability, though not used by chat/completions
    size: z
      .enum(['256x256', '512x512', '1024x1024'])
      .optional()
      .default('1024x1024'),
    count: z.number().int().min(1).max(4).optional().default(1),
    attachments: z.array(AttachmentSchema).optional(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    let userId: string | null = null
    try {
      userId = await validateUserAuthentication()
    } catch (e: unknown) {
      if ((e as Error)?.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      throw e
    }

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.flatten() }, { status: 400 })
    }
    let { model } = parsed.data
    const { prompt, count, attachments } = parsed.data

    // Charge credits before calling provider
    const feature: FeatureKey = 'ai_image_generation'
    const quantity = typeof count === 'number' ? count : 1
    try {
      await validateCreditsForFeature(userId!, feature, quantity)
      await deductCreditsForFeature({ clerkUserId: userId!, feature, quantity, details: { model } })
    } catch (e: unknown) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json({ error: 'insufficient_credits', required: e.required, available: e.available }, { status: 402 })
      }
      throw e
    }

    // Map common vendorless ids when possible
    if (model === 'gpt-image-1') model = 'openai/gpt-image-1'

    // Build a reasonable Referer for OpenRouter attribution
    const originFromEnv = process.env.NEXT_PUBLIC_APP_URL
    const originFromReq = req.headers.get('origin') || req.headers.get('host')
    const referer =
      originFromEnv ||
      (originFromReq
        ? String(originFromReq).startsWith('http')
          ? originFromReq
          : `http://${originFromReq}`
        : 'http://localhost:3000')

    const DEBUG = process.env.IMAGE_DEBUG === '1' || process.env.NODE_ENV !== 'production'
    const startedAt = Date.now()
    if (DEBUG) {
      console.log('[img] request', {
        model,
        promptPreview: prompt.slice(0, 200),
        promptLength: prompt.length,
        referer,
      })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 400 })
    }

    // Simplified: use chat/completions with modalities ["image", "text"].
    // Reference: https://openrouter.ai/docs/features/multimodal/image-generation
    const hasImages = Array.isArray(attachments) && attachments.length > 0
    const vendor = typeof model === 'string' && model.includes('/') ? model.split('/')[0].toLowerCase() : ''
    // Use OpenAI-compatible parts for chat/completions: `text` and `image_url`
    const userMessage = hasImages
      ? {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...attachments.map(att => ({ type: 'image_url', image_url: { url: att.url } })),
          ],
        }
      : {
          role: 'user',
          // For text-only requests, content should be plain string per OpenAI compatibility
          content: prompt,
        }

    const payload: {
      model: string;
      messages: Array<{
        role: string;
        content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      }>;
    } = {
      model,
      messages: [userMessage],
    }
    // For chat/completions, modalities hint is optional; omit to keep maximum compatibility

    if (DEBUG) {
      try {
        const messageContent = userMessage.content;
        const sample = Array.isArray(messageContent)
          ? messageContent.map((c: unknown) => ({ type: (c as { type?: string })?.type, hasUrl: !!((c as { image_url?: { url?: string } })?.image_url?.url) })).slice(0, 5)
          : String(messageContent).slice(0, 120)
        const payloadPreview = { vendor, hasImages, model, attachmentsCount: (attachments || []).length, contentSample: sample }
        console.log('[img] payload preview', payloadPreview)
      } catch (e) {
        console.log('[img] preview error', String(e))
      }
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        Referer: referer,
        'X-Title': 'AI Chat Image Generation',
      },
      body: JSON.stringify(payload),
    })

    const ctype = res.headers.get('content-type') || ''
    if (!res.ok) {
      const providerBody = await res.text().catch(() => '')
      if (DEBUG) {
        console.error('[img] provider non-OK', {
          status: res.status,
          statusText: res.statusText,
          contentType: ctype,
          bodyPreview: providerBody?.slice(0, 2000),
          elapsedMs: Date.now() - startedAt,
        })
        try {
          console.error('[img] payload debug', JSON.stringify(payload).slice(0, 2000))
        } catch {}
        try {
          const first = (payload?.messages && payload.messages[0]) || null
          console.error('[img] first message debug', JSON.stringify(first).slice(0, 2000))
        } catch {}
      }
      const errorPayload: Record<string, unknown> = { error: 'Failed to generate image' }
      if (process.env.NODE_ENV !== 'production') {
        errorPayload.providerStatus = res.status
        errorPayload.providerBody = providerBody?.slice(0, 1200)
      }
      // Refund since provider request failed
      await refundCreditsForFeature({ clerkUserId: userId!, feature, quantity, reason: `http_${res.status}`, details: { model } })
      return NextResponse.json(errorPayload, { status: res.status })
    }

    if (!ctype.includes('application/json')) {
      const body = await res.text().catch(() => '')
      if (DEBUG) {
        console.error('[img] unexpected content-type from chat/completions', {
          contentType: ctype,
          bodyPreview: body?.slice(0, 2000),
        })
      }
      await refundCreditsForFeature({ clerkUserId: userId!, feature, quantity, reason: 'invalid_content_type', details: { model } })
      return NextResponse.json({ error: 'Invalid provider response' }, { status: 502 })
    }

    const json = (await res.json().catch((err: unknown) => {
      if (DEBUG) {
        console.error('[img] provider json parse error', { err: String(err) })
      }
      return null
    })) as ChatCompletionsResponse | null

    if (!json) {
      if (DEBUG) {
        console.error('[img] invalid provider response (no json)', { elapsedMs: Date.now() - startedAt })
      }
      await refundCreditsForFeature({ clerkUserId: userId!, feature, quantity, reason: 'json_parse_error', details: { model } })
      return NextResponse.json({ error: 'Invalid provider response' }, { status: 502 })
    }

    if (json.error) {
      const message = typeof json.error === 'string' ? json.error : json.error.message || 'Provider error'
      if (DEBUG) {
        console.error('[img] provider error', { message, json })
      }
      const payload: Record<string, unknown> = { error: message }
      if (process.env.NODE_ENV !== 'production') {
        payload.provider = json
      }
      await refundCreditsForFeature({ clerkUserId: userId!, feature, quantity, reason: 'provider_error', details: { model, message } })
      return NextResponse.json(payload, { status: 502 })
    }

    // Expected response (non-stream):
    // { choices: [ { message: { role: 'assistant', content: '...', images: [ { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } } ] } } ] }
    const choices = Array.isArray(json?.choices) ? (json?.choices as Choice[]) : []
    const images: string[] = []

    for (const choice of choices) {
      const msg = choice?.message || {}
      const imgArr = Array.isArray(msg?.images) ? (msg.images as ImageUrl[]) : []
      for (const image of imgArr) {
        // Try a few shapes seen in providers
        const url =
          (typeof image?.image_url === 'string' ? image.image_url : image?.image_url?.url) ||
          image?.url
        const b64 = image?.b64_json || image?.b64 || image?.image_base64
        if (typeof url === 'string' && url.length > 0) images.push(url)
        else if (typeof b64 === 'string' && b64.length > 0) images.push(`data:image/png;base64,${b64}`)
      }
    }

    if (images.length === 0) {
      if (DEBUG) {
        console.error('[img] empty images array (chat/completions)', { json })
      }
      await refundCreditsForFeature({ clerkUserId: userId!, feature, quantity, reason: 'no_images', details: { model } })
      return NextResponse.json({ error: 'No images returned' }, { status: 502 })
    }

    if (DEBUG) {
      console.log('[img] success', { count: images.length, elapsedMs: Date.now() - startedAt })
    }
    return NextResponse.json({ images })
  } catch (err: unknown) {
    const payload: Record<string, unknown> = { error: 'Internal server error' }
    if (process.env.NODE_ENV !== 'production') {
      payload.detail = (err as Error)?.message || String(err)
    }
    console.error('[img] unhandled error', { detail: (payload as { detail?: string }).detail })
    // Attempt refund on unexpected error path
    try {
      // best-effort: we don't have quantity here; default to 1
      await refundCreditsForFeature({ clerkUserId: (await validateUserAuthentication().catch(()=>null)) || '', feature: 'ai_image_generation', quantity: 1, reason: 'unhandled_error' })
    } catch {}
    return NextResponse.json(payload, { status: 500 })
  }
}
