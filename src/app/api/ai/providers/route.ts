import { NextResponse } from 'next/server'
import { validateUserAuthentication } from '@/lib/auth-utils'

export const runtime = 'nodejs'

type Provider = {
  key: string
  name: string
  hasApiKey: boolean
  models: { id: string; label: string }[]
}

// Available models for each provider (updated for 2025)
const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-5-2025-08-07', label: 'GPT-5 (Latest)' },
    { id: 'gpt-5-mini-2025-08-07', label: 'GPT-5 Mini' },
    { id: 'gpt-5-nano-2025-08-07', label: 'GPT-5 Nano' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large (Latest)' },
    { id: 'mistral-small-latest', label: 'Mistral Small (Latest)' },
    { id: 'mistral-medium-latest', label: 'Mistral Medium (Latest)' },
  ],
  openrouter: [
    // OpenRouter models are fetched dynamically
    { id: 'openai/gpt-4o-mini', label: 'OpenAI · GPT-4o Mini' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic · Claude 3.5 Sonnet' },
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Google · Gemini 2.0 Flash (Free)' },
    { id: 'mistralai/mistral-small', label: 'Mistral · Mistral Small' },
  ],
}

export async function GET() {
  try {
    // Require authentication
    try {
      await validateUserAuthentication()
    } catch (e) {
      if (e && typeof e === 'object' && 'message' in e && (e as { message?: string }).message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      throw e
    }

    // Check which providers have API keys configured
    const providers: Provider[] = [
      {
        key: 'openrouter',
        name: 'OpenRouter',
        hasApiKey: !!process.env.OPENROUTER_API_KEY,
        models: PROVIDER_MODELS.openrouter,
      },
      {
        key: 'openai',
        name: 'OpenAI',
        hasApiKey: !!process.env.OPENAI_API_KEY,
        models: PROVIDER_MODELS.openai,
      },
      {
        key: 'anthropic',
        name: 'Anthropic',
        hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        models: PROVIDER_MODELS.anthropic,
      },
      {
        key: 'google',
        name: 'Google',
        hasApiKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        models: PROVIDER_MODELS.google,
      },
      {
        key: 'mistral',
        name: 'Mistral',
        hasApiKey: !!process.env.MISTRAL_API_KEY,
        models: PROVIDER_MODELS.mistral,
      },
    ]

    // Filter to only return providers with API keys
    const availableProviders = providers.filter(p => p.hasApiKey)

    return NextResponse.json({ providers: availableProviders })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
