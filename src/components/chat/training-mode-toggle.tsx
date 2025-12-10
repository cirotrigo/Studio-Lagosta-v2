'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Brain, MessageCircle, HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TrainingModeToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export function TrainingModeToggle({ enabled, onChange }: TrainingModeToggleProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        id="training-mode"
        className="data-[state=checked]:bg-primary"
      />

      <Label htmlFor="training-mode" className="flex flex-1 cursor-pointer items-center gap-2">
        {enabled ? (
          <>
            <Brain className="h-4 w-4 text-primary" />
            <span className="font-medium">Modo Treinamento</span>
            <Badge variant="secondary">ON</Badge>
          </>
        ) : (
          <>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Modo Consulta</span>
          </>
        )}
      </Label>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
            {enabled ? (
              <p>
                Ensine a IA sobre o projeto. As mensagens serão transformadas em conhecimento
                estruturado para o RAG.
              </p>
            ) : (
              <p>
                Faça perguntas e gere conteúdo usando a base de conhecimento existente do projeto.
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
