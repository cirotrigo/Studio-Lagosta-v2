"use client"

import { useSearchParams } from 'next/navigation'
import { PostForm } from '@/components/tools/scheduler/PostForm'

export default function NewPostPage() {
  const searchParams = useSearchParams()
  const defaultDate = searchParams.get('date')

  return <PostForm mode="create" defaultDate={defaultDate} />
}
