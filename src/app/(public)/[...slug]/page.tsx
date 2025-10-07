import { notFound } from 'next/navigation'
import { getPageByPath, getPublishedPages } from '@/lib/cms/queries'
import { CMSSectionRenderer } from '@/components/cms/cms-section-renderer'

type PageProps = {
  params: Promise<{ slug: string[] }>
}

export const revalidate = 60 // ISR - revalidate every 60 seconds

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params
  const path = `/${slug.join('/')}`

  const page = await getPageByPath(path)

  if (!page || page.status !== 'PUBLISHED') {
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

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const path = `/${slug.join('/')}`

  const page = await getPageByPath(path)

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

// Generate static params for published pages
export async function generateStaticParams() {
  try {
    const pages = await getPublishedPages()

    return pages
      .filter((page) => !page.isHome) // Exclude home page
      .map((page) => ({
        slug: page.path.split('/').filter(Boolean),
      }))
  } catch (error) {
    console.error('Error generating static params:', error)
    return []
  }
}
