'use client'

import { useState } from 'react'
import { Monitor, Tablet, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ViewportSize = 'desktop' | 'tablet' | 'mobile'

type ResponsivePreviewProps = {
  children: React.ReactNode
}

const viewportSizes = {
  desktop: { width: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { width: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { width: '375px', icon: Smartphone, label: 'Mobile' },
}

export function ResponsivePreview({ children }: ResponsivePreviewProps) {
  const [viewport, setViewport] = useState<ViewportSize>('desktop')

  return (
    <div className="space-y-4">
      {/* Viewport Controls */}
      <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/50 p-2">
        {(Object.keys(viewportSizes) as ViewportSize[]).map((size) => {
          const { icon: Icon, label } = viewportSizes[size]
          return (
            <Button
              key={size}
              variant={viewport === size ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewport(size)}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          )
        })}
      </div>

      {/* Preview Container */}
      <div className="flex items-start justify-center overflow-x-auto rounded-lg border bg-muted/20 p-8">
        <div
          className={cn(
            'transition-all duration-300 ease-in-out',
            viewport === 'mobile' && 'max-w-[375px]',
            viewport === 'tablet' && 'max-w-[768px]',
            viewport === 'desktop' && 'w-full'
          )}
          style={{
            width: viewportSizes[viewport].width,
          }}
        >
          <div className="rounded-lg border bg-background shadow-lg">
            {children}
          </div>
        </div>
      </div>

      {/* Viewport Info */}
      <div className="text-center text-xs text-muted-foreground">
        Viewport: {viewportSizes[viewport].label} ({viewportSizes[viewport].width})
      </div>
    </div>
  )
}
