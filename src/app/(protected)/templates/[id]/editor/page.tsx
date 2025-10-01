import { TemplateEditorClient } from '@/components/templates/template-editor-client'

interface Params {
  id: string
}

export default function TemplateEditorPage({ params }: { params: Params }) {
  const templateId = Number(params.id)

  return <TemplateEditorClient templateId={Number.isFinite(templateId) ? templateId : NaN} />
}
