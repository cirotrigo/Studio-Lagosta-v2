/**
 * Templates de Layouts para AI Creative Generator
 * Define os 3 layouts disponíveis com suas zones configuradas
 */

import type { LayoutTemplate, LayoutId } from './layout-types'

export const LAYOUT_TEMPLATES: Record<LayoutId, LayoutTemplate> = {
  'story-promo': {
    id: 'story-promo',
    name: 'Story Promocional',
    description: 'Ideal para promoções e ofertas especiais',
    dimensions: { width: 1080, height: 1920 },
    zones: [
      {
        id: 'background',
        type: 'image',
        layer: 0,
        style: { objectFit: 'cover' },
      },
      {
        id: 'overlay',
        type: 'rect',
        layer: 1,
        style: { fill: 'rgba(0, 0, 0, 0.3)' },
      },
      {
        id: 'logo',
        type: 'image',
        layer: 2,
        position: { x: '50%', y: '8%' },
        size: { maxWidth: '25%', maxHeight: 120 },
      },
      {
        id: 'badge',
        type: 'text',
        layer: 3,
        position: { x: '75%', y: '20%' },
        textField: 'subtitle',
        style: {
          fontSize: 48,
          fontWeight: 'bold',
          fill: '#FF0000',
          rotation: 15,
          stroke: '#FFFFFF',
          strokeWidth: 2,
          align: 'center',
        },
      },
      {
        id: 'title',
        type: 'text',
        layer: 4,
        position: { x: '50%', y: '45%' },
        textField: 'title',
        style: {
          fontSize: 96,
          fontWeight: 'bold',
          fill: '#FFFFFF',
          align: 'center',
          textTransform: 'uppercase',
        },
      },
      {
        id: 'description',
        type: 'text',
        layer: 5,
        position: { x: '50%', y: '82%' },
        textField: 'description',
        style: {
          fontSize: 42,
          fill: '#FFFFFF',
          align: 'center',
        },
      },
      {
        id: 'hours',
        type: 'text',
        layer: 6,
        position: { x: '50%', y: '90%' },
        textField: 'hours',
        style: {
          fontSize: 36,
          fill: '#FFFFFF',
          align: 'center',
        },
      },
      {
        id: 'cta',
        type: 'text',
        layer: 7,
        position: { x: '50%', y: '95%' },
        textField: 'cta',
        style: {
          fontSize: 48,
          fontWeight: 'bold',
          fill: '#FF0000', // será substituído por cor da marca
          align: 'center',
        },
      },
    ],
  },

  'story-default': {
    id: 'story-default',
    name: 'Story Padrão',
    description: 'Layout equilibrado para posts gerais',
    dimensions: { width: 1080, height: 1920 },
    zones: [
      {
        id: 'background',
        type: 'image',
        layer: 0,
        style: { objectFit: 'cover' },
      },
      {
        id: 'logo',
        type: 'image',
        layer: 1,
        position: { x: '50%', y: '10%' },
        size: { maxWidth: '30%' },
      },
      {
        id: 'title',
        type: 'text',
        layer: 2,
        position: { x: '50%', y: '30%' },
        textField: 'title',
        style: {
          fontSize: 84,
          fontWeight: 'bold',
          fill: '#FFFFFF',
          align: 'center',
        },
      },
      {
        id: 'subtitle',
        type: 'text',
        layer: 3,
        position: { x: '50%', y: '40%' },
        textField: 'subtitle',
        style: {
          fontSize: 52,
          fill: '#FFFFFF',
          align: 'center',
        },
      },
      {
        id: 'description',
        type: 'text',
        layer: 4,
        position: { x: '50%', y: '85%' },
        textField: 'description',
        style: {
          fontSize: 40,
          fill: '#FFFFFF',
          align: 'center',
          width: '80%',
        },
      },
      {
        id: 'hours',
        type: 'text',
        layer: 5,
        position: { x: '50%', y: '92%' },
        textField: 'hours',
        style: {
          fontSize: 36,
          fill: '#FFFFFF',
          align: 'center',
        },
      },
      {
        id: 'address',
        type: 'text',
        layer: 6,
        position: { x: '50%', y: '96%' },
        textField: 'address',
        style: {
          fontSize: 28,
          fill: '#FFFFFF',
          align: 'center',
        },
      },
    ],
  },

  'story-minimal': {
    id: 'story-minimal',
    name: 'Story Minimalista',
    description: 'Design limpo e focado',
    dimensions: { width: 1080, height: 1920 },
    zones: [
      {
        id: 'background',
        type: 'image',
        layer: 0,
        style: { objectFit: 'cover' },
      },
      {
        id: 'logo',
        type: 'image',
        layer: 1,
        position: { x: '90%', y: '10%' },
        size: { maxWidth: '20%' },
      },
      {
        id: 'title',
        type: 'text',
        layer: 2,
        position: { x: '10%', y: '85%' },
        textField: 'title',
        style: {
          fontSize: 72,
          fontWeight: 'bold',
          fill: '#FFFFFF',
          align: 'left',
        },
      },
      {
        id: 'cta',
        type: 'text',
        layer: 3,
        position: { x: '10%', y: '93%' },
        textField: 'cta',
        style: {
          fontSize: 40,
          fill: '#FF0000', // será substituído
          align: 'left',
        },
      },
    ],
  },
}

export function getLayoutById(id: LayoutId): LayoutTemplate {
  return LAYOUT_TEMPLATES[id]
}

export function getAllLayouts(): LayoutTemplate[] {
  return Object.values(LAYOUT_TEMPLATES)
}
