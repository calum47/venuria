'use client'

import { useState } from 'react'
import { useZoneStore } from '@/stores/zoneStore'
import { ZONE_PALETTE, ZONE_PRESETS, zoneAreaM2, type ZoneTool } from '@/lib/zones'

type Props = { roomName: string }

export default function ZonePanel({ roomName }: Props) {
  const {
    zones,
    zoneTool,
    setZoneTool,
    selectedZoneId,
    selectZone,
    pendingPreset,
    setPendingPreset,
    updateZone,
    deleteZone,
  } = useZoneStore()
  const [customName, setCustomName] = useState('')

  const isCustom = !ZONE_PRESETS.some((p) => p.name === pendingPreset.name)

  return (
    <div className="w-64 h-full bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Zones</p>
        <h3 className="font-semibold text-gray-800 mt-0.5">{roomName}</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Tool */}
        <section>
          <p className="text-xs text-gray-500 mb-1.5">Tool</p>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ['select', '↖ Select'],
                ['rect', '▭ Rect'],
                ['polygon', '⬠ Poly'],
              ] as [ZoneTool, string][]
            ).map(([tool, label]) => (
              <button
                key={tool}
                onClick={() => setZoneTool(tool)}
                className={`py-1.5 text-xs rounded-md transition-colors ${
                  zoneTool === tool ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
            {zoneTool === 'rect' && 'Drag on the canvas to draw a rectangle.'}
            {zoneTool === 'polygon' && 'Click to add corners, double-click to finish. Esc cancels.'}
            {zoneTool === 'select' && 'Click a zone to select it; drag to move; drag the handles to reshape. Delete key removes it.'}
          </p>
        </section>

        {/* Next zone preset */}
        <section>
          <p className="text-xs text-gray-500 mb-1.5">New zones are</p>
          <div className="flex flex-wrap gap-1">
            {ZONE_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setPendingPreset(p)}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors ${
                  pendingPreset.name === p.name ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setPendingPreset({ name: customName.trim() || 'Custom', color: pendingPreset.color })}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                isCustom ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Custom…
            </button>
          </div>
          {isCustom && (
            <input
              value={customName}
              onChange={(e) => {
                setCustomName(e.target.value)
                setPendingPreset({ name: e.target.value.trim() || 'Custom', color: pendingPreset.color })
              }}
              placeholder="Zone name"
              className="mt-2 w-full border border-gray-200 rounded-md px-2 py-1 text-sm"
            />
          )}
        </section>

        {/* Zone list */}
        <section>
          <p className="text-xs text-gray-500 mb-1.5">In this room ({zones.length})</p>
          {zones.length === 0 ? (
            <p className="text-xs text-gray-400">No zones yet. Pick a tool above and draw one.</p>
          ) : (
            <ul className="space-y-1">
              {zones.map((z) => {
                const selected = z.id === selectedZoneId
                return (
                  <li
                    key={z.id}
                    onClick={() => { selectZone(z.id); setZoneTool('select') }}
                    className={`rounded-md border px-2 py-1.5 cursor-pointer ${
                      selected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        title="Change colour"
                        onClick={(e) => {
                          e.stopPropagation()
                          const idx = ZONE_PALETTE.indexOf(z.color as (typeof ZONE_PALETTE)[number])
                          const next = ZONE_PALETTE[(idx + 1) % ZONE_PALETTE.length]
                          updateZone(z.id, { color: next })
                        }}
                        className="w-4 h-4 rounded-sm shrink-0 border border-black/10"
                        style={{ backgroundColor: z.color }}
                      />
                      <input
                        value={z.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => useZoneStore.getState().updateZoneLocal(z.id, { name: e.target.value })}
                        onBlur={(e) => updateZone(z.id, { name: e.target.value.trim() || 'Zone' })}
                        className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 outline-none"
                      />
                      <span className="text-[11px] text-gray-400 shrink-0">{zoneAreaM2(z).toFixed(1)} m²</span>
                      <button
                        title="Delete zone"
                        onClick={(e) => { e.stopPropagation(); deleteZone(z.id) }}
                        className="text-gray-300 hover:text-red-500 text-sm leading-none shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="p-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 leading-snug">
          Auto-Arrange keeps tables out of every zone. Click the swatch to cycle colours.
        </p>
      </div>
    </div>
  )
}
