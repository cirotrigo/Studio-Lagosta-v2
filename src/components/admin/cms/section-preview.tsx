'use client'

import type { CMSSection } from '@/hooks/admin/use-admin-cms'
import { ResponsivePreview } from './responsive-preview'

type SectionPreviewProps = {
  section: CMSSection
}

export function SectionPreview({ section }: SectionPreviewProps) {
  const renderPreview = () => {
    switch (section.type) {
      case 'HERO':
        return <HeroPreview content={section.content} />
      case 'FAQ':
        return <FAQPreview content={section.content} />
      case 'CTA':
        return <CTAPreview content={section.content} />
      default:
        return (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">
              Preview disponível em breve para este tipo de seção
            </p>
          </div>
        )
    }
  }

  return (
    <ResponsivePreview>
      <div className="min-h-[400px] p-8">
        {renderPreview()}
      </div>
    </ResponsivePreview>
  )
}

function HeroPreview({ content }: { content: Record<string, unknown> }) {
  const data = content as any

  return (
    <div className="space-y-6 text-center max-w-3xl mx-auto">
      {data.badge?.text && (
        <div className="inline-block px-4 py-1 rounded-full bg-primary/10 text-primary text-sm">
          {data.badge.text}
        </div>
      )}
      <h1 className="text-4xl md:text-6xl font-bold">
        {data.title?.lines?.map((line: any, i: number) => (
          <div key={i}>
            {typeof line === 'string' ? line : line.text}
          </div>
        ))}
      </h1>
      {data.description && (
        <p className="text-lg text-muted-foreground">{data.description}</p>
      )}
      {data.ctas && data.ctas.length > 0 && (
        <div className="flex gap-4 justify-center">
          {data.ctas.map((cta: any, i: number) => (
            <button
              key={i}
              className={`px-6 py-3 rounded-lg font-medium ${
                cta.variant === 'outline'
                  ? 'border border-input bg-background hover:bg-accent'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {cta.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FAQPreview({ content }: { content: Record<string, unknown> }) {
  const data = content as any

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {data.title && (
        <h2 className="text-3xl font-bold text-center">{data.title}</h2>
      )}
      {data.subtitle && (
        <p className="text-muted-foreground text-center">{data.subtitle}</p>
      )}
      <div className="space-y-4">
        {(data.faqs || []).map((faq: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">{faq.question}</h3>
            <p className="text-sm text-muted-foreground">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CTAPreview({ content }: { content: Record<string, unknown> }) {
  const data = content as any

  return (
    <div className="space-y-6 text-center max-w-2xl mx-auto p-12 rounded-lg bg-primary/5">
      {data.title && <h2 className="text-3xl font-bold">{data.title}</h2>}
      {data.description && (
        <p className="text-lg text-muted-foreground">{data.description}</p>
      )}
      {data.button?.text && (
        <button className="px-8 py-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
          {data.button.text}
        </button>
      )}
    </div>
  )
}
