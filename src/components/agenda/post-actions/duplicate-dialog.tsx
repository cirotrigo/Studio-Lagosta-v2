'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar as CalendarIcon, Clock, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePostActions } from '@/hooks/use-post-actions'
import { toast } from 'sonner'
import type { SocialPost } from '../../../../prisma/generated/client'

interface DuplicateDialogProps {
  post: SocialPost | null
  open: boolean
  onClose: () => void
}

export function DuplicateDialog({ post, open, onClose }: DuplicateDialogProps) {
  const [date, setDate] = useState<Date>()
  const [time, setTime] = useState('12:00')
  const { duplicatePost } = usePostActions(post?.projectId || 0)

  // Reset form when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
      // Reset after animation
      setTimeout(() => {
        setDate(undefined)
        setTime('12:00')
      }, 300)
    }
  }

  const handleDuplicate = async () => {
    if (!post) return

    if (!date) {
      toast.error('Selecione uma data')
      return
    }

    try {
      // Combine date and time
      const [hours, minutes] = time.split(':').map(Number)
      const scheduledDatetime = new Date(date)
      scheduledDatetime.setHours(hours, minutes, 0, 0)

      // Check if date is in the future
      if (scheduledDatetime <= new Date()) {
        toast.error('A data deve ser no futuro')
        return
      }

      // Call custom mutation with scheduled time
      await duplicatePost.mutateAsync({
        postId: post.id,
        scheduledDatetime: scheduledDatetime.toISOString(),
      })

      toast.success('Post duplicado com sucesso!', {
        description: `Agendado para ${format(scheduledDatetime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
      })
      onClose()
    } catch (error) {
      console.error('Error duplicating post:', error)
      toast.error('Erro ao duplicar post')
    }
  }

  if (!post) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Duplicar Post
          </DialogTitle>
          <DialogDescription>
            Escolha quando deseja publicar a duplicata deste post.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Picker */}
          <div className="space-y-2">
            <Label htmlFor="date">Data de publicação</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP', { locale: ptBR }) : 'Selecione uma data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Picker */}
          <div className="space-y-2">
            <Label htmlFor="time">Horário</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* Preview */}
          {date && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              <p className="font-medium mb-1">Resumo:</p>
              <p className="text-muted-foreground">
                O post será duplicado e agendado para{' '}
                <span className="font-medium text-foreground">
                  {format(date, "dd/MM/yyyy", { locale: ptBR })} às {time}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleDuplicate} disabled={!date || duplicatePost.isPending}>
            {duplicatePost.isPending ? 'Duplicando...' : 'Duplicar Post'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
