import { exportFontOtf, exportFontWoff2, newProject, openFile, saveFile, saveFileAs } from '../lib/file-ops'
import { useStore } from '../store'
import { Toolbar } from './Toolbar'
import { ViewModeSwitch } from './ViewModeSwitch'

export function Topbar() {
  const fileName = useStore(s => s.fileName)
  const dirty = useStore(s => s.dirty)
  const canUndo = useStore(s => s.past.length > 0)
  const canRedo = useStore(s => s.future.length > 0)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const viewMode = useStore(s => s.viewMode)

  return (
    <header className="topbar-surface border-line relative grid grid-cols-[1fr_auto_1fr] items-center border-b px-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-accent font-bold tracking-[1px] [text-shadow:0_0_12px_rgba(255,59,48,0.45)]">
          / FNT7 /
        </span>
        <span className="text-muted ml-3 text-[11px] tracking-[0.5px]">{fileName}</span>
        <span className="text-accent inline-block w-2.5 text-center">{dirty ? '●' : ''}</span>
      </div>
      <div className="flex items-center gap-3 py-1.5">
        <ViewModeSwitch />
        {viewMode === 'single' && (
          <>
            <span className="bg-line h-5 w-px" aria-hidden />
            <Toolbar />
          </>
        )}
      </div>
      <div className="flex gap-1 justify-self-end">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
          Redo
        </button>
        <button onClick={newProject} title="New project">
          New
        </button>
        <button onClick={openFile} title="Open project SVG">
          Open
        </button>
        <button onClick={saveFile} title="Save project SVG (Ctrl/Cmd+S)">
          Save
        </button>
        <button onClick={saveFileAs} title="Save As">
          Save As
        </button>
        <button onClick={exportFontOtf} title="Export OTF font file">
          OTF
        </button>
        <button onClick={exportFontWoff2} title="Export WOFF2 font file">
          WOFF2
        </button>
      </div>
    </header>
  )
}
