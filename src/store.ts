import { create } from 'zustand'

import { DEFAULT_METRICS, GLYPH_CHARS } from './types'

import type { FileHandle } from './lib/file-system'
import type {
  BezierMode,
  Drawing,
  Glyph,
  OverlayState,
  ProjectSettings,
  Shape,
  Tool,
  ViewMode,
  ViewState,
} from './types'

const HISTORY_LIMIT = 100

let shapeIdCounter = 0
const newShapeId = (): string => `shape-${++shapeIdCounter}-${Math.random().toString(36).slice(2, 7)}`

export const DEFAULT_SETTINGS: ProjectSettings = {
  fontName: 'Untitled',
  unitsPerEm: DEFAULT_METRICS.unitsPerEm,
  ascender: DEFAULT_METRICS.ascender,
  descender: DEFAULT_METRICS.descender,
  capHeight: DEFAULT_METRICS.capHeight,
  xHeight: DEFAULT_METRICS.xHeight,
  bezierPresets: [{ name: 'default', value: 0.5 }],
  snapAngles: [0, 45, 90, 135, 180, 225, 270, 315],
  gridSize: 50,
  gridVisible: true,
  gridSnap: false,
}

const emptyGlyphsByChar = (): Record<string, Glyph> => {
  const out: Record<string, Glyph> = {}
  for (const ch of GLYPH_CHARS) {
    out[ch] = { char: ch, advanceWidth: DEFAULT_METRICS.defaultAdvanceWidth, shapes: [] }
  }
  return out
}

interface Snapshot {
  glyphs: Record<string, Glyph>
  settings: ProjectSettings
}

interface State {
  settings: ProjectSettings
  glyphs: Record<string, Glyph>

  selectedGlyph: string
  selectedShapeId: string | null
  selectedVertexIndex: number | null

  viewMode: ViewMode
  tool: Tool
  drawing: Drawing | null

  /** Pan/zoom for the single-glyph canvas. */
  view: ViewState
  /** Text typed into the text-preview mode. */
  previewText: string
  /** Single-glyph canvas overlay (trace/compare another glyph). */
  overlay: OverlayState

  fileName: string
  fileHandle: FileHandle | null
  dirty: boolean

  past: Snapshot[]
  future: Snapshot[]
}

interface Actions {
  setViewMode: (m: ViewMode) => void
  setTool: (t: Tool) => void
  setSelectedGlyph: (ch: string) => void
  setSelectedShape: (id: string | null) => void
  setSelectedVertex: (idx: number | null) => void
  setView: (v: ViewState) => void
  setPreviewText: (t: string) => void
  setOverlay: (patch: Partial<OverlayState>) => void

  setFileMeta: (name: string, handle: FileHandle | null) => void
  clearDirty: () => void

  newProject: () => void
  setProject: (settings: ProjectSettings, glyphs: Record<string, Glyph>) => void

  updateSettings: (patch: Partial<ProjectSettings>) => void
  addBezierPreset: (name: string, value: number, mode?: BezierMode) => void
  updateBezierPreset: (name: string, patch: { name?: string; value?: number; mode?: BezierMode }) => void
  deleteBezierPreset: (name: string) => void

  updateGlyph: (char: string, patch: Partial<Pick<Glyph, 'advanceWidth'>>) => void

  addShape: (char: string, points: Shape['points']) => string
  deleteShape: (char: string, id: string) => void
  updateShape: (char: string, id: string, patch: Partial<Omit<Shape, 'id'>>) => void
  setShapeBezierRef: (char: string, id: string, ref: string | null) => void
  setVertexBezierRef: (char: string, id: string, vertexIndex: number, ref: string | null) => void

  setDrawing: (d: Drawing | null) => void

  undo: () => void
  redo: () => void
}

const snapshot = (state: State): Snapshot => ({ glyphs: state.glyphs, settings: state.settings })

/** Apply `patch` while preserving history + dirty flag. */
const withHistory = (state: State, patch: Partial<Snapshot>): Partial<State> => {
  const past = [...state.past, snapshot(state)].slice(-HISTORY_LIMIT)
  return {
    ...patch,
    past,
    future: [],
    dirty: true,
  }
}

export const useStore = create<State & Actions>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  glyphs: emptyGlyphsByChar(),

  selectedGlyph: 'A',
  selectedShapeId: null,
  selectedVertexIndex: null,

  viewMode: 'grid',
  tool: 'select',
  drawing: null,

  view: { x: 0, y: 0, scale: 1 },
  previewText: 'The quick brown FOX 0123',
  overlay: { char: null, layer: 'above', style: 'stroke', opacity: 0.6 },

  fileName: '',
  fileHandle: null,
  dirty: false,

  past: [],
  future: [],

  setViewMode: m => set({ viewMode: m }),
  setTool: t => set({ tool: t, drawing: null }),
  setSelectedGlyph: ch => set({ selectedGlyph: ch, selectedShapeId: null, selectedVertexIndex: null, drawing: null }),
  setSelectedShape: id => set({ selectedShapeId: id, selectedVertexIndex: null }),
  setSelectedVertex: idx => set({ selectedVertexIndex: idx }),
  setView: v => set({ view: v }),
  setPreviewText: t => set({ previewText: t }),
  setOverlay: patch => set(state => ({ overlay: { ...state.overlay, ...patch } })),

  setFileMeta: (name, handle) => set({ fileName: name, fileHandle: handle }),
  clearDirty: () => set({ dirty: false }),

  newProject: () =>
    set({
      settings: DEFAULT_SETTINGS,
      glyphs: emptyGlyphsByChar(),
      selectedGlyph: 'A',
      selectedShapeId: null,
      selectedVertexIndex: null,
      viewMode: 'grid',
      tool: 'select',
      drawing: null,
      fileName: '',
      fileHandle: null,
      dirty: false,
      past: [],
      future: [],
    }),

  setProject: (settings, glyphs) =>
    set({
      settings,
      glyphs,
      selectedGlyph: 'A',
      selectedShapeId: null,
      selectedVertexIndex: null,
      drawing: null,
      dirty: false,
      past: [],
      future: [],
    }),

  updateSettings: patch => set(state => withHistory(state, { settings: { ...state.settings, ...patch } })),

  addBezierPreset: (name, value, mode) =>
    set(state => {
      if (!name || state.settings.bezierPresets.some(p => p.name === name)) return state
      const preset = mode && mode !== 'proportional' ? { name, value, mode } : { name, value }
      return withHistory(state, {
        settings: { ...state.settings, bezierPresets: [...state.settings.bezierPresets, preset] },
      })
    }),

  updateBezierPreset: (name, patch) =>
    set(state => {
      const idx = state.settings.bezierPresets.findIndex(p => p.name === name)
      if (idx < 0) return state
      const renaming = patch.name && patch.name !== name
      if (renaming && state.settings.bezierPresets.some(p => p.name === patch.name)) return state
      const nextPresets = state.settings.bezierPresets.map((p, i) => {
        if (i !== idx) return p
        const mode = patch.mode ?? p.mode ?? 'proportional'
        const value = patch.value ?? p.value
        const name = patch.name ?? p.name
        return mode === 'proportional' ? { name, value } : { name, value, mode }
      })
      let nextGlyphs = state.glyphs
      if (renaming) {
        nextGlyphs = { ...state.glyphs }
        for (const ch of Object.keys(nextGlyphs)) {
          const g = nextGlyphs[ch]
          let glyphChanged = false
          const nextShapes = g.shapes.map(s => {
            let shapeChanged = false
            let bezierRef = s.bezierRef
            if (bezierRef === name) {
              bezierRef = patch.name ?? name
              shapeChanged = true
            }
            let pointBezierRefs = s.pointBezierRefs
            if (pointBezierRefs) {
              const renamed: Record<number, string> = {}
              let anyRenamed = false
              for (const [k, v] of Object.entries(pointBezierRefs)) {
                if (v === name) {
                  renamed[Number(k)] = patch.name ?? name
                  anyRenamed = true
                } else {
                  renamed[Number(k)] = v
                }
              }
              if (anyRenamed) {
                pointBezierRefs = renamed
                shapeChanged = true
              }
            }
            if (shapeChanged) {
              glyphChanged = true
              return { ...s, bezierRef, pointBezierRefs }
            }
            return s
          })
          if (glyphChanged) nextGlyphs[ch] = { ...g, shapes: nextShapes }
        }
      }
      return withHistory(state, {
        settings: { ...state.settings, bezierPresets: nextPresets },
        glyphs: nextGlyphs,
      })
    }),

  deleteBezierPreset: name =>
    set(state => {
      if (state.settings.bezierPresets.length <= 1) return state
      const idx = state.settings.bezierPresets.findIndex(p => p.name === name)
      if (idx < 0) return state
      const nextPresets = state.settings.bezierPresets.filter(p => p.name !== name)
      // References to the deleted preset fall back to the (new) default. We
      // clear them so the data is honest about what's resolved at render time.
      const nextGlyphs: Record<string, Glyph> = {}
      for (const ch of Object.keys(state.glyphs)) {
        const g = state.glyphs[ch]
        const nextShapes = g.shapes.map(s => {
          let shapeChanged = false
          let bezierRef = s.bezierRef
          if (bezierRef === name) {
            bezierRef = null
            shapeChanged = true
          }
          let pointBezierRefs = s.pointBezierRefs
          if (pointBezierRefs) {
            const kept: Record<number, string> = {}
            let anyKept = false
            let anyDropped = false
            for (const [k, v] of Object.entries(pointBezierRefs)) {
              if (v !== name) {
                kept[Number(k)] = v
                anyKept = true
              } else {
                anyDropped = true
              }
            }
            if (anyDropped) {
              pointBezierRefs = anyKept ? kept : undefined
              shapeChanged = true
            }
          }
          return shapeChanged ? { ...s, bezierRef, pointBezierRefs } : s
        })
        nextGlyphs[ch] = { ...g, shapes: nextShapes }
      }
      return withHistory(state, {
        settings: { ...state.settings, bezierPresets: nextPresets },
        glyphs: nextGlyphs,
      })
    }),

  updateGlyph: (char, patch) =>
    set(state => {
      const g = state.glyphs[char]
      if (!g) return state
      return withHistory(state, { glyphs: { ...state.glyphs, [char]: { ...g, ...patch } } })
    }),

  addShape: (char, points) => {
    const id = newShapeId()
    set(state => {
      const g = state.glyphs[char]
      if (!g) return state
      const shape: Shape = { id, points, bezierRef: null }
      return withHistory(state, { glyphs: { ...state.glyphs, [char]: { ...g, shapes: [...g.shapes, shape] } } })
    })
    return id
  },

  deleteShape: (char, id) =>
    set(state => {
      const g = state.glyphs[char]
      if (!g) return state
      return withHistory(state, {
        glyphs: { ...state.glyphs, [char]: { ...g, shapes: g.shapes.filter(s => s.id !== id) } },
      })
    }),

  updateShape: (char, id, patch) =>
    set(state => {
      const g = state.glyphs[char]
      if (!g) return state
      const shapes = g.shapes.map(s => (s.id === id ? { ...s, ...patch } : s))
      return withHistory(state, { glyphs: { ...state.glyphs, [char]: { ...g, shapes } } })
    }),

  setShapeBezierRef: (char, id, ref) => get().updateShape(char, id, { bezierRef: ref }),

  setVertexBezierRef: (char, id, vertexIndex, ref) =>
    set(state => {
      const g = state.glyphs[char]
      if (!g) return state
      const shapes = g.shapes.map(s => {
        if (s.id !== id) return s
        const next: Record<number, string> = { ...s.pointBezierRefs }
        if (ref === null) {
          delete next[vertexIndex]
        } else {
          next[vertexIndex] = ref
        }
        const keys = Object.keys(next)
        return { ...s, pointBezierRefs: keys.length > 0 ? next : undefined }
      })
      return withHistory(state, { glyphs: { ...state.glyphs, [char]: { ...g, shapes } } })
    }),

  setDrawing: d => set({ drawing: d }),

  undo: () =>
    set(state => {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      const past = state.past.slice(0, -1)
      const future = [...state.future, snapshot(state)]
      return { ...prev, past, future, dirty: true }
    }),

  redo: () =>
    set(state => {
      if (state.future.length === 0) return state
      const next = state.future[state.future.length - 1]
      const future = state.future.slice(0, -1)
      const past = [...state.past, snapshot(state)]
      return { ...next, past, future, dirty: true }
    }),
}))
