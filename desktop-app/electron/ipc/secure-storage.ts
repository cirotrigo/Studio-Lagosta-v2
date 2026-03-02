import { safeStorage, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const CONFIG_FILE = 'lagosta-tools-config.json'

interface ConfigData {
  encryptedCookies?: string
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}

function readConfig(): ConfigData {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading config:', error)
  }
  return {}
}

function writeConfig(config: ConfigData): void {
  try {
    const configPath = getConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error writing config:', error)
    throw error
  }
}

export function getCookies(): string | null {
  try {
    const config = readConfig()
    const encryptedCookies = config.encryptedCookies

    if (!encryptedCookies) {
      return null
    }

    // Check if encryption is available
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available, returning stored cookies as-is')
      return encryptedCookies
    }

    // Decrypt the cookies
    const decrypted = safeStorage.decryptString(Buffer.from(encryptedCookies, 'base64'))
    return decrypted
  } catch (error) {
    console.error('Error getting cookies:', error)
    return null
  }
}

export function saveCookies(cookies: string): void {
  try {
    const config = readConfig()

    // Check if encryption is available
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available, storing cookies as-is')
      config.encryptedCookies = cookies
      writeConfig(config)
      return
    }

    // Encrypt and store the cookies
    const encrypted = safeStorage.encryptString(cookies)
    config.encryptedCookies = encrypted.toString('base64')
    writeConfig(config)
  } catch (error) {
    console.error('Error saving cookies:', error)
    throw error
  }
}

export function clearCookies(): void {
  try {
    const config = readConfig()
    delete config.encryptedCookies
    writeConfig(config)
  } catch (error) {
    console.error('Error clearing cookies:', error)
    throw error
  }
}

// Legacy functions - mantidas para compatibilidade se necessário
export function getToken(): string | null {
  return getCookies()
}

export function saveToken(token: string): void {
  saveCookies(token)
}

export function clearToken(): void {
  clearCookies()
}
