'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useUpdatePage, type CMSPage } from '@/hooks/admin/use-admin-cms'
import { useToast } from '@/hooks/use-toast'

const pageSettingsSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug deve conter apenas letras minúsculas, números e hífens'
    ),
  path: z.string().min(1, 'Caminho é obrigatório').regex(/^\//, 'Caminho deve começar com /'),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  isHome: z.boolean(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  ogImage: z.string().optional(),
})

type PageSettingsFormData = z.infer<typeof pageSettingsSchema>

type PageSettingsProps = {
  page: CMSPage
}

export function PageSettings({ page }: PageSettingsProps) {
  const { toast } = useToast()
  const updateMutation = useUpdatePage(page.id)

  const form = useForm<PageSettingsFormData>({
    resolver: zodResolver(pageSettingsSchema),
    defaultValues: {
      title: page.title,
      slug: page.slug,
      path: page.path,
      description: page.description || '',
      status: page.status,
      isHome: page.isHome,
      metaTitle: page.metaTitle || '',
      metaDesc: page.metaDesc || '',
      ogImage: page.ogImage || '',
    },
  })

  const onSubmit = async (data: PageSettingsFormData) => {
    try {
      await updateMutation.mutateAsync(data)
      toast({
        title: 'Configurações salvas',
        description: 'As configurações da página foram atualizadas.',
      })
    } catch (_error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>
              Configure as informações principais da página
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Caminho (URL)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
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
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO & Metadados</CardTitle>
            <CardDescription>
              Configure como a página aparece em mecanismos de busca e redes sociais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="metaTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta Título</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Título para SEO" />
                  </FormControl>
                  <FormDescription>
                    Título que aparece nos resultados de busca (recomendado: 50-60 caracteres)
                  </FormDescription>
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
                    <Textarea {...field} rows={3} placeholder="Descrição para SEO" />
                  </FormControl>
                  <FormDescription>
                    Descrição que aparece nos resultados de busca (recomendado: 150-160 caracteres)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ogImage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagem Open Graph</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="URL da imagem" />
                  </FormControl>
                  <FormDescription>
                    Imagem que aparece ao compartilhar em redes sociais (recomendado: 1200x630px)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </form>
    </Form>
  )
}
