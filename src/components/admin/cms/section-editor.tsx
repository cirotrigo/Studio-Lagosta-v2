'use client'

import { useState, useEffect } from 'react'
import { X, Save, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUpdateSection, type CMSSection } from '@/hooks/admin/use-admin-cms'
import { useToast } from '@/hooks/use-toast'
import { HeroEditor } from './editors/hero-editor'
import { BentoGridEditor } from './editors/bento-grid-editor'
import { FAQEditor } from './editors/faq-editor'
import { AIStarterEditor } from './editors/ai-starter-editor'
import { PricingEditor } from './editors/pricing-editor'
import { CTAEditor } from './editors/cta-editor'
import { CustomEditor } from './editors/custom-editor'
import { SectionPreview } from './section-preview'

type SectionEditorProps = {
  section: CMSSection
  pageId: string
  onClose: () => void
}

export function SectionEditor({ section, pageId, onClose }: SectionEditorProps) {
  const { toast } = useToast()
  const [content, setContent] = useState(section.content)
  const [hasChanges, setHasChanges] = useState(false)

  const updateMutation = useUpdateSection(section.id, pageId)

  useEffect(() => {
    setContent(section.content)
    setHasChanges(false)
  }, [section.id, section.content])

  const handleContentChange = (newContent: Record<string, unknown>) => {
    setContent(newContent)
    setHasChanges(true)
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ content })
      setHasChanges(false)
      toast({
        title: 'Seção salva',
        description: 'As alterações foram salvas com sucesso.',
      })
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      })
    }
  }

  const renderEditor = () => {
    switch (section.type) {
      case 'HERO':
        return <HeroEditor content={content} onChange={handleContentChange} />
      case 'BENTO_GRID':
        return <BentoGridEditor content={content} onChange={handleContentChange} />
      case 'FAQ':
        return <FAQEditor content={content} onChange={handleContentChange} />
      case 'AI_STARTER':
        return <AIStarterEditor content={content} onChange={handleContentChange} />
      case 'PRICING':
        return <PricingEditor content={content} onChange={handleContentChange} />
      case 'CTA':
        return <CTAEditor content={content} onChange={handleContentChange} />
      case 'CUSTOM':
        return <CustomEditor content={content} onChange={handleContentChange} />
      default:
        return (
          <div className="p-8 text-center text-muted-foreground">
            Editor não disponível para este tipo de seção
          </div>
        )
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{section.name}</CardTitle>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                Salvar
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="editor" className="w-full">
          <div className="border-b px-6">
            <TabsList className="h-12 bg-transparent p-0">
              <TabsTrigger value="editor" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="editor" className="p-6 mt-0">
            {renderEditor()}
          </TabsContent>

          <TabsContent value="preview" className="p-6 mt-0">
            <SectionPreview section={{ ...section, content }} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
