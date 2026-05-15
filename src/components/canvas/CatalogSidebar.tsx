'use client'

import { useLayoutStore } from '@/stores/layoutStore'

type CatalogItem = {
  id: string
  name: string
  category: string
  width_cm: number
  depth_cm: number
  price_per_unit: number | null
  owner_type: string
}

type Props = {
  catalogItems: CatalogItem[]
}

export default function CatalogSidebar({ catalogItems }: Props) {
  const { snapToGrid, toggleSnapToGrid, gridSizeCm, setGridSize } = useLayoutStore()

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, item: CatalogItem) => {
    e.dataTransfer.setData('catalogItem', JSON.stringify(item))
  }

  const grouped = catalogItems.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
          Catalog
        </h2>
      </div>

      {/* Items grouped by category */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              {category}
            </p>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  className="p-3 border border-gray-200 rounded-lg cursor-grab
                             hover:border-blue-400 hover:bg-blue-50 transition-colors
                             select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-lg">
                      {category === 'tables' ? '🪑' : '💺'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.width_cm} × {item.depth_cm} cm
                      </p>
                      {item.owner_type === 'rental' && (
                        <p className="text-xs text-amber-500">Rental item</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {catalogItems.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-8">
            No items in catalog
          </p>
        )}
      </div>

      {/* Grid Controls */}
      <div className="p-4 border-t border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Snap to Grid</span>
          <button
            onClick={toggleSnapToGrid}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              snapToGrid ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                snapToGrid ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {snapToGrid && (
          <div className="space-y-1">
            <span className="text-xs text-gray-500">Grid Size: {gridSizeCm}cm</span>
            <input
              type="range"
              min={10}
              max={100}
              step={10}
              value={gridSizeCm}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}