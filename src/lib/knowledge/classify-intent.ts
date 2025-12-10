import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

export type UserIntent = 'CREATE' | 'UPDATE' | 'REPLACE' | 'DELETE' | 'QUERY'

const VALID_INTENTS: UserIntent[] = ['CREATE', 'UPDATE', 'REPLACE', 'DELETE', 'QUERY']
const DEFAULT_MODEL = process.env.CLASSIFICATION_MODEL || 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = Number.isFinite(Number(process.env.CLASSIFICATION_TEMPERATURE))
  ? Number(process.env.CLASSIFICATION_TEMPERATURE)
  : 0.1

const INTENT_PROMPT = `
Você é um assistente que identifica a intenção do usuário ao interagir com a base de conhecimento.

INTENÇÕES POSSÍVEIS:
1. CREATE - Nova informação (ex: "Nosso delivery funciona até 22h")
2. UPDATE - Atualizar existente (ex: "Atualiza o horário para 23h")
3. REPLACE - Substituir completo (ex: "Substitui o cardápio por: ...")
4. DELETE - Remover (ex: "Remove a informação de estacionamento")
5. QUERY - Pergunta normal (ex: "Qual o horário?")

Responda APENAS com: CREATE, UPDATE, REPLACE, DELETE ou QUERY

MENSAGEM:
{userInput}

INTENÇÃO:
`.trim()

export async function classifyIntent(userMessage: string): Promise<UserIntent> {
  const input = userMessage.trim()
  if (!input) return 'QUERY'

  const { text } = await generateText({
    model: openai(DEFAULT_MODEL),
    prompt: INTENT_PROMPT.replace('{userInput}', input),
    temperature: DEFAULT_TEMPERATURE,
  })

  const intent = text.trim().toUpperCase()
  if (VALID_INTENTS.includes(intent as UserIntent)) {
    return intent as UserIntent
  }

  return 'QUERY'
}
