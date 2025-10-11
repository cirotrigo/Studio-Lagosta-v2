export interface InstagramPreset {
  id: string
  name: string
  description: string
  width: number
  height: number
  aspectRatio: string
  maxDuration: number
  category: 'stories' | 'feed'
}

export const INSTAGRAM_PRESETS: InstagramPreset[] = [
  {
    id: 'instagram-stories',
    name: 'Instagram Stories',
    description: 'Formato vertical para Stories (9:16)',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    maxDuration: 60,
    category: 'stories',
  },
  {
    id: 'instagram-feed-square',
    name: 'Instagram Feed (Quadrado)',
    description: 'Formato quadrado clássico (1:1)',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    maxDuration: 90,
    category: 'feed',
  },
  {
    id: 'instagram-feed-portrait',
    name: 'Instagram Feed (Retrato)',
    description: 'Formato vertical para feed (4:5)',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    maxDuration: 90,
    category: 'feed',
  },
  {
    id: 'instagram-feed-landscape',
    name: 'Instagram Feed (Paisagem)',
    description: 'Formato horizontal para feed (1.91:1)',
    width: 1080,
    height: 566,
    aspectRatio: '1.91:1',
    maxDuration: 90,
    category: 'feed',
  },
]

export function validateInstagramFormat(
  width: number,
  height: number,
  duration: number
): {
  valid: boolean
  warnings: string[]
  preset?: InstagramPreset
} {
  const warnings: string[] = []

  const preset = INSTAGRAM_PRESETS.find(
    (p) => p.width === width && p.height === height
  )

  if (!preset) {
    warnings.push('Proporção não é ideal para Instagram')
  }

  if (preset && duration > preset.maxDuration) {
    warnings.push(
      `Duração (${duration}s) excede o máximo do Instagram ${preset.category} (${preset.maxDuration}s)`
    )
  }

  return {
    valid: warnings.length === 0,
    warnings,
    preset,
  }
}

export function getRecommendedPreset(
  width: number,
  height: number
): InstagramPreset | undefined {
  return INSTAGRAM_PRESETS.find(
    (preset) =>
      Math.abs(preset.width / preset.height - width / height) < 0.001
  )
}
