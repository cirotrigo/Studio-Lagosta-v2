import { NextResponse } from 'next/server'
import { validateUserAuthentication } from '@/lib/auth-utils'

export const runtime = 'nodejs'

type Provider = {
  key: string
  name: string
  hasApiKey: boolean
  models: { id: string; label: string }[]
}

// Available models for each provider (updated January 2025)
const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o (Flagship)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'o1', label: 'o1 (Reasoning)' },
    { id: 'o1-mini', label: 'o1-mini (Fast Reasoning)' },
    { id: 'o1-preview', label: 'o1-preview' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast)' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  ],
  google: [
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Latest)' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B (Fast)' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large (Latest)' },
    { id: 'mistral-small-latest', label: 'Mistral Small (Latest)' },
    { id: 'codestral-latest', label: 'Codestral (Code)' },
    { id: 'pixtral-large-latest', label: 'Pixtral Large (Vision)' },
  ],
  openrouter: [
    // OpenRouter models are fetched dynamically, these are fallbacks
    { id: 'openai/gpt-4o', label: 'OpenAI · GPT-4o' },
    { id: 'openai/gpt-4o-mini', label: 'OpenAI · GPT-4o Mini' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic · Claude 3.5 Sonnet' },
    { id: 'anthropic/claude-3.5-haiku', label: 'Anthropic · Claude 3.5 Haiku' },
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Google · Gemini 2.0 Flash (Free)' },
    { id: 'google/gemini-flash-1.5', label: 'Google · Gemini 1.5 Flash' },
    { id: 'mistralai/mistral-large', label: 'Mistral · Large' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta · Llama 3.3 70B' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek · Chat' },
    { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen · 2.5 72B' },
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
