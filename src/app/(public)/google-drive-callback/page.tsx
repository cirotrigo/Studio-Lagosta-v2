'use client'

import * as React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw } from 'lucide-react'

interface TokenResponse {
  refreshToken: string | null
  accessToken: string | null
  scope: string | null
  expiryDate: number | null
  tokenType: string | null
}

function GoogleDriveCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const [isLoading, setIsLoading] = React.useState(Boolean(code))
  const [error, setError] = React.useState<string | null>(null)
  const [tokens, setTokens] = React.useState<TokenResponse | null>(null)

  const fetchTokens = React.useCallback(async () => {
    if (!code) {
      setError('Parâmetro "code" ausente na URL.')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams({ code })
      if (state) params.set('state', state)

      const response = await fetch(`/api/google-drive/callback?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha na troca de tokens com o Google Drive.')
      }

      const data = (await response.json()) as TokenResponse
      setTokens(data)
    } catch (err) {
      console.error('[GoogleDriveCallbackPage] Token exchange failed', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao obter tokens.')
    } finally {
      setIsLoading(false)
    }
  }, [code, state])

  React.useEffect(() => {
    void fetchTokens()
  }, [fetchTokens])

  const handleCopy = (value: string | null, label: string) => {
    if (!value) return
    void navigator.clipboard.writeText(value)
    alert(`${label} copiado para a área de transferência.`)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Integração com Google Drive</h1>
        <p className="text-sm text-muted-foreground">
          Esta página exibe o token de atualização retornado pelo Google. Copie-o e adicione nas variáveis de ambiente do servidor.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Status da Autorização</h2>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? 'Aguardando resposta do Google...'
                : tokens
                  ? 'Tokens gerados com sucesso. Copie o refresh token abaixo.'
                  : error
                    ? 'Ocorreu um erro durante a autorização.'
                    : 'Informe o código e o estado retornados pelo Google.'}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.replace('/projects')}>
            Voltar aos projetos
          </Button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {isLoading && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Trocando código por tokens...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {tokens && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide">Refresh Token</h3>
                  <Badge variant="secondary">Persistir em .env</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Input value={tokens.refreshToken ?? ''} readOnly className="font-mono" />
                  <Button onClick={() => handleCopy(tokens.refreshToken, 'Refresh token')}>
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Adicione este valor em <code>GOOGLE_DRIVE_REFRESH_TOKEN</code> no servidor. Guarde-o com segurança.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoField label="Access Token" value={tokens.accessToken} />
                <InfoField label="Escopo" value={tokens.scope} />
                <InfoField label="Tipo" value={tokens.tokenType} />
                <InfoField
                  label="Válido até"
                  value={tokens.expiryDate ? new Date(tokens.expiryDate).toLocaleString('pt-BR') : 'Não informado'}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4" />
            {code ? 'Se precisar gerar novamente, execute o fluxo OAuth mais uma vez.' : 'Inclua o parâmetro "code" nesta URL para iniciar o processo.'}
          </div>
        </div>
      </Card>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-mono text-xs">{value ?? '—'}</p>
    </div>
  )
}

export default function GoogleDriveCallbackPage() {
  return (
    <React.Suspense fallback={
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <GoogleDriveCallbackContent />
    </React.Suspense>
  )
}
