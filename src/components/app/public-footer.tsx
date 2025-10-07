"use client"

import Link from "next/link"
import { site } from "@/lib/brand-config"
import { useMenuByLocation } from "@/hooks/use-public-menu"

export function PublicFooter() {
  const { data: menuData } = useMenuByLocation('footer')
  const menuItems = menuData?.menu?.items || []

  return (
    <footer className="border-t mt-24">
      <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground flex flex-col md:flex-row gap-4 items-center justify-between">
        <p>
          © {new Date().getFullYear()} {site.name}. Todos os direitos reservados. Feito por <Link className="hover:text-foreground" href="https://aicoders.academy">AI Coders Academy</Link>
        </p>
        <nav className="flex items-center gap-6">
          {menuItems.length > 0 ? (
            menuItems.map((item) => (
              <Link
                key={item.id}
                className="hover:text-foreground"
                href={item.url}
                target={item.target || '_self'}
              >
                {item.label}
              </Link>
            ))
          ) : (
            <>
              <Link className="hover:text-foreground" href="#features">Funcionalidades</Link>
              <Link className="hover:text-foreground" href="#pricing">Preços</Link>
              <Link className="hover:text-foreground" href="#faq">FAQ</Link>
              <Link className="hover:text-foreground" href="/sign-in">Entrar</Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  )
}
