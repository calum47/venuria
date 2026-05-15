'use client'

import { CatalogItem } from '@/types'
import { useLayoutStore } from '@/stores/layoutStore'

// Placeholder catalog items
const PLACEHOLDER_ITEMS: CatalogItem[] = [
  {
    id: 'round-table',
    name: 'Round Table',
    category: 'tables',
    ownedBy: { type: 'venue', venueId: 'venue-1' },
    dimensions: { widthCm: 120, depthCm: 120, heightCm: 75 },
    modelUrl: '',
    imageUrl: '',
    pricePerUnit: null,
  },
  {
    id: 'rect-table',
    name: 'Rectangular Table',
    category: 'tables',
    ownedBy: { type: 'venue', venueId: 'venue-1' },
    dimensions: { widthCm: 180, depthCm: 90, heightCm: 75 },
    modelUrl: '',
    imageUrl: '',
    pricePerUnit: null,
  },
  {
    id: 'chair',
    name: 'Chair',
    category: 'chairs',
    ownedBy: { type: 'venue', venueId: 'venue-1' },
    dimensions: { widthCm: 45, depthCm: 45, heightCm: 90 },
    modelUrl: '',
    imageUrl: '',
    pricePerUnit: null,
  },
]

export default function CatalogSidebar() {
  const { snapToGrid, toggleSnapToGrid, gridSizeCm, setGridSize } = useLayoutStore()

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, item: CatalogItem) => {
    e.dataTransfer.setData('catalogItem', JSON.stringify(item))
  }

  return (
    <div className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
          Catalog
        </h2>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {PLACEHOLDER_ITEMS.map((item) => (
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
                {item.category === 'tables' ? '🪑' : '💺'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.dimensions.widthCm} × {item.dimensions.depthCm} cm
                </p>
              </div>
            </div>
          </div>
        ))}
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