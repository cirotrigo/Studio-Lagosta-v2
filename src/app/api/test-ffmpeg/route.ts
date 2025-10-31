import { NextResponse } from 'next/server'
import { existsSync, readdirSync } from 'fs'
import { auth } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

/**
 * GET /api/test-ffmpeg
 * Endpoint de teste para verificar disponibilidade do FFmpeg no Vercel
 */
export async function GET() {
  const { userId } = await auth()

  // Somente admins ou em desenvolvimento
  const isDev = process.env.NODE_ENV === 'development'
  if (!isDev && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: {
    path: string
    exists: boolean
    isExecutable?: boolean
    error?: string
  }[] = []

  // Caminhos a testar
  const paths = [
    process.env.FFMPEG_PATH,
    '/var/task/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg',
    '/opt/bin/ffmpeg',
    '/opt/ffmpeg/ffmpeg',
    '/var/task/ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ].filter(Boolean) as string[]

  // Testar cada caminho
  for (const path of paths) {
    try {
      const exists = existsSync(path)
      results.push({
        path,
        exists,
        isExecutable: exists ? true : undefined,
      })
    } catch (error) {
      results.push({
        path,
        exists: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Tentar carregar ffmpeg-static (prioritário para serverless)
  let staticInfo: {
    loaded: boolean
    path?: string
    error?: string
  } = { loaded: false }

  try {
    const ffmpegStatic = await import('ffmpeg-static')
    const staticPath = typeof ffmpegStatic === 'string'
      ? ffmpegStatic
      : (ffmpegStatic as { default?: string }).default

    staticInfo = {
      loaded: true,
      path: staticPath,
    }

    if (staticPath) {
      results.push({
        path: `${staticPath} (from ffmpeg-static)`,
        exists: existsSync(staticPath),
      })
    }
  } catch (error) {
    staticInfo = {
      loaded: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Tentar carregar @ffmpeg-installer/ffmpeg (fallback)
  let installerInfo: {
    loaded: boolean
    path?: string
    version?: string
    error?: string
  } = { loaded: false }

  try {
    const installer = await import('@ffmpeg-installer/ffmpeg')
    const installerPath =
      (installer as { path?: string }).path ||
      (installer as { default?: { path?: string } }).default?.path

    installerInfo = {
      loaded: true,
      path: installerPath,
      version: (installer as { version?: string }).version,
    }

    if (installerPath) {
      results.push({
        path: `${installerPath} (from @ffmpeg-installer)`,
        exists: existsSync(installerPath),
      })
    }
  } catch (error) {
    installerInfo = {
      loaded: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Listar arquivos em /var/task (se existir)
  let varTaskContents: string[] = []
  try {
    if (existsSync('/var/task')) {
      varTaskContents = readdirSync('/var/task').slice(0, 20) // Limitar a 20 itens
    }
  } catch (error) {
    varTaskContents = [`Error: ${error instanceof Error ? error.message : 'Unknown'}`]
  }

  // Informações do ambiente
  const envInfo = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_REGION: process.env.VERCEL_REGION,
    FFMPEG_PATH: process.env.FFMPEG_PATH,
    platform: process.platform,
    arch: process.arch,
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: envInfo,
    ffmpegStatic: staticInfo,
    installer: installerInfo,
    paths: results,
    varTaskContents: varTaskContents.length > 0 ? varTaskContents : undefined,
    summary: {
      foundPaths: results.filter((r) => r.exists).map((r) => r.path),
      totalTested: results.length,
      totalFound: results.filter((r) => r.exists).length,
      recommendation: results.filter((r) => r.exists).length > 0
        ? '✅ FFmpeg disponível!'
        : '⚠️ FFmpeg não encontrado. Configure FFMPEG_PATH no Vercel.',
    },
  })
}
