'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, KeyRound, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface InstagramTokenConfigProps {
  projectId: number
  hasToken?: boolean
  expiresAt?: string | null
  instagramUsername?: string | null
}

interface SalvarResposta {
  username: string
  mediaCount: number | null
  expiresAt: string
}

const formatarData = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : null

const diasAte = (iso?: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null

export function InstagramTokenConfig({
  projectId,
  hasToken,
  expiresAt,
  instagramUsername,
}: InstagramTokenConfigProps) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const salvar = useMutation({
    mutationFn: (valor: string) =>
      api.put<SalvarResposta>(`/api/projects/${projectId}/instagram-token`, { token: valor }),
    onSuccess: (data) => {
      setToken('')
      invalidar()
      toast.success(`Token de @${data.username} salvo`, {
        description: `Válido até ${formatarData(data.expiresAt)}`,
      })
    },
    onError: (error: unknown) => {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Erro ao salvar token'
      toast.error(msg)
    },
  })

  const remover = useMutation({
    mutationFn: () => api.delete(`/api/projects/${projectId}/instagram-token`),
    onSuccess: () => {
      invalidar()
      toast.success('Token removido')
    },
    onError: () => toast.error('Erro ao remover token'),
  })

  const dias = diasAte(expiresAt)
  const expirando = dias !== null && dias <= 10

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2">
          <KeyRound className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Token do Instagram</h3>
          <p className="text-sm text-muted-foreground">
            Necessário para verificar publicações e coletar métricas desta conta
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="instagram-token">
            {hasToken ? 'Substituir token' : 'Colar token'}
          </Label>
          <Input
            id="instagram-token"
            type="password"
            autoComplete="off"
            placeholder="IGAA..."
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="mt-2 font-mono text-xs"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Gere em{' '}
            <a
              href="https://developers.facebook.com/apps/1476916907060374/instagram-business/API-Setup-with-Instagram-login/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Meta → Instagram → Gere tokens de acesso
            </a>
            . O token é validado contra a conta do projeto antes de salvar e nunca é exibido de volta.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {hasToken && (
            <Button
              variant="ghost"
              onClick={() => remover.mutate()}
              disabled={remover.isPending || salvar.isPending}
              className="text-muted-foreground"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {remover.isPending ? 'Removendo...' : 'Remover'}
            </Button>
          )}
          <Button
            onClick={() => salvar.mutate(token.trim())}
            disabled={salvar.isPending || token.trim().length < 20}
          >
            {salvar.isPending ? 'Validando...' : 'Salvar token'}
          </Button>
        </div>

        {hasToken && !expirando && (
          <Alert className="border-green-500/20 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-700 dark:text-green-400">Token ativo</AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-300">
              {instagramUsername && (
                <>
                  Coletando dados de{' '}
                  <strong>@{instagramUsername.replace(/^@+/, '')}</strong>.{' '}
                </>
              )}
              {expiresAt && <>Válido até {formatarData(expiresAt)}</>}
              {dias !== null && <> ({dias} dias). A renovação é automática.</>}
            </AlertDescription>
          </Alert>
        )}

        {hasToken && expirando && (
          <Alert className="border-amber-500/20 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-700 dark:text-amber-400">
              Token perto de expirar
            </AlertTitle>
            <AlertDescription className="text-amber-600 dark:text-amber-300">
              Expira em {formatarData(expiresAt)}
              {dias !== null && <> ({dias} dias)</>}. O cron diário tenta renovar sozinho; se falhar,
              gere um token novo e cole acima.
            </AlertDescription>
          </Alert>
        )}

        {!hasToken && (
          <Alert className="border-amber-500/20 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-700 dark:text-amber-400">Sem token</AlertTitle>
            <AlertDescription className="text-amber-600 dark:text-amber-300">
              Este projeto não coleta métricas nem verifica publicações. A conta precisa aceitar o
              convite de testador no app antes de gerar o token.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  )
}
