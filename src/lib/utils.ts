import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateApiKey(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '')
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 34)}`
}

/**
 * Check if an image URL is from an external storage service
 * External images should use unoptimized to avoid Next.js optimization timeouts
 */
export function isExternalImage(src: string): boolean {
  if (!src) return false

  const externalDomains = [
    'blob.vercel-storage.com',
    'public.blob.vercel-storage.com',
    'googleusercontent.com',
    'drive.google.com',
    'unsplash.com',
  ]

  return externalDomains.some(domain => src.includes(domain))
}
