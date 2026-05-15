'use client'

import { useState } from 'react'
import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas'
import CatalogSidebar from '@/components/canvas/CatalogSidebar'
import PropertiesPanel from '@/components/canvas/PropertiesPanel'
import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject } from '@/types'

export default function Home() {
  const { selectedObjectId, layoutObjects } = useLayoutStore()
  const [selectedObject, setSelectedObject] = useState<LayoutObject | null>(null)
  const [zoom, setZoom] = useState(1)

  const handleObjectSelect = (object: LayoutObject | null) => {
    setSelectedObject(object)
  }

  // Keep properties panel in sync when object is updated via canvas
  const liveObject = selectedObjectId
    ? layoutObjects.find((o) => o.id === selectedObjectId) ?? null
    : null

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Left sidebar — catalog */}
      <div className="flex-shrink-0">
        <CatalogSidebar />
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 h-12 bg-white border-b border-gray-200
                        flex items-center px-4 gap-4">
          <h1 className="text-sm font-semibold text-gray-800">Venuria</h1>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">Floor Plan Editor</span>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-400">
            {zoom !== 1 ? `${Math.round(zoom * 100)}%` : 'Use scroll to zoom · Right click drag to pan'}
          </span>
        </div>

        {/* Canvas + properties panel */}
        <div className="flex-1 flex min-w-0 min-h-0">
          <div className="flex-1 overflow-hidden min-w-0">
            <FloorPlanCanvas
              onObjectSelect={handleObjectSelect}
              onZoomChange={setZoom}
            />
          </div>

          {/* Right panel — properties */}
          {liveObject && (
            <div className="flex-shrink-0">
              <PropertiesPanel object={liveObject} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}