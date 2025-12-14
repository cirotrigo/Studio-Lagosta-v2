"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { Bot, Check, Copy, RefreshCw, User, Download, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { Badge } from '@/components/ui/badge'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  // allow either plain text or a structured payload with images
  content: string | { images?: unknown[] }
  metadata?: Record<string, unknown>
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
  const ragUsed = Boolean((message.metadata as { ragUsed?: unknown } | undefined)?.ragUsed)
  const knowledgeEntries = Array.isArray((message.metadata as { knowledgeEntries?: unknown } | undefined)?.knowledgeEntries)
    ? ((message.metadata as { knowledgeEntries: unknown[] }).knowledgeEntries)
    : []
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
      await copyToClipboard(text)
      setCopied(true)
      const timeout = setTimeout(() => setCopied(false), 1200)
      return () => clearTimeout(timeout)
    } catch (_error) {
      console.warn('[MessageBubble] Failed to copy message content', _error)
    }
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
    } catch { }
  }

  const handleRetryClick = React.useCallback(() => {
    if (typeof retryIndex !== 'number' || !onRetry) return
    onRetry(retryIndex)
  }, [onRetry, retryIndex])

  return (
    <div className={cn('flex w-full items-start gap-3', isUser ? 'justify-end' : 'justify-start', className)}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <Bot className="h-5 w-5 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'group relative max-w-[85%] px-4 py-3 text-sm whitespace-pre-wrap break-words shadow-sm transition-all',
          isUser
            ? 'rounded-2xl rounded-tr-sm bg-primary text-primary-foreground'
            : 'rounded-2xl rounded-tl-sm bg-muted/40 text-foreground border border-border/40'
        )}
      >
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
          <div className="text-sm whitespace-pre-wrap">
            {typeof (message as { content?: unknown }).content === 'string'
              ? (message as { content: string }).content
              : JSON.stringify((message as { content?: unknown }).content)}
          </div>
        ) : (
          <Markdown className="prose-sm leading-relaxed [&_pre]:bg-zinc-900 [&_pre]:p-4 [&_pre]:rounded-lg [&_code]:bg-black/10 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 dark:[&_code]:bg-white/10">{typeof (message as { content?: unknown }).content === 'string' ? (message as { content: string }).content : JSON.stringify((message as { content?: unknown }).content)}</Markdown>
        )}

        {!isUser && ragUsed && (
          <div className="mt-3 flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground/80">
            <Database className="h-3 w-3" />
            <span>Fontes do conhecimento</span>
            {knowledgeEntries.length > 0 && (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {knowledgeEntries.length}
              </Badge>
            )}
          </div>
        )}

        {/* Actions - repositioned to be less intrusive */}
        <div className={cn(
          'absolute flex items-center gap-0.5 rounded-lg bg-background/80 backdrop-blur-sm p-0.5 opacity-0 border shadow-sm transition-opacity group-hover:opacity-100',
          isUser ? 'bottom-0 right-full mr-2' : '-bottom-3 right-2' // User actions left, AI actions bottom-right
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" aria-label="Copiar" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copiar</TooltipContent>
          </Tooltip>

          {!isUser && parsedImages.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-muted"
                  aria-label="Baixar imagem"
                  onClick={() => downloadImage(parsedImages[0], 0)}
                >
                  <Download className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Baixar</TooltipContent>
            </Tooltip>
          )}

          {!isUser && onRetry && typeof retryIndex === 'number' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" aria-label="Tentar novamente" onClick={handleRetryClick}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Regenerar</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
          <User className="h-5 w-5 text-muted-foreground" />
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
  const prevRag = Boolean(prevMessage.metadata && (prevMessage.metadata as { ragUsed?: unknown }).ragUsed)
  const nextRag = Boolean(nextMessage.metadata && (nextMessage.metadata as { ragUsed?: unknown }).ragUsed)
  if (prevRag !== nextRag) return false
  const prevEntriesLen = Array.isArray((prevMessage.metadata as { knowledgeEntries?: unknown } | undefined)?.knowledgeEntries)
    ? ((prevMessage.metadata as { knowledgeEntries: unknown[] }).knowledgeEntries.length)
    : 0
  const nextEntriesLen = Array.isArray((nextMessage.metadata as { knowledgeEntries?: unknown } | undefined)?.knowledgeEntries)
    ? ((nextMessage.metadata as { knowledgeEntries: unknown[] }).knowledgeEntries.length)
    : 0
  if (prevEntriesLen !== nextEntriesLen) return false

  return true
})

MessageBubble.displayName = 'MessageBubble'

export { MessageBubble }
