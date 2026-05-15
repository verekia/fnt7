import { Font, Glyph as OTGlyph, Path } from 'opentype.js'

import { GLYPH_CHARS, uppercaseFallbackChar } from '../types'
import { resolveCornerRadius } from './geometry'
import { resolveCornerBezier, shapesWithCorrectedWinding } from './glyph'

import type { BezierPreset, Glyph, ProjectSettings, Shape } from '../types'

/**
 * Build a `opentype.Path` for one shape using the resolved bezier value at
 * each corner. Mirrors `pointsToPath` from geometry.ts, but issues opentype.js
 * path commands (moveTo/lineTo/quadTo/close) instead of returning an SVG `d`.
 *
 * Coordinates are passed through unchanged: opentype.js uses font-design
 * space (y up), which matches our internal convention. `canvasRef` carries
 * `unitsPerEm` so `'relative'` mode resolves against the project em size.
 */
function buildOpentypePath(shape: Shape, presets: readonly BezierPreset[], canvasRef: number): Path {
  const path = new Path()
  const pts = shape.points
  const n = pts.length
  if (n < 3) return path

  interface CornerSeg {
    a: [number, number]
    b: [number, number]
    control: [number, number]
  }
  const corners: CornerSeg[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const spec = resolveCornerBezier(shape, i, presets)
    const inDx = cur[0] - prev[0]
    const inDy = cur[1] - prev[1]
    const inLen = Math.hypot(inDx, inDy) || 1
    const outDx = next[0] - cur[0]
    const outDy = next[1] - cur[1]
    const outLen = Math.hypot(outDx, outDy) || 1
    const radius = resolveCornerRadius(spec, inLen, outLen, canvasRef)
    corners.push({
      a: [cur[0] - (inDx / inLen) * radius, cur[1] - (inDy / inLen) * radius],
      b: [cur[0] + (outDx / outLen) * radius, cur[1] + (outDy / outLen) * radius],
      control: [cur[0], cur[1]],
    })
  }

  path.moveTo(corners[0].b[0], corners[0].b[1])
  for (let i = 1; i < n; i++) {
    const c = corners[i]
    path.lineTo(c.a[0], c.a[1])
    path.quadraticCurveTo(c.control[0], c.control[1], c.b[0], c.b[1])
  }
  const c0 = corners[0]
  path.lineTo(c0.a[0], c0.a[1])
  path.quadraticCurveTo(c0.control[0], c0.control[1], c0.b[0], c0.b[1])
  path.close()
  return path
}

/**
 * Resolve which shapes to draw for `char`. If the lowercase glyph is empty,
 * substitute the uppercase glyph's shapes. Returns null when nothing should
 * be drawn (empty glyph with no fallback) — the output path is still emitted
 * so the font has a valid (empty) glyph entry at that codepoint.
 */
function resolveShapesForExport(
  char: string,
  glyphs: Record<string, Glyph>,
): { shapes: readonly Shape[]; advanceWidth: number } {
  const g = glyphs[char]
  if (!g) return { shapes: [], advanceWidth: 600 }
  if (g.shapes.length > 0) return { shapes: g.shapes, advanceWidth: g.advanceWidth }
  const upper = uppercaseFallbackChar(char)
  if (!upper) return { shapes: [], advanceWidth: g.advanceWidth }
  const source = glyphs[upper]
  if (!source || source.shapes.length === 0) return { shapes: [], advanceWidth: g.advanceWidth }
  return { shapes: source.shapes, advanceWidth: source.advanceWidth }
}

/**
 * Build a complete `opentype.Font` from the project. Includes `.notdef`,
 * space, and the 62 letter/digit glyphs. The lowercase-from-uppercase
 * fallback is baked into the exported font: an undesigned `a` will literally
 * be the same outlines as `A`.
 */
export function buildFont(settings: ProjectSettings, glyphs: Record<string, Glyph>): Font {
  const notdefPath = new Path()
  // .notdef is a simple rectangle outline — standard fallback shape.
  const inset = settings.unitsPerEm * 0.1
  const top = settings.capHeight - inset
  const bot = inset
  notdefPath.moveTo(inset, bot)
  notdefPath.lineTo(settings.unitsPerEm * 0.5 - inset, bot)
  notdefPath.lineTo(settings.unitsPerEm * 0.5 - inset, top)
  notdefPath.lineTo(inset, top)
  notdefPath.close()
  const notdefGlyph = new OTGlyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: Math.round(settings.unitsPerEm * 0.5),
    path: notdefPath,
  })

  const spaceGlyph = new OTGlyph({
    name: 'space',
    unicode: 0x20,
    advanceWidth: Math.round(settings.unitsPerEm * 0.3),
    path: new Path(),
  })

  const allGlyphs: OTGlyph[] = [notdefGlyph, spaceGlyph]
  for (const ch of GLYPH_CHARS) {
    const { shapes, advanceWidth } = resolveShapesForExport(ch, glyphs)
    // Flip winding on nested contours so holes (B/O/A/...) rasterize correctly
    // under the rasterizer's non-zero rule. The visual shape is unchanged.
    const wound = shapesWithCorrectedWinding(shapes)
    const path = new Path()
    for (const shape of wound) {
      const sub = buildOpentypePath(shape, settings.bezierPresets, settings.unitsPerEm)
      // Append sub's commands onto the combined path so a glyph with multiple
      // contours becomes a single Path with multiple sub-paths.
      for (const cmd of sub.commands) path.commands.push(cmd)
    }
    allGlyphs.push(
      new OTGlyph({
        name: ch,
        unicode: ch.charCodeAt(0),
        advanceWidth,
        path,
      }),
    )
  }

  return new Font({
    familyName: settings.fontName || 'Untitled',
    styleName: 'Regular',
    unitsPerEm: settings.unitsPerEm,
    ascender: settings.ascender,
    descender: settings.descender,
    glyphs: allGlyphs,
  })
}

export interface FontBytes {
  filename: string
  bytes: ArrayBuffer
  mime: string
}

const safeFontName = (name: string): string => (name || 'fnt7').replace(/[^A-Za-z0-9_-]+/g, '_')

/**
 * Export the project as an OpenType (CFF) font. opentype.js produces
 * CFF-flavored OTF natively; this is the synchronous emit path. TTF (glyf
 * outlines) remains a follow-up — it requires a cubic→quadratic conversion
 * pass that we haven't written yet.
 */
export function exportOtf(settings: ProjectSettings, glyphs: Record<string, Glyph>): FontBytes {
  const font = buildFont(settings, glyphs)
  const bytes = font.toArrayBuffer()
  return { filename: `${safeFontName(settings.fontName)}.otf`, bytes, mime: 'font/otf' }
}
