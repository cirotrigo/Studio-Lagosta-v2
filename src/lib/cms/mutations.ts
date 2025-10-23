import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type CMSPageStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type CMSSectionType = 'HERO' | 'BENTO_GRID' | 'FAQ' | 'AI_STARTER' | 'PRICING' | 'CTA' | 'CUSTOM'

// =============================================================================
// PAGE MUTATIONS
// =============================================================================

export type CreatePageInput = {
  title: string
  slug: string
  path: string
  description?: string
  status?: CMSPageStatus
  isHome?: boolean
  metaTitle?: string
  metaDesc?: string
  ogImage?: string
  createdBy: string
}

export type UpdatePageInput = {
  title?: string
  slug?: string
  path?: string
  description?: string
  status?: CMSPageStatus
  isHome?: boolean
  metaTitle?: string
  metaDesc?: string
  ogImage?: string
  updatedBy: string
}

/**
 * Create a new page
 */
export async function createPage(data: CreatePageInput) {
  const publishedAt = data.status === 'PUBLISHED' ? new Date() : null

  return await db.cMSPage.create({
    data: {
      ...data,
      publishedAt,
    },
    include: {
      sections: true,
    },
  })
}

/**
 * Update a page
 */
export async function updatePage(id: string, data: UpdatePageInput) {
  const publishedAt =
    data.status === 'PUBLISHED' ? new Date() : undefined

  return await db.cMSPage.update({
    where: { id },
    data: {
      ...data,
      publishedAt,
    },
    include: {
      sections: true,
    },
  })
}

/**
 * Delete a page
 */
export async function deletePage(id: string) {
  return await db.cMSPage.delete({
    where: { id },
  })
}

/**
 * Publish a page
 */
export async function publishPage(id: string, updatedBy: string) {
  return await db.cMSPage.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      updatedBy,
    },
  })
}

/**
 * Unpublish a page
 */
export async function unpublishPage(id: string, updatedBy: string) {
  return await db.cMSPage.update({
    where: { id },
    data: {
      status: 'DRAFT',
      updatedBy,
    },
  })
}

/**
 * Archive a page
 */
export async function archivePage(id: string, updatedBy: string) {
  return await db.cMSPage.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      updatedBy,
    },
  })
}

/**
 * Duplicate a page
 */
export async function duplicatePage(id: string, createdBy: string) {
  const originalPage = await db.cMSPage.findUnique({
    where: { id },
    include: { sections: true },
  })

  if (!originalPage) {
    throw new Error('Page not found')
  }

  const newSlug = `${originalPage.slug}-copy-${Date.now()}`
  const newPath = `${originalPage.path}-copy-${Date.now()}`

  const newPage = await db.cMSPage.create({
    data: {
      title: `${originalPage.title} (Copy)`,
      slug: newSlug,
      path: newPath,
      description: originalPage.description,
      status: 'DRAFT',
      isHome: false,
      metaTitle: originalPage.metaTitle,
      metaDesc: originalPage.metaDesc,
      ogImage: originalPage.ogImage,
      createdBy,
    },
  })

  // Duplicate sections
  for (const section of originalPage.sections) {
    await db.cMSSection.create({
      data: {
        pageId: newPage.id,
        type: section.type,
        name: section.name,
        content: section.content as Prisma.InputJsonValue,
        order: section.order,
        isVisible: section.isVisible,
        cssClasses: section.cssClasses,
      },
    })
  }

  return newPage
}

// =============================================================================
// SECTION MUTATIONS
// =============================================================================

export type CreateSectionInput = {
  pageId: string
  type: CMSSectionType
  name: string
  content: Record<string, unknown>
  order?: number
  isVisible?: boolean
  cssClasses?: string
}

export type UpdateSectionInput = {
  type?: CMSSectionType
  name?: string
  content?: Record<string, unknown>
  order?: number
  isVisible?: boolean
  cssClasses?: string
}

/**
 * Create a new section
 */
export async function createSection(data: CreateSectionInput) {
  return await db.cMSSection.create({
    data: {
      ...data,
      content: data.content as Prisma.InputJsonValue,
    },
    include: {
      page: true,
    },
  })
}

/**
 * Update a section
 */
export async function updateSection(id: string, data: UpdateSectionInput) {
  return await db.cMSSection.update({
    where: { id },
    data: {
      ...data,
      content: data.content ? (data.content as Prisma.InputJsonValue) : undefined,
    },
    include: {
      page: true,
    },
  })
}

/**
 * Delete a section
 */
export async function deleteSection(id: string) {
  return await db.cMSSection.delete({
    where: { id },
  })
}

/**
 * Reorder sections
 */
export async function reorderSections(
  sections: Array<{ id: string; order: number }>
) {
  const updates = sections.map((section) =>
    db.cMSSection.update({
      where: { id: section.id },
      data: { order: section.order },
    })
  )

  return await db.$transaction(updates)
}

/**
 * Toggle section visibility
 */
export async function toggleSectionVisibility(id: string) {
  const section = await db.cMSSection.findUnique({ where: { id } })
  if (!section) throw new Error('Section not found')

  return await db.cMSSection.update({
    where: { id },
    data: { isVisible: !section.isVisible },
  })
}

/**
 * Duplicate a section
 */
export async function duplicateSection(id: string) {
  const original = await db.cMSSection.findUnique({ where: { id } })
  if (!original) throw new Error('Section not found')

  const maxOrder = await db.cMSSection.findFirst({
    where: { pageId: original.pageId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  return await db.cMSSection.create({
    data: {
      pageId: original.pageId,
      type: original.type,
      name: `${original.name} (Copy)`,
      content: original.content as Prisma.InputJsonValue,
      order: (maxOrder?.order ?? 0) + 1,
      isVisible: original.isVisible,
      cssClasses: original.cssClasses,
    },
  })
}

// =============================================================================
// MENU MUTATIONS
// =============================================================================

export type CreateMenuInput = {
  name: string
  slug: string
  location: string
  isActive?: boolean
}

export type UpdateMenuInput = {
  name?: string
  slug?: string
  location?: string
  isActive?: boolean
}

export type CreateMenuItemInput = {
  menuId: string
  label: string
  url: string
  target?: string
  icon?: string
  order?: number
  parentId?: string
  isVisible?: boolean
}

export type UpdateMenuItemInput = {
  label?: string
  url?: string
  target?: string
  icon?: string
  order?: number
  parentId?: string
  isVisible?: boolean
}

/**
 * Create a new menu
 */
export async function createMenu(data: CreateMenuInput) {
  return await db.cMSMenu.create({
    data,
    include: {
      items: true,
    },
  })
}

/**
 * Update a menu
 */
export async function updateMenu(id: string, data: UpdateMenuInput) {
  return await db.cMSMenu.update({
    where: { id },
    data,
    include: {
      items: true,
    },
  })
}

/**
 * Delete a menu
 */
export async function deleteMenu(id: string) {
  return await db.cMSMenu.delete({
    where: { id },
  })
}

/**
 * Create a menu item
 */
export async function createMenuItem(data: CreateMenuItemInput) {
  return await db.cMSMenuItem.create({
    data,
    include: {
      children: true,
    },
  })
}

/**
 * Update a menu item
 */
export async function updateMenuItem(id: string, data: UpdateMenuItemInput) {
  return await db.cMSMenuItem.update({
    where: { id },
    data,
    include: {
      children: true,
    },
  })
}

/**
 * Delete a menu item
 */
export async function deleteMenuItem(id: string) {
  return await db.cMSMenuItem.delete({
    where: { id },
  })
}

/**
 * Reorder menu items
 */
export async function reorderMenuItems(
  items: Array<{ id: string; order: number; parentId?: string | null }>
) {
  const updates = items.map((item) =>
    db.cMSMenuItem.update({
      where: { id: item.id },
      data: { order: item.order, parentId: item.parentId },
    })
  )

  return await db.$transaction(updates)
}

// =============================================================================
// COMPONENT MUTATIONS
// =============================================================================

export type CreateComponentInput = {
  name: string
  slug: string
  description?: string
  type: string
  content: Record<string, unknown>
  thumbnail?: string
  isGlobal?: boolean
  createdBy: string
}

export type UpdateComponentInput = {
  name?: string
  slug?: string
  description?: string
  type?: string
  content?: Record<string, unknown>
  thumbnail?: string
  isGlobal?: boolean
}

/**
 * Create a component
 */
export async function createComponent(data: CreateComponentInput) {
  return await db.cMSComponent.create({
    data: {
      ...data,
      content: data.content as Prisma.InputJsonValue,
    },
  })
}

/**
 * Update a component
 */
export async function updateComponent(id: string, data: UpdateComponentInput) {
  return await db.cMSComponent.update({
    where: { id },
    data: {
      ...data,
      content: data.content ? (data.content as Prisma.InputJsonValue) : undefined,
    },
  })
}

/**
 * Delete a component
 */
export async function deleteComponent(id: string) {
  return await db.cMSComponent.delete({
    where: { id },
  })
}

// =============================================================================
// MEDIA MUTATIONS
// =============================================================================

export type CreateMediaInput = {
  name: string
  filename: string
  url: string
  thumbnailUrl?: string
  mimeType: string
  size: number
  width?: number
  height?: number
  alt?: string
  caption?: string
  folder?: string
  uploadedBy: string
}

export type UpdateMediaInput = {
  name?: string
  alt?: string
  caption?: string
  folder?: string
}

/**
 * Create a media file
 */
export async function createMedia(data: CreateMediaInput) {
  return await db.cMSMedia.create({
    data,
  })
}

/**
 * Update a media file
 */
export async function updateMedia(id: string, data: UpdateMediaInput) {
  return await db.cMSMedia.update({
    where: { id },
    data,
  })
}

/**
 * Delete a media file
 */
export async function deleteMedia(id: string) {
  return await db.cMSMedia.delete({
    where: { id },
  })
}

/**
 * Bulk delete media files
 */
export async function bulkDeleteMedia(ids: string[]) {
  return await db.cMSMedia.deleteMany({
    where: {
      id: { in: ids },
    },
  })
}
