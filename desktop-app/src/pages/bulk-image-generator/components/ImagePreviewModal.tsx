import { useEffect, useState } from 'react'
import { X, Download, ExternalLink, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_BASE_URL } from '@/lib/constants'

// Helper to convert relative URLs to absolute
function toAbsoluteUrl(url: string): string {
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`
  }
  return url
}

interface ImagePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string | null
  prompt?: string
}

export default function ImagePreviewModal({
  isOpen,
  onClose,
  imageUrl,
  prompt,
}: ImagePreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load image via Electron API to bypass CORS
  useEffect(() => {
    if (!isOpen || !imageUrl) {
      setBlobUrl(null)
      return
    }

    let cancelled = false
    const loadImage = async () => {
      setIsLoading(true)
      try {
        const absoluteUrl = toAbsoluteUrl(imageUrl)
        const response = await window.electronAPI.downloadBlob(absoluteUrl)
        if (!cancelled && response.ok && response.buffer) {
          const blob = new Blob([response.buffer], {
            type: response.contentType || 'image/png',
          })
          const url = URL.createObjectURL(blob)
          setBlobUrl(url)
        }
      } catch (error) {
        console.error('Failed to load image:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadImage()

    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [isOpen, imageUrl])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleDownload = async () => {
    if (!blobUrl) return

    try {
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `generated-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const handleOpenExternal = () => {
    if (imageUrl) {
      window.electronAPI.openExternal(toAbsoluteUrl(imageUrl))
    }
  }

  return (
    <AnimatePresence>
      {isOpen && imageUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />

          {/* Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col"
          >
            {/* Image */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl min-w-[300px] min-h-[300px] flex items-center justify-center bg-[#111]">
              {isLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-white/50" />
                  <span className="text-sm text-white/40">Carregando...</span>
                </div>
              ) : blobUrl ? (
                <img
                  src={blobUrl}
                  alt="Generated image"
                  className="max-w-full max-h-[75vh] object-contain"
                />
              ) : (
                <div className="text-white/40 text-sm">Imagem indisponivel</div>
              )}
            </div>

            {/* Prompt */}
            {prompt && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-4 px-4 py-3 rounded-xl bg-white/5 border border-white/10 max-w-2xl mx-auto"
              >
                <p className="text-sm text-white/70 text-center line-clamp-3">
                  {prompt}
                </p>
              </motion.div>
            )}

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex items-center justify-center gap-3 mt-4"
            >
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <Download size={16} />
                <span className="text-sm">Baixar</span>
              </button>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ExternalLink size={16} />
                <span className="text-sm">Abrir</span>
              </button>
            </motion.div>
          </motion.div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
