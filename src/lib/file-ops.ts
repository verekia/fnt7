import { useStore } from '../store'
import {
  downloadBytes,
  downloadText,
  pickAndOpenFile,
  pickSaveHandle,
  supportsFsApi,
  writeToHandle,
  type FileHandle,
} from './file-system'
import { exportOtf, exportWoff2 } from './font-export'
import { parseProject, serializeProject } from './svg-io'

const confirmDiscard = (): boolean => {
  if (!useStore.getState().dirty) return true
  return confirm('Discard unsaved changes?')
}

export function newProject(): void {
  if (!confirmDiscard()) return
  useStore.getState().newProject()
}

export async function openFile(): Promise<void> {
  if (!confirmDiscard()) return
  const file = await pickAndOpenFile()
  if (!file) return
  try {
    const { settings, glyphs } = parseProject(file.text)
    const store = useStore.getState()
    store.setProject(settings, glyphs)
    store.setFileMeta(file.name, file.handle)
  } catch (e) {
    alert(`Open failed: ${(e as Error).message}`)
  }
}

export async function openDroppedFile(file: File, handle: FileHandle | null = null): Promise<void> {
  if (!confirmDiscard()) return
  try {
    const text = await file.text()
    const { settings, glyphs } = parseProject(text)
    const store = useStore.getState()
    store.setProject(settings, glyphs)
    store.setFileMeta(file.name, handle)
  } catch (e) {
    alert(`Open failed: ${(e as Error).message}`)
  }
}

export async function saveFile(): Promise<void> {
  const store = useStore.getState()
  const handle = store.fileHandle
  const text = serializeProject(store.settings, store.glyphs)
  if (handle) {
    try {
      await writeToHandle(handle, text)
      store.clearDirty()
      return
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`)
      return
    }
  }
  await saveFileAs()
}

export async function saveFileAs(): Promise<void> {
  const initial = useStore.getState()
  const suggested = initial.fileName || 'fnt7.svg'
  if (!supportsFsApi()) {
    downloadText(suggested, serializeProject(initial.settings, initial.glyphs))
    initial.clearDirty()
    return
  }
  const handle = await pickSaveHandle(suggested)
  if (!handle) return
  const fresh = useStore.getState()
  try {
    await writeToHandle(handle, serializeProject(fresh.settings, fresh.glyphs))
    fresh.setFileMeta(handle.name, handle)
    fresh.clearDirty()
  } catch (e) {
    alert(`Save failed: ${(e as Error).message}`)
  }
}

/** Emit an OTF font file to disk. See font-export.ts for the format note. */
export function exportFontOtf(): void {
  const state = useStore.getState()
  try {
    const { filename, bytes, mime } = exportOtf(state.settings, state.glyphs)
    downloadBytes(filename, bytes, mime)
  } catch (e) {
    alert(`Export failed: ${(e as Error).message}`)
  }
}

/** Emit a WOFF2 font file to disk. WASM init happens on first call. */
export async function exportFontWoff2(): Promise<void> {
  const state = useStore.getState()
  try {
    const { filename, bytes, mime } = await exportWoff2(state.settings, state.glyphs)
    downloadBytes(filename, bytes, mime)
  } catch (e) {
    alert(`WOFF2 export failed: ${(e as Error).message}`)
  }
}
