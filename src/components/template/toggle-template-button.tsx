'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToggleTemplate } from '@/hooks/use-toggle-template'

interface ToggleTemplateButtonProps {
  templateId: number
  pageId: string
  isTemplate: boolean
  disabled?: boolean
}

export function ToggleTemplateButton({
  templateId,
  pageId,
  isTemplate,
  disabled = false,
}: ToggleTemplateButtonProps) {
  const toggleTemplate = useToggleTemplate(templateId)

  // Estado local para UI otimista
  const [localChecked, setLocalChecked] = useState(isTemplate)

  // Sincronizar com prop quando ela mudar (após mutação bem-sucedida ou troca de página)
  useEffect(() => {
    setLocalChecked(isTemplate)
  }, [isTemplate, pageId])

  const handleToggle = (checked: boolean) => {
    // Guardar estado anterior para rollback
    const previousState = localChecked

    // Atualizar UI imediatamente (otimista)
    setLocalChecked(checked)

    // Enviar mutação
    toggleTemplate.mutate(
      {
        pageId,
        isTemplate: checked,
      },
      {
        onError: () => {
          // Reverter estado local em caso de erro
          setLocalChecked(previousState)
        },
      }
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`template-toggle-${pageId}`}
        checked={localChecked}
        onCheckedChange={handleToggle}
        disabled={disabled || toggleTemplate.isPending}
      />
      <Label
        htmlFor={`template-toggle-${pageId}`}
        className="text-sm font-medium cursor-pointer"
      >
        Página Modelo
      </Label>
    </div>
  )
}