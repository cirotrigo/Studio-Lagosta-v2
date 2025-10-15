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
import { Switch } from '@/components/ui/switch'
import { useCreateMenu } from '@/hooks/admin/use-admin-menus'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

const createMenuSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  location: z.string().min(1, 'Localização é obrigatória'),
  isActive: z.boolean().default(true),
})

type CreateMenuFormData = z.infer<typeof createMenuSchema>

type CreateMenuDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateMenuDialog({ open, onOpenChange }: CreateMenuDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const createMutation = useCreateMenu()

  const form = useForm<CreateMenuFormData>({
    resolver: zodResolver(createMenuSchema),
    defaultValues: {
      name: '',
      slug: '',
      location: 'header',
      isActive: true,
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

  const onSubmit = async (data: CreateMenuFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        slug: data.slug,
        location: data.location,
        isActive: data.isActive,
      })
      toast({
        title: 'Menu criado',
        description: 'O menu foi criado com sucesso.',
      })
      form.reset()
      onOpenChange(false)
      router.push(`/admin/content/menus/${result.menu.id}`)
    } catch (_error) {
      toast({
        title: 'Erro ao criar menu',
        description: 'Não foi possível criar o menu. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Menu</DialogTitle>
          <DialogDescription>
            Crie um novo menu de navegação para o seu site.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Menu</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Menu Principal"
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
                    <Input placeholder="menu-principal" {...field} />
                  </FormControl>
                  <FormDescription>
                    Identificador único para o menu
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização</FormLabel>
                  <FormControl>
                    <Input placeholder="header, footer, etc." {...field} />
                  </FormControl>
                  <FormDescription>
                    Onde o menu será exibido no site
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Menu Ativo</FormLabel>
                    <FormDescription className="text-xs">
                      Ativar ou desativar o menu
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                Criar Menu
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
