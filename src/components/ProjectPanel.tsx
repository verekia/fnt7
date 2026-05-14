import { useState } from 'react'

import { useStore } from '../store'

export function ProjectPanel() {
  return (
    <div className="space-y-4 px-3.5 pt-3.5">
      <FontSection />
      <MetricsSection />
      <BezierPresetsSection />
      <GridSection />
    </div>
  )
}

function FontSection() {
  const fontName = useStore(s => s.settings.fontName)
  const update = useStore(s => s.updateSettings)
  return (
    <section>
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Font</span>
      </h2>
      <label>
        <span>Name</span>
        <input type="text" value={fontName} onChange={e => update({ fontName: e.target.value })} />
      </label>
    </section>
  )
}

function MetricsSection() {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  return (
    <section>
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Metrics</span>
      </h2>
      <NumberLabel label="Units / em" value={settings.unitsPerEm} onChange={v => update({ unitsPerEm: v })} />
      <NumberLabel label="Ascender" value={settings.ascender} onChange={v => update({ ascender: v })} />
      <NumberLabel label="Cap height" value={settings.capHeight} onChange={v => update({ capHeight: v })} />
      <NumberLabel label="x-height" value={settings.xHeight} onChange={v => update({ xHeight: v })} />
      <NumberLabel label="Descender" value={settings.descender} onChange={v => update({ descender: v })} />
    </section>
  )
}

function NumberLabel({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => {
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}

function BezierPresetsSection() {
  const presets = useStore(s => s.settings.bezierPresets)
  const addPreset = useStore(s => s.addBezierPreset)
  const updatePreset = useStore(s => s.updateBezierPreset)
  const deletePreset = useStore(s => s.deleteBezierPreset)
  const [newName, setNewName] = useState('')

  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    addPreset(trimmed, 0.5)
    setNewName('')
  }

  return (
    <section>
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Bezier presets</span>
      </h2>
      <p className="text-muted-2 mb-2 text-[10px] leading-[1.5] tracking-[0.4px]">
        Named corner-rounding values. Shapes and vertices reference a preset by name. The first preset is the default.
      </p>
      <ul className="mb-2 flex flex-col gap-2">
        {presets.map((p, i) => (
          <PresetRow
            key={p.name}
            name={p.name}
            value={p.value}
            isDefault={i === 0}
            canDelete={presets.length > 1}
            onRename={n => updatePreset(p.name, { name: n })}
            onValueChange={v => updatePreset(p.name, { value: v })}
            onDelete={() => deletePreset(p.name)}
          />
        ))}
      </ul>
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="new preset name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
        <button type="button" onClick={handleAdd} disabled={!newName.trim()}>
          Add
        </button>
      </div>
    </section>
  )
}

interface PresetRowProps {
  name: string
  value: number
  isDefault: boolean
  canDelete: boolean
  onRename: (n: string) => void
  onValueChange: (v: number) => void
  onDelete: () => void
}

function PresetRow({ name, value, isDefault, canDelete, onRename, onValueChange, onDelete }: PresetRowProps) {
  const [localName, setLocalName] = useState(name)
  return (
    <li className="bg-bg-0 border-line border p-2">
      <div className="mb-1.5 flex items-center gap-1">
        <input
          type="text"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onBlur={() => {
            const trimmed = localName.trim()
            if (trimmed && trimmed !== name) onRename(trimmed)
            else setLocalName(name)
          }}
        />
        {isDefault && <span className="text-muted-2 text-[9px] tracking-[0.4px] uppercase">Default</span>}
        <button
          type="button"
          className="text-muted px-1.5"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? 'Delete preset' : 'Cannot delete the only preset'}
        >
          ×
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={e => onValueChange(parseFloat(e.target.value))}
        />
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={e => {
            const n = parseFloat(e.target.value)
            if (Number.isFinite(n)) onValueChange(Math.max(0, Math.min(1, n)))
          }}
        />
      </div>
    </li>
  )
}

function GridSection() {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  return (
    <section>
      <h2 className="panel-h2 mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase">
        <span className="ml-1">Grid</span>
      </h2>
      <NumberLabel label="Size" value={settings.gridSize} onChange={v => update({ gridSize: v })} />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.gridVisible}
          onChange={e => update({ gridVisible: e.target.checked })}
        />
        <span>Show grid</span>
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={settings.gridSnap} onChange={e => update({ gridSnap: e.target.checked })} />
        <span>Snap to grid</span>
      </label>
    </section>
  )
}
