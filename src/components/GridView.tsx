import { resolveGlyphRender, shapeToPath } from '../lib/glyph'
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
  const { shapes, isFallback } = resolveGlyphRender(glyph, glyphs)
  const isEmpty = shapes.length === 0
  const hasFallback = isFallback
  const cls = `glyph-cell ${isEmpty ? 'empty' : ''} ${hasFallback ? 'fallback' : ''}`.trim()

  return (
    <button type="button" className={cls} onClick={onClick} title={glyph.char}>
      <span className="glyph-char-label">{glyph.char}</span>
      {!isEmpty && <GlyphThumbnail shapes={shapes} settings={settings} />}
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
}

function GlyphThumbnail({ shapes, settings }: GlyphThumbnailProps) {
  const top = -settings.ascender
  const h = settings.ascender - settings.descender
  const w = settings.unitsPerEm
  return (
    <svg viewBox={`0 ${top} ${w} ${h}`} className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)]">
      <g transform="scale(1, -1)">
        {shapes.map(s => (
          <path key={s.id} d={shapeToPath(s, settings.bezierPresets)} fill="currentColor" />
        ))}
      </g>
    </svg>
  )
}
