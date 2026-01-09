// Verificar se o campo existe no banco de produção
const { PrismaClient } = require('./prisma/generated/client')

async function verify() {
  const prisma = new PrismaClient()

  try {
    console.log('🔍 Verificando campo processingStartedAt...')

    // Tenta buscar posts com o campo
    const post = await prisma.socialPost.findFirst({
      select: {
        id: true,
        processingStartedAt: true,
        status: true,
        createdAt: true,
      }
    })

    console.log('✅ Campo existe e está acessível!')
    console.log('Post exemplo:', post)

    // Conta quantos posts têm o campo preenchido
    const count = await prisma.socialPost.count({
      where: {
        processingStartedAt: { not: null }
      }
    })

    console.log(`📊 Posts com processingStartedAt preenchido: ${count}`)

  } catch (error) {
    console.error('❌ Erro ao acessar o campo:', error.message)
    console.error('\nCódigo do erro:', error.code)

    if (error.code === 'P2022') {
      console.error('\n⚠️ O campo NÃO EXISTE no banco!')
      console.error('Execute o SQL no Neon Dashboard:')
      console.error('ALTER TABLE "SocialPost" ADD COLUMN "processingStartedAt" TIMESTAMP(3);')
    }
  } finally {
    await prisma.$disconnect()
  }
}

verify()