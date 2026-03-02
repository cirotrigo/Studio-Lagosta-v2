import { Image, Film, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostType, POST_TYPE_LABELS } from '@/lib/constants'

interface PostTypeSelectorProps {
  value: PostType
  onChange: (type: PostType) => void
}

const postTypes: { type: PostType; icon: typeof Image; description: string }[] = [
  {
    type: 'POST',
    icon: Image,
    description: '1080×1350 (4:5)',
  },
  {
    type: 'STORY',
    icon: Film,
    description: '1080×1920 (9:16)',
  },
  {
    type: 'REEL',
    icon: Film,
    description: '1080×1920 (9:16)',
  },
  {
    type: 'CAROUSEL',
    icon: LayoutGrid,
    description: 'Até 10 imagens',
  },
]

export default function PostTypeSelector({ value, onChange }: PostTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text">Tipo de Post</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {postTypes.map(({ type, icon: Icon, description }) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-3',
              'transition-all duration-200',
              value === type
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-input text-text-muted hover:border-primary/50'
            )}
          >
            <Icon size={24} />
            <div className="text-center">
              <p className="text-sm font-medium">{POST_TYPE_LABELS[type]}</p>
              <p className="text-xs opacity-70">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
