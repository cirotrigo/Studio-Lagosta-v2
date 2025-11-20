import { TemplateEditorClient } from '@/components/templates/template-editor-client'

interface Params {
  id: string
}

interface SearchParams {
  driveFileId?: string
  driveFileName?: string
}

export default async function TemplateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const templateId = Number(id)
  const query = await searchParams

  return (
    <TemplateEditorClient
      templateId={Number.isFinite(templateId) ? templateId : NaN}
      prefillDriveImage={
        query.driveFileId
          ? {
              fileId: query.driveFileId,
              fileName: query.driveFileName,
            }
          : undefined
      }
    />
  )
}
