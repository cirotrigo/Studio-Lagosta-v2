import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { mistral } from '@ai-sdk/mistral'
import { z } from 'zod'
import { validateUserAuthentication, getUserFromClerkId } from '@/lib/auth-utils'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { type FeatureKey } from '@/lib/credits/feature-config'
import { getRAGContextWithResults } from '@/lib/knowledge/search'
import { getMaxOutputTokens, type AIProvider } from '@/lib/ai/token-limits'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for AI streaming responses + RAG context retrieval

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost:3000',
    'X-Title': 'Studio Lagosta AI Chat',
  },
})

function getModel(provider: string, model: string) {
  switch (provider) {
    case 'openai':
      return openai(model)
    case 'anthropic':
      return anthropic(model)
    case 'google':
      return google(model)
    case 'mistral':
      return mistral(model)
    case 'openrouter':
      return openrouter(model)
    default:
      throw new Error('Unsupported provider')
  }
}

const ProviderSchema = z.enum(['openai', 'anthropic', 'google', 'mistral', 'openrouter'])

// Known-safe models for direct providers. OpenRouter models are dynamic; validate format below.
const ALLOWED_MODELS: Record<z.infer<typeof ProviderSchema>, string[]> = {
  openai: [
    'gpt-5.1',
    'gpt-5-mini',
    'gpt-5-nano',
    'o4-mini',
    'o3-mini',
    'gpt-4o',
    'gpt-4o-mini',
  ],
  anthropic: [
    'claude-sonnet-4-5',
    'claude-sonnet-4',
    'claude-3-5-sonnet-20241022',
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash-exp',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-small-latest',
    'mistral-medium-latest',
  ],
  openrouter: [
    // Representative defaults; OpenRouter validated by pattern
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    'google/gemini-2.0-flash-001',
    'google/gemini-2.0-flash-exp:free',
    'mistralai/mistral-small',
  ],
}

const AttachmentSchema = z.object({ name: z.string().min(1).max(500), url: z.string().url() })

const BodySchema = z.object({
  provider: ProviderSchema,
  model: z.string().min(1),
  messages: z.array(z.any()).min(1), // UIMessage[] format from v5
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(100).max(32000).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  conversationId: z.string().nullable().optional(), // Optional conversation ID for history
  projectId: z.number().int(),
})

function isAllowedModel(provider: z.infer<typeof ProviderSchema>, model: string) {
  if (provider === 'openrouter') {
    // Basic sanity for OpenRouter model IDs: vendor/model and restricted charset
    return /^[a-z0-9-]+\/[a-z0-9_.:-]+$/i.test(model) && model.length <= 100
  }
  return ALLOWED_MODELS[provider].includes(model)
}

export async function POST(req: Request) {
  try {
    // AuthN: require logged-in user for chat usage
    try {
      // clerk user id
      const userId = await validateUserAuthentication()
      const { orgId } = await auth()
      const organizationId = orgId ?? null
      // Pre-parse to also include in credits usage details if valid
      const body = await req.json()
      const parsed = BodySchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Corpo da requisição inválido', issues: parsed.error.flatten() }, { status: 400 })
      }
      const { provider, model, messages: uiMessages, temperature = 0.4, maxTokens, attachments, conversationId } = parsed.data as {
        provider: z.infer<typeof ProviderSchema>
        model: string
        messages: UIMessage[]
        temperature?: number
        maxTokens?: number
        attachments?: Array<{ name: string; url: string }>
        conversationId?: string
        projectId: number
      }
      const projectId = parsed.data.projectId

      if (!isAllowedModel(provider, model)) {
        return NextResponse.json({ error: 'Modelo não permitido para este provedor' }, { status: 400 })
      }

      // quick key presence check
      const missingKey =
        (provider === 'openai' && !process.env.OPENAI_API_KEY) ||
        (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) ||
        (provider === 'google' && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) ||
        (provider === 'mistral' && !process.env.MISTRAL_API_KEY) ||
        (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY)

      if (missingKey) {
        return NextResponse.json({ error: `Chave API ausente para ${provider}.` }, { status: 400 })
      }

      const dbUser = await getUserFromClerkId(userId)

      // Validar acesso ao projeto
      const project = await db.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { userId: dbUser.id },
            ...(organizationId
              ? [
                  {
                    organizationProjects: {
                      some: { organization: { clerkOrgId: organizationId } },
                    },
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          aiChatBehavior: true,
        },
      })

      if (!project) {
        return NextResponse.json({ error: 'Projeto não encontrado ou acesso negado' }, { status: 404 })
      }

      // RAG metadata container (set during context fetch)
      let ragMetadata: { used: boolean; entries: Array<Record<string, unknown>> } | null = null

      // Clean UIMessages: remove step parts (step-start, step-finish) that OpenRouter doesn't support
      const cleanedUIMessages = uiMessages.map(msg => ({
        ...msg,
        parts: msg.parts?.filter(part =>
          // Keep only text parts and tool-related parts, remove step-start/step-finish
          part.type === 'text' ||
          part.type === 'file' ||
          part.type.startsWith('tool-') ||
          part.type.startsWith('data-')
        ) || []
      }))

      // Convert UIMessage[] to ModelMessage[] format
      let modelMessages = convertToModelMessages(cleanedUIMessages)

      // If there are attachments, append a user message listing them so the model can reference the files
      if (attachments && attachments.length > 0) {
        const lines = attachments.map(a => `- ${a.name}: ${a.url}`).join('\n')
        const attachNote = `Anexos:\n${lines}`
        modelMessages = [...modelMessages, { role: 'user' as const, content: attachNote }]
      }

      // RAG: Inject context from knowledge base
      const lastUserMessage = uiMessages.filter(m => m.role === 'user').pop()
      if (lastUserMessage) {
        // Extract text from UIMessage parts
        const userMessageText = lastUserMessage.parts
          ?.filter(part => part.type === 'text')
          .map(part => part.text)
          .join(' ') || ''

        if (userMessageText) {
          try {
            console.log('[RAG] Attempting to get context for query:', userMessageText.substring(0, 100))
            console.log('[RAG] DB User:', dbUser.id, 'Organization:', organizationId || 'none')

            const tenantKey = {
              projectId,
              userId: dbUser.id,
              workspaceId: organizationId ?? undefined,
            }

            const { context: ragContext, results: ragResults } = await getRAGContextWithResults(userMessageText, tenantKey)
            const ragUsed = ragContext.trim().length > 0
            console.log('[RAG] Context retrieved, length:', ragContext.length)

            // Build optimized system prompt (Option C)
            let systemPrompt = ''

            // 1. Custom AI behavior (if configured)
            if (project.aiChatBehavior?.trim()) {
              systemPrompt = project.aiChatBehavior.trim() + '\n\n'
              console.log('[CHAT] Using custom AI behavior for project:', projectId)
            }

            // 2. RAG context instructions (if RAG context available)
            if (ragUsed) {
              systemPrompt += `---
INSTRUÇÕES DE USO DO CONTEXTO:
- Use o contexto da base de conhecimento abaixo quando relevante para a pergunta do usuário
${project.aiChatBehavior ? '- Mantenha SEMPRE o tom de voz e estilo definidos acima em todas as suas respostas' : ''}
- Priorize informações do contexto sobre conhecimento geral
- Se o contexto não tiver informação relevante, responda normalmente com base no seu conhecimento

---
CONTEXTO DO PROJETO (Base de Conhecimento):
${ragContext}

---
IMPORTANTE: ${project.aiChatBehavior ? 'Combine sua personalidade definida com as informações do contexto de forma natural e consistente.' : 'Responda de forma clara usando o contexto quando aplicável.'}`
            }

            // Inject optimized system prompt at the beginning
            if (systemPrompt) {
              const systemMessage = {
                role: 'system' as const,
                content: systemPrompt,
              }
              modelMessages = [systemMessage, ...modelMessages]
              console.log('[CHAT] System prompt injected, length:', systemPrompt.length)
            }

            // Attach RAG usage metadata for downstream saving
            ragMetadata = {
              used: ragUsed,
              entries:
                ragResults?.map(r => ({
                  entryId: r.entryId,
                  title: r.entry?.title,
                  category: r.entry?.category,
                  projectId: r.entry?.projectId,
                  score: r.score,
                })) ?? [],
            }
          } catch (ragError) {
            // Log RAG error but continue without context
            console.error('[RAG] Error retrieving context:', ragError)
          }
        }
      }

      // Credits: 1 credit per LLM request
      const feature: FeatureKey = 'ai_text_chat'
      try {
        await validateCreditsForFeature(userId, feature, 1, {
          organizationId: organizationId ?? undefined,
        })
        await deductCreditsForFeature({
          clerkUserId: userId,
          feature,
          details: { provider, model },
          organizationId: organizationId ?? undefined,
        })
      } catch (err: unknown) {
        if (err instanceof InsufficientCreditsError) {
          return NextResponse.json(
            { error: 'insufficient_credits', required: err.required, available: err.available },
            { status: 402 }
          )
        }
        throw err
      }

      try {
        // Get provider-specific default max tokens (can be overridden by user)
        const defaultMaxTokens = getMaxOutputTokens(provider as AIProvider)
        const finalMaxTokens = maxTokens || defaultMaxTokens

        // Conversation history: verify ownership and save user message
        let conversationDbId: string | null = null
        if (conversationId) {
          const conversation = await db.chatConversation.findFirst({
            where: {
              id: conversationId,
              userId: dbUser.id,
            },
          })

          if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
          }

          if (conversation.projectId && conversation.projectId !== projectId) {
            return NextResponse.json({ error: 'Conversation does not belong to the provided project' }, { status: 403 })
          }

          if (!conversation.projectId) {
            await db.chatConversation.update({
              where: { id: conversation.id },
              data: { projectId },
            })
          }

          conversationDbId = conversation.id

          // Save user message (last message in the array)
          const lastUserMsg = uiMessages[uiMessages.length - 1]
          if (lastUserMsg && lastUserMsg.role === 'user') {
            // Extract text from UIMessage parts
            const userContent = lastUserMsg.parts
              ?.filter(part => part.type === 'text')
              .map(part => part.text)
              .join(' ') || ''

            await db.chatMessage.create({
              data: {
                conversationId: conversationDbId,
                role: 'user',
                content: userContent,
                provider,
                model,
                attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : null,
              },
            })
          }
        }

        const streamConfig = {
          model: getModel(provider, model),
          messages: modelMessages,
          temperature,
          maxOutputTokens: finalMaxTokens,
          async onFinish({ text }) {
            // Save assistant response to conversation history
            if (conversationDbId) {
              try {
                await db.chatMessage.create({
                  data: {
                    conversationId: conversationDbId,
                    role: 'assistant',
                    content: text,
                    provider,
                    model,
                    metadata: ragMetadata
                      ? ({
                          ragUsed: ragMetadata.used,
                          knowledgeEntries: ragMetadata.entries,
                        } as any)
                      : null,
                  },
                })

                // Update conversation's lastMessageAt and expiresAt
                const newExpiresAt = new Date()
                newExpiresAt.setDate(newExpiresAt.getDate() + 7)

                await db.chatConversation.update({
                  where: { id: conversationDbId },
                  data: {
                    projectId,
                    lastMessageAt: new Date(),
                    expiresAt: newExpiresAt,
                  },
                })

                console.log('[CHAT] Saved assistant message to conversation:', conversationDbId)
              } catch (saveErr) {
                console.error('[CHAT] Error saving message to conversation:', saveErr)
              }
            }
          },
        }

        const result = await streamText(streamConfig as any)
        return result.toUIMessageStreamResponse()
      } catch (providerErr: unknown) {
        // Provider call failed after deduction — reimburse user
        console.error('[CHAT] Provider error:', providerErr)
        console.error('[CHAT] Provider error details:', JSON.stringify({
          message: (providerErr as { message?: string })?.message,
          name: (providerErr as { name?: string })?.name,
          stack: (providerErr as { stack?: string })?.stack,
          cause: (providerErr as { cause?: unknown })?.cause,
        }, null, 2))
        await refundCreditsForFeature({
          clerkUserId: userId,
          feature,
          quantity: 1,
          reason: (providerErr as { message?: string })?.message || 'chat_provider_error',
          details: { provider, model },
          organizationId: organizationId ?? undefined,
        })
        return NextResponse.json({ error: 'Erro do provedor' }, { status: 502 })
      }
    } catch (e: unknown) {
      if ((e as { message?: string })?.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }
      throw e
    }
  } catch (error) {
    // Log error for debugging
    console.error('Error in chat API:', error)
    // Avoid leaking provider errors verbosely
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
