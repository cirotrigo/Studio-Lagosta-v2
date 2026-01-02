'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Rocket, AlertCircle, Radio, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLaterAccounts } from '@/hooks/use-later-accounts'

interface LaterProviderConfigProps {
  projectId: number
  laterAccountId?: string | null
  laterProfileId?: string | null
  postingProvider?: 'ZAPIER' | 'LATER' | null
  instagramUsername?: string | null
}

interface UpdateLaterData {
  laterAccountId?: string | null
  laterProfileId?: string | null
  postingProvider?: 'LATER' | null
}

export function LaterProviderConfig({
  projectId,
  laterAccountId: initialAccountId,
  laterProfileId: initialProfileId,
  postingProvider: initialProvider,
  instagramUsername,
}: LaterProviderConfigProps) {
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId || '')

  // Fetch Later accounts
  const { data: laterAccountsData, isLoading: isLoadingAccounts } = useLaterAccounts()

  const updateMutation = useMutation({
    mutationFn: (data: UpdateLaterData) =>
      api.patch(`/api/projects/${projectId}/settings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Provedor de postagem atualizado!')
    },
    onError: (error) => {
      console.error('Error updating later config:', error)
      toast.error('Erro ao atualizar provedor de postagem')
    },
  })

  const handleSave = () => {
    if (!selectedAccountId.trim()) {
      toast.error('Selecione uma conta do Instagram para usar Late API')
      return
    }

    // Find selected account to get both Account ID and Profile ID
    const selectedAccount = laterAccountsData?.accounts.find(
      (acc) => acc.id === selectedAccountId
    )

    updateMutation.mutate({
      laterAccountId: selectedAccountId.trim() || null,
      laterProfileId: selectedAccount?.profileId || null,
      postingProvider: 'LATER',
    })
  }

  const hasChanges =
    selectedAccountId !== (initialAccountId || '') ||
    initialProvider !== 'LATER'

  const wasUsingLater = initialProvider === 'LATER'

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-purple-500/10 rounded-lg">
          <Rocket className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Provedor de Postagem</h3>
          <p className="text-sm text-muted-foreground">
            Configure a conta do Instagram para publicar via Late API
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Later Account Selection - só aparece se LATER selecionado */}
        <div className="p-3 rounded-lg border bg-muted/30">
          <Label htmlFor="laterAccount" className="flex items-center gap-2">
            Conta do Instagram
            <span className="text-xs text-red-500">*</span>
          </Label>

          {isLoadingAccounts ? (
            <div className="flex items-center gap-2 mt-2 p-3 border rounded-lg bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Carregando contas...</span>
            </div>
          ) : (
            <Select
              value={selectedAccountId}
              onValueChange={setSelectedAccountId}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Selecione uma conta do Instagram" />
              </SelectTrigger>
              <SelectContent>
                {laterAccountsData?.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">@{account.username}</span>
                      <span className="text-xs text-muted-foreground">
                        ({account.displayName})
                      </span>
                      {account.followers !== null && (
                        <span className="text-xs text-muted-foreground">
                          • {account.followers.toLocaleString()} seguidores
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {laterAccountsData?.accounts.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhuma conta conectada no Later
                  </div>
                )}
              </SelectContent>
            </Select>
          )}

          {/* Info about selected account */}
          {selectedAccountId && laterAccountsData?.accounts && (
            <div className="mt-2 p-2 rounded bg-muted/50 space-y-1">
              {(() => {
                const selected = laterAccountsData.accounts.find(
                  (acc) => acc.id === selectedAccountId
                )
                return selected ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Conta:</span> @{selected.username}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      <span className="font-semibold">Account ID:</span> {selected.id}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      <span className="font-semibold">Profile ID:</span> {selected.profileId}
                    </p>
                  </>
                ) : null
              })()}
            </div>
          )}

          <div className="mt-3 space-y-1">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              💡 Dica: As contas listadas são as que estão conectadas no painel do Later
            </p>
            <p className="text-xs text-muted-foreground">
              Se não encontrar a conta desejada, conecte-a primeiro em{' '}
              <a
                href="https://getlate.dev/dashboard"
                target="_blank"
                rel="noopener"
                className="text-blue-500 hover:underline"
              >
                getlate.dev/dashboard
              </a>
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges || !selectedAccountId.trim()}
          >
            {updateMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>

        {/* Status Alerts */}
        {wasUsingLater && !hasChanges && (
          <Alert className="bg-purple-500/10 border-purple-500/20">
            <Radio className="h-4 w-4 text-purple-500" />
            <AlertTitle>✅ Usando Late API</AlertTitle>
            <AlertDescription>
              Este projeto está configurado para publicar via Late API.
              {initialAccountId && laterAccountsData?.accounts && (
                <div className="mt-2 text-xs bg-muted px-2 py-1 rounded space-y-1">
                  {(() => {
                    const account = laterAccountsData.accounts.find(
                      (acc) => acc.id === initialAccountId
                    )
                    return account ? (
                      <>
                        <div>
                          <span className="font-semibold">Conta:</span> @{account.username}
                        </div>
                        <div className="font-mono">
                          <span className="font-semibold">Account ID:</span> {account.id}
                        </div>
                      </>
                    ) : (
                      <div className="font-mono">Account ID: {initialAccountId}</div>
                    )
                  })()}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!wasUsingLater && !hasChanges && (
          <Alert className="bg-amber-500/10 border-amber-500/20">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Zapier/Buffer descontinuado</AlertTitle>
            <AlertDescription>
              Este projeto ainda está marcado como Zapier, mas o sistema agora usa apenas Late API.
              Salve a configuração para migrar.
            </AlertDescription>
          </Alert>
        )}

        {/* Warning when changing */}
        {hasChanges && (
          <Alert className="bg-amber-500/10 border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle>Atenção: Mudança de Provedor</AlertTitle>
            <AlertDescription className="text-sm">
              Ao salvar, novos posts serão enviados via <strong>Late API</strong>.
              Posts já agendados continuarão funcionando normalmente.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  )
}
