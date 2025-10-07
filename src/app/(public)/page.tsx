import { notFound } from 'next/navigation'
import { getHomePage } from '@/lib/cms/queries'
import { CMSSectionRenderer } from '@/components/cms/cms-section-renderer'

export const revalidate = 60 // ISR - revalidate every 60 seconds

export default async function HomePage() {
  const page = await getHomePage()

  if (!page) {
    notFound()
  }

  return (
    <div className="min-h-screen">
      {page.sections
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <CMSSectionRenderer key={section.id} section={section} />
        ))}
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
