import BrandAssetsSection from '@/components/project/identity/BrandAssetsSection'
import StyleAnalysisSection from '@/components/project/identity/StyleAnalysisSection'
import DesignSystemImportSection from '@/components/project/identity/DesignSystemImportSection'
import ArtTemplatesSection from '@/components/project/identity/ArtTemplatesSection'

interface IdentityTabProps {
  projectId: number
}

export default function IdentityTab({ projectId }: IdentityTabProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <BrandAssetsSection projectId={projectId} />
        <div className="h-px bg-border" />
        <StyleAnalysisSection projectId={projectId} />
        <div className="h-px bg-border" />
        <DesignSystemImportSection projectId={projectId} />
        <div className="h-px bg-border" />
        <ArtTemplatesSection projectId={projectId} />
      </div>
    </div>
  )
}
