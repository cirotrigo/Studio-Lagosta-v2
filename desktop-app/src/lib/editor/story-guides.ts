export interface StoryGuide {
  position: number
  label: string
  color: string
}

// Instagram Story safe zones (1080×1920)
export const STORY_HORIZONTAL_GUIDES: StoryGuide[] = [
  { position: 250, label: 'Margem superior', color: '#3B82F6' },
  { position: 500, label: 'Zona de título', color: '#8B5CF6' },
  { position: 960, label: 'Centro', color: '#6B7280' },
  { position: 1420, label: 'Zona de rodapé', color: '#8B5CF6' },
  { position: 1670, label: 'Margem inferior', color: '#3B82F6' },
]

export const STORY_VERTICAL_GUIDES: StoryGuide[] = [
  { position: 60, label: 'Margem esquerda', color: '#3B82F6' },
  { position: 540, label: 'Centro', color: '#6B7280' },
  { position: 1020, label: 'Margem direita', color: '#3B82F6' },
]

export const STORY_DIMENSIONS = { width: 1080, height: 1920 } as const

export function isStoryFormat(width: number, height: number): boolean {
  return width === STORY_DIMENSIONS.width && height === STORY_DIMENSIONS.height
}
