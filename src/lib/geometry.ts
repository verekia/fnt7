import type { Point } from '../types'

export const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1])

export const fmt = (n: number): number => (Number.isFinite(n) ? Number(n.toFixed(3)) : 0)

interface CornerSegments {
  /** Point on the previous edge near `cur`, where the rounding starts. */
  a: Point
  /** Point on the next edge near `cur`, where the rounding ends. */
  b: Point
  /** Control point for a quadratic bezier from `a` to `b`. */
  control: Point
  /** Interior angle at `cur` in degrees, in [0, 180]. */
  interiorAngle: number
}

/**
 * Build the rounded-corner segments at a vertex. The curve always bulges
 * TOWARD the vertex (a classic fillet), regardless of interior angle or
 * polygon orientation. Verbatim port of VCT7's `corner` — sharing the same
 * geometry primitive keeps both editors visually identical at a given `t`.
 */
export function corner(prev: Point, cur: Point, next: Point, t: number): CornerSegments {
  const inDx = cur[0] - prev[0]
  const inDy = cur[1] - prev[1]
  const inLen = Math.hypot(inDx, inDy) || 1
  const outDx = next[0] - cur[0]
  const outDy = next[1] - cur[1]
  const outLen = Math.hypot(outDx, outDy) || 1

  const radius = Math.max(0, Math.min(1, t)) * 0.5 * Math.min(inLen, outLen)

  const a: Point = [cur[0] - (inDx / inLen) * radius, cur[1] - (inDy / inLen) * radius]
  const b: Point = [cur[0] + (outDx / outLen) * radius, cur[1] + (outDy / outLen) * radius]

  const inUx = -inDx / inLen
  const inUy = -inDy / inLen
  const outUx = outDx / outLen
  const outUy = outDy / outLen
  const cosInterior = Math.max(-1, Math.min(1, inUx * outUx + inUy * outUy))
  const interiorAngle = Math.acos(cosInterior) * (180 / Math.PI)

  return { a, b, control: cur, interiorAngle }
}

/**
 * Render a polyline (or polygon) as an SVG `d` attribute, with corners rounded
 * by `bezier` ∈ [0, 1]. 0 produces straight `L` segments only.
 *
 * `perPointBezier` is an optional sparse override per vertex index — wins over
 * the shape-level `bezier` for that single corner. Out-of-range or undefined
 * entries fall through to `bezier`.
 */
export function pointsToPath(
  points: Point[],
  closed: boolean,
  bezier: number,
  perPointBezier?: { readonly [k: number]: number | undefined },
): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M ${fmt(x)} ${fmt(y)}`
  }

  const baseT = Math.max(0, Math.min(1, bezier || 0))
  const n = points.length
  const cornerT = (i: number): number => {
    const ov = perPointBezier?.[i]
    if (ov === undefined) return baseT
    return Math.max(0, Math.min(1, ov))
  }

  let anyCurve = baseT > 0
  if (!anyCurve && perPointBezier) {
    for (let i = 0; i < n; i++) {
      const ov = perPointBezier[i]
      if (ov !== undefined && ov > 0) {
        anyCurve = true
        break
      }
    }
  }
  if (!anyCurve) {
    let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`
    for (let i = 1; i < n; i++) {
      d += ` L ${fmt(points[i][0])} ${fmt(points[i][1])}`
    }
    if (closed) d += ' Z'
    return d
  }

  if (closed && n >= 3) {
    const corners: CornerSegments[] = []
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n]
      const cur = points[i]
      const next = points[(i + 1) % n]
      corners.push(corner(prev, cur, next, cornerT(i)))
    }
    let d = `M ${fmt(corners[0].b[0])} ${fmt(corners[0].b[1])}`
    for (let i = 1; i < n; i++) {
      const c = corners[i]
      d += ` L ${fmt(c.a[0])} ${fmt(c.a[1])}`
      d += ` Q ${fmt(c.control[0])} ${fmt(c.control[1])} ${fmt(c.b[0])} ${fmt(c.b[1])}`
    }
    const c0 = corners[0]
    d += ` L ${fmt(c0.a[0])} ${fmt(c0.a[1])}`
    d += ` Q ${fmt(c0.control[0])} ${fmt(c0.control[1])} ${fmt(c0.b[0])} ${fmt(c0.b[1])}`
    d += ' Z'
    return d
  }

  let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`
  for (let i = 1; i < n - 1; i++) {
    const c = corner(points[i - 1], points[i], points[i + 1], cornerT(i))
    d += ` L ${fmt(c.a[0])} ${fmt(c.a[1])}`
    d += ` Q ${fmt(c.control[0])} ${fmt(c.control[1])} ${fmt(c.b[0])} ${fmt(c.b[1])}`
  }
  d += ` L ${fmt(points[n - 1][0])} ${fmt(points[n - 1][1])}`
  if (closed) d += ' Z'
  return d
}

export function bbox(points: Point[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
