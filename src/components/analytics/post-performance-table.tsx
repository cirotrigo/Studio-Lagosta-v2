'use client'

import { PostAnalyticsItem } from '@/hooks/use-project-analytics'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Image as ImageIcon, Video } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PostPerformanceTableProps {
  posts: PostAnalyticsItem[]
}

export function PostPerformanceTable({ posts }: PostPerformanceTableProps) {
  const formatNumber = (num: number | null) => {
    if (num === null) return '-'
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`
    }
    return num.toLocaleString()
  }

  const calculateEngagementRate = (post: PostAnalyticsItem) => {
    if (!post.analyticsEngagement || !post.analyticsReach) return null
    return ((post.analyticsEngagement / post.analyticsReach) * 100).toFixed(1)
  }

  const getPostTypeIcon = (postType: string) => {
    if (postType === 'STORY') {
      return <ImageIcon className="h-4 w-4" />
    }
    if (postType === 'REEL') {
      return <Video className="h-4 w-4" />
    }
    return <ImageIcon className="h-4 w-4" />
  }

  const getPostTypeBadge = (postType: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      FEED: 'default',
      STORY: 'secondary',
      REEL: 'outline',
    }
    return (
      <Badge variant={variants[postType] || 'default'} className="text-xs">
        {postType}
      </Badge>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum post com analytics disponível
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Tipo</TableHead>
            <TableHead className="min-w-[200px]">Caption</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Curtidas</TableHead>
            <TableHead className="text-right">Comentários</TableHead>
            <TableHead className="text-right">Alcance</TableHead>
            <TableHead className="text-right">Engagement</TableHead>
            <TableHead className="text-right">Taxa</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => {
            const engagementRate = calculateEngagementRate(post)
            return (
              <TableRow key={post.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getPostTypeIcon(post.postType)}
                    {getPostTypeBadge(post.postType)}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm line-clamp-2 max-w-[300px]">
                    {post.caption}
                  </p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {post.sentAt
                    ? format(new Date(post.sentAt), "dd MMM 'às' HH:mm", {
                        locale: ptBR,
                      })
                    : '-'}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatNumber(post.analyticsLikes)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatNumber(post.analyticsComments)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatNumber(post.analyticsReach)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatNumber(post.analyticsEngagement)}
                </TableCell>
                <TableCell className="text-right">
                  {engagementRate ? (
                    <Badge variant="outline" className="font-mono text-xs">
                      {engagementRate}%
                    </Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {post.publishedUrl && (
                    <a
                      href={post.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
