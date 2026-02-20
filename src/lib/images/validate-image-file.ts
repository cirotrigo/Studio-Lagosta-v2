/**
 * Validação completa de arquivos de imagem
 * Verifica MIME type, extensão, magic bytes, tamanho e dimensões
 */

// Magic bytes (assinaturas) para validação real de tipo de arquivo
const IMAGE_SIGNATURES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // "RIFF" - precisa verificar "WEBP" em offset 8
  'image/gif': [0x47, 0x49, 0x46],
} as const

interface ValidationResult {
  valid: boolean
  error?: string
  detectedType?: string
}

export async function validateImageFile(file: File): Promise<ValidationResult> {
  // 1. Validar extensão
  const extension = file.name.split('.').pop()?.toLowerCase()
  const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif']

  if (!extension || !validExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Extensão inválida. Aceito: ${validExtensions.join(', ')}`,
    }
  }

  // 2. Validar tamanho
  const minSize = 100 * 1024 // 100KB
  const maxSize = 10 * 1024 * 1024 // 10MB

  if (file.size < minSize) {
    return { valid: false, error: 'Arquivo muito pequeno (mínimo 100KB)' }
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'Arquivo muito grande (máximo 10MB)' }
  }

  // 3. Validar magic bytes
  try {
    const buffer = await file.slice(0, 12).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    let detectedType: string | undefined

    for (const [type, signature] of Object.entries(IMAGE_SIGNATURES)) {
      if (signature.every((byte, i) => bytes[i] === byte)) {
        // Para WebP, verificar também "WEBP" em offset 8
        if (type === 'image/webp') {
          const webpMarker = new TextDecoder().decode(bytes.slice(8, 12))
          if (webpMarker === 'WEBP') {
            detectedType = type
            break
          }
        } else {
          detectedType = type
          break
        }
      }
    }

    if (!detectedType) {
      return { valid: false, error: 'Arquivo não é uma imagem válida' }
    }

    // 4. Validar que tipo detectado combina com MIME type (se fornecido)
    if (file.type && file.type !== detectedType) {
      return {
        valid: false,
        error: `Tipo declarado (${file.type}) não corresponde ao conteúdo (${detectedType})`,
      }
    }

    // 5. Validar dimensões
    const img = new Image()
    const url = URL.createObjectURL(file)

    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(url)
          resolve({ width: img.width, height: img.height })
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('Falha ao carregar imagem'))
        }
        img.src = url
      }
    )

    const minDimension = 64
    const maxDimension = 8192

    if (dimensions.width < minDimension || dimensions.height < minDimension) {
      return {
        valid: false,
        error: `Dimensões muito pequenas (mínimo ${minDimension}x${minDimension}px)`,
      }
    }

    if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
      return {
        valid: false,
        error: `Dimensões muito grandes (máximo ${maxDimension}x${maxDimension}px)`,
      }
    }

    return { valid: true, detectedType }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Erro ao validar arquivo',
    }
  }
}

/**
 * Validar URL de imagem
 * Verifica formato e acessibilidade
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    // Validação básica de formato
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      return false
    }

    // HEAD request para verificar se imagem existe e é acessível
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return false

    // Verificar content-type
    const contentType = response.headers.get('content-type')
    if (!contentType?.startsWith('image/')) return false

    return true
  } catch {
    return false
  }
}
