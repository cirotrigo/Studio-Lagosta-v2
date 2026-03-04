import { app, BrowserWindow, ipcMain, shell, safeStorage, session, net } from 'electron'
import path from 'path'
import { processImage } from './ipc/image-processor'
import { getCookies, saveCookies, clearCookies } from './ipc/secure-storage'
import { ensureFont, getFontBase64 } from './ipc/font-cache'
import { renderText } from './ipc/text-renderer'

let mainWindow: BrowserWindow | null = null
let refreshWindow: BrowserWindow | null = null
let isRefreshing = false

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
          const s = cookies.find(c => c.name === '__session' || c.name.startsWith('__session_'))
          if (s?.value) {
            try {
              const p = JSON.parse(Buffer.from(s.value.split('.')[1], 'base64').toString())
              if (p.exp > Math.floor(Date.now() / 1000)) { resolve(true); return }
            } catch { /* ignore */ }
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
      try {
        const parts = cookie.value.split('.')
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        const now = Math.floor(Date.now() / 1000)
        if (payload.exp > now) {
          console.log('[Refresh] Got fresh __session, valid for', payload.exp - now, 'seconds')
          clearTimeout(timeout)
          session.defaultSession.cookies.removeListener('changed', cookieHandler)
          if (!win.isDestroyed()) win.close()
          isRefreshing = false
          resolve(true)
        } else {
          console.log('[Refresh] New __session is also expired, ignoring')
        }
      } catch { /* ignore */ }
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
app.whenReady().then(() => {
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
              c.match(/^__session[^=]*=([^;]+)/)?.[1]?.length > 5
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

        const sessionCookie = vercelCookies.find(c => c.name === '__session' || c.name.startsWith('__session_'))
        const dbJwtCookie = vercelCookies.find(c => c.name === '__clerk_db_jwt')
        const clientUatCookie = vercelCookies.find(c => c.name === '__client_uat' || c.name.startsWith('__client_uat_'))
        
        console.log('[Auth] __session:', sessionCookie ? `${sessionCookie.name}=${sessionCookie.value.substring(0, 30)}...` : 'NOT FOUND')
        console.log('[Auth] __clerk_db_jwt:', dbJwtCookie?.value ? dbJwtCookie.value.substring(0, 20) + '...' : 'NOT FOUND')
        console.log('[Auth] __client_uat:', clientUatCookie ? `${clientUatCookie.name}=${clientUatCookie.value}` : 'NOT FOUND')
        
        // Wait for __session cookie (with or without suffix) which confirms authenticated user
        // Also accept __client_uat with a non-zero value as fallback
        const hasSession = sessionCookie && sessionCookie.value
        const hasValidUat = clientUatCookie && clientUatCookie.value && clientUatCookie.value !== '0'
        
        if (!hasSession && !hasValidUat) {
          console.warn('[Auth] Session not confirmed yet - waiting...')
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
      const isValidUat = (cookie.name === '__client_uat' || cookie.name.startsWith('__client_uat_')) && 
                         cookie.value !== '0' && cookie.value !== ''
      
      if (!isSessionCookie && !isValidUat) return
      
      console.log('[Auth] Cookie changed:', cookie.name, '=', cookie.value.substring(0, 30) + '...')
      
      if (isResolved) return
      
      // Give a tiny delay for all cookies to be set
      setTimeout(async () => {
        if (isResolved) return
        
        const vercelCookies = await session.defaultSession.cookies.get({
          url: 'https://studio-lagosta-v2.vercel.app'
        })
        
        const sessionCookie = vercelCookies.find(c => c.name === '__session' || c.name.startsWith('__session_'))
        const clientUatCookie = vercelCookies.find(c => 
          (c.name === '__client_uat' || c.name.startsWith('__client_uat_')) && c.value !== '0'
        )
        
        const hasAuth = (sessionCookie && sessionCookie.value) || clientUatCookie
        
        if (!hasAuth) {
          console.log('[Auth] Cookie changed but no valid session yet')
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
    
    // Check if __session is still valid (not expired)
    const sessionCookie = sessionCookies.find(c => c.name === '__session' || c.name.startsWith('__session_'))
    const clientUat = sessionCookies.find(c => (c.name === '__client_uat' || c.name.startsWith('__client_uat_')) && c.value !== '0')
    const dbJwt = sessionCookies.find(c => c.name === '__clerk_db_jwt' || c.name.startsWith('__clerk_db_jwt_'))
    
    // Check if __session JWT is expired
    let sessionExpired = true
    if (sessionCookie?.value) {
      try {
        const parts = sessionCookie.value.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
          const now = Math.floor(Date.now() / 1000)
          sessionExpired = payload.exp <= now
          if (!sessionExpired) {
            console.log('[Cookies] __session is valid, expires in', payload.exp - now, 'seconds')
          } else {
            console.log('[Cookies] __session expired', now - payload.exp, 'seconds ago - need refresh')
          }
        }
      } catch {
        sessionExpired = true
      }
    }
    
    // If session expired but we have __clerk_db_jwt, try to refresh
    if (sessionExpired && (dbJwt || clientUat)) {
      console.log('[Cookies] Session expired - triggering Clerk refresh via hidden window...')
      const refreshed = await refreshClerkSession()
      
      if (refreshed) {
        // Re-read fresh cookies after refresh
        const freshCookies = await session.defaultSession.cookies.get({
          url: 'https://studio-lagosta-v2.vercel.app'
        })
        const freshString = freshCookies.map(c => `${c.name}=${c.value}`).join('; ')
        saveCookies(freshString)
        return freshString
      }
      
      console.log('[Cookies] Refresh failed - using expired cookies as fallback')
    }
    
    const cookieString = sessionCookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ')
    
    // Also update stored cookies to keep them in sync
    saveCookies(cookieString)
    
    return cookieString
  } catch (e) {
    console.error('[Cookies] Error getting session cookies:', e)
    return getCookies()
  }
}

// Helper: build headers with cookies and Bearer token
function buildAuthHeaders(cookies: string | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (!cookies) return headers
  headers['Cookie'] = cookies
  const sessionMatch = cookies.match(/(?:^|; )__session(?:_[^=]+)?=([^;]+)/)
  if (sessionMatch) {
    headers['Authorization'] = `Bearer ${sessionMatch[1]}`
  }
  return headers
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
  return { isHtml, text, status: response.status, statusText: response.statusText, ok: response.ok }
}

// IPC Handlers - API Requests (to bypass CORS)
ipcMain.handle('api:request', async (_event, url: string, options: RequestInit) => {
  // First attempt with current cookies
  let cookies = await getFreshCookies()
  let result = await executeRequest(url, options, cookies)

  // If HTML (session expired), try refresh once and retry
  if (result.isHtml) {
    console.log('[API] Got HTML - attempting session refresh then retry...')
    const refreshed = await refreshClerkSession()
    if (refreshed) {
      cookies = await getFreshCookies()
      result = await executeRequest(url, options, cookies)
    }
  }

  if (result.isHtml) {
    console.log('[API] Still HTML after refresh - session truly expired')
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Sessão expirada. Por favor, faça login novamente.' },
    }
  }

  let data
  try { data = JSON.parse(result.text) } catch { data = result.text }

  return { ok: result.ok, status: result.status, statusText: result.statusText, data }
})

// IPC Handler - Download Blob (for binary data like images)
ipcMain.handle('blob:download', async (_event, url: string) => {
  try {
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
    const cookies = await getFreshCookies()
    
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
      
      // Extract __session JWT for Bearer token
      const sessionMatch = cookies.match(/(?:^|; )__session(?:_[^=]+)?=([^;]+)/)
      if (sessionMatch) {
        headers['Authorization'] = `Bearer ${sessionMatch[1]}`
      }
    }
    
    console.log('[Upload] Headers:', Object.keys(headers))
    console.log('[Upload] Body size:', body.length, 'bytes')
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'follow',
    })
    
    console.log('[Upload] Response status:', response.status)
    
    const text = await response.text()
    
    // Detect HTML responses
    const isHtml = text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')
    if (isHtml) {
      console.log('[Upload] Received HTML instead of JSON - session expired')
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        data: { error: 'Sessão expirada. Por favor, faça login novamente.' },
      }
    }
    
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
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
    // 1. Ensure fonts are cached locally
    const titlePath = await ensureFont(args.fonts.title, args.fontUrls?.title)
    const bodyPath = await ensureFont(args.fonts.body, args.fontUrls?.body)
    const titleBase64 = await getFontBase64(titlePath)
    const bodyBase64 = await getFontBase64(bodyPath)

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
        title: { family: args.fonts.title, base64: titleBase64 },
        body: { family: args.fonts.body, base64: bodyBase64 },
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
