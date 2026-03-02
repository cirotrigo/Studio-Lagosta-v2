import { app, BrowserWindow, ipcMain, shell, safeStorage, session } from 'electron'
import path from 'path'
import { processImage } from './ipc/image-processor'
import { getCookies, saveCookies, clearCookies } from './ipc/secure-storage'

let mainWindow: BrowserWindow | null = null

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

// IPC Handlers - API Requests (to bypass CORS)
ipcMain.handle('api:request', async (_event, url: string, options: RequestInit) => {
  const cookies = getCookies()
  
  console.log('[API] Request:', options.method || 'GET', url)
  console.log('[API] Cookies available:', cookies ? 'YES' : 'NO')
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  
  if (cookies) {
    (headers as Record<string, string>)['Cookie'] = cookies
    
    // Extract __session JWT (with or without suffix) to use as Bearer token
    // This is the actual user session JWT that Clerk validates
    const sessionMatch = cookies.match(/(?:^|; )__session(?:_[^=]+)?=([^;]+)/)
    
    if (sessionMatch) {
      const sessionToken = sessionMatch[1]
      console.log('[API] Adding __session JWT as Authorization Bearer')
      ;(headers as Record<string, string>)['Authorization'] = `Bearer ${sessionToken}`
    } else {
      console.log('[API] No __session found in cookies')
    }
  }
  
  console.log('[API] Headers:', JSON.stringify(headers, null, 2).substring(0, 500))
  
  const response = await fetch(url, {
    ...options,
    headers,
    redirect: 'follow', // Follow redirects automatically
  })
  
  console.log('[API] Response status:', response.status, response.statusText)
  console.log('[API] Response URL:', response.url)
  
  const text = await response.text()
  console.log('[API] Response body (first 200):', text.substring(0, 200))
  
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
})

// IPC Handlers - Image Processing
ipcMain.handle('image:process', async (_event, buffer: ArrayBuffer, postType: string) => {
  return processImage(Buffer.from(buffer), postType)
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
