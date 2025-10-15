'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Menu as MenuIcon, Package, Image } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useAdminPages } from '@/hooks/admin/use-admin-cms'
import { useAdminMenus } from '@/hooks/admin/use-admin-menus'
import { useAdminComponents } from '@/hooks/admin/use-admin-components'
import { useAdminMedia } from '@/hooks/admin/use-admin-media'

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch data
  const { data: pagesData } = useAdminPages()
  const { data: menusData } = useAdminMenus()
  const { data: componentsData } = useAdminComponents()
  const { data: mediaData } = useAdminMedia()

  // Filter results based on search
  const filteredPages = pagesData?.pages.filter((page) =>
    page.title.toLowerCase().includes(search.toLowerCase()) ||
    page.slug.toLowerCase().includes(search.toLowerCase())
  ) || []

  const filteredMenus = menusData?.menus.filter((menu) =>
    menu.name.toLowerCase().includes(search.toLowerCase()) ||
    menu.location.toLowerCase().includes(search.toLowerCase())
  ) || []

  const filteredComponents = componentsData?.components.filter((component) =>
    component.name.toLowerCase().includes(search.toLowerCase()) ||
    component.type.toLowerCase().includes(search.toLowerCase())
  ) || []

  const filteredMedia = mediaData?.media.filter((media) =>
    media.name.toLowerCase().includes(search.toLowerCase()) ||
    media.filename.toLowerCase().includes(search.toLowerCase())
  ) || []

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false)
    callback()
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar páginas, menus, componentes..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        {/* Pages */}
        {filteredPages.length > 0 && (
          <CommandGroup heading="Páginas">
            {filteredPages.slice(0, 5).map((page) => (
              <CommandItem
                key={page.id}
                value={page.title}
                onSelect={() => handleSelect(() => router.push(`/admin/content/pages/${page.id}`))}
              >
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div>{page.title}</div>
                  <div className="text-xs text-muted-foreground">/{page.slug}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Menus */}
        {filteredMenus.length > 0 && (
          <CommandGroup heading="Menus">
            {filteredMenus.slice(0, 5).map((menu) => (
              <CommandItem
                key={menu.id}
                value={menu.name}
                onSelect={() => handleSelect(() => router.push(`/admin/content/menus/${menu.id}`))}
              >
                <MenuIcon className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div>{menu.name}</div>
                  <div className="text-xs text-muted-foreground">{menu.location}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Components */}
        {filteredComponents.length > 0 && (
          <CommandGroup heading="Componentes">
            {filteredComponents.slice(0, 5).map((component) => (
              <CommandItem
                key={component.id}
                value={component.name}
                onSelect={() => handleSelect(() => router.push(`/admin/content/components/${component.id}`))}
              >
                <Package className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div>{component.name}</div>
                  <div className="text-xs text-muted-foreground">{component.type}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Media */}
        {filteredMedia.length > 0 && (
          <CommandGroup heading="Mídias">
            {filteredMedia.slice(0, 5).map((media) => (
              <CommandItem
                key={media.id}
                value={media.name}
                onSelect={() => handleSelect(() => router.push('/admin/content/media'))}
              >
                <Image className="mr-2 h-4 w-4" alt="" />
                <div className="flex-1">
                  <div>{media.name}</div>
                  <div className="text-xs text-muted-foreground">{media.mimeType}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
