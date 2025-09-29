import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CTAAction = {
  type: 'button' | 'contact'
  label: string
  url?: string
}

type CTAButtonProps = {
  cta: CTAAction
  className?: string
  isFeatured?: boolean
  onClick?: () => void
}

export function CTAButton({ cta, className, onClick, isFeatured }: CTAButtonProps) {
  if (cta.type === 'contact' && cta.url) {
    return (
      <Button asChild className={cn('w-full relative transition-all duration-300', className)}>
        <a
          href={cta.url}
          target={/^https?:/i.test(cta.url) ? '_blank' : undefined}
          rel={/^https?:/i.test(cta.url) ? 'noreferrer' : undefined}
          className="relative z-10 flex items-center justify-center gap-2"
        >
          {cta.label}
          <ArrowRight className="w-4 h-4" />
        </a>
      </Button>
    )
  }

  return (
    <Button 
      className={cn('w-full relative transition-all duration-300', className)}
      onClick={onClick}
      variant={isFeatured ? 'default' : 'destructive'}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {cta.label}
        <ArrowRight className="w-4 h-4" />
      </span>
    </Button>
  )
}
