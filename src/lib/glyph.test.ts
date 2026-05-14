import { describe, expect, test } from 'bun:test'

import { resolveCornerBezier, resolveGlyphShapes } from './glyph'

import type { BezierPreset, Glyph, Shape } from '../types'

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
    expect(resolveCornerBezier(baseShape(), 0, presets)).toBe(0.5)
  })

  test('uses the shape-level ref when present', () => {
    expect(resolveCornerBezier(baseShape({ bezierRef: 'sharp' }), 0, presets)).toBe(0.1)
  })

  test('per-vertex ref wins over the shape ref', () => {
    const shape = baseShape({ bezierRef: 'sharp', pointBezierRefs: { 1: 'round' } })
    expect(resolveCornerBezier(shape, 1, presets)).toBe(0.9)
    // Other corners still pick up the shape-level ref.
    expect(resolveCornerBezier(shape, 0, presets)).toBe(0.1)
  })

  test('missing ref falls back to the project default', () => {
    const shape = baseShape({ bezierRef: 'nonexistent' })
    expect(resolveCornerBezier(shape, 0, presets)).toBe(0.5)
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
