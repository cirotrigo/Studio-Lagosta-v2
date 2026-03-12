import { cn, getInitials, getProjectLogo } from '@/lib/utils'
import { Project } from '@/stores/project.store'

interface ProjectBadgeProps {
  project: Project
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function ProjectBadge({
  project,
  size = 'md',
  className,
}: ProjectBadgeProps) {
  const sizeClasses = {
    sm: 'h-6 gap-1.5 px-2 text-xs',
    md: 'h-8 gap-2 px-3 text-sm',
    lg: 'h-10 gap-2.5 px-4 text-base',
  }

  const avatarSizes = {
    sm: 'h-4 w-4 text-[10px]',
    md: 'h-5 w-5 text-xs',
    lg: 'h-6 w-6 text-sm',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-primary/30 bg-primary/5',
        sizeClasses[size],
        className
      )}
    >
      {getProjectLogo(project) ? (
        <img
          src={getProjectLogo(project)!}
          alt={project.name}
          className={cn('rounded object-cover', avatarSizes[size])}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded bg-primary/20 font-medium text-primary',
            avatarSizes[size]
          )}
        >
          {getInitials(project.name)}
        </div>
      )}
      <span className="font-medium text-primary">{project.name}</span>
      {project.instagramUsername && (
        <span className="text-text-muted">@{project.instagramUsername}</span>
      )}
    </div>
  )
}
