import { notFound } from "next/navigation"
import { getHomePage } from "@/lib/cms/queries"
import { CMSSectionRenderer } from "@/components/cms/cms-section-renderer"
import { PublicHeader } from "@/components/app/public-header"
import { PublicFooter } from "@/components/app/public-footer"
import { CookieConsent } from "@/components/app/cookie-consent"

export const revalidate = 60

export default async function HomePage() {
  const page = await getHomePage()

  if (!page) {
    notFound()
  }

  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <PublicHeader />
      <main className="min-h-screen">
        {page.sections
          .sort((a, b) => a.order - b.order)
          .map((section) => (
            <CMSSectionRenderer key={section.id} section={section} />
          ))}
      </main>
      <PublicFooter />
      <CookieConsent />
    </div>
  )
}

export async function generateMetadata() {
  const page = await getHomePage()

  if (!page) {
    return {
      title: 'Página não encontrada',
    }
  }

  return {
    title: page.metaTitle || page.title,
    description: page.metaDesc || page.description,
    openGraph: {
      title: page.metaTitle || page.title,
      description: page.metaDesc || page.description,
      images: page.ogImage ? [{ url: page.ogImage }] : undefined,
    },
  }
}
