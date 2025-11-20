"use client"

import * as React from 'react'
import { TemplateEditorShell } from './template-editor-shell'
import { useTemplate } from '@/hooks/use-template'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface TemplateEditorClientProps {
  templateId: number
  prefillDriveImage?: {
    fileId: string
    fileName?: string
  }
}

export function TemplateEditorClient({ templateId, prefillDriveImage }: TemplateEditorClientProps) {
  const { data, isLoading, isError, refetch } = useTemplate(Number.isFinite(templateId) ? templateId : null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 2xl:grid-cols-[400px_minmax(0,1fr)_340px] xl:grid-cols-[380px_minmax(0,1fr)_320px] lg:grid-cols-[360px_minmax(0,1fr)_300px]">
          <Skeleton className="h-[480px] w-full" />
          <Skeleton className="h-[480px] w-full" />
          <Skeleton className="h-[480px] w-full" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border/40 bg-card/60 p-10 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          Não foi possível carregar o template solicitado.
        </p>
        <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  return <TemplateEditorShell template={data} prefillDriveImage={prefillDriveImage} />
}
