import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Obter configurações do site
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Buscar as configurações (singleton)
    let settings = await db.siteSettings.findFirst({
      where: { isActive: true }
    })

    // Se não existir, criar configurações padrão
    if (!settings) {
      settings = await db.siteSettings.create({
        data: {
          siteName: 'Studio Lagosta',
          shortName: 'Studio Lagosta',
          description: 'Plataforma de criação de conteúdo visual',
          logoLight: '/logo-light.svg',
          logoDark: '/logo-dark.svg',
          favicon: '/favicon.ico',
          updatedBy: userId,
        }
      })
    }

    return NextResponse.json(settings)
  } catch (_error) {
    console.error('Error fetching site settings:', _error)
    return NextResponse.json(
      { error: 'Failed to fetch site settings' },
      { status: 500 }
    )
  }
}

// PATCH - Atualizar configurações do site
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Buscar configurações existentes
    let settings = await db.siteSettings.findFirst({
      where: { isActive: true }
    })

    if (!settings) {
      // Criar se não existir
      settings = await db.siteSettings.create({
        data: {
          ...data,
          updatedBy: userId,
        }
      })
    } else {
      // Atualizar existente
      settings = await db.siteSettings.update({
        where: { id: settings.id },
        data: {
          ...data,
          updatedBy: userId,
        }
      })
    }

    return NextResponse.json(settings)
  } catch (_error) {
    console.error('Error updating site settings:', _error)
    return NextResponse.json(
      { error: 'Failed to update site settings' },
      { status: 500 }
    )
  }
}
