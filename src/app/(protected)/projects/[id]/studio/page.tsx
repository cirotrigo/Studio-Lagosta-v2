'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { TemplateSelector, TemplateSummary } from '@/components/studio/TemplateSelector'
import { PhotoSelector } from '@/components/studio/PhotoSelector'
import { StudioCanvas } from '@/components/studio/StudioCanvas'
import { FieldsForm, getDynamicFieldDefinitions, FieldDefinition } from '@/components/studio/FieldsForm'
import { useTemplate } from '@/hooks/use-template'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'

interface GenerationResult {
  id: string
  resultUrl: string | null
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  templateId: number
}

export default function StudioPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const projectId = Number(params?.id)
  const isValidProject = Number.isFinite(projectId) && projectId > 0

  usePageConfig(
    'Studio de Geração',
    'Monte criativos aplicando conteúdo dinâmico aos seus templates.',
    [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projetos', href: '/projects' },
      { label: 'Studio' },
    ],
  )

  const { data: templates, isLoading: isLoadingTemplates } = useQuery<TemplateSummary[]>({
    queryKey: ['project-templates', projectId],
    enabled: isValidProject,
    queryFn: () => api.get(`/api/projects/${projectId}/templates`),
  })

  const [selectedTemplateId, setSelectedTemplateId] = React.useState<number | null>(null)
  const [fieldValues, setFieldValues] = React.useState<Record<string, unknown>>({})
  const [step, setStep] = React.useState<'template' | 'photo' | 'edit'>('template')
  const [lastGeneration, setLastGeneration] = React.useState<GenerationResult | null>(null)

  const { data: selectedTemplate, isLoading: isLoadingTemplate } = useTemplate(selectedTemplateId)

  const dynamicFieldDefs = React.useMemo<FieldDefinition[]>(
    () => (selectedTemplate ? getDynamicFieldDefinitions(selectedTemplate) : []),
    [selectedTemplate],
  )

  React.useEffect(() => {
    if (!selectedTemplate) return
    const defaults: Record<string, unknown> = {}
    dynamicFieldDefs.forEach((field) => {
      if (field.initialValue !== undefined) {
        defaults[field.key] = field.initialValue ?? ''
      }
    })
    setFieldValues(defaults)
    if (!dynamicFieldDefs.some((field) => field.fieldType === 'image')) {
      setStep('edit')
    }
  }, [selectedTemplate, dynamicFieldDefs])

  const imageField = dynamicFieldDefs.find((field) => field.fieldType === 'image')

  const generateMutation = useMutation<GenerationResult, unknown, { templateId: number; fieldValues: Record<string, unknown> }>({
    mutationFn: ({ templateId, fieldValues }) =>
      api.post(`/api/projects/${projectId}/generations`, { templateId, fieldValues }),
    onSuccess: (result) => {
      setLastGeneration(result)
      toast({
        title: 'Criativo gerado',
        description: result.resultUrl ? 'Download iniciado em nova aba.' : 'Aguarde o processamento.',
      })
      if (result.resultUrl) {
        window.open(result.resultUrl, '_blank', 'noopener,noreferrer')
      }
    },
    onError: (error) => {
      console.error('[Studio] Failed to generate creative', error)
      toast({
        title: 'Erro ao gerar criativo',
        description: 'Verifique os campos e tente novamente.',
        variant: 'destructive',
      })
    },
  })

  const handleSelectTemplate = (templateId: number) => {
    setSelectedTemplateId(templateId)
    setFieldValues({})
    setLastGeneration(null)
    setStep('photo')
  }

  const handleSelectPhoto = (url: string) => {
    if (imageField) {
      setFieldValues((prev) => ({
        ...prev,
        [imageField.key]: url,
      }))
    }
    setStep('edit')
  }

  const handleGenerate = () => {
    if (!selectedTemplateId) return
    generateMutation.mutate({ templateId: selectedTemplateId, fieldValues })
  }

  if (!isValidProject) {
    return (
      <Card className="m-8 p-6 text-sm text-muted-foreground">
        Projeto inválido. Verifique a URL ou selecione o projeto novamente.
      </Card>
    )
  }

  return (
    <div className="container mx-auto flex flex-col gap-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Studio de Geração</h1>
          <p className="text-sm text-muted-foreground">
            Selecione um template, personalize os campos dinâmicos e gere novos criativos.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
          Voltar ao Projeto
        </Button>
      </div>

      {step === 'template' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Escolha um template</h2>
            <p className="text-sm text-muted-foreground">
              Use um template existente como base para criar um novo criativo.
            </p>
          </div>
          <TemplateSelector
            templates={templates}
            onSelect={handleSelectTemplate}
            selectedTemplateId={selectedTemplateId}
            isLoading={isLoadingTemplates}
          />
        </div>
      )}

      {step === 'photo' && selectedTemplate && (
        <PhotoSelector
          onSelect={handleSelectPhoto}
          onSkip={() => setStep('edit')}
          selectedUrl={typeof imageField !== 'undefined' ? String(fieldValues[imageField.key] ?? '') : undefined}
        />
      )}

      {step === 'edit' && selectedTemplate && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {isLoadingTemplate ? (
              <Skeleton className="h-[520px] w-full" />
            ) : (
              <StudioCanvas template={selectedTemplate} fieldValues={fieldValues} />
            )}
            {lastGeneration && (
              <Card className="border border-border/50 p-4 text-sm">
                <p className="font-medium">Último criativo</p>
                <p className="text-muted-foreground">
                  Status: {lastGeneration.status}
                  {lastGeneration.resultUrl && (
                    <>
                      {' '}·{' '}
                      <a
                        className="text-primary underline"
                        href={lastGeneration.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        abrir download
                      </a>
                    </>
                  )}
                </p>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <FieldsForm template={selectedTemplate} values={fieldValues} onChange={setFieldValues} />
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="w-full"
            >
              {generateMutation.isPending ? 'Gerando...' : 'Gerar criativo'}
            </Button>
          </div>
        </div>
      )}

      {step !== 'template' && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
          <span>Precisa ajustar o template? Você pode voltar e escolher outro modelo a qualquer momento.</span>
          <Button variant="ghost" size="sm" onClick={() => setStep('template')}>
            Trocar de template
          </Button>
        </div>
      )}
    </div>
  )
}
