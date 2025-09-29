"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        // Subtle gradient ring + neon border using CSS utilities
        "relative flex size-10 shrink-0 overflow-hidden rounded-full neon-border",
        // gradient backdrop if no image or while loading
        "bg-[radial-gradient(120%_120%_at_10%_-10%,color-mix(in_oklch,var(--retro-cyan)_25%,transparent),transparent_55%),linear-gradient(135deg,color-mix(in_oklch,var(--retro-cyan)_35%,var(--background))_0%,color-mix(in_oklch,var(--retro-magenta)_30%,var(--background))_100%)]",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        // Gradient text badge with subtle glow
        "flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-primary-foreground",
        "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--retro-cyan)_55%,var(--primary)_45%)_0%,color-mix(in_oklch,var(--retro-magenta)_50%,var(--primary)_50%)_100%)]",
        "shadow-[0_0_0_1px_color-mix(in_oklch,var(--neon)_20%,transparent)_inset]",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
