// Script de teste para verificar dedução de créditos
const { PrismaClient } = require('./prisma/generated/client')

const prisma = new PrismaClient()

async function testCreditDeduction() {
  try {
    console.log('=== Teste de Dedução de Créditos ===\n')

    // Verificar se o novo OperationType existe
    console.log('1. Verificando enum OperationType...')
    const enums = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OperationType')
    `
    console.log('Valores disponíveis:', enums.map(e => e.enumlabel))

    // Verificar se creative_download está nas configurações
    console.log('\n2. Verificando configurações do AdminSettings...')
    const settings = await prisma.adminSettings.findUnique({
      where: { id: 'singleton' }
    })
    console.log('Feature costs:', settings?.featureCosts)

    // Verificar se há usuários com saldo
    console.log('\n3. Verificando saldos de créditos...')
    const balances = await prisma.creditBalance.findMany({
      take: 3,
      include: {
        User: {
          select: {
            clerkId: true,
            email: true
          }
        }
      }
    })
    console.log('Usuários com saldo:')
    balances.forEach(b => {
      console.log(`  - ${b.User.email}: ${b.creditsRemaining} créditos`)
    })

    // Verificar histórico de uso recente
    console.log('\n4. Verificando histórico de uso recente...')
    const recentUsage = await prisma.usageHistory.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      include: {
        User: {
          select: {
            email: true
          }
        }
      }
    })
    console.log('Últimos usos:')
    recentUsage.forEach(u => {
      console.log(`  - ${u.User.email}: ${u.operationType} (${u.creditsUsed} créditos) - ${u.timestamp}`)
    })

  } catch (error) {
    console.error('Erro no teste:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testCreditDeduction()
