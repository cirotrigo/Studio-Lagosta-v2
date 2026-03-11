import type { Project } from '@/stores/project.store'
import type {
  ArtFormat,
  KonvaImageLayer,
  KonvaPage,
  KonvaShapeLayer,
  KonvaTemplateDocument,
  KonvaTextLayer,
  Layer,
} from '@/types/template'
import { ART_FORMAT_PRESETS, getArtFormatPreset } from './formats'

function nowIsoString(): string {
  return new Date().toISOString()
}

export function cloneKonvaDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function sortPages(pages: KonvaPage[]): KonvaPage[] {
  return pages.slice().sort((left, right) => left.order - right.order)
}

export function getCurrentPage(document: KonvaTemplateDocument | null): KonvaPage | null {
  if (!document) {
    return null
  }

  return (
    sortPages(document.design.pages).find((page) => page.id === document.design.currentPageId) ??
    sortPages(document.design.pages)[0] ??
    null
  )
}

export function createTextLayer(page: KonvaPage, overrides: Partial<KonvaTextLayer> = {}): KonvaTextLayer {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    name: 'Texto',
    x: Math.round(page.width * 0.1),
    y: Math.round(page.height * 0.1),
    width: Math.round(page.width * 0.8),
    height: 140,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    draggable: true,
    text: 'Digite aqui',
    textStyle: {
      fontFamily: 'Inter',
      fontSize: Math.max(28, Math.round(page.width * 0.05)),
      fontWeight: '700',
      lineHeight: 1.1,
      fill: '#111827',
    },
    ...overrides,
  }
}

export function createImageLayer(page: KonvaPage, overrides: Partial<KonvaImageLayer> = {}): KonvaImageLayer {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    name: 'Imagem',
    x: Math.round(page.width * 0.08),
    y: Math.round(page.height * 0.16),
    width: Math.round(page.width * 0.84),
    height: Math.round(page.height * 0.34),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    draggable: true,
    src: '/logo.png',
    fit: 'cover',
    ...overrides,
  }
}

export function createShapeLayer(page: KonvaPage, overrides: Partial<KonvaShapeLayer> = {}): KonvaShapeLayer {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    name: 'Shape',
    x: Math.round(page.width * 0.07),
    y: Math.round(page.height * 0.65),
    width: Math.round(page.width * 0.86),
    height: Math.round(page.height * 0.22),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    draggable: true,
    shape: 'rounded-rectangle',
    fill: '#FFF3E1',
    stroke: '#F59E0B',
    strokeWidth: 2,
    cornerRadius: 36,
    ...overrides,
  }
}

export function createBlankPage(format: ArtFormat, order = 0, overrides: Partial<KonvaPage> = {}): KonvaPage {
  const preset = getArtFormatPreset(format)

  return {
    id: crypto.randomUUID(),
    name: `Página ${order + 1}`,
    width: preset.width,
    height: preset.height,
    background: '#F8F5EF',
    order,
    layers: [],
    ...overrides,
  }
}

function createStarterLayers(page: KonvaPage, project: Project | null): Layer[] {
  const logoSrc = project?.logoUrl ?? '/logo.png'

  return [
    createImageLayer(page, {
      name: 'Imagem principal',
      src: logoSrc,
      y: Math.round(page.height * 0.09),
      height: Math.round(page.height * 0.38),
    }),
    createShapeLayer(page, {
      name: 'Cartão',
      y: Math.round(page.height * 0.54),
      height: Math.round(page.height * 0.32),
      fill: '#FFF9F1',
      stroke: '#E5A53A',
      cornerRadius: 44,
    }),
    createTextLayer(page, {
      name: 'Título',
      y: Math.round(page.height * 0.58),
      text: project ? `${project.name} em destaque` : 'Nova arte Konva',
      textStyle: {
        fontFamily: 'Inter',
        fontSize: Math.max(36, Math.round(page.width * 0.066)),
        fontWeight: '800',
        lineHeight: 1.05,
        fill: '#111827',
      },
    }),
    createTextLayer(page, {
      name: 'Descrição',
      y: Math.round(page.height * 0.72),
      height: 120,
      text: 'Selecione uma layer para ajustar posição, escala e propriedades.',
      textStyle: {
        fontFamily: 'Inter',
        fontSize: Math.max(24, Math.round(page.width * 0.032)),
        fontWeight: '500',
        lineHeight: 1.35,
        fill: '#374151',
      },
    }),
    {
      id: crypto.randomUUID(),
      type: 'logo',
      name: 'Logo',
      x: Math.round(page.width * 0.74),
      y: Math.round(page.height * 0.86),
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      src: logoSrc,
      preserveAspectRatio: true,
    },
  ]
}

export function createStarterDocument(project: Project | null, format: ArtFormat = 'STORY'): KonvaTemplateDocument {
  const page = createBlankPage(format, 0)
  page.layers = createStarterLayers(page, project)

  const createdAt = nowIsoString()
  const preset = ART_FORMAT_PRESETS[format]

  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    projectId: project?.id ?? 0,
    engine: 'KONVA',
    name: `${project?.name ?? 'Template'} ${preset.label}`,
    format,
    source: 'local',
    design: {
      pages: [page],
      currentPageId: page.id,
    },
    identity: {
      brandName: project?.name,
      logoUrl: project?.logoUrl ?? undefined,
      colors: ['#111827', '#F59E0B', '#FFF9F1'],
      fonts: [{ name: 'Inter', fontFamily: 'Inter' }],
    },
    slots: [],
    meta: {
      createdAt,
      updatedAt: createdAt,
      isDirty: true,
    },
  }
}

export function duplicatePage(page: KonvaPage, order: number): KonvaPage {
  return {
    ...cloneKonvaDocument(page),
    id: crypto.randomUUID(),
    name: `${page.name} Copy`,
    order,
    layers: page.layers.map((layer) => ({
      ...cloneKonvaDocument(layer),
      id: crypto.randomUUID(),
    })),
  }
}
