import { TemplateEditorClient } from '@/components/templates/template-editor-client'

interface Params {
  id: string
}

export default async function TemplateEditorPage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const templateId = Number(id)

  return <TemplateEditorClient templateId={Number.isFinite(templateId) ? templateId : NaN} />
}
