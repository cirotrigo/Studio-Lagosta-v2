import { useState } from 'react'
import { HardDrive, FolderOpen, Sparkles, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostType } from '@/lib/constants'
import { ProcessedImage } from '@/hooks/use-image-processor'
import LocalUploadTab from './LocalUploadTab'
import DriveUploadTab from './DriveUploadTab'
import AIImagesTab from './AIImagesTab'
import CreativesTab from './CreativesTab'

type TabId = 'local' | 'drive' | 'ai' | 'creatives'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const TABS: Tab[] = [
  { id: 'local', label: 'Local', icon: <HardDrive size={15} /> },
  { id: 'drive', label: 'Google Drive', icon: <FolderOpen size={15} /> },
  { id: 'ai', label: 'Imagens IA', icon: <Sparkles size={15} /> },
  { id: 'creatives', label: 'Criativos', icon: <Layers size={15} /> },
]

interface UploadTabsProps {
  postType: PostType
  processedImages: ProcessedImage[]
  isProcessing: boolean
  onFilesSelected: (files: File[]) => void
  onRemoveImage: (index: number) => void
  onEditCrop?: (index: number) => void
  projectId: number
}

export default function UploadTabs({
  postType,
  processedImages,
  isProcessing,
  onFilesSelected,
  onRemoveImage,
  onEditCrop,
  projectId,
}: UploadTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('local')

  return (
    <div className="space-y-3">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-input p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-card text-text shadow-sm'
                : 'text-text-muted hover:text-text'
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'local' && (
          <LocalUploadTab
            postType={postType}
            processedImages={processedImages}
            isProcessing={isProcessing}
            onFilesSelected={onFilesSelected}
            onRemoveImage={onRemoveImage}
            onEditCrop={onEditCrop}
          />
        )}
        {activeTab === 'drive' && (
          <DriveUploadTab
            key={`drive-${projectId}`}
            projectId={projectId}
            postType={postType}
            processedImages={processedImages}
            isProcessing={isProcessing}
            onFilesSelected={onFilesSelected}
          />
        )}
        {activeTab === 'ai' && (
          <AIImagesTab
            projectId={projectId}
            postType={postType}
            processedImages={processedImages}
            isProcessing={isProcessing}
            onFilesSelected={onFilesSelected}
          />
        )}
        {activeTab === 'creatives' && (
          <CreativesTab
            projectId={projectId}
            postType={postType}
            processedImages={processedImages}
            isProcessing={isProcessing}
            onFilesSelected={onFilesSelected}
          />
        )}
      </div>
    </div>
  )
}
