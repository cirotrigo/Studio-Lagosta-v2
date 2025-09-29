"use client"

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type MarkdownProps = {
  children: string
  className?: string
}

export function Markdown({ children, className }: MarkdownProps) {
  // Extract language from a code className like "language-tsx"
  const getLang = (cls?: string): string | null => {
    if (!cls) return null
    const m = /(language|lang)-([a-z0-9+#-]+)/i.exec(cls)
    return m?.[2] || null
  }

  // Extract plain text from nested children
  const toText = (node: unknown): string => {
    if (node == null) return ''
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(toText).join('')
    if (typeof node === 'object' && 'props' in node) return toText((node as { props?: { children?: unknown } }).props?.children)
    return ''
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      className={cn(
        // Enhanced typography (no @tailwindcss/typography plugin)
        '[&_p]:leading-relaxed [&_p:not(:first-child)]:mt-3',
        '[&_a]:text-primary [&_a]:underline hover:[&_a]:opacity-80',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul, &_ol]:pl-5 [&_li]:mt-1.5',
        '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-5',
        // Headings
        '[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2',
        '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2',
        '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5',
        // Images
        '[&_img]:my-2 [&_img]:rounded-md [&_img]:border max-w-full',
        // Task lists
        '[&_input[type=checkbox]]:mr-2',
        className,
      )}
      components={{
        // Render inline code as <code>; block code is wrapped by react-markdown in <pre>
        code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: unknown }) {
          const text = String(children).replace(/\n$/, '')
          return inline ? (
            <code className={cn('rounded bg-muted px-1 py-0.5 text-xs', className)} {...props}>
              {text}
            </code>
          ) : (
            <code className={className} {...props}>
              {text}
            </code>
          )
        },
        // Style the <pre> created for fenced code blocks
        pre: function Pre({ className, children, ...props }) {
          const [copied, setCopied] = React.useState(false)
          // Try to read language from the nested <code> element
          let lang: string | null = null
          try {
            const child = Array.isArray(children) ? children[0] : children
            lang = getLang((child as { props?: { className?: string } })?.props?.className || '')
          } catch {}
          const codeText = toText(children)
          const handleCopy = async () => {
            try {
              await navigator.clipboard.writeText(codeText)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            } catch {}
          }
          return (
            <div className="group relative my-3">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {lang && <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ring-1 ring-border">{lang}</span>}
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Copiar código" onClick={handleCopy}>
                  {copied ? <span className="text-[10px]">OK</span> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <pre className={cn('max-w-full overflow-x-auto rounded-md bg-background p-3 text-xs ring-1 ring-border', className)} {...props}>
                {children}
              </pre>
            </div>
          )
        },
        a: function Link({ href, children, ...props }) {
          const external = typeof href === 'string' && /^(https?:)?\/\//.test(href)
          return (
            <a href={href as string} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} {...props}>
              {children}
            </a>
          )
        },
        img({ src, alt, ...props }) {
          const url = typeof src === 'string' ? src : ''
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={typeof alt === 'string' ? alt : ''}
              loading="lazy"
              className="my-2 max-w-full rounded-md border bg-background"
              {...props}
            />
          )
        },
        table({ className, ...props }) {
          return (
            <div className="my-3 w-full overflow-x-auto">
              <table className={cn('w-full border-collapse text-sm', className)} {...props} />
            </div>
          )
        },
        th({ className, ...props }) {
          return <th className={cn('border-b bg-muted/50 px-2 py-1 text-left font-medium', className)} {...props} />
        },
        td({ className, ...props }) {
          return <td className={cn('border-b px-2 py-1 align-top', className)} {...props} />
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
