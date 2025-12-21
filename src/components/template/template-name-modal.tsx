'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TemplateNameModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (name: string) => void
  isLoading?: boolean
}

export function TemplateNameModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: TemplateNameModalProps) {
  const [templateName, setTemplateName] = useState('')
  const [error, setError] = useState('')

  const handleConfirm = () => {
    // Validação
    if (!templateName.trim()) {
      setError('O nome do modelo é obrigatório')
      return
    }

    if (templateName.length < 3) {
      setError('O nome deve ter pelo menos 3 caracteres')
      return
    }

    if (templateName.length > 50) {
      setError('O nome deve ter no máximo 50 caracteres')
      return
    }

    onConfirm(templateName)
    setTemplateName('')
    setError('')
  }

  const handleClose = () => {
    setTemplateName('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nomear Modelo</DialogTitle>
          <DialogDescription>
            Dê um nome para este modelo. Este nome será exibido na lista de modelos
            disponíveis no Gerador de Criativos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Nome do Modelo</Label>
            <Input
              id="template-name"
              placeholder="Ex: Promoção Especial, Story Padrão..."
              value={templateName}
              onChange={(e) => {
                setTemplateName(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleConfirm()
                }
              }}
              disabled={isLoading}
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !templateName.trim()}
          >
            {isLoading ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}