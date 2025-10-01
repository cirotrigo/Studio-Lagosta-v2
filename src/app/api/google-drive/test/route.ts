import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ status: 'disabled' }, { status: 200 })
    }

    await googleDriveService.testConnection()

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[API] Google Drive test failure', error)
    return NextResponse.json({ status: 'error' }, { status: 502 })
  }
}
