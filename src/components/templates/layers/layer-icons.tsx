import {
  Type,
  Image,
  Palette,
  Sparkles,
  Shapes,
  Star,
  LucideIcon,
} from 'lucide-react'
import type { LayerType } from '@/types/template'

const LAYER_ICONS: Record<LayerType, LucideIcon> = {
  text: Type,
  image: Image,
  gradient: Palette,
  gradient2: Palette,
  logo: Sparkles,
  element: Shapes,
  shape: Shapes,
  icon: Star,
}

export function getLayerIcon(type: LayerType): LucideIcon {
  return LAYER_ICONS[type] || Shapes
}

export function getLayerTypeName(type: LayerType): string {
  const names: Record<LayerType, string> = {
    text: 'Texto',
    image: 'Imagem',
    gradient: 'Gradiente',
    gradient2: 'Gradiente',
    logo: 'Logo',
    element: 'Elemento',
    shape: 'Forma',
    icon: 'Ícone',
  }
  return names[type] || type
}
