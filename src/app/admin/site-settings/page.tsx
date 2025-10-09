'use client'

import { useState, useEffect, useRef } from 'react'
import { Settings, Save, Loader2, Globe, Image as ImageIcon, Mail, Share2, BarChart3, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useSiteSettings, useUpdateSiteSettings, useUploadFile } from '@/hooks/admin/use-site-settings'

export default function SiteSettingsPage() {
  const { toast } = useToast()
  const { data, isLoading } = useSiteSettings()
  const updateMutation = useUpdateSiteSettings()
  const uploadFile = useUploadFile()

  const settings = data?.settings

  // Refs para inputs de arquivo
  const logoLightInputRef = useRef<HTMLInputElement>(null)
  const logoDarkInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const appleIconInputRef = useRef<HTMLInputElement>(null)

  // Estados de upload
  const [uploadingLogoLight, setUploadingLogoLight] = useState(false)
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [uploadingAppleIcon, setUploadingAppleIcon] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    siteName: 'Studio Lagosta',
    shortName: 'Studio Lagosta',
    description: '',
    logoLight: '/logo-light.svg',
    logoDark: '/logo-dark.svg',
    favicon: '/favicon.ico',
    appleIcon: '',
    metaTitle: '',
    metaDesc: '',
    ogImage: '/og-image.png',
    keywords: '',
    supportEmail: '',
    twitter: '',
    facebook: '',
    instagram: '',
    linkedin: '',
    github: '',
    gtmId: '',
    gaId: '',
    facebookPixelId: '',
  })

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setFormData({
        id: settings.id,
        siteName: settings.siteName,
        shortName: settings.shortName,
        description: settings.description,
        logoLight: settings.logoLight,
        logoDark: settings.logoDark,
        favicon: settings.favicon,
        appleIcon: settings.appleIcon || '',
        metaTitle: settings.metaTitle || '',
        metaDesc: settings.metaDesc || '',
        ogImage: settings.ogImage || '/og-image.png',
        keywords: settings.keywords.join(', '),
        supportEmail: settings.supportEmail || '',
        twitter: settings.twitter || '',
        facebook: settings.facebook || '',
        instagram: settings.instagram || '',
        linkedin: settings.linkedin || '',
        github: settings.github || '',
        gtmId: settings.gtmId || '',
        gaId: settings.gaId || '',
        facebookPixelId: settings.facebookPixelId || '',
      })
    }
  }, [settings])

  // Função para fazer upload de arquivo
  const handleFileUpload = async (
    file: File,
    field: 'logoLight' | 'logoDark' | 'favicon' | 'appleIcon',
    setUploading: (uploading: boolean) => void
  ) => {
    try {
      setUploading(true)
      const url = await uploadFile.mutateAsync(file)
      setFormData({ ...formData, [field]: url })
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.siteName.trim()) {
      toast({
        title: 'Erro de validação',
        description: 'Nome do site é obrigatório.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.description.trim()) {
      toast({
        title: 'Erro de validação',
        description: 'Descrição é obrigatória.',
        variant: 'destructive',
      })
      return
    }

    try {
      const payload = {
        ...formData,
        description: formData.description.trim(),
        keywords: formData.keywords.split(',').map((k) => k.trim()).filter(Boolean),
        appleIcon: formData.appleIcon || null,
        metaTitle: formData.metaTitle || null,
        metaDesc: formData.metaDesc || null,
        ogImage: formData.ogImage || null,
        supportEmail: formData.supportEmail || null,
        twitter: formData.twitter || null,
        facebook: formData.facebook || null,
        instagram: formData.instagram || null,
        linkedin: formData.linkedin || null,
        github: formData.github || null,
        gtmId: formData.gtmId || null,
        gaId: formData.gaId || null,
        facebookPixelId: formData.facebookPixelId || null,
      }

      console.log('Saving settings:', payload)

      await updateMutation.mutateAsync(payload)

      toast({
        title: 'Configurações salvas',
        description: 'As configurações do site foram atualizadas com sucesso.',
      })
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast({
        title: 'Erro ao salvar',
        description: error?.message || 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Configurações do Site</h1>
            <p className="text-muted-foreground">
              Personalize marca, logos, SEO e integrações
            </p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
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
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="brand" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="brand">
              <Globe className="mr-2 h-4 w-4" />
              Marca
            </TabsTrigger>
            <TabsTrigger value="logos">
              <ImageIcon className="mr-2 h-4 w-4" />
              Logos
            </TabsTrigger>
            <TabsTrigger value="seo">
              <BarChart3 className="mr-2 h-4 w-4" />
              SEO
            </TabsTrigger>
            <TabsTrigger value="contact">
              <Mail className="mr-2 h-4 w-4" />
              Contato
            </TabsTrigger>
            <TabsTrigger value="social">
              <Share2 className="mr-2 h-4 w-4" />
              Redes & Analytics
            </TabsTrigger>
          </TabsList>

          {/* Marca Tab */}
          <TabsContent value="brand" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações da Marca</CardTitle>
                <CardDescription>
                  Nome do site e descrição geral
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Nome do Site</Label>
                  <Input
                    id="siteName"
                    value={formData.siteName}
                    onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
                    placeholder="Studio Lagosta"
                  />
                  <p className="text-sm text-muted-foreground">
                    Nome completo que aparece no título das páginas
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortName">Nome Curto</Label>
                  <Input
                    id="shortName"
                    value={formData.shortName}
                    onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                    placeholder="Studio Lagosta"
                  />
                  <p className="text-sm text-muted-foreground">
                    Nome que aparece no header e navegação
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição do seu site..."
                    rows={4}
                  />
                  <p className="text-sm text-muted-foreground">
                    Descrição padrão para meta tags e SEO
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logos Tab */}
          <TabsContent value="logos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Logos e Ícones</CardTitle>
                <CardDescription>
                  Faça upload das logos e ícones do site
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo Light */}
                <div className="space-y-3">
                  <Label htmlFor="logoLight">Logo Clara (Tema Escuro)</Label>
                  <div className="flex items-center gap-4">
                    {formData.logoLight && (
                      <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-gray-900 p-2">
                        <img
                          src={formData.logoLight}
                          alt="Logo Light"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <Input
                        id="logoLight"
                        value={formData.logoLight}
                        onChange={(e) => setFormData({ ...formData, logoLight: e.target.value })}
                        placeholder="/logo-light.svg"
                      />
                      <input
                        ref={logoLightInputRef}
                        type="file"
                        accept="image/svg+xml,image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(file, 'logoLight', setUploadingLogoLight)
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoLightInputRef.current?.click()}
                        disabled={uploadingLogoLight}
                      >
                        {uploadingLogoLight ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Fazer Upload
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tamanho recomendado: 36×36px (SVG ou PNG). Aparece em fundo escuro.
                  </p>
                </div>

                {/* Logo Dark */}
                <div className="space-y-3">
                  <Label htmlFor="logoDark">Logo Escura (Tema Claro)</Label>
                  <div className="flex items-center gap-4">
                    {formData.logoDark && (
                      <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-white p-2">
                        <img
                          src={formData.logoDark}
                          alt="Logo Dark"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <Input
                        id="logoDark"
                        value={formData.logoDark}
                        onChange={(e) => setFormData({ ...formData, logoDark: e.target.value })}
                        placeholder="/logo-dark.svg"
                      />
                      <input
                        ref={logoDarkInputRef}
                        type="file"
                        accept="image/svg+xml,image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(file, 'logoDark', setUploadingLogoDark)
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoDarkInputRef.current?.click()}
                        disabled={uploadingLogoDark}
                      >
                        {uploadingLogoDark ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Fazer Upload
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tamanho recomendado: 36×36px (SVG ou PNG). Aparece em fundo claro.
                  </p>
                </div>

                {/* Favicon */}
                <div className="space-y-3">
                  <Label htmlFor="favicon">Favicon</Label>
                  <div className="flex items-center gap-4">
                    {formData.favicon && (
                      <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-white p-2">
                        <img
                          src={formData.favicon}
                          alt="Favicon"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <Input
                        id="favicon"
                        value={formData.favicon}
                        onChange={(e) => setFormData({ ...formData, favicon: e.target.value })}
                        placeholder="/favicon.ico"
                      />
                      <input
                        ref={faviconInputRef}
                        type="file"
                        accept="image/x-icon,image/png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(file, 'favicon', setUploadingFavicon)
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => faviconInputRef.current?.click()}
                        disabled={uploadingFavicon}
                      >
                        {uploadingFavicon ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Fazer Upload
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tamanho recomendado: 32×32px (ICO ou PNG). Ícone da aba do navegador.
                  </p>
                </div>

                {/* Apple Touch Icon */}
                <div className="space-y-3">
                  <Label htmlFor="appleIcon">Apple Touch Icon (opcional)</Label>
                  <div className="flex items-center gap-4">
                    {formData.appleIcon && (
                      <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-white p-2">
                        <img
                          src={formData.appleIcon}
                          alt="Apple Icon"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <Input
                        id="appleIcon"
                        value={formData.appleIcon}
                        onChange={(e) => setFormData({ ...formData, appleIcon: e.target.value })}
                        placeholder="/apple-touch-icon.png"
                      />
                      <input
                        ref={appleIconInputRef}
                        type="file"
                        accept="image/png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(file, 'appleIcon', setUploadingAppleIcon)
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appleIconInputRef.current?.click()}
                        disabled={uploadingAppleIcon}
                      >
                        {uploadingAppleIcon ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Fazer Upload
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tamanho recomendado: 180×180px (PNG). Para dispositivos iOS.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SEO e Meta Tags</CardTitle>
                <CardDescription>
                  Otimização para mecanismos de busca
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="metaTitle">Meta Title (opcional)</Label>
                  <Input
                    id="metaTitle"
                    value={formData.metaTitle}
                    onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                    placeholder="Deixe vazio para usar o nome do site"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaDesc">Meta Description</Label>
                  <Textarea
                    id="metaDesc"
                    value={formData.metaDesc}
                    onChange={(e) => setFormData({ ...formData, metaDesc: e.target.value })}
                    placeholder="Descrição que aparece nos resultados de busca"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keywords">Palavras-chave (separadas por vírgula)</Label>
                  <Input
                    id="keywords"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="SaaS, Next.js, TypeScript"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ogImage">Open Graph Image</Label>
                  <Input
                    id="ogImage"
                    value={formData.ogImage}
                    onChange={(e) => setFormData({ ...formData, ogImage: e.target.value })}
                    placeholder="/og-image.png"
                  />
                  <p className="text-sm text-muted-foreground">
                    Imagem que aparece ao compartilhar nas redes sociais (1200x630px)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contact Tab */}
          <TabsContent value="contact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações de Contato</CardTitle>
                <CardDescription>
                  Email de suporte e contato
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Email de Suporte</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={formData.supportEmail}
                    onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                    placeholder="suporte@seusite.com"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Social & Analytics Tab */}
          <TabsContent value="social" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Redes Sociais</CardTitle>
                <CardDescription>
                  Links para perfis nas redes sociais
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="twitter">Twitter/X</Label>
                  <Input
                    id="twitter"
                    value={formData.twitter}
                    onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                    placeholder="@seuusuario"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="facebook">Facebook</Label>
                  <Input
                    id="facebook"
                    value={formData.facebook}
                    onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                    placeholder="https://facebook.com/suapagina"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="@seuusuario"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input
                    id="linkedin"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/company/suaempresa"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="github">GitHub</Label>
                  <Input
                    id="github"
                    value={formData.github}
                    onChange={(e) => setFormData({ ...formData, github: e.target.value })}
                    placeholder="https://github.com/seuusuario"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Analytics & Tracking</CardTitle>
                <CardDescription>
                  IDs de ferramentas de análise
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gtmId">Google Tag Manager ID</Label>
                  <Input
                    id="gtmId"
                    value={formData.gtmId}
                    onChange={(e) => setFormData({ ...formData, gtmId: e.target.value })}
                    placeholder="GTM-XXXXXXX"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gaId">Google Analytics ID</Label>
                  <Input
                    id="gaId"
                    value={formData.gaId}
                    onChange={(e) => setFormData({ ...formData, gaId: e.target.value })}
                    placeholder="G-XXXXXXXXXX"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="facebookPixelId">Facebook Pixel ID</Label>
                  <Input
                    id="facebookPixelId"
                    value={formData.facebookPixelId}
                    onChange={(e) =>
                      setFormData({ ...formData, facebookPixelId: e.target.value })
                    }
                    placeholder="123456789012345"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
