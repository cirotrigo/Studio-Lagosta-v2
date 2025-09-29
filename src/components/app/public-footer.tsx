import Link from "next/link"
import { site } from "@/lib/brand-config"

export function PublicFooter() {
  return (
    <footer className="border-t mt-24">
      <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground flex flex-col md:flex-row gap-4 items-center justify-between">
        <p>
          © {new Date().getFullYear()} {site.name}. Todos os direitos reservados. Feito por <Link className="hover:text-foreground" href="https://aicoders.academy">AI Coders Academy</Link>
        </p>
        <nav className="flex items-center gap-6">
          <Link className="hover:text-foreground" href="#features">Funcionalidades</Link>
          <Link className="hover:text-foreground" href="#pricing">Preços</Link>
          <Link className="hover:text-foreground" href="#faq">FAQ</Link>
          <Link className="hover:text-foreground" href="/sign-in">Entrar</Link>
        </nav>
      </div>
    </footer>
  )
}
