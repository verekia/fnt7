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
