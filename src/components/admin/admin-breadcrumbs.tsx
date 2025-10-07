'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

// Map of paths to readable names
const pathNames: Record<string, string> = {
  admin: 'Painel',
  content: 'Conteúdo',
  pages: 'Páginas',
  menus: 'Menus',
  components: 'Componentes',
  media: 'Mídias',
  users: 'Usuários',
  credits: 'Créditos',
  storage: 'Armazenamento',
  knowledge: 'Base de Conhecimento',
  usage: 'Histórico de Uso',
  settings: 'Configurações',
  features: 'Custos por Funcionalidade',
  plans: 'Planos de Assinatura',
}

export function AdminBreadcrumbs() {
  const pathname = usePathname()

  // Don't show breadcrumbs on the main admin page
  if (pathname === '/admin') {
    return null
  }

  const paths = pathname.split('/').filter(Boolean)

  // Build breadcrumb items
  const breadcrumbItems = paths.map((path, index) => {
    const href = '/' + paths.slice(0, index + 1).join('/')
    const isLast = index === paths.length - 1
    const name = pathNames[path] || path

    return {
      href,
      name,
      isLast,
    }
  })

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => (
          <div key={item.href} className="flex items-center">
            {index > 0 && (
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
            )}
            <BreadcrumbItem>
              {item.isLast ? (
                <BreadcrumbPage>{item.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.name}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
