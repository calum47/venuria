'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas'
import CatalogSidebar from '@/components/canvas/CatalogSidebar'
import PropertiesPanel from '@/components/canvas/PropertiesPanel'
import ThreeSixtyViewer from '@/components/viewer3d/ThreeSixtyViewer'
import ChairCountPopover from '@/components/canvas/ChairCountPopover'
import { useLayoutStore } from '@/stores/layoutStore'
import { LayoutObject } from '@/types'
import { generateChairObjects, getTableChairConfig } from '@/lib/utils/seating'

import {
  getCatalogItems,
  getProject,
  saveLayoutObjects,
  getLayoutObjects,
  getRoomsForVenue,
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

type DbRoom = {
  id: string
  name: string
  type: 'indoor' | 'outdoor'
  bounding_box_width_cm: number
  bounding_box_depth_cm: number
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
  const [rooms, setRooms] = useState<DbRoom[]>([])
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [isSwitchingRoom, setIsSwitchingRoom] = useState(false)
  const [pendingTableDrop, setPendingTableDrop] = useState<{
    tableObject: LayoutObject
    tableItem: DbCatalogItem
    maxChairs: number
  } | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentRoomIdRef = useRef<string | null>(null)

  // Keep ref in sync so triggerSave always has the latest roomId
  useEffect(() => {
    currentRoomIdRef.current = currentRoomId
  }, [currentRoomId])

  useEffect(() => {
    async function init() {
      try {
        const project = await getProject(projectId)
        if (!project) {
          router.push('/')
          return
        }

        setProjectId(projectId)
        setVenueId(project.venue_id)

        const [items, venueRooms] = await Promise.all([
          getCatalogItems(project.venue_id),
          getRoomsForVenue(project.venue_id),
        ])

        setCatalogItems(items)
        setRooms(venueRooms)

        // Default to first room
        const firstRoom = venueRooms[0]
        if (firstRoom) {
          setCurrentRoomId(firstRoom.id)
          currentRoomIdRef.current = firstRoom.id

          const objects = await getLayoutObjects(projectId, firstRoom.id)
          const mapped: LayoutObject[] = objects.map((obj: any) => ({
            id: obj.id,
            catalogItemId: obj.catalog_item_id,
            positionCm: { x: obj.position_x_cm, y: obj.position_y_cm },
            rotationDeg: obj.rotation_deg,
            quantity: obj.quantity,
            ...(obj.extra_data ?? {}),
          }))
          setLayoutObjects(mapped)
        }
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
      const roomId = currentRoomIdRef.current
      if (!roomId) return

      setIsSaving(true)
      try {
        await saveLayoutObjects(
          projectId,
          roomId,
          layoutObjects.map((obj) => ({
            catalog_item_id: obj.catalogItemId,
            position_x_cm: Math.round(obj.positionCm.x),
            position_y_cm: Math.round(obj.positionCm.y),
            rotation_deg: obj.rotationDeg,
            quantity: obj.quantity,
            extra_data: {
              isChairFor:       obj.isChairFor,
              chairIds:         obj.chairIds,
              chairCount:       obj.chairCount,
              chairCatalogItemId: obj.chairCatalogItemId,
              chairEdge:        obj.chairEdge,
              chairSides:       obj.chairSides,
              chairArrangement: obj.chairArrangement,
              tableLabel:       obj.tableLabel,
              tableNote:        obj.tableNote,
              mirrorEnabled:    obj.mirrorEnabled,
            },
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

  // Switch rooms: save current, load new
  const handleRoomSwitch = async (roomId: string) => {
    if (roomId === currentRoomId || isSwitchingRoom) return

    setIsSwitchingRoom(true)

    // Cancel pending auto-save and save immediately
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (currentRoomId && projectId) {
      try {
        await saveLayoutObjects(
          projectId,
          currentRoomId,
          layoutObjects.map((obj) => ({
            catalog_item_id: obj.catalogItemId,
            position_x_cm: Math.round(obj.positionCm.x),
            position_y_cm: Math.round(obj.positionCm.y),
            rotation_deg: obj.rotationDeg,
            quantity: obj.quantity,
            extra_data: {
              isChairFor:       obj.isChairFor,
              chairIds:         obj.chairIds,
              chairCount:       obj.chairCount,
              chairCatalogItemId: obj.chairCatalogItemId,
              chairEdge:        obj.chairEdge,
              chairSides:       obj.chairSides,
              chairArrangement: obj.chairArrangement,
              tableLabel:       obj.tableLabel,
              tableNote:        obj.tableNote,
              mirrorEnabled:    obj.mirrorEnabled,
            },
          }))
        )
      } catch (err) {
        console.error('Failed to save before room switch:', err)
      }
    }

    // Load the new room's objects
    try {
      const objects = await getLayoutObjects(projectId, roomId)
      const mapped: LayoutObject[] = objects.map((obj: any) => ({
        id: obj.id,
        catalogItemId: obj.catalog_item_id,
        positionCm: { x: obj.position_x_cm, y: obj.position_y_cm },
        rotationDeg: obj.rotation_deg,
        quantity: obj.quantity,
        ...(obj.extra_data ?? {}),
      }))
      setLayoutObjects(mapped)
      setCurrentRoomId(roomId)
    } catch (err) {
      console.error('Failed to load room:', err)
    } finally {
      setIsSwitchingRoom(false)
    }
  }

  const handleTableDropped = (tableObject: LayoutObject, tableItem: DbCatalogItem) => {
    const { acceptsChairs, maxChairs } = getTableChairConfig(tableItem.name)
    if (!acceptsChairs) {
      useLayoutStore.getState().addObject(tableObject)
      return
    }
    setPendingTableDrop({ tableObject, tableItem, maxChairs })
  }

  const handleChairCountConfirm = (chairCount: number) => {
    if (!pendingTableDrop) return
    const { tableObject, tableItem } = pendingTableDrop

    const chairItem = catalogItems.find((i) => i.category === 'chairs')
    const isRound = tableItem.name.toLowerCase().includes('round')

    useLayoutStore.getState().addObject(tableObject)

    if (chairItem) {
      const chairs = generateChairObjects(
        tableObject,
        tableItem.width_cm,
        tableItem.depth_cm,
        isRound,
        chairCount,
        chairItem.id,
        chairItem.width_cm,
        chairItem.depth_cm
      )

      useLayoutStore.getState().updateObject(tableObject.id, {
        chairCount,
        chairCatalogItemId: chairItem.id,
        chairIds: chairs.map((c) => c.id),
      })

      useLayoutStore.getState().addObjects(chairs)
    }

    setPendingTableDrop(null)
  }

  const handleChairSkip = () => {
    if (!pendingTableDrop) return
    useLayoutStore.getState().addObject(pendingTableDrop.tableObject)
    setPendingTableDrop(null)
  }

  const liveObject = selectedObjectId
    ? layoutObjects.find((o) => o.id === selectedObjectId) ?? null
    : null

  const currentRoom = rooms.find((r) => r.id === currentRoomId)

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

          {/* Room switcher tabs */}
          <div className="flex items-center gap-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleRoomSwitch(room.id)}
                disabled={isSwitchingRoom}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  room.id === currentRoomId
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                } disabled:opacity-50`}
              >
                {room.type === 'outdoor' ? '🌿 ' : '🏛 '}
                {room.name}
              </button>
            ))}
          </div>

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
            {isSwitchingRoom && 'Switching room...'}
            {!isSwitchingRoom && isSaving && 'Saving...'}
            {!isSwitchingRoom && !isSaving && lastSaved && (
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
              onTableDropped={handleTableDropped}
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

      {pendingTableDrop && (
        <ChairCountPopover
          tableId={pendingTableDrop.tableObject.id}
          tableName={pendingTableDrop.tableItem.name}
          maxChairs={pendingTableDrop.maxChairs}
          onConfirm={handleChairCountConfirm}
          onSkip={handleChairSkip}
        />
      )}
    </main>
  )
}