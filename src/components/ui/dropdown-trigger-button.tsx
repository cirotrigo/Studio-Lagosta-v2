"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = React.ComponentProps<typeof Button> & {
  isOpen?: boolean
}

export function DropdownTriggerButton({ isOpen, className, children, ...props }: Props) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'relative h-8 gap-2 overflow-hidden rounded-lg px-2 text-xs group',
        isOpen && 'bg-muted/60',
        className,
      )}
      {...props}
    >
      {children}
      <span className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500/10 to-indigo-500/10 opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-full bg-gradient-to-r from-violet-500 to-indigo-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </Button>
  )
}

