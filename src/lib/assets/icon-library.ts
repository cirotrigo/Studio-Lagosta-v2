export interface IconDefinition {
  id: string
  label: string
  path: string
}

export const ICON_LIBRARY: IconDefinition[] = [
  {
    id: 'star',
    label: 'Estrela',
    path: 'M12 2l2.92 5.91 6.53.95-4.72 4.59 1.12 6.53L12 17.77l-5.85 3.21 1.12-6.53-4.72-4.59 6.53-.95L12 2z',
  },
  {
    id: 'heart',
    label: 'Coração',
    path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  },
  {
    id: 'check',
    label: 'Check',
    path: 'M20 6L9 17l-5-5',
  },
  {
    id: 'sun',
    label: 'Sol',
    path: 'M12 4V2m0 20v-2m8.66-6H22M2 12h1.34M17.66 6.34l1.41-1.41M4.93 19.07l1.41-1.41M6.34 6.34 4.93 4.93M19.07 19.07l-1.41-1.41M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
  },
]

export const ICON_PATHS: Record<string, string> = ICON_LIBRARY.reduce((acc, icon) => {
  acc[icon.id] = icon.path
  return acc
}, {} as Record<string, string>)
