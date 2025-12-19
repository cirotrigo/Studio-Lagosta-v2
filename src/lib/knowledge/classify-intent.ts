import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

export type UserIntent = 'CREATE' | 'UPDATE' | 'REPLACE' | 'DELETE' | 'QUERY'

const VALID_INTENTS: UserIntent[] = ['CREATE', 'UPDATE', 'REPLACE', 'DELETE', 'QUERY']

// Mapa de sinônimos para parsing robusto
const INTENT_SYNONYMS: Record<string, UserIntent> = {
  // CREATE synonyms
  'CREATE': 'CREATE',
  'CRIAR': 'CREATE',
  'ADICIONAR': 'CREATE',
  'INSERIR': 'CREATE',
  'NOVA': 'CREATE',
  'NOVO': 'CREATE',
  'ADD': 'CREATE',
  'INSERT': 'CREATE',
  'NEW': 'CREATE',

  // UPDATE synonyms
  'UPDATE': 'UPDATE',
  'ATUALIZAR': 'UPDATE',
  'MODIFICAR': 'UPDATE',
  'ALTERAR': 'UPDATE',
  'EDITAR': 'UPDATE',
  'MUDAR': 'UPDATE',
  'MODIFY': 'UPDATE',
  'EDIT': 'UPDATE',
  'CHANGE': 'UPDATE',

  // REPLACE synonyms
  'REPLACE': 'REPLACE',
  'SUBSTITUIR': 'REPLACE',
  'TROCAR': 'REPLACE',
  'SWAP': 'REPLACE',

  // DELETE synonyms
  'DELETE': 'DELETE',
  'DELETAR': 'DELETE',
  'REMOVER': 'DELETE',
  'EXCLUIR': 'DELETE',
  'APAGAR': 'DELETE',
  'REMOVE': 'DELETE',
  'ERASE': 'DELETE',

  // QUERY synonyms
  'QUERY': 'QUERY',
  'CONSULTAR': 'QUERY',
  'PERGUNTAR': 'QUERY',
  'BUSCAR': 'QUERY',
  'PROCURAR': 'QUERY',
  'SEARCH': 'QUERY',
  'ASK': 'QUERY',
  'QUESTION': 'QUERY',
}
// Default to gpt-4o-mini for fast, cost-effective classification
// Can be overridden via CLASSIFICATION_MODEL env var to use newer models like gpt-5-mini or gpt-4.1-mini
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

  const rawResponse = text.trim().toUpperCase()

  // 1. Exact match com intents válidas
  if (VALID_INTENTS.includes(rawResponse as UserIntent)) {
    return rawResponse as UserIntent
  }

  // 2. Match via sinônimos
  if (rawResponse in INTENT_SYNONYMS) {
    return INTENT_SYNONYMS[rawResponse]
  }

  // 3. Buscar primeira palavra que seja um sinônimo conhecido
  const words = rawResponse.split(/\s+/)
  for (const word of words) {
    if (word in INTENT_SYNONYMS) {
      return INTENT_SYNONYMS[word]
    }
  }

  // 4. Fallback: QUERY (pergunta normal)
  console.warn(
    `[classify-intent] LLM returned unexpected intent: "${rawResponse}". Defaulting to QUERY.`
  )
  return 'QUERY'
}
