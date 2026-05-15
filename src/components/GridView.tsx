import { glyphCombinedPath, resolveGlyphRender } from '../lib/glyph'
import { useStore } from '../store'
import { GLYPH_CHARS, uppercaseFallbackChar } from '../types'

import type { Glyph, ProjectSettings, Shape } from '../types'

export function GridView() {
  const glyphs = useStore(s => s.glyphs)
  const settings = useStore(s => s.settings)
  const setSelectedGlyph = useStore(s => s.setSelectedGlyph)
  const setViewMode = useStore(s => s.setViewMode)

  const openGlyph = (ch: string) => {
    setSelectedGlyph(ch)
    setViewMode('single')
  }

  return (
    <div className="canvas-surface relative h-full overflow-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 p-4">
        {GLYPH_CHARS.map(ch => (
          <GlyphCell key={ch} glyph={glyphs[ch]} glyphs={glyphs} settings={settings} onClick={() => openGlyph(ch)} />
        ))}
      </div>
    </div>
  )
}

interface GlyphCellProps {
  glyph: Glyph
  glyphs: Record<string, Glyph>
  settings: ProjectSettings
  onClick: () => void
}

function GlyphCell({ glyph, glyphs, settings, onClick }: GlyphCellProps) {
  const { shapes, isFallback, advanceWidth } = resolveGlyphRender(glyph, glyphs)
  const isEmpty = shapes.length === 0
  const hasFallback = isFallback
  const cls = `glyph-cell ${isEmpty ? 'empty' : ''} ${hasFallback ? 'fallback' : ''}`.trim()

  return (
    <button type="button" className={cls} onClick={onClick} title={glyph.char}>
      <span className="glyph-char-label">{glyph.char}</span>
      {!isEmpty && <GlyphThumbnail shapes={shapes} settings={settings} advanceWidth={advanceWidth} />}
      {isEmpty && (
        <div className="text-muted-2 absolute inset-0 grid place-items-center text-2xl font-bold opacity-30">
          {uppercaseFallbackChar(glyph.char) ?? glyph.char}
        </div>
      )}
    </button>
  )
}

interface GlyphThumbnailProps {
  shapes: readonly Shape[]
  settings: ProjectSettings
  advanceWidth: number
}

function GlyphThumbnail({ shapes, settings, advanceWidth }: GlyphThumbnailProps) {
  // Center the viewBox on the glyph's advance midpoint so each cell shows
  // the artwork in the middle, not flush-left. Width stays at em so glyphs
  // keep a consistent relative scale across cells.
  const h = settings.ascender - settings.descender
  const w = settings.unitsPerEm
  const x = advanceWidth / 2 - w / 2
  const top = -settings.ascender
  const d = glyphCombinedPath(shapes, settings.bezierPresets, settings.unitsPerEm)
  return (
    <svg viewBox={`${x} ${top} ${w} ${h}`} className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)]">
      <g transform="scale(1, -1)">
        <path d={d} fill="currentColor" fillRule="evenodd" />
      </g>
    </svg>
  )
}
