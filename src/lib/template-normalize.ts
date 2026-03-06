// --- Types ---

export interface SlotConfig {
  type: string
  anchor: string
  anchor_offset?: number
  margin_top?: number
  margin_bottom?: number
  max_words?: number
  max_lines?: number
  max_characters_per_line?: number
  line_break_strategy?: 'balanced' | 'natural' | 'fixed'
  allow_auto_scale?: boolean
  font_size?: string
  weight?: number
  uppercase?: boolean
  max_height_pct?: number
  [key: string]: unknown
}

export interface TemplateData {
  canvas: {
    format?: string
    ratio?: string
    safe_margin?: number
    safe_area?: { top?: number; bottom?: number }
  }
  zones?: {
    text_zone?: { x?: number | string; width?: number | string }
    image_focus_zone?: { x?: number | string; width?: number | string }
    gradient_zone?: { x?: number | string; width?: number | string }
  }
  layout?: {
    text_alignment?: string
    visual_balance?: string
  }
  overlay?: {
    type?: string
    direction?: string
    start_color?: string
    end_opacity?: number
    [key: string]: unknown
  }
  typography?: {
    title_font?: string
    body_font?: string
    font_fallbacks?: string[]
    scale?: Record<string, number>
  }
  text_density?: {
    ideal_words?: number
    max_words?: number
  }
  colors?: Record<string, string>
  default_content?: Record<string, string>
  slot_priority?: string[]
  slot_drop_order?: string[]
  content_slots?: Record<string, SlotConfig>
  logo?: Record<string, unknown>
  [key: string]: unknown
}

// --- Allowed keys (whitelist) ---

const ALLOWED_TOP_KEYS = new Set([
  'canvas', 'zones', 'layout', 'overlay', 'typography',
  'text_density', 'colors', 'default_content', 'slot_priority',
  'slot_drop_order', 'content_slots', 'logo',
])

const ALLOWED_CANVAS_KEYS = new Set(['format', 'ratio', 'safe_margin', 'safe_area'])
const ALLOWED_ZONE_KEYS = new Set(['x', 'width'])
const ALLOWED_LAYOUT_KEYS = new Set(['text_alignment', 'visual_balance'])
const ALLOWED_OVERLAY_KEYS = new Set(['type', 'direction', 'start_color', 'end_opacity', 'end_color', 'position', 'opacity'])
const ALLOWED_TYPOGRAPHY_KEYS = new Set(['title_font', 'body_font', 'font_fallbacks', 'scale'])
const ALLOWED_DENSITY_KEYS = new Set(['ideal_words', 'max_words'])
const ALLOWED_LOGO_KEYS = new Set(['placement', 'size', 'anchor_offset', 'min_margin', 'max_size_ratio'])

const ALLOWED_SLOT_KEYS = new Set([
  'type', 'anchor', 'anchor_offset', 'margin_top', 'margin_bottom',
  'max_words', 'max_lines', 'max_characters_per_line', 'line_break_strategy',
  'allow_auto_scale', 'font_size', 'weight', 'uppercase', 'max_height_pct',
])

// --- Helpers ---

function parsePercentToNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)%$/)
    if (match) return parseFloat(match[1])
    const num = parseFloat(value)
    if (!isNaN(num)) return num
  }
  return undefined
}

function toNumber(value: unknown, defaultVal: number): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parsePercentToNumber(value)
    if (parsed !== undefined) return parsed
  }
  return defaultVal
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function filterKeys<T extends Record<string, unknown>>(obj: T, allowed: Set<string>): T {
  const result = {} as T
  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) {
      (result as any)[key] = obj[key]
    }
  }
  return result
}

// --- Zone Normalization ---

function normalizeZone(zone: Record<string, unknown> | undefined): { x: number; width: number } | undefined {
  if (!zone) return undefined
  const x = clamp(toNumber(zone.x, 0), 0, 100)
  let width = clamp(toNumber(zone.width, 100), 0, 100)
  if (x + width > 100) width = 100 - x
  return { x, width }
}

// --- Slot Normalization ---

function normalizeSlot(raw: Record<string, unknown>): SlotConfig {
  const filtered = filterKeys(raw, ALLOWED_SLOT_KEYS) as Record<string, unknown>
  return {
    type: String(filtered.type ?? 'paragraph'),
    anchor: String(filtered.anchor ?? 'top_fixed'),
    anchor_offset: filtered.anchor_offset !== undefined
      ? toNumber(filtered.anchor_offset, 0)
      : undefined,
    margin_top: toNumber(filtered.margin_top, 0),
    margin_bottom: toNumber(filtered.margin_bottom, 0),
    max_words: toNumber(filtered.max_words, 20),
    max_lines: toNumber(filtered.max_lines, 3),
    max_characters_per_line: toNumber(filtered.max_characters_per_line, 30),
    line_break_strategy: (['balanced', 'natural', 'fixed'].includes(String(filtered.line_break_strategy))
      ? filtered.line_break_strategy
      : 'natural') as 'balanced' | 'natural' | 'fixed',
    allow_auto_scale: filtered.allow_auto_scale !== false,
    font_size: String(filtered.font_size ?? 'md'),
    weight: toNumber(filtered.weight, 400),
    uppercase: filtered.uppercase === true,
    ...(filtered.max_height_pct !== undefined
      ? { max_height_pct: toNumber(filtered.max_height_pct, 0) }
      : {}),
  }
}

// --- Anchor Validation (DFS topological sort) ---

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateValidationError'
  }
}

/**
 * Validate anchor dependency graph for circular references using DFS.
 * Auto-heals broken references instead of throwing errors.
 * Only throws for actual circular dependencies.
 */
export function validateAnchorGraph(slots: Record<string, SlotConfig>): void {
  const slotNames = new Set(Object.keys(slots))

  // First pass: fix broken references (self-healing)
  for (const [name, config] of Object.entries(slots)) {
    const anchor = config.anchor
    if (anchor.startsWith('after:') || anchor.startsWith('before:')) {
      const ref = anchor.split(':')[1]
      if (!slotNames.has(ref)) {
        // Auto-heal: reset to positional anchor
        console.warn(`[template-normalize] Auto-fixing: slot '${name}' referenced non-existent '${ref}', resetting anchor`)
        if (anchor.startsWith('after:')) {
          config.anchor = 'top_fixed'
        } else {
          config.anchor = 'bottom_fixed'
        }
      }
    }
  }

  // Build adjacency after healing
  const deps = new Map<string, string>()
  const groups = new Map<string, 'top' | 'bottom'>()

  for (const [name, config] of Object.entries(slots)) {
    const anchor = config.anchor
    if (anchor === 'top_fixed' || anchor.startsWith('after:')) {
      groups.set(name, 'top')
    } else if (anchor === 'bottom_fixed' || anchor.startsWith('before:')) {
      groups.set(name, 'bottom')
    }
  }

  for (const [name, config] of Object.entries(slots)) {
    const anchor = config.anchor
    if (anchor.startsWith('after:') || anchor.startsWith('before:')) {
      const ref = anchor.split(':')[1]
      deps.set(name, ref)

      // Auto-heal cross-group references
      const myGroup = groups.get(name)
      const refGroup = groups.get(ref)
      if (myGroup && refGroup && myGroup !== refGroup) {
        console.warn(`[template-normalize] Auto-fixing: slot '${name}' cross-group ref to '${ref}', resetting anchor`)
        config.anchor = myGroup === 'top' ? 'top_fixed' : 'bottom_fixed'
        deps.delete(name)
      }

      // Auto-heal wrong anchor direction per group
      if (anchor.startsWith('before:') && groups.get(name) === 'top') {
        console.warn(`[template-normalize] Auto-fixing: slot '${name}' in top_group using before:, switching to after:`)
        config.anchor = `after:${ref}`
      }
      if (anchor.startsWith('after:') && groups.get(name) === 'bottom') {
        console.warn(`[template-normalize] Auto-fixing: slot '${name}' in bottom_group using after:, switching to before:`)
        config.anchor = `before:${ref}`
      }
    }
  }

  // DFS for cycle detection — break cycles instead of throwing
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      // Break cycle by resetting this slot's anchor
      const slotConfig = slots[node]
      console.warn(`[template-normalize] Auto-fixing: circular dependency at '${node}', resetting anchor`)
      slotConfig.anchor = groups.get(node) === 'bottom' ? 'bottom_fixed' : 'top_fixed'
      deps.delete(node)
      return
    }
    if (visited.has(node)) return
    inStack.add(node)
    const dep = deps.get(node)
    if (dep) dfs(dep, [...path, node])
    inStack.delete(node)
    visited.add(node)
  }

  for (const name of Object.keys(slots)) {
    dfs(name, [])
  }
}

// --- Main Export ---

/**
 * Normalize template data received from Vision API.
 * Converts percent strings to numbers, ensures types, validates limits,
 * removes unknown fields. Idempotent: normalizeTemplate(normalizeTemplate(x)) === normalizeTemplate(x).
 */
export function normalizeTemplate(raw: Record<string, unknown>): TemplateData {
  // Filter top-level keys
  const data = filterKeys(raw, ALLOWED_TOP_KEYS)

  // Canvas
  const rawCanvas = (data.canvas ?? {}) as Record<string, unknown>
  const filteredCanvas = filterKeys(rawCanvas, ALLOWED_CANVAS_KEYS)
  const rawSafeArea = (filteredCanvas.safe_area ?? {}) as Record<string, unknown>
  const canvas = {
    format: filteredCanvas.format ? String(filteredCanvas.format) : undefined,
    ratio: filteredCanvas.ratio ? String(filteredCanvas.ratio) : undefined,
    safe_margin: toNumber(filteredCanvas.safe_margin, 0),
    safe_area: {
      top: toNumber(rawSafeArea.top, 0),
      bottom: toNumber(rawSafeArea.bottom, 0),
    },
  }

  // Zones
  const rawZones = (data.zones ?? {}) as Record<string, unknown>
  const zones: Record<string, { x: number; width: number }> = {}
  for (const zoneName of ['text_zone', 'image_focus_zone', 'gradient_zone']) {
    const zoneData = rawZones[zoneName] as Record<string, unknown> | undefined
    const normalized = normalizeZone(zoneData)
    if (normalized) zones[zoneName] = normalized
  }

  // Layout
  const rawLayout = (data.layout ?? {}) as Record<string, unknown>
  const layout = filterKeys(rawLayout, ALLOWED_LAYOUT_KEYS) as { text_alignment?: string; visual_balance?: string }

  // Overlay
  const rawOverlay = (data.overlay ?? {}) as Record<string, unknown>
  const overlay = filterKeys(rawOverlay, ALLOWED_OVERLAY_KEYS)

  // Typography
  const rawTypo = (data.typography ?? {}) as Record<string, unknown>
  const filteredTypo = filterKeys(rawTypo, ALLOWED_TYPOGRAPHY_KEYS) as Record<string, unknown>
  const typography = {
    title_font: filteredTypo.title_font ? String(filteredTypo.title_font) : undefined,
    body_font: filteredTypo.body_font ? String(filteredTypo.body_font) : undefined,
    font_fallbacks: Array.isArray(filteredTypo.font_fallbacks)
      ? filteredTypo.font_fallbacks.map(String)
      : ['sans-serif'],
    scale: (filteredTypo.scale && typeof filteredTypo.scale === 'object')
      ? filteredTypo.scale as Record<string, number>
      : undefined,
  }

  // Text density
  const rawDensity = (data.text_density ?? {}) as Record<string, unknown>
  const filteredDensity = filterKeys(rawDensity, ALLOWED_DENSITY_KEYS)
  const text_density = {
    ideal_words: toNumber(filteredDensity.ideal_words, 20),
    max_words: toNumber(filteredDensity.max_words, 35),
  }

  // Colors
  const colors = (data.colors && typeof data.colors === 'object')
    ? data.colors as Record<string, string>
    : undefined

  // Default content
  const default_content = (data.default_content && typeof data.default_content === 'object')
    ? data.default_content as Record<string, string>
    : undefined

  // Content slots
  // Handle Vision returning content_slots as an array instead of named object
  let rawSlots: Record<string, Record<string, unknown>> = {}
  const rawContentSlots = data.content_slots
  if (Array.isArray(rawContentSlots)) {
    // Vision may return an array of slot objects.
    // Strategy: use 'name' field first, then 'type' field as key.
    // After mapping, rebuild anchors that reference old names.
    const tempSlots: Array<{ key: string; obj: Record<string, unknown> }> = []
    for (const item of rawContentSlots) {
      if (item && typeof item === 'object') {
        const slotObj = item as Record<string, unknown>
        // Prefer 'name' field, then 'type', then fallback to counter
        const key = String(slotObj.name ?? slotObj.type ?? `slot_${tempSlots.length}`)
        tempSlots.push({ key, obj: slotObj })
      }
    }

    // Build the named map
    for (const { key, obj } of tempSlots) {
      rawSlots[key] = obj
    }

    // Now check: if an anchor references a name that doesn't exist as a key,
    // try to find a slot whose 'name' or 'type' matches the reference and remap.
    const slotKeySet = new Set(Object.keys(rawSlots))
    for (const [_key, slotObj] of Object.entries(rawSlots)) {
      const anchor = String(slotObj.anchor ?? '')
      if (anchor.startsWith('after:') || anchor.startsWith('before:')) {
        const ref = anchor.split(':')[1]
        if (!slotKeySet.has(ref)) {
          // Search for a slot whose 'name' matches the ref
          const match = tempSlots.find(s => String(s.obj.name) === ref)
          if (match && slotKeySet.has(match.key)) {
            slotObj.anchor = anchor.replace(`:${ref}`, `:${match.key}`)
          }
        }
      }
    }
  } else if (rawContentSlots && typeof rawContentSlots === 'object') {
    rawSlots = rawContentSlots as Record<string, Record<string, unknown>>
  }

  const content_slots: Record<string, SlotConfig> = {}
  for (const [name, slotRaw] of Object.entries(rawSlots)) {
    if (slotRaw && typeof slotRaw === 'object') {
      content_slots[name] = normalizeSlot(slotRaw)
    }
  }

  // Slot priority (default: keys of content_slots)
  // IMPORTANT: filter to only include keys that actually exist in content_slots
  // Vision may return slot_priority with names that don't match content_slots keys
  const slotKeys = Object.keys(content_slots)
  const slotKeySet = new Set(slotKeys)
  let slot_priority: string[]
  if (Array.isArray(data.slot_priority)) {
    const raw = (data.slot_priority as string[]).filter(s => typeof s === 'string')
    const valid = raw.filter(s => slotKeySet.has(s))
    if (valid.length !== raw.length) {
      const invalid = raw.filter(s => !slotKeySet.has(s))
      console.warn(`[template-normalize] slot_priority contained invalid keys: ${invalid.join(', ')}. Valid keys: ${slotKeys.join(', ')}`)
    }
    // Use valid entries, then append any content_slots keys not in priority
    const missingKeys = slotKeys.filter(k => !new Set(valid).has(k))
    slot_priority = [...valid, ...missingKeys]
  } else {
    slot_priority = slotKeys
  }

  // Slot drop order (default: reverse of priority)
  // Also filter against content_slots keys
  let slot_drop_order: string[]
  if (Array.isArray(data.slot_drop_order)) {
    const raw = (data.slot_drop_order as string[]).filter(s => typeof s === 'string')
    const valid = raw.filter(s => slotKeySet.has(s))
    const missingKeys = slotKeys.filter(k => !new Set(valid).has(k))
    slot_drop_order = [...valid, ...missingKeys]
  } else {
    slot_drop_order = [...slot_priority].reverse()
  }

  // Logo
  const rawLogo = (data.logo ?? undefined) as Record<string, unknown> | undefined
  const logo = rawLogo ? filterKeys(rawLogo, ALLOWED_LOGO_KEYS) : undefined

  // Validate anchor graph if slots exist
  if (Object.keys(content_slots).length > 0) {
    validateAnchorGraph(content_slots)
  }

  return {
    canvas,
    zones: Object.keys(zones).length > 0 ? zones as any : undefined,
    layout: Object.keys(layout).length > 0 ? layout : undefined,
    overlay: Object.keys(overlay).length > 0 ? overlay : undefined,
    typography,
    text_density,
    colors,
    default_content,
    slot_priority,
    slot_drop_order,
    content_slots,
    logo,
  }
}
