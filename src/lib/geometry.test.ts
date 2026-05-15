import { describe, expect, test } from 'bun:test'

import { bbox, dist, pointsToPath, resolveCornerRadius } from './geometry'

import type { Point } from '../types'

describe('dist', () => {
  test('returns euclidean distance', () => {
    expect(dist([0, 0], [3, 4])).toBe(5)
  })
})

describe('pointsToPath', () => {
  test('returns empty string for no points', () => {
    expect(pointsToPath([], false, 0)).toBe('')
  })

  test('emits a moveTo for a single point', () => {
    expect(pointsToPath([[10, 20]], false, 0)).toBe('M 10 20')
  })

  test('emits straight L segments when bezier is 0', () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ]
    expect(pointsToPath(pts, true, 0)).toBe('M 0 0 L 10 0 L 10 10 Z')
  })

  test('emits Q curves when bezier > 0 and closed', () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const d = pointsToPath(pts, true, 0.5)
    expect(d).toContain('Q')
    expect(d.endsWith('Z')).toBe(true)
  })

  test('per-vertex overrides win over the shape-level bezier', () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    // Shape bezier is 0 (sharp), but vertex 1 has a 1.0 override → at least
    // one Q segment shows up where straight Ls would otherwise be.
    const d = pointsToPath(pts, true, 0, { 1: 1 })
    expect(d).toContain('Q')
  })
})

describe('resolveCornerRadius', () => {
  // Even-length neighbors: cap = 0.5 * min(in, out) = 50.
  test('proportional matches the legacy formula', () => {
    expect(resolveCornerRadius({ mode: 'proportional', value: 0.5 }, 100, 100, 0)).toBe(25)
  })

  test('absolute uses the raw value clamped to the half-min cap', () => {
    expect(resolveCornerRadius({ mode: 'absolute', value: 30 }, 100, 100, 0)).toBe(30)
    // Neighbor cap kicks in.
    expect(resolveCornerRadius({ mode: 'absolute', value: 200 }, 100, 100, 0)).toBe(50)
  })

  test('relative scales the value by canvasRef', () => {
    expect(resolveCornerRadius({ mode: 'relative', value: 0.05 }, 1000, 1000, 1000)).toBe(50)
    // Same fraction, larger canvas → larger radius.
    expect(resolveCornerRadius({ mode: 'relative', value: 0.05 }, 1000, 1000, 2000)).toBe(100)
  })
})

describe('pointsToPath bezier modes', () => {
  // Long thin triangle: short edge is the 10-unit base, long edges are ~100.
  // In proportional mode at t=1 the radius caps at 5 (half the base).
  // In absolute mode at value=50 the same corner still caps at 5.
  const triangle: Point[] = [
    [0, 0],
    [10, 0],
    [5, 100],
  ]
  test('absolute mode clamps oversize radii at the half-min-neighbor cap', () => {
    // At value=1000 every corner is forced past its half-min-neighbor cap, so
    // the result equals the maxed-out proportional path (t=1).
    const dProp = pointsToPath(triangle, true, 1)
    const dAbs = pointsToPath(triangle, true, { mode: 'absolute', value: 1000 })
    expect(dAbs).toBe(dProp)
  })

  test('relative mode emits curves and scales with canvasRef', () => {
    const small = pointsToPath(triangle, true, { mode: 'relative', value: 0.05 }, undefined, 100)
    const big = pointsToPath(triangle, true, { mode: 'relative', value: 0.05 }, undefined, 1000)
    expect(small).toContain('Q')
    expect(big).toContain('Q')
    // Same triangle, same value, different canvas reference → different path.
    expect(small).not.toBe(big)
  })
})

describe('bbox', () => {
  test('returns zeroed bbox for empty input', () => {
    expect(bbox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  test('returns the rectangle hull', () => {
    const pts: Point[] = [
      [10, 20],
      [30, 40],
      [-5, 25],
    ]
    expect(bbox(pts)).toEqual({ x: -5, y: 20, w: 35, h: 20 })
  })
})
