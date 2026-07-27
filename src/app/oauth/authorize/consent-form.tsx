"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'

/**
 * Botões de aprovar/recusar. A aprovação vai por POST — o código de
 * autorização não pode nascer de um GET, que qualquer link conseguiria disparar.
 */
export function ConsentForm({
  clientId,
  redirectUri,
  state,
  codeChallenge,
}: {
  clientId: string
  redirectUri: string
  state?: string
  codeChallenge: string
}) {
  const [enviando, setEnviando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  async function aprovar() {
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch('/api/oauth/authorize/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, redirectUri, state, codeChallenge }),
      })
      const dados = await res.json()
      if (!res.ok) {
        setErro(dados.error_description ?? 'Não foi possível autorizar.')
        setEnviando(false)
        return
      }
      window.location.href = dados.redirectTo
    } catch {
      setErro('Falha de rede ao autorizar.')
      setEnviando(false)
    }
  }

  function recusar() {
    const url = new URL(redirectUri)
    url.searchParams.set('error', 'access_denied')
    if (state) url.searchParams.set('state', state)
    window.location.href = url.toString()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Button onClick={aprovar} disabled={enviando} className="flex-1">
          {enviando ? 'Autorizando…' : 'Autorizar'}
        </Button>
        <Button onClick={recusar} variant="outline" disabled={enviando} className="flex-1">
          Recusar
        </Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}
