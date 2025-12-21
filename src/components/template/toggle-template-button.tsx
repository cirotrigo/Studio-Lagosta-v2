'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bookmark, BookmarkX } from 'lucide-react'
import { useToggleTemplate } from '@/hooks/use-toggle-template'
import { TemplateNameModal } from './template-name-modal'

interface ToggleTemplateButtonProps {
  templateId: number
  pageId: string
  isTemplate: boolean
  templateName?: string | null
  disabled?: boolean
}

export function ToggleTemplateButton({
  templateId,
  pageId,
  isTemplate,
  templateName,
  disabled = false,
}: ToggleTemplateButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const toggleTemplate = useToggleTemplate(templateId)

  const handleToggle = () => {
    if (!isTemplate) {
      // Abrir modal para nomear o modelo
      setIsModalOpen(true)
    } else {
      // Desmarcar como modelo
      toggleTemplate.mutate({
        pageId,
        isTemplate: false,
      })
    }
  }

  const handleConfirmTemplate = (name: string) => {
    toggleTemplate.mutate({
      pageId,
      isTemplate: true,
      templateName: name,
    })
    setIsModalOpen(false)
  }

  return (
    <>
      {isTemplate ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-medium">
            Modelo: {templateName}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleToggle}
            disabled={disabled || toggleTemplate.isPending}
            title="Desmarcar como modelo"
          >
            <BookmarkX className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleToggle}
          disabled={disabled || toggleTemplate.isPending}
          title="Marcar como modelo"
        >
          <Bookmark className="h-4 w-4" />
          <span className="ml-2">Marcar como Modelo</span>
        </Button>
      )}

      <TemplateNameModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmTemplate}
        isLoading={toggleTemplate.isPending}
      />
    </>
  )
}