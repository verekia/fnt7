import { useEffect, useRef, useState } from 'react'

import { glyphCombinedPath, resolveGlyphRender, shapeToPath } from '../lib/glyph'
import { snapToGrid } from '../lib/snap'
import { useStore } from '../store'

import type { BezierPreset, Drawing, Glyph, OverlayState, Point, ProjectSettings } from '../types'

const VIEW_PAD = 120

export function GlyphCanvas() {
  const selectedChar = useStore(s => s.selectedGlyph)
  const glyph = useStore(s => s.glyphs[s.selectedGlyph])
  const allGlyphs = useStore(s => s.glyphs)
  const settings = useStore(s => s.settings)
  const tool = useStore(s => s.tool)
  const drawing = useStore(s => s.drawing)
  const overlay = useStore(s => s.overlay)
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
  // Shape-level drag state: original points + the cursor position where the
  // drag started, both in font coords. We delta the whole contour by
  // (currentCursor - startCursor) on every move so the contour follows the
  // pointer without snapping to the grab point.
  const dragShapeRef = useRef<{ shapeId: string; origin: Point; startPoints: Point[] } | null>(null)

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
      return
    }
    const ds = dragShapeRef.current
    if (ds) {
      const dx = p[0] - ds.origin[0]
      const dy = p[1] - ds.origin[1]
      const nextPoints = ds.startPoints.map(([x, y]) => [x + dx, y + dy] as Point)
      updateShape(selectedChar, ds.shapeId, { points: nextPoints })
    }
  }

  const handlePointerUp = () => {
    setDraggingVertex(null)
    dragShapeRef.current = null
  }

  const startShapeDrag = (shapeId: string, e: React.PointerEvent<SVGPathElement>) => {
    const shape = glyph.shapes.find(s => s.id === shapeId)
    if (!shape) return
    e.stopPropagation()
    setSelectedShape(shapeId)
    setSelectedVertex(null)
    const origin = clientToFont(e.clientX, e.clientY)
    dragShapeRef.current = {
      shapeId,
      origin,
      startPoints: shape.points.map(([x, y]) => [x, y] as Point),
    }
    // Capture so the move events keep coming even if the cursor leaves
    // the path or the SVG container during the drag.
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

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
          {settings.gridVisible && settings.gridSize > 0 && <GridLines settings={settings} viewBox={viewBox} />}
          <MetricGuides settings={settings} viewBox={viewBox} />
          <SideBearings glyph={glyph} settings={settings} />
          {overlay.layer === 'below' && (
            <OverlayGlyph
              overlay={overlay}
              glyphs={allGlyphs}
              presets={settings.bezierPresets}
              currentGlyph={glyph}
              settings={settings}
            />
          )}
          <GlyphShapes
            glyph={glyph}
            settings={settings}
            selectedShapeId={selectedShapeId}
            onPick={setSelectedShape}
            tool={tool}
            onShapeDragStart={startShapeDrag}
          />
          {overlay.layer === 'above' && (
            <OverlayGlyph
              overlay={overlay}
              glyphs={allGlyphs}
              presets={settings.bezierPresets}
              currentGlyph={glyph}
              settings={settings}
            />
          )}
          {tool === 'select' && (
            <VertexHandles
              glyph={glyph}
              selectedShapeId={selectedShapeId}
              selectedVertex={selectedVertex}
              onPickVertex={(shapeId, idx, e) => {
                setSelectedShape(shapeId)
                setSelectedVertex(idx)
                setDraggingVertex({ shapeId, index: idx })
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
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
  tool,
  onShapeDragStart,
}: {
  glyph: Glyph
  settings: ProjectSettings
  selectedShapeId: string | null
  onPick: (id: string | null) => void
  tool: 'select' | 'line' | 'polygon' | 'circle'
  onShapeDragStart: (id: string, e: React.PointerEvent<SVGPathElement>) => void
}) {
  // Body: one combined path with even-odd fill so nested contours read as
  // holes in the canvas the same way they will in the exported font.
  const combinedD = glyphCombinedPath(glyph.shapes, settings.bezierPresets)
  return (
    <g>
      {combinedD && (
        <path d={combinedD} fill="currentColor" fillOpacity={0.65} fillRule="evenodd" pointerEvents="none" />
      )}
      {glyph.shapes.map(s => (
        <path
          key={s.id}
          d={shapeToPath(s, settings.bezierPresets)}
          fill="transparent"
          stroke={selectedShapeId === s.id ? 'var(--color-accent)' : 'transparent'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="shape-hit"
          onPointerDown={e => {
            if (tool !== 'select' || e.button !== 0) return
            onPick(s.id)
            onShapeDragStart(s.id, e)
          }}
        />
      ))}
    </g>
  )
}

function GridLines({ settings, viewBox }: { settings: ProjectSettings; viewBox: ViewBox }) {
  const step = settings.gridSize
  // Cover the visible viewBox in font coords (y is flipped at the parent group,
  // but viewBox numbers are screen-space-y so vertical lines span the full y range).
  const xStart = Math.floor(viewBox.x / step) * step
  const xEnd = viewBox.x + viewBox.w
  const yStart = Math.floor(viewBox.y / step) * step
  const yEnd = viewBox.y + viewBox.h
  const verts: number[] = []
  for (let x = xStart; x <= xEnd; x += step) verts.push(x)
  const horiz: number[] = []
  for (let y = yStart; y <= yEnd; y += step) horiz.push(y)
  return (
    <g pointerEvents="none">
      {verts.map(x => (
        <line key={`v${x}`} x1={x} y1={viewBox.y} x2={x} y2={yEnd} className="grid-line" />
      ))}
      {horiz.map(y => (
        <line key={`h${y}`} x1={viewBox.x} y1={y} x2={xEnd} y2={y} className="grid-line" />
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
  onPickVertex: (shapeId: string, idx: number, e: React.PointerEvent<SVGCircleElement>) => void
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
                  if (e.button !== 0) return
                  e.stopPropagation()
                  onPickVertex(shape.id, i, e)
                }}
              />
            ))
          : null,
      )}
    </g>
  )
}

function OverlayGlyph({
  overlay,
  glyphs,
  presets,
  currentGlyph,
  settings,
}: {
  overlay: OverlayState
  glyphs: Record<string, Glyph>
  presets: readonly BezierPreset[]
  currentGlyph: Glyph
  settings: ProjectSettings
}) {
  if (!overlay.char) return null
  // "arial:X" → render the system Arial glyph as a reference guide rather
  // than a stored project glyph. Centered horizontally in the current
  // glyph's advance width so the user can use it as a sizing template.
  if (overlay.char.startsWith('arial:')) {
    const ch = overlay.char.slice('arial:'.length)
    return (
      <ArialReference
        ch={ch}
        overlay={overlay}
        advanceWidth={currentGlyph.advanceWidth}
        unitsPerEm={settings.unitsPerEm}
      />
    )
  }
  const overlayGlyph = glyphs[overlay.char]
  if (!overlayGlyph) return null
  const { shapes } = resolveGlyphRender(overlayGlyph, glyphs)
  if (shapes.length === 0) return null

  const isFill = overlay.style === 'fill'
  return (
    <g opacity={overlay.opacity} pointerEvents="none">
      {shapes.map(s => (
        <path
          key={s.id}
          d={shapeToPath(s, presets)}
          fill={isFill ? 'var(--color-accent)' : 'none'}
          stroke={isFill ? 'none' : 'var(--color-accent)'}
          strokeWidth={6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

function ArialReference({
  ch,
  overlay,
  advanceWidth,
  unitsPerEm,
}: {
  ch: string
  overlay: OverlayState
  advanceWidth: number
  unitsPerEm: number
}) {
  const isFill = overlay.style === 'fill'
  // Render at font-size = em so Arial's natural cap/x-height/descender land
  // at roughly 717/519/-207 — close to the project defaults (700/500/-200).
  // The inner scale(1, -1) un-flips the parent's y-axis flip so the glyph
  // reads right-side up while the baseline stays at font-y=0.
  return (
    <g opacity={overlay.opacity} pointerEvents="none" transform="scale(1, -1)">
      <text
        x={advanceWidth / 2}
        y={0}
        textAnchor="middle"
        fontFamily='Arial, "Helvetica Neue", Helvetica, sans-serif'
        fontSize={unitsPerEm}
        fill={isFill ? 'var(--color-accent)' : 'none'}
        stroke={isFill ? 'none' : 'var(--color-accent)'}
        strokeWidth={6}
        vectorEffect="non-scaling-stroke"
      >
        {ch}
      </text>
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
