"use client"

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  BarChart3,
  Wand2,
  Hash,
  Settings,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ProjectSelector } from '@/components/tools/ProjectSelector'
import { DynamicLogo } from '@/components/app/dynamic-logo'
import { UserButton } from '@clerk/nextjs'

interface ToolsSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const toolNavItems = [
  { name: 'Agendador', href: '/tools/scheduler', icon: CalendarDays, enabled: true },
  { name: 'Analytics', href: '/tools/analytics', icon: BarChart3, enabled: false },
  { name: 'Criativo Rápido', href: '/tools/quick-creative', icon: Wand2, enabled: false },
  { name: 'Hashtag Manager', href: '/tools/hashtags', icon: Hash, enabled: false },
]

export function ToolsSidebar({ collapsed, onToggle }: ToolsSidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-[#111111] border-r border-[#1a1a1a] transition-[width] duration-200 ease-in-out flex-shrink-0',
        collapsed ? 'w-[64px]' : 'w-[240px]'
      )}
    >
      {/* Header: Logo + collapse toggle */}
      <div className="flex h-14 items-center gap-2 px-3 border-b border-[#1a1a1a]">
        {collapsed ? (
          <Link href="/studio" className="flex items-center justify-center flex-1">
            <DynamicLogo useFull={false} className="w-8 h-8" />
          </Link>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio"
                  className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-white/5 text-[#71717A] hover:text-[#A1A1AA] transition-colors duration-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Voltar ao painel</TooltipContent>
            </Tooltip>
            <Link href="/tools" className="flex-1 min-w-0">
              <DynamicLogo useFull className="h-8" />
            </Link>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-7 w-7 text-[#71717A] hover:text-[#A1A1AA] flex-shrink-0"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Project Selector */}
      <div className={cn('px-2 py-3', collapsed && 'px-1.5')}>
        {!collapsed && (
          <p className="px-2 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[#71717A]">
            Projeto
          </p>
        )}
        <ProjectSelector collapsed={collapsed} />
      </div>

      <div className="px-2">
        <div className="h-px bg-[#1a1a1a]" />
      </div>

      {/* Tool Navigation */}
      <ScrollArea className="flex-1 px-2 py-3">
        {!collapsed && (
          <p className="px-2 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[#71717A]">
            Ferramentas
          </p>
        )}
        <nav className="flex flex-col gap-0.5">
          {toolNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const content = (
              <div
                key={item.name}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                  collapsed && 'justify-center px-2',
                  item.enabled
                    ? isActive
                      ? 'bg-amber-500/10 text-amber-500 border-l-[3px] border-amber-500 ml-0'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/5'
                    : 'opacity-40 cursor-not-allowed text-[#71717A]'
                )}
              >
                <item.icon className={cn('flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-xs font-medium">{item.name}</span>
                    {!item.enabled && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#27272A] text-[#71717A]">
                        Em breve
                      </span>
                    )}
                  </>
                )}
              </div>
            )

            if (item.enabled) {
              const link = (
                <Link key={item.name} href={item.href}>
                  {content}
                </Link>
              )
              if (collapsed) {
                return (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  </Tooltip>
                )
              }
              return link
            }

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent side="right">
                    {item.name} — Em breve
                  </TooltipContent>
                </Tooltip>
              )
            }

            return <React.Fragment key={item.name}>{content}</React.Fragment>
          })}
        </nav>
      </ScrollArea>

      {/* Footer: Settings + User */}
      <div className="border-t border-[#1a1a1a] p-2">
        <div className="flex flex-col gap-1">
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/tools/settings"
                    className="flex items-center justify-center h-9 w-9 rounded-lg text-[#71717A] hover:text-[#A1A1AA] hover:bg-white/5 transition-colors duration-200 mx-auto"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Configurações</TooltipContent>
              </Tooltip>
              <div className="flex justify-center py-1">
                <UserButton
                  appearance={{
                    elements: { avatarBox: 'h-7 w-7' },
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1">
              <UserButton
                appearance={{
                  elements: { avatarBox: 'h-7 w-7' },
                }}
              />
              <div className="flex-1" />
              <Link
                href="/tools/settings"
                className="flex items-center justify-center h-7 w-7 rounded-md text-[#71717A] hover:text-[#A1A1AA] hover:bg-white/5 transition-colors duration-200"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
