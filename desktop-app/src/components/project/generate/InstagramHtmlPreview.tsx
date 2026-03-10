import { useEffect, useMemo } from 'react'
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
  onFieldChange,
}: InstagramHtmlPreviewProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById(INSTAGRAM_DS_STYLE_ID)) return

    const style = document.createElement('style')
    style.id = INSTAGRAM_DS_STYLE_ID
    style.textContent = INSTAGRAM_DS_CSS
    document.head.appendChild(style)
  }, [])

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

  const renderEditable = (
    fieldKey: string | undefined,
    value: string,
    classNames: string,
    preserveBreaks = false,
  ) => {
    const displayValue = asDisplayValue(value, preserveBreaks)
    const handleFieldChange = onFieldChange
    const canEdit = editable && Boolean(fieldKey) && Boolean(handleFieldChange)
    if (!canEdit || !fieldKey || !handleFieldChange) {
      return (
        <div className={classNames} style={preserveBreaks ? { whiteSpace: 'pre-line' } : undefined}>
          {displayValue}
        </div>
      )
    }

    return (
      <div
        key={`${fieldKey}:${displayValue}`}
        className={cn(classNames, 'ig-editable')}
        style={preserveBreaks ? { whiteSpace: 'pre-line' } : undefined}
        contentEditable
        suppressContentEditableWarning
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
        ['--ig-font-heading' as string]: serializeFontFamilyVar(tokens?.fontHeading, 'Montserrat'),
        ['--ig-font-body' as string]: serializeFontFamilyVar(tokens?.fontBody, 'Montserrat'),
      }}
    >
      {sourceImageUrl ? (
        <img className="ig-bg-photo" src={sourceImageUrl} alt="Background da arte" />
      ) : (
        <div className="ig-bg-fallback" />
      )}

      {templateSpec.overlay === 'bottom' && <div className="ig-overlay-bottom" />}
      {templateSpec.overlay === 'left' && <div className="ig-overlay-left" />}
      {templateSpec.overlay === 'right' && <div className="ig-overlay-right" />}
      {templateSpec.overlay === 'top' && <div className="ig-overlay-top" />}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {renderEditable(
                mapped.binding.badgeKey,
                mapped.badge || 'QUALIDADE',
                'ig-typography-tag',
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
                {renderEditable(mapped.binding.preTitleKey, mapped.preTitle, 'ig-typography-pre')}
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(
                  mapped.binding.ctaKey,
                  mapped.cta || 'GARANTIR MESA',
                  'ig-typography-cta',
                )}
              </div>
            )}

            {templateId === 'S2' && (
              <div style={{ marginTop: 'auto', marginBottom: '2.4rem', width: '86%' }}>
                {renderEditable(mapped.binding.preTitleKey, mapped.preTitle, 'ig-typography-pre')}
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(mapped.binding.descriptionKey, mapped.description, 'ig-typography-desc', true)}
              </div>
            )}

            {templateId === 'S3' && (
              <div style={{ marginTop: 'auto' }}>
                {renderEditable(mapped.binding.titleKey, mapped.title || 'O QUE TEM HOJE', 'ig-typography-title', true)}
                <ul style={{ margin: '0.8rem 0 1rem 1rem', color: '#f97316', fontSize: '0.68rem', lineHeight: 1.4 }}>
                  {(listItems.length > 0 ? listItems : [mapped.description]).slice(0, 4).map((item) => (
                    <li key={item} style={{ marginBottom: '0.25rem' }}>
                      <span style={{ color: '#fff' }}>{item}</span>
                    </li>
                  ))}
                </ul>
                {renderEditable(mapped.binding.footerInfo1Key, mapped.footerInfo1, 'ig-typography-footer', true)}
                {renderEditable(mapped.binding.footerInfo2Key, mapped.footerInfo2, 'ig-typography-footer', true)}
              </div>
            )}

            {templateId === 'S4' && (
              <div style={{ marginTop: 'auto', textAlign: 'center', marginBottom: '2rem' }}>
                {renderEditable(mapped.binding.badgeKey, mapped.badge || 'BASTIDORES', 'ig-typography-tag')}
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(mapped.binding.descriptionKey, mapped.description, 'ig-typography-desc', true)}
                {renderEditable(mapped.binding.ctaKey, mapped.cta || 'VER PORTFOLIO', 'ig-typography-cta')}
              </div>
            )}

            {templateId === 'S5' && (
              <div style={{ marginTop: 'auto', marginBottom: '2rem' }}>
                {renderEditable(mapped.binding.badgeKey, mapped.badge || 'EM GRAVACAO', 'ig-typography-tag')}
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(mapped.binding.footerInfo1Key, mapped.footerInfo1, 'ig-typography-footer', true)}
                {renderEditable(mapped.binding.footerInfo2Key, mapped.footerInfo2, 'ig-typography-footer', true)}
              </div>
            )}

            {templateId === 'S6' && (
              <div style={{ marginTop: 'auto', textAlign: 'center', marginBottom: '2rem' }}>
                {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                {renderEditable(mapped.binding.ctaKey, mapped.cta || 'AGENDE SUA SESSAO', 'ig-typography-cta')}
              </div>
            )}

            {templateId === 'F1' && (
              <div style={{ marginTop: 'auto' }}>
                {renderEditable(mapped.binding.preTitleKey, mapped.preTitle || 'APENAS HOJE', 'ig-typography-pre')}
                {renderEditable(mapped.binding.badgeKey, mapped.badge || mapped.title, 'ig-typography-title', true)}
              </div>
            )}

            {templateId === 'F2' && (
              <>
                <div style={{ marginTop: 'auto', marginBottom: '2.2rem', width: '82%' }}>
                  {renderEditable(mapped.binding.titleKey, mapped.title, 'ig-typography-title', true)}
                  {renderEditable(mapped.binding.descriptionKey, mapped.description, 'ig-typography-desc', true)}
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
