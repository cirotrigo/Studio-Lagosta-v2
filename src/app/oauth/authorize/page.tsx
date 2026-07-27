import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findClient } from '@/lib/mcp/oauth'
import { ConsentForm } from './consent-form'

/**
 * Tela de consentimento do OAuth.
 *
 * É o único ponto do fluxo em que existe um humano: o registro de cliente é
 * aberto (como o protocolo exige), então é aqui que se decide se aquele
 * conector pode agir em nome deste usuário. Nada de token sai sem passar daqui.
 *
 * Fica fora das rotas públicas do middleware, então quem não estiver logado é
 * mandado para o sign-in e volta.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const texto = (chave: string) => {
    const valor = params[chave]
    return typeof valor === 'string' ? valor : undefined
  }

  const { userId } = await auth()
  if (!userId) {
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
    )
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/oauth/authorize?${query}`)}`)
  }

  const clientId = texto('client_id')
  const redirectUri = texto('redirect_uri')
  const state = texto('state')
  const codeChallenge = texto('code_challenge')
  const codeChallengeMethod = texto('code_challenge_method')
  const responseType = texto('response_type')

  const erro = await (async () => {
    if (!clientId || !redirectUri) return 'Faltam client_id ou redirect_uri na requisição.'
    if (responseType !== 'code') return 'Só o fluxo de authorization code é aceito (response_type=code).'
    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      return 'Este servidor exige PKCE com S256 (code_challenge e code_challenge_method).'
    }
    const client = await findClient(clientId)
    if (!client) return 'Cliente não registrado. Refaça a conexão pelo aplicativo.'
    if (!client.redirectUris.includes(redirectUri)) {
      return 'A redirect_uri não confere com a registrada por este cliente.'
    }
    return null
  })()

  if (erro) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
        <h1 className="text-xl font-semibold">Não foi possível autorizar</h1>
        <p className="text-sm text-muted-foreground">{erro}</p>
      </main>
    )
  }

  const client = await findClient(clientId!)

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Conectar ao Studio Lagosta</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{client!.name}</span> quer acesso aos seus projetos
          para criar artes, ler a base de conhecimento e consultar a agenda.
        </p>
      </div>

      <ul className="space-y-1 rounded-lg border p-4 text-sm text-muted-foreground">
        <li>• Ver seus projetos, combinações tipográficas e base de conhecimento</li>
        <li>• Criar artes na galeria de Criativos</li>
        <li>• Consultar os posts agendados</li>
      </ul>

      <ConsentForm
        clientId={clientId!}
        redirectUri={redirectUri!}
        state={state}
        codeChallenge={codeChallenge!}
      />

      <p className="text-xs text-muted-foreground">
        Você pode revogar o acesso a qualquer momento removendo o conector no aplicativo de origem.
      </p>
    </main>
  )
}
