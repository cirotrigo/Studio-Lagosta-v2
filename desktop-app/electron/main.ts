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
  return new Promise<{ success: boolean; cookies?: string; error?: string }>((resolve) => {
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
    loginWindow.loadURL(loginUrl)

    // Monitor navigation to detect successful login
    loginWindow.webContents.on('did-navigate', async (_event, url) => {
      const parsedUrl = new URL(url)
      
      // Check if user reached /studio (login successful)
      if (parsedUrl.pathname === '/studio') {
        try {
          // Get all cookies from the domain
          const cookies = await session.defaultSession.cookies.get({
            url: 'https://studio-lagosta-v2.vercel.app'
          })

          // Filter relevant Clerk cookies
          const relevantCookies = cookies.filter(cookie => 
            cookie.name === '__clerk_db_jwt' || 
            cookie.name === '__session' || 
            cookie.name === '__client_uat'
          )

          if (relevantCookies.length === 0) {
            console.warn('No Clerk cookies found')
            loginWindow.close()
            resolve({ success: false, error: 'Cookies de autenticação não encontrados' })
            return
          }

          // Format cookies as a string for HTTP header
          const cookieString = relevantCookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ')

          // Save cookies securely
          saveCookies(cookieString)

          // Close login window
          loginWindow.close()

          resolve({ success: true, cookies: cookieString })
        } catch (error) {
          console.error('Error capturing cookies:', error)
          loginWindow.close()
          resolve({ success: false, error: 'Erro ao capturar cookies' })
        }
      }
    })

    // Handle window closed without login
    loginWindow.on('closed', () => {
      resolve({ success: false, error: 'Login cancelado' })
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
