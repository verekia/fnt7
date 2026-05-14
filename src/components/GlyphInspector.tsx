import { glyphBBox } from '../lib/glyph'
import { useStore } from '../store'

import type { BezierPreset, Glyph, Shape } from '../types'

export function GlyphInspector() {
  const glyph = useStore(s => s.glyphs[s.selectedGlyph])
  const viewMode = useStore(s => s.viewMode)

  if (viewMode === 'text') {
    return (
      <div className="px-3.5 pt-3.5">
        <p className="text-muted-2 text-[10px] tracking-[0.4px] uppercase">Inspector hidden in text mode</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-3.5 pt-3.5">
      <GlyphSection glyph={glyph} />
      <ShapesSection glyph={glyph} />
    </div>
  )
}

function GlyphSection({ glyph }: { glyph: Glyph }) {
  const updateGlyph = useStore(s => s.updateGlyph)
  const bb = glyphBBox(glyph.shapes)
  const lsb = bb ? Math.round(bb.x) : '—'
  const rsb = bb ? Math.round(glyph.advanceWidth - (bb.x + bb.w)) : '—'

  return (
    <section>
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Glyph “{glyph.char}”</span>
      </h2>
      <label>
        <span>Advance width</span>
        <input
          type="number"
          value={glyph.advanceWidth}
          onChange={e => {
            const n = parseFloat(e.target.value)
            if (Number.isFinite(n)) updateGlyph(glyph.char, { advanceWidth: Math.max(0, n) })
          }}
        />
      </label>
      <div className="text-muted-2 grid grid-cols-2 gap-1 text-[10px] tracking-[0.3px]">
        <div>
          LSB <span className="text-muted">{lsb}</span>
        </div>
        <div>
          RSB <span className="text-muted">{rsb}</span>
        </div>
      </div>
      <p className="text-muted-2 mt-2 text-[10px] leading-[1.5] tracking-[0.4px]">
        Side bearings are derived from the artwork bbox versus the advance width.
      </p>
    </section>
  )
}

function ShapesSection({ glyph }: { glyph: Glyph }) {
  const selectedShapeId = useStore(s => s.selectedShapeId)
  const selectedVertex = useStore(s => s.selectedVertexIndex)
  const presets = useStore(s => s.settings.bezierPresets)
  const setShapeBezierRef = useStore(s => s.setShapeBezierRef)
  const setVertexBezierRef = useStore(s => s.setVertexBezierRef)
  const setSelectedShape = useStore(s => s.setSelectedShape)
  const setSelectedVertex = useStore(s => s.setSelectedVertex)

  if (glyph.shapes.length === 0) {
    return (
      <section>
        <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
          <span className="ml-1">Contours</span>
        </h2>
        <p className="text-muted-2 text-[10px] tracking-[0.4px]">
          No contours yet. Switch to Glyph view and pick the Polygon tool to draw one.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Contours</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {glyph.shapes.map((shape, i) => {
          const isSelected = shape.id === selectedShapeId
          return (
            <li key={shape.id} className={`bg-bg-0 border p-2 ${isSelected ? 'border-accent' : 'border-line'}`}>
              <button
                type="button"
                className="text-muted mb-1.5 w-full px-0 text-left text-[10px] tracking-[0.4px] uppercase"
                onClick={() => setSelectedShape(isSelected ? null : shape.id)}
              >
                Contour {i + 1} {isSelected ? '·' : ''}
              </button>
              <ShapeBezierRow
                shape={shape}
                presets={presets}
                onChange={ref => setShapeBezierRef(glyph.char, shape.id, ref)}
              />
              {isSelected && (
                <VertexList
                  shape={shape}
                  presets={presets}
                  selectedVertex={selectedVertex}
                  onPick={idx => setSelectedVertex(idx)}
                  onChange={(idx, ref) => setVertexBezierRef(glyph.char, shape.id, idx, ref)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const INHERIT = '__inherit__'

function ShapeBezierRow({
  shape,
  presets,
  onChange,
}: {
  shape: Shape
  presets: readonly BezierPreset[]
  onChange: (ref: string | null) => void
}) {
  const current = shape.bezierRef ?? INHERIT
  return (
    <label className="mb-0">
      <span>Bezier</span>
      <select
        value={current}
        onChange={e => {
          const v = e.target.value
          onChange(v === INHERIT ? null : v)
        }}
      >
        <option value={INHERIT}>Default ({presets[0]?.name ?? '—'})</option>
        {presets.map(p => (
          <option key={p.name} value={p.name}>
            {p.name} ({p.value.toFixed(2)})
          </option>
        ))}
      </select>
    </label>
  )
}

function VertexList({
  shape,
  presets,
  selectedVertex,
  onPick,
  onChange,
}: {
  shape: Shape
  presets: readonly BezierPreset[]
  selectedVertex: number | null
  onPick: (idx: number) => void
  onChange: (idx: number, ref: string | null) => void
}) {
  return (
    <div className="mt-2 border-t border-[var(--color-line)] pt-2">
      <p className="text-muted-2 mb-1 text-[9px] tracking-[0.4px] uppercase">Vertices</p>
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {shape.points.map((p, i) => {
          const ref = shape.pointBezierRefs?.[i]
          const value = ref ?? INHERIT
          const isSelected = selectedVertex === i
          return (
            <li key={i} className={`flex items-center gap-2 px-1 py-0.5 ${isSelected ? 'bg-bg-2' : ''}`}>
              <button type="button" className="text-muted px-0 py-0 font-mono text-[10px]" onClick={() => onPick(i)}>
                {i.toString().padStart(2, '0')}
              </button>
              <span className="text-muted-2 font-mono text-[10px]">
                {Math.round(p[0])}, {Math.round(p[1])}
              </span>
              <select
                className="ml-auto !w-auto !py-0.5"
                value={value}
                onChange={e => onChange(i, e.target.value === INHERIT ? null : e.target.value)}
              >
                <option value={INHERIT}>—</option>
                {presets.map(preset => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
