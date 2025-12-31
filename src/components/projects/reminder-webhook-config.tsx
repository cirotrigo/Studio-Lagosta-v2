'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, Bell, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ReminderWebhookConfigProps {
  projectId: number
  webhookReminderUrl?: string | null
}

interface UpdateWebhookData {
  webhookReminderUrl?: string | null
}

export function ReminderWebhookConfig({
  projectId,
  webhookReminderUrl: initialWebhookUrl,
}: ReminderWebhookConfigProps) {
  const queryClient = useQueryClient()
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl || '')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const updateMutation = useMutation({
    mutationFn: (data: UpdateWebhookData) =>
      api.patch(`/api/projects/${projectId}/settings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Webhook de lembretes atualizado!')
    },
    onError: (error) => {
      console.error('Error updating webhook config:', error)
      toast.error('Erro ao atualizar webhook de lembretes')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectId}/test-webhook`, {}),
    onSuccess: (data: any) => {
      if (data.success) {
        setTestResult({
          success: true,
          message: `✅ Webhook testado com sucesso! (${data.responseTime}ms)`
        })
        toast.success('Webhook testado com sucesso!')
      } else {
        setTestResult({
          success: false,
          message: `❌ ${data.error}`
        })
        toast.error(data.error || 'Erro ao testar webhook')
      }
    },
    onError: (error: any) => {
      const errorMsg = error?.message || 'Erro desconhecido ao testar webhook'
      setTestResult({
        success: false,
        message: `❌ ${errorMsg}`
      })
      toast.error(errorMsg)
    },
  })

  const handleSave = () => {
    // Validate webhook URL if provided
    if (webhookUrl.trim() && !webhookUrl.startsWith('http')) {
      toast.error('URL do webhook deve começar com http:// ou https://')
      return
    }

    updateMutation.mutate({
      webhookReminderUrl: webhookUrl.trim() || null,
    })
  }

  const handleTest = () => {
    if (!webhookUrl.trim()) {
      toast.error('Configure uma URL de webhook antes de testar')
      return
    }

    if (!initialWebhookUrl || webhookUrl !== initialWebhookUrl) {
      toast.error('Salve a configuração antes de testar')
      return
    }

    setTestResult(null)
    testMutation.mutate()
  }

  const hasChanges = webhookUrl !== (initialWebhookUrl || '')
  const isConfigured = Boolean(initialWebhookUrl)

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-blue-500/10 rounded-lg">
          <Bell className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Webhook de Lembretes</h3>
          <p className="text-sm text-muted-foreground">
            Configure um webhook (n8n, Make, Zapier) para receber notificações de posts com lembrete
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Webhook URL */}
        <div>
          <Label htmlFor="webhookReminderUrl">URL do Webhook (opcional)</Label>
          <Input
            id="webhookReminderUrl"
            type="url"
            placeholder="https://seu-n8n.com/webhook/reminder"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="mt-2 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            URL para receber notificações de posts do tipo "Lembrete" 5 minutos antes do horário agendado
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            💡 Use para integrar com n8n, Make.com, Zapier ou qualquer sistema que aceite webhooks
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges}
            className="flex-1"
          >
            {updateMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
          </Button>

          <Button
            onClick={handleTest}
            disabled={testMutation.isPending || !isConfigured || hasChanges}
            variant="outline"
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testando...
              </>
            ) : (
              'Testar Webhook'
            )}
          </Button>
        </div>

        {/* Test Result */}
        {testResult && (
          <Alert className={testResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            <AlertTitle>Resultado do Teste</AlertTitle>
            <AlertDescription className="text-sm">
              {testResult.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Status Alerts */}
        {isConfigured && !hasChanges && !testResult && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle>Webhook Configurado</AlertTitle>
            <AlertDescription>
              Os posts do tipo "Lembrete" dispararão notificações para este webhook
            </AlertDescription>
          </Alert>
        )}

        {!isConfigured && !hasChanges && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Webhook Não Configurado</AlertTitle>
            <AlertDescription>
              Posts do tipo "Lembrete" não receberão notificações. Configure um webhook para habilitar lembretes.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  )
}
