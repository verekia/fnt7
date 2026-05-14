import { useStore } from '../store'

export function Statusbar() {
  const viewMode = useStore(s => s.viewMode)

  return (
    <footer className="statusbar-surface border-line text-muted flex items-center gap-3.5 border-t px-3.5 text-[10px] tracking-[1px] uppercase">
      {viewMode === 'grid' && (
        <>
          <span>Click a cell to edit</span>
          <span>Dashed border: lowercase falling back to uppercase</span>
        </>
      )}
      {viewMode === 'single' && (
        <>
          <span>P: polygon · V: select</span>
          <span>Esc: cancel</span>
          <span>Enter / dbl-click: close polygon</span>
          <span>Space + drag: pan</span>
          <span>Wheel: zoom</span>
        </>
      )}
      {viewMode === 'text' && <span>Type into the preview to compose with your glyphs</span>}
    </footer>
  )
}
