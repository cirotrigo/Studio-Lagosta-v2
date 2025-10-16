"use client"

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Copy, Edit2, Trash2, Check } from 'lucide-react'
import { useDeletePrompt } from '@/hooks/use-prompts'
import { useToast } from '@/hooks/use-toast'
import type { Prompt } from '@/types/prompt'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PromptCardProps {
  prompt: Prompt
  onEdit: (prompt: Prompt) => void
}

export function PromptCard({ prompt, onEdit }: PromptCardProps) {
  const { toast } = useToast()
  const deleteMutation = useDeletePrompt();
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content)
      setCopied(true)
      toast({ description: 'Prompt copiado para a área de transferência!' })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        variant: 'destructive',
        description: 'Erro ao copiar prompt',
      })
    }
  }

  const handleDelete = async () => {
    if (confirm(`Tem certeza que deseja deletar o prompt "${prompt.title}"?`)) {
      try {
        await deleteMutation.mutateAsync(prompt.id)
        toast({ description: 'Prompt deletado com sucesso!' })
      } catch (error) {
        toast({
          variant: 'destructive',
          description: 'Erro ao deletar prompt',
        })
      }
    }
  }

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            <h3 className="font-semibold text-base truncate flex-1">
              {prompt.title}
            </h3>
            {prompt.category && (
              <Badge variant="outline" className="shrink-0">
                {prompt.category}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
            {prompt.content}
          </p>

          {prompt.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {prompt.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {prompt.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{prompt.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(prompt.createdAt), {
                addSuffix: true,
                locale: ptBR,
              })}
            </p>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="text-xs">Copiar</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(prompt)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Deletar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
