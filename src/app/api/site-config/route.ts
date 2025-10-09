import { NextResponse } from 'next/server'
import { getSiteConfig } from '@/lib/site-settings'

// API pública para obter configurações do site
// Não requer autenticação pois é usado no header público
export async function GET() {
  try {
    const config = await getSiteConfig()

    return NextResponse.json(config, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('Error fetching site config:', error)

    // Retornar configurações padrão em caso de erro
    return NextResponse.json({
      name: 'Studio Lagosta',
      shortName: 'Studio Lagosta',
      description: 'Plataforma de criação de conteúdo visual',
      logo: {
        light: '/logo-light.svg',
        dark: '/logo-dark.svg',
      },
      icons: {
        favicon: '/favicon.ico',
      }
    })
  }
}
