'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useCreatePage } from '@/hooks/admin/use-admin-cms'
import { useToast } from '@/hooks/use-toast'

const createPageSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug deve conter apenas letras minúsculas, números e hífens'
    ),
  path: z
    .string()
    .min(1, 'Caminho é obrigatório')
    .regex(/^\//, 'Caminho deve começar com /'),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  isHome: z.boolean().default(false),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
})

type CreatePageFormData = z.infer<typeof createPageSchema>

type CreatePageDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreatePageDialog({ open, onOpenChange }: CreatePageDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [autoGenerateSlug, setAutoGenerateSlug] = useState(true)
  const [autoGeneratePath, setAutoGeneratePath] = useState(true)

  const createMutation = useCreatePage()

  const form = useForm<CreatePageFormData>({
    resolver: zodResolver(createPageSchema),
    defaultValues: {
      title: '',
      slug: '',
      path: '',
      description: '',
      status: 'DRAFT',
      isHome: false,
      metaTitle: '',
      metaDesc: '',
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

  const handleTitleChange = (value: string) => {
    form.setValue('title', value)

    if (autoGenerateSlug) {
      const slug = generateSlug(value)
      form.setValue('slug', slug)

      if (autoGeneratePath) {
        form.setValue('path', `/${slug}`)
      }
    }
  }

  const handleSlugChange = (value: string) => {
    const slug = generateSlug(value)
    form.setValue('slug', slug)

    if (autoGeneratePath && slug) {
      form.setValue('path', `/${slug}`)
    }
  }

  const onSubmit = async (data: CreatePageFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        title: data.title,
        slug: data.slug,
        path: data.path,
        description: data.description,
        status: data.status,
        isHome: data.isHome,
        metaTitle: data.metaTitle,
        metaDesc: data.metaDesc,
      })
      toast({
        title: 'Página criada',
        description: 'A página foi criada com sucesso.',
      })
      onOpenChange(false)
      form.reset()
      router.push(`/admin/content/pages/${result.page.id}`)
    } catch (_error) {
      toast({
        title: 'Erro ao criar página',
        description: 'Não foi possível criar a página. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Página</DialogTitle>
          <DialogDescription>
            Crie uma nova página para o seu site.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Minha Nova Página"
                      {...field}
                      onChange={(e) => handleTitleChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Slug */}
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="minha-nova-pagina"
                      {...field}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      disabled={autoGenerateSlug}
                    />
                  </FormControl>
                  <FormDescription className="flex items-center gap-2">
                    <Switch
                      checked={autoGenerateSlug}
                      onCheckedChange={setAutoGenerateSlug}
                    />
                    Gerar automaticamente do título
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Path */}
            <FormField
              control={form.control}
              name="path"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caminho (URL)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="/minha-nova-pagina"
                      {...field}
                      disabled={autoGeneratePath}
                    />
                  </FormControl>
                  <FormDescription className="flex items-center gap-2">
                    <Switch
                      checked={autoGeneratePath}
                      onCheckedChange={setAutoGeneratePath}
                    />
                    Gerar automaticamente do slug
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Breve descrição da página..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DRAFT">Rascunho</SelectItem>
                        <SelectItem value="PUBLISHED">Publicado</SelectItem>
                        <SelectItem value="ARCHIVED">Arquivado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Is Home */}
              <FormField
                control={form.control}
                name="isHome"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Página Inicial</FormLabel>
                      <FormDescription className="text-xs">
                        Definir como home page
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
            </div>

            {/* SEO Fields */}
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium">SEO (opcional)</h3>

              <FormField
                control={form.control}
                name="metaTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta Título</FormLabel>
                    <FormControl>
                      <Input placeholder="Título para SEO..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="metaDesc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descrição para SEO..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                Criar Página
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
