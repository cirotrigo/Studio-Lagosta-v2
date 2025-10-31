import { db } from './src/lib/db'

async function checkPost() {
  const postId = 'cmhe6fs6g0009l104ao4k3gic'

  console.log(`\n🔍 Verificando post: ${postId}\n`)

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      status: true,
      bufferId: true,
      bufferSentAt: true,
      publishedUrl: true,
      instagramMediaId: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
    }
  })

  if (!post) {
    console.log('❌ Post não encontrado no banco de dados')
    console.log('💡 Isso é esperado se você usou um ID de teste.')
    console.log('💡 Para testar com post real, crie um post no sistema e use o ID dele.\n')
    return
  }

  console.log('📊 Dados do post:\n')
  console.log(JSON.stringify(post, null, 2))
  console.log('\n')

  // Verificar se webhook atualizou o post
  if (post.status === 'SENT') {
    console.log('✅ Status: SENT (webhook funcionou!)')
  } else {
    console.log(`⚠️ Status: ${post.status}`)
  }

  if (post.bufferId) {
    console.log(`✅ Buffer ID: ${post.bufferId}`)
  } else {
    console.log('⚠️ Buffer ID: não definido')
  }

  if (post.bufferSentAt) {
    console.log(`✅ Buffer Sent At: ${post.bufferSentAt}`)
  } else {
    console.log('⚠️ Buffer Sent At: não definido')
  }

  if (post.publishedUrl) {
    console.log(`✅ Instagram URL: ${post.publishedUrl}`)
  } else {
    console.log('⚠️ Instagram URL: não disponível (normal se não houver service_update_id)')
  }

  if (post.instagramMediaId) {
    console.log(`✅ Instagram Media ID: ${post.instagramMediaId}`)
  } else {
    console.log('⚠️ Instagram Media ID: não disponível')
  }

  console.log('\n')
  await db.$disconnect()
}

checkPost().catch((error) => {
  console.error('❌ Erro:', error)
  process.exit(1)
})
