'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateSection, type CMSSection } from '@/hooks/admin/use-admin-cms'
import { useToast } from '@/hooks/use-toast'

const sectionTypes = [
  { value: 'HERO', label: 'Hero', description: 'Seção hero principal com CTAs' },
  { value: 'BENTO_GRID', label: 'Grade de Recursos', description: 'Grid de features/recursos' },
  { value: 'FAQ', label: 'FAQ', description: 'Perguntas frequentes' },
  { value: 'AI_STARTER', label: 'Compatibilidade IA', description: 'Seção de compatibilidade com IA' },
  { value: 'PRICING', label: 'Preços', description: 'Tabela de planos e preços' },
  { value: 'CTA', label: 'Call to Action', description: 'Seção de chamada para ação' },
  { value: 'CUSTOM', label: 'Personalizado', description: 'Seção customizada' },
] as const

const addSectionSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['HERO', 'BENTO_GRID', 'FAQ', 'AI_STARTER', 'PRICING', 'CTA', 'CUSTOM']),
})

type AddSectionFormData = z.infer<typeof addSectionSchema>

type AddSectionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  onSectionCreated: (section: CMSSection) => void
}

// Default content templates for each section type
const defaultContent: Record<string, Record<string, unknown>> = {
  HERO: {
    badge: { text: 'Novo', link: '#' },
    title: { lines: ['Título', 'da Seção'] },
    description: 'Descrição da seção hero',
    ctas: [
      { text: 'Botão Primário', href: '#', variant: 'default' },
      { text: 'Botão Secundário', href: '#', variant: 'outline' },
    ],
  },
  BENTO_GRID: {
    title: 'Grade de Recursos',
    subtitle: 'Subtítulo da grade',
    features: [],
  },
  FAQ: {
    title: 'Perguntas Frequentes',
    subtitle: 'Tire suas dúvidas',
    faqs: [],
  },
  AI_STARTER: {
    badge: 'IA',
    title: 'Compatibilidade com IA',
    subtitle: 'Integre com as melhores ferramentas',
    tools: [],
    cards: [],
  },
  PRICING: {
    title: 'Planos e Preços',
    subtitle: 'Escolha o melhor plano',
    displayMode: 'from_database',
  },
  CTA: {
    title: 'Call to Action',
    description: 'Descrição do CTA',
    button: { text: 'Clique aqui', href: '#' },
  },
  CUSTOM: {
    html: '<div>Conteúdo personalizado</div>',
  },
}

export function AddSectionDialog({
  open,
  onOpenChange,
  pageId,
  onSectionCreated,
}: AddSectionDialogProps) {
  const { toast } = useToast()
  const createMutation = useCreateSection()

  const form = useForm<AddSectionFormData>({
    resolver: zodResolver(addSectionSchema),
    defaultValues: {
      name: '',
      type: 'HERO',
    },
  })

  const selectedType = form.watch('type')
  const selectedTypeInfo = sectionTypes.find((t) => t.value === selectedType)

  const onSubmit = async (data: AddSectionFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        pageId,
        name: data.name,
        type: data.type,
        content: defaultContent[data.type] || {},
        isVisible: true,
      })

      toast({
        title: 'Seção criada',
        description: 'A seção foi criada com sucesso.',
      })

      form.reset()
      onSectionCreated(result.section)
    } catch (_error) {
      toast({
        title: 'Erro ao criar seção',
        description: 'Não foi possível criar a seção. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Nova Seção</DialogTitle>
          <DialogDescription>
            Escolha o tipo de seção que deseja adicionar à página.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Seção</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Hero Principal" {...field} />
                  </FormControl>
                  <FormDescription>
                    Um nome descritivo para identificar esta seção
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Seção</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sectionTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTypeInfo && (
                    <FormDescription>
                      {selectedTypeInfo.description}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Criar Seção
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
