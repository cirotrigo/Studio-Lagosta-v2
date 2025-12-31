'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, Rocket, AlertCircle, Radio } from 'lucide-react'
import { toast } from 'sonner'

interface LaterProviderConfigProps {
  projectId: number
  laterProfileId?: string | null
  postingProvider?: 'ZAPIER' | 'LATER' | null
}

interface UpdateLaterData {
  laterProfileId?: string | null
  postingProvider?: 'ZAPIER' | 'LATER' | null
}

const LATER_ACCOUNT_ID = '6951bef24207e06f4ca82e68' // Account ID fixo

export function LaterProviderConfig({
  projectId,
  laterProfileId: initialProfileId,
  postingProvider: initialProvider,
}: LaterProviderConfigProps) {
  const queryClient = useQueryClient()
  const [profileId, setProfileId] = useState(initialProfileId || '')
  const [provider, setProvider] = useState<'ZAPIER' | 'LATER'>(initialProvider || 'ZAPIER')

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
    // Se mudou para LATER, validar profile ID
    if (provider === 'LATER' && !profileId.trim()) {
      toast.error('Profile ID do Late é obrigatório para usar Late API')
      return
    }

    updateMutation.mutate({
      laterProfileId: profileId.trim() || null,
      postingProvider: provider,
    })
  }

  const hasChanges =
    profileId !== (initialProfileId || '') ||
    provider !== (initialProvider || 'ZAPIER')

  const isUsingLater = provider === 'LATER'
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
            Escolha entre Zapier/Buffer ou Late API para publicar posts do Instagram
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Provider Selection */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Provedor Atual</Label>
          <div className="grid grid-cols-2 gap-3">
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
              provider === 'ZAPIER' ? 'border-primary bg-primary/5' : ''
            }`}>
              <input
                type="radio"
                value="ZAPIER"
                checked={provider === 'ZAPIER'}
                onChange={(e) => setProvider(e.target.value as 'ZAPIER')}
                className="mt-1"
              />
              <div className="flex-1">
                <span className="font-medium">Zapier/Buffer</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Método atual via webhook Zapier
                </p>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
              provider === 'LATER' ? 'border-primary bg-primary/5' : ''
            }`}>
              <input
                type="radio"
                value="LATER"
                checked={provider === 'LATER'}
                onChange={(e) => setProvider(e.target.value as 'LATER')}
                className="mt-1"
              />
              <div className="flex-1">
                <span className="font-medium">Late API</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Nova API com webhooks e analytics
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Later Profile ID - só aparece se LATER selecionado */}
        {isUsingLater && (
          <div className="p-3 rounded-lg border bg-muted/30">
            <Label htmlFor="laterProfileId" className="flex items-center gap-2">
              Profile ID do Late
              <span className="text-xs text-red-500">*</span>
            </Label>
            <Input
              id="laterProfileId"
              placeholder="ex: 6950a7dfbf2041fa31e82829"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="mt-2 font-mono text-sm"
            />
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">
                Account ID (fixo): <code className="bg-muted px-1 py-0.5 rounded">{LATER_ACCOUNT_ID}</code>
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                💡 Para obter o Profile ID:
              </p>
              <ol className="text-xs text-muted-foreground ml-4 space-y-0.5">
                <li>1. Acesse <a href="https://getlate.dev/dashboard" target="_blank" rel="noopener" className="text-blue-500 hover:underline">getlate.dev/dashboard</a></li>
                <li>2. Vá em Settings → Profiles</li>
                <li>3. Clique no perfil do Instagram deste projeto</li>
                <li>4. Copie o Profile ID</li>
              </ol>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges || (isUsingLater && !profileId.trim())}
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
              {initialProfileId && (
                <div className="mt-2 text-xs font-mono bg-muted px-2 py-1 rounded">
                  Profile: {initialProfileId}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!wasUsingLater && !hasChanges && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Usando Zapier/Buffer</AlertTitle>
            <AlertDescription>
              Este projeto está usando o método tradicional via Zapier.
              Migre para Late API para ter webhooks e analytics.
            </AlertDescription>
          </Alert>
        )}

        {/* Warning when changing */}
        {hasChanges && (
          <Alert className="bg-amber-500/10 border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle>Atenção: Mudança de Provedor</AlertTitle>
            <AlertDescription className="text-sm">
              {isUsingLater ? (
                <>
                  Ao salvar, novos posts serão enviados via <strong>Late API</strong>.
                  Posts já agendados continuarão funcionando normalmente.
                </>
              ) : (
                <>
                  Ao salvar, novos posts voltarão a ser enviados via <strong>Zapier/Buffer</strong>.
                  Posts já agendados continuarão funcionando normalmente.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  )
}
