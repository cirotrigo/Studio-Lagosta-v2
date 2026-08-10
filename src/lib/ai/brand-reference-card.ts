/**
 * Brand Reference Card — a carta de identidade renderizada que entra como
 * imagem de referência (`role: 'brand-card'`) na geração de arte com lettering.
 *
 * Por que uma IMAGEM e não texto: instrução textual de fonte o modelo ignora
 * ou aproxima; referência VISUAL ele copia bem (aprendizado do insta-automatico,
 * que usa o mesmo truque em produção).
 *
 * PRIORIDADE: quando `Project.brandManualUrl` existe, é ELE que vai ao modelo —
 * o manual feito por designer "funciona MUITO melhor que a auto-gerada", que é
 * a razão de a coluna existir. O card auto-gerado é o fallback de quem ainda
 * não subiu manual nenhum.
 *
 * O card mostra: logo oficial, paleta com nome+hex e amostras tipográficas
 * desenhadas com as fontes REAIS do projeto (CustomFont registradas no
 * @napi-rs/canvas). Cache em /tmp por hash dos insumos — mesma instância
 * quente não re-renderiza.
 */

import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import type { BrandContext } from '@/lib/brand/brand-context'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'

const CARD_SIZE = 1080
const CACHE_DIR = '/tmp/studio-lagosta-brand-card'

export interface BrandCardResult {
  buffer: Buffer
  mimeType: string
  /** De onde veio: o manual do designer ou o card que o Studio desenha. */
  origem: 'manual-designer' | 'card-gerado'
}

function cacheKey(brand: BrandContext): string {
  const input = JSON.stringify({
    name: brand.projectName,
    logo: brand.logoUrl,
    colors: brand.colors,
    fonts: brand.fonts,
    v: 1, // versão do layout — mudou o desenho, invalida o cache
  })
  return createHash('sha1').update(input).digest('hex').slice(0, 16)
}

/**
 * Renderiza (ou serve do cache) o card do projeto. Devolve null quando o
 * projeto não tem o mínimo (nem logo, nem cores, nem fontes) — card vazio só
 * confundiria o modelo.
 */
export async function getBrandReferenceCard(brand: BrandContext | null): Promise<BrandCardResult | null> {
  if (!brand) return null

  // O manual do designer vence o card gerado — sem cache em disco, porque o
  // Blob já é a cópia permanente e o arquivo é servido de CDN.
  if (brand.brandManualUrl) {
    try {
      const { buffer, contentType } = await fetchImageSource(brand.brandManualUrl)
      return { buffer, mimeType: contentType || 'image/png', origem: 'manual-designer' }
    } catch (error) {
      // Manual quebrado não pode deixar a peça sem referência de marca: cai
      // para o card gerado, que é pior mas existe.
      console.warn('[brand-card] manual do designer não carregou — usando o card gerado:', error)
    }
  }

  const hasAnything = brand.logoUrl || brand.colors.length > 0 || brand.fonts.title || brand.fonts.body
  if (!hasAnything) return null

  const key = cacheKey(brand)
  const cachePath = path.join(CACHE_DIR, `${brand.projectId}-${key}.png`)
  try {
    if (fs.existsSync(cachePath)) {
      return { buffer: fs.readFileSync(cachePath), mimeType: 'image/png', origem: 'card-gerado' }
    }
  } catch {
    // cache é conveniência — falha de leitura só força re-render
  }

  const buffer = await renderCard(brand)

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cachePath, buffer)
  } catch {
    // idem: sem cache ainda funciona
  }

  return { buffer, mimeType: 'image/png', origem: 'card-gerado' }
}

async function renderCard(brand: BrandContext): Promise<Buffer> {
  // Fontes reais do projeto ANTES de criar o canvas — família não registrada
  // desenha em fallback, e o card perderia a razão de existir.
  await registerProjectFonts(brand.projectId)

  // Import dinâmico, como o resto do código server-side de canvas.
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const canvas = createCanvas(CARD_SIZE, CARD_SIZE)
  const ctx = canvas.getContext('2d')

  // Fundo em duas faixas: clara no topo (logo + paleta), escura embaixo
  // (amostras de tipografia em branco — contraste garantido em qualquer marca).
  ctx.fillStyle = '#F7F4EE'
  ctx.fillRect(0, 0, CARD_SIZE, 560)
  ctx.fillStyle = '#171512'
  ctx.fillRect(0, 560, CARD_SIZE, CARD_SIZE - 560)

  // Cabeçalho
  ctx.fillStyle = '#6B6558'
  ctx.font = '600 26px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`IDENTIDADE VISUAL — ${brand.projectName.toUpperCase()}`, 48, 40)

  // Logo centralizada na faixa clara
  if (brand.logoUrl) {
    try {
      const { buffer } = await fetchImageSource(brand.logoUrl)
      const img = await loadImage(buffer)
      const maxW = 480
      const maxH = 260
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (CARD_SIZE - w) / 2, 110 + (maxH - h) / 2, w, h)
    } catch (error) {
      console.warn('[brand-card] logo não carregou — card segue sem ela:', error)
    }
  }

  // Paleta: até 8 swatches com nome + hex
  const colors = brand.colors.slice(0, 8)
  if (colors.length > 0) {
    const sw = 96
    const gap = 28
    const totalW = colors.length * sw + (colors.length - 1) * gap
    let x = (CARD_SIZE - totalW) / 2
    const y = 408
    for (const color of colors) {
      ctx.fillStyle = color.hexCode
      ctx.beginPath()
      ctx.roundRect(x, y, sw, sw, 14)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.fillStyle = '#3A362F'
      ctx.font = '500 17px sans-serif'
      ctx.textAlign = 'center'
      const nome = color.name.length > 12 ? `${color.name.slice(0, 11)}…` : color.name
      ctx.fillText(nome, x + sw / 2, y + sw + 10)
      ctx.fillStyle = '#8A8475'
      ctx.font = '400 15px monospace'
      ctx.fillText(color.hexCode.toUpperCase(), x + sw / 2, y + sw + 32)
      ctx.textAlign = 'left'
      x += sw + gap
    }
  }

  // Amostras tipográficas na faixa escura. quote() protege contra família com
  // espaço; fallback declarado para a amostra não sumir se a fonte não
  // registrou (na Vercel família ausente desenha NADA).
  const quote = (family: string) => `"${family.replace(/"/g, '')}", sans-serif`
  let ty = 620
  ctx.fillStyle = '#FFFFFF'

  if (brand.fonts.title) {
    ctx.font = `700 84px ${quote(brand.fonts.title)}`
    ctx.fillText('TÍTULO DA MARCA', 48, ty)
    ctx.fillStyle = '#9C958A'
    ctx.font = '400 20px sans-serif'
    ctx.fillText(`${brand.fonts.title} — títulos, caixa alta`, 48, ty + 96)
    ty += 150
    ctx.fillStyle = '#FFFFFF'
  }

  const subtitleFamily = brand.fonts.subtitle ?? brand.fonts.body
  if (subtitleFamily) {
    ctx.font = `500 48px ${quote(subtitleFamily)}`
    ctx.fillText('Subtítulo de apoio da peça', 48, ty)
    ctx.fillStyle = '#9C958A'
    ctx.font = '400 20px sans-serif'
    ctx.fillText(`${subtitleFamily} — subtítulos`, 48, ty + 58)
    ty += 110
    ctx.fillStyle = '#FFFFFF'
  }

  if (brand.fonts.body) {
    ctx.font = `400 32px ${quote(brand.fonts.body)}`
    ctx.fillText('Texto de corpo: horário, endereço e serviço.', 48, ty)
    ctx.fillStyle = '#9C958A'
    ctx.font = '400 20px sans-serif'
    ctx.fillText(`${brand.fonts.body} — corpo`, 48, ty + 42)
  }

  return canvas.toBuffer('image/png')
}
