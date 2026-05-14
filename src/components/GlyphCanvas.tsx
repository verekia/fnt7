import { useEffect, useRef, useState } from 'react'

import { shapeToPath } from '../lib/glyph'
import { snapToGrid } from '../lib/snap'
import { useStore } from '../store'

import type { Drawing, Glyph, Point, ProjectSettings } from '../types'

const VIEW_PAD = 120

export function GlyphCanvas() {
  const selectedChar = useStore(s => s.selectedGlyph)
  const glyph = useStore(s => s.glyphs[s.selectedGlyph])
  const settings = useStore(s => s.settings)
  const tool = useStore(s => s.tool)
  const drawing = useStore(s => s.drawing)
  const selectedShapeId = useStore(s => s.selectedShapeId)
  const selectedVertex = useStore(s => s.selectedVertexIndex)

  const setDrawing = useStore(s => s.setDrawing)
  const addShape = useStore(s => s.addShape)
  const setSelectedShape = useStore(s => s.setSelectedShape)
  const setSelectedVertex = useStore(s => s.setSelectedVertex)
  const updateShape = useStore(s => s.updateShape)
  const deleteShape = useStore(s => s.deleteShape)
  const setTool = useStore(s => s.setTool)

  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null)
  const [draggingVertex, setDraggingVertex] = useState<{ shapeId: string; index: number } | null>(null)

  const viewBox = computeViewBox(settings)

  // Convert client (px) coordinates to font-design coordinates (y up).
  const clientToFont = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    const u = (clientX - rect.left) / rect.width
    const v = (clientY - rect.top) / rect.height
    const x = viewBox.x + u * viewBox.w
    const y = viewBox.y + v * viewBox.h
    // The root group is scale(1, -1), so screen-y → font-y is negated.
    const fontY = -y
    return settings.gridSnap ? snapToGrid([x, fontY], settings.gridSize) : [x, fontY]
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const p = clientToFont(e.clientX, e.clientY)

    if (tool === 'polygon') {
      if (!drawing) {
        const newDrawing: Drawing = { type: 'polygon', points: [p] }
        setDrawing(newDrawing)
      } else {
        // Click near the starting vertex closes the polygon.
        const first = drawing.points[0]
        const distPx = pixelDistance([first[0], -first[1]], [p[0], -p[1]], viewBox, svgRef.current)
        if (drawing.points.length >= 3 && distPx < 12) {
          finalizePolygon(drawing.points)
        } else {
          setDrawing({ ...drawing, points: [...drawing.points, p] })
        }
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = clientToFont(e.clientX, e.clientY)
    setHoverPoint(p)
    if (draggingVertex) {
      const shape = glyph.shapes.find(s => s.id === draggingVertex.shapeId)
      if (shape) {
        const nextPoints = shape.points.map((pt, i) =>
          i === draggingVertex.index ? (p as readonly [number, number]) : pt,
        )
        updateShape(selectedChar, shape.id, { points: nextPoints })
      }
    }
  }

  const handlePointerUp = () => setDraggingVertex(null)

  const finalizePolygon = (points: readonly Point[]) => {
    if (points.length >= 3) {
      addShape(selectedChar, [...points])
    }
    setDrawing(null)
  }

  // Keyboard shortcuts (when the editor view is mounted).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return

      if (e.key === 'Escape') {
        setDrawing(null)
        setSelectedShape(null)
        setSelectedVertex(null)
        return
      }
      if (e.key === 'Enter') {
        if (drawing && drawing.points.length >= 3) finalizePolygon(drawing.points)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShapeId && selectedVertex === null) {
          deleteShape(selectedChar, selectedShapeId)
          setSelectedShape(null)
          return
        }
        if (selectedShapeId && selectedVertex !== null) {
          const shape = glyph.shapes.find(s => s.id === selectedShapeId)
          if (!shape) return
          if (shape.points.length <= 3) {
            deleteShape(selectedChar, selectedShapeId)
            setSelectedShape(null)
            setSelectedVertex(null)
          } else {
            const nextPoints = shape.points.filter((_, i) => i !== selectedVertex)
            updateShape(selectedChar, selectedShapeId, { points: nextPoints })
            setSelectedVertex(null)
          }
        }
        return
      }
      if (e.key === 'p' || e.key === 'P') {
        setTool('polygon')
      } else if (e.key === 'v' || e.key === 'V') {
        setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const cursorClass = tool === 'select' ? 'tool-select' : ''

  return (
    <div className="canvas-surface relative h-full">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className={`canvas-svg h-full w-full ${cursorClass}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverPoint(null)}
      >
        <g transform="scale(1, -1)">
          <MetricGuides settings={settings} viewBox={viewBox} />
          <SideBearings glyph={glyph} settings={settings} />
          <GlyphShapes glyph={glyph} settings={settings} selectedShapeId={selectedShapeId} onPick={setSelectedShape} />
          {tool === 'select' && (
            <VertexHandles
              glyph={glyph}
              selectedShapeId={selectedShapeId}
              selectedVertex={selectedVertex}
              onPickVertex={(shapeId, idx) => {
                setSelectedShape(shapeId)
                setSelectedVertex(idx)
                setDraggingVertex({ shapeId, index: idx })
              }}
            />
          )}
          {drawing && <DrawingPreview drawing={drawing} hoverPoint={hoverPoint} />}
        </g>
      </svg>
      <div className="text-muted absolute top-2 left-3 text-[11px] tracking-[0.5px] uppercase">
        Glyph: <span className="text-text">{selectedChar}</span>
      </div>
    </div>
  )
}

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

function computeViewBox(settings: ProjectSettings): ViewBox {
  // SVG y-down: top of viewBox = -ascender (after the scale(1,-1) flip).
  return {
    x: -VIEW_PAD,
    y: -settings.ascender - VIEW_PAD,
    w: settings.unitsPerEm + VIEW_PAD * 2,
    h: settings.ascender - settings.descender + VIEW_PAD * 2,
  }
}

function pixelDistance(a: Point, b: Point, viewBox: ViewBox, svg: SVGSVGElement | null): number {
  if (!svg) return Infinity
  const rect = svg.getBoundingClientRect()
  const dx = ((b[0] - a[0]) / viewBox.w) * rect.width
  const dy = ((b[1] - a[1]) / viewBox.h) * rect.height
  return Math.hypot(dx, dy)
}

function MetricGuides({ settings, viewBox }: { settings: ProjectSettings; viewBox: ViewBox }) {
  // Lines are drawn inside the scaled(1,-1) group: y is up, so y=0 is the
  // baseline. Labels are placed via a per-label inner flip — text needs to
  // render right-side-up while still sitting at the metric's font-y.
  const x0 = viewBox.x
  const x1 = viewBox.x + viewBox.w
  const lines: { y: number; label: string; klass?: string }[] = [
    { y: settings.ascender, label: 'asc' },
    { y: settings.capHeight, label: 'cap' },
    { y: settings.xHeight, label: 'x' },
    { y: 0, label: 'baseline', klass: 'baseline' },
    { y: settings.descender, label: 'dsc' },
  ]
  return (
    <g>
      {lines.map(l => (
        <g key={l.label}>
          <line x1={x0} y1={l.y} x2={x1} y2={l.y} className={`metric-line ${l.klass ?? ''}`} />
          <g transform={`translate(0, ${l.y}) scale(1, -1)`}>
            <text x={x0 + 6} y={-4} className="metric-label">
              {l.label} {Math.round(l.y)}
            </text>
          </g>
        </g>
      ))}
    </g>
  )
}

function SideBearings({ glyph, settings }: { glyph: Glyph; settings: ProjectSettings }) {
  const top = settings.ascender
  const bot = settings.descender
  return (
    <g>
      <line x1={0} y1={bot} x2={0} y2={top} className="sidebearing-line" />
      <line x1={glyph.advanceWidth} y1={bot} x2={glyph.advanceWidth} y2={top} className="sidebearing-line" />
    </g>
  )
}

function GlyphShapes({
  glyph,
  settings,
  selectedShapeId,
  onPick,
}: {
  glyph: Glyph
  settings: ProjectSettings
  selectedShapeId: string | null
  onPick: (id: string | null) => void
}) {
  return (
    <g>
      {glyph.shapes.map(s => (
        <path
          key={s.id}
          d={shapeToPath(s, settings.bezierPresets)}
          fill="currentColor"
          fillOpacity={selectedShapeId === s.id ? 0.85 : 0.6}
          stroke={selectedShapeId === s.id ? 'var(--color-accent)' : 'transparent'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="shape-hit"
          onClick={e => {
            e.stopPropagation()
            onPick(s.id)
          }}
        />
      ))}
    </g>
  )
}

function VertexHandles({
  glyph,
  selectedShapeId,
  selectedVertex,
  onPickVertex,
}: {
  glyph: Glyph
  selectedShapeId: string | null
  selectedVertex: number | null
  onPickVertex: (shapeId: string, idx: number) => void
}) {
  return (
    <g>
      {glyph.shapes.map(shape =>
        selectedShapeId === shape.id
          ? shape.points.map((p, i) => (
              <circle
                key={`${shape.id}-${i}`}
                cx={p[0]}
                cy={p[1]}
                r={5}
                className={`vertex-handle ${selectedVertex === i ? 'selected' : ''}`}
                vectorEffect="non-scaling-stroke"
                onPointerDown={e => {
                  e.stopPropagation()
                  onPickVertex(shape.id, i)
                }}
              />
            ))
          : null,
      )}
    </g>
  )
}

function DrawingPreview({ drawing, hoverPoint }: { drawing: Drawing; hoverPoint: Point | null }) {
  const allPoints: Point[] = hoverPoint ? [...drawing.points, hoverPoint] : [...drawing.points]
  const d = allPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  return (
    <g>
      <path d={d} className="preview-shape" />
      {drawing.points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={4} className="preview-vertex" />
      ))}
    </g>
  )
}
