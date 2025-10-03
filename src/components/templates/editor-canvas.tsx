"use client"

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const KonvaEditorStage = dynamic(
  () => import('./konva-editor-stage').then((mod) => mod.KonvaEditorStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full flex-1 items-center justify-center overflow-auto rounded-lg border border-border/40 bg-muted/50 p-8">
        <Skeleton className="h-[480px] w-full" />
      </div>
    ),
  },
)

export function EditorCanvas() {
  return <KonvaEditorStage />
}
