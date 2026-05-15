'use client'

import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas'
import CatalogSidebar from '@/components/canvas/CatalogSidebar'
import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject } from '@/types'

export default function Home() {
  const { removeObject, selectedObjectId } = useLayoutStore()

  const handleObjectSelect = (object: LayoutObject | null) => {
    // Future: show object properties panel
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <div className="flex-shrink-0">
        <CatalogSidebar />
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
          <h1 className="text-sm font-semibold text-gray-800">Venuria</h1>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">Floor Plan Editor</span>

          {selectedObjectId && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => removeObject(selectedObjectId)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Delete selected
              </button>
            </>
          )}
        </div>

        {/* Canvas — scrolls both directions */}
        <div className="flex-1 overflow-auto min-w-0 min-h-0">
          <FloorPlanCanvas onObjectSelect={handleObjectSelect} />
        </div>
      </div>
    </main>
  )
}