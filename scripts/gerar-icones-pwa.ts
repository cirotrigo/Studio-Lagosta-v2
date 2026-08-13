/**
 * Gera os ícones do PWA em `public/icons/` a partir de um SVG inline.
 *
 * Uso: npx tsx scripts/gerar-icones-pwa.ts
 *
 * Design: quadrado arredondado no vermelho-lagosta da casa com monograma "L"
 * branco. O "L" é um PATH (traço com pontas arredondadas), nunca `<text>` —
 * a rasterização de texto do librsvg depende das fontes instaladas na máquina
 * e mudaria de forma entre ambientes; o path é idêntico em qualquer lugar.
 *
 * As cores saem do tema escuro do site (`.dark` em `src/app/globals.css`,
 * que é o padrão do ThemeProvider): `--primary: oklch(0.69 0.19 38)` ≈ #f96736.
 * O gradiente desce para um tom mais fundo do mesmo matiz, para dar volume.
 *
 * São geradas DUAS variantes por tamanho:
 * - `icone-*.png` (purpose "any"): o quadrado arredondado com cantos
 *   transparentes — é o desenho "de vitrine".
 * - `icone-maskable-*.png` (purpose "maskable"): fundo que preenche o quadro
 *   INTEIRO e monograma dentro da zona segura (~80% central). Máscara de
 *   launcher (círculo/squircle do Android) recorta o quadro por conta própria;
 *   se usássemos a variante de cantos transparentes, o recorte squircle
 *   mostraria os cantos vazados.
 * - `apple-touch-icon.png` (180x180) usa a variante cheia: o iOS aplica a
 *   própria máscara arredondada e espera receber o quadro completo.
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// Vermelho-lagosta: oklch(0.69 0.19 38) do tema escuro, convertido para sRGB.
const VERMELHO_LAGOSTA = '#f96736'
// Mesmo matiz, mais fundo, para a base do gradiente.
const VERMELHO_LAGOSTA_ESCURO = '#d94a1f'

/**
 * O monograma "L": um traço branco de pontas e junta arredondadas.
 * Caixa ótica centrada no quadro de 512 (o pé do L pesa à direita, então a
 * haste fica um pouco à esquerda do centro geométrico).
 */
function monograma(escala = 1): string {
  const cx = 256
  const cy = 256
  const s = (v: number, centro: number) => centro + (v - centro) * escala
  const largura = 58 * escala
  return `
    <path
      d="M ${s(184, cx)} ${s(138, cy)} L ${s(184, cx)} ${s(374, cy)} L ${s(332, cx)} ${s(374, cy)}"
      fill="none"
      stroke="#ffffff"
      stroke-width="${largura}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />`
}

function svgArredondado(tamanho: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${VERMELHO_LAGOSTA}" />
      <stop offset="1" stop-color="${VERMELHO_LAGOSTA_ESCURO}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="116" fill="url(#fundo)" />
  ${monograma(1)}
</svg>`
}

function svgCheio(tamanho: number): string {
  // Monograma um pouco menor: precisa caber na zona segura de máscara
  // (círculo de raio 40% do quadro), porque o launcher recorta as bordas.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${VERMELHO_LAGOSTA}" />
      <stop offset="1" stop-color="${VERMELHO_LAGOSTA_ESCURO}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" fill="url(#fundo)" />
  ${monograma(0.78)}
</svg>`
}

async function gerar(svg: string, tamanho: number, destino: string) {
  await sharp(Buffer.from(svg))
    .resize(tamanho, tamanho)
    .png()
    .toFile(destino)
  console.log(`✓ ${destino} (${tamanho}x${tamanho})`)
}

async function main() {
  const pasta = path.join(process.cwd(), 'public', 'icons')
  await mkdir(pasta, { recursive: true })

  await gerar(svgArredondado(192), 192, path.join(pasta, 'icone-192.png'))
  await gerar(svgArredondado(512), 512, path.join(pasta, 'icone-512.png'))
  await gerar(svgCheio(192), 192, path.join(pasta, 'icone-maskable-192.png'))
  await gerar(svgCheio(512), 512, path.join(pasta, 'icone-maskable-512.png'))
  await gerar(svgCheio(180), 180, path.join(pasta, 'apple-touch-icon.png'))

  console.log('Ícones do PWA gerados em public/icons/.')
}

main().catch((error) => {
  console.error('Falha ao gerar os ícones do PWA:', error)
  process.exit(1)
})
