'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, Instagram, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface InstagramAccountConfigProps {
  projectId: number
  instagramAccountId?: string | null
  instagramUsername?: string | null
  zapierWebhookUrl?: string | null
}

interface UpdateInstagramData {
  instagramAccountId?: string
  instagramUsername?: string
  zapierWebhookUrl?: string
}

export function InstagramAccountConfig({
  projectId,
  instagramAccountId: initialAccountId,
  instagramUsername: initialUsername,
  zapierWebhookUrl: initialWebhookUrl,
}: InstagramAccountConfigProps) {
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState(initialAccountId || '')
  const [username, setUsername] = useState(initialUsername || '')
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl || '')

  const updateMutation = useMutation({
    mutationFn: (data: UpdateInstagramData) =>
      api.patch(`/api/projects/${projectId}/instagram`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Configurações do Instagram atualizadas!')
    },
    onError: (error) => {
      console.error('Error updating Instagram config:', error)
      toast.error('Erro ao atualizar configurações do Instagram')
    },
  })

  const handleSave = () => {
    if (!accountId.trim()) {
      toast.error('ID da Conta é obrigatório')
      return
    }

    // Validate webhook URL if provided
    if (webhookUrl.trim() && !webhookUrl.startsWith('https://hooks.zapier.com/')) {
      toast.error('URL do webhook deve ser do Zapier (https://hooks.zapier.com/...)')
      return
    }

    updateMutation.mutate({
      instagramAccountId: accountId.trim(),
      instagramUsername: username.trim() || undefined,
      zapierWebhookUrl: webhookUrl.trim() || undefined,
    })
  }

  const hasChanges =
    accountId !== (initialAccountId || '') ||
    username !== (initialUsername || '') ||
    webhookUrl !== (initialWebhookUrl || '')

  const isConfigured = Boolean(initialAccountId)

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-pink-500/10 rounded-lg">
          <Instagram className="w-5 h-5 text-pink-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Conta do Instagram</h3>
          <p className="text-sm text-muted-foreground">
            Configure a conta do Instagram associada a este projeto para agendamento de posts
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Instagram Account ID (Required) */}
        <div>
          <Label htmlFor="instagramAccountId" className="flex items-center gap-2">
            ID da Conta
            <span className="text-xs text-red-500">*</span>
          </Label>
          <Input
            id="instagramAccountId"
            placeholder="ex: by.rock, account123, ou qualquer ID único"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Identificador único usado no webhook do Zapier para rotear posts para a conta correta.
            Pode ser o username, um número, ou qualquer ID que você preferir.
          </p>
        </div>

        {/* Instagram Username (Optional) */}
        <div>
          <Label htmlFor="instagramUsername">Nome de Usuário (opcional)</Label>
          <Input
            id="instagramUsername"
            placeholder="ex: @by.rock ou by.rock"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Username do Instagram para exibição na interface
          </p>
        </div>

        {/* Zapier Webhook URL (Optional) */}
        <div>
          <Label htmlFor="zapierWebhookUrl">Zapier Webhook URL (opcional)</Label>
          <Input
            id="zapierWebhookUrl"
            type="url"
            placeholder="https://hooks.zapier.com/hooks/catch/123456/abcdef"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="mt-2 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            URL do webhook do Zapier específico para este projeto. Se não configurado, usa o webhook global.
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            💡 Como obter: No Zapier, crie um Zap com trigger "Webhooks by Zapier" → "Catch Hook" → Copie a URL
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges || !accountId.trim()}
          >
            {updateMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>

        {/* Status Alerts */}
        {isConfigured && !hasChanges && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-700 dark:text-green-400">
              Conta Configurada
            </AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-300">
              <div className="space-y-1">
                <p>
                  Posts deste projeto serão enviados para:{' '}
                  <strong>{initialAccountId}</strong>
                  {initialUsername && (
                    <>
                      {' '}
                      (<span className="text-pink-500">@{initialUsername.replace('@', '')}</span>)
                    </>
                  )}
                </p>
                {initialWebhookUrl ? (
                  <p className="text-xs mt-2">
                    ✅ Webhook específico: <code className="bg-green-500/20 px-1 rounded">{initialWebhookUrl.substring(0, 50)}...</code>
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    ⚠️ Usando webhook global (não configurado para este projeto)
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!isConfigured && (
          <Alert className="bg-amber-500/10 border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-700 dark:text-amber-400">
              Configuração Pendente
            </AlertTitle>
            <AlertDescription className="text-amber-600 dark:text-amber-300">
              Configure o ID da conta do Instagram para habilitar o agendamento de posts para este
              projeto.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Help Section */}
      <div className="mt-6 pt-6 border-t">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Como configurar webhook por projeto?
          </summary>
          <div className="mt-3 text-xs text-muted-foreground space-y-2 pl-4 border-l-2">
            <p>
              <strong className="text-foreground">1. Criar Zap no Zapier:</strong> Acesse Zapier e crie um novo Zap com trigger "Webhooks by Zapier" → "Catch Hook".
            </p>
            <p>
              <strong className="text-foreground">2. Copiar Webhook URL:</strong> O Zapier vai gerar uma URL como https://hooks.zapier.com/hooks/catch/123456/abcdef - copie ela.
            </p>
            <p>
              <strong className="text-foreground">3. Configurar Ação:</strong> No Zapier, configure a ação para enviar para Buffer usando o instagram_account_id do payload.
            </p>
            <p>
              <strong className="text-foreground">4. Colar Aqui:</strong> Cole a URL do webhook no campo acima e salve.
            </p>
            <p className="text-amber-600 dark:text-amber-400">
              <strong>⚠️ Fallback:</strong> Se não configurar um webhook específico, o sistema usará o webhook global configurado em ZAPIER_WEBHOOK_URL.
            </p>
          </div>
        </details>
      </div>
    </Card>
  )
}
