'use client'

import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject, ChairSides } from '@/types'
import { DbCatalogItem, DbTableSettingTemplate } from '@/types/db'
import TableSettingSection from './TableSettingSection'
import { generateId } from '@/lib/utils/coordinates'
import { generateChairObjects, getTableChairConfig, calculateChairPositionsFromSides } from '@/lib/utils/seating'

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  object: LayoutObject | null
  catalogItems: DbCatalogItem[]
  /** Scoped items a table setting can use (plates, cutlery, glassware, candles, flowers…). */
  settingItems: DbCatalogItem[]
  templates: DbTableSettingTemplate[]
  onManageTemplates: () => void
}

// Quick-rotate presets: the four right angles plus the diagonals between them.
const ROTATION_OPTIONS = [0, 45, 90, 135, 180, 225, 270, 315]

const DEFAULT_SIDES: ChairSides = { top: true, bottom: true, left: true, right: true }

// calculateChairPositionsFromSides returns {x, y, rotationDeg}.
// This maps rotationDeg back to the chairEdge label used in the store.
const ROTATION_TO_EDGE: Record<number, 'top' | 'bottom' | 'left' | 'right'> = {
  180: 'top',
  0:   'bottom',
  90:  'left',
  270: 'right',
}

export default function PropertiesPanel({ object, catalogItems, settingItems, templates, onManageTemplates }: Props) {
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
        chairEdge: ROTATION_TO_EDGE[pos.rotationDeg] ?? 'top',
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

  const isRealTable   = !object.isChairFor && catalogItem?.category === 'tables'
  const settingCount  = object.tableSetting?.items.length ?? 0
  const showSeating   = isTable && (currentChairCount > 0 || canAddChairs)
  const currentRotation = ((Math.round(object.rotationDeg) % 360) + 360) % 360

  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col">

      {/* Header: what is selected, its size, and (for tables) its label */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 space-y-2">
        <div>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Selected</p>
          <h3 className="font-semibold text-gray-800 mt-0.5 leading-snug">
            {catalogItem?.name ?? object.catalogItemId}
          </h3>
          {catalogItem && (
            <p className="text-xs text-gray-400 mt-0.5">{catalogItem.width_cm} × {catalogItem.depth_cm} cm</p>
          )}
        </div>
        {isTable && (
          <input
            type="text"
            aria-label="Table label"
            placeholder="Label — e.g. Table 1, Bride & Groom…"
            value={object.tableLabel ?? ''}
            onChange={(e) => updateObject(object.id, { tableLabel: e.target.value || undefined })}
            className="w-full min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5
                       focus:outline-none focus:border-blue-400"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Rotation and seating */}
        <Section title="Rotation and seating" hint={showSeating ? `${currentChairCount} chair${currentChairCount === 1 ? '' : 's'}` : undefined}>
          <div>
            <p className="text-[11px] text-gray-400 mb-1">Rotation</p>
            <div className="grid grid-cols-4 gap-1">
              {ROTATION_OPTIONS.map((deg) => (
                <button
                  key={deg}
                  onClick={() => rotateObjectWithChairs(object.id, deg)}
                  className={`text-xs py-1 rounded-lg border transition-colors ${
                    currentRotation === deg
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>

          {showSeating && (
            <>
              {isRectTable && currentChairCount > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Chair sides</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => handleSideToggle(side)}
                        className={`text-xs py-1.5 rounded-lg border capitalize transition-colors ${
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

              {canAddChairs && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">
                    Add chairs <span className="text-gray-300">({currentChairCount}/{tableConfig?.maxChairs})</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 4]
                      .filter((n) => currentChairCount + n <= (tableConfig?.maxChairs ?? 0))
                      .map((n) => (
                        <button
                          key={n}
                          onClick={() => handleAddChairs(n)}
                          className="text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600
                                     hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
                        >
                          +{n}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {currentChairCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Mirror drag</span>
                  <button
                    onClick={() => updateObject(object.id, { mirrorEnabled: !(object.mirrorEnabled ?? true) })}
                    aria-label="Toggle mirror drag"
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
            </>
          )}
        </Section>

        {/* Table setting — real tables only (not chairs, not placed decorations) */}
        {isRealTable && (
          <Section title="Table setting" hint={settingCount > 0 ? `${settingCount} item${settingCount === 1 ? '' : 's'}` : 'none'}>
            <TableSettingSection
              object={object}
              catalogItems={catalogItems}
              settingItems={settingItems}
              templates={templates}
              onManageTemplates={onManageTemplates}
            />
          </Section>
        )}

        {/* Note */}
        {isTable && (
          <Section title="Note" hint={object.tableNote ? 'added' : undefined} defaultOpen={!!object.tableNote}>
            <textarea
              aria-label="Table note"
              placeholder="e.g. 2 vegetarian guests…"
              value={object.tableNote ?? ''}
              onChange={(e) => updateObject(object.id, { tableNote: e.target.value || undefined })}
              rows={3}
              className="w-full min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5
                         focus:outline-none focus:border-blue-400 resize-none"
            />
          </Section>
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

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className="group border-b border-gray-100">
      <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-gray-50">
        <span className="text-[9px] text-gray-400 transition-transform group-open:rotate-90">▶</span>
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</span>
        {hint && <span className="ml-auto text-[11px] text-gray-400">{hint}</span>}
      </summary>
      <div className="px-4 pb-4 space-y-3">{children}</div>
    </details>
  )
}
