/**
 * Script de migração: Criar primeira página para templates existentes
 *
 * Este script cria uma página inicial para todos os templates que ainda não têm páginas.
 * Cada template deve ter pelo menos 1 página no novo sistema multi-página.
 *
 * Como executar:
 * npx tsx scripts/migrate-templates-to-pages.ts
 */

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function main() {
  console.log('🚀 Iniciando migração de templates para sistema de páginas...\n')

  try {
    // 1. Buscar todos os templates
    const templates = await db.template.findMany({
      select: {
        id: true,
        name: true,
        designData: true,
        Page: {
          select: {
            id: true,
          },
        },
      },
    })

    console.log(`📦 Total de templates encontrados: ${templates.length}\n`)

    let createdCount = 0
    let skippedCount = 0

    // 2. Para cada template, verificar se já tem página
    for (const template of templates) {
      if (template.Page && template.Page.length > 0) {
        console.log(`⏭️  Template "${template.name}" (ID: ${template.id}) já tem ${template.Page.length} página(s). Pulando...`)
        skippedCount++
        continue
      }

      // 3. Extrair dados do designData
      const designData = template.designData as any
      const canvas = designData?.canvas || { width: 1080, height: 1920 }
      const layers = designData?.layers || []
      const backgroundColor = canvas.backgroundColor || '#ffffff'

      console.log(`✨ Criando página para template "${template.name}" (ID: ${template.id})...`)

      // 4. Criar primeira página
      await db.page.create({
        data: {
          name: 'Página 1',
          width: canvas.width || 1080,
          height: canvas.height || 1920,
          layers: layers,
          background: backgroundColor,
          order: 0,
          templateId: template.id,
        },
      })

      createdCount++
      console.log(`✅ Página criada para template "${template.name}"\n`)
    }

    console.log('\n📊 Resumo da migração:')
    console.log(`   ✅ Páginas criadas: ${createdCount}`)
    console.log(`   ⏭️  Templates pulados (já tinham páginas): ${skippedCount}`)
    console.log(`   📦 Total de templates processados: ${templates.length}`)
    console.log('\n✅ Migração concluída com sucesso!')

  } catch (error) {
    console.error('❌ Erro durante a migração:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

main()
