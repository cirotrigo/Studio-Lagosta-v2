"use client";

import React from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { site } from '@/lib/brand-config'
import { useMenuByLocation } from '@/hooks/use-public-menu'

export function PublicHeader() {
  const [menuState, setMenuState] = React.useState(false)
  const [isScrolled, setIsScrolled] = React.useState(false)

  // Fetch menu from CMS
  const { data: menuData } = useMenuByLocation('header')
  const menuItems = menuData?.menu?.items || []

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header>
      <nav
        data-state={menuState && 'active'}
        className="fixed z-20 w-full px-2 group">
        <div className={cn('mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12', isScrolled && 'bg-background/50 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5')}>
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <Link
                href="/"
                aria-label={site.shortName}
                className="flex items-center space-x-2">
                <Logo />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState == true ? 'Fechar menu' : 'Abrir menu'}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                <Menu className="in-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>
            </div>

            <div
              data-state={menuState && 'active'}
              className="group-data-[state=active]:flex w-full flex-wrap justify-end gap-6 space-y-6 rounded-xl border bg-background/70 p-6 backdrop-blur-md lg:w-auto lg:space-y-0 lg:border-none lg:bg-transparent lg:p-0 lg:backdrop-blur-none lg:flex lg:justify-between">
              <div className="flex w-full flex-col space-y-4 lg:w-auto lg:flex-row lg:items-center lg:space-x-6 lg:space-y-0">
                {menuItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.url}
                    target={item.target || '_self'}
                    className="block text-foreground/80 hover:text-foreground lg:px-3">
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="flex w-full flex-col space-y-4 lg:w-auto lg:flex-row lg:items-center lg:space-x-3 lg:space-y-0">
                <Button asChild variant="ghost">
                  <Link href="/sign-in">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/sign-up">Começar Grátis</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}

function Logo() {
  return (
    <>
      <img src={site.logo.dark} className="size-9 dark:hidden" alt={site.shortName} />
      <img src={site.logo.light} className="hidden size-9 dark:block" alt={site.shortName} />
      <span className="text-lg font-semibold tracking-tight">{site.shortName}</span>
    </>
  )
}
