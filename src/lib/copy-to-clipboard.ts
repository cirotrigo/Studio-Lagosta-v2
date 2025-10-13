'use client'

/**
 * Copia texto para a área de transferência usando a API nativa ou um fallback baseado em textarea.
 * Retorna true em caso de sucesso e lança um erro quando não é possível copiar.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') {
    throw new Error('Clipboard API indisponível no ambiente atual')
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)

    const selection = document.getSelection()
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    textarea.select()
    try {
      const successful = document.execCommand('copy')
      if (!successful) {
        throw new Error('document.execCommand("copy") retornou false')
      }
      return true
    } finally {
      if (previousRange && selection) {
        selection.removeAllRanges()
        selection.addRange(previousRange)
      }
      document.body.removeChild(textarea)
    }
  }

  throw new Error('Nenhum método de cópia suportado encontrado')
}
