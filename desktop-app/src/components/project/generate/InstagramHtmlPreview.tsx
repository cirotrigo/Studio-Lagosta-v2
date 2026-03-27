import { CSSProperties, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ArtFormat, ReviewField } from '@/stores/generation.store'
import { INSTAGRAM_DS_CSS, INSTAGRAM_DS_STYLE_ID } from '@/lib/instagram-ds/design-system-css'
import { getDsTemplateSpec } from '@/lib/instagram-ds/template-registry'
import { mapFieldsToDsContent, resolveDsTemplateId } from '@/lib/instagram-ds/slot-mapper'
import type { InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'

interface InstagramHtmlPreviewProps {
  format: ArtFormat
  fields: ReviewField[]
  sourceImageUrl?: string
  logoUrl?: string
  includeLogo?: boolean
  templateName?: string
  editable?: boolean
  className?: string
  tokens?: Partial<InstagramPreviewTokens>
  customCss?: string
  scale?: number
  onFieldChange?: (fieldKey: string, value: string) => void
}

function normalizeInputValue(value: string, preserveBreaks: boolean): string {
  if (!preserveBreaks) {
    return value.replace(/\s+/g, ' ').trim()
  }
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('<br>')
}

function asDisplayValue(value: string, preserveBreaks: boolean): string {
  if (!preserveBreaks) return value
  return value.replace(/<br\s*\/?>/gi, '\n')
}

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

export default function InstagramHtmlPreview({
  format,
  fields,
  sourceImageUrl,
  logoUrl,
  includeLogo = true,
  templateName,
  editable = false,
  className,
  tokens,
  customCss,
  scale,
  onFieldChange,
}: InstagramHtmlPreviewProps) {
  const mergedCss = useMemo(() => {
    const overrides = (customCss || '').trim()
    if (!overrides) return INSTAGRAM_DS_CSS
    const sanitized = overrides.replace(/<\/style/gi, '<\\/style')
    const scaled = scaleImportedCss(sanitized)
    return `${INSTAGRAM_DS_CSS}\n\n/* Imported DS overrides */\n${scaled}`
  }, [customCss])

  const effectiveScale = useMemo(() => {
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) return scale
    return (customCss || '').trim().length > 0 ? 4 : 1
  }, [scale, customCss])

  useEffect(() => {
    if (typeof document === 'undefined') return

    let style = document.getElementById(INSTAGRAM_DS_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = INSTAGRAM_DS_STYLE_ID
      document.head.appendChild(style)
    }
    if (style.textContent !== mergedCss) {
      style.textContent = mergedCss
    }
  }, [mergedCss])

  const mapped = useMemo(() => mapFieldsToDsContent(fields), [fields])
  const templateId = useMemo(
    () => resolveDsTemplateId({ format, mapped, templateName }),
    [format, mapped, templateName],
  )
  const templateSpec = getDsTemplateSpec(templateId)
  const isStory = format === 'STORY'

  const listItems = mapped.listItems.length > 0
    ? mapped.listItems
    : mapped.description
      .split(/[|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4)
  const footerCombined = [mapped.footerInfo1, mapped.footerInfo2]
    .filter(Boolean)
    .join('\n')

  const renderEditable = (
    fieldKey: string | undefined,
    value: string,
    classNames: string,
    preserveBreaks = false,
    style?: CSSProperties,
  ) => {
    const displayValue = asDisplayValue(value, preserveBreaks)
    const handleFieldChange = onFieldChange
    const canEdit = editable && Boolean(fieldKey) && Boolean(handleFieldChange)
    const mergedStyle: CSSProperties | undefined = {
      ...(preserveBreaks ? { whiteSpace: 'pre-line' as const } : {}),
      ...(style || {}),
    }
    if (!canEdit || !fieldKey || !handleFieldChange) {
      return (
        <div className={classNames} style={mergedStyle}>
          {displayValue}
        </div>
      )
    }

    return (
      <div
        key={`${fieldKey}:${displayValue}`}
        className={cn(classNames, 'ig-editable')}
        style={mergedStyle}
        contentEditable
        suppressContentEditableWarning
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
        onInput={(event) => {
          const next = normalizeInputValue(event.currentTarget.textContent || '', preserveBreaks)
          handleFieldChange(fieldKey, next)
        }}
      >
        {displayValue}
      </div>
    )
  }

  return (
    <div
      className={cn('ig-preview-container', className)}
      style={{
        ['--ig-primary-color' as string]: tokens?.primaryColor || '#f97316',
        ['--ig-bg-color' as string]: tokens?.bgColor || '#09090b',
        ['--ig-text-color' as string]: tokens?.textColor || '#ffffff',
        ['--ig-scale' as string]: String(effectiveScale),
        ['--ig-font-heading' as string]: serializeFontFamilyVar(tokens?.fontHeading, 'Montserrat'),
        ['--ig-font-body' as string]: serializeFontFamilyVar(tokens?.fontBody, 'Montserrat'),
      }}
    >
      {sourceImageUrl ? (
        <img className="ig-bg-photo" src={sourceImageUrl} alt="Background da arte" />
      ) : (
        <div className="ig-bg-fallback" />
      )}

      {templateSpec.overlay === 'bottom' && templateId !== 'S3' && templateId !== 'S4' && templateId !== 'S5' && (
        <div className="ig-overlay-bottom" />
      )}
      {templateSpec.overlay === 'left' && <div className="ig-overlay-left" />}
      {templateSpec.overlay === 'right' && <div className="ig-overlay-right" />}
      {templateSpec.overlay === 'top' && <div className="ig-overlay-top" />}
      {templateId === 'S3' && <div className="ig-overlay-bottom" style={{ height: '50%' }} />}
      {templateId === 'S4' && <div className="ig-overlay-bottom" style={{ height: '60%' }} />}
      {templateId === 'S5' && <div className="ig-overlay-bottom" style={{ height: '55%' }} />}
      {templateSpec.overlay === 'double' && (
        <>
          <div className="ig-overlay-top" style={{ height: '35%' }} />
          <div className="ig-overlay-bottom" style={{ height: '40%' }} />
        </>
      )}

      <div className={cn('ig-safe-zone', isStory ? 'ig-safe-zone-story' : 'ig-safe-zone-feed')}>
        <div className="ig-safe-content">
          {(templateId === 'S1' || templateId === 'S3' || templateId === 'S4') && includeLogo && logoUrl && (
            <img className="ig-logo" style={{ margin: '0 auto' }} src={logoUrl} alt="Logo da marca" />
          )}

          {templateId === 'S2' && includeLogo && logoUrl && (
            <img className="ig-logo" style={{ marginLeft: 'auto' }} src={logoUrl} alt="Logo da marca" />
          )}

          {templateId === 'S5' && includeLogo && logoUrl && (
            <img className="ig-logo" style={{ marginLeft: 'auto' }} src={logoUrl} alt="Logo da marca" />
          )}

          {templateId === 'S6' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              {renderEditable(
                mapped.binding.badgeKey,
                mapped.badge || 'QUALIDADE',
                'ig-typography-tag',
                false,
                {
                  background: '#ea580c',
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  boxShadow: '0 6px 14px rgba(234,88,12,.35)',
                },
              )}
              {includeLogo && logoUrl ? <img className="ig-logo" src={logoUrl} alt="Logo da marca" /> : <span />}
            </div>
          )}

          {templateId === 'F1' && includeLogo && logoUrl && (
            <img className="ig-logo-feed" src={logoUrl} alt="Logo da marca" />
          )}

          <div className="ig-template-frame">
            {templateId === 'S1' && (
              <div style={{ marginTop: 'auto', textAlign: 'center', marginBottom: '2rem' }}>
                {renderEditable(
                  mapped.binding.preTitleKey,
                  mapped.preTitle || 'PROMOÇÃO EXCLUSIVA',
                  'ig-typography-pre',
                  false,
                  { color: 'var(--ig-primary-color, #f97316)' },
                )}
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(
                  mapped.binding.ctaKey,
                  mapped.cta || 'GARANTIR MESA',
                  'ig-typography-cta',
                  false,
                  {
                    justifyContent: 'center',
                    color: 'var(--ig-primary-color, #f97316)',
                    marginTop: '0.35rem',
                  },
                )}
              </div>
            )}

            {templateId === 'S2' && (
              <div style={{ marginTop: 'auto', marginBottom: '3rem', width: '86%' }}>
                {renderEditable(mapped.binding.preTitleKey, mapped.preTitle, 'ig-typography-pre')}
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(
                  mapped.binding.descriptionKey,
                  mapped.description,
                  'ig-typography-desc',
                  true,
                  { marginTop: '0.5rem', width: '75%' },
                )}
              </div>
            )}

            {templateId === 'S3' && (
              <div style={{ marginTop: 'auto' }}>
                {renderEditable(
                  mapped.binding.titleKey,
                  mapped.title || 'O QUE TEM HOJE',
                  'ig-typography-title',
                  true,
                  { textAlign: 'center' },
                )}
                <ul
                  style={{
                    margin: '1rem 0 2rem 1.5rem',
                    listStyleType: 'disc',
                    color: '#f97316',
                    fontSize: '0.75rem',
                    lineHeight: 1.35,
                    fontWeight: 500,
                  }}
                >
                  {(listItems.length > 0 ? listItems : [mapped.description]).slice(0, 4).map((item) => (
                    <li key={item} style={{ marginBottom: '0.35rem' }}>
                      <span style={{ color: '#fff' }}>{item}</span>
                    </li>
                  ))}
                </ul>
                {renderEditable(
                  mapped.binding.footerInfo1Key || mapped.binding.footerInfo2Key,
                  footerCombined,
                  'ig-typography-footer',
                  true,
                  { textAlign: 'center', fontSize: '10px', opacity: 0.8 },
                )}
              </div>
            )}

            {templateId === 'S4' && (
              <div style={{ marginTop: 'auto', textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ marginBottom: '0.75rem' }}>
                  {renderEditable(
                    mapped.binding.badgeKey,
                    mapped.badge || 'BASTIDORES',
                    'ig-typography-tag',
                    false,
                    {
                      background: '#ea580c',
                      color: '#fff',
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      boxShadow: '0 6px 14px rgba(234,88,12,.35)',
                      display: 'inline-block',
                    },
                  )}
                </div>
                {renderEditable(
                  mapped.binding.titleKey,
                  mapped.title,
                  'ig-typography-title',
                  true,
                  { fontSize: '1.25rem', lineHeight: 1.1 },
                )}
                {renderEditable(
                  mapped.binding.descriptionKey,
                  mapped.description,
                  'ig-typography-desc',
                  true,
                  { marginBottom: '1rem', padding: '0 1rem', fontSize: '10px' },
                )}
                {renderEditable(
                  mapped.binding.ctaKey,
                  mapped.cta || 'VER PORTFOLIO',
                  'ig-typography-cta',
                  false,
                  {
                    display: 'inline-flex',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.4)',
                    padding: '0.45rem 0.95rem',
                    borderRadius: 999,
                  },
                )}
              </div>
            )}

            {templateId === 'S5' && (
              <div style={{ marginTop: 'auto', marginBottom: '2rem' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    border: '1px solid rgba(249,115,22,0.3)',
                    background: 'rgba(249,115,22,0.1)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '9px',
                    fontWeight: 500,
                    color: '#f97316',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      height: 6,
                      width: 6,
                      borderRadius: 999,
                      background: '#f97316',
                      marginRight: 6,
                    }}
                  />
                  {renderEditable(
                    mapped.binding.badgeKey,
                    mapped.badge || 'EM GRAVAÇÃO',
                    'ig-typography-pre',
                    false,
                    { margin: 0, color: '#f97316', fontSize: '9px' },
                  )}
                </div>
                {renderEditable(
                  mapped.binding.titleKey,
                  mapped.title,
                  'ig-typography-title',
                  true,
                  { fontSize: '1.25rem' },
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem', fontSize: '9px', color: '#d4d4d8' }}>
                  {mapped.footerInfo1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ display: 'inline-block', height: 6, width: 6, borderRadius: 999, background: '#f97316', flexShrink: 0 }} />
                      {renderEditable(mapped.binding.footerInfo1Key, mapped.footerInfo1, 'ig-typography-footer', true, { color: '#d4d4d8', fontSize: '9px' })}
                    </div>
                  )}
                  {mapped.footerInfo2 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ display: 'inline-block', height: 6, width: 6, borderRadius: 999, background: '#f97316', flexShrink: 0 }} />
                      {renderEditable(mapped.binding.footerInfo2Key, mapped.footerInfo2, 'ig-typography-footer', true, { color: '#d4d4d8', fontSize: '9px' })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {templateId === 'S6' && (
              <div style={{ marginTop: 'auto', textAlign: 'center', marginBottom: '2rem' }}>
                {renderEditable(
                  mapped.binding.titleKey,
                  mapped.title,
                  'ig-typography-title',
                  true,
                  { fontSize: 22, lineHeight: 1, marginBottom: '0.75rem' },
                )}
                {renderEditable(
                  mapped.binding.ctaKey,
                  mapped.cta || 'AGENDE SUA SESSAO',
                  'ig-typography-cta',
                  false,
                  {
                    display: 'inline-flex',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    background: 'transparent',
                    border: '1px solid rgba(249,115,22,0.3)',
                    padding: '0.45rem 1.2rem',
                    borderRadius: 999,
                  },
                )}
              </div>
            )}

            {templateId === 'F1' && (
              <div style={{ marginTop: 'auto' }}>
                {renderEditable(
                  mapped.binding.preTitleKey,
                  mapped.preTitle || 'APENAS HOJE',
                  'ig-typography-pre',
                  false,
                  { color: 'var(--ig-primary-color, #f97316)' },
                )}
                {renderEditable(
                  mapped.binding.badgeKey,
                  mapped.badge || mapped.title,
                  'ig-typography-title',
                  true,
                  { fontSize: '3rem', marginTop: -5 },
                )}
              </div>
            )}

            {templateId === 'F2' && (
              <>
                <div style={{ marginTop: 'auto', marginBottom: '2.5rem', width: '80%' }}>
                  {renderEditable(
                    mapped.binding.titleKey,
                    mapped.title,
                    'ig-typography-title',
                    true,
                    { fontSize: '1.25rem', lineHeight: 0.95 },
                  )}
                  {mapped.description && renderEditable(mapped.binding.descriptionKey, mapped.description, 'ig-typography-desc', true, { marginTop: '0.5rem' })}
                </div>
                {includeLogo && logoUrl && (
                  <img
                    className="ig-logo-feed"
                    style={{ marginTop: 'auto', marginLeft: 'auto' }}
                    src={logoUrl}
                    alt="Logo da marca"
                  />
                )}
              </>
            )}

            {templateId === 'F3' && (
              <div style={{ marginTop: 'auto', marginBottom: '0.5rem', marginLeft: '0.5rem' }}>
                {renderEditable(mapped.binding.badgeKey, mapped.badge || '#GASTRONOMIA', 'ig-typography-tag')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 40,
          padding: '2px 6px',
          borderRadius: 999,
          fontSize: 10,
          background: 'rgba(0, 0, 0, 0.55)',
          color: '#d4d4d8',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        {templateId}
      </div>
    </div>
  )
}
