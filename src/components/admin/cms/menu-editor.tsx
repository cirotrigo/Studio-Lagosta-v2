'use client'

import { useState } from 'react'
import { Plus, GripVertical, Edit2, Trash2, EyeOff, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import {
  useUpdateMenu,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  type CMSMenu,
  type CMSMenuItem,
} from '@/hooks/admin/use-admin-menus'

type MenuEditorProps = {
  menu: CMSMenu
}

export function MenuEditor({ menu }: MenuEditorProps) {
  const { toast } = useToast()
  const [menuName, setMenuName] = useState(menu.name)
  const [menuSlug, setMenuSlug] = useState(menu.slug)
  const [menuLocation, setMenuLocation] = useState(menu.location)
  const [menuIsActive, setMenuIsActive] = useState(menu.isActive)

  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CMSMenuItem | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)

  const updateMenuMutation = useUpdateMenu(menu.id)
  const deleteItemMutation = useDeleteMenuItem(menu.id)

  const handleSaveMenu = async () => {
    try {
      await updateMenuMutation.mutateAsync({
        name: menuName,
        slug: menuSlug,
        location: menuLocation,
        isActive: menuIsActive,
      })
      toast({
        title: 'Menu atualizado',
        description: 'As configurações do menu foram salvas.',
      })
    } catch (_error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações do menu.',
        variant: 'destructive',
      })
    }
  }

  const handleAddItem = () => {
    setEditingItem(null)
    setItemDialogOpen(true)
  }

  const handleEditItem = (item: CMSMenuItem) => {
    setEditingItem(item)
    setItemDialogOpen(true)
  }

  const handleDeleteItem = async () => {
    if (!itemToDelete) return

    try {
      await deleteItemMutation.mutateAsync(itemToDelete)
      toast({
        title: 'Item deletado',
        description: 'O item foi removido do menu.',
      })
      setDeleteDialogOpen(false)
      setItemToDelete(null)
    } catch (_error) {
      toast({
        title: 'Erro ao deletar',
        description: 'Não foi possível deletar o item.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Menu Items */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Itens do Menu</CardTitle>
                <CardDescription>
                  Gerencie os links e estrutura do menu
                </CardDescription>
              </div>
              <Button onClick={handleAddItem}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!menu.items || menu.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  Nenhum item adicionado ainda
                </p>
                <Button variant="outline" onClick={handleAddItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Primeiro Item
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {menu.items.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => handleEditItem(item)}
                    onDelete={() => {
                      setItemToDelete(item.id)
                      setDeleteDialogOpen(true)
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Menu Settings */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Configurações</CardTitle>
            <CardDescription>Configure o menu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="menu-name">Nome</Label>
              <Input
                id="menu-name"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="Nome do menu"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="menu-slug">Slug</Label>
              <Input
                id="menu-slug"
                value={menuSlug}
                onChange={(e) => setMenuSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="menu-slug"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="menu-location">Localização</Label>
              <Select value={menuLocation} onValueChange={setMenuLocation}>
                <SelectTrigger id="menu-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HEADER">Header</SelectItem>
                  <SelectItem value="FOOTER">Footer</SelectItem>
                  <SelectItem value="SIDEBAR">Sidebar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="menu-active">Menu Ativo</Label>
              <Switch
                id="menu-active"
                checked={menuIsActive}
                onCheckedChange={setMenuIsActive}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSaveMenu}
              disabled={updateMenuMutation.isPending}
            >
              {updateMenuMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Item Dialog */}
      <MenuItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        menuId={menu.id}
        item={editingItem}
        onSave={() => {
          setItemDialogOpen(false)
          setEditingItem(null)
        }}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso irá deletar permanentemente o
              item do menu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type MenuItemRowProps = {
  item: CMSMenuItem
  onEdit: () => void
  onDelete: () => void
  depth?: number
}

function MenuItemRow({ item, onEdit, onDelete, depth = 0 }: MenuItemRowProps) {
  return (
    <>
      <div
        className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
        style={{ marginLeft: `${depth * 24}px` }}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
        <div className="flex-1">
          <div className="font-medium">{item.label}</div>
          <div className="text-sm text-muted-foreground">{item.url}</div>
        </div>
        <div className="flex items-center gap-1">
          {!item.isVisible && (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {item.children && item.children.map((child) => (
        <MenuItemRow
          key={child.id}
          item={child}
          onEdit={onEdit}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

type MenuItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  menuId: string
  item: CMSMenuItem | null
  onSave: () => void
}

function MenuItemDialog({ open, onOpenChange, menuId, item, onSave }: MenuItemDialogProps) {
  const { toast } = useToast()
  const [label, setLabel] = useState(item?.label || '')
  const [url, setUrl] = useState(item?.url || '')
  const [target, setTarget] = useState<string>(item?.target || '_self')
  const [isVisible, setIsVisible] = useState(item?.isVisible ?? true)

  const createMutation = useCreateMenuItem(menuId)
  const updateMutation = useUpdateMenuItem(menuId)

  const handleSave = async () => {
    try {
      if (item) {
        // Update existing item
        await updateMutation.mutateAsync({
          id: item.id,
          data: { label, url, target, isVisible },
        })
        toast({
          title: 'Item atualizado',
          description: 'O item do menu foi atualizado.',
        })
      } else {
        // Create new item
        await createMutation.mutateAsync({
          menuId,
          label,
          url,
          target,
          isVisible,
        })
        toast({
          title: 'Item criado',
          description: 'O item foi adicionado ao menu.',
        })
      }
      onSave()
      // Reset form
      setLabel('')
      setUrl('')
      setTarget('_self')
      setIsVisible(true)
    } catch (_error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o item.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Editar Item' : 'Novo Item'}</DialogTitle>
          <DialogDescription>
            Configure o link do menu
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="item-label">Texto do Link</Label>
            <Input
              id="item-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-url">URL</Label>
            <Input
              id="item-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-target">Abrir em</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="item-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_self">Mesma aba</SelectItem>
                <SelectItem value="_blank">Nova aba</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="item-visible">Visível</Label>
            <Switch
              id="item-visible"
              checked={isVisible}
              onCheckedChange={setIsVisible}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label || !url || createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
