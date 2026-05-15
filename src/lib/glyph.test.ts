import { describe, expect, test } from 'bun:test'

import {
  contourDepths,
  pointInPolygon,
  resolveCornerBezier,
  resolveGlyphShapes,
  shapesWithCorrectedWinding,
  signedArea,
} from './glyph'

import type { BezierPreset, Glyph, Point, Shape } from '../types'

const presets: BezierPreset[] = [
  { name: 'default', value: 0.5 },
  { name: 'sharp', value: 0.1 },
  { name: 'round', value: 0.9 },
]

const baseShape = (overrides: Partial<Shape> = {}): Shape => ({
  id: 's1',
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
  bezierRef: null,
  ...overrides,
})

describe('resolveCornerBezier', () => {
  test('falls back to the project default when no override is set', () => {
    expect(resolveCornerBezier(baseShape(), 0, presets)).toEqual({ mode: 'proportional', value: 0.5 })
  })

  test('uses the shape-level ref when present', () => {
    expect(resolveCornerBezier(baseShape({ bezierRef: 'sharp' }), 0, presets)).toEqual({
      mode: 'proportional',
      value: 0.1,
    })
  })

  test('per-vertex ref wins over the shape ref', () => {
    const shape = baseShape({ bezierRef: 'sharp', pointBezierRefs: { 1: 'round' } })
    expect(resolveCornerBezier(shape, 1, presets).value).toBe(0.9)
    // Other corners still pick up the shape-level ref.
    expect(resolveCornerBezier(shape, 0, presets).value).toBe(0.1)
  })

  test('missing ref falls back to the project default', () => {
    const shape = baseShape({ bezierRef: 'nonexistent' })
    expect(resolveCornerBezier(shape, 0, presets).value).toBe(0.5)
  })

  test('carries the preset mode through resolution', () => {
    const withModes: BezierPreset[] = [
      { name: 'default', value: 0.5 },
      { name: 'abs50', value: 50, mode: 'absolute' },
      { name: 'rel5', value: 0.05, mode: 'relative' },
    ]
    expect(resolveCornerBezier(baseShape({ bezierRef: 'abs50' }), 0, withModes)).toEqual({
      mode: 'absolute',
      value: 50,
    })
    expect(resolveCornerBezier(baseShape({ bezierRef: 'rel5' }), 0, withModes)).toEqual({
      mode: 'relative',
      value: 0.05,
    })
  })
})

describe('resolveGlyphShapes', () => {
  const aGlyph: Glyph = { char: 'A', advanceWidth: 600, shapes: [baseShape()] }

  test('returns its own shapes when present', () => {
    const out = resolveGlyphShapes(aGlyph, { A: aGlyph })
    expect(out).toBe(aGlyph.shapes)
  })

  test('lowercase falls back to its uppercase counterpart', () => {
    const lower: Glyph = { char: 'a', advanceWidth: 600, shapes: [] }
    const all = { A: aGlyph, a: lower }
    const out = resolveGlyphShapes(lower, all)
    expect(out).toBe(aGlyph.shapes)
  })

  test('uppercase glyphs do not fall back', () => {
    const empty: Glyph = { char: 'A', advanceWidth: 600, shapes: [] }
    const out = resolveGlyphShapes(empty, { A: empty })
    expect(out).toBe(empty.shapes)
  })

  test('lowercase stays empty when uppercase is also empty', () => {
    const lower: Glyph = { char: 'a', advanceWidth: 600, shapes: [] }
    const upperEmpty: Glyph = { char: 'A', advanceWidth: 600, shapes: [] }
    const out = resolveGlyphShapes(lower, { a: lower, A: upperEmpty })
    expect(out).toBe(lower.shapes)
  })
})

describe('signedArea', () => {
  test('returns positive area for a CCW polygon in y-up coords', () => {
    const ccw: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    expect(signedArea(ccw)).toBe(100)
  })

  test('returns negative area for a CW polygon', () => {
    const cw: Point[] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ]
    expect(signedArea(cw)).toBe(-100)
  })
})

describe('pointInPolygon', () => {
  const square: Point[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]

  test('returns true for a point inside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true)
  })

  test('returns false for a point outside', () => {
    expect(pointInPolygon([20, 5], square)).toBe(false)
  })
})

describe('contourDepths', () => {
  test('returns 0 for a single contour', () => {
    const outer: Shape = baseShape({ points: square(0, 0, 100) })
    expect(contourDepths([outer])).toEqual([0])
  })

  test('finds the nested contour at depth 1', () => {
    const outer: Shape = baseShape({ id: 'a', points: square(0, 0, 100) })
    const hole: Shape = baseShape({ id: 'b', points: square(30, 30, 40) })
    expect(contourDepths([outer, hole])).toEqual([0, 1])
  })

  test('handles two siblings inside one parent', () => {
    const outer: Shape = baseShape({ id: 'a', points: square(0, 0, 100) })
    const h1: Shape = baseShape({ id: 'b', points: square(10, 10, 20) })
    const h2: Shape = baseShape({ id: 'c', points: square(60, 60, 20) })
    expect(contourDepths([outer, h1, h2])).toEqual([0, 1, 1])
  })
})

describe('shapesWithCorrectedWinding', () => {
  test('reverses the nested contour when its winding matches the outer', () => {
    // Both drawn CCW (positive signed area): outer is the reference, the inner
    // needs to flip so the OTF rasterizer reads it as a hole.
    const outer: Shape = baseShape({ id: 'a', points: square(0, 0, 100) })
    const inner: Shape = baseShape({ id: 'b', points: square(30, 30, 40) })
    expect(signedArea(outer.points)).toBeGreaterThan(0)
    expect(signedArea(inner.points)).toBeGreaterThan(0)
    const fixed = shapesWithCorrectedWinding([outer, inner])
    expect(signedArea(fixed[0].points)).toBeGreaterThan(0)
    expect(signedArea(fixed[1].points)).toBeLessThan(0)
  })

  test('keeps already-correct winding unchanged', () => {
    const outer: Shape = baseShape({ id: 'a', points: square(0, 0, 100) })
    // Inner drawn CW already.
    const innerCW: Shape = baseShape({
      id: 'b',
      points: [
        [30, 30],
        [30, 70],
        [70, 70],
        [70, 30],
      ],
    })
    const fixed = shapesWithCorrectedWinding([outer, innerCW])
    expect(fixed[0].points).toBe(outer.points)
    expect(fixed[1].points).toBe(innerCW.points)
  })

  test('rewrites pointBezierRefs when the contour is reversed', () => {
    const inner: Shape = baseShape({
      id: 'b',
      points: square(30, 30, 40),
      pointBezierRefs: { 0: 'sharp' },
    })
    const outer: Shape = baseShape({ id: 'a', points: square(0, 0, 100) })
    const fixed = shapesWithCorrectedWinding([outer, inner])
    // After reversal the original index 0 lands at index n-1.
    expect(fixed[1].pointBezierRefs).toEqual({ 3: 'sharp' })
  })
})

function square(x: number, y: number, size: number): Point[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ]
}
