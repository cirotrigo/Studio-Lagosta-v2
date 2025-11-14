'use client'

import { useMusicStemStatus, useReprocessStem } from '@/hooks/use-music-stem'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, AlertCircle } from 'lucide-react'

export interface MusicStemProgressProps {
  musicId: number
}

export function MusicStemProgress({ musicId }: MusicStemProgressProps) {
  const { data: status, isLoading } = useMusicStemStatus(musicId)
  const { mutate: reprocessStem, isPending: isReprocessing } = useReprocessStem()

  if (isLoading) {
    return null
  }

  if (!status?.job || status.job.status === 'completed') {
    return null
  }

  if (status.job.status === 'failed') {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              Erro ao processar separação de percussão
            </p>
            {status.job.error && (
              <p className="text-xs text-red-700 mt-1">{status.job.error}</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => reprocessStem(musicId)}
          disabled={isReprocessing}
          className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
        >
          {isReprocessing ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Reenfileirando...
            </>
          ) : (
            'Tentar novamente'
          )}
        </Button>
      </div>
    )
  }

  // Status: pending ou processing
  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-blue-800 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {status.job.status === 'pending'
            ? 'Na fila para processamento...'
            : 'Processando separação de percussão...'}
        </p>
        <span className="text-sm font-medium text-blue-900">{status.job.progress}%</span>
      </div>
      <Progress value={status.job.progress} className="h-2 bg-blue-100" />
      {status.job.status === 'pending' && (
        <p className="text-xs text-blue-700 mt-1">
          Seu processamento começará em breve. A música original já está disponível.
        </p>
      )}
    </div>
  )
}
