import { DEFAULT_SETTINGS } from '../store'
import { GLYPH_CHARS } from '../types'
import { fmt } from './geometry'
import { resolveGlyphRender, shapeToPath } from './glyph'

import type { BezierPreset, Glyph, Point, ProjectSettings, Shape } from '../types'

/**
 * Encode a list of points as a `data-f7-points` attribute value. Format is
 * space-separated pairs `x,y` — same shape as SVG's native `points` attribute,
 * so it's easy to read by eye and trivially parseable.
 */
const pointsToAttr = (pts: readonly Point[]): string => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')

const parsePointsAttr = (raw: string | null): Point[] => {
  if (!raw) return []
  const out: Point[] = []
  for (const pair of raw.trim().split(/\s+/)) {
    const [xs, ys] = pair.split(',')
    const x = parseFloat(xs)
    const y = parseFloat(ys)
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y])
  }
  return out
}

const parsePointRefsAttr = (raw: string | null): Record<number, string> | undefined => {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const out: Record<number, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const idx = parseInt(k, 10)
    if (Number.isFinite(idx) && idx >= 0 && typeof v === 'string' && v.length > 0) {
      out[idx] = v
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const parseBezierPresetsAttr = (raw: string | null): BezierPreset[] | null => {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const seen = new Set<string>()
  const out: BezierPreset[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const name = typeof obj.name === 'string' ? obj.name.trim() : ''
    const value = typeof obj.value === 'number' && Number.isFinite(obj.value) ? obj.value : NaN
    if (!name || seen.has(name) || !Number.isFinite(value)) continue
    seen.add(name)
    out.push({ name, value: Math.max(0, Math.min(1, value)) })
  }
  return out.length > 0 ? out : null
}

const parseAngles = (raw: string | null): number[] | null => {
  if (!raw) return null
  const out: number[] = []
  for (const part of raw.split(',')) {
    const n = parseFloat(part)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

const numAttr = (el: Element, name: string, fallback: number): number => {
  const raw = el.getAttribute(name)
  if (!raw) return fallback
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

let importCounter = 0
const importShapeId = (): string => `imp-${++importCounter}-${Math.random().toString(36).slice(2, 7)}`

export interface ParsedProject {
  settings: ProjectSettings
  glyphs: Record<string, Glyph>
}

/**
 * Build the layout transform for a glyph's `<g>` in the spec SVG. Glyphs are
 * laid out in a row in the same order as `GLYPH_CHARS`, separated by their
 * advance widths. Returns the absolute x offset for the glyph.
 */
function computeGlyphOffsets(
  glyphs: Record<string, Glyph>,
  glyphsByChar: Readonly<Record<string, Glyph>>,
): Record<string, number> {
  const out: Record<string, number> = {}
  let x = 0
  for (const ch of GLYPH_CHARS) {
    out[ch] = x
    const g = glyphs[ch]
    if (!g) continue
    const { advanceWidth } = resolveGlyphRender(g, glyphsByChar)
    x += advanceWidth
  }
  return out
}

export interface SerializeOptions {
  /**
   * When true, emit a "specimen" SVG: every glyph rendered side by side in a
   * single row, with `data-f7-*` metadata so the file round-trips through
   * `parseProject`. The default — and the only mode currently used.
   */
  asSpecimen: boolean
}

/**
 * Serialize the entire project (settings + 62 glyphs) into a single SVG that
 * doubles as the project file. The y-axis is flipped at the root via a
 * `scale(1, -1)` transform so internal y-up coordinates render correctly in
 * browsers without rewriting any numbers.
 */
export function serializeProject(
  settings: ProjectSettings,
  glyphs: Record<string, Glyph>,
  _opts: SerializeOptions = { asSpecimen: true },
): string {
  const offsets = computeGlyphOffsets(glyphs, glyphs)
  const totalWidth =
    offsets[GLYPH_CHARS[GLYPH_CHARS.length - 1]] + (glyphs[GLYPH_CHARS[GLYPH_CHARS.length - 1]]?.advanceWidth ?? 0)
  const viewBoxX = 0
  const viewBoxY = -settings.ascender
  const viewBoxW = Math.max(1, totalWidth)
  const viewBoxH = settings.ascender - settings.descender

  const settingsAttrs = [
    `data-f7="project"`,
    `data-f7-font-name="${escapeAttr(settings.fontName)}"`,
    `data-f7-units-per-em="${fmt(settings.unitsPerEm)}"`,
    `data-f7-ascender="${fmt(settings.ascender)}"`,
    `data-f7-descender="${fmt(settings.descender)}"`,
    `data-f7-cap-height="${fmt(settings.capHeight)}"`,
    `data-f7-x-height="${fmt(settings.xHeight)}"`,
    `data-f7-bezier-presets='${escapeAttr(JSON.stringify(settings.bezierPresets))}'`,
    `data-f7-snap-angles="${settings.snapAngles.join(',')}"`,
    `data-f7-grid-size="${fmt(settings.gridSize)}"`,
    `data-f7-grid-visible="${settings.gridVisible ? '1' : '0'}"`,
    `data-f7-grid-snap="${settings.gridSnap ? '1' : '0'}"`,
  ].join(' ')

  const body: string[] = []
  body.push(`<g transform="scale(1, -1)">`)
  for (const ch of GLYPH_CHARS) {
    const g = glyphs[ch]
    if (!g) continue
    const ox = offsets[ch]
    const glyphAttrs = [
      `id="glyph-${escapeAttr(charToken(ch))}"`,
      `data-f7-glyph="${escapeAttr(ch)}"`,
      `data-f7-advance-width="${fmt(g.advanceWidth)}"`,
      `transform="translate(${fmt(ox)}, 0)"`,
    ].join(' ')
    body.push(`  <g ${glyphAttrs}>`)
    for (const shape of g.shapes) {
      body.push('    ' + serializeShape(shape, settings.bezierPresets))
    }
    body.push(`  </g>`)
  }
  body.push(`</g>`)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(viewBoxX)} ${fmt(viewBoxY)} ${fmt(viewBoxW)} ${fmt(viewBoxH)}" ${settingsAttrs}>`,
    body.join('\n'),
    `</svg>`,
    '',
  ].join('\n')
}

function serializeShape(shape: Shape, presets: readonly BezierPreset[]): string {
  const d = shapeToPath(shape, presets)
  const parts = [`<path`, `d="${d}"`, `fill="currentColor"`]
  parts.push(`data-f7-shape-id="${escapeAttr(shape.id)}"`)
  parts.push(`data-f7-points="${pointsToAttr(shape.points)}"`)
  if (shape.bezierRef !== null) {
    parts.push(`data-f7-bezier-ref="${escapeAttr(shape.bezierRef)}"`)
  }
  if (shape.pointBezierRefs && Object.keys(shape.pointBezierRefs).length > 0) {
    parts.push(`data-f7-point-bezier-refs='${escapeAttr(JSON.stringify(shape.pointBezierRefs))}'`)
  }
  if (shape.name) {
    parts.push(`data-f7-name="${escapeAttr(shape.name)}"`)
  }
  parts.push(`/>`)
  return parts.join(' ')
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;')

/** Build a safe ID fragment from a glyph character. Letters/digits pass through; everything else falls back to char code. */
const charToken = (ch: string): string => {
  if (/^[A-Za-z0-9]$/.test(ch)) return ch
  return `u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
}

/**
 * Parse a project SVG (the format `serializeProject` emits) back into an
 * editable project. Throws on malformed XML; tolerates missing metadata by
 * falling back to defaults so partially-edited files still load.
 */
export function parseProject(svgText: string): ParsedProject {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const parserErr = doc.querySelector('parsererror')
  if (parserErr) throw new Error('Malformed SVG')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg') throw new Error('Root element is not <svg>')

  const settings: ProjectSettings = {
    fontName: root.getAttribute('data-f7-font-name') ?? DEFAULT_SETTINGS.fontName,
    unitsPerEm: numAttr(root, 'data-f7-units-per-em', DEFAULT_SETTINGS.unitsPerEm),
    ascender: numAttr(root, 'data-f7-ascender', DEFAULT_SETTINGS.ascender),
    descender: numAttr(root, 'data-f7-descender', DEFAULT_SETTINGS.descender),
    capHeight: numAttr(root, 'data-f7-cap-height', DEFAULT_SETTINGS.capHeight),
    xHeight: numAttr(root, 'data-f7-x-height', DEFAULT_SETTINGS.xHeight),
    bezierPresets:
      parseBezierPresetsAttr(root.getAttribute('data-f7-bezier-presets')) ?? DEFAULT_SETTINGS.bezierPresets,
    snapAngles: parseAngles(root.getAttribute('data-f7-snap-angles')) ?? DEFAULT_SETTINGS.snapAngles,
    gridSize: numAttr(root, 'data-f7-grid-size', DEFAULT_SETTINGS.gridSize),
    gridVisible: root.getAttribute('data-f7-grid-visible') !== '0',
    gridSnap: root.getAttribute('data-f7-grid-snap') === '1',
  }

  const glyphs: Record<string, Glyph> = {}
  for (const ch of GLYPH_CHARS) {
    glyphs[ch] = { char: ch, advanceWidth: 600, shapes: [] }
  }

  const glyphEls = root.querySelectorAll('[data-f7-glyph]')
  for (const el of Array.from(glyphEls)) {
    const ch = el.getAttribute('data-f7-glyph') ?? ''
    if (!glyphs[ch]) continue
    glyphs[ch].advanceWidth = numAttr(el, 'data-f7-advance-width', glyphs[ch].advanceWidth)
    const shapes: Shape[] = []
    const pathEls = el.querySelectorAll('[data-f7-points]')
    for (const p of Array.from(pathEls)) {
      const points = parsePointsAttr(p.getAttribute('data-f7-points'))
      if (points.length === 0) continue
      const id = p.getAttribute('data-f7-shape-id') ?? importShapeId()
      const bezierRef = p.getAttribute('data-f7-bezier-ref')
      const pointBezierRefs = parsePointRefsAttr(p.getAttribute('data-f7-point-bezier-refs'))
      const name = p.getAttribute('data-f7-name') ?? undefined
      shapes.push({
        id,
        points,
        bezierRef: bezierRef && bezierRef.length > 0 ? bezierRef : null,
        pointBezierRefs,
        name,
      })
    }
    glyphs[ch].shapes = shapes
  }

  return { settings, glyphs }
}
