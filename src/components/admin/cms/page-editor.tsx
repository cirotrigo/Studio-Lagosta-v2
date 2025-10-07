'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminSections } from '@/hooks/admin/use-admin-cms'
import { SectionsList } from './sections-list'
import { SectionEditor } from './section-editor'
import { AddSectionDialog } from './add-section-dialog'
import type { CMSPage } from '@/hooks/admin/use-admin-cms'

type PageEditorProps = {
  page: CMSPage
}

export function PageEditor({ page }: PageEditorProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  const { data: sectionsData, isLoading } = useAdminSections(page.id)
  const sections = sectionsData?.sections || []

  const selectedSection = sections.find((s) => s.id === selectedSectionId)

  return (
    <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
      {/* Left: Sections List */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Seções</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <SectionsList
              sections={sections}
              isLoading={isLoading}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
              pageId={page.id}
            />
          </CardContent>
        </Card>
      </div>

      {/* Right: Section Editor or Empty State */}
      <div>
        {selectedSection ? (
          <SectionEditor
            section={selectedSection}
            pageId={page.id}
            onClose={() => setSelectedSectionId(null)}
          />
        ) : (
          <Card className="min-h-[400px] flex items-center justify-center">
            <CardContent className="text-center">
              <h3 className="text-lg font-semibold mb-2">
                Selecione uma seção para editar
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Clique em uma seção na lista ao lado ou adicione uma nova seção
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Seção
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        pageId={page.id}
        onSectionCreated={(section) => {
          setSelectedSectionId(section.id)
          setIsAddDialogOpen(false)
        }}
      />
    </div>
  )
}
