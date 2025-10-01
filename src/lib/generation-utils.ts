// src/lib/generation-utils.ts
// Helper functions para geração de criativos e thumbnails

import { put } from '@vercel/blob'
import type { DesignData, FieldValues } from '@/types/template'

export interface Template {
  id: number
  name: string
  type: string
  dimensions: string
  designData: unknown
}

export interface Generation {
  id: string
  templateId: number
  fieldValues: unknown
  template?: Template
}

/**
 * Renderiza e faz upload de um criativo
 * IMPORTANTE: Importação dinâmica para evitar bundle do @napi-rs/canvas
 */
export async function renderGeneration(generation: Generation): Promise<string> {
  if (!generation.template) {
    throw new Error('Template not found in generation')
  }

  const template = generation.template
  const [width, height] = template.dimensions.split('x').map(Number)

  // Importação dinâmica do CanvasRenderer (só funciona no Node.js)
  const { CanvasRenderer } = await import('./canvas-renderer')

  // Criar renderer
  const renderer = new CanvasRenderer(width, height)

  // Renderizar
  const buffer = await renderer.renderDesign(
    template.designData as DesignData,
    generation.fieldValues as FieldValues,
  )

  // Upload para Vercel Blob
  const key = `generations/${generation.id}.png`
  const token = process.env.BLOB_READ_WRITE_TOKEN

  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured')
  }

  const result = await put(key, buffer, {
    access: 'public',
    token,
    contentType: 'image/png',
  })

  return result.url
}

/**
 * Gera thumbnail de um template
 * IMPORTANTE: Importação dinâmica para evitar bundle do @napi-rs/canvas
 */
export async function generateThumbnail(template: Template): Promise<string> {
  // Obter dimensões originais
  const [originalWidth, originalHeight] = template.dimensions.split('x').map(Number)

  // Calcular dimensões do thumbnail mantendo aspect ratio
  // Máximo de 400px de largura ou altura
  const maxDimension = 400
  let thumbWidth = originalWidth
  let thumbHeight = originalHeight

  if (originalWidth > originalHeight) {
    if (originalWidth > maxDimension) {
      thumbWidth = maxDimension
      thumbHeight = Math.round((originalHeight / originalWidth) * maxDimension)
    }
  } else {
    if (originalHeight > maxDimension) {
      thumbHeight = maxDimension
      thumbWidth = Math.round((originalWidth / originalHeight) * maxDimension)
    }
  }

  // Importação dinâmica do CanvasRenderer (só funciona no Node.js)
  const { CanvasRenderer } = await import('./canvas-renderer')

  // Criar renderer com dimensões do thumbnail
  const renderer = new CanvasRenderer(thumbWidth, thumbHeight)

  // Ajustar designData para o tamanho do thumbnail
  const designData = template.designData as DesignData
  const scaleFactor = thumbWidth / originalWidth

  const scaledDesignData: DesignData = {
    canvas: {
      width: thumbWidth,
      height: thumbHeight,
      backgroundColor: designData.canvas.backgroundColor,
    },
    layers: designData.layers.map((layer) => ({
      ...layer,
      position: {
        x: Math.round(layer.position.x * scaleFactor),
        y: Math.round(layer.position.y * scaleFactor),
      },
      size: {
        width: Math.round(layer.size.width * scaleFactor),
        height: Math.round(layer.size.height * scaleFactor),
      },
      style: {
        ...layer.style,
        fontSize: layer.style?.fontSize
          ? Math.round(layer.style.fontSize * scaleFactor)
          : undefined,
      },
    })),
  }

  // Renderizar template vazio (sem fieldValues)
  const buffer = await renderer.renderDesign(scaledDesignData, {})

  // Upload para Vercel Blob
  const key = `thumbnails/template-${template.id}.png`
  const token = process.env.BLOB_READ_WRITE_TOKEN

  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured')
  }

  const result = await put(key, buffer, {
    access: 'public',
    token,
    contentType: 'image/png',
  })

  return result.url
}

/**
 * Gera preview rápido (menor qualidade, mais rápido)
 * IMPORTANTE: Importação dinâmica para evitar bundle do @napi-rs/canvas
 */
export async function generatePreview(
  designData: DesignData,
  fieldValues: FieldValues,
): Promise<Buffer> {
  const [width, height] = [
    designData.canvas.width,
    designData.canvas.height,
  ]

  // Preview em 50% da resolução original
  const previewWidth = Math.round(width * 0.5)
  const previewHeight = Math.round(height * 0.5)

  // Importação dinâmica do CanvasRenderer (só funciona no Node.js)
  const { CanvasRenderer } = await import('./canvas-renderer')

  const renderer = new CanvasRenderer(previewWidth, previewHeight)

  // Escalar designData
  const scaleFactor = 0.5
  const scaledDesignData: DesignData = {
    canvas: {
      width: previewWidth,
      height: previewHeight,
      backgroundColor: designData.canvas.backgroundColor,
    },
    layers: designData.layers.map((layer) => ({
      ...layer,
      position: {
        x: Math.round(layer.position.x * scaleFactor),
        y: Math.round(layer.position.y * scaleFactor),
      },
      size: {
        width: Math.round(layer.size.width * scaleFactor),
        height: Math.round(layer.size.height * scaleFactor),
      },
      style: {
        ...layer.style,
        fontSize: layer.style?.fontSize
          ? Math.round(layer.style.fontSize * scaleFactor)
          : undefined,
      },
    })),
  }

  return await renderer.renderDesign(scaledDesignData, fieldValues)
}
