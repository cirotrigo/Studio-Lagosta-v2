"use client"

import { useEffect, useState } from "react"
import { useForm, type UseFormReturn, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DesktopGoogleDriveModal } from "@/components/projects/google-drive-folder-selector"
import { createClientInviteSchema } from "@/lib/validations/client-invite"
import type { CreateClientInviteInput } from "@/lib/validations/client-invite"
import { useCreateClientInvite } from "@/hooks/admin/use-client-invites"

interface ClientInviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const inviteFormDefaults: CreateClientInviteInput = {
  email: "",
  clientName: "",
  projectName: "",
  projectDescription: "",
  googleDriveFolderId: "",
  googleDriveFolderName: "",
  googleDriveImagesFolderId: "",
  googleDriveImagesFolderName: "",
  googleDriveVideosFolderId: "",
  googleDriveVideosFolderName: "",
  instagramAccountId: "",
  instagramUsername: "",
  zapierWebhookUrl: "",
}

type DriveSection = "backup" | "images" | "videos"

const DRIVE_FIELD_MAP: Record<
  DriveSection,
  { id: keyof CreateClientInviteInput; name: keyof CreateClientInviteInput }
> = {
  backup: {
    id: "googleDriveFolderId",
    name: "googleDriveFolderName",
  },
  images: {
    id: "googleDriveImagesFolderId",
    name: "googleDriveImagesFolderName",
  },
  videos: {
    id: "googleDriveVideosFolderId",
    name: "googleDriveVideosFolderName",
  },
}

export function InviteFormFields({
  form,
  disableEmail,
}: {
  form: UseFormReturn<any>
  disableEmail?: boolean
}) {
  const [drivePicker, setDrivePicker] = useState<DriveSection | null>(null)
  const driveSelections = {
    backup: {
      id: form.watch("googleDriveFolderId") || "",
      name: form.watch("googleDriveFolderName") || "",
    },
    images: {
      id: form.watch("googleDriveImagesFolderId") || "",
      name: form.watch("googleDriveImagesFolderName") || "",
    },
    videos: {
      id: form.watch("googleDriveVideosFolderId") || "",
      name: form.watch("googleDriveVideosFolderName") || "",
    },
  }

  const handleDriveSelect = (item: { id: string; name: string }) => {
    if (!drivePicker) return
    const fields = DRIVE_FIELD_MAP[drivePicker]
    form.setValue(fields.id as string, item.id, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(fields.name as string, item.name, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setDrivePicker(null)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dados do Cliente
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email do cliente</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="cliente@email.com"
                    {...field}
                    disabled={disableEmail}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="clientName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do cliente</FormLabel>
                <FormControl>
                  <Input placeholder="Maria Silva" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projeto
        </h3>
        <div className="mt-4 grid gap-4">
          <FormField
            control={form.control}
            name="projectName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do projeto</FormLabel>
                <FormControl>
                  <Input placeholder="Ensaio Maria & João" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="projectDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Notas adicionais do projeto" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Google Drive
        </h3>
        <FormDescription className="mt-2">
          Configure as pastas que serão conectadas automaticamente.
        </FormDescription>
        <div className="mt-4 grid gap-4">
          <div className="rounded-lg border border-dashed border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pasta de backup
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrivePicker("backup")}
              >
                Selecionar no Drive
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="googleDriveFolderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID ou URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://drive.google.com/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="googleDriveFolderName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da pasta</FormLabel>
                    <FormControl>
                      <Input placeholder="Backup" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {driveSelections.backup.name ? (
              <p className="text-xs text-muted-foreground">
                Selecionada: {driveSelections.backup.name}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-dashed border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pasta de imagens (editor)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrivePicker("images")}
              >
                Selecionar no Drive
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="googleDriveImagesFolderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID ou URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://drive.google.com/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="googleDriveImagesFolderName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da pasta</FormLabel>
                    <FormControl>
                      <Input placeholder="Fotos" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {driveSelections.images.name ? (
              <p className="text-xs text-muted-foreground">
                Selecionada: {driveSelections.images.name}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-dashed border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pasta de vídeos (editor)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrivePicker("videos")}
              >
                Selecionar no Drive
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="googleDriveVideosFolderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID ou URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://drive.google.com/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="googleDriveVideosFolderName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da pasta</FormLabel>
                    <FormControl>
                      <Input placeholder="Vídeos" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {driveSelections.videos.name ? (
              <p className="text-xs text-muted-foreground">
                Selecionada: {driveSelections.videos.name}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Instagram & Zapier
        </h3>
        <div className="mt-4 grid gap-4">
          <FormField
            control={form.control}
            name="instagramAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID da conta</FormLabel>
                <FormControl>
                  <Input placeholder="Conta conectada ao agendamento" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="instagramUsername"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Usuário</FormLabel>
                <FormControl>
                  <Input placeholder="@instagram" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="zapierWebhookUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Webhook do Zapier</FormLabel>
                <FormControl>
                  <Input placeholder="https://hooks.zapier.com/..." {...field} />
                </FormControl>
                <FormDescription>
                  Opcional. Utilize para disparar automações específicas deste cliente.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <DesktopGoogleDriveModal
        open={drivePicker !== null}
        onOpenChange={(open) => {
          if (!open) setDrivePicker(null)
        }}
        mode="folders"
        initialFolderId={
          drivePicker ? driveSelections[drivePicker].id || undefined : undefined
        }
        initialFolderName={
          drivePicker ? driveSelections[drivePicker].name || undefined : undefined
        }
        onSelect={handleDriveSelect}
      />
    </div>
  )
}

export function ClientInviteDialog({ open, onOpenChange }: ClientInviteDialogProps) {
  const form = useForm<CreateClientInviteInput>({
    resolver: zodResolver(createClientInviteSchema) as Resolver<CreateClientInviteInput>,
    defaultValues: inviteFormDefaults,
  })
  const createInvite = useCreateClientInvite()

  useEffect(() => {
    if (!open) {
      form.reset(inviteFormDefaults)
    }
  }, [open, form])

  const onSubmit = (values: CreateClientInviteInput) => {
    createInvite.mutate(values, {
      onSuccess: () => {
        onOpenChange(false)
        form.reset(inviteFormDefaults)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-border/60">
        <DialogHeader>
          <DialogTitle>Convidar novo cliente</DialogTitle>
          <DialogDescription>
            Configure todas as informações que serão aplicadas automaticamente após o aceite.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <InviteFormFields form={form} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending ? "Enviando..." : "Enviar convite"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
