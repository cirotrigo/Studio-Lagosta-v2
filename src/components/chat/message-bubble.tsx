"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { Bot, Check, Copy, RefreshCw, User, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  // allow either plain text or a structured payload with images
  content: string | { images?: unknown[] }
}

type MessageBubbleProps = {
  message: ChatMessage
  className?: string
  onRetry?: (index: number) => void
  retryIndex?: number
  disableMarkdown?: boolean
}

function MessageBubbleComponent({ message, className, onRetry, retryIndex, disableMarkdown }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = React.useState(false)
  // Try to parse JSON-based payloads like { images: ["data:image/png;base64,..."] }
  const parsed = React.useMemo(() => {
    if (isUser || disableMarkdown) return null
    const raw: unknown = (message as { content?: unknown })?.content
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>
    if (typeof raw !== 'string') return null
    const str = raw.trim()
    const fromFence = /^```(?:json)?\n([\s\S]*?)\n```$/m.exec(str)
    const toParse = fromFence ? fromFence[1] : str
    try {
      return JSON.parse(toParse)
    } catch {
      return null
    }
  }, [message, disableMarkdown, isUser])
  const parsedImages: string[] = React.useMemo(() => {
    if (disableMarkdown) return []
    const out: string[] = []
    const pickUrl = (v: unknown): string | null => {
      if (!v) return null
      if (typeof v === 'string') return v
      // common shapes
      const vObj = v as { url?: unknown; image_url?: unknown; b64_json?: unknown; b64?: unknown; image_base64?: unknown };
      if (typeof vObj?.url === 'string') return vObj.url
      if (typeof vObj?.image_url === 'string') return vObj.image_url
      if (typeof (vObj?.image_url as { url?: unknown })?.url === 'string') return (vObj.image_url as { url: string }).url
      const b64 = vObj?.b64_json || vObj?.b64 || vObj?.image_base64
      if (typeof b64 === 'string' && b64.length > 0) return `data:image/png;base64,${b64}`
      return null
    }
    const imgs = (parsed && typeof parsed === 'object' && Array.isArray((parsed as { images?: unknown }).images)) ? (parsed as { images: unknown[] }).images : []
    for (const item of imgs) {
      const url = pickUrl(item)
      if (typeof url === 'string' && url.length > 0) out.push(url)
    }
    return out
  }, [parsed, disableMarkdown])

  const handleCopy = async () => {
    try {
      const raw: unknown = (message as { content?: unknown })?.content
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      const t = setTimeout(() => setCopied(false), 1200)
      return () => clearTimeout(t)
    } catch {}
  }

  const downloadImage = (url: string, index: number) => {
    try {
      let ext = 'png'
      const match = /^data:(image\/(png|jpeg|jpg|gif|webp));base64,/.exec(url)
      if (match && match[2]) {
        ext = match[2] === 'jpeg' ? 'jpg' : match[2]
      } else if (url.includes('.webp')) {
        ext = 'webp'
      } else if (url.includes('.jpg') || url.includes('.jpeg')) {
        ext = 'jpg'
      } else if (url.includes('.gif')) {
        ext = 'gif'
      } else if (url.includes('.png')) {
        ext = 'png'
      }
      const filename = `ai-image-${message.id}-${index + 1}.${ext}`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {}
  }

  const handleRetryClick = React.useCallback(() => {
    if (typeof retryIndex !== 'number' || !onRetry) return
    onRetry(retryIndex)
  }, [onRetry, retryIndex])

  return (
    <div className={cn('flex items-start gap-3', isUser ? 'justify-end' : 'justify-start', className)}>
      {!isUser && (
        <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}

      <div
        className={cn(
          'group relative max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap break-words shadow-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {/* Role label subtle */}
        <div className={cn('mb-1 text-[10px] uppercase tracking-wide opacity-60', isUser ? 'text-primary-foreground' : 'text-foreground')}>
          {isUser ? 'Você' : 'IA'}
        </div>

        {isUser ? (
          <>{message.content}</>
        ) : parsedImages.length > 0 ? (
          <div className="flex flex-col gap-2">
            {parsedImages.map((src, i) => (
              <div key={i} className="w-full">
                <Image
                  src={src}
                  alt={`imagem ${i + 1}`}
                  width={1024}
                  height={1024}
                  className="h-auto w-full max-w-full rounded-md border bg-background"
                  unoptimized
                />
              </div>
            ))}
          </div>
        ) : disableMarkdown ? (
          <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {typeof (message as { content?: unknown }).content === 'string'
              ? (message as { content: string }).content
              : JSON.stringify((message as { content?: unknown }).content)}
          </div>
        ) : (
          <div className="p-4">
            <Markdown className="[&_p]:m-0">{typeof (message as { content?: unknown }).content === 'string' ? (message as { content: string }).content : JSON.stringify((message as { content?: unknown }).content)}</Markdown>
          </div>
        )}

        {/* Actions appear on hover for both roles */}
        <div className={cn('absolute -right-1.5 -top-2.5 flex items-center gap-1 rounded-full bg-background/60 p-0.5 opacity-0 ring-1 ring-border transition-opacity group-hover:opacity-100', isUser ? 'text-foreground' : 'text-foreground')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Copiar" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar</TooltipContent>
          </Tooltip>
          {!isUser && parsedImages.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Baixar imagem"
                  onClick={() => downloadImage(parsedImages[0], 0)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Baixar</TooltipContent>
            </Tooltip>
          )}
          {!isUser && onRetry && typeof retryIndex === 'number' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Tentar novamente" onClick={handleRetryClick}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gerar novamente</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted">
          <User className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  )
}

const MessageBubble = React.memo(MessageBubbleComponent, (prev, next) => {
  if (prev.className !== next.className) return false
  if (prev.retryIndex !== next.retryIndex) return false
  if (prev.onRetry !== next.onRetry) return false
  if (prev.disableMarkdown !== next.disableMarkdown) return false

  const prevMessage = prev.message
  const nextMessage = next.message

  if (prevMessage.id !== nextMessage.id) return false
  if (prevMessage.role !== nextMessage.role) return false
  if (prevMessage.content !== nextMessage.content) return false

  return true
})

MessageBubble.displayName = 'MessageBubble'

export { MessageBubble }
