import { glyphCombinedPath, resolveGlyphRender } from '../lib/glyph'
import { useStore } from '../store'

import type { BezierPreset, Glyph, ProjectSettings } from '../types'

export function TextPreview() {
  const text = useStore(s => s.previewText)
  const setText = useStore(s => s.setPreviewText)
  const glyphs = useStore(s => s.glyphs)
  const settings = useStore(s => s.settings)

  return (
    <div className="canvas-surface relative h-full overflow-auto p-6">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        className="bg-bg-0 border-line text-text mb-4 w-full border p-2 font-mono text-[13px]"
        placeholder="Type to preview..."
      />
      <div className="bg-bg-1 border-line border p-4">
        <Specimen text={text} glyphs={glyphs} settings={settings} />
      </div>
    </div>
  )
}

interface SpecimenProps {
  text: string
  glyphs: Record<string, Glyph>
  settings: ProjectSettings
}

function Specimen({ text, glyphs, settings }: SpecimenProps) {
  const lines = text.split('\n')
  const spaceWidth = settings.unitsPerEm * 0.3
  const lineHeight = settings.ascender - settings.descender
  const lineGap = settings.unitsPerEm * 0.1

  // Lay out each line, measuring total width to size the SVG.
  type Placed = { glyph: Glyph; x: number }
  const laidOut: Placed[][] = []
  let maxWidth = 0
  for (const line of lines) {
    const placed: Placed[] = []
    let x = 0
    for (const ch of line) {
      if (ch === ' ') {
        x += spaceWidth
        continue
      }
      const g = glyphs[ch]
      if (!g) continue
      const { advanceWidth } = resolveGlyphRender(g, glyphs)
      placed.push({ glyph: g, x })
      x += advanceWidth
    }
    if (x > maxWidth) maxWidth = x
    laidOut.push(placed)
  }

  const totalHeight = lines.length * lineHeight + Math.max(0, lines.length - 1) * lineGap
  const viewBoxX = 0
  const viewBoxY = -settings.ascender
  const viewBoxW = Math.max(1, maxWidth)
  const viewBoxH = totalHeight

  return (
    <svg viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`} className="text-text w-full">
      <g transform="scale(1, -1)">
        {laidOut.map((line, lineIdx) => {
          const lineY = -lineIdx * (lineHeight + lineGap)
          return (
            <g key={lineIdx} transform={`translate(0, ${lineY})`}>
              {line.map(({ glyph, x }, i) => (
                <GlyphAt key={`${lineIdx}-${i}`} glyph={glyph} glyphs={glyphs} presets={settings.bezierPresets} x={x} />
              ))}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function GlyphAt({
  glyph,
  glyphs,
  presets,
  x,
}: {
  glyph: Glyph
  glyphs: Record<string, Glyph>
  presets: readonly BezierPreset[]
  x: number
}) {
  const { shapes } = resolveGlyphRender(glyph, glyphs)
  const d = glyphCombinedPath(shapes, presets)
  return (
    <g transform={`translate(${x}, 0)`}>
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </g>
  )
}
