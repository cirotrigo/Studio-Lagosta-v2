/**
 * Types para o AI Creative Generator
 * Sistema de geração de criativos com IA baseado em layouts pré-definidos
 */

export type LayoutId = 'story-promo' | 'story-default' | 'story-minimal'

export type TextFieldName = 'title' | 'subtitle' | 'description' | 'hours' | 'cta' | 'address'

export interface LayoutZone {
  id: string // 'background', 'logo', 'title', etc
  type: 'image' | 'text' | 'rect'
  layer: number // ordem de renderização (0 = fundo)
  position?: { x: string; y: string } // '50%' ou '100'
  size?: { maxWidth?: string | number; maxHeight?: string | number }
  textField?: TextFieldName // mapeia para campo do formulário
  style?: {
    fill?: string
    fontSize?: number
    fontWeight?: string
    align?: 'left' | 'center' | 'right'
    textTransform?: 'uppercase' | 'lowercase' | 'capitalize'
    rotation?: number
    stroke?: string
    strokeWidth?: number
    width?: string | number
    objectFit?: 'cover' | 'contain'
  }
}

export interface LayoutTemplate {
  id: LayoutId
  name: string
  description: string
  dimensions: { width: number; height: number }
  zones: LayoutZone[]
}

export interface BrandAssets {
  logo: { fileUrl: string; name: string } | null
  fonts: Array<{ fontFamily: string; fileUrl: string }>
  colors: Array<{ name: string; hexCode: string }>
}

export interface TextsData {
  title?: string
  subtitle?: string
  description?: string
  hours?: string
  cta?: string
  address?: string
}

export interface ImageSource {
  type: 'ai-generate' | 'google-drive' | 'ai-gallery' | 'local-upload'
  url: string
  // Campos específicos por tipo
  prompt?: string
  references?: string[]
  model?: 'nano-banana' | 'nano-banana-pro' | 'flux-schnell' | 'flux-1.1-pro' | string
  driveFileId?: string
  aiImageId?: string
  pathname?: string // Para upload local (Vercel Blob pathname)
}

export interface LayerBinding {
  fieldName: TextFieldName | 'background' | 'logo' | 'overlay'
  layerId: string
}
