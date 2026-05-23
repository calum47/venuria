'use client'

import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject, ChairSides } from '@/types'
import { DbCatalogItem } from '@/types/db'
import { generateId } from '@/lib/utils/coordinates'
import { generateChairObjects, getTableChairConfig, calculateChairPositionsFromSides } from '@/lib/utils/seating'

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  object: LayoutObject | null
  catalogItems: DbCatalogItem[]
}

const DEFAULT_SIDES: ChairSides = { top: true, bottom: true, left: true, right: true }

// calculateChairPositionsFromSides returns {x, y, rotationDeg}.
// This maps rotationDeg back to the chairEdge label used in the store.
const ROTATION_TO_EDGE: Record<number, 'top' | 'bottom' | 'left' | 'right'> = {
  180: 'top',
  0:   'bottom',
  90:  'left',
  270: 'right',
}

export default function PropertiesPanel({ object, catalogItems }: Props) {
  const {
    updateObject,
    removeObjectWithChairs,
    selectObject,
    rotateObjectWithChairs,
    addObjects,
    layoutObjects,
  } = useLayoutStore()

  if (!object) return null

  // ── Derived values ──────────────────────────────────────────────────────────

  const catalogItem       = catalogItems.find((i) => i.id === object.catalogItemId)
  const isTable           = !object.isChairFor && catalogItem?.category !== 'chairs'
  const isRectTable       = isTable && !catalogItem?.name?.toLowerCase().includes('round')
  const tableConfig       = isTable && catalogItem ? getTableChairConfig(catalogItem.name) : null
  const currentChairCount = isTable
    ? layoutObjects.filter((o) => o.isChairFor === object.id).length
    : 0
  const canAddChairs = isTable
    && tableConfig?.acceptsChairs
    && currentChairCount < (tableConfig?.maxChairs ?? 0)
  const currentSides = object.chairSides ?? DEFAULT_SIDES

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (isNaN(value)) return
    rotateObjectWithChairs(object.id, value % 360)
  }

  const handlePositionChange = (axis: 'x' | 'y', e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (isNaN(value)) return
    updateObject(object.id, { positionCm: { ...object.positionCm, [axis]: value } })
  }

  const handleDelete = () => {
    removeObjectWithChairs(object.id)
    selectObject(null)
  }

  const handleAddChairs = (count: number) => {
    if (!catalogItem) return
    const chairItem = catalogItems.find((i) => i.category === 'chairs')
      ?? catalogItems.find((i) => i.name.toLowerCase().includes('chair'))
    if (!chairItem) return

    const isRound  = catalogItem.name.toLowerCase().includes('round')
    const newTotal = currentChairCount + count

    if (isRound) {
      const allChairs = generateChairObjects(
        object,
        catalogItem.width_cm,
        catalogItem.depth_cm,
        true,
        newTotal,
        chairItem.id,
        chairItem.width_cm,
        chairItem.depth_cm,
      )
      const newChairs = allChairs.slice(currentChairCount)
      updateObject(object.id, {
        chairCount: newTotal,
        chairCatalogItemId: chairItem.id,
        chairIds: [...(object.chairIds ?? []), ...newChairs.map((c) => c.id)],
      })
      addObjects(newChairs)
    } else {
      // Recalculate all positions for the new total, then reposition existing + create new
      const positions = calculateChairPositionsFromSides(
        object.positionCm.x,
        object.positionCm.y,
        catalogItem.width_cm,
        catalogItem.depth_cm,
        newTotal,
        chairItem.depth_cm,
        currentSides,
      )

      const existingChairs = layoutObjects.filter((o) => o.isChairFor === object.id)
      existingChairs.forEach((chair, i) => {
        const pos = positions[i]
        if (!pos) return
        updateObject(chair.id, {
          positionCm: { x: pos.x, y: pos.y },
          rotationDeg: pos.rotationDeg,
          chairEdge: ROTATION_TO_EDGE[pos.rotationDeg] ?? 'top',
        })
      })

      const newChairObjects = positions.slice(currentChairCount).map((pos) => ({
        id: generateId(),
        catalogItemId: chairItem.id,
        positionCm: { x: pos.x, y: pos.y },
        rotationDeg: pos.rotationDeg,
        quantity: 1,
        isChairFor: object.id,
        chairEdge: ROTATION_TO_EDGE[pos.rotationDeg] ?? 'top' as any,
      }))

      updateObject(object.id, {
        chairCount: newTotal,
        chairCatalogItemId: chairItem.id,
        chairIds: [...(object.chairIds ?? []), ...newChairObjects.map((c) => c.id)],
      })
      addObjects(newChairObjects)
    }
  }

  const handleSideToggle = (side: keyof ChairSides) => {
    if (!catalogItem) return

    const newSides: ChairSides = { ...currentSides, [side]: !currentSides[side] }

    // Don't allow disabling the last remaining side
    if (!Object.values(newSides).some(Boolean)) return

    // Prefer the chair item originally used for this table
    const chairItem = catalogItems.find((i) => i.id === object.chairCatalogItemId)
      ?? catalogItems.find((i) => i.category === 'chairs')
      ?? catalogItems.find((i) => i.name.toLowerCase().includes('chair'))
    if (!chairItem) return

    const existingChairs = layoutObjects.filter((o) => o.isChairFor === object.id)
    if (existingChairs.length === 0) return

    // calculateChairPositionsFromSides returns {x, y, rotationDeg} — NOT {positionCm, chairEdge}.
    // We must map x/y → positionCm and derive chairEdge from rotationDeg via ROTATION_TO_EDGE.
    const positions = calculateChairPositionsFromSides(
      object.positionCm.x,
      object.positionCm.y,
      catalogItem.width_cm,
      catalogItem.depth_cm,
      existingChairs.length,
      chairItem.depth_cm,
      newSides,
    )

    existingChairs.forEach((chair, i) => {
      const pos = positions[i]
      if (!pos) return
      updateObject(chair.id, {
        positionCm: { x: pos.x, y: pos.y },   // x/y → positionCm
        rotationDeg: pos.rotationDeg,
        chairEdge: ROTATION_TO_EDGE[pos.rotationDeg] ?? 'top',
      })
    })

    // Save the new side config on the table itself
    updateObject(object.id, {
      chairSides: newSides,
      chairCatalogItemId: chairItem.id,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-56 h-full bg-white border-l border-gray-200 flex flex-col">

      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Selected</p>
        <h3 className="font-semibold text-gray-800 mt-0.5">
          {catalogItem?.name ?? object.catalogItemId}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Position */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Position</p>
          <div className="space-y-2">
            {(['x', 'y'] as const).map((axis) => (
              <div key={axis} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-4">{axis.toUpperCase()}</span>
                <input
                  type="number"
                  value={Math.round(object.positionCm[axis])}
                  onChange={(e) => handlePositionChange(axis, e)}
                  className="flex-1 text-sm border border-gray-200 rounded px-2 py-1
                             focus:outline-none focus:border-blue-400"
                />
                <span className="text-xs text-gray-400">cm</span>
              </div>
            ))}
          </div>
        </div>

        {/* Size (read-only) */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Size</p>
          <div className="space-y-2">
            {[
              { label: 'W', value: catalogItem?.width_cm },
              { label: 'D', value: catalogItem?.depth_cm },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-4">{label}</span>
                <div className="flex-1 text-sm bg-gray-50 border border-gray-200
                                rounded px-2 py-1 text-gray-600">
                  {value ?? '—'}
                </div>
                <span className="text-xs text-gray-400">cm</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rotation */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Rotation</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={Math.round(object.rotationDeg)}
              onChange={handleRotationChange}
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1
                         focus:outline-none focus:border-blue-400"
            />
            <span className="text-xs text-gray-400">°</span>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-2">
            {[0, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                onClick={() => rotateObjectWithChairs(object.id, deg)}
                className="text-xs py-1 rounded border border-gray-200
                           text-gray-600 hover:bg-blue-50 hover:border-blue-400
                           hover:text-blue-700 transition-colors"
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>

        {/* Table label */}
        {isTable && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Label</p>
            <input
              type="text"
              placeholder="e.g. Table 1, Bride & Groom…"
              value={object.tableLabel ?? ''}
              onChange={(e) => updateObject(object.id, { tableLabel: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1
                         focus:outline-none focus:border-blue-400"
            />
          </div>
        )}

        {/* Table note */}
        {isTable && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Note</p>
            <textarea
              placeholder="e.g. 2 vegetarian guests…"
              value={object.tableNote ?? ''}
              onChange={(e) => updateObject(object.id, { tableNote: e.target.value || undefined })}
              rows={2}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1
                         focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
        )}

        {/* Per-side chair arrangement (rectangular tables only) */}
        {isRectTable && currentChairCount > 0 && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Chair Sides</p>
            <div className="grid grid-cols-2 gap-1">
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => handleSideToggle(side)}
                  className={`text-xs py-1.5 rounded border capitalize transition-colors ${
                    currentSides[side]
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mirror drag toggle */}
        {isTable && currentChairCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Mirror drag</span>
            <button
              onClick={() => updateObject(object.id, { mirrorEnabled: !(object.mirrorEnabled ?? true) })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                (object.mirrorEnabled ?? true) ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                (object.mirrorEnabled ?? true) ? 'translate-x-5' : 'translate-x-1'
              }`} />
            </button>
          </div>
        )}

        {/* Add more chairs */}
        {canAddChairs && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Add Chairs
              <span className="text-gray-300 ml-1">
                ({currentChairCount}/{tableConfig?.maxChairs})
              </span>
            </p>
            <div className="grid grid-cols-3 gap-1">
              {[1, 2, 4]
                .filter((n) => currentChairCount + n <= (tableConfig?.maxChairs ?? 0))
                .map((n) => (
                  <button
                    key={n}
                    onClick={() => handleAddChairs(n)}
                    className="text-xs py-1.5 rounded border border-gray-200
                               text-gray-600 hover:bg-green-50 hover:border-green-400
                               hover:text-green-700 transition-colors"
                  >
                    +{n}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleDelete}
          className="w-full py-2 text-sm text-red-500 border border-red-200
                     rounded-lg hover:bg-red-50 transition-colors"
        >
          Remove from layout
        </button>
      </div>
    </div>
  )
}