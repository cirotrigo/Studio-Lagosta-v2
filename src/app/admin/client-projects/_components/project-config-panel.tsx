"use client"

import { useEffect } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  updateClientProjectSchema,
  type UpdateClientProjectInput,
} from "@/lib/validations/client-project"
import { useUpdateClientProject } from "@/hooks/admin/use-client-projects"
import type { ClientProject } from "@/hooks/admin/use-client-projects"

interface ProjectConfigPanelProps {
  project: ClientProject
}

function toFormValues(project: ClientProject): UpdateClientProjectInput {
  return {
    googleDriveFolderId: project.googleDriveFolderId ?? "",
    googleDriveFolderName: project.googleDriveFolderName ?? "",
    googleDriveImagesFolderId: project.googleDriveImagesFolderId ?? "",
    googleDriveImagesFolderName: project.googleDriveImagesFolderName ?? "",
    googleDriveVideosFolderId: project.googleDriveVideosFolderId ?? "",
    googleDriveVideosFolderName: project.googleDriveVideosFolderName ?? "",
    instagramAccountId: project.instagramAccountId ?? "",
    instagramUsername: project.instagramUsername ?? "",
    zapierWebhookUrl: project.zapierWebhookUrl ?? "",
  }
}

export function ProjectConfigPanel({ project }: ProjectConfigPanelProps) {
  const form = useForm<UpdateClientProjectInput>({
    resolver: zodResolver(updateClientProjectSchema) as Resolver<UpdateClientProjectInput>,
    defaultValues: toFormValues(project),
  })
  const updateProject = useUpdateClientProject()

  useEffect(() => {
    form.reset(toFormValues(project))
  }, [project, form])

  const onSubmit = (values: UpdateClientProjectInput) => {
    updateProject.mutate({ projectId: project.id, data: values })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <section className="rounded-xl border border-border/60 p-4">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">
            Google Drive
          </h3>
          <div className="mt-4 grid gap-4">
            <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Pasta de backup
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Backup" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Pasta de imagens
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Fotos" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Pasta de vídeos
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Vídeos" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 p-4">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">
            Instagram & Webhook
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="instagramAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID da conta</FormLabel>
                  <FormControl>
                    <Input placeholder="ID do Instagram" {...field} />
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
                    <Input placeholder="@usuario" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="zapierWebhookUrl"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Webhook do Zapier</FormLabel>
                <FormControl>
                  <Input placeholder="https://hooks.zapier.com/..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={updateProject.isPending}>
            {updateProject.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
