import { NextResponse } from 'next/server'
import { getMenuByLocation } from '@/lib/cms/queries'

/**
 * GET /api/public/menu?location=HEADER
 * Get public menu by location
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const location = searchParams.get('location')

    if (!location) {
      return NextResponse.json(
        { error: 'Location parameter is required' },
        { status: 400 }
      )
    }

    const menu = await getMenuByLocation(location.toUpperCase())

    return NextResponse.json({ menu })
  } catch (error) {
    console.error('Error fetching public menu:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu' },
      { status: 500 }
    )
  }
}
