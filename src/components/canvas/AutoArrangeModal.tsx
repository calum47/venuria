'use client'

import { useMemo, useState } from 'react'
import { LayoutObject, Point2D } from '@/types'
import { DbCatalogItem, DbRoom } from '@/types/db'
import {
  autoArrangeRoom,
  computeMixCapacity,
  AUTO_ARRANGE_CLEARANCE_CM,
  TableSelection,
} from '@/lib/utils/autoArrange'
import { getTableChairConfig } from '@/lib/utils/seating'

type Props = {
  catalogItems: DbCatalogItem[]
  currentRoom: DbRoom
  existingObjects: LayoutObject[]
  guestCount: number
  onClose: () => void
  onArranged: (objects: LayoutObject[]) => void
}

export default function AutoArrangeModal({
  catalogItems,
  currentRoom,
  existingObjects,
  guestCount,
  onClose,
  onArranged,
}: Props) {
  const tableItems = useMemo(
    () => catalogItems.filter((i) => i.category === 'tables' && i.name !== 'Sweetheart Table'),
    [catalogItems],
  )
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [balanceAroundSweetheart, setBalanceAroundSweetheart] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selections: TableSelection[] = tableItems
    .filter((item) => (quantities[item.id] ?? 0) > 0)
    .map((item) => ({ catalogItem: item, quantity: quantities[item.id] }))

  const capacity = computeMixCapacity(selections)
  const delta = guestCount - capacity
  const canRun = selections.length > 0 && delta === 0 && !isRunning

  const setQty = (itemId: string, next: number) => {
    setError(null)
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, next) }))
  }

  const handleRun = () => {
    setError(null)
    setIsRunning(true)

    try {
      // Same "shared master item" chair resolution used everywhere else a
      // table needs a default chair type (see handleChairCountConfirm in the
      // editor page) — Auto-Arrange doesn't introduce a separate chair-type
      // picker, it follows the existing convention.
      const chairCatalogItem =
        catalogItems.find((i) => i.category === 'chairs') ??
        catalogItems.find((i) => i.name.toLowerCase().includes('chair'))

      if (!chairCatalogItem) {
        setError('No chair catalog item found — cannot seat any tables.')
        return
      }

      // Same traced-boundary-or-fallback-rectangle logic as FloorPlanCanvas's
      // effectiveBoundaryCm (duplicated here rather than extracted into a
      // shared helper, to avoid touching that already-stable file for this).
      const boundaryPolygonCm = (currentRoom.floor_polygon as Point2D[] | undefined) ?? []
      const hasTracedBoundary = boundaryPolygonCm.length >= 3
      const effectiveBoundaryCm: Point2D[] = hasTracedBoundary
        ? boundaryPolygonCm
        : [
            { x: 0, y: 0 },
            { x: currentRoom.bounding_box_width_cm, y: 0 },
            { x: currentRoom.bounding_box_width_cm, y: currentRoom.bounding_box_depth_cm },
            { x: 0, y: currentRoom.bounding_box_depth_cm },
          ]
      const obstacles = currentRoom.obstacles ?? []

      const catalogItemsById = new Map(catalogItems.map((i) => [i.id, i]))

      const result = autoArrangeRoom({
        boundaryPolygonCm: effectiveBoundaryCm,
        obstacles,
        existingObjects,
        catalogItemsById,
        chairCatalogItem,
        tableSelections: selections,
        guestCount,
        balanceAroundSweetheart,
      })

      if (!result.success) {
        setError(result.reason)
        return
      }

      onArranged(result.objects)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl p-6 w-[28rem] max-h-[85vh] overflow-y-auto space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900">✨ Auto-Arrange</h3>
          <p className="text-sm text-gray-500 mt-0.5">{currentRoom.name}</p>
          <p className="text-xs text-gray-400 mt-1">
            Adds new tables and chairs inside the room boundary, avoiding obstacles and anything already
            placed. Doesn&apos;t move or remove anything that&apos;s already there.
          </p>
        </div>

        {tableItems.length === 0 ? (
          <p className="text-sm text-gray-500">No table catalog items available.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {tableItems.map((item) => {
              const { maxChairs, acceptsChairs } = getTableChairConfig(item.name)
              const qty = quantities[item.id] ?? 0
              return (
                <li key={item.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="text-gray-900">{item.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">
                      {acceptsChairs ? `seats ${maxChairs}` : 'standing'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty(item.id, qty - 1)}
                      disabled={qty === 0}
                      className="w-6 h-6 rounded bg-gray-100 text-gray-600 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-gray-900">{qty}</span>
                    <button
                      onClick={() => setQty(item.id, qty + 1)}
                      className="w-6 h-6 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      +
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 px-1">
          <input
            type="checkbox"
            checked={balanceAroundSweetheart}
            onChange={(e) => {
              setError(null)
              setBalanceAroundSweetheart(e.target.checked)
            }}
            className="rounded border-gray-300"
          />
          Balance around Sweetheart Table (mirrored pairs; an odd table sits centred on the aisle)
        </label>
        {balanceAroundSweetheart && (
          <p className="text-xs text-gray-400 px-1 -mt-2">
            Requires a Sweetheart Table already placed in this room, at your desired position — Auto-Arrange
            only works around it, never places or moves it.
          </p>
        )}

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm flex items-center justify-between">
          <span className="text-gray-500">Guest list</span>
          <span className="text-gray-900 font-medium">{guestCount}</span>
        </div>

        <div
          className={`rounded-lg px-3 py-2 text-sm flex items-center justify-between ${
            delta === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span>Selected seats</span>
          <span className="font-medium">
            {capacity}
            {delta !== 0 && (delta > 0 ? ` (${delta} short)` : ` (${-delta} too many)`)}
          </span>
        </div>

        <p className="text-xs text-gray-400">~{AUTO_ARRANGE_CLEARANCE_CM}cm walking-space clearance between tables.</p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="flex-1 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg disabled:opacity-30 hover:bg-gray-800 transition-colors"
          >
            {isRunning ? 'Arranging…' : 'Arrange'}
          </button>
        </div>
      </div>
    </div>
  )
}
