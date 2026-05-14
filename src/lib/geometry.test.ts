import { describe, expect, test } from 'bun:test'

import { bbox, dist, pointsToPath } from './geometry'

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
