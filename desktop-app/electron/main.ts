import { app, BrowserWindow, ipcMain, shell, safeStorage, session, net } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import { processImage } from './ipc/image-processor'
import { getCookies, saveCookies, clearCookies } from './ipc/secure-storage'
import { ensureFont, getFontBase64 } from './ipc/font-cache'
import { renderText, measureTextLayout, renderFinalLayout, registerFontFromPath } from './ipc/text-renderer'
import { JsonStorageService } from './services/json-storage'
import { registerTemplateHandlers } from './ipc/template-handlers'
import { registerSyncHandlers } from './ipc/sync-handlers'
import { registerGenerationHandlers } from './ipc/generation-handlers'

let mainWindow: BrowserWindow | null = null
let refreshWindow: BrowserWindow | null = null
let isRefreshing = false

type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
type VariationCount = 1 | 2 | 4

interface GenerateAiTextPayload {
  projectId: number
  prompt: string
  format: ArtFormat
  variations: VariationCount
  templateIds?: string[]
  includeLogo: boolean
  usePhoto: boolean
  photoUrl?: string
  compositionEnabled?: boolean
  compositionPrompt?: string
  compositionReferenceUrls?: string[]
  analyzeImageForContext?: boolean
  analysisImageUrl?: string
}

interface GenerateAiTextVariation {
  pre_title: string
  title: string
  description: string
  cta: string
  badge: string
  footer_info_1: string
  footer_info_2: string
}

interface GenerateAiTextKnowledgeHit {
  entryId: string
  title: string
  category: string
  content: string
  score: number
  source: 'rag' | 'fallback-db'
}

interface GenerateAiTextKnowledge {
  applied: boolean
  context: string
  categoriesUsed: string[]
  hits: GenerateAiTextKnowledgeHit[]
}

interface GenerateAiTextImageAnalysis {
  requested: boolean
  applied: boolean
  sourceImageUrl?: string
  summary: string
  sceneType: string
  confidence: number
  dishNameCandidates: string[]
  ingredientsHints: string[]
  matchedKnowledge?: {
    entryId: string
    title: string
    category: 'CARDAPIO' | 'CAMPANHAS'
    score: number
    reason: string
  }
  warnings: string[]
}

interface GenerateAiTextResponse {
  variacoes: GenerateAiTextVariation[]
  knowledge?: GenerateAiTextKnowledge
  imageAnalysis?: GenerateAiTextImageAnalysis
  warnings?: string[]
  conflicts?: string[]
}

const WEB_APP_BASE_URL = process.env.WEB_APP_BASE_URL || 'https://studio-lagosta-v2.vercel.app'
const MAX_REFERENCE_IMAGES = 5

interface RenderHtmlSnapshotArgs {
  html: string
  width: number
  height: number
  mimeType?: 'image/jpeg' | 'image/png'
  quality?: number
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

function getJwtExp(jwt: string): number | null {
  const payload = decodeJwtPayload(jwt)
  if (!payload || typeof payload.exp !== 'number') return null
  return payload.exp
}

function isSessionCookieValid(
  cookie: Electron.Cookie | undefined,
  minRemainingSeconds = 20,
): boolean {
  if (!cookie?.value) return false
  const exp = getJwtExp(cookie.value)
  if (!exp) return false
  const now = Math.floor(Date.now() / 1000)
  return exp > now + minRemainingSeconds
}

function pickBestSessionCookie(
  cookies: Electron.Cookie[],
  minRemainingSeconds = 20,
): Electron.Cookie | undefined {
  const now = Math.floor(Date.now() / 1000)
  let best: Electron.Cookie | undefined
  let bestExp = 0

  for (const cookie of cookies) {
    const isSession = cookie.name === '__session' || cookie.name.startsWith('__session_')
    if (!isSession || !cookie.value) continue

    const exp = getJwtExp(cookie.value)
    if (!exp || exp <= now + minRemainingSeconds) continue
    if (!best || exp > bestExp) {
      best = cookie
      bestExp = exp
    }
  }

  return best
}

function extractBestSessionTokenFromCookieHeader(
  cookieHeader: string | null,
  minRemainingSeconds = 20,
): string | null {
  if (!cookieHeader) return null

  const candidates: string[] = []
  const pattern = /(?:^|;\s*)__session(?:_[^=]+)?=([^;]+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(cookieHeader)) !== null) {
    const token = match[1]?.trim()
    if (token) candidates.push(token)
  }

  if (candidates.length === 0) return null

  const now = Math.floor(Date.now() / 1000)
  let bestToken: string | null = null
  let bestExp = 0

  for (const token of candidates) {
    const exp = getJwtExp(token)
    if (!exp || exp <= now + minRemainingSeconds) continue
    if (!bestToken || exp > bestExp) {
      bestToken = token
      bestExp = exp
    }
  }

  return bestToken
}

function hasValidSessionInCookieHeader(
  cookieHeader: string | null,
  minRemainingSeconds = 20,
): boolean {
  return Boolean(extractBestSessionTokenFromCookieHeader(cookieHeader, minRemainingSeconds))
}

// Refresh Clerk session using a hidden browser window (Clerk JS handles token rotation)
async function refreshClerkSession(): Promise<boolean> {
  if (isRefreshing) {
    console.log('[Refresh] Already refreshing, waiting...')
    // Wait up to 15s for ongoing refresh to complete
    return new Promise(resolve => {
      let waited = 0
      const interval = setInterval(async () => {
        waited += 500
        if (!isRefreshing) {
          clearInterval(interval)
          // Check if we now have a valid session
          const cookies = await session.defaultSession.cookies.get({ url: 'https://studio-lagosta-v2.vercel.app' })
          const s = pickBestSessionCookie(cookies, 5)
          if (s) {
            resolve(true)
            return
          }
          resolve(false)
        } else if (waited >= 15000) {
          clearInterval(interval)
          resolve(false)
        }
      }, 500)
    })
  }
  
  isRefreshing = true
  console.log('[Refresh] Starting Clerk session refresh via hidden window...')
  
  return new Promise<boolean>((resolve) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    
    refreshWindow = win
    
    const timeout = setTimeout(() => {
      console.log('[Refresh] Timeout (15s) - closing refresh window')
      if (!win.isDestroyed()) win.close()
      isRefreshing = false
      resolve(false)
    }, 15000)
    
    // Watch for new __session cookie
    const cookieHandler = async (_e: Electron.Event, cookie: Electron.Cookie, _cause: string, removed: boolean) => {
      if (removed) return
      if (!cookie.domain?.includes('studio-lagosta-v2.vercel.app')) return
      if (cookie.name !== '__session' && !cookie.name.startsWith('__session_')) return
      if (!cookie.value || cookie.value.length < 10) return
      
      console.log('[Refresh] __session cookie changed, validating...')
      
      // Validate it's a fresh (non-expired) token
      if (!isSessionCookieValid(cookie, 5)) {
        console.log('[Refresh] New __session is not valid yet, ignoring')
        return
      }

      const exp = getJwtExp(cookie.value)
      const now = Math.floor(Date.now() / 1000)
      console.log('[Refresh] Got fresh __session, valid for', (exp ?? now) - now, 'seconds')
      clearTimeout(timeout)
      session.defaultSession.cookies.removeListener('changed', cookieHandler)
      if (!win.isDestroyed()) win.close()
      isRefreshing = false
      resolve(true)
    }
    
    session.defaultSession.cookies.on('changed', cookieHandler)
    
    // Log navigation to see what Clerk does
    win.webContents.on('did-navigate', (_e, url) => {
      console.log('[Refresh] Window navigated to:', url.substring(0, 100))
    })
    
    win.webContents.on('did-redirect-navigation', (_e, url) => {
      console.log('[Refresh] Window redirected to:', url.substring(0, 100))
    })
    
    win.on('closed', () => {
      refreshWindow = null
      session.defaultSession.cookies.removeListener('changed', cookieHandler)
      clearTimeout(timeout)
      isRefreshing = false
    })
    
    // Load the app - Clerk JS will auto-refresh the session token via /__clerk/client
    console.log('[Refresh] Loading /studio to trigger Clerk token refresh...')
    win.loadURL('https://studio-lagosta-v2.vercel.app/studio')
  })
}

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    title: 'Lagosta Tools',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    const konvaStorage = new JsonStorageService()
    await konvaStorage.ensureBaseStructure()
    registerTemplateHandlers(konvaStorage)
    registerSyncHandlers(konvaStorage)
    registerGenerationHandlers({
      webAppBaseUrl: WEB_APP_BASE_URL,
      getFreshCookies,
      refreshClerkSession,
      executeRequest,
      isAuthHtmlResponse,
      extractErrorMessage,
    })
    console.info('[Konva Storage] Inicializado em:', konvaStorage.getRootDir())
  } catch (error) {
    console.error('[Konva Storage] Falha ao inicializar handlers/storage:', error)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function renderHtmlSnapshotOffscreen(args: RenderHtmlSnapshotArgs): Promise<{ buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' }> {
  const width = Math.max(128, Math.min(4096, Math.floor(args.width)))
  const height = Math.max(128, Math.min(4096, Math.floor(args.height)))
  const mimeType: 'image/jpeg' | 'image/png' = args.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
  const jpegQuality = Math.max(30, Math.min(100, Math.floor(args.quality ?? 92)))
  let tempHtmlPath: string | null = null

  const worker = new BrowserWindow({
    width,
    height,
    show: false,
    paintWhenInitiallyHidden: true,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: false,
      spellcheck: false,
      images: true,
      javascript: true,
    },
  })
  worker.setContentSize(width, height)

  try {
    const tempFileName = `lagosta-snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
    tempHtmlPath = path.join(app.getPath('temp'), tempFileName)
    await fs.writeFile(tempHtmlPath, args.html, 'utf8')
    await worker.loadFile(tempHtmlPath)

    // Wait for web fonts/images with a conservative timeout to avoid hanging the queue.
    const snapshotDiagnostics = await worker.webContents.executeJavaScript(`
      (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const forceSnapshotLayout = () => {
          const app = document.getElementById('app');
          if (app) {
            app.style.setProperty('position', 'relative', 'important');
            app.style.setProperty('width', '${width}px', 'important');
            app.style.setProperty('height', '${height}px', 'important');
            app.style.setProperty('min-height', '${height}px', 'important');
            app.style.setProperty('max-height', '${height}px', 'important');
            app.style.setProperty('max-width', '${width}px', 'important');
            app.style.setProperty('overflow', 'hidden', 'important');
            app.style.setProperty('transform', 'none', 'important');
            app.style.setProperty('transform-origin', 'top left', 'important');
          }
          const preview = document.querySelector('.ig-preview-container');
          if (preview) {
            preview.style.setProperty('position', 'absolute', 'important');
            preview.style.setProperty('left', '0', 'important');
            preview.style.setProperty('top', '0', 'important');
            preview.style.setProperty('width', '${width}px', 'important');
            preview.style.setProperty('height', '${height}px', 'important');
            preview.style.setProperty('min-height', '${height}px', 'important');
            preview.style.setProperty('max-height', '${height}px', 'important');
            preview.style.setProperty('max-width', '${width}px', 'important');
            preview.style.setProperty('aspect-ratio', 'auto', 'important');
            preview.style.setProperty('overflow', 'hidden', 'important');
            preview.style.setProperty('transform', 'none', 'important');
            preview.style.setProperty('transform-origin', 'top left', 'important');
          }
        };
        const waitFonts = async () => {
          if (!document.fonts || !document.fonts.ready) return;
          try {
            await Promise.race([document.fonts.ready, wait(1800)]);
          } catch {}
        };
        const waitImages = async () => {
          const imgs = Array.from(document.images || []);
          if (imgs.length === 0) return;
          await Promise.race([
            Promise.all(
              imgs.map((img) => {
                if (img.complete) return Promise.resolve();
                return new Promise((resolve) => {
                  img.addEventListener('load', () => resolve(), { once: true });
                  img.addEventListener('error', () => resolve(), { once: true });
                });
              })
            ),
            wait(7000),
          ]);
        };
        const waitPrimaryImage = async () => {
          const bg = document.querySelector('img.ig-bg-photo');
          if (!bg) return;
          if (bg.complete && bg.naturalWidth > 0 && bg.naturalHeight > 0) return;
          await Promise.race([
            new Promise((resolve) => {
              bg.addEventListener('load', () => resolve(), { once: true });
              bg.addEventListener('error', () => resolve(), { once: true });
            }),
            wait(7000),
          ]);
        };
        forceSnapshotLayout();
        await wait(30);
        await waitFonts();
        await waitImages();
        await waitPrimaryImage();
        forceSnapshotLayout();
        await wait(220);

        const bg = document.querySelector('img.ig-bg-photo');
        const logo = document.querySelector('img.ig-logo, img.ig-logo-feed');
        const preview = document.querySelector('.ig-preview-container');
        const rect = preview ? preview.getBoundingClientRect() : null;
        return {
          devicePixelRatio: window.devicePixelRatio || 1,
          imageCount: Array.from(document.images || []).length,
          bgLoaded: !!(bg && bg.naturalWidth > 0 && bg.naturalHeight > 0),
          bgNaturalWidth: bg ? bg.naturalWidth : 0,
          bgNaturalHeight: bg ? bg.naturalHeight : 0,
          logoLoaded: !!(logo && logo.naturalWidth > 0 && logo.naturalHeight > 0),
          previewRect: rect ? {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          } : null,
        };
      })();
    `, true)
    console.log('[HTML Snapshot] Diagnostics:', snapshotDiagnostics)
    await new Promise<void>((resolve) => setTimeout(resolve, 120))

    const snapshot = await worker.webContents.capturePage({ x: 0, y: 0, width, height })
    const capturedPngBuffer = snapshot.toPNG()
    let buffer: Buffer

    try {
      const sharp = (await import('sharp')).default
      const capturedMeta = await sharp(capturedPngBuffer).metadata()
      const capturedWidth = capturedMeta.width || width
      const capturedHeight = capturedMeta.height || height
      const needsNormalization = capturedWidth !== width || capturedHeight !== height
      console.log(
        '[HTML Snapshot] Captured PNG buffer:',
        capturedPngBuffer.length,
        'bytes',
        `${capturedWidth}x${capturedHeight}`,
      )

      const normalizedPngBuffer = needsNormalization
        ? await sharp(capturedPngBuffer)
            .resize(width, height, { fit: 'fill' })
            .png()
            .toBuffer()
        : capturedPngBuffer

      if (needsNormalization) {
        console.log('[HTML Snapshot] Normalized PNG buffer:', normalizedPngBuffer.length, 'bytes', `${width}x${height}`)
      }

      if (mimeType === 'image/png') {
        buffer = normalizedPngBuffer
      } else {
        buffer = await sharp(normalizedPngBuffer).jpeg({
          quality: jpegQuality,
          chromaSubsampling: '4:4:4',
        }).toBuffer()
      }
    } catch (error) {
      console.warn('[HTML Snapshot] Sharp normalization/conversion failed, fallback to nativeImage:', error)
      console.log('[HTML Snapshot] Captured PNG buffer:', capturedPngBuffer.length, 'bytes', `${width}x${height}`)
      buffer = mimeType === 'image/png' ? capturedPngBuffer : snapshot.toJPEG(jpegQuality)
    }
    console.log('[HTML Snapshot] Final buffer:', buffer.length, 'bytes', mimeType, `${width}x${height}`)

    return { buffer, mimeType }
  } finally {
    if (tempHtmlPath) {
      await fs.unlink(tempHtmlPath).catch(() => undefined)
    }
    if (!worker.isDestroyed()) {
      worker.destroy()
    }
  }
}

// IPC Handlers - Authentication
ipcMain.handle('auth:login', async () => {
  return new Promise<{ success: boolean; cookies?: string; error?: string }>(async (resolve) => {
    let isResolved = false
    let timeoutId: NodeJS.Timeout | null = null

    // Clear existing Clerk/session cookies to force a fresh handshake
    try {
      const existingCookies = await session.defaultSession.cookies.get({
        url: 'https://studio-lagosta-v2.vercel.app'
      })
      console.log('[Auth] Clearing existing cookies:', existingCookies.map(c => c.name).join(', '))
      for (const cookie of existingCookies) {
        await session.defaultSession.cookies.remove('https://studio-lagosta-v2.vercel.app', cookie.name)
      }
    } catch (e) {
      console.error('[Auth] Error clearing cookies:', e)
    }

    const loginWindow = new BrowserWindow({
      width: 800,
      height: 700,
      titleBarStyle: 'default',
      backgroundColor: '#0a0a0a',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    const loginUrl = 'https://studio-lagosta-v2.vercel.app/sign-in?redirect_url=/studio'
    console.log('[Auth] Opening login window:', loginUrl)
    loginWindow.loadURL(loginUrl)
    
    // Track navigation to extract token from handshake URL
    loginWindow.webContents.on('will-redirect', async (_event, url) => {
      console.log('[Auth] will-redirect:', url.substring(0, 100))
      
      // Extract __clerk_handshake JWT from URL
      const handshakeMatch = url.match(/__clerk_handshake=([^&]+)/)
      if (handshakeMatch) {
        const handshakeJwt = handshakeMatch[1]
        console.log('[Auth] Found __clerk_handshake JWT')
        
        try {
          // Decode the handshake JWT payload (base64)
          const parts = handshakeJwt.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
            console.log('[Auth] Handshake payload:', JSON.stringify(payload, null, 2).substring(0, 800))
            
            // Check if this handshake has an actual session (not just dev browser setup)
            const hasRealSession = payload.handshake?.some((c: string) => 
              (c.startsWith('__session=') || c.startsWith('__session_')) && 
              !c.includes('Expires=Thu, 01 Jan 1970') &&
              (c.match(/^__session[^=]*=([^;]+)/)?.[1]?.length ?? 0) > 5
            )
            
            if (!hasRealSession) {
              console.log('[Auth] Handshake has no real session - injecting only __clerk_db_jwt for dev browser')
              // Only inject __clerk_db_jwt, skip __client_uat=0 which causes loops
              const dbJwtEntry = payload.handshake?.find((c: string) => c.startsWith('__clerk_db_jwt='))
              if (dbJwtEntry) {
                const match = dbJwtEntry.match(/^([^=]+)=([^;]+)/)
                if (match) {
                  await session.defaultSession.cookies.set({
                    url: 'https://studio-lagosta-v2.vercel.app',
                    name: match[1].trim(),
                    value: match[2].trim(),
                    secure: true,
                    sameSite: 'no_restriction',
                  })
                  console.log('[Auth] Set __clerk_db_jwt for dev browser')
                }
              }
              return
            }
            
            console.log('[Auth] Handshake has real session - injecting all cookies')
            // The handshake contains cookies in the 'handshake' array
            if (payload.handshake && Array.isArray(payload.handshake)) {
              // Parse Set-Cookie style strings and inject into Electron session
              for (const cookieStr of payload.handshake) {
                // Parse full Set-Cookie string
                const nameValueMatch = cookieStr.match(/^([^=]+)=([^;]*)/)
                if (!nameValueMatch) continue
                
                const name = nameValueMatch[1].trim()
                const value = nameValueMatch[2].trim()
                
                // Skip cookies being cleared (empty value or Expires=1970)
                if (!value || cookieStr.includes('Expires=Thu, 01 Jan 1970')) {
                  console.log('[Auth] Skipping cleared cookie:', name)
                  continue
                }
                
                // Extract Max-Age or Expires
                const maxAgeMatch = cookieStr.match(/Max-Age=(\d+)/i)
                const expirationDate = maxAgeMatch 
                  ? (Date.now() / 1000) + parseInt(maxAgeMatch[1])
                  : undefined
                
                // Inject cookie into Electron session
                try {
                  await session.defaultSession.cookies.set({
                    url: 'https://studio-lagosta-v2.vercel.app',
                    name,
                    value,
                    secure: true,
                    sameSite: 'no_restriction',
                    expirationDate,
                  })
                  console.log('[Auth] Set cookie in session:', name, '=', value.substring(0, 20) + '...')
                } catch (e) {
                  console.error('[Auth] Error setting cookie:', name, e)
                }
              }
            }
          }
        } catch (e) {
          console.error('[Auth] Error decoding handshake:', e)
        }
      }
    })

    // Helper function to check if login is successful
    const checkLoginSuccess = async (url: string) => {
      console.log('[Auth] Navigation detected:', url.substring(0, 100))
      
      // Must be on vercel domain, path /studio, NOT /sign-in
      let parsedUrl: URL
      try { parsedUrl = new URL(url) } catch { return }
      
      const isVercelDomain = parsedUrl.hostname === 'studio-lagosta-v2.vercel.app'
      const isStudioPath = parsedUrl.pathname.startsWith('/studio')
      const isSignInPage = parsedUrl.pathname.startsWith('/sign-in')
      
      if (!isVercelDomain || !isStudioPath || isSignInPage) return
      
      console.log('[Auth] Reached /studio page, checking session cookies...')
      
      try {
        // Get cookies from vercel domain
        const vercelCookies = await session.defaultSession.cookies.get({
          url: 'https://studio-lagosta-v2.vercel.app'
        })

        console.log('[Auth] Cookie names:', vercelCookies.map(c => c.name).join(', '))

        const sessionCookie = pickBestSessionCookie(vercelCookies, 20)
        const dbJwtCookie = vercelCookies.find(c => c.name === '__clerk_db_jwt')
        const clientUatCookie = vercelCookies.find(c => c.name === '__client_uat' || c.name.startsWith('__client_uat_'))
        
        console.log('[Auth] __session:', sessionCookie ? `${sessionCookie.name}=${sessionCookie.value.substring(0, 30)}...` : 'NOT FOUND')
        console.log('[Auth] __clerk_db_jwt:', dbJwtCookie?.value ? dbJwtCookie.value.substring(0, 20) + '...' : 'NOT FOUND')
        console.log('[Auth] __client_uat:', clientUatCookie ? `${clientUatCookie.name}=${clientUatCookie.value}` : 'NOT FOUND')
        
        // Login is only valid when __session JWT exists and is not near expiry.
        if (!sessionCookie) {
          console.warn('[Auth] __session not valid yet - waiting...')
          return
        }
        
        // Format cookies as string for HTTP header
        const cookieString = vercelCookies
          .map(cookie => `${cookie.name}=${cookie.value}`)
          .join('; ')

        console.log('[Auth] Saving cookies:', cookieString.substring(0, 200) + '...')
        saveCookies(cookieString)

        if (!isResolved) {
          isResolved = true
          if (timeoutId) clearTimeout(timeoutId)
          loginWindow.close()
          resolve({ success: true, cookies: cookieString })
        }
      } catch (error) {
        console.error('[Auth] Error capturing cookies:', error)
        if (!isResolved) {
          isResolved = true
          if (timeoutId) clearTimeout(timeoutId)
          loginWindow.close()
          resolve({ success: false, error: 'Erro ao capturar cookies' })
        }
      }
    }

    // Monitor navigation events (only final navigations, not redirects)
    loginWindow.webContents.on('did-navigate', async (_event, url) => {
      await checkLoginSuccess(url)
    })

    loginWindow.webContents.on('did-redirect-navigation', async (_event, url) => {
      await checkLoginSuccess(url)
    })

    // Also check after page finishes loading (catches SPA navigations)
    loginWindow.webContents.on('did-finish-load', async () => {
      const url = loginWindow.webContents.getURL()
      await checkLoginSuccess(url)
    })

    loginWindow.webContents.on('did-frame-navigate', async (_event, url) => {
      await checkLoginSuccess(url)
    })

    // Watch for session cookie changes - fires when Clerk sets cookies after login
    const cookieChangedHandler = async (_event: Electron.Event, cookie: Electron.Cookie, _cause: string, removed: boolean) => {
      if (removed) return
      if (!cookie.domain?.includes('studio-lagosta-v2.vercel.app')) return
      
      const isSessionCookie = cookie.name === '__session' || cookie.name.startsWith('__session_')
      if (!isSessionCookie) return
      if (!cookie.value || cookie.value.length < 20) return
      
      console.log('[Auth] Cookie changed:', cookie.name, '=', cookie.value.substring(0, 30) + '...')
      
      if (isResolved) return
      
      // Give a tiny delay for all cookies to be set
      setTimeout(async () => {
        if (isResolved) return
        
        const vercelCookies = await session.defaultSession.cookies.get({
          url: 'https://studio-lagosta-v2.vercel.app'
        })
        
        const sessionCookie = pickBestSessionCookie(vercelCookies, 20)
        if (!sessionCookie) {
          console.log('[Auth] Cookie changed but __session is not valid yet')
          return
        }
        
        const cookieString = vercelCookies
          .map(c => `${c.name}=${c.value}`)
          .join('; ')
        
        console.log('[Auth] Session confirmed via cookie change! Saving and closing.')
        console.log('[Auth] Cookies:', cookieString.substring(0, 200) + '...')
        saveCookies(cookieString)
        
        isResolved = true
        if (timeoutId) clearTimeout(timeoutId)
        session.defaultSession.cookies.removeListener('changed', cookieChangedHandler)
        loginWindow.close()
        resolve({ success: true, cookies: cookieString })
      }, 500)
    }
    
    session.defaultSession.cookies.on('changed', cookieChangedHandler)

    // Timeout after 120 seconds
    timeoutId = setTimeout(() => {
      console.log('[Auth] Login timeout after 120 seconds')
      if (!isResolved) {
        isResolved = true
        session.defaultSession.cookies.removeListener('changed', cookieChangedHandler)
        loginWindow.close()
        resolve({ success: false, error: 'Tempo de login expirado. Tente novamente.' })
      }
    }, 120000)

    // Handle window closed without login
    loginWindow.on('closed', () => {
      console.log('[Auth] Login window closed')
      session.defaultSession.cookies.removeListener('changed', cookieChangedHandler)
      if (!isResolved) {
        isResolved = true
        if (timeoutId) clearTimeout(timeoutId)
        resolve({ success: false, error: 'Login cancelado' })
      }
    })
  })
})

ipcMain.handle('auth:get-cookies', async () => {
  return getCookies()
})

ipcMain.handle('auth:logout', async () => {
  try {
    // Clear stored cookies
    clearCookies()
    
    // Clear cookies from Electron session
    await session.defaultSession.clearStorageData({
      storages: ['cookies']
    })
    
    return { success: true }
  } catch (error) {
    console.error('Error during logout:', error)
    return { success: false, error: 'Erro ao fazer logout' }
  }
})

ipcMain.handle('auth:is-encryption-available', () => {
  return safeStorage.isEncryptionAvailable()
})

// Get fresh cookies from Electron session (auto-refreshed by Clerk) or fallback to stored
async function getFreshCookies(): Promise<string | null> {
  try {
    const sessionCookies = await session.defaultSession.cookies.get({
      url: 'https://studio-lagosta-v2.vercel.app'
    })
    
    if (sessionCookies.length === 0) {
      console.log('[Cookies] No session cookies found, using stored cookies')
      return getCookies()
    }
    
    const storedCookies = getCookies()

    // Check if __session is still valid (not expired)
    const sessionCookie = pickBestSessionCookie(sessionCookies, 20)
    const clientUat = sessionCookies.find(c => (c.name === '__client_uat' || c.name.startsWith('__client_uat_')) && c.value !== '0')
    const dbJwt = sessionCookies.find(c => c.name === '__clerk_db_jwt' || c.name.startsWith('__clerk_db_jwt_'))

    if (sessionCookie) {
      const cookieString = sessionCookies.map(c => `${c.name}=${c.value}`).join('; ')
      saveCookies(cookieString)
      return cookieString
    }

    if (hasValidSessionInCookieHeader(storedCookies, 20)) {
      console.log('[Cookies] Using valid stored __session fallback')
      return storedCookies
    }
    
    // If session expired but we have __clerk_db_jwt, try to refresh
    if (dbJwt || clientUat) {
      console.log('[Cookies] Session expired - triggering Clerk refresh via hidden window...')
      const refreshed = await refreshClerkSession()
      
      if (refreshed) {
        // Re-read fresh cookies after refresh
        const freshCookies = await session.defaultSession.cookies.get({
          url: 'https://studio-lagosta-v2.vercel.app'
        })
        const freshSession = pickBestSessionCookie(freshCookies, 20)
        if (!freshSession) {
          console.log('[Cookies] Refresh returned cookies but __session is not valid')
          return hasValidSessionInCookieHeader(storedCookies, 20) ? storedCookies : null
        }
        const freshString = freshCookies.map(c => `${c.name}=${c.value}`).join('; ')
        saveCookies(freshString)
        return freshString
      }
      
      console.log('[Cookies] Refresh failed - no valid session available')
    }

    return hasValidSessionInCookieHeader(storedCookies, 20) ? storedCookies : null
  } catch (e) {
    console.error('[Cookies] Error getting session cookies:', e)
    const fallback = getCookies()
    return hasValidSessionInCookieHeader(fallback, 20) ? fallback : null
  }
}

// Helper: build headers with cookies and Bearer token
function buildAuthHeaders(cookies: string | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (!cookies) return headers
  headers['Cookie'] = cookies
  return headers
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function clampVariations(value: unknown): VariationCount {
  if (value === 2 || value === 4) return value
  return 1
}

function normalizeArtFormat(value: unknown): ArtFormat {
  if (value === 'FEED_PORTRAIT' || value === 'SQUARE') return value
  return 'STORY'
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizeTitle(value: unknown): string {
  return normalizeText(
    typeof value === 'string'
      ? value
        .replace(/<br\s*\/?>/gi, '<br>')
        .replace(/\s*<br>\s*/g, '<br>')
      : '',
    160
  )
}

function buildFallbackVariation(prompt: string): GenerateAiTextVariation {
  const compactPrompt = prompt.replace(/\s+/g, ' ').trim()
  const titleSeed = compactPrompt
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
    .toUpperCase()

  const title = normalizeTitle(titleSeed || 'OFERTA ESPECIAL')

  return {
    pre_title: '',
    title,
    description: compactPrompt.slice(0, 220),
    cta: 'SAIBA MAIS',
    badge: '',
    footer_info_1: '',
    footer_info_2: '',
  }
}

function normalizeGenerateAiTextPayload(input: unknown): GenerateAiTextPayload {
  const raw = asObject(input)

  const projectId = Number(raw.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error('projectId invalido para generate-ai-text')
  }

  const prompt = normalizeText(raw.prompt, 500)
  if (!prompt) {
    throw new Error('prompt obrigatorio para generate-ai-text')
  }

  const format = normalizeArtFormat(raw.format)
  const variations = clampVariations(raw.variations)
  const templateIds = Array.isArray(raw.templateIds)
    ? raw.templateIds
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 3)
    : undefined
  const includeLogo = raw.includeLogo !== false
  const usePhoto = raw.usePhoto !== false
  const photoUrl = isHttpUrl(String(raw.photoUrl || '')) ? String(raw.photoUrl) : undefined
  const compositionEnabled = raw.compositionEnabled === true
  const compositionPrompt = normalizeText(raw.compositionPrompt, 500) || undefined
  const analyzeImageForContext = raw.analyzeImageForContext === true
  const analysisImageUrl = isHttpUrl(String(raw.analysisImageUrl || ''))
    ? String(raw.analysisImageUrl)
    : undefined

  const refs = Array.isArray(raw.compositionReferenceUrls)
    ? raw.compositionReferenceUrls
      .filter((value): value is string => typeof value === 'string' && isHttpUrl(value))
      .slice(0, MAX_REFERENCE_IMAGES)
    : undefined

  if (usePhoto && !photoUrl) {
    throw new Error('photoUrl obrigatoria quando usePhoto=true')
  }

  return {
    projectId,
    prompt,
    format,
    variations,
    templateIds,
    includeLogo,
    usePhoto,
    photoUrl,
    compositionEnabled,
    compositionPrompt,
    compositionReferenceUrls: refs,
    analyzeImageForContext,
    analysisImageUrl,
  }
}

function normalizeGenerateAiTextResponse(
  rawData: unknown,
  expectedVariations: VariationCount,
  prompt: string,
): GenerateAiTextResponse {
  const raw = asObject(rawData)
  const rawVariations = Array.isArray(raw.variacoes) ? raw.variacoes : []

  const normalized = rawVariations
    .map((variation) => {
      const item = asObject(variation)
      return {
        pre_title: normalizeText(item.pre_title, 80),
        title: normalizeTitle(item.title),
        description: normalizeText(item.description, 240),
        cta: normalizeText(item.cta, 90),
        badge: normalizeText(item.badge, 90),
        footer_info_1: normalizeText(item.footer_info_1, 120),
        footer_info_2: normalizeText(item.footer_info_2, 120),
      } satisfies GenerateAiTextVariation
    })
    .filter((item) => item.title || item.description || item.cta)

  const safe = normalized.length > 0 ? normalized : [buildFallbackVariation(prompt)]
  const variacoes: GenerateAiTextVariation[] = []
  for (let i = 0; i < expectedVariations; i++) {
    const source = safe[Math.min(i, safe.length - 1)]
    variacoes.push({
      ...source,
      title: source.title || safe[0].title,
      cta: source.cta || 'SAIBA MAIS',
    })
  }

  const rawKnowledge = asObject(raw.knowledge)
  const rawImageAnalysis = asObject(raw.imageAnalysis)
  const knowledgeHits = Array.isArray(rawKnowledge.hits)
    ? rawKnowledge.hits
      .map((hit) => {
        const item = asObject(hit)
        const entryId = normalizeText(item.entryId, 120)
        const title = normalizeText(item.title, 200)
        const category = normalizeText(item.category, 80)
        const content = normalizeText(item.content, 1200)
        const score = typeof item.score === 'number' && Number.isFinite(item.score)
          ? Number(item.score)
          : 0
        const source = item.source === 'fallback-db' ? 'fallback-db' : 'rag'

        if (!entryId || !title || !category || !content) {
          return null
        }

        return {
          entryId,
          title,
          category,
          content,
          score,
          source,
        } satisfies GenerateAiTextKnowledgeHit
      })
      .filter((hit): hit is GenerateAiTextKnowledgeHit => hit !== null)
    : []

  const categoriesUsed = Array.isArray(rawKnowledge.categoriesUsed)
    ? rawKnowledge.categoriesUsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 8)
    : []

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 8)
    : []

  const conflicts = Array.isArray(raw.conflicts)
    ? raw.conflicts
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 8)
    : []

  const matchedKnowledgeRaw = asObject(rawImageAnalysis.matchedKnowledge)
  const matchedKnowledgeEntryId = normalizeText(matchedKnowledgeRaw.entryId, 120)
  const matchedKnowledgeTitle = normalizeText(matchedKnowledgeRaw.title, 200)
  const matchedKnowledgeCategory =
    matchedKnowledgeRaw.category === 'CARDAPIO' || matchedKnowledgeRaw.category === 'CAMPANHAS'
      ? matchedKnowledgeRaw.category
      : undefined
  const matchedKnowledgeReason = normalizeText(matchedKnowledgeRaw.reason, 320)
  const imageAnalysisWarnings = Array.isArray(rawImageAnalysis.warnings)
    ? rawImageAnalysis.warnings
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 6)
    : []

  const imageAnalysis: GenerateAiTextImageAnalysis = {
    requested: rawImageAnalysis.requested === true,
    applied: rawImageAnalysis.applied === true,
    sourceImageUrl: normalizeText(rawImageAnalysis.sourceImageUrl, 4_000) || undefined,
    summary: normalizeText(rawImageAnalysis.summary, 400),
    sceneType: normalizeText(rawImageAnalysis.sceneType, 120),
    confidence:
      typeof rawImageAnalysis.confidence === 'number' && Number.isFinite(rawImageAnalysis.confidence)
        ? Math.max(0, Math.min(1, rawImageAnalysis.confidence))
        : 0,
    dishNameCandidates: Array.isArray(rawImageAnalysis.dishNameCandidates)
      ? rawImageAnalysis.dishNameCandidates
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .slice(0, 5)
      : [],
    ingredientsHints: Array.isArray(rawImageAnalysis.ingredientsHints)
      ? rawImageAnalysis.ingredientsHints
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .slice(0, 8)
      : [],
    matchedKnowledge:
      matchedKnowledgeEntryId &&
      matchedKnowledgeTitle &&
      matchedKnowledgeCategory &&
      matchedKnowledgeReason
        ? {
            entryId: matchedKnowledgeEntryId,
            title: matchedKnowledgeTitle,
            category: matchedKnowledgeCategory,
            score:
              typeof matchedKnowledgeRaw.score === 'number' && Number.isFinite(matchedKnowledgeRaw.score)
                ? Math.max(0, Math.min(1, matchedKnowledgeRaw.score))
                : 0,
            reason: matchedKnowledgeReason,
          }
        : undefined,
    warnings: imageAnalysisWarnings,
  }

  return {
    variacoes,
    knowledge: {
      applied: rawKnowledge.applied === true || knowledgeHits.length > 0,
      context: normalizeText(rawKnowledge.context, 4_000),
      categoriesUsed,
      hits: knowledgeHits,
    },
    imageAnalysis,
    warnings,
    conflicts,
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }
  const raw = asObject(payload)
  if (typeof raw.error === 'string' && raw.error.trim()) return raw.error.trim()
  if (typeof raw.message === 'string' && raw.message.trim()) return raw.message.trim()
  if (typeof raw.debug === 'string' && raw.debug.trim()) return raw.debug.trim()
  return fallback
}

// Helper: execute fetch and parse response
async function executeRequest(url: string, options: RequestInit, cookies: string | null) {
  const headers = buildAuthHeaders(cookies, options.headers as Record<string, string>)
  console.log('[API] Request:', options.method || 'GET', url)
  console.log('[API] Cookie + Bearer:', cookies ? 'YES' : 'NO')

  const response = await fetch(url, { ...options, headers, redirect: 'follow' })
  console.log('[API] Response status:', response.status, response.statusText)
  console.log('[API] Response URL:', response.url)

  const text = await response.text()
  console.log('[API] Response body (first 200):', text.substring(0, 200))

  const isHtml = text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')
  return {
    isHtml,
    text,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    responseUrl: response.url,
    requestUrl: url,
  }
}

function isAuthHtmlResponse(result: {
  isHtml: boolean
  text: string
  status: number
  responseUrl?: string
}): boolean {
  if (!result.isHtml) return false

  const urlLower = (result.responseUrl || '').toLowerCase()
  if (urlLower.includes('/sign-in') || urlLower.includes('__clerk') || urlLower.includes('/handshake')) {
    return true
  }

  const textPreview = result.text.slice(0, 800).toLowerCase()
  if (textPreview.includes('clerk') && (textPreview.includes('sign in') || textPreview.includes('sign-in'))) {
    return true
  }

  // Next error pages for missing API routes should NOT be treated as auth expiry
  if (result.status === 404 && textPreview.includes('__next_error__')) {
    return false
  }

  // 401/403 HTML is usually auth middleware response (even without explicit Clerk markers)
  if (result.status === 401 || result.status === 403) {
    return true
  }

  return false
}

// IPC Handlers - API Requests (to bypass CORS)
ipcMain.handle('api:request', async (_event, url: string, options: RequestInit) => {
  // First attempt with current cookies
  let cookies = await getFreshCookies()
  let result = await executeRequest(url, options, cookies)

  // If HTML and it looks like auth/session issue, try refresh once and retry
  if (result.isHtml && isAuthHtmlResponse(result)) {
    console.log('[API] Got HTML - attempting session refresh then retry...')
    const refreshed = await refreshClerkSession()
    if (refreshed) {
      cookies = await getFreshCookies()
      result = await executeRequest(url, options, cookies)
    }
  }

  if (result.isHtml && isAuthHtmlResponse(result)) {
    console.log('[API] Still HTML after refresh - session truly expired')
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Sessão expirada. Por favor, faça login novamente.' },
    }
  }

  // HTML can also mean missing endpoint (404) or server rendering error.
  // In these cases, preserve original status and do not force logout.
  if (result.isHtml) {
    console.log('[API] HTML response is not auth-related, returning original status:', result.status)
    return {
      ok: false,
      status: result.status,
      statusText: result.statusText,
      data: {
        error: `Resposta HTML inesperada da API (${result.status})`,
        requestUrl: url,
        responseUrl: result.responseUrl,
      },
    }
  }

  let data
  try { data = JSON.parse(result.text) } catch { data = result.text }

  return { ok: result.ok, status: result.status, statusText: result.statusText, data }
})

// IPC Handler - Structured AI text generation for art automation
ipcMain.handle('generate-ai-text', async (_event, payload: unknown) => {
  const normalizedPayload = normalizeGenerateAiTextPayload(payload)
  const endpoint = `${WEB_APP_BASE_URL}/api/tools/generate-ai-text`

  let cookies = await getFreshCookies()
  let result = await executeRequest(
    endpoint,
    {
      method: 'POST',
      body: JSON.stringify(normalizedPayload),
    },
    cookies
  )

  if (result.isHtml && isAuthHtmlResponse(result)) {
    console.log('[generate-ai-text] Got HTML - attempting session refresh then retry...')
    const refreshed = await refreshClerkSession()
    if (refreshed) {
      cookies = await getFreshCookies()
      result = await executeRequest(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(normalizedPayload),
        },
        cookies
      )
    }
  }

  if (result.isHtml && isAuthHtmlResponse(result)) {
    throw new Error('Sessao expirada. Faca login novamente.')
  }

  if (result.isHtml) {
    if (result.status === 404) {
      console.warn('[generate-ai-text] Endpoint not found (404). Using local fallback copy.')
      return normalizeGenerateAiTextResponse(
        {},
        normalizedPayload.variations,
        normalizedPayload.prompt,
      )
    }
    throw new Error(`Servico de copy indisponivel no momento (HTTP ${result.status})`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.text)
  } catch {
    throw new Error('Resposta invalida em generate-ai-text')
  }

  if (!result.ok) {
    if (result.status === 404) {
      console.warn('[generate-ai-text] Endpoint returned 404 JSON. Using local fallback copy.')
      return normalizeGenerateAiTextResponse(
        parsed,
        normalizedPayload.variations,
        normalizedPayload.prompt,
      )
    }
    throw new Error(
      extractErrorMessage(
        parsed,
        `Falha ao gerar copy da arte (${result.status} ${result.statusText})`
      )
    )
  }

  return normalizeGenerateAiTextResponse(
    parsed,
    normalizedPayload.variations,
    normalizedPayload.prompt,
  )
})

// IPC Handler - Download Blob (for binary data like images)
ipcMain.handle('blob:download', async (_event, url: string) => {
  try {
    // Handle base64 data URLs directly (e.g. from Gemini API)
    if (url.startsWith('data:')) {
      console.log('[Blob Download] Processing data URL...')
      const matches = url.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) {
        return { ok: false, status: 0, error: 'Invalid data URL format' }
      }
      const contentType = matches[1]
      const base64Data = matches[2]
      const buffer = Buffer.from(base64Data, 'base64')
      console.log('[Blob Download] Data URL decoded, size:', buffer.byteLength)
      return {
        ok: true,
        status: 200,
        buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        contentType,
      }
    }

    const cookies = await getFreshCookies()
    
    console.log('[Blob Download] Downloading:', url)
    
    const response = await net.fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookies || '',
      },
    })
    
    if (!response.ok) {
      console.error('[Blob Download] Failed:', response.status, response.statusText)
      return { ok: false, status: response.status, error: response.statusText }
    }
    
    // Get the response as ArrayBuffer
    const arrayBuffer = await response.arrayBuffer()
    console.log('[Blob Download] Success, size:', arrayBuffer.byteLength)
    
    return { 
      ok: true, 
      status: response.status,
      buffer: arrayBuffer,
      contentType: response.headers.get('content-type') || 'application/octet-stream'
    }
  } catch (error) {
    console.error('[Blob Download] Error:', error)
    return { ok: false, status: 0, error: String(error) }
  }
})

// IPC Handlers - File Upload (to bypass CORS)
ipcMain.handle('file:upload', async (_event, url: string, fileData: { name: string; type: string; buffer: ArrayBuffer }, fields: Record<string, string>) => {
  try {
    let cookies = await getFreshCookies()
    
    // IMMEDIATELY clone the ArrayBuffer to prevent "detached ArrayBuffer" error
    // The buffer can be detached after async operations, so we copy it right away
    const bufferClone = Buffer.from(new Uint8Array(fileData.buffer))
    
    console.log('[Upload] Uploading file to:', url)
    console.log('[Upload] File:', fileData.name, 'Size:', bufferClone.length, 'Type:', fileData.type)
    
    // Build multipart/form-data body manually to ensure proper formatting
    const boundary = `----ElectronFormBoundary${Date.now().toString(36)}`
    const chunks: Buffer[] = []
    
    // Add file field
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileData.name}"\r\n`))
    chunks.push(Buffer.from(`Content-Type: ${fileData.type}\r\n\r\n`))
    chunks.push(bufferClone)
    chunks.push(Buffer.from('\r\n'))
    
    // Add additional fields
    Object.entries(fields).forEach(([key, value]) => {
      chunks.push(Buffer.from(`--${boundary}\r\n`))
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`))
      chunks.push(Buffer.from(value))
      chunks.push(Buffer.from('\r\n'))
    })
    
    // End boundary
    chunks.push(Buffer.from(`--${boundary}--\r\n`))
    
    const body = Buffer.concat(chunks)
    
    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }
    
    if (cookies) {
      headers['Cookie'] = cookies
    }
    
    console.log('[Upload] Headers:', Object.keys(headers))
    console.log('[Upload] Body size:', body.length, 'bytes')
    
    const doUploadAttempt = async (cookieHeader: string | null) => {
      const attemptHeaders: Record<string, string> = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      }
      if (cookieHeader) {
        attemptHeaders['Cookie'] = cookieHeader
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: attemptHeaders,
        body: Buffer.from(body),
        redirect: 'manual',
      })

      // Handle redirects manually to avoid detached ArrayBuffer issue
      let finalResponse = response
      if (response.status >= 300 && response.status < 400) {
        const redirectUrl = response.headers.get('location')
        if (redirectUrl) {
          console.log('[Upload] Following redirect to:', redirectUrl)
          const resolvedUrl = new URL(redirectUrl, url).href
          finalResponse = await fetch(resolvedUrl, {
            method: 'POST',
            headers: attemptHeaders,
            body: Buffer.from(body),
            redirect: 'follow',
          })
        }
      }

      const text = await finalResponse.text()
      const isHtml = text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')

      return {
        finalResponse,
        text,
        isHtml,
      }
    }

    let { finalResponse, text, isHtml } = await doUploadAttempt(cookies)
    const firstAttemptAuthHtml = isHtml && isAuthHtmlResponse({
      isHtml,
      text,
      status: finalResponse.status,
      responseUrl: finalResponse.url,
    })

    if (firstAttemptAuthHtml) {
      console.log('[Upload] Auth HTML detected - refreshing session and retrying once...')
      const refreshed = await refreshClerkSession()
      if (refreshed) {
        cookies = await getFreshCookies()
      }
      const retry = await doUploadAttempt(cookies)
      finalResponse = retry.finalResponse
      text = retry.text
      isHtml = retry.isHtml
    }
    
    console.log('[Upload] Response status:', finalResponse.status)

    // Detect HTML responses
    if (isHtml && isAuthHtmlResponse({
      isHtml,
      text,
      status: finalResponse.status,
      responseUrl: finalResponse.url,
    })) {
      console.log('[Upload] Received auth HTML response - session expired')
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        data: { error: 'Sessão expirada. Por favor, faça login novamente.' },
      }
    }

    if (isHtml) {
      console.log('[Upload] Received non-auth HTML response, preserving status:', finalResponse.status)
      return {
        ok: false,
        status: finalResponse.status,
        statusText: finalResponse.statusText,
        data: {
          error: `Resposta HTML inesperada da API (${finalResponse.status})`,
          responseUrl: finalResponse.url,
        },
      }
    }
    
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    if (!finalResponse.ok) {
      console.log('[Upload] Error response body (first 500):', text.substring(0, 500))
    }
    
    return {
      ok: finalResponse.ok,
      status: finalResponse.status,
      statusText: finalResponse.statusText,
      data,
    }
  } catch (error) {
    console.error('[Upload] Error during upload:', error)
    throw error
  }
})

// IPC Handlers - Image Processing
ipcMain.handle('image:process', async (_event, buffer: ArrayBuffer, postType: string, cropRegion?: { left: number; top: number; width: number; height: number }) => {
  return processImage(Buffer.from(buffer), postType, cropRegion)
})

// IPC Handler - Logo Overlay
ipcMain.handle('image:overlay-logo', async (
  _event,
  imageBuffer: ArrayBuffer,
  logoUrl: string,
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
  sizePct: number
) => {
  try {
    const sharp = (await import('sharp')).default
    
    // Download logo
    const logoResponse = await net.fetch(logoUrl)
    if (!logoResponse.ok) {
      throw new Error('Failed to download logo')
    }
    const logoArrayBuffer = await logoResponse.arrayBuffer()
    const logoBuffer = Buffer.from(logoArrayBuffer)
    
    // Get base image dimensions
    const baseImage = sharp(Buffer.from(imageBuffer))
    const metadata = await baseImage.metadata()
    const imgWidth = metadata.width || 1080
    const imgHeight = metadata.height || 1350
    
    // Resize logo based on percentage of image width
    const logoWidth = Math.round(imgWidth * sizePct / 100)
    const resizedLogo = await sharp(logoBuffer)
      .resize({ width: logoWidth })
      .toBuffer()
    
    // Get resized logo dimensions
    const logoMeta = await sharp(resizedLogo).metadata()
    const logoHeight = logoMeta.height || logoWidth
    
    // Calculate position with margin
    const margin = 24
    let left: number
    let top: number
    
    switch (position) {
      case 'top-left':
        left = margin
        top = margin
        break
      case 'top-right':
        left = imgWidth - logoWidth - margin
        top = margin
        break
      case 'bottom-left':
        left = margin
        top = imgHeight - logoHeight - margin
        break
      case 'bottom-right':
      default:
        left = imgWidth - logoWidth - margin
        top = imgHeight - logoHeight - margin
        break
    }
    
    // Composite logo over image
    const result = await baseImage
      .composite([{
        input: resizedLogo,
        left: Math.max(0, left),
        top: Math.max(0, top),
      }])
      .jpeg({ quality: 90 })
      .toBuffer()
    
    return {
      ok: true,
      buffer: result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer,
    }
  } catch (error) {
    console.error('[Logo Overlay] Error:', error)
    return { ok: false, error: String(error) }
  }
})

// IPC Handler - Text Rendering (text + overlay + logo via Sharp SVG)
ipcMain.handle('image:render-text', async (_event, args: {
  imageBuffer: ArrayBuffer
  textLayout: any
  fonts: { title: string; body: string }
  fontUrls?: { title?: string; body?: string }
  logoUrl?: string
  logoPosition?: string
  logoSizePct?: number
}) => {
  try {
    // Debug: log fonts received
    console.log('[Render Text] fonts:', JSON.stringify(args.fonts))
    console.log('[Render Text] fontUrls:', JSON.stringify(args.fontUrls))

    // 1. Ensure fonts are cached locally
    const titlePath = await ensureFont(args.fonts.title, args.fontUrls?.title)
    const bodyPath = await ensureFont(args.fonts.body, args.fontUrls?.body)
    console.log('[Render Text] titlePath:', titlePath)
    console.log('[Render Text] bodyPath:', bodyPath)
    
    const titleBase64 = await getFontBase64(titlePath)
    const bodyBase64 = await getFontBase64(bodyPath)
    console.log('[Render Text] titleBase64 length:', titleBase64?.length || 0)
    console.log('[Render Text] bodyBase64 length:', bodyBase64?.length || 0)

    // 2. Download logo if provided
    let logoBuffer: Buffer | undefined
    if (args.logoUrl) {
      const logoResponse = await net.fetch(args.logoUrl)
      if (logoResponse.ok) {
        logoBuffer = Buffer.from(await logoResponse.arrayBuffer())
      }
    }

    // 3. Render text + overlay + logo
    const result = await renderText({
      imageBuffer: Buffer.from(args.imageBuffer),
      textLayout: args.textLayout,
      fonts: {
        title: { family: args.fonts.title, base64: titleBase64, path: titlePath },
        body: { family: args.fonts.body, base64: bodyBase64, path: bodyPath },
      },
      logo: logoBuffer ? {
        buffer: logoBuffer,
        position: (args.logoPosition as any) || 'bottom-right',
        sizePct: args.logoSizePct || 12,
      } : undefined,
    })

    return {
      ok: true,
      buffer: result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer,
    }
  } catch (error) {
    console.error('[Render Text] Error:', error)
    return { ok: false, error: String(error) }
  }
})

// IPC Handler - Template Layout: Measure Text (Pass 2)
ipcMain.handle('image:measure-text-layout', async (_event, draftLayout: any) => {
  console.log('[Template Pass 2] Received measure request. Elements:', draftLayout?.elements?.length ?? 0)
  try {
    // Font registration BEFORE measuring (C8)
    const fontSources = draftLayout.fontSources
    if (fontSources) {
      for (const source of [fontSources.title, fontSources.body]) {
        if (source?.family) {
          console.log(`[Template Pass 2] Registering font: ${source.family} (url: ${source.url ? 'custom' : 'google'})`)
          const fontPath = await ensureFont(source.family, source.url ?? undefined)
          registerFontFromPath(fontPath, source.family)
          console.log(`[Template Pass 2] Font ready: "${source.family}" → ${fontPath}`)
        }
      }
    }

    // Verify fonts are registered
    const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')
    const availableFamilies = GlobalFonts.families.map((f: any) => f.family)
    console.log('[Template Pass 2] Available font families:', availableFamilies.join(', '))
    const canvas = createCanvas(draftLayout.canvas.width, draftLayout.canvas.height)
    const ctx = canvas.getContext('2d')
    const result = measureTextLayout(draftLayout, ctx)
    console.log('[Template Pass 2] Done. Slots measured:', result?.slots?.length ?? 0)
    return result
  } catch (error) {
    console.error('[Template Pass 2] Error:', error)
    throw error
  }
})

// IPC Handler - Template Layout: Render Final (Pass 4)
ipcMain.handle('image:render-final-layout', async (_event, finalLayout: any, imageBuffer: ArrayBuffer, logo?: any) => {
  console.log('[Template Pass 4] Received render request. Elements:', finalLayout?.elements?.length ?? 0, 'Image size:', imageBuffer?.byteLength ?? 0, 'Logo:', logo ? 'yes' : 'no')
  try {
    // Re-register fonts in case they were lost between Pass 2 and Pass 4
    const uniqueFonts = new Set<string>()
    for (const el of (finalLayout?.elements ?? [])) {
      if (el.font) uniqueFonts.add(el.font)
    }
    for (const fontName of uniqueFonts) {
      try {
        const fontPath = await ensureFont(fontName)
        registerFontFromPath(fontPath, fontName)
        console.log(`[Template Pass 4] Font ready: "${fontName}" → ${fontPath}`)
      } catch (err) {
        console.error(`[Template Pass 4] Font registration failed for "${fontName}":`, err)
      }
    }

    // Verify fonts are actually available
    const { GlobalFonts } = await import('@napi-rs/canvas')
    const availableFamilies = GlobalFonts.families.map((f: any) => f.family)
    console.log('[Template Pass 4] Available font families:', availableFamilies.join(', '))
    for (const fontName of uniqueFonts) {
      const found = availableFamilies.includes(fontName)
      console.log(`[Template Pass 4] Font "${fontName}" registered: ${found}`)
    }

    const result = await renderFinalLayout(finalLayout, Buffer.from(imageBuffer))
    console.log('[Template Pass 4] Done. Buffer size:', result?.byteLength ?? 0)
    return {
      ok: true,
      buffer: result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer,
    }
  } catch (error) {
    console.error('[Template Pass 4] Error:', error)
    return { ok: false, error: String(error) }
  }
})

// IPC Handler - HTML/CSS snapshot render (headless BrowserWindow + capturePage)
ipcMain.handle('image:render-html-snapshot', async (_event, args: RenderHtmlSnapshotArgs) => {
  try {
    console.log('[HTML Snapshot] Request:', {
      width: args?.width,
      height: args?.height,
      mimeType: args?.mimeType,
      quality: args?.quality,
      htmlLength: args?.html?.length ?? 0,
    })
    if (!args || typeof args.html !== 'string' || !args.html.trim()) {
      return { ok: false, error: 'HTML snapshot invalido' }
    }
    if (!Number.isFinite(args.width) || !Number.isFinite(args.height)) {
      return { ok: false, error: 'Dimensoes invalidas para snapshot' }
    }

    const rendered = await renderHtmlSnapshotOffscreen(args)
    return {
      ok: true,
      mimeType: rendered.mimeType,
      buffer: rendered.buffer.buffer.slice(
        rendered.buffer.byteOffset,
        rendered.buffer.byteOffset + rendered.buffer.byteLength
      ) as ArrayBuffer,
    }
  } catch (error) {
    console.error('[HTML Snapshot] Error:', error)
    return { ok: false, error: String(error) }
  }
})

// IPC Handlers - App Info
ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})

// IPC Handlers - Platform
ipcMain.handle('app:get-platform', () => {
  return process.platform
})
