'use client'

import { useDraggable } from '@dnd-kit/core'
import { PostMiniCard } from './post-mini-card'
import type { SocialPost } from '../../../../prisma/generated/client'

interface DraggablePostProps {
    post: SocialPost
    onClick: () => void
}

export function DraggablePost({ post, onClick }: DraggablePostProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: post.id,
        data: {
            post,
            type: 'POST',
        },
    })

    // Prevent drag when clicking the post to open details (if needed)
    // Logic: we want drag to work, but click also needs to work.
    // dnd-kit handles this well usually.

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={isDragging ? 'opacity-50' : undefined}
            style={{ touchAction: 'none' }} // Recommended for touch devices
        >
            <PostMiniCard
                post={post}
                onClick={onClick}
            />
        </div>
    )
}
