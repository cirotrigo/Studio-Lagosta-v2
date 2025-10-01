// src/lib/font-config.ts
// Sistema unificado de configuração de fontes

export const FONT_CONFIG = {
  /**
   * Fontes seguras (sempre disponíveis)
   */
  SAFE_FONTS: [
    'Montserrat',
    'Arial',
    'Helvetica',
    'sans-serif',
    'serif',
    'monospace',
  ] as const,

  /**
   * Fonte padrão
   */
  DEFAULT_FONT: 'Montserrat' as const,

  /**
   * Obtém fonte com fallback
   */
  getFontWithFallback(fontName: string): string {
    const safeFonts = this.SAFE_FONTS

    // Se já é fonte segura, retornar
    if (safeFonts.includes(fontName as any)) {
      return fontName
    }

    // Retornar com fallback
    return `${fontName}, ${this.DEFAULT_FONT}, sans-serif`
  },

  /**
   * Normaliza string de fonte CSS
   */
  normalizeFontString(
    fontSize: number,
    fontFamily: string,
    fontWeight: string | number = 'normal',
    fontStyle: string = 'normal',
  ): string {
    const family = this.getFontWithFallback(fontFamily)
    return `${fontStyle} ${fontWeight} ${fontSize}px ${family}`
  },

  /**
   * Obtém paths de fontes do sistema (Node.js)
   */
  getSystemFontPaths(): Record<string, string> {
    const platform = process.platform

    if (platform === 'darwin') {
      // macOS
      return {
        Montserrat: '/System/Library/Fonts/Supplemental/Arial.ttf',
        Arial: '/System/Library/Fonts/Supplemental/Arial.ttf',
        Helvetica: '/System/Library/Fonts/Helvetica.ttc',
        'Times New Roman': '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
        Georgia: '/System/Library/Fonts/Supplemental/Georgia.ttf',
        Verdana: '/System/Library/Fonts/Supplemental/Verdana.ttf',
      }
    } else if (platform === 'linux') {
      // Linux (comum em servidores)
      return {
        Montserrat: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        Arial: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        Helvetica: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        'Times New Roman': '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
        Georgia: '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
        Verdana: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      }
    } else if (platform === 'win32') {
      // Windows
      return {
        Montserrat: 'C:\\Windows\\Fonts\\Arial.ttf',
        Arial: 'C:\\Windows\\Fonts\\Arial.ttf',
        Helvetica: 'C:\\Windows\\Fonts\\Arial.ttf',
        'Times New Roman': 'C:\\Windows\\Fonts\\times.ttf',
        Georgia: 'C:\\Windows\\Fonts\\georgia.ttf',
        Verdana: 'C:\\Windows\\Fonts\\verdana.ttf',
      }
    }

    // Fallback
    return {
      Montserrat: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      Arial: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    }
  },

  /**
   * Lista de fontes disponíveis (para UI)
   */
  AVAILABLE_FONTS: [
    { name: 'Montserrat', label: 'Montserrat', category: 'sans-serif' },
    { name: 'Arial', label: 'Arial', category: 'sans-serif' },
    { name: 'Helvetica', label: 'Helvetica', category: 'sans-serif' },
    { name: 'Verdana', label: 'Verdana', category: 'sans-serif' },
    { name: 'Times New Roman', label: 'Times New Roman', category: 'serif' },
    { name: 'Georgia', label: 'Georgia', category: 'serif' },
  ] as const,

  /**
   * Pesos de fonte disponíveis
   */
  FONT_WEIGHTS: [
    { value: '300', label: 'Light' },
    { value: '400', label: 'Regular' },
    { value: '500', label: 'Medium' },
    { value: '600', label: 'Semi Bold' },
    { value: '700', label: 'Bold' },
    { value: '800', label: 'Extra Bold' },
  ] as const,
}
