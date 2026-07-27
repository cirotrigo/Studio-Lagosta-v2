/**
 * Cadastra o token do Instagram Login de um projeto.
 *
 * O token gerado no painel da Meta (Instagram → Configuração da API com login
 * empresarial → "Gere tokens de acesso") vale só para aquela conta e expira em
 * 60 dias. Este script valida contra a API, converte para longa duração quando
 * necessário e grava no projeto — sem imprimir o token na tela.
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/set-project-instagram-token.ts <projectId> <TOKEN>
 *
 * Depois disso o projeto passa a usar o token próprio na verificação de
 * stories e na coleta de métricas; os demais continuam no token global.
 */
import { PrismaClient } from '@prisma/client'
import { InstagramGraphApiClient } from '../src/lib/instagram/graph-api-client'

const db = new PrismaClient()

async function main() {
  const projectId = Number(process.argv[2])
  const token = process.argv[3]

  if (!projectId || !token) {
    console.error(
      'Uso: npx dotenv-cli -e .env -- npx tsx scripts/set-project-instagram-token.ts <projectId> <TOKEN>'
    )
    process.exit(1)
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, instagramUsername: true },
  })
  if (!project) {
    console.error(`❌ Projeto ${projectId} não encontrado`)
    process.exit(1)
  }

  console.log(`Projeto: ${project.name} (@${project.instagramUsername ?? '?'})`)

  const client = new InstagramGraphApiClient(token)
  if (!client.isInstagramLoginToken) {
    console.error(
      '❌ Esse token não é do Instagram Login (deveria começar com IGAA).\n' +
        '   Tokens do Facebook são globais e ficam em INSTAGRAM_ACCESS_TOKEN.'
    )
    process.exit(1)
  }

  // 1. Confere de qual conta é o token
  console.log('\n📝 Validando token...')
  const conta = await client.getOwnAccount()
  console.log(`✅ Token pertence a @${conta.username} (${conta.media_count ?? '?'} publicações)`)

  if (project.instagramUsername && conta.username.toLowerCase() !== project.instagramUsername.toLowerCase()) {
    console.error(
      `\n❌ Conta do token (@${conta.username}) não bate com a do projeto (@${project.instagramUsername}).\n` +
        '   Nada foi gravado — confira se gerou o token da conta certa.'
    )
    process.exit(1)
  }

  // 2. Estende a validade para 60 dias a partir de agora
  let tokenFinal = token
  let expiraEm = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
  try {
    const renovado = await client.refreshToken()
    if (renovado?.access_token) {
      tokenFinal = renovado.access_token
      expiraEm = new Date(Date.now() + (renovado.expires_in ?? 60 * 24 * 3600) * 1000)
      console.log(`✅ Token estendido até ${expiraEm.toISOString().slice(0, 10)}`)
    }
  } catch (error) {
    // Token recém-criado (< 24h) não pode ser renovado ainda — segue com ele
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`ℹ️  Não foi possível estender agora (${msg.slice(0, 70)}) — o cron renova depois`)
  }

  // 3. Grava
  await db.project.update({
    where: { id: projectId },
    data: {
      instagramAccessToken: tokenFinal,
      instagramTokenExpiresAt: expiraEm,
      instagramAppScopedId: conta.id,
    },
  })

  console.log(`\n✅ Token gravado no projeto ${project.name}`)
  console.log(`   id com escopo de app: ${conta.id}`)
  console.log(`   expira em: ${expiraEm.toISOString().slice(0, 10)}`)
  console.log('\n💡 Rode o cron de insights para confirmar a coleta:')
  console.log('   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/fetch-story-insights')

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error('ERRO:', error instanceof Error ? error.message : error)
  await db.$disconnect()
  process.exit(1)
})
