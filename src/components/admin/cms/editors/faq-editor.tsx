'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'

type FAQItem = {
  question: string
  answer: string
}

type FAQEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function FAQEditor({ content, onChange }: FAQEditorProps) {
  const faqs = (content.faqs as FAQItem[]) || []

  const updateField = (field: string, value: unknown) => {
    onChange({ ...content, [field]: value })
  }

  const addFAQ = () => {
    updateField('faqs', [...faqs, { question: '', answer: '' }])
  }

  const updateFAQ = (index: number, field: keyof FAQItem, value: string) => {
    const newFaqs = [...faqs]
    newFaqs[index] = { ...newFaqs[index], [field]: value }
    updateField('faqs', newFaqs)
  }

  const removeFAQ = (index: number) => {
    updateField('faqs', faqs.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Título</Label>
        <Input
          value={(content.title as string) || ''}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Perguntas Frequentes"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtítulo</Label>
        <Input
          value={(content.subtitle as string) || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          placeholder="Tire suas dúvidas"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Perguntas e Respostas</Label>
          <Button type="button" size="sm" variant="outline" onClick={addFAQ}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Pergunta</Label>
                    <Input
                      value={faq.question}
                      onChange={(e) =>
                        updateFAQ(index, 'question', e.target.value)
                      }
                      placeholder="Digite a pergunta"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Resposta</Label>
                    <Textarea
                      value={faq.answer}
                      onChange={(e) =>
                        updateFAQ(index, 'answer', e.target.value)
                      }
                      placeholder="Digite a resposta"
                      rows={3}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeFAQ(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {faqs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma pergunta adicionada
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
