'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas'
import CatalogSidebar from '@/components/canvas/CatalogSidebar'
import PropertiesPanel from '@/components/canvas/PropertiesPanel'
import ThreeSixtyViewer from '@/components/viewer3d/ThreeSixtyViewer'
import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject } from '@/types'
import {
  getCatalogItems,
  getProject,
  saveLayoutObjects,
  getLayoutObjects,
} from '@/lib/supabase/queries'

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

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const {
    selectedObjectId,
    layoutObjects,
    isSaving,
    lastSaved,
    setProjectId,
    setLayoutObjects,
    setIsSaving,
    setLastSaved,
  } = useLayoutStore()

  const [catalogItems, setCatalogItems] = useState<DbCatalogItem[]>([])
  const [zoom, setZoom] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [show3D, setShow3D] = useState(false)
  const [venueId, setVenueId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function init() {
      try {
        // Load project from Supabase
        const project = await getProject(projectId)
        if (!project) {
          router.push('/')
          return
        }

        setProjectId(projectId)
        setVenueId(project.venue_id)

        // Load catalog items for this venue
        const items = await getCatalogItems(project.venue_id)
        setCatalogItems(items)

        // Load saved layout objects
        const objects = await getLayoutObjects(projectId)
        const mapped: LayoutObject[] = objects.map((obj: any) => ({
          id: obj.id,
          catalogItemId: obj.catalog_item_id,
          positionCm: { x: obj.position_x_cm, y: obj.position_y_cm },
          rotationDeg: obj.rotation_deg,
          quantity: obj.quantity,
        }))
        setLayoutObjects(mapped)
      } catch (err) {
        console.error('Failed to initialise editor:', err)
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    if (projectId) init()
  }, [projectId])

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
        <p className="text-sm text-gray-400">Loading project...</p>
      </div>
    )
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-100">
      <div className="flex-shrink-0">
        <CatalogSidebar catalogItems={catalogItems} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 h-12 bg-white border-b border-gray-200
                        flex items-center px-4 gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Home
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-800">Venuria</h1>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">Floor Plan Editor</span>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-400">
            {zoom !== 1
              ? `${Math.round(zoom * 100)}%`
              : 'Scroll to zoom · Right click drag to pan'}
          </span>

          <button
            onClick={() => setShow3D(true)}
            className="ml-auto text-xs bg-gray-800 text-white px-3 py-1.5
                       rounded-lg hover:bg-gray-700 transition-colors"
          >
            View in 3D
          </button>

          <div className="text-xs text-gray-400">
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
              onObjectSelect={() => {}}
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

      {show3D && (
        <ThreeSixtyViewer
          imageUrl="/assets/360-placeholder.jpg"
          onClose={() => setShow3D(false)}
        />
      )}
    </main>
  )
}