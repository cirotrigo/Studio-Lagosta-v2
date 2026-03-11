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

function scaleImportedCss(css: string): string {
  return css.replace(/(-?\d*\.?\d+)rem\b/gi, (_match, value: string) => {
    return `calc(${value}rem * var(--ig-scale, 1))`
  })
}

function renderText(value: string, className: string, style?: string): string {
  if (!value) return ''
  const styleAttr = style ? ` style="${style}"` : ''
  return `<div class="${className}"${styleAttr}>${escapeHtml(value)}</div>`
}

function renderTextMultiline(value: string, className: string, style?: string): string {
  if (!value) return ''
  const styleAttr = style ? ` style="${style}"` : ''
  return `<div class="${className}"${styleAttr}>${toMultilineHtml(value)}</div>`
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

function renderOverlays(
  overlay: 'top' | 'bottom' | 'left' | 'right' | 'double' | 'none',
  templateId: string,
): string {
  if (templateId === 'S3') return '<div class="ig-overlay-bottom" style="height:50%"></div>'
  if (templateId === 'S4') return '<div class="ig-overlay-bottom" style="height:60%"></div>'
  if (templateId === 'S5') return '<div class="ig-overlay-bottom" style="height:55%"></div>'
  if (overlay === 'none') return ''
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
    ? `<ul style="margin:1rem 0 2rem 1.5rem;list-style-type:disc;color:#f97316;font-size:0.75rem;line-height:1.35;font-weight:500">${fallbackList
      .slice(0, 4)
      .map((item) => `<li style="margin-bottom:0.35rem"><span style="color:#fff">${escapeHtml(item)}</span></li>`)
      .join('')}</ul>`
    : ''

  const footerLines = [footerInfo1, footerInfo2].filter(Boolean)
  const footerCombined = footerLines.join('\n')

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
    ? `<div style="display:flex;align-items:center;justify-content:space-between;width:100%">
      <div style="background:#ea580c;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em;box-shadow:0 6px 14px rgba(234,88,12,.35)">${escapeHtml(normalizeText(badge) || 'QUALIDADE')}</div>
      ${includeLogo ? (renderLogo(logoUrl, 'ig-logo') || '<span></span>') : '<span></span>'}
    </div>`
    : ''

  let body = ''
  if (templateId === 'S1') {
    body = `<div style="margin-top:auto;text-align:center;margin-bottom:2rem">
      ${renderText(preTitle || 'PROMOÇÃO EXCLUSIVA', 'ig-typography-pre', 'color:var(--ig-primary-color,#f97316)')}
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderText(cta || 'GARANTIR MESA', 'ig-typography-cta', 'justify-content:center;color:var(--ig-primary-color,#f97316);margin-top:0.35rem')}
    </div>`
  } else if (templateId === 'S2') {
    body = `<div style="margin-top:auto;margin-bottom:3rem;width:86%">
      ${renderText(preTitle, 'ig-typography-pre')}
      ${renderTextMultiline(title, 'ig-typography-title')}
      ${renderTextMultiline(description, 'ig-typography-desc', 'margin-top:0.5rem;width:75%')}
    </div>`
  } else if (templateId === 'S3') {
    body = `<div style="margin-top:auto">
      ${renderTextMultiline(title || 'O QUE TEM HOJE', 'ig-typography-title', 'text-align:center')}
      ${listHtml}
      ${renderTextMultiline(footerCombined, 'ig-typography-footer', 'text-align:center;font-size:10px;opacity:0.8')}
    </div>`
  } else if (templateId === 'S4') {
    body = `<div style="margin-top:auto;text-align:center;margin-bottom:2rem">
      <div style="margin-bottom:0.75rem">
        <div style="background:#ea580c;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:999px;display:inline-block;text-transform:uppercase;letter-spacing:0.08em;box-shadow:0 6px 14px rgba(234,88,12,.35)">${escapeHtml(normalizeText(badge) || 'BASTIDORES')}</div>
      </div>
      ${renderTextMultiline(title, 'ig-typography-title', 'font-size:1.25rem;line-height:1.1')}
      ${renderTextMultiline(description, 'ig-typography-desc', 'margin-bottom:1rem;padding:0 1rem;font-size:10px')}
      ${renderText(cta || 'VER PORTFOLIO', 'ig-typography-cta', 'display:inline-flex;justify-content:center;gap:0.25rem;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.4);padding:0.45rem 0.95rem;border-radius:999px')}
    </div>`
  } else if (templateId === 'S5') {
    body = `<div style="margin-top:auto;margin-bottom:2rem">
      <div style="display:inline-flex;align-items:center;border:1px solid rgba(249,115,22,0.3);background:rgba(249,115,22,0.1);padding:2px 8px;border-radius:999px;font-size:9px;font-weight:500;color:#f97316;backdrop-filter:blur(4px);margin-bottom:0.5rem">
        <span style="display:inline-flex;height:6px;width:6px;border-radius:999px;background:#f97316;margin-right:6px"></span>${escapeHtml(normalizeText(badge) || 'EM GRAVAÇÃO')}
      </div>
      ${renderTextMultiline(title, 'ig-typography-title', 'font-size:1.25rem')}
      <div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.75rem;font-size:9px;color:#d4d4d8">
        ${footerInfo1 ? `<div style="display:flex;align-items:center;gap:0.4rem"><span style="display:inline-block;height:6px;width:6px;border-radius:999px;background:#f97316;flex-shrink:0"></span><span>${escapeHtml(footerInfo1)}</span></div>` : ''}
        ${footerInfo2 ? `<div style="display:flex;align-items:center;gap:0.4rem"><span style="display:inline-block;height:6px;width:6px;border-radius:999px;background:#f97316;flex-shrink:0"></span><span>${escapeHtml(footerInfo2)}</span></div>` : ''}
      </div>
    </div>`
  } else if (templateId === 'S6') {
    body = `<div style="margin-top:auto;text-align:center;margin-bottom:2rem">
      ${renderTextMultiline(title, 'ig-typography-title', 'font-size:22px;line-height:1;margin-bottom:0.75rem')}
      ${renderText(cta || 'AGENDE SUA SESSAO', 'ig-typography-cta', 'display:inline-flex;justify-content:center;gap:0.25rem;background:transparent;border:1px solid rgba(249,115,22,0.3);padding:0.45rem 1.2rem;border-radius:999px')}
    </div>`
  } else if (templateId === 'F1') {
    body = `<div style="margin-top:auto">
      ${renderText(preTitle || 'APENAS HOJE', 'ig-typography-pre', 'color:var(--ig-primary-color,#f97316)')}
      ${renderTextMultiline((badge || title), 'ig-typography-title', 'font-size:3rem;margin-top:-5px')}
    </div>`
  } else if (templateId === 'F2') {
    body = `<div style="margin-top:auto;margin-bottom:2.5rem;width:80%">
      ${renderTextMultiline(title, 'ig-typography-title', 'font-size:1.25rem;line-height:0.95')}
      ${description ? renderTextMultiline(description, 'ig-typography-desc', 'margin-top:0.5rem') : ''}
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

  const targetWidth = 1080
  const dsBaseWidth = 270
  const customCss = (params.customCss || '').trim()
  const sanitizedCss = customCss.replace(/<\/style/gi, '<\\/style')
  const hasImportedOverrides = sanitizedCss.length > 0
  const renderScale = hasImportedOverrides ? targetWidth / dsBaseWidth : 1
  const scaledOverrides = scaleImportedCss(sanitizedCss)
  const extraCss = scaledOverrides ? `\n/* Imported DS overrides */\n${scaledOverrides}` : ''
  const snapshotLayoutGuardCss = `
/* Snapshot layout guard: prevents imported DS CSS from collapsing the frame */
html, body, #app {
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
#app {
  position: relative !important;
}
#app > .ig-preview-container {
  position: relative !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  max-height: 100% !important;
  max-width: 100% !important;
  aspect-ratio: auto !important;
  transform: none !important;
  transform-origin: top left !important;
}
#app .ig-bg-photo,
#app .ig-bg-fallback,
#app .ig-overlay-top,
#app .ig-overlay-bottom,
#app .ig-overlay-left,
#app .ig-overlay-right,
#app .ig-safe-zone,
#app .ig-template-frame {
  position: absolute !important;
}
#app .ig-template-frame {
  inset: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}
#app .ig-logo {
  max-width: calc(75px * var(--ig-scale)) !important;
  min-width: calc(36px * var(--ig-scale)) !important;
}
#app .ig-logo-feed {
  max-width: calc(55px * var(--ig-scale)) !important;
  min-width: calc(30px * var(--ig-scale)) !important;
}
`
  const headingFont = serializeFontFamilyVar(params.tokens?.fontHeading, 'Montserrat')
  const bodyFont = serializeFontFamilyVar(params.tokens?.fontBody, 'Montserrat')
  const igScale = renderScale.toFixed(4)

  const badge = params.showTemplateBadge === true
    ? `<div style="position:absolute;top:8px;right:8px;z-index:40;padding:2px 6px;border-radius:999px;font-size:10px;background:rgba(0,0,0,.55);color:#d4d4d8;border:1px solid rgba(255,255,255,.18)">${templateId}</div>`
    : ''

  const sourceMedia = params.sourceImageUrl
    ? `<img class="ig-bg-photo" src="${escapeHtml(params.sourceImageUrl)}" alt="Background da arte" />`
    : '<div class="ig-bg-fallback"></div>'

  const body = `
    <div class="ig-preview-container" style="position:relative !important;display:block !important;width:100% !important;height:100% !important;min-height:100% !important;max-width:none !important;max-height:none !important;aspect-ratio:auto !important;transform:none !important;transform-origin:top left !important;--ig-scale:${igScale};--ig-primary-color:${params.tokens?.primaryColor || '#f97316'};--ig-bg-color:${params.tokens?.bgColor || '#09090b'};--ig-text-color:${params.tokens?.textColor || '#ffffff'};--ig-font-heading:${headingFont};--ig-font-body:${bodyFont}">
      ${sourceMedia}
      ${renderOverlays(templateSpec.overlay, templateId)}
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
    <meta name="viewport" content="width=1080,initial-scale=1" />
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
      ${snapshotLayoutGuardCss}
    </style>
  </head>
  <body>
    <div id="app">${body}</div>
  </body>
</html>`,
  }
}
