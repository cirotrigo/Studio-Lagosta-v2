"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"

export function BreadcrumbNav() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-sm text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground transition-colors">
        Início
      </Link>
      {segments.length > 0 && segments[0] !== "home" && (
        <>
          {segments.map((segment, index) => {
            const href = `/${segments.slice(0, index + 1).join("/")}`
            const isLast = index === segments.length - 1
            const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")

            return (
              <React.Fragment key={segment}>
                <ChevronRight className="h-4 w-4" />
                {isLast ? (
                  <span className="text-foreground font-medium">{label}</span>
                ) : (
                  <Link href={href} className="hover:text-foreground transition-colors">
                    {label}
                  </Link>
                )}
              </React.Fragment>
            )
          })}
        </>
      )}
    </nav>
  )
}