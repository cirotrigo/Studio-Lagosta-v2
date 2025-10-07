'use client'

type CustomContent = {
  html?: string
}

type CMSCustomProps = {
  content: CustomContent
}

export function CMSCustom({ content }: CMSCustomProps) {
  const { html } = content

  if (!html) return null

  return (
    <section className="container mx-auto px-4 py-24">
      <div
        className="prose prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
