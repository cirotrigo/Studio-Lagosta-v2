import { db } from './src/lib/db'

async function checkPost() {
  const postId = 'cmhe95ga40001la044cr5jr4y'

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    include: {
      Project: {
        select: {
          id: true,
          name: true,
          instagramUsername: true,
          zapierWebhookUrl: true,
        }
      }
    }
  })

  if (!post) {
    console.log('Post não encontrado')
    return
  }

  console.log('\n📊 Detalhes do Post:\n')
  console.log('ID:', post.id)
  console.log('Status:', post.status)
  console.log('Tipo:', post.postType)
  console.log('Criado em:', post.createdAt)
  console.log('Enviado em:', post.sentAt)
  console.log('Atualizado em:', post.updatedAt)
  console.log('\n📦 Projeto:')
  console.log('Nome:', post.Project.name)
  console.log('Instagram:', post.Project.instagramUsername)
  console.log('Webhook:', post.Project.zapierWebhookUrl ? 'Configurado' : 'Usando global')
  console.log('\n📍 Webhook usado:', post.zapierWebhookUrl || 'N/A')
  console.log('\n💬 Resposta do webhook:', post.webhookResponse ? JSON.stringify(post.webhookResponse, null, 2) : 'N/A')
  console.log('\n❌ Erro:', post.errorMessage || 'Nenhum')

  const minutesSinceSent = Math.round((Date.now() - new Date(post.sentAt || post.createdAt).getTime()) / 1000 / 60)
  console.log('\n⏱️ Tempo desde envio:', minutesSinceSent, 'minutos')

  if (post.status === 'PROCESSING') {
    console.log('\n⚠️ Post ainda está em PROCESSING')
    console.log('   Possíveis motivos:')
    console.log('   1. Buffer ainda não confirmou publicação')
    console.log('   2. Zapier não disparou o webhook de confirmação')
    console.log('   3. Webhook foi chamado mas falhou')
    console.log('   4. Post está na fila do Buffer')
  }

  await db.$disconnect()
}

checkPost()
