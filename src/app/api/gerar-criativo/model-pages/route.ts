import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

export async function GET() {
  try {
    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch model pages from owned projects and shared projects in parallel
    const [ownedProjectPages, sharedProjectPages] = await Promise.all([
      // Model pages from owned projects
      db.page.findMany({
        where: {
          isTemplate: true,
          Template: {
            Project: {
              userId: user.id,
            },
          },
        },
        orderBy: [{ order: 'asc' }],
        select: {
          id: true,
          name: true,
          templateName: true,
          templateId: true,
          width: true,
          height: true,
          layers: true,
          background: true,
          thumbnail: true,
          order: true,
          createdAt: true,
          updatedAt: true,
          Template: {
            select: {
              id: true,
              name: true,
              Project: {
                select: {
                  id: true,
                  name: true,
                  Logo: {
                    where: { isProjectLogo: true },
                    take: 1,
                    select: {
                      fileUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),

      // Model pages from shared projects (only if orgId exists)
      orgId
        ? db.page.findMany({
            where: {
              isTemplate: true,
              Template: {
                Project: {
                  organizationProjects: {
                    some: {
                      organization: {
                        clerkOrgId: orgId,
                      },
                    },
                  },
                },
              },
            },
            orderBy: [{ order: 'asc' }],
            select: {
              id: true,
              name: true,
              templateName: true,
              templateId: true,
              width: true,
              height: true,
              layers: true,
              background: true,
              thumbnail: true,
              order: true,
              createdAt: true,
              updatedAt: true,
              Template: {
                select: {
                  id: true,
                  name: true,
                  Project: {
                    select: {
                      id: true,
                      name: true,
                      Logo: {
                        where: { isProjectLogo: true },
                        take: 1,
                        select: {
                          fileUrl: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          })
        : [],
    ])

    // Combine and deduplicate by page id
    const seenIds = new Set<string>()
    const allPages = [...ownedProjectPages, ...sharedProjectPages].filter((page) => {
      if (seenIds.has(page.id)) return false
      seenIds.add(page.id)
      return true
    })

    // Transform the data with parsed layers and flattened structure
    const transformedPages = allPages.map((page) => ({
      id: page.id,
      name: page.name,
      templateName: page.templateName,
      templateId: page.templateId,
      width: page.width,
      height: page.height,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
      background: page.background,
      thumbnail: page.thumbnail,
      order: page.order,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      template: {
        id: page.Template.id,
        name: page.Template.name,
      },
      project: {
        id: page.Template.Project.id,
        name: page.Template.Project.name,
        logoUrl: page.Template.Project.Logo[0]?.fileUrl || null,
      },
    }))

    // Sort by project name, then template name, then order
    transformedPages.sort((a, b) => {
      const projectCompare = a.project.name.localeCompare(b.project.name)
      if (projectCompare !== 0) return projectCompare
      const templateCompare = a.template.name.localeCompare(b.template.name)
      if (templateCompare !== 0) return templateCompare
      return a.order - b.order
    })

    return NextResponse.json(transformedPages)
  } catch (error) {
    console.error('Error fetching model pages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch model pages' },
      { status: 500 }
    )
  }
}
