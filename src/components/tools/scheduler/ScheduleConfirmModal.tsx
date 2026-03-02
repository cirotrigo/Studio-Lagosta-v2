"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { ToolsProject } from '@/hooks/tools/useToolsProjects'
import { ProjectBadge } from '@/components/tools/ProjectBadge'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ScheduleConfirmModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  project: ToolsProject
  postSummary: {
    postType: string
    scheduledDatetime?: Date | null
    imageCount: number
    caption: string
  }
  isLoading: boolean
}

const TYPE_LABELS: Record<string, string> = {
  POST: 'Post de Feed',
  STORY: 'Story',
  REEL: 'Reel',
  CAROUSEL: 'Carrossel',
}

export function ScheduleConfirmModal({
  open,
  onConfirm,
  onCancel,
  project,
  postSummary,
  isLoading,
}: ScheduleConfirmModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="bg-[#161616] border-[#27272A] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[#FAFAFA] flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmar agendamento
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              {/* Project badge - prominent */}
              <div className="flex justify-center">
                <ProjectBadge project={project} />
              </div>

              {/* Summary */}
              <div className="rounded-lg bg-[#1a1a1a] border border-[#27272A] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#71717A]">Tipo</span>
                  <span className="text-[#FAFAFA] font-medium">
                    {TYPE_LABELS[postSummary.postType] || postSummary.postType}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#71717A]">Imagens</span>
                  <span className="text-[#FAFAFA] font-medium">
                    {postSummary.imageCount} {postSummary.imageCount === 1 ? 'imagem' : 'imagens'}
                  </span>
                </div>
                {postSummary.scheduledDatetime && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#71717A]">Data/Hora</span>
                    <span className="text-[#FAFAFA] font-medium">
                      {format(postSummary.scheduledDatetime, "dd MMM yyyy · HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {postSummary.caption && (
                  <div className="pt-1 border-t border-[#27272A]">
                    <p className="text-[11px] text-[#A1A1AA] line-clamp-3 leading-relaxed">
                      {postSummary.caption}
                    </p>
                  </div>
                )}
              </div>

              {/* Warning */}
              {project.instagramUsername && (
                <p className="text-xs text-amber-400 text-center font-medium">
                  Este post será publicado no perfil @{project.instagramUsername}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            className="bg-[#1a1a1a] border-[#27272A] text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            disabled={isLoading}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-amber-500 text-black hover:bg-amber-400 font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Publicando...
              </>
            ) : (
              'Confirmar e agendar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
