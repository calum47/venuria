'use client'

import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject, ChairSides } from '@/types'
import { generateId } from '@/lib/utils/coordinates'
import { generateChairObjects, getTableChairConfig, calculateChairPositionsFromSides } from '@/lib/utils/seating'

type DbCatalogItem = {
  id: string
  name: string
  width_cm: number
  depth_cm: number
  category?: string
}

type Props = {
  object: LayoutObject | null
  catalogItems: DbCatalogItem[]
}

const DEFAULT_SIDES: ChairSides = { top: true, bottom: true, left: true, right: true }

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

  const catalogItem = catalogItems.find((i) => i.id === object.catalogItemId)
  const isTable = !object.isChairFor && catalogItem?.category !== 'chairs'
  const isRectTable = isTable && !catalogItem?.name?.toLowerCase().includes('round')
  const tableConfig = isTable && catalogItem ? getTableChairConfig(catalogItem.name) : null
  const currentChairCount = isTable
    ? layoutObjects.filter((o) => o.isChairFor === object.id).length
    : 0
  const canAddChairs = isTable &&
    tableConfig?.acceptsChairs &&
    currentChairCount < (tableConfig?.maxChairs ?? 0)
  const currentSides = object.chairSides ?? DEFAULT_SIDES

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (isNaN(value)) return
    rotateObjectWithChairs(object.id, value % 360)
  }

  const handlePositionChange = (axis: 'x' | 'y', e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (isNaN(value)) return
    updateObject(object.id, {
      positionCm: { ...object.positionCm, [axis]: value }
    })
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

    const isRound = catalogItem.name.toLowerCase().includes('round')
    const newTotal = currentChairCount + count

    if (isRound) {
      // For round tables generate all positions and only add the new ones
      const allChairs = generateChairObjects(
        object,
        catalogItem.width_cm,
        catalogItem.depth_cm,
        true,
        newTotal,
        chairItem.id,
        chairItem.width_cm,
        chairItem.depth_cm
      )
      // Only take the last `count` chairs (the new ones)
      const newChairs = allChairs.slice(currentChairCount)
      updateObject(object.id, {
        chairCount: newTotal,
        chairCatalogItemId: chairItem.id,
        chairIds: [...(object.chairIds ?? []), ...newChairs.map((c) => c.id)],
      })
      addObjects(newChairs)
    } else {
      // For rect tables recalculate all positions with new total and current sides
      const sides = object.chairSides ?? DEFAULT_SIDES
      const positions = calculateChairPositionsFromSides(
        object.positionCm.x,
        object.positionCm.y,
        catalogItem.width_cm,
        catalogItem.depth_cm,
        newTotal,
        chairItem.depth_cm,
        sides
      )

      const edgeMap: Record<number, 'top' | 'bottom' | 'left' | 'right'> = {
        180: 'top', 0: 'bottom', 90: 'left', 270: 'right'
      }

      // Update existing chairs with new positions
      const existingChairs = layoutObjects.filter((o) => o.isChairFor === object.id)
      existingChairs.forEach((chair, i) => {
        if (positions[i]) {
          updateObject(chair.id, {
            positionCm: { x: positions[i].x, y: positions[i].y },
            rotationDeg: positions[i].rotationDeg,
            chairEdge: edgeMap[positions[i].rotationDeg] ?? 'top',
          })
        }
      })

      // Create new chairs for the added slots
      const newChairObjects = positions.slice(currentChairCount).map((pos) => ({
        id: generateId(),
        catalogItemId: chairItem.id,
        positionCm: { x: pos.x, y: pos.y },
        rotationDeg: pos.rotationDeg,
        quantity: 1,
        isChairFor: object.id,
        chairEdge: edgeMap[pos.rotationDeg] ?? 'top' as any,
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
    const newSides = { ...currentSides, [side]: !currentSides[side] }
    if (!Object.values(newSides).some(Boolean)) return

    const chairItem = catalogItems.find((i) => i.id === object.chairCatalogItemId)
      ?? catalogItems.find((i) => i.category === 'chairs')
    if (!chairItem) return

    const existingChairs = layoutObjects.filter((o) => o.isChairFor === object.id)
    if (existingChairs.length === 0) return

    const positions = calculateChairPositionsFromSides(
      object.positionCm.x,
      object.positionCm.y,
      catalogItem.width_cm,
      catalogItem.depth_cm,
      existingChairs.length,
      chairItem.depth_cm,
      newSides
    )

    const edgeMap: Record<number, 'top' | 'bottom' | 'left' | 'right'> = {
      180: 'top', 0: 'bottom', 90: 'left', 270: 'right'
    }

    // Update ALL existing chairs with new positions
    existingChairs.forEach((chair, i) => {
      const pos = positions[i]
      if (pos) {
        updateObject(chair.id, {
          positionCm: { x: pos.x, y: pos.y },
          rotationDeg: pos.rotationDeg,
          chairEdge: edgeMap[pos.rotationDeg] ?? 'top',
        })
      }
    })

    updateObject(object.id, {
      chairSides: newSides,
      chairCatalogItemId: chairItem.id,
    })
  }

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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">X</span>
              <input
                type="number"
                value={Math.round(object.positionCm.x)}
                onChange={(e) => handlePositionChange('x', e)}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1
                           focus:outline-none focus:border-blue-400"
              />
              <span className="text-xs text-gray-400">cm</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">Y</span>
              <input
                type="number"
                value={Math.round(object.positionCm.y)}
                onChange={(e) => handlePositionChange('y', e)}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1
                           focus:outline-none focus:border-blue-400"
              />
              <span className="text-xs text-gray-400">cm</span>
            </div>
          </div>
        </div>

        {/* Size */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Size</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">W</span>
              <div className="flex-1 text-sm bg-gray-50 border border-gray-200
                              rounded px-2 py-1 text-gray-600">
                {catalogItem?.width_cm ?? '—'}
              </div>
              <span className="text-xs text-gray-400">cm</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">D</span>
              <div className="flex-1 text-sm bg-gray-50 border border-gray-200
                              rounded px-2 py-1 text-gray-600">
                {catalogItem?.depth_cm ?? '—'}
              </div>
              <span className="text-xs text-gray-400">cm</span>
            </div>
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
              min={0}
              max={359}
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1
                         focus:outline-none focus:border-blue-400"
            />
            <span className="text-xs text-gray-400">deg</span>
          </div>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(object.rotationDeg)}
            onChange={handleRotationChange}
            className="w-full mt-2"
          />
        </div>

        {/* Quick Rotate */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Quick Rotate</p>
          <div className="grid grid-cols-4 gap-1">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <button
                key={angle}
                onClick={() => rotateObjectWithChairs(object.id, angle)}
                className={`text-xs py-1 rounded border transition-colors ${
                  Math.round(object.rotationDeg) === angle
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {angle}°
              </button>
            ))}
          </div>
        </div>

        {/* Table Label */}
        {!object.isChairFor && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Table Label
            </p>
            <input
              type="text"
              placeholder="e.g. Table 1, Bride & Groom..."
              value={object.tableLabel ?? ''}
              onChange={(e) =>
                updateObject(object.id, { tableLabel: e.target.value || undefined })
              }
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5
                         focus:outline-none focus:border-blue-400 placeholder:text-gray-300"
            />
            {object.tableLabel && (
              <button
                onClick={() => updateObject(object.id, { tableLabel: undefined })}
                className="text-xs text-gray-400 hover:text-gray-600 mt-1"
              >
                Clear label
              </button>
            )}
          </div>
        )}

        {/* Table Note */}
        {!object.isChairFor && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Note</p>
            <textarea
              placeholder="e.g. Vegetarian table, 2 high chairs needed..."
              value={object.tableNote ?? ''}
              onChange={(e) =>
                updateObject(object.id, { tableNote: e.target.value || undefined })
              }
              rows={3}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5
                         focus:outline-none focus:border-blue-400 placeholder:text-gray-300
                         resize-none"
            />
            {object.tableNote && (
              <button
                onClick={() => updateObject(object.id, { tableNote: undefined })}
                className="text-xs text-gray-400 hover:text-gray-600 mt-1"
              >
                Clear note
              </button>
            )}
          </div>
        )}

        {/* Chair Sides — rectangular tables with chairs */}
        {isRectTable && currentChairCount > 0 && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Chair Sides
            </p>
            <div className="space-y-1.5">
              {(['top', 'bottom', 'left', 'right'] as Array<keyof ChairSides>).map((side) => (
                <label key={side} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentSides[side]}
                    onChange={() => handleSideToggle(side)}
                    className="rounded border-gray-300 text-blue-600
                               focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-600 capitalize">{side}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Mirror drag toggle — tables with chairs */}
        {isTable && currentChairCount > 0 && tableConfig?.acceptsChairs && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Mirror drag</span>
            <button
              onClick={() => updateObject(object.id, {
                mirrorEnabled: !(object.mirrorEnabled ?? true)
              })}
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
              {[1, 2, 4].filter(
                (n) => currentChairCount + n <= (tableConfig?.maxChairs ?? 0)
              ).map((n) => (
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