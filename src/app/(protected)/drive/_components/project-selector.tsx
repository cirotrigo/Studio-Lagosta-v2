'use client'

import * as React from 'react'
import { ChevronsUpDown, Check, HardDrive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { ProjectWithLogoResponse } from '@/hooks/use-project'

interface ProjectSelectorProps {
  projects: ProjectWithLogoResponse[]
  value: number | null
  onChange: (id: number | null) => void
  isLoading?: boolean
}

export function ProjectSelector({ projects, value, onChange, isLoading }: ProjectSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const selectedProject = projects.find((project) => project.id === value)

  const handleSelect = React.useCallback(
    (projectId: number) => {
      onChange(projectId)
      setOpen(false)
    },
    [onChange],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-w-[220px] justify-between"
          disabled={isLoading || !projects.length}
        >
          <span className="flex items-center gap-2 truncate">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            {selectedProject
              ? selectedProject.name
              : isLoading
                ? 'Carregando projetos...'
                : projects.length
                  ? 'Selecione um projeto'
                  : 'Nenhum projeto com Drive'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar projeto" />
          <CommandList>
            <CommandEmpty>Nenhum projeto encontrado</CommandEmpty>
            <CommandGroup heading="Projetos">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={String(project.id)}
                  onSelect={() => handleSelect(project.id)}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      project.id === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
