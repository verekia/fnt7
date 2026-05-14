import { uppercaseFallbackChar } from '../types'
import { bbox, pointsToPath } from './geometry'

import type { BezierPreset, Glyph, Point, ProjectSettings, Shape } from '../types'

/**
 * Resolve the bezier value for a single corner, walking the
 * vertex → shape → project-default precedence chain.
 *
 * Returns 0 if the resolved preset is missing — a defensive fallback that
 * preserves geometry rather than throwing when a file has been edited
 * externally and references a preset that no longer exists.
 */
export function resolveCornerBezier(shape: Shape, vertexIndex: number, presets: readonly BezierPreset[]): number {
  const presetByName = (name: string): number | undefined => presets.find(p => p.name === name)?.value
  const vRef = shape.pointBezierRefs?.[vertexIndex]
  if (vRef !== undefined) {
    const v = presetByName(vRef)
    if (v !== undefined) return v
  }
  if (shape.bezierRef !== null) {
    const v = presetByName(shape.bezierRef)
    if (v !== undefined) return v
  }
  return presets[0]?.value ?? 0
}

/**
 * Build the per-vertex bezier map a shape needs to feed `pointsToPath`. The
 * shape-level ref is rolled into a flat `value` if it differs from the project
 * default; this lets `pointsToPath` treat all corners uniformly.
 */
function buildPerPointBezier(shape: Shape, presets: readonly BezierPreset[]): Record<number, number> {
  const out: Record<number, number> = {}
  for (let i = 0; i < shape.points.length; i++) {
    out[i] = resolveCornerBezier(shape, i, presets)
  }
  return out
}

/** Render one shape to an SVG path `d` using the project's preset list. */
export function shapeToPath(shape: Shape, presets: readonly BezierPreset[]): string {
  const baseRefName = shape.bezierRef ?? presets[0]?.name
  const baseValue = (baseRefName ? presets.find(p => p.name === baseRefName)?.value : presets[0]?.value) ?? 0
  const perPoint = buildPerPointBezier(shape, presets)
  return pointsToPath(shape.points, true, baseValue, perPoint)
}

/**
 * Concatenate every contour of a glyph into one `d` attribute. Combined with
 * `fill-rule="evenodd"` this gives correct hole rendering for any winding
 * direction the user drew the contours in: stacked closed paths subtract.
 */
export function glyphCombinedPath(shapes: readonly Shape[], presets: readonly BezierPreset[]): string {
  return shapes.map(s => shapeToPath(s, presets)).join(' ')
}

/**
 * Signed area of a polygon in font-design coords (y up). Positive = CCW,
 * negative = CW. Uses the shoelace formula on the raw vertices — corner
 * rounding doesn't change the winding direction, so we can ignore the bezier
 * sub-paths and operate on the polygon hull.
 */
export function signedArea(points: readonly Point[]): number {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % n]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

/**
 * Standard ray-casting point-in-polygon test. Returns true if `point` is
 * strictly inside the polygon defined by `polygon`. Points on the boundary
 * are unspecified — fine for our use (we test contour anchor points which
 * sit on their own outline, not on the parent's outline).
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  const [x, y] = point
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Nesting depth of each contour in a glyph: depth 0 is outermost, depth 1 is
 * inside one parent, etc. Used to decide which contours need their winding
 * direction flipped for the OTF export (rasterizers use the non-zero rule, so
 * holes only render when nested contours are wound opposite to their parent).
 */
export function contourDepths(shapes: readonly Shape[]): number[] {
  return shapes.map((s, i) => {
    if (s.points.length < 3) return 0
    const probe = s.points[0]
    let depth = 0
    for (let j = 0; j < shapes.length; j++) {
      if (j === i) continue
      const other = shapes[j]
      if (other.points.length < 3) continue
      if (pointInPolygon(probe, other.points)) depth++
    }
    return depth
  })
}

/**
 * Return a copy of `shapes` with vertex order reversed on contours whose
 * winding doesn't match the alternating pattern required for OTF holes:
 * even-depth contours share one sign, odd-depth contours the opposite. The
 * visual shape is unchanged — corner rounding is symmetric — only the
 * traversal direction flips.
 */
export function shapesWithCorrectedWinding(shapes: readonly Shape[]): Shape[] {
  if (shapes.length === 0) return []
  const depths = contourDepths(shapes)
  // Baseline: keep the first contour's winding sign; everything else aligns
  // to the alternating-by-depth pattern relative to it.
  const baseSign = Math.sign(signedArea(shapes[0].points)) || 1
  return shapes.map((s, i) => {
    if (s.points.length < 3) return s
    const want = depths[i] % 2 === 0 ? baseSign : -baseSign
    const actual = Math.sign(signedArea(s.points)) || 1
    if (want === actual) return s
    return reverseShape(s)
  })
}

function reverseShape(shape: Shape): Shape {
  const n = shape.points.length
  const points = shape.points.slice().reverse()
  let pointBezierRefs: Record<number, string> | undefined
  if (shape.pointBezierRefs) {
    pointBezierRefs = {}
    for (const [k, v] of Object.entries(shape.pointBezierRefs)) {
      const idx = Number(k)
      pointBezierRefs[n - 1 - idx] = v
    }
  }
  return { ...shape, points, pointBezierRefs }
}

/**
 * Return the shapes that should render for `glyph`. If the glyph is lowercase
 * `a-z` and has no shapes of its own, fall back to the matching `A-Z` glyph's
 * shapes. Returns the original shapes (referentially) when no fallback applies,
 * so callers can use referential equality to detect "designed vs fallback".
 */
export function resolveGlyphShapes(glyph: Glyph, glyphsByChar: Readonly<Record<string, Glyph>>): readonly Shape[] {
  if (glyph.shapes.length > 0) return glyph.shapes
  const upper = uppercaseFallbackChar(glyph.char)
  if (!upper) return glyph.shapes
  const source = glyphsByChar[upper]
  if (!source || source.shapes.length === 0) return glyph.shapes
  return source.shapes
}

/** Same logic as `resolveGlyphShapes` but also returns the advance width. */
export function resolveGlyphRender(
  glyph: Glyph,
  glyphsByChar: Readonly<Record<string, Glyph>>,
): { shapes: readonly Shape[]; advanceWidth: number; isFallback: boolean } {
  if (glyph.shapes.length > 0) {
    return { shapes: glyph.shapes, advanceWidth: glyph.advanceWidth, isFallback: false }
  }
  const upper = uppercaseFallbackChar(glyph.char)
  if (!upper) return { shapes: glyph.shapes, advanceWidth: glyph.advanceWidth, isFallback: false }
  const source = glyphsByChar[upper]
  if (!source || source.shapes.length === 0) {
    return { shapes: glyph.shapes, advanceWidth: glyph.advanceWidth, isFallback: false }
  }
  return { shapes: source.shapes, advanceWidth: source.advanceWidth, isFallback: true }
}

/** Bounding box across all shapes in a glyph, in font coords. Empty → null. */
export function glyphBBox(shapes: readonly Shape[]): { x: number; y: number; w: number; h: number } | null {
  if (shapes.length === 0) return null
  const all: Point[] = []
  for (const s of shapes) all.push(...s.points)
  if (all.length === 0) return null
  return bbox(all)
}

/** Vertical span for the SVG viewBox in *render* (y-down) space. */
export function projectVerticalSpan(settings: ProjectSettings): { top: number; height: number } {
  return {
    top: -settings.ascender,
    height: settings.ascender - settings.descender,
  }
}
