export type Point = readonly [number, number]

export type Tool = 'select' | 'line' | 'polygon' | 'circle'

export type ViewMode = 'grid' | 'single' | 'text'

/**
 * The 62 user-designable characters. Order matters — it's the order they appear
 * in the grid view. Space + `.notdef` are emitted at export time but are not
 * user-editable in the canvas.
 */
export const GLYPH_CHARS: readonly string[] = (() => {
  const upper = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
  const lower = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i))
  const digits = Array.from({ length: 10 }, (_, i) => String.fromCharCode(48 + i))
  return [...upper, ...lower, ...digits]
})()

/** Returns the uppercase counterpart for `a-z`, otherwise undefined. */
export const uppercaseFallbackChar = (ch: string): string | undefined =>
  ch.length === 1 && ch >= 'a' && ch <= 'z' ? ch.toUpperCase() : undefined

/**
 * A named bezier rounding value, shared across every glyph in the project.
 * Shapes and individual vertices reference a preset by `name` — when the user
 * tweaks a preset, every vertex referencing it visibly updates everywhere.
 *
 * The first preset in `ProjectSettings.bezierPresets` is the implicit default
 * for shapes / vertices that don't override.
 */
export interface BezierPreset {
  /** Unique identifier. Display name and reference key. */
  name: string
  /** Corner rounding amount, 0..1. Same semantics as VCT7's `bezier`. */
  value: number
}

/**
 * One closed contour within a glyph (outer outline of "B" is one shape, the
 * two counters are two more). All glyph contours are closed by construction —
 * fonts have no concept of open polylines.
 *
 * Points are in font-design space: x right, y **up**, baseline at y=0. The
 * canvas and SVG export flip y for display; internal data is never flipped.
 */
export interface Shape {
  id: string
  kind?: 'path' | 'circle'
  points: Point[]
  /**
   * Reference to a `BezierPreset` by name, applied to every corner that does
   * not have its own per-vertex override. `null` means "inherit project default"
   * (which is `bezierPresets[0]`).
   */
  bezierRef: string | null
  /**
   * Sparse per-vertex preset refs (`pointIndex → presetName`). Wins over the
   * shape's `bezierRef` and the project default at that corner.
   */
  pointBezierRefs?: Record<number, string>
  /** User-supplied display name. Empty / undefined falls back to "contour". */
  name?: string
}

/**
 * One character's design. `shapes` is empty for glyphs the user hasn't
 * authored yet. For `a-z` with empty `shapes`, rendering falls back to the
 * matching `A-Z` glyph (see {@link resolveGlyphShapes}).
 *
 * `advanceWidth` is in font units (same coord system as `points`). Side
 * bearings are derived from the contour bbox at render time — we store the
 * advance and let the artwork bbox define LSB/RSB.
 */
export interface Glyph {
  /** Single Latin character (one of {@link GLYPH_CHARS}). */
  char: string
  /** Width the cursor advances after rendering this glyph, in font units. */
  advanceWidth: number
  shapes: Shape[]
}

export interface ProjectSettings {
  /** Font family name written into the exported TTF/OTF's `name` table. */
  fontName: string
  /** Units per em. Industry standard is 1000 (PostScript) or 1024/2048 (TrueType). */
  unitsPerEm: number
  /** Top of the tallest character (e.g. h, l, k). */
  ascender: number
  /** Bottom of letters like g, j, p (typically negative). */
  descender: number
  /** Top of capital letters (A, B, C). */
  capHeight: number
  /** Top of lowercase letters (x, n, o). */
  xHeight: number
  /**
   * Named bezier rounding presets, shared across the whole font. The first
   * entry is the implicit default. Names must be unique and non-empty.
   */
  bezierPresets: BezierPreset[]
  /** Allowed snap angles in degrees. Empty array disables snapping. */
  snapAngles: number[]
  /** Grid spacing in font units. Must be > 0. */
  gridSize: number
  gridVisible: boolean
  gridSnap: boolean
}

/** Project default ascender / descender / etc. used by `newProject()`. */
export const DEFAULT_METRICS = {
  unitsPerEm: 1000,
  ascender: 750,
  descender: -200,
  capHeight: 700,
  xHeight: 500,
  defaultAdvanceWidth: 600,
} as const

export interface ViewState {
  x: number
  y: number
  scale: number
}

/**
 * Single-glyph-canvas overlay: render a second glyph on top of (or below) the
 * one being edited, tinted with the app accent color at a chosen opacity.
 * Useful for tracing related glyphs (B over P, b over h) or for sanity-checking
 * a derived glyph against its source.
 */
export interface OverlayState {
  /** Which glyph to overlay (character from `GLYPH_CHARS`), or null = off. */
  char: string | null
  /** Whether the overlay paints above or below the active glyph. */
  layer: 'above' | 'below'
  /** Render as a solid fill or as an outline-only stroke. */
  style: 'fill' | 'stroke'
  /** 0..1; applied via the SVG element's `opacity` attribute. */
  opacity: number
}

/** Active drawing in progress (polygon/line vertices being placed). */
export interface Drawing {
  type: 'line' | 'polygon' | 'circle'
  points: Point[]
}
