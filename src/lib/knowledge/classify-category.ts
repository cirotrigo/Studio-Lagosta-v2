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

// Mapa de sinônimos para parsing robusto de categorias
const CATEGORY_SYNONYMS: Record<string, KnowledgeCategory> = {
  // ESTABELECIMENTO_INFO
  'ESTABELECIMENTO_INFO': KnowledgeCategory.ESTABELECIMENTO_INFO,
  'ESTABELECIMENTO': KnowledgeCategory.ESTABELECIMENTO_INFO,
  'INFORMAÇÕES': KnowledgeCategory.ESTABELECIMENTO_INFO,
  'INFO': KnowledgeCategory.ESTABELECIMENTO_INFO,
  'INFORMACAO': KnowledgeCategory.ESTABELECIMENTO_INFO,
  'CONTATO': KnowledgeCategory.ESTABELECIMENTO_INFO,
  'ENDERECO': KnowledgeCategory.ESTABELECIMENTO_INFO,

  // HORARIOS
  'HORARIOS': KnowledgeCategory.HORARIOS,
  'HORÁRIO': KnowledgeCategory.HORARIOS,
  'HORARIO': KnowledgeCategory.HORARIOS,
  'FUNCIONAMENTO': KnowledgeCategory.HORARIOS,
  'ABERTURA': KnowledgeCategory.HORARIOS,
  'HOURS': KnowledgeCategory.HORARIOS,

  // CARDAPIO
  'CARDAPIO': KnowledgeCategory.CARDAPIO,
  'CARDÁPIO': KnowledgeCategory.CARDAPIO,
  'MENU': KnowledgeCategory.CARDAPIO,
  'PRATOS': KnowledgeCategory.CARDAPIO,
  'BEBIDAS': KnowledgeCategory.CARDAPIO,
  'COMIDA': KnowledgeCategory.CARDAPIO,

  // DELIVERY
  'DELIVERY': KnowledgeCategory.DELIVERY,
  'ENTREGA': KnowledgeCategory.DELIVERY,
  'PEDIDO': KnowledgeCategory.DELIVERY,

  // POLITICAS
  'POLITICAS': KnowledgeCategory.POLITICAS,
  'POLÍTICAS': KnowledgeCategory.POLITICAS,
  'RESERVAS': KnowledgeCategory.POLITICAS,
  'REGRAS': KnowledgeCategory.POLITICAS,
  'POLICIES': KnowledgeCategory.POLITICAS,

  // TOM_DE_VOZ
  'TOM_DE_VOZ': KnowledgeCategory.TOM_DE_VOZ,
  'TOM': KnowledgeCategory.TOM_DE_VOZ,
  'VOZ': KnowledgeCategory.TOM_DE_VOZ,
  'PERSONALIDADE': KnowledgeCategory.TOM_DE_VOZ,
  'ESTILO': KnowledgeCategory.TOM_DE_VOZ,
  'BRAND': KnowledgeCategory.TOM_DE_VOZ,

  // CAMPANHAS
  'CAMPANHAS': KnowledgeCategory.CAMPANHAS,
  'CAMPANHA': KnowledgeCategory.CAMPANHAS,
  'PROMOCAO': KnowledgeCategory.CAMPANHAS,
  'PROMOÇÃO': KnowledgeCategory.CAMPANHAS,
  'EVENTO': KnowledgeCategory.CAMPANHAS,
  'EVENTOS': KnowledgeCategory.CAMPANHAS,
  'CAMPAIGN': KnowledgeCategory.CAMPANHAS,

  // DIFERENCIAIS
  'DIFERENCIAIS': KnowledgeCategory.DIFERENCIAIS,
  'DIFERENCIAL': KnowledgeCategory.DIFERENCIAIS,
  'HISTORIA': KnowledgeCategory.DIFERENCIAIS,
  'HISTÓRIA': KnowledgeCategory.DIFERENCIAIS,
  'PREMIACAO': KnowledgeCategory.DIFERENCIAIS,
  'PREMIAÇÕES': KnowledgeCategory.DIFERENCIAIS,
  'CHEF': KnowledgeCategory.DIFERENCIAIS,

  // FAQ
  'FAQ': KnowledgeCategory.FAQ,
  'PERGUNTAS': KnowledgeCategory.FAQ,
  'DUVIDAS': KnowledgeCategory.FAQ,
  'DÚVIDAS': KnowledgeCategory.FAQ,
  'QUESTIONS': KnowledgeCategory.FAQ,
}

export async function classifyCategory(text: string): Promise<KnowledgeCategory> {
  const input = text.trim()
  if (!input) return KnowledgeCategory.ESTABELECIMENTO_INFO

  const { text: category } = await generateText({
    model: openai(DEFAULT_MODEL),
    prompt: CATEGORY_PROMPT.replace('{userInput}', input),
    temperature: DEFAULT_TEMPERATURE,
  })

  const rawResponse = category.trim().toUpperCase()

  // 1. Exact match com categorias válidas
  if (VALID_CATEGORIES.includes(rawResponse)) {
    return rawResponse as KnowledgeCategory
  }

  // 2. Match via sinônimos
  if (rawResponse in CATEGORY_SYNONYMS) {
    return CATEGORY_SYNONYMS[rawResponse]
  }

  // 3. Buscar primeira palavra que seja um sinônimo conhecido
  const words = rawResponse.split(/\s+/)
  for (const word of words) {
    if (word in CATEGORY_SYNONYMS) {
      return CATEGORY_SYNONYMS[word]
    }
  }

  // 4. Fallback: ESTABELECIMENTO_INFO
  console.warn(
    `[classify-category] LLM returned unexpected category: "${rawResponse}". Defaulting to ESTABELECIMENTO_INFO.`
  )
  return KnowledgeCategory.ESTABELECIMENTO_INFO
}
