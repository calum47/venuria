'use client'

import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject } from '@/types'
import { ChairArrangement } from '@/types'
import { recalculateChairPositions } from '@/lib/utils/seating'

type DbCatalogItem = {
  id: string
  name: string
  width_cm: number
  depth_cm: number
}

type Props = {
  object: LayoutObject | null
  catalogItems: DbCatalogItem[]
}

export default function PropertiesPanel({ object, catalogItems }: Props) {
  const { updateObject, removeObjectWithChairs, selectObject, rotateObjectWithChairs } = useLayoutStore()

  if (!object) return null

  const catalogItem = catalogItems.find((i) => i.id === object.catalogItemId)

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (isNaN(value)) return
    rotateObjectWithChairs(object.id, value % 360)
  }

  const handlePositionChange = (axis: 'x' | 'y', e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (isNaN(value)) return
    updateObject(object.id, {
      positionCm: {
        ...object.positionCm,
        [axis]: value,
      }
    })
  }

  const handleDelete = () => {
    removeObjectWithChairs(object.id)
    selectObject(null)
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

      {/* Properties */}
      <div className="flex-1 p-4 space-y-4">
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

        {/* Table Label — only for tables */}
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

        {/* Chair Arrangement — rectangular tables only */}
        {object.chairCount && !catalogItem?.name.toLowerCase().includes('round') && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Chair Arrangement
            </p>
            <div className="space-y-1">
              {(['all-sides', 'long-only', 'short-only'] as ChairArrangement[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    const chairs = useLayoutStore.getState().layoutObjects.filter(
                      (o) => o.isChairFor === object.id
                    )
                    const chairItem = useLayoutStore.getState().layoutObjects
                      .find((o) => o.isChairFor === object.id)

                    if (!chairItem || !catalogItem) return

                    const chairCatalogItem = catalogItems.find(
                      (i) => i.id === object.chairCatalogItemId
                    )
                    if (!chairCatalogItem) return

                    const updated = recalculateChairPositions(
                      { ...object, chairArrangement: opt },
                      catalogItem.width_cm,
                      catalogItem.depth_cm,
                      false,
                      chairCatalogItem.width_cm,
                      chairCatalogItem.depth_cm,
                      chairs,
                      opt
                    )
                    updated.forEach((chair) =>
                      updateObject(chair.id, {
                        positionCm: chair.positionCm,
                        rotationDeg: chair.rotationDeg,
                        chairEdge: chair.chairEdge,
                      })
                    )
                    updateObject(object.id, { chairArrangement: opt })
                  }}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                    (object.chairArrangement ?? 'all-sides') === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt === 'all-sides' && 'All sides'}
                  {opt === 'long-only' && 'Long sides only'}
                  {opt === 'short-only' && 'Short sides only'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick rotate buttons */}
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