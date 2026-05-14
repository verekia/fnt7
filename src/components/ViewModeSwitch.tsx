import { useStore } from '../store'

import type { ViewMode } from '../types'

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'single', label: 'Glyph' },
  { id: 'text', label: 'Text' },
]

export function ViewModeSwitch() {
  const viewMode = useStore(s => s.viewMode)
  const setViewMode = useStore(s => s.setViewMode)

  return (
    <div className="flex items-center gap-px">
      {MODES.map(m => {
        const active = viewMode === m.id
        const cls = active
          ? 'h-7 px-3 text-[11px] tracking-[0.5px] bg-accent text-white border-accent'
          : 'h-7 px-3 text-[11px] tracking-[0.5px] text-muted'
        return (
          <button key={m.id} type="button" className={cls} onClick={() => setViewMode(m.id)}>
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
