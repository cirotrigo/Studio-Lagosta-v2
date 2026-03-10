import { INSTAGRAM_DS_CSS } from '@/lib/instagram-ds/design-system-css'
import { mapFieldsToDsContent, resolveDsTemplateId } from '@/lib/instagram-ds/slot-mapper'
import { getDsTemplateSpec } from '@/lib/instagram-ds/template-registry'
import type { InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'
import type { ReviewField, ArtFormat } from '@/stores/generation.store'

const GENERIC_FONT_FAMILIES = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'cursive',
  'fantasy',
  'math',
  'emoji',
  'fangsong',
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function toMultilineHtml(value: string | undefined): string {
  const normalized = (value || '')
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')

  return escapeHtml(normalized).replace(/\n/g, '<br>')
}

function serializeFontFamilyVar(value: string | undefined, fallback: string): string {
  const normalized = (value || fallback || '').trim()
  if (!normalized) return `"${fallback}"`

  const serialized = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const unquoted = item.replace(/^['"]+|['"]+$/g, '').trim()
      if (!unquoted) return ''
      const lowered = unquoted.toLowerCase()
      if (GENERIC_FONT_FAMILIES.has(lowered)) return lowered
      if (/\s/.test(unquoted)) return `"${unquoted}"`
      return unquoted
    })
    .filter(Boolean)
    .join(', ')

  return serialized || `"${fallback}"`
}

function renderText(value: string, className: string): string {
  if (!value) return ''
  return `<div class="${className}">${escapeHtml(value)}</div>`
}

function renderTextMultiline(value: string, className: string): string {
  if (!value) return ''
  return `<div class="${className}">${toMultilineHtml(value)}</div>`
}

function renderBadge(value: string, fallback: string): string {
  const content = normalizeText(value) || fallback
  if (!content) return ''
  return `<div class="ig-typography-tag">${escapeHtml(content)}</div>`
}

function renderLogo(logoUrl: string | undefined, className: string, style?: string): string {
  if (!logoUrl) return ''
  const styleAttr = style ? ` style="${style}"` : ''
  return `<img class="${className}"${styleAttr} src="${escapeHtml(logoUrl)}" alt="Logo da marca" />`
}

function renderOverlays(overlay: 'top' | 'bottom' | 'left' | 'right' | 'double'): string {
  if (overlay === 'bottom') return '<div class="ig-overlay-bottom"></div>'
  if (overlay === 'left') return '<div class="ig-overlay-left"></div>'
  if (overlay === 'right') return '<div class="ig-overlay-right"></div>'
  if (overlay === 'top') return '<div class="ig-overlay-top"></div>'
  return '<div class="ig-overlay-top" style="height:35%"></div><div class="ig-overlay-bottom" style="height:40%"></div>'
}

function renderTemplateFrame(params: {
  templateId: string
  preTitle: string
  title: string
  description: string
  cta: string
  badge: string
  footerInfo1: string
  footerInfo2: string
  listItems: string[]
  includeLogo: boolean
  logoUrl?: string
}): string {
  const {
    templateId,
    preTitle,
    title,
    description,
    cta,
    badge,
    footerInfo1,
    footerInfo2,
    listItems,
    includeLogo,
    logoUrl,
  } = params

  const fallbackList = listItems.length > 0
    ? listItems
    : normalizeText(description)
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4)

  const listHtml = fallbackList.length > 0
    ? `<ul style="margin:0.8rem 0 1rem 1rem;color:#f97316;font-size:0.68rem;line-height:1.4">${fallbackList
      .slice(0, 4)
      .map((item) => `<li style="margin-bottom:0.25rem"><span style="color:#fff">${escapeHtml(item)}</span></li>`)
      .join('')}</ul>`
    : ''

  const maybeTopLogoS1 = (templateId === 'S1' || templateId === 'S3' || templateId === 'S4') && includeLogo
    ? renderLogo(logoUrl, 'ig-logo', 'margin:0 auto')
    : ''
  const maybeTopLogoS2 = templateId === 'S2' && includeLogo
    ? renderLogo(logoUrl, 'ig-logo', 'margin-left:auto')
    : ''
  const maybeTopLogoS5 = templateId === 'S5' && includeLogo
    ? renderLogo(logoUrl, 'ig-logo', 'margin-left:auto')
    : ''
  const maybeFeedLogoF1 = templateId === 'F1' && includeLogo
    ? renderLogo(logoUrl, 'ig-logo-feed')
    : ''

  const s6Header = templateId === 'S6'
    ? `<div style="display:flex;align-items:center;justify-content:space-between">
      ${renderBadge(badge, 'QUALIDADE')}
      ${includeLogo ? (renderLogo(logoUrl, 'ig-logo') || '<span></span>') : '<span></span>'}
    </div>`
    : ''

  let body = ''
  if (templateId === 'S1') {
    body = `<div style="margin-top:auto;text-align:center;margin-bottom:2rem">
      ${renderText(preTitle, 'ig-typography-pre')}
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderText(cta || 'GARANTIR MESA', 'ig-typography-cta')}
    </div>`
  } else if (templateId === 'S2') {
    body = `<div style="margin-top:auto;margin-bottom:2.4rem;width:86%">
      ${renderText(preTitle, 'ig-typography-pre')}
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderTextMultiline(description, 'ig-typography-desc')}
    </div>`
  } else if (templateId === 'S3') {
    body = `<div style="margin-top:auto">
      ${renderTextMultiline(title || 'O QUE TEM HOJE', 'ig-typography-title')}
      ${listHtml}
      ${renderTextMultiline(footerInfo1, 'ig-typography-footer')}
      ${renderTextMultiline(footerInfo2, 'ig-typography-footer')}
    </div>`
  } else if (templateId === 'S4') {
    body = `<div style="margin-top:auto;text-align:center;margin-bottom:2rem">
      ${renderBadge(badge, 'BASTIDORES')}
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderTextMultiline(description, 'ig-typography-desc')}
      ${renderText(cta || 'VER PORTFOLIO', 'ig-typography-cta')}
    </div>`
  } else if (templateId === 'S5') {
    body = `<div style="margin-top:auto;margin-bottom:2rem">
      ${renderBadge(badge, 'EM GRAVACAO')}
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderTextMultiline(footerInfo1, 'ig-typography-footer')}
      ${renderTextMultiline(footerInfo2, 'ig-typography-footer')}
    </div>`
  } else if (templateId === 'S6') {
    body = `<div style="margin-top:auto;text-align:center;margin-bottom:2rem">
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderText(cta || 'AGENDE SUA SESSAO', 'ig-typography-cta')}
    </div>`
  } else if (templateId === 'F1') {
    body = `<div style="margin-top:auto">
      ${renderText(preTitle || 'APENAS HOJE', 'ig-typography-pre')}
      ${renderTextMultiline((badge || title), 'ig-typography-title')}
    </div>`
  } else if (templateId === 'F2') {
    body = `<div style="margin-top:auto;margin-bottom:2.2rem;width:82%">
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderTextMultiline(description, 'ig-typography-desc')}
    </div>
    ${includeLogo ? renderLogo(logoUrl, 'ig-logo-feed', 'margin-top:auto;margin-left:auto') : ''}`
  } else {
    body = `<div style="margin-top:auto;margin-bottom:0.5rem;margin-left:0.5rem">
      ${renderBadge(badge, '#GASTRONOMIA')}
    </div>`
  }

  return `
    ${maybeTopLogoS1}
    ${maybeTopLogoS2}
    ${maybeTopLogoS5}
    ${maybeFeedLogoF1}
    ${s6Header}
    <div class="ig-template-frame">${body}</div>
  `
}

export interface InstagramHtmlSnapshotParams {
  format: ArtFormat
  fields: ReviewField[]
  sourceImageUrl?: string
  logoUrl?: string
  includeLogo?: boolean
  templateName?: string
  tokens?: Partial<InstagramPreviewTokens>
  customCss?: string
  showTemplateBadge?: boolean
}

export interface InstagramHtmlSnapshotResult {
  html: string
  templateId: string
}

export function buildInstagramHtmlSnapshot(params: InstagramHtmlSnapshotParams): InstagramHtmlSnapshotResult {
  const mapped = mapFieldsToDsContent(params.fields)
  const templateId = resolveDsTemplateId({
    format: params.format,
    mapped,
    templateName: params.templateName,
  })
  const templateSpec = getDsTemplateSpec(templateId)
  const includeLogo = params.includeLogo !== false
  const isStory = params.format === 'STORY'

  const customCss = (params.customCss || '').trim()
  const sanitizedCss = customCss.replace(/<\/style/gi, '<\\/style')
  const extraCss = sanitizedCss ? `\n/* Imported DS overrides */\n${sanitizedCss}` : ''
  const headingFont = serializeFontFamilyVar(params.tokens?.fontHeading, 'Montserrat')
  const bodyFont = serializeFontFamilyVar(params.tokens?.fontBody, 'Montserrat')

  const badge = params.showTemplateBadge === true
    ? `<div style="position:absolute;top:8px;right:8px;z-index:40;padding:2px 6px;border-radius:999px;font-size:10px;background:rgba(0,0,0,.55);color:#d4d4d8;border:1px solid rgba(255,255,255,.18)">${templateId}</div>`
    : ''

  const sourceMedia = params.sourceImageUrl
    ? `<img class="ig-bg-photo" src="${escapeHtml(params.sourceImageUrl)}" alt="Background da arte" />`
    : '<div class="ig-bg-fallback"></div>'

  const body = `
    <div class="ig-preview-container" style="--ig-primary-color:${params.tokens?.primaryColor || '#f97316'};--ig-bg-color:${params.tokens?.bgColor || '#09090b'};--ig-text-color:${params.tokens?.textColor || '#ffffff'};--ig-font-heading:${headingFont};--ig-font-body:${bodyFont}">
      ${sourceMedia}
      ${renderOverlays(templateSpec.overlay)}
      <div class="ig-safe-zone ${isStory ? 'ig-safe-zone-story' : 'ig-safe-zone-feed'}">
        <div class="ig-safe-content">
          ${renderTemplateFrame({
            templateId,
            preTitle: mapped.preTitle,
            title: mapped.title,
            description: mapped.description,
            cta: mapped.cta,
            badge: mapped.badge,
            footerInfo1: mapped.footerInfo1,
            footerInfo2: mapped.footerInfo2,
            listItems: mapped.listItems,
            includeLogo,
            logoUrl: params.logoUrl,
          })}
        </div>
      </div>
      ${badge}
    </div>
  `

  return {
    templateId,
    html: `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #09090b;
      }
      #app {
        width: 100%;
        height: 100%;
      }
      ${INSTAGRAM_DS_CSS}
      ${extraCss}
    </style>
  </head>
  <body>
    <div id="app">${body}</div>
  </body>
</html>`,
  }
}
