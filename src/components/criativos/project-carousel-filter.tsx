'use client'

import * as React from 'react'
import Image from 'next/image'
import { Grid3X3, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface CarouselProject {
  id: number
  name: string
  logoUrl: string | null
}

interface ProjectCarouselFilterProps {
  projects: CarouselProject[]
  selectedId: number | null
  onSelect: (projectId: number | null) => void
  className?: string
}

export function ProjectCarouselFilter({
  projects,
  selectedId,
  onSelect,
  className,
}: ProjectCarouselFilterProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  React.useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll)
      window.addEventListener('resize', checkScroll)
    }
    return () => {
      if (el) {
        el.removeEventListener('scroll', checkScroll)
      }
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, projects])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = 200
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  // Generate a background color based on project ID for fallback
  const getProjectColor = (id: number) => {
    const colors = [
      'bg-red-500/20 text-red-600',
      'bg-blue-500/20 text-blue-600',
      'bg-green-500/20 text-green-600',
      'bg-yellow-500/20 text-yellow-600',
      'bg-purple-500/20 text-purple-600',
      'bg-pink-500/20 text-pink-600',
      'bg-indigo-500/20 text-indigo-600',
      'bg-teal-500/20 text-teal-600',
    ]
    return colors[id % colors.length]
  }

  return (
    <div className={cn('relative group', className)}>
      {/* Navigation arrows - desktop only */}
      {canScrollLeft && (
        <Button
          variant="outline"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/95 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {canScrollRight && (
        <Button
          variant="outline"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/95 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
          onClick={() => scroll('right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Carousel container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory py-2 px-1 -mx-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* "Todos" option */}
        <button
          onClick={() => onSelect(null)}
          className="snap-start flex-shrink-0 flex flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        >
          <div
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center transition-all',
              'bg-muted border-2 border-transparent',
              selectedId === null && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
          >
            <Grid3X3 className="w-6 h-6 text-muted-foreground" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Todos</span>
        </button>

        {/* Project items */}
        {projects.map((project) => {
          const isSelected = selectedId === project.id
          return (
            <button
              key={project.id}
              onClick={() => onSelect(project.id)}
              className="snap-start flex-shrink-0 flex flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
            >
              <div
                className={cn(
                  'w-14 h-14 rounded-full overflow-hidden transition-all border-2 border-transparent',
                  isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                )}
              >
                {project.logoUrl ? (
                  <Image
                    src={project.logoUrl}
                    alt={project.name}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className={cn(
                      'w-full h-full flex items-center justify-center text-lg font-bold',
                      getProjectColor(project.id)
                    )}
                  >
                    {project.name[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <span
                className={cn(
                  'text-xs truncate max-w-[60px]',
                  isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {project.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
