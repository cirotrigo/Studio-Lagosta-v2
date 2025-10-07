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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateComponent } from '@/hooks/admin/use-admin-components'
import { useToast } from '@/hooks/use-toast'

const createComponentSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .regex(
      /^[a-z0-9-]+$/,
      'Slug deve conter apenas letras minúsculas, números e hífens'
    ),
  description: z.string().optional(),
  type: z.string().min(1, 'Tipo é obrigatório'),
  isGlobal: z.boolean().default(false),
})

type CreateComponentFormData = z.infer<typeof createComponentSchema>

type CreateComponentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateComponentDialog({
  open,
  onOpenChange,
}: CreateComponentDialogProps) {
  const { toast } = useToast()
  const createMutation = useCreateComponent()

  const form = useForm<CreateComponentFormData>({
    resolver: zodResolver(createComponentSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      type: 'CUSTOM',
      isGlobal: false,
    },
  })

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  }

  const handleNameChange = (value: string) => {
    form.setValue('name', value)
    const slug = generateSlug(value)
    form.setValue('slug', slug)
  }

  const onSubmit = async (data: CreateComponentFormData) => {
    try {
      // Create component with empty content based on type
      const content = getDefaultContent(data.type)

      await createMutation.mutateAsync({
        name: data.name,
        slug: data.slug,
        description: data.description,
        type: data.type,
        content,
        isGlobal: data.isGlobal,
      })

      toast({
        title: 'Componente criado',
        description: 'O componente foi criado com sucesso.',
      })

      form.reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Erro ao criar componente',
        description: 'Não foi possível criar o componente. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Componente</DialogTitle>
          <DialogDescription>
            Crie um componente reutilizável para usar em suas páginas.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Componente</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Hero Personalizado"
                      {...field}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="hero-personalizado" {...field} />
                  </FormControl>
                  <FormDescription>Identificador único</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o propósito deste componente..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="HERO">Hero</SelectItem>
                      <SelectItem value="BENTO_GRID">Bento Grid</SelectItem>
                      <SelectItem value="FAQ">FAQ</SelectItem>
                      <SelectItem value="AI_STARTER">AI Starter</SelectItem>
                      <SelectItem value="PRICING">Pricing</SelectItem>
                      <SelectItem value="CTA">CTA</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Tipo de seção que este componente representa
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isGlobal"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Componente Global</FormLabel>
                    <FormDescription className="text-xs">
                      Componentes globais podem ser usados em qualquer página
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
                Criar Componente
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// Helper function to get default content based on type
function getDefaultContent(type: string): any {
  switch (type) {
    case 'HERO':
      return {
        badge: { text: '', link: '' },
        title: { lines: ['Título do Hero'] },
        description: '',
        ctas: [],
      }
    case 'BENTO_GRID':
      return {
        title: 'Título',
        subtitle: '',
        items: [],
      }
    case 'FAQ':
      return {
        title: 'Perguntas Frequentes',
        subtitle: '',
        faqs: [],
      }
    case 'AI_STARTER':
      return {
        title: 'Título',
        subtitle: '',
        cards: [],
      }
    case 'PRICING':
      return {
        title: 'Planos',
        subtitle: '',
        showPlans: true,
      }
    case 'CTA':
      return {
        title: 'Call to Action',
        description: '',
        cta: { text: 'Começar', href: '#' },
      }
    case 'CUSTOM':
    default:
      return {}
  }
}
