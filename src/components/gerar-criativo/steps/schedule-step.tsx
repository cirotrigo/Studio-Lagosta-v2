'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Button } from '@/components/ui/button'
import { Check, Calendar, Plus, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { PostComposer } from '@/components/posts/post-composer'

export function ScheduleStep() {
  const { selectedProjectId, generatedCreative, reset } = useGerarCriativo()
  const stepper = useStepper()
  const router = useRouter()
  const [showPostComposer, setShowPostComposer] = useState(true)

  const handleClose = () => {
    setShowPostComposer(false)
  }

  const handleCreateAnother = () => {
    reset()
    stepper.goTo('modelo')
  }

  if (!generatedCreative) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Nenhum criativo gerado.</p>
        <Button variant="outline" onClick={() => stepper.prev()} className="mt-4">
          <ChevronLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Criativo Gerado!</h2>
        <p className="text-muted-foreground mt-1">Agora agende a publicacao</p>
      </div>

      <div className="flex justify-center">
        <img
          src={generatedCreative.resultUrl}
          alt="Criativo gerado"
          className="max-w-[300px] rounded-lg shadow-lg"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button size="lg" onClick={() => setShowPostComposer(true)}>
          <Calendar className="w-4 h-4 mr-2" />
          Agendar Publicacao
        </Button>

        <Button variant="outline" size="lg" onClick={handleCreateAnother}>
          <Plus className="w-4 h-4 mr-2" />
          Criar Outro
        </Button>
      </div>

      {selectedProjectId && (
        <PostComposer
          projectId={selectedProjectId}
          open={showPostComposer}
          onClose={handleClose}
          initialData={{
            postType: 'STORY',
            mediaUrls: [generatedCreative.resultUrl],
            scheduleType: 'SCHEDULED',
          }}
        />
      )}
    </div>
  )
}
