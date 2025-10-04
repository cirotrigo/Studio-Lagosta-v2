/**
 * FontManager - Sistema de gerenciamento de fontes customizadas
 *
 * Funcionalidades:
 * - Upload de fontes (.ttf, .otf, .woff, .woff2)
 * - Carregamento via @font-face
 * - Detecção de carregamento (Font Loading API + fallback)
 * - Integração com Konva.js (redesenho forçado)
 * - Persistência em localStorage (base64)
 */

export interface CustomFont {
  name: string
  family: string
  url: string
  file?: File
  extension: string
  loaded: boolean
  base64?: string
  source: 'upload' | 'google'
}

export class FontManager {
  private loadedFonts = new Map<string, CustomFont>()
  private styleSheet: CSSStyleSheet | null = null
  private styleElement: HTMLStyleElement | null = null

  constructor() {
    this.createStyleSheet()
    this.loadFromLocalStorage()
  }

  /**
   * Cria stylesheet para adicionar @font-face dinamicamente
   */
  private createStyleSheet(): void {
    if (typeof document === 'undefined') return

    const existingStyle = document.getElementById('custom-fonts-stylesheet') as HTMLStyleElement | null
    if (existingStyle) {
      this.styleElement = existingStyle
      this.styleSheet = existingStyle.sheet
      return
    }

    const style = document.createElement('style')
    style.id = 'custom-fonts-stylesheet'
    document.head.appendChild(style)
    this.styleElement = style
    this.styleSheet = style.sheet
  }

  /**
   * Adiciona @font-face ao stylesheet
   */
  private addFontFace(
    fontFamily: string,
    fontUrl: string,
    fontWeight: string | number = 'normal',
    fontStyle: string = 'normal',
  ): void {
    if (!this.styleSheet) return

    const rule = `
      @font-face {
        font-family: '${fontFamily}';
        src: url('${fontUrl}');
        font-weight: ${fontWeight};
        font-style: ${fontStyle};
        font-display: swap;
      }
    `

    try {
      this.styleSheet.insertRule(rule, this.styleSheet.cssRules.length)
    } catch (error) {
      console.error('[FontManager] Erro ao adicionar @font-face:', error)
    }
  }

  /**
   * Converte File para base64 para persistência
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * Upload e processamento de arquivo de fonte
   */
  async uploadFont(file: File): Promise<string> {
    // Validar extensão
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2']
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()

    if (!validExtensions.includes(extension)) {
      throw new Error('Formato de fonte não suportado. Use TTF, OTF, WOFF ou WOFF2.')
    }

    // Extrair nome da fonte do arquivo (remover extensão e substituir - _ por espaços)
    const fontName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')

    // Verificar se já existe
    if (this.loadedFonts.has(fontName)) {
      throw new Error(`Fonte "${fontName}" já foi importada.`)
    }

    // Criar URL do arquivo
    const fontUrl = URL.createObjectURL(file)

    // Converter para base64 para persistência
    const base64 = await this.fileToBase64(file)

    // Adicionar @font-face
    this.addFontFace(fontName, fontUrl)

    // Carregar fonte e esperar estar pronta
    await this.loadFont(fontName)

    // Salvar informações da fonte
    const customFont: CustomFont = {
      name: fontName,
      family: fontName,
      url: fontUrl,
      file,
      extension,
      loaded: true,
      base64,
      source: 'upload',
    }

    this.loadedFonts.set(fontName, customFont)

    // Persistir no localStorage
    this.saveToLocalStorage()

    console.log(`✅ Fonte "${fontName}" carregada e salva com sucesso!`)
    return fontName
  }

  /**
   * FUNÇÃO CRÍTICA: Detectar quando fonte está carregada
   * Usa Font Loading API com fallback de medição
   */
  async loadFont(
    fontName: string,
    fontStyle: string = 'normal',
    fontWeight: string = '400',
  ): Promise<void> {
    // Se já foi carregada, retornar imediatamente
    if (this.loadedFonts.has(fontName) && this.loadedFonts.get(fontName)?.loaded) {
      return
    }

    // Método 1: Usar Font Loading API (navegadores modernos)
    const hasFontsLoadSupport = typeof document !== 'undefined' && 'fonts' in document && document.fonts

    if (hasFontsLoadSupport) {
      try {
        await document.fonts.load(`${fontStyle} ${fontWeight} 16px '${fontName}'`)

        // Verificar se realmente carregou
        if (document.fonts.check(`16px '${fontName}'`)) {
          // Pequeno delay de segurança
          await this.delay(60)
          console.log(`✅ Fonte "${fontName}" carregada via Font Loading API!`)
          return
        }
      } catch (e) {
        console.warn('Font Loading API falhou, usando fallback:', e)
      }
    }

    // Método 2: Fallback - Medição de largura do texto
    await this.loadFontByWidthMeasurement(fontName, fontStyle, fontWeight)
  }

  /**
   * Método de fallback: detectar fonte por mudança na largura do texto
   */
  private async loadFontByWidthMeasurement(
    fontName: string,
    fontStyle: string = 'normal',
    fontWeight: string = '400',
  ): Promise<void> {
    if (typeof document === 'undefined') return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sampleText = 'The quick brown fox 0123456789 AaBbCc'

    // Medir largura com fontes padrão
    ctx.font = `${fontStyle} ${fontWeight} 16px Arial`
    const arialWidth = ctx.measureText(sampleText).width

    ctx.font = `${fontStyle} ${fontWeight} 16px 'Times New Roman'`
    const timesWidth = ctx.measureText(sampleText).width

    // Medir com a fonte customizada (fallback para Arial)
    ctx.font = `${fontStyle} ${fontWeight} 16px '${fontName}', Arial`
    let lastWidth = ctx.measureText(sampleText).width

    const waitTime = 60 // ms entre verificações
    const timeout = 6000 // timeout máximo
    const attemptsNumber = Math.ceil(timeout / waitTime)

    for (let i = 0; i < attemptsNumber; i++) {
      ctx.font = `${fontStyle} ${fontWeight} 16px '${fontName}', Arial`
      const newWidthArial = ctx.measureText(sampleText).width

      ctx.font = `${fontStyle} ${fontWeight} 16px '${fontName}', 'Times New Roman'`
      const newWidthTimes = ctx.measureText(sampleText).width

      // Se a largura mudou em relação às fontes padrão, a fonte carregou
      const somethingChanged =
        newWidthArial !== lastWidth ||
        newWidthArial !== arialWidth ||
        newWidthTimes !== timesWidth

      if (somethingChanged) {
        await this.delay(60) // Delay de segurança
        console.log(`✅ Fonte "${fontName}" detectada por medição!`)
        return
      }

      await this.delay(waitTime)
      lastWidth = newWidthArial
    }

    console.warn(
      `⚠️ Timeout ao carregar fonte "${fontName}". A fonte pode não estar disponível.`
    )
  }

  /**
   * Helper para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Obter lista de fontes disponíveis
   */
  getAvailableFonts(): {
    system: string[]
    custom: string[]
    all: string[]
  } {
    const systemFonts = [
      'Inter',
      'Roboto',
      'Open Sans',
      'Lato',
      'Montserrat',
      'Poppins',
      'Raleway',
      'Nunito',
      'Playfair Display',
      'Merriweather',
      'PT Serif',
      'Source Sans Pro',
      'Ubuntu',
      'Work Sans',
      'Rubik',
    ]

    const customFonts = Array.from(this.loadedFonts.keys())

    return {
      system: systemFonts,
      custom: customFonts,
      all: [...systemFonts, ...customFonts],
    }
  }

  /**
   * Obter todas as fontes customizadas
   */
  getCustomFonts(): CustomFont[] {
    return Array.from(this.loadedFonts.values())
  }

  /**
   * Verificar se uma fonte é customizada
   */
  isCustomFont(fontName: string): boolean {
    return this.loadedFonts.has(fontName)
  }

  /**
   * Remover fonte
   */
  removeFont(fontName: string): void {
    const font = this.loadedFonts.get(fontName)
    if (!font) return

    // Revogar URL do blob
    if (font.url && font.url.startsWith('blob:')) {
      URL.revokeObjectURL(font.url)
    }

    this.loadedFonts.delete(fontName)

    // Atualizar localStorage
    this.saveToLocalStorage()

    console.log(`🗑️ Fonte "${fontName}" removida`)
  }

  /**
   * Salvar fontes no localStorage (via base64)
   */
  private saveToLocalStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const fontsData = Array.from(this.loadedFonts.values()).map((font) => ({
        name: font.name,
        family: font.family,
        extension: font.extension,
        base64: font.base64,
        source: font.source,
      }))

      localStorage.setItem('custom-fonts', JSON.stringify(fontsData))
      console.log(`💾 ${fontsData.length} fontes salvas no localStorage`)
    } catch (error) {
      console.error('[FontManager] Erro ao salvar no localStorage:', error)
    }
  }

  /**
   * Carregar fontes do localStorage
   */
  private async loadFromLocalStorage(): Promise<void> {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem('custom-fonts')
      if (!stored) return

      const fontsData = JSON.parse(stored) as Array<{
        name: string
        family: string
        extension: string
        base64?: string
        source: 'upload' | 'google'
      }>

      console.log(`📦 Carregando ${fontsData.length} fontes do localStorage...`)

      for (const fontData of fontsData) {
        if (!fontData.base64) continue

        // Converter base64 de volta para blob URL
        const blob = await this.base64ToBlob(fontData.base64)
        const url = URL.createObjectURL(blob)

        // Adicionar @font-face
        this.addFontFace(fontData.family, url)

        // Carregar fonte
        await this.loadFont(fontData.family)

        // Salvar no Map
        this.loadedFonts.set(fontData.name, {
          name: fontData.name,
          family: fontData.family,
          url,
          extension: fontData.extension,
          loaded: true,
          base64: fontData.base64,
          source: fontData.source,
        })

        console.log(`✅ Fonte "${fontData.name}" restaurada do localStorage`)
      }
    } catch (error) {
      console.error('[FontManager] Erro ao carregar do localStorage:', error)
    }
  }

  /**
   * Converter base64 para Blob
   */
  private async base64ToBlob(base64: string): Promise<Blob> {
    const response = await fetch(base64)
    return response.blob()
  }

  /**
   * Limpar todas as fontes customizadas
   */
  clearAllCustomFonts(): void {
    // Revogar todos os blob URLs
    for (const font of this.loadedFonts.values()) {
      if (font.url && font.url.startsWith('blob:')) {
        URL.revokeObjectURL(font.url)
      }
    }

    this.loadedFonts.clear()

    // Limpar localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('custom-fonts')
    }

    console.log('🗑️ Todas as fontes customizadas foram removidas')
  }

  /**
   * Adicionar Google Font
   */
  async addGoogleFont(fontName: string): Promise<void> {
    if (this.loadedFonts.has(fontName)) {
      throw new Error(`Fonte "${fontName}" já foi adicionada.`)
    }

    // Adicionar link do Google Fonts
    const link = document.createElement('link')
    link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    // Aguardar carregamento
    await this.loadFont(fontName)

    // Adicionar ao gerenciador
    this.loadedFonts.set(fontName, {
      name: fontName,
      family: fontName,
      url: link.href,
      extension: '.google',
      loaded: true,
      source: 'google',
    })

    console.log(`✅ Google Font "${fontName}" adicionada`)
  }
}

// Instância global (singleton)
let fontManagerInstance: FontManager | null = null

export function getFontManager(): FontManager {
  if (typeof window === 'undefined') {
    // Retornar instância mock no servidor
    return {
      uploadFont: async () => '',
      loadFont: async () => {},
      getAvailableFonts: () => ({ system: [], custom: [], all: [] }),
      getCustomFonts: () => [],
      isCustomFont: () => false,
      removeFont: () => {},
      clearAllCustomFonts: () => {},
      addGoogleFont: async () => {},
    } as FontManager
  }

  if (!fontManagerInstance) {
    fontManagerInstance = new FontManager()
  }

  return fontManagerInstance
}
