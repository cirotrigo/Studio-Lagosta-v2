function slugifySegment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildKonvaExportFileName(
  documentId: string,
  pageId: string,
  pageName: string,
  suffix?: string,
) {
  const safePageName = slugifySegment(pageName) || 'pagina'
  const safeSuffix = suffix ? `-${slugifySegment(suffix) || 'item'}` : ''
  return `konva-${safePageName}${safeSuffix}-${documentId.slice(0, 8)}-${pageId.slice(0, 6)}.jpg`
}
