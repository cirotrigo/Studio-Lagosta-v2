export interface Prompt {
  id: string
  userId: string
  title: string
  content: string
  category: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CreatePromptData {
  title: string
  content: string
  category?: string
  tags?: string[]
}

export interface UpdatePromptData {
  title?: string
  content?: string
  category?: string | null
  tags?: string[]
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
