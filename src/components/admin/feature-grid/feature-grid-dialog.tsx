'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type FeatureGridItem,
  useCreateFeatureGridItem,
  useUpdateFeatureGridItem,
} from '@/hooks/admin/use-admin-feature-grid'
import { toast } from 'sonner'

const formSchema = z.object({
  icon: z.string().min(1, 'Ícone é obrigatório'),
  iconColor: z.string().optional(),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  gridArea: z.string().optional(),
  order: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

type FormData = z.infer<typeof formSchema>

type FeatureGridDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: FeatureGridItem
}

// Ícones Lucide mais comuns
const COMMON_ICONS = [
  'Sparkles', 'Zap', 'Code', 'Database', 'Lock', 'Shield',
  'Rocket', 'Star', 'Heart', 'Users', 'Settings', 'CheckCircle',
  'Activity', 'BarChart', 'TrendingUp', 'Globe', 'Package', 'Box',
  'Layers', 'Grid', 'Layout', 'Cpu', 'Cloud', 'Server',
]

// Cores Tailwind comuns
const ICON_COLORS = [
  { label: 'Azul', value: 'text-sky-500' },
  { label: 'Verde', value: 'text-green-500' },
  { label: 'Roxo', value: 'text-purple-500' },
  { label: 'Rosa', value: 'text-pink-500' },
  { label: 'Laranja', value: 'text-orange-500' },
  { label: 'Vermelho', value: 'text-red-500' },
  { label: 'Amarelo', value: 'text-yellow-500' },
  { label: 'Primário', value: 'text-primary' },
]

export function FeatureGridDialog({
  open,
  onOpenChange,
  item,
}: FeatureGridDialogProps) {
  const isEditing = !!item
  const createItem = useCreateFeatureGridItem()
  const updateItem = useUpdateFeatureGridItem(item?.id || '')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      icon: 'Sparkles',
      iconColor: 'text-sky-500',
      title: '',
      description: '',
      gridArea: '',
      order: 0,
      isActive: true,
    },
  })

  const isActive = watch('isActive')

  useEffect(() => {
    if (item) {
      reset({
        icon: item.icon,
        iconColor: item.iconColor || '',
        title: item.title,
        description: item.description,
        gridArea: item.gridArea || '',
        order: item.order,
        isActive: item.isActive,
      })
    } else {
      reset({
        icon: 'Sparkles',
        iconColor: 'text-sky-500',
        title: '',
        description: '',
        gridArea: '',
        order: 0,
        isActive: true,
      })
    }
  }, [item, reset])

  const onSubmit = async (data: FormData) => {
    try {
      if (isEditing) {
        await updateItem.mutateAsync(data)
        toast.success('Item atualizado com sucesso')
      } else {
        // Garantir que os campos obrigatórios estão presentes
        const createData = {
          icon: data.icon,
          title: data.title,
          description: data.description,
          iconColor: data.iconColor,
          gridArea: data.gridArea,
          order: data.order,
          isActive: data.isActive,
        }
        await createItem.mutateAsync(createData)
        toast.success('Item criado com sucesso')
      }
      onOpenChange(false)
      reset()
    } catch (error) {
      toast.error(`Erro ao ${isEditing ? 'atualizar' : 'criar'} item`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Item' : 'Novo Item'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as informações do item do grid de recursos'
              : 'Adicione um novo item ao grid de recursos'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Ícone */}
            <div className="space-y-2">
              <Label htmlFor="icon">Ícone</Label>
              <Select
                value={watch('icon')}
                onValueChange={(value) => setValue('icon', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um ícone" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_ICONS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.icon && (
                <p className="text-sm text-destructive">{errors.icon.message}</p>
              )}
            </div>

            {/* Cor do Ícone */}
            <div className="space-y-2">
              <Label htmlFor="iconColor">Cor do Ícone</Label>
              <Select
                value={watch('iconColor')}
                onValueChange={(value) => setValue('iconColor', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma cor" />
                </SelectTrigger>
                <SelectContent>
                  {ICON_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      {color.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              {...register('title')}
              placeholder="Ex: Autenticação Pronta"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descreva o recurso..."
              rows={3}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Grid Area */}
            <div className="space-y-2">
              <Label htmlFor="gridArea">
                Grid Area (Opcional)
              </Label>
              <Input
                id="gridArea"
                {...register('gridArea')}
                placeholder="Ex: md:[grid-area:1/1/2/2]"
              />
              <p className="text-xs text-muted-foreground">
                CSS grid-area para posicionamento
              </p>
            </div>

            {/* Ordem */}
            <div className="space-y-2">
              <Label htmlFor="order">Ordem</Label>
              <Input
                id="order"
                type="number"
                {...register('order')}
                placeholder="0"
              />
              {errors.order && (
                <p className="text-sm text-destructive">{errors.order.message}</p>
              )}
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setValue('isActive', checked)}
            />
            <Label htmlFor="isActive">Item ativo</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              {isEditing ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
