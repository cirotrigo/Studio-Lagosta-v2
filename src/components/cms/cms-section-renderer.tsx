import { CMSHero } from './sections/cms-hero'
import { CMSBentoGrid } from './sections/cms-bento-grid'
import { CMSFAQ } from './sections/cms-faq'
import { CMSAIStarter } from './sections/cms-ai-starter'
import { CMSPricing } from './sections/cms-pricing'
import { CMSCTA } from './sections/cms-cta'
import { CMSCustom } from './sections/cms-custom'

type CMSSection = {
  id: string
  type: string
  name: string
  content: Record<string, unknown>
  order: number
  isVisible: boolean
  cssClasses: string | null
}

type CMSSectionRendererProps = {
  section: CMSSection
}

export async function CMSSectionRenderer({ section }: CMSSectionRendererProps) {
  if (!section.isVisible) return null

  const className = section.cssClasses || ''

  switch (section.type) {
    case 'HERO':
      return (
        <div className={className}>
          <CMSHero content={section.content} />
        </div>
      )
    case 'BENTO_GRID':
      return (
        <div className={className}>
          <CMSBentoGrid content={section.content} />
        </div>
      )
    case 'FAQ':
      return (
        <div className={className}>
          <CMSFAQ content={section.content} />
        </div>
      )
    case 'AI_STARTER':
      return (
        <div className={className}>
          <CMSAIStarter content={section.content} />
        </div>
      )
    case 'PRICING':
      return (
        <div className={className}>
          <CMSPricing content={section.content} />
        </div>
      )
    case 'CTA':
      return (
        <div className={className}>
          <CMSCTA content={section.content} />
        </div>
      )
    case 'CUSTOM':
      return (
        <div className={className}>
          <CMSCustom content={section.content} />
        </div>
      )
    default:
      console.warn(`Unknown section type: ${section.type}`)
      return null
  }
}
