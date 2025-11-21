"use client"

import { useEffect } from "react"
import { useForm, type Resolver } from "react-hook-form"
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
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { ClientInvite } from "@/hooks/admin/use-client-invites"
import { useUpdateClientInvite } from "@/hooks/admin/use-client-invites"
import {
  updateClientInviteSchema,
  type UpdateClientInviteInput,
} from "@/lib/validations/client-invite"
import {
  InviteFormFields,
  inviteFormDefaults,
} from "./client-invite-dialog"

interface EditInviteDialogProps {
  open: boolean
  invite: ClientInvite | null
  onOpenChange: (open: boolean) => void
}

function mapInviteToValues(invite: ClientInvite | null) {
  if (!invite) return inviteFormDefaults
  return {
    email: invite.email ?? "",
    clientName: invite.clientName ?? "",
    projectName: invite.projectName ?? "",
    projectDescription: invite.projectDescription ?? "",
    googleDriveFolderId: invite.googleDriveFolderId ?? "",
    googleDriveFolderName: invite.googleDriveFolderName ?? "",
    googleDriveImagesFolderId: invite.googleDriveImagesFolderId ?? "",
    googleDriveImagesFolderName: invite.googleDriveImagesFolderName ?? "",
    googleDriveVideosFolderId: invite.googleDriveVideosFolderId ?? "",
    googleDriveVideosFolderName: invite.googleDriveVideosFolderName ?? "",
    instagramAccountId: invite.instagramAccountId ?? "",
    instagramUsername: invite.instagramUsername ?? "",
    zapierWebhookUrl: invite.zapierWebhookUrl ?? "",
  }
}

export function EditInviteDialog({ open, invite, onOpenChange }: EditInviteDialogProps) {
  const form = useForm<UpdateClientInviteInput>({
    resolver: zodResolver(updateClientInviteSchema) as Resolver<UpdateClientInviteInput>,
    defaultValues: mapInviteToValues(invite),
  })
  const updateInvite = useUpdateClientInvite()

  useEffect(() => {
    if (invite) {
      form.reset(mapInviteToValues(invite))
    }
  }, [invite, form])

  const onSubmit = (values: UpdateClientInviteInput) => {
    if (!invite) return
    const { email: _email, ...data } = values
    updateInvite.mutate(
      { inviteId: invite.id, data },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-border/60">
        <DialogHeader>
          <DialogTitle>Editar convite</DialogTitle>
          <DialogDescription>
            Ajuste as configurações antes do cliente aceitar o convite.
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email do cliente</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  O email não pode ser alterado depois que o convite é enviado.
                </p>
              </div>
              <InviteFormFields form={form} disableEmail />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateInvite.isPending}>
                  {updateInvite.isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <p className="text-sm text-muted-foreground">Selecione um convite para editar.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
