"use client"

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

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
        '[&_p]:leading-relaxed [&_p]:text-sm [&_p:not(:first-child)]:mt-3',
        // Links - clickable and highlighted
        '[&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/50 hover:[&_a]:decoration-primary [&_a]:transition-colors [&_a]:font-medium',
        // Lists - styled bullets and proper spacing
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul,_&_ol]:pl-6 [&_ul,_&_ol]:my-3 [&_ul,_&_ol]:space-y-1.5',
        '[&_li]:text-sm [&_li]:leading-relaxed',
        // Nested lists
        '[&_li>ul]:mt-1.5 [&_li>ol]:mt-1.5 [&_li>ul]:mb-0 [&_li>ol]:mb-0',
        '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-6 [&_hr]:border-border',
        // Headings - clear hierarchy
        '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:tracking-tight',
        '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:tracking-tight',
        '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2',
        '[&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1.5',
        '[&_h5]:text-sm [&_h5]:font-semibold [&_h5]:mt-2 [&_h5]:mb-1',
        '[&_h6]:text-sm [&_h6]:font-medium [&_h6]:mt-2 [&_h6]:mb-1',
        // Images
        '[&_img]:my-3 [&_img]:rounded-lg [&_img]:border [&_img]:shadow-sm max-w-full',
        // Task lists
        '[&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:cursor-pointer',
        // Strong and emphasis
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_em]:italic',
        className,
      )}
      components={{
        // Render inline code as <code>; block code is wrapped by react-markdown in <pre>
        code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: unknown }) {
          const text = String(children).replace(/\n$/, '')
          return inline ? (
            <code className={cn('rounded bg-muted/60 px-1.5 py-0.5 text-xs font-mono border border-border/50', className)} {...props}>
              {text}
            </code>
          ) : (
            <code className={cn('font-mono text-xs', className)} {...props}>
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
              await copyToClipboard(codeText)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            } catch (_error) {
              console.warn('[Markdown] Failed to copy code block', _error)
            }
          }
          return (
            <div className="group relative my-4">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                {lang && (
                  <span className="rounded-md bg-background/90 backdrop-blur-sm px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border border-border shadow-sm">
                    {lang}
                  </span>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 shadow-sm"
                  aria-label="Copiar código"
                  onClick={handleCopy}
                >
                  {copied ? <span className="text-[10px] font-medium text-green-600">✓</span> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <pre
                className={cn(
                  'max-w-full overflow-x-auto rounded-lg bg-zinc-950 dark:bg-zinc-900 p-4 text-xs font-mono',
                  'border border-zinc-800 shadow-lg',
                  '[&_code]:text-zinc-100 [&_code]:bg-transparent',
                  className
                )}
                {...props}
              >
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
            <img
              src={url}
              alt={typeof alt === 'string' ? alt : ''}
              loading="lazy"
              className="my-2 max-w-full rounded-md border bg-background"
              {...props}
            />
          )
        },
        // Enhanced table with zebra striping and better mobile support
        table({ className, ...props }) {
          return (
            <div className="my-4 w-full overflow-x-auto rounded-lg border border-border shadow-sm">
              <table className={cn('w-full border-collapse text-sm', className)} {...props} />
            </div>
          )
        },
        thead({ className, ...props }) {
          return <thead className={cn('bg-muted/80 border-b-2 border-border', className)} {...props} />
        },
        tbody({ className, ...props }) {
          return <tbody className={cn('[&_tr:nth-child(even)]:bg-muted/30 [&_tr]:transition-colors hover:[&_tr]:bg-muted/50', className)} {...props} />
        },
        tr({ className, ...props }) {
          return <tr className={cn('border-b border-border/50 last:border-0', className)} {...props} />
        },
        th({ className, ...props }) {
          return (
            <th
              className={cn(
                'px-4 py-2.5 text-left font-semibold text-foreground',
                'first:pl-4 last:pr-4',
                className
              )}
              {...props}
            />
          )
        },
        td({ className, ...props }) {
          return (
            <td
              className={cn(
                'px-4 py-2.5 align-top',
                'first:pl-4 last:pr-4',
                className
              )}
              {...props}
            />
          )
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
