export interface Prompt {
  id: string
  userId: string
  organizationId: string | null
  title: string
  content: string
  category: string | null
  tags: string[]
  referenceImages: string[]
  createdAt: string
  updatedAt: string
}

export interface CreatePromptData {
  title: string
  content: string
  category?: string
  tags?: string[]
  referenceImages?: string[]
}

export interface UpdatePromptData {
  title?: string
  content?: string
  category?: string | null
  tags?: string[]
  referenceImages?: string[]
}

export interface PromptFilters {
  search?: string
  category?: string
}

export const PROMPT_CATEGORIES = [
  'Logo',
  'Paisagem',
  'Personagem',
  'Produto',
  'Abstrato',
  'Realista',
  'Ilustração',
  'Outro',
] as const

export type PromptCategory = typeof PROMPT_CATEGORIES[number]
