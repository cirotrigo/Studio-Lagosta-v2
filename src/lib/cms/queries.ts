import { db } from '@/lib/db'

// =============================================================================
// PAGE QUERIES
// =============================================================================

/**
 * Get all pages with their sections
 */
export async function getAllPages() {
  return await db.cMSPage.findMany({
    include: {
      sections: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get a page by ID with sections
 */
export async function getPageById(id: string) {
  return await db.cMSPage.findUnique({
    where: { id },
    include: {
      sections: {
        where: { isVisible: true },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get a page by slug with sections
 */
export async function getPageBySlug(slug: string) {
  return await db.cMSPage.findUnique({
    where: { slug },
    include: {
      sections: {
        where: { isVisible: true },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get a page by path with sections
 */
export async function getPageByPath(path: string) {
  return await db.cMSPage.findUnique({
    where: { path },
    include: {
      sections: {
        where: { isVisible: true },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get the home page with sections
 */
export async function getHomePage() {
  return await db.cMSPage.findFirst({
    where: { isHome: true, status: 'PUBLISHED' },
    include: {
      sections: {
        where: { isVisible: true },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get published pages only
 */
export async function getPublishedPages() {
  return await db.cMSPage.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      sections: {
        where: { isVisible: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { publishedAt: 'desc' },
  })
}

/**
 * Get pages by status
 */
export async function getPagesByStatus(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  return await db.cMSPage.findMany({
    where: { status },
    include: {
      sections: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

// =============================================================================
// SECTION QUERIES
// =============================================================================

/**
 * Get all sections for a page
 */
export async function getPageSections(pageId: string) {
  return await db.cMSSection.findMany({
    where: { pageId },
    orderBy: { order: 'asc' },
  })
}

/**
 * Get a section by ID
 */
export async function getSectionById(id: string) {
  return await db.cMSSection.findUnique({
    where: { id },
    include: { page: true },
  })
}

/**
 * Get sections by type
 */
export async function getSectionsByType(type: 'HERO' | 'BENTO_GRID' | 'FAQ' | 'AI_STARTER' | 'PRICING' | 'CTA' | 'CUSTOM') {
  return await db.cMSSection.findMany({
    where: { type },
    include: { page: true },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get visible sections for a page
 */
export async function getVisiblePageSections(pageId: string) {
  return await db.cMSSection.findMany({
    where: {
      pageId,
      isVisible: true,
    },
    orderBy: { order: 'asc' },
  })
}

// =============================================================================
// MENU QUERIES
// =============================================================================

/**
 * Get all menus with items
 */
export async function getAllMenus() {
  return await db.cMSMenu.findMany({
    include: {
      items: {
        where: { parentId: null },
        include: {
          children: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })
}

/**
 * Get a menu by ID with items
 */
export async function getMenuById(id: string) {
  return await db.cMSMenu.findUnique({
    where: { id },
    include: {
      items: {
        where: { parentId: null },
        include: {
          children: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get a menu by slug with items
 */
export async function getMenuBySlug(slug: string) {
  return await db.cMSMenu.findUnique({
    where: { slug },
    include: {
      items: {
        where: { parentId: null, isVisible: true },
        include: {
          children: {
            where: { isVisible: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get a menu by location
 */
export async function getMenuByLocation(location: string) {
  console.log('[getMenuByLocation] Searching for location:', location)

  const menu = await db.cMSMenu.findFirst({
    where: { location, isActive: true },
    include: {
      items: {
        where: { parentId: null, isVisible: true },
        include: {
          children: {
            where: { isVisible: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  console.log('[getMenuByLocation] Result:', menu ? `Found menu "${menu.name}" with ${menu.items?.length || 0} items` : 'Not found')

  return menu
}

/**
 * Get menu items for a menu
 */
export async function getMenuItems(menuId: string) {
  return await db.cMSMenuItem.findMany({
    where: { menuId },
    include: {
      children: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  })
}

// =============================================================================
// COMPONENT QUERIES
// =============================================================================

/**
 * Get all components
 */
export async function getAllComponents() {
  return await db.cMSComponent.findMany({
    orderBy: { name: 'asc' },
  })
}

/**
 * Get a component by slug
 */
export async function getComponentBySlug(slug: string) {
  return await db.cMSComponent.findUnique({
    where: { slug },
  })
}

/**
 * Get global components
 */
export async function getGlobalComponents() {
  return await db.cMSComponent.findMany({
    where: { isGlobal: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * Get components by type
 */
export async function getComponentsByType(type: string) {
  return await db.cMSComponent.findMany({
    where: { type },
    orderBy: { name: 'asc' },
  })
}

// =============================================================================
// MEDIA QUERIES
// =============================================================================

/**
 * Get all media files
 */
export async function getAllMedia() {
  return await db.cMSMedia.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get a single media file by ID
 */
export async function getMediaById(id: string) {
  return await db.cMSMedia.findUnique({
    where: { id },
  })
}

/**
 * Get media by folder
 */
export async function getMediaByFolder(folder: string) {
  return await db.cMSMedia.findMany({
    where: { folder },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get media by mime type
 */
export async function getMediaByMimeType(mimeType: string) {
  return await db.cMSMedia.findMany({
    where: { mimeType: { startsWith: mimeType } },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get media uploaded by user
 */
export async function getMediaByUser(userId: string) {
  return await db.cMSMedia.findMany({
    where: { uploadedBy: userId },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Search media by name
 */
export async function searchMedia(query: string) {
  return await db.cMSMedia.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { filename: { contains: query, mode: 'insensitive' } },
        { alt: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
}
