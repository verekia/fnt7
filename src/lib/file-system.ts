interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[]
  multiple?: boolean
}

interface FileSystemFileHandleLike {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableLike>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

interface FileSystemWritableLike {
  write(data: BufferSource | Blob | string): Promise<void>
  close(): Promise<void>
}

declare global {
  interface Window {
    showOpenFilePicker?: (opts?: OpenFilePickerOptions) => Promise<FileSystemFileHandleLike[]>
    showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>
  }
}

const SVG_TYPES = [{ description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } }]

export type FileHandle = FileSystemFileHandleLike

export const supportsFsApi = (): boolean =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

export interface OpenedFile {
  name: string
  text: string
  handle: FileHandle | null
}

export async function pickAndOpenFile(): Promise<OpenedFile | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: SVG_TYPES })
      const file = await handle.getFile()
      const text = await file.text()
      return { name: handle.name, text, handle }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null
      throw e
    }
  }
  return openFileFallback()
}

function openFileFallback(): Promise<OpenedFile | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,image/svg+xml'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const text = await file.text()
      resolve({ name: file.name, text, handle: null })
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export async function writeToHandle(handle: FileHandle, data: BufferSource | Blob | string): Promise<void> {
  if (handle.requestPermission) {
    const state = await handle.requestPermission({ mode: 'readwrite' })
    if (state !== 'granted') throw new Error('Write permission denied')
  }
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}

export async function pickSaveHandle(
  suggestedName: string,
  types: { description: string; accept: Record<string, string[]> }[] = SVG_TYPES,
): Promise<FileHandle | null> {
  if (!window.showSaveFilePicker) return null
  try {
    return await window.showSaveFilePicker({ suggestedName, types })
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null
    throw e
  }
}

export function downloadText(name: string, text: string, mime = 'image/svg+xml'): void {
  const blob = new Blob([text], { type: mime })
  triggerDownload(name, blob)
}

export function downloadBytes(name: string, bytes: ArrayBuffer | Uint8Array, mime: string): void {
  // Normalize to a fresh ArrayBuffer-backed Uint8Array so the Blob constructor
  // stays happy across BufferSource variants (Blob rejects SharedArrayBuffer).
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const copy = new Uint8Array(src.byteLength)
  copy.set(src)
  const blob = new Blob([copy], { type: mime })
  triggerDownload(name, blob)
}

function triggerDownload(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
