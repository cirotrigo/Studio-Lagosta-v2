'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

type FAQItem = {
  question: string
  answer: string
}

type FAQContent = {
  title?: string
  subtitle?: string
  faqs?: FAQItem[]
}

type CMSFAQProps = {
  content: FAQContent
}

export function CMSFAQ({ content }: CMSFAQProps) {
  const { title, subtitle, faqs } = content

  if (!faqs || faqs.length === 0) return null

  return (
    <section id="faq" className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-12">
          {title && (
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-3 text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
