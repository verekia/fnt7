import { useEffect } from 'react'

import { GlyphCanvas } from './components/GlyphCanvas'
import { GlyphInspector } from './components/GlyphInspector'
import { GridView } from './components/GridView'
import { ProjectPanel } from './components/ProjectPanel'
import { Statusbar } from './components/Statusbar'
import { TextPreview } from './components/TextPreview'
import { Topbar } from './components/Topbar'
import { openDroppedFile } from './lib/file-ops'
import { useStore } from './store'

import type { FileHandle } from './lib/file-system'

export function App() {
  const viewMode = useStore(s => s.viewMode)
  const dirty = useStore(s => s.dirty)

  // Warn before leaving when there are unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Drag-drop an SVG to load the project.
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
      if (!/\.svg$|svg\+xml/i.test(file.name + ' ' + file.type)) {
        alert('Please drop an SVG file.')
        return
      }
      const item = e.dataTransfer?.items?.[0] as
        | (DataTransferItem & { getAsFileSystemHandle?: () => Promise<{ kind: string } | null> })
        | undefined
      const handlePromise = item?.getAsFileSystemHandle
        ? item
            .getAsFileSystemHandle()
            .then(h => (h && h.kind === 'file' ? (h as unknown as FileHandle) : null))
            .catch(() => null)
        : Promise.resolve(null)
      void handlePromise.then(h => openDroppedFile(file, h))
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
      <Topbar />
      <main className="grid min-h-0 grid-cols-[260px_1fr_300px]">
        <aside className="panel-surface border-line overflow-y-auto border-r pb-6">
          <ProjectPanel />
        </aside>
        <div className="relative min-h-0 overflow-hidden">
          {viewMode === 'grid' && <GridView />}
          {viewMode === 'single' && <GlyphCanvas />}
          {viewMode === 'text' && <TextPreview />}
        </div>
        <aside className="panel-surface border-line overflow-y-auto border-l pb-6">
          <GlyphInspector />
        </aside>
      </main>
      <Statusbar />
    </>
  )
}
