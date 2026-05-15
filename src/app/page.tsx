'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas'
import CatalogSidebar from '@/components/canvas/CatalogSidebar'
import PropertiesPanel from '@/components/canvas/PropertiesPanel'
import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject } from '@/types'
import {
  getCatalogItems,
  createProject,
  saveLayoutObjects,
  getLayoutObjects,
} from '@/lib/supabase/queries'

// Hardcoded for now — will come from routing/auth later
const VENUE_ID = '00000000-0000-0000-0000-000000000001'
const ROOM_ID = '00000000-0000-0000-0000-000000000002'

type DbCatalogItem = {
  id: string
  name: string
  category: string
  owner_type: string
  width_cm: number
  depth_cm: number
  height_cm: number
  price_per_unit: number | null
  image_url: string | null
  model_url: string | null
  venue_id: string | null
  rental_company_id: string | null
}

export default function Home() {
  const {
    selectedObjectId,
    layoutObjects,
    projectId,
    isSaving,
    lastSaved,
    setProjectId,
    setLayoutObjects,
    setIsSaving,
    setLastSaved,
  } = useLayoutStore()

  const [catalogItems, setCatalogItems] = useState<DbCatalogItem[]>([])
  const [selectedObject, setSelectedObject] = useState<LayoutObject | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load catalog and create/restore project on mount
  useEffect(() => {
    async function init() {
      try {
        // Load catalog items from Supabase
        const items = await getCatalogItems(VENUE_ID)
        setCatalogItems(items)

        // Check if we have a saved project id in localStorage
        const savedProjectId = localStorage.getItem('venuria_project_id')

        if (savedProjectId) {
          setProjectId(savedProjectId)
          // Load saved layout objects
          const objects = await getLayoutObjects(savedProjectId)
          const mapped: LayoutObject[] = objects.map((obj: any) => ({
            id: obj.id,
            catalogItemId: obj.catalog_item_id,
            positionCm: { x: obj.position_x_cm, y: obj.position_y_cm },
            rotationDeg: obj.rotation_deg,
            quantity: obj.quantity,
          }))
          setLayoutObjects(mapped)
        } else {
          // Create a new project
          const project = await createProject(VENUE_ID, ROOM_ID)
          setProjectId(project.id)
          localStorage.setItem('venuria_project_id', project.id)
        }
      } catch (err) {
        console.error('Failed to initialise:', err)
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [])

  // Auto-save layout 2 seconds after last change
  const triggerSave = useCallback(() => {
    if (!projectId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true)
      try {
        await saveLayoutObjects(
          projectId,
          layoutObjects.map((obj) => ({
            catalog_item_id: obj.catalogItemId,
            position_x_cm: Math.round(obj.positionCm.x),
            position_y_cm: Math.round(obj.positionCm.y),
            rotation_deg: obj.rotationDeg,
            quantity: obj.quantity,
          }))
        )
        setLastSaved(new Date())
      } catch (err) {
        console.error('Failed to save:', err)
      } finally {
        setIsSaving(false)
      }
    }, 2000)
  }, [projectId, layoutObjects])

  // Trigger save whenever layout changes
  useEffect(() => {
    if (!projectId || isLoading) return
    triggerSave()
  }, [layoutObjects, projectId, isLoading])

  const liveObject = selectedObjectId
    ? layoutObjects.find((o) => o.id === selectedObjectId) ?? null
    : null

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading Venuria...</p>
      </div>
    )
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Left sidebar — catalog */}
      <div className="flex-shrink-0">
        <CatalogSidebar catalogItems={catalogItems} />
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
            {zoom !== 1
              ? `${Math.round(zoom * 100)}%`
              : 'Scroll to zoom · Right click drag to pan'}
          </span>

          {/* Save status */}
          <div className="ml-auto text-xs text-gray-400">
            {isSaving && 'Saving...'}
            {!isSaving && lastSaved && (
              `Saved at ${lastSaved.toLocaleTimeString()}`
            )}
          </div>
        </div>

        {/* Canvas + properties panel */}
        <div className="flex-1 flex min-w-0 min-h-0">
          <div className="flex-1 overflow-hidden min-w-0">
            <FloorPlanCanvas
              onObjectSelect={setSelectedObject}
              onZoomChange={setZoom}
              catalogItems={catalogItems}
            />
          </div>

          {liveObject && (
            <div className="flex-shrink-0">
              <PropertiesPanel
                object={liveObject}
                catalogItems={catalogItems}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}