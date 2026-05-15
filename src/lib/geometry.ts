import type { BezierMode, Point } from '../types'

export const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1])

export const fmt = (n: number): number => (Number.isFinite(n) ? Number(n.toFixed(3)) : 0)

/** Resolved corner-rounding spec: mode tells how `value` becomes a radius. */
export interface BezierSpec {
  mode: BezierMode
  value: number
}

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
 * Convert a `BezierSpec` into the *target* corner radius in font units, then
 * clamp at half the shorter neighboring edge so adjacent corners can't overlap.
 *
 * - `proportional`: clamp(value, 0, 1) × 0.5 × min(inLen, outLen) — the legacy
 *   behavior, equivalent to passing a raw `t` to `corner`.
 * - `absolute`: max(0, value) directly in font units.
 * - `relative`: max(0, value) × `canvasRef`, where `canvasRef` is typically
 *   `unitsPerEm`.
 */
export function resolveCornerRadius(spec: BezierSpec, inLen: number, outLen: number, canvasRef: number): number {
  const cap = 0.5 * Math.min(inLen, outLen)
  let raw: number
  if (spec.mode === 'absolute') raw = Math.max(0, spec.value)
  else if (spec.mode === 'relative') raw = Math.max(0, spec.value) * Math.max(0, canvasRef)
  else raw = Math.max(0, Math.min(1, spec.value)) * cap
  return Math.min(raw, cap)
}

const asSpec = (v: number | BezierSpec): BezierSpec => (typeof v === 'number' ? { mode: 'proportional', value: v } : v)

/**
 * Build the rounded-corner segments at a vertex. The curve always bulges
 * TOWARD the vertex (a classic fillet), regardless of interior angle or
 * polygon orientation. Verbatim port of VCT7's `corner` — sharing the same
 * geometry primitive keeps both editors visually identical at a given `t`.
 *
 * `t` may be a raw proportional value (legacy `number` form) or a
 * `BezierSpec`. For spec form `'relative'` mode, `canvasRef` is required —
 * pass `0` and the relative radius collapses to zero.
 */
export function corner(prev: Point, cur: Point, next: Point, t: number | BezierSpec, canvasRef = 0): CornerSegments {
  const inDx = cur[0] - prev[0]
  const inDy = cur[1] - prev[1]
  const inLen = Math.hypot(inDx, inDy) || 1
  const outDx = next[0] - cur[0]
  const outDy = next[1] - cur[1]
  const outLen = Math.hypot(outDx, outDy) || 1

  const radius = resolveCornerRadius(asSpec(t), inLen, outLen, canvasRef)

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

type BezierInput = number | BezierSpec
type PerPointBezier = { readonly [k: number]: BezierInput | undefined }

const isNonZero = (s: BezierSpec): boolean => s.value > 0

/**
 * Render a polyline (or polygon) as an SVG `d` attribute, with corners rounded
 * by `bezier`. The legacy `number` form is interpreted as a proportional
 * value ∈ [0, 1]; pass a `BezierSpec` for absolute / relative modes.
 *
 * `perPointBezier` is an optional sparse override per vertex index — wins over
 * the shape-level `bezier` for that single corner. `canvasRef` is required for
 * the `'relative'` mode (typically `unitsPerEm`); it's ignored by the other
 * modes.
 */
export function pointsToPath(
  points: Point[],
  closed: boolean,
  bezier: BezierInput,
  perPointBezier?: PerPointBezier,
  canvasRef = 0,
): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M ${fmt(x)} ${fmt(y)}`
  }

  const baseSpec = asSpec(bezier || 0)
  const n = points.length
  const cornerSpec = (i: number): BezierSpec => {
    const ov = perPointBezier?.[i]
    return ov === undefined ? baseSpec : asSpec(ov)
  }

  let anyCurve = isNonZero(baseSpec)
  if (!anyCurve && perPointBezier) {
    for (let i = 0; i < n; i++) {
      const ov = perPointBezier[i]
      if (ov !== undefined && isNonZero(asSpec(ov))) {
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
      corners.push(corner(prev, cur, next, cornerSpec(i), canvasRef))
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
    const c = corner(points[i - 1], points[i], points[i + 1], cornerSpec(i), canvasRef)
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
