import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface PanelDividerProps {
  orientation?: 'vertical' | 'horizontal'
  beamCount?: number
  showBeam?: boolean
  className?: string
}

export const PanelDivider = memo(({
  orientation = 'vertical',
  beamCount = 2,
  showBeam = true,
  className = '',
}: PanelDividerProps) => {
  const isVertical = orientation === 'vertical'

  // Check for reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  // Generate beams with varied delays and durations
  const beams = useMemo(() =>
    Array.from({ length: beamCount }, (_, i) => ({
      id: i,
      delay: i * 4, // 4s between each beam
      duration: 8 + (i * 2), // Varied durations: 8s, 10s, 12s...
      intense: i === 0, // First beam is more intense
    })),
    [beamCount]
  )

  if (!showBeam || prefersReducedMotion) {
    return (
      <div
        className={cn(
          isVertical ? 'w-px h-full' : 'h-px w-full',
          'bg-white/[0.05]',
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        isVertical ? 'w-px h-full' : 'h-px w-full',
        'bg-white/[0.05]',
        className
      )}
    >
      {isVertical && beams.map((beam) => (
        <div
          key={beam.id}
          className="absolute top-0 left-0 w-px pointer-events-none"
          style={{
            height: beam.intense ? '120px' : '80px',
            background: beam.intense
              ? 'linear-gradient(to bottom, transparent, rgba(249, 115, 22, 0.8), rgba(251, 191, 36, 0.4), transparent)'
              : 'linear-gradient(to bottom, transparent, rgba(249, 115, 22, 0.5), transparent)',
            animation: `beam-fall ${beam.duration}s linear infinite`,
            animationDelay: `${beam.delay}s`,
          }}
        />
      ))}
    </div>
  )
})

PanelDivider.displayName = 'PanelDivider'

// Simple beam divider for sidebar edges
interface BeamEdgeProps {
  position?: 'left' | 'right'
  className?: string
}

export const BeamEdge = memo(({ position = 'right', className = '' }: BeamEdgeProps) => {
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  if (prefersReducedMotion) {
    return null
  }

  return (
    <div
      className={cn(
        'absolute top-0 w-px h-full overflow-hidden pointer-events-none',
        position === 'right' ? 'right-0' : 'left-0',
        className
      )}
    >
      <div
        className="absolute top-0 left-0 w-px h-24 animate-beam-1"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(249, 115, 22, 0.7), rgba(251, 191, 36, 0.3), transparent)',
        }}
      />
      <div
        className="absolute top-0 left-0 w-px h-16 animate-beam-2"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(249, 115, 22, 0.4), transparent)',
        }}
      />
    </div>
  )
})

BeamEdge.displayName = 'BeamEdge'

export default PanelDivider
