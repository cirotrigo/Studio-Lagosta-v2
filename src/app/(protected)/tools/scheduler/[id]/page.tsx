"use client"

import * as React from 'react'
import { useParams } from 'next/navigation'
import { useToolsProject } from '@/contexts/ProjectContext'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { PostForm } from '@/components/tools/scheduler/PostForm'
import { Loader2, FolderOpen } from 'lucide-react'

export default function EditPostPage() {
  const params = useParams()
  const postId = params.id as string
  const { currentProject } = useToolsProject()

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
          <FolderOpen className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-[#FAFAFA]">Selecione um projeto</h2>
        <p className="text-sm text-[#71717A] text-center max-w-md">
          Escolha um projeto na barra lateral para editar este post.
        </p>
      </div>
    )
  }

  return <EditPostContent projectId={currentProject.id} postId={postId} />
}

function EditPostContent({ projectId, postId }: { projectId: number; postId: string }) {
  const { usePost } = useSocialPosts(projectId)
  const { data: post, isLoading } = usePost(postId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <h2 className="text-lg font-semibold text-[#FAFAFA]">Post não encontrado</h2>
        <p className="text-sm text-[#71717A]">O post que você procura não existe ou foi removido.</p>
      </div>
    )
  }

  return <PostForm mode="edit" post={post} />
}
