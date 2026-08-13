import type { MetadataRoute } from 'next'

/**
 * Manifesto do PWA. O Next serve isto em `/manifest.webmanifest` e injeta o
 * `<link rel="manifest">` sozinho — nada a acrescentar no layout.
 *
 * Cores: o app abre no tema ESCURO (`ThemeProvider defaultTheme="dark"` no
 * layout raiz), então `background_color` e `theme_color` são o fundo do tema
 * escuro — `--background: oklch(0.1 0 0)` do `globals.css`, ≈ #030303 em sRGB.
 * Manter o splash escuro evita o flash branco entre abrir o app e o CSS
 * carregar.
 *
 * Ícones: gerados por `scripts/gerar-icones-pwa.ts` (npx tsx). As variantes
 * `maskable` preenchem o quadro inteiro porque o launcher recorta com a
 * própria máscara; a variante `any` é o quadrado arredondado com cantos
 * transparentes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lagosta Criativa',
    short_name: 'Lagosta',
    description:
      'Estúdio de conteúdo da Lagosta Criativa: agenda, criação de artes e publicação para os clientes.',
    start_url: '/agenda',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#030303',
    theme_color: '#030303',
    icons: [
      {
        src: '/icons/icone-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icone-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icone-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icone-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
