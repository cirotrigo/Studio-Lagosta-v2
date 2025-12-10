import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { KnowledgeCategory } from '@prisma/client'

const DEFAULT_MODEL = process.env.CLASSIFICATION_MODEL || 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = Number.isFinite(Number(process.env.CLASSIFICATION_TEMPERATURE))
  ? Number(process.env.CLASSIFICATION_TEMPERATURE)
  : 0.1

const CATEGORY_PROMPT = `
Você é um classificador de informações de restaurantes.

CATEGORIAS DISPONÍVEIS:
1. ESTABELECIMENTO_INFO - Nome, endereço, telefone, redes sociais
2. HORARIOS - Horários de funcionamento
3. CARDAPIO - Pratos, bebidas, preços, ingredientes
4. DELIVERY - Informações de entrega
5. POLITICAS - Reservas, cancelamentos, dress code, pets
6. TOM_DE_VOZ - Personalidade da marca, estilo de comunicação
7. CAMPANHAS - Promoções, happy hour, eventos
8. DIFERENCIAIS - História, premiações, chef
9. FAQ - Perguntas e respostas frequentes

Responda APENAS com o nome da categoria.
Se o texto se encaixar em múltiplas, escolha a MAIS ESPECÍFICA.

TEXTO:
{userInput}

CATEGORIA:
`.trim()

const VALID_CATEGORIES = Object.keys(KnowledgeCategory)

export async function classifyCategory(text: string): Promise<KnowledgeCategory> {
  const input = text.trim()
  if (!input) return KnowledgeCategory.ESTABELECIMENTO_INFO

  const { text: category } = await generateText({
    model: openai(DEFAULT_MODEL),
    prompt: CATEGORY_PROMPT.replace('{userInput}', input),
    temperature: DEFAULT_TEMPERATURE,
  })

  const cleaned = category.trim().toUpperCase()

  if (VALID_CATEGORIES.includes(cleaned)) {
    return cleaned as KnowledgeCategory
  }

  return KnowledgeCategory.ESTABELECIMENTO_INFO
}
