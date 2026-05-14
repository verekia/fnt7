import type { ReactElement } from 'react'

import { useStore } from '../store'

import type { Tool } from '../types'

const TOOLS: { id: Tool; label: string; key: string; icon: () => ReactElement }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: SelectIcon },
  { id: 'polygon', label: 'Polygon', key: 'P', icon: PolygonIcon },
]

export function Toolbar() {
  const tool = useStore(s => s.tool)
  const setTool = useStore(s => s.setTool)

  return (
    <div className="flex items-center gap-1">
      {TOOLS.map(t => {
        const Icon = t.icon
        const isActive = tool === t.id
        const cls = isActive
          ? 'flex items-center justify-center w-7 h-7 p-0 bg-accent text-white border-accent shadow-[0_0_0_1px_rgba(255,59,48,0.25)]'
          : 'flex items-center justify-center w-7 h-7 p-0 text-muted'
        return (
          <button
            key={t.id}
            type="button"
            className={cls}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
            aria-label={t.label}
          >
            <Icon />
          </button>
        )
      })}
    </div>
  )
}

function SelectIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path
        d="M3 2l8 7-3.5.6L9.5 14l-1.7.7-1.9-4-2.9 2z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PolygonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <polygon
        points="8,2 14,6.5 11.5,13.5 4.5,13.5 2,6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
