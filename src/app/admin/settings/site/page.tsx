"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useSiteSettings, useUpdateSiteSettings, useUploadFile } from '@/hooks/admin/use-admin-site-settings'
import { Loader2, Upload, Image as ImageIcon, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function SiteSettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { data: settings, isLoading } = useSiteSettings()
  const updateSettings = useUpdateSiteSettings()
  const uploadFile = useUploadFile()

  // Estados locais para os campos
  const [siteName, setSiteName] = React.useState('')
  const [shortName, setShortName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [logoLight, setLogoLight] = React.useState('')
  const [logoDark, setLogoDark] = React.useState('')
  const [favicon, setFavicon] = React.useState('')
  const [appleIcon, setAppleIcon] = React.useState('')

  // Estados para preview de upload
  const [uploadingLogoLight, setUploadingLogoLight] = React.useState(false)
  const [uploadingLogoDark, setUploadingLogoDark] = React.useState(false)
  const [uploadingFavicon, setUploadingFavicon] = React.useState(false)
  const [uploadingAppleIcon, setUploadingAppleIcon] = React.useState(false)

  // Preencher campos quando os dados carregarem
  React.useEffect(() => {
    if (settings) {
      setSiteName(settings.siteName)
      setShortName(settings.shortName)
      setDescription(settings.description)
      setLogoLight(settings.logoLight)
      setLogoDark(settings.logoDark)
      setFavicon(settings.favicon)
      setAppleIcon(settings.appleIcon || '')
    }
  }, [settings])

  const handleFileUpload = async (
    file: File,
    setUrl: (url: string) => void,
    setUploading: (uploading: boolean) => void
  ) => {
    try {
      setUploading(true)
      const url = await uploadFile.mutateAsync(file)
      setUrl(url)
      toast({
        title: 'Upload concluído',
        description: 'Arquivo enviado com sucesso',
      })
    } catch (error) {
      toast({
        title: 'Erro no upload',
        description: error instanceof Error ? error.message : 'Falha ao enviar arquivo',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        siteName,
        shortName,
        description,
        logoLight,
        logoDark,
        favicon,
        appleIcon: appleIcon || null,
      })

      toast({
        title: 'Configurações salvas',
        description: 'As configurações do site foram atualizadas com sucesso',
      })
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações do Site</h1>
          <p className="text-muted-foreground mt-2">
            Configure as informações básicas e logos do site
          </p>
        </div>
      </div>

      {/* Informações Básicas */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Informações Básicas</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">Nome do Site</Label>
              <Input
                id="siteName"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Studio Lagosta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortName">Nome Curto</Label>
              <Input
                id="shortName"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="Studio Lagosta"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do site..."
              rows={3}
            />
          </div>
        </div>
      </Card>

      {/* Logos */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Logos e Ícones</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Logo Light */}
          <div className="space-y-4">
            <Label>Logo (Tema Claro)</Label>
            <p className="text-sm text-muted-foreground">
              Tamanho recomendado: 36×36px (SVG ou PNG)
            </p>
            <div className="flex items-center gap-4">
              {logoLight && (
                <div className="w-16 h-16 border rounded-lg flex items-center justify-center bg-white">
                  <img src={logoLight} alt="Logo Light" className="max-w-full max-h-full" />
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, setLogoLight, setUploadingLogoLight)
                  }}
                  disabled={uploadingLogoLight}
                />
              </div>
            </div>
            {uploadingLogoLight && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </div>
            )}
          </div>

          {/* Logo Dark */}
          <div className="space-y-4">
            <Label>Logo (Tema Escuro)</Label>
            <p className="text-sm text-muted-foreground">
              Tamanho recomendado: 36×36px (SVG ou PNG)
            </p>
            <div className="flex items-center gap-4">
              {logoDark && (
                <div className="w-16 h-16 border rounded-lg flex items-center justify-center bg-gray-900">
                  <img src={logoDark} alt="Logo Dark" className="max-w-full max-h-full" />
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, setLogoDark, setUploadingLogoDark)
                  }}
                  disabled={uploadingLogoDark}
                />
              </div>
            </div>
            {uploadingLogoDark && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </div>
            )}
          </div>

          {/* Favicon */}
          <div className="space-y-4">
            <Label>Favicon</Label>
            <p className="text-sm text-muted-foreground">
              Tamanho recomendado: 32×32px (ICO ou PNG)
            </p>
            <div className="flex items-center gap-4">
              {favicon && (
                <div className="w-16 h-16 border rounded-lg flex items-center justify-center bg-white">
                  <img src={favicon} alt="Favicon" className="max-w-full max-h-full" />
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/x-icon,image/png"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, setFavicon, setUploadingFavicon)
                  }}
                  disabled={uploadingFavicon}
                />
              </div>
            </div>
            {uploadingFavicon && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </div>
            )}
          </div>

          {/* Apple Touch Icon */}
          <div className="space-y-4">
            <Label>Apple Touch Icon (Opcional)</Label>
            <p className="text-sm text-muted-foreground">
              Tamanho recomendado: 180×180px (PNG)
            </p>
            <div className="flex items-center gap-4">
              {appleIcon && (
                <div className="w-16 h-16 border rounded-lg flex items-center justify-center bg-white">
                  <img src={appleIcon} alt="Apple Icon" className="max-w-full max-h-full" />
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/png"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file, setAppleIcon, setUploadingAppleIcon)
                  }}
                  disabled={uploadingAppleIcon}
                />
              </div>
            </div>
            {uploadingAppleIcon && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Botões de Ação */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configurações
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
