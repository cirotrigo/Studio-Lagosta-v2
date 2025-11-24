'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldAlert, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { SocialPost } from '../../../prisma/generated/client'

interface VerificationFailedListProps {
  posts: Array<
    SocialPost & {
      Project: {
        id: number
        name: string
        instagramUsername: string | null
      }
    }
  >
  onRetry?: (postId: string) => void
  isRetrying?: boolean
}

const ERROR_MESSAGES: Record<string, string> = {
  NO_TAG: 'Post sem TAG de verificação',
  LEGACY_POST_NO_TAG: 'Post antigo sem TAG',
  NO_IG_ACCOUNT: 'Conta Instagram não configurada',
  TTL_EXPIRED: 'Story expirou (>24h)',
  NOT_FOUND: 'Story não encontrado na API',
  TOKEN_ERROR: 'Erro no token de acesso',
  PERMISSION_ERROR: 'Sem permissão para acessar stories',
  RATE_LIMITED: 'Limite de requisições atingido',
  API_ERROR: 'Erro na API do Instagram',
  AMBIGUOUS_MATCH: 'Múltiplos stories encontrados',
  POST_FAILED: 'Post falhou na publicação',
}

export function VerificationFailedList({ posts, onRetry, isRetrying }: VerificationFailedListProps) {
  if (posts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            Posts com Falha na Verificação
          </CardTitle>
          <CardDescription>Nenhum post com falha na verificação encontrado</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-orange-500" />
          Posts com Falha na Verificação
        </CardTitle>
        <CardDescription>{posts.length} post(s) não puderam ser verificados</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {posts.map((post) => {
          const errorMessage = post.verificationError
            ? ERROR_MESSAGES[post.verificationError] || post.verificationError
            : 'Erro desconhecido'

          const canRetry =
            post.verificationError &&
            !['TTL_EXPIRED', 'LEGACY_POST_NO_TAG', 'POST_FAILED'].includes(post.verificationError)

          return (
            <div
              key={post.id}
              className="flex items-start gap-3 p-3 border rounded-lg bg-orange-500/5 border-orange-500/20"
            >
              <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {post.Project.name}
                  </Badge>
                  {post.Project.instagramUsername && (
                    <Badge variant="secondary" className="text-xs">
                      @{post.Project.instagramUsername}
                    </Badge>
                  )}
                </div>

                <p className="text-sm font-medium text-foreground mb-1">
                  {post.caption ? post.caption.substring(0, 100) + (post.caption.length > 100 ? '...' : '') : 'Sem legenda'}
                </p>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Agendado há{' '}
                    {formatDistanceToNow(new Date(post.scheduledDatetime || post.createdAt), {
                      addSuffix: false,
                      locale: ptBR,
                    })}
                  </span>
                  <span>•</span>
                  <span>{post.verificationAttempts || 0} tentativas</span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">
                    {errorMessage}
                  </Badge>
                  {post.verifiedByFallback && (
                    <Badge variant="secondary" className="text-xs">
                      Fallback usado
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {canRetry && onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry(post.id)}
                    disabled={isRetrying}
                    className="flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Tentar Novamente</span>
                  </Button>
                )}
                {post.verifiedPermalink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="flex items-center gap-1"
                  >
                    <a href={post.verifiedPermalink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3" />
                      <span className="hidden sm:inline">Ver Story</span>
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
