import { useEffect, useState } from 'react'

import { Font, parse as parseOpentype } from 'opentype.js'

import { decompressFromWoff2 } from './lib/wawoff2'

const WOFF2_MAGIC = 'wOF2'

const isWoff2 = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === WOFF2_MAGIC

async function loadFontFromFile(file: File): Promise<{ font: Font; sourceFormat: 'otf' | 'woff2' }> {
  const ab = await file.arrayBuffer()
  let bytes: Uint8Array = new Uint8Array(ab)
  let sourceFormat: 'otf' | 'woff2' = 'otf'
  if (isWoff2(bytes) || /\.woff2$/i.test(file.name)) {
    sourceFormat = 'woff2'
    bytes = await decompressFromWoff2(bytes)
  }
  // Copy into a fresh ArrayBuffer (opentype.parse rejects views over
  // SharedArrayBuffer / unsized ArrayBufferLike).
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const font = parseOpentype(buffer)
  return { font, sourceFormat }
}

interface LoadedFont {
  font: Font
  fileName: string
  sourceFormat: 'otf' | 'woff2'
}

export function TestApp() {
  const [loaded, setLoaded] = useState<LoadedFont | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('The quick brown FOX 0123')
  const [fontSize, setFontSize] = useState(80)

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const { font, sourceFormat } = await loadFontFromFile(file)
      setLoaded({ font, fileName: file.name, sourceFormat })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      e.preventDefault()
      void handleFile(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <>
      <header className="topbar-surface border-line relative flex items-center justify-between border-b px-3.5">
        <div className="flex items-baseline gap-3 py-2">
          <span className="text-accent font-bold tracking-[1px] [text-shadow:0_0_12px_rgba(255,59,48,0.45)]">
            / FNT7 / inspector
          </span>
          {loaded && (
            <span className="text-muted text-[11px] tracking-[0.5px]">
              {loaded.fileName} · {loaded.sourceFormat.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex gap-2 py-2">
          <FilePickButton onFile={handleFile} />
          {loaded && (
            <button type="button" onClick={() => setLoaded(null)}>
              Close font
            </button>
          )}
          <a href="/" className="text-muted text-[11px] tracking-[0.5px] underline">
            ← back to editor
          </a>
        </div>
      </header>
      <main className="bg-bg-0 min-h-0 overflow-auto">
        {error && (
          <div className="bg-accent-dim text-accent-2 mx-4 mt-4 border border-[var(--color-accent)] p-3 text-[12px]">
            {error}
          </div>
        )}
        {!loaded && <DropZone />}
        {loaded && (
          <div className="space-y-6 p-6">
            <FontInfo font={loaded.font} />
            <TextPreview
              font={loaded.font}
              text={text}
              setText={setText}
              fontSize={fontSize}
              setFontSize={setFontSize}
            />
            <GlyphGrid font={loaded.font} />
          </div>
        )}
      </main>
    </>
  )
}

function FilePickButton({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="bg-bg-2 border-line hover:bg-bg-3 m-0 inline-flex h-[28px] cursor-pointer items-center border px-3 text-[12px] tracking-[0.5px]">
      <span>Load font</span>
      <input
        type="file"
        accept=".otf,.woff2,font/otf,font/woff2"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

function DropZone() {
  return (
    <div className="m-6 grid place-items-center border-2 border-dashed border-[var(--color-line-strong)] p-20">
      <div className="text-center">
        <p className="text-text mb-2 text-[14px] tracking-[1px] uppercase">Drop an .otf or .woff2 font here</p>
        <p className="text-muted-2 text-[11px] tracking-[0.4px]">or use the “Load font” button in the topbar</p>
      </div>
    </div>
  )
}

function FontInfo({ font }: { font: Font }) {
  const familyName = nameFromOpentype(font, 'fontFamily') ?? '—'
  const subfamily = nameFromOpentype(font, 'fontSubfamily') ?? '—'
  const fullName = nameFromOpentype(font, 'fullName') ?? '—'
  const cells: { k: string; v: string | number }[] = [
    { k: 'Family', v: familyName },
    { k: 'Subfamily', v: subfamily },
    { k: 'Full name', v: fullName },
    { k: 'Units / em', v: font.unitsPerEm },
    { k: 'Ascender', v: font.ascender },
    { k: 'Descender', v: font.descender },
    { k: 'Glyphs', v: font.glyphs.length },
  ]
  return (
    <section className="bg-bg-1 border-line border p-4">
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Font</span>
      </h2>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-4 gap-y-1 text-[11px]">
        {cells.map(c => (
          <div key={c.k} className="flex justify-between gap-2">
            <dt className="text-muted-2 tracking-[0.4px] uppercase">{c.k}</dt>
            <dd className="text-text font-mono">{c.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

interface NameTable {
  [language: string]: string
}
interface NamesObject {
  [k: string]: NameTable | undefined
}

function nameFromOpentype(font: Font, key: string): string | undefined {
  const names = font.names as unknown as NamesObject
  const entry = names[key]
  if (!entry) return undefined
  return entry.en ?? Object.values(entry)[0]
}

interface TextPreviewProps {
  font: Font
  text: string
  setText: (t: string) => void
  fontSize: number
  setFontSize: (n: number) => void
}

function TextPreview({ font, text, setText, fontSize, setFontSize }: TextPreviewProps) {
  return (
    <section className="bg-bg-1 border-line border p-4">
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Type</span>
      </h2>
      <textarea
        rows={2}
        value={text}
        onChange={e => setText(e.target.value)}
        className="bg-bg-0 border-line text-text mb-3 w-full border p-2 font-mono text-[13px]"
      />
      <div className="text-muted mb-3 flex items-center gap-3 text-[11px]">
        <span className="tracking-[0.4px] uppercase">Size</span>
        <input
          type="range"
          min={12}
          max={300}
          step={1}
          value={fontSize}
          onChange={e => setFontSize(parseInt(e.target.value, 10))}
          className="max-w-[300px] flex-1"
        />
        <input
          type="number"
          min={8}
          max={500}
          value={fontSize}
          onChange={e => {
            const n = parseInt(e.target.value, 10)
            if (Number.isFinite(n)) setFontSize(Math.max(8, Math.min(500, n)))
          }}
        />
        <span className="text-muted-2">px</span>
      </div>
      <div className="bg-bg-0 border-line border p-4">
        <TextRender font={font} text={text} fontSize={fontSize} />
      </div>
    </section>
  )
}

function TextRender({ font, text, fontSize }: { font: Font; text: string; fontSize: number }) {
  if (!text) {
    return <p className="text-muted-2 text-[11px]">Type to render…</p>
  }
  // opentype.js applies the y-flip itself: getPath returns SVG-ready coords
  // with baseline at the supplied y. We allow descenders to extend below by
  // padding the viewBox with the font's descender.
  const lines = text.split('\n')
  const lineGap = fontSize * 0.2
  const ascRatio = font.ascender / font.unitsPerEm
  const dscRatio = font.descender / font.unitsPerEm // negative
  const lineHeight = (font.ascender - font.descender) / font.unitsPerEm

  const paths: { d: string; y: number; width: number }[] = []
  let maxWidth = 0
  lines.forEach((line, i) => {
    const y = (i + ascRatio) * fontSize + i * lineGap
    const path = font.getPath(line, 0, y, fontSize)
    const bb = path.getBoundingBox()
    const lineWidth = Number.isFinite(bb.x2) ? bb.x2 : 0
    if (lineWidth > maxWidth) maxWidth = lineWidth
    paths.push({ d: path.toPathData(2), y, width: lineWidth })
  })

  const totalHeight = lines.length * lineHeight * fontSize + Math.max(0, lines.length - 1) * lineGap
  const padX = fontSize * 0.1
  const viewBoxW = Math.max(1, maxWidth + padX * 2)
  const viewBoxH = Math.max(1, totalHeight + Math.abs(dscRatio) * fontSize * 0.2)

  return (
    <svg viewBox={`${-padX} 0 ${viewBoxW} ${viewBoxH}`} className="text-text block w-full">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="currentColor" />
      ))}
    </svg>
  )
}

function GlyphGrid({ font }: { font: Font }) {
  const [filter, setFilter] = useState('')
  const total = font.glyphs.length
  const items: { idx: number; name: string; unicode: number | undefined }[] = []
  for (let i = 0; i < total; i++) {
    const g = font.glyphs.get(i)
    items.push({ idx: i, name: g.name ?? `glyph-${i}`, unicode: g.unicode })
  }
  const f = filter.trim().toLowerCase()
  const visible = f
    ? items.filter(it => {
        const charMatch = it.unicode !== undefined && String.fromCodePoint(it.unicode).toLowerCase() === f
        const nameMatch = it.name.toLowerCase().includes(f)
        const hexMatch = it.unicode !== undefined && it.unicode.toString(16).padStart(4, '0').includes(f)
        return charMatch || nameMatch || hexMatch
      })
    : items

  return (
    <section className="bg-bg-1 border-line border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-h2 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
          <span className="ml-1">
            Glyphs ({visible.length}
            {visible.length !== items.length ? ` / ${items.length}` : ''})
          </span>
        </h2>
        <input
          type="text"
          placeholder="filter by char / name / hex"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="max-w-[240px]"
        />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1">
        {visible.map(it => (
          <GlyphPreview key={it.idx} font={font} index={it.idx} />
        ))}
      </div>
    </section>
  )
}

function GlyphPreview({ font, index }: { font: Font; index: number }) {
  const g = font.glyphs.get(index)
  const upm = font.unitsPerEm
  const asc = font.ascender
  const dsc = font.descender
  // glyph.getPath(0, 0, upm) returns SVG-y-down coords with baseline at y=0;
  // top of letter is at y=-asc, bottom at y=-dsc (since dsc is negative).
  const path = g.getPath(0, 0, upm)
  const d = path.toPathData(2)
  const advance = g.advanceWidth ?? upm
  const w = Math.max(advance, upm * 0.5)
  const viewBoxX = -upm * 0.05
  const viewBoxY = -asc
  const viewBoxW = w + upm * 0.1
  const viewBoxH = asc - dsc
  const charLabel = g.unicode !== undefined ? String.fromCodePoint(g.unicode) : ''
  const hex = g.unicode !== undefined ? g.unicode.toString(16).padStart(4, '0').toUpperCase() : ''
  return (
    <div className="glyph-cell relative" title={`${g.name ?? ''} ${hex ? 'U+' + hex : ''}`}>
      <span className="glyph-char-label">{charLabel || g.name?.slice(0, 6)}</span>
      <svg
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
        className="text-text absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)]"
      >
        <path d={d} fill="currentColor" />
      </svg>
    </div>
  )
}
