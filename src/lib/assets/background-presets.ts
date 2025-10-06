import type { GradientStop } from '@/types/template'

export interface BackgroundPreset {
  id: string
  label: string
  type: 'solid' | 'gradient'
  value: string
  gradientStops?: GradientStop[]
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'white', label: 'Branco', type: 'solid', value: '#ffffff' },
  { id: 'black', label: 'Preto', type: 'solid', value: '#111111' },
  { id: 'soft-blue', label: 'Azul Suave', type: 'gradient', value: 'linear', gradientStops: [
    { id: '1', color: '#60a5fa', position: 0, opacity: 1 },
    { id: '2', color: '#1d4ed8', position: 1, opacity: 1 },
  ] },
  { id: 'sunset', label: 'Sunset', type: 'gradient', value: 'linear', gradientStops: [
    { id: '1', color: '#f97316', position: 0, opacity: 1 },
    { id: '2', color: '#ef4444', position: 0.5, opacity: 1 },
    { id: '3', color: '#8b5cf6', position: 1, opacity: 1 },
  ] },
  { id: 'forest', label: 'Verde', type: 'gradient', value: 'linear', gradientStops: [
    { id: '1', color: '#34d399', position: 0, opacity: 1 },
    { id: '2', color: '#047857', position: 1, opacity: 1 },
  ] },
  { id: 'midnight', label: 'Midnight', type: 'gradient', value: 'radial', gradientStops: [
    { id: '1', color: '#111827', position: 0, opacity: 1 },
    { id: '2', color: '#1f2937', position: 1, opacity: 1 },
  ] },
]
