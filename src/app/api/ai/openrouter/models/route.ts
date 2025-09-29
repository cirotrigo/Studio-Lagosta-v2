import { NextResponse } from 'next/server'
import { validateUserAuthentication } from '@/lib/auth-utils'

type OpenRouterModel = {
  id?: string
  slug?: string
  name?: string
  tags?: unknown
  output_modalities?: unknown
  modalities?: unknown
  capabilities?: { output?: unknown; modalities?: unknown } | unknown
}

type OpenRouterResponse = { data?: OpenRouterModel[] } | null

type Primitive = string | number | boolean | null | undefined

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((x: Primitive) => String(x ?? ''))
}

function supportsImage(m: OpenRouterModel): boolean {
  try {
    const id = String(m?.id || m?.slug || '')
    const tags: string[] = Array.isArray(m?.tags) ? toStringArray(m.tags) : []
    const modalities: string[] = toStringArray(
      (m as { output_modalities?: unknown; modalities?: unknown; capabilities?: { output?: unknown; modalities?: unknown } }).output_modalities
      ?? (m as { modalities?: unknown }).modalities
      ?? (m as { capabilities?: { output?: unknown } }).capabilities?.output
      ?? (m as { capabilities?: { modalities?: unknown } }).capabilities?.modalities
      ?? []
    ).map((x) => x.toLowerCase())
    if (modalities.includes('image')) return true
    if (tags.some((t) => t.toLowerCase().includes('image'))) return true
    if (/gpt-image|stable-diffusion|sd3|sdxl|flux-1|ideogram|kandinsky|playground-v|sd-/.test(id)) return true
  } catch {}
  return false
}

export async function GET(req: Request) {
  try {
    try {
      await validateUserAuthentication()
    } catch (e) {
      if (e && typeof e === 'object' && 'message' in e && (e as { message?: string }).message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      throw e
    }
    const url = new URL(req.url)
    const capability = url.searchParams.get('capability')

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 400 })
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch models' }, { status: res.status })
    }

    const json = (await res.json().catch(() => null)) as OpenRouterResponse
    const data = Array.isArray(json?.data) ? json!.data! : []

    let items = data
    if (capability === 'image') {
      items = data.filter((m) => supportsImage(m))
    }

    const models = items
      .map((m) => {
        const id = (m?.id || m?.slug || m?.name) ?? ''
        const label = (m?.name || id) ?? ''
        return id ? { id: String(id), label: String(label) } : null
      })
      .filter(Boolean)

    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
