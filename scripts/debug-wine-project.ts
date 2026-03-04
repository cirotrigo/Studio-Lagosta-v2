import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

// Load environment variables
config({ path: '.env.local' })

const prisma = new PrismaClient()

async function main() {
  const project = await prisma.project.findFirst({
    where: {
      name: {
        contains: 'wine',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      brandStyleDescription: true,
      brandVisualElements: true,
      brandReferenceUrls: true,
      titleFontFamily: true,
      bodyFontFamily: true,
      cuisineType: true,
      BrandColor: {
        select: {
          hexCode: true,
          name: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      CustomFont: {
        select: {
          fontFamily: true,
          fileUrl: true,
        },
      },
    },
  })

  console.log('\n=== WINE VIX PROJECT DATA ===\n')
  console.log('ID:', project?.id)
  console.log('Name:', project?.name)
  console.log('\n--- BRAND COLORS ---')
  console.log(JSON.stringify(project?.BrandColor, null, 2))
  console.log('\n--- VISUAL ELEMENTS ---')
  console.log(JSON.stringify(project?.brandVisualElements, null, 2))
  console.log('\n--- STYLE DESCRIPTION ---')
  console.log(project?.brandStyleDescription)
  console.log('\n--- FONTS ---')
  console.log('Title:', project?.titleFontFamily)
  console.log('Body:', project?.bodyFontFamily)
  console.log('Custom Fonts:', JSON.stringify(project?.CustomFont, null, 2))
  console.log('\n--- REFERENCE URLs ---')
  console.log(JSON.stringify(project?.brandReferenceUrls, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
