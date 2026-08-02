import { db } from '@/lib/db'
import { EnvioFotoClient } from './envio-client'

export const dynamic = 'force-dynamic'

/**
 * Página pública de envio de foto — o link que a tool pedir-foto entrega no
 * chat. Mobile-first: um toque abre a galeria/câmera, prévia, enviar.
 * A autenticação é o token da URL (cuid, 30min, um projeto).
 */
export default async function EnvioFotoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const upload = await db.chatUpload.findUnique({
    where: { id: token },
    include: { Project: { select: { name: true } } },
  })

  const expirado = upload ? upload.expiresAt.getTime() < Date.now() : false

  if (!upload || expirado) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-4xl">⏱️</p>
          <h1 className="text-xl font-semibold">
            {upload ? 'Este link venceu' : 'Link inválido'}
          </h1>
          <p className="text-neutral-400">
            Volte ao chat e peça um novo link de envio — leva um segundo.
          </p>
        </div>
      </main>
    )
  }

  return (
    <EnvioFotoClient
      token={token}
      projectName={upload.Project.name}
      jaRecebida={upload.status === 'RECEIVED'}
    />
  )
}
