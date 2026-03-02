"use client"

import * as React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Trash2, Pencil, Image as ImageIcon, Film, Layers, Smartphone } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-zinc-500/20 text-zinc-400',
  SCHEDULED: 'bg-amber-500/20 text-amber-400',
  POSTING: 'bg-yellow-500/20 text-yellow-400 animate-pulse',
  POSTED: 'bg-green-500/20 text-green-400',
  FAILED: 'bg-red-500/20 text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  POSTING: 'Publicando',
  POSTED: 'Publicado',
  FAILED: 'Falhou',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  POST: ImageIcon,
  STORY: Smartphone,
  REEL: Film,
  CAROUSEL: Layers,
}

const TYPE_LABELS: Record<string, string> = {
  POST: 'Feed',
  STORY: 'Story',
  REEL: 'Reel',
  CAROUSEL: 'Carrossel',
}

interface PostCardProps {
  post: {
    id: string
    postType: string
    caption: string | null
    mediaUrls: string[]
    status: string
    scheduledDatetime: string | null
    createdAt: string
  }
  onDelete: (id: string) => void
  isDeleting?: boolean
}

export function PostCard({ post, onDelete, isDeleting }: PostCardProps) {
  const TypeIcon = TYPE_ICONS[post.postType] || ImageIcon
  const thumbnail = post.mediaUrls?.[0]
  const dateStr = post.scheduledDatetime || post.createdAt

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-[#27272A] bg-[#161616] transition-all duration-200 hover:border-[#3f3f46]">
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] bg-[#1a1a1a] overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TypeIcon className="h-10 w-10 text-[#27272A]" />
          </div>
        )}
        {/* Type badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5">
          <TypeIcon className="h-3 w-3 text-[#A1A1AA]" />
          <span className="text-[10px] font-medium text-[#A1A1AA]">{TYPE_LABELS[post.postType] || post.postType}</span>
        </div>
        {/* Carousel count */}
        {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
          <div className="absolute top-2 right-2 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5">
            <span className="text-[10px] font-medium text-[#A1A1AA]">{post.mediaUrls.length} imgs</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-3">
        {/* Date + Status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[#71717A]">
            {format(new Date(dateStr), "EEE, dd MMM · HH:mm", { locale: ptBR })}
          </span>
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', STATUS_STYLES[post.status] || STATUS_STYLES.DRAFT)}>
            {STATUS_LABELS[post.status] || post.status}
          </span>
        </div>

        {/* Caption preview */}
        {post.caption && (
          <p className="text-xs text-[#A1A1AA] line-clamp-2 leading-relaxed">
            {post.caption}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Link
            href={`/tools/scheduler/${post.id}`}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/5 transition-colors duration-200"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-200"
                disabled={isDeleting}
              >
                <Trash2 className="h-3 w-3" />
                Excluir
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#161616] border-[#27272A]">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#FAFAFA]">Excluir post?</AlertDialogTitle>
                <AlertDialogDescription className="text-[#A1A1AA]">
                  Esta ação não pode ser desfeita. O post será permanentemente removido.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-[#1a1a1a] border-[#27272A] text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(post.id)}
                  className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}
