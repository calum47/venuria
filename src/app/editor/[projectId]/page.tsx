'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas'
import CatalogSidebar from '@/components/canvas/CatalogSidebar'
import PropertiesPanel from '@/components/canvas/PropertiesPanel'
import ThreeSixtyViewer from '@/components/viewer3d/ThreeSixtyViewer'
import ChairCountPopover from '@/components/canvas/ChairCountPopover'
import GuestPanel from '@/components/canvas/GuestPanel'
import ChairAssignmentPopover from '@/components/canvas/ChairAssignmentPopover'
import { useLayoutStore } from '@/stores/layoutStore'
import { useGuestStore } from '@/stores/guestStore'
import { LayoutObject } from '@/types'
import { generateChairObjects, getTableChairConfig } from '@/lib/utils/seating'

import {
  getCatalogItems,
  getProject,
  saveLayoutObjects,
  getLayoutObjects,
  getRoomsForVenue,
  getGuests,
  getSeatAssignments,
  assignSeat,
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

function buildSavePayload(objects: LayoutObject[]) {
  return objects.map((obj) => ({
    id: obj.id,
    catalog_item_id: obj.catalogItemId,
    position_x_cm: Math.round(obj.positionCm.x),
    position_y_cm: Math.round(obj.positionCm.y),
    rotation_deg: obj.rotationDeg,
    quantity: obj.quantity,
    extra_data: {
      isChairFor: obj.isChairFor,
      chairIds: obj.chairIds,
      chairCount: obj.chairCount,
      chairCatalogItemId: obj.chairCatalogItemId,
      chairEdge: obj.chairEdge,
      chairSides: obj.chairSides,
      chairArrangement: obj.chairArrangement,
      tableLabel: obj.tableLabel,
      tableNote: obj.tableNote,
      mirrorEnabled: obj.mirrorEnabled,
    },
  }))
}

function mapDbObjects(objects: any[]): LayoutObject[] {
  return objects.map((obj) => ({
    id: obj.id,
    catalogItemId: obj.catalog_item_id,
    positionCm: { x: obj.position_x_cm, y: obj.position_y_cm },
    rotationDeg: obj.rotation_deg,
    quantity: obj.quantity,
    ...(obj.extra_data ?? {}),
  }))
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

  const {
    isGuestMode,
    setGuestMode,
    setGuests,
    setSeatAssignments,
    assignGuest,
  } = useGuestStore()

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
  // Chair clicked in guest mode — shows assignment popover
  const [assigningChairId, setAssigningChairId] = useState<string | null>(null)
  // Guest being dragged from panel
  const [draggingGuestId, setDraggingGuestId] = useState<string | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentRoomIdRef = useRef<string | null>(null)
  const layoutObjectsRef = useRef<LayoutObject[]>([])
  const isSwitchingRoomRef = useRef(false)

  useEffect(() => { currentRoomIdRef.current = currentRoomId }, [currentRoomId])
  useEffect(() => { layoutObjectsRef.current = layoutObjects }, [layoutObjects])
  useEffect(() => { isSwitchingRoomRef.current = isSwitchingRoom }, [isSwitchingRoom])

  useEffect(() => {
    async function init() {
      try {
        const project = await getProject(projectId)
        if (!project) { router.push('/'); return }

        setProjectId(projectId)
        setVenueId(project.venue_id)

        const [items, venueRooms, guestList, assignments] = await Promise.all([
          getCatalogItems(project.venue_id),
          getRoomsForVenue(project.venue_id),
          getGuests(projectId),
          getSeatAssignments(projectId),
        ])

        setCatalogItems(items)
        setRooms(venueRooms)
        setGuests(guestList)
        setSeatAssignments(
          assignments.map((a: any) => ({
            id: a.id,
            projectId: a.project_id,
            guestId: a.guest_id,
            layoutObjectId: a.layout_object_id,
          }))
        )

        const firstRoom = venueRooms[0]
        if (firstRoom) {
          setCurrentRoomId(firstRoom.id)
          currentRoomIdRef.current = firstRoom.id
          const objects = await getLayoutObjects(projectId, firstRoom.id)
          setLayoutObjects(mapDbObjects(objects))
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
    if (!projectId || isSwitchingRoomRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (isSwitchingRoomRef.current) return
      const roomId = currentRoomIdRef.current
      if (!roomId) return
      setIsSaving(true)
      try {
        await saveLayoutObjects(projectId, roomId, buildSavePayload(layoutObjectsRef.current))
        setLastSaved(new Date())
      } catch (err) {
        console.error('Failed to save:', err)
      } finally {
        setIsSaving(false)
      }
    }, 2000)
  }, [projectId])

  useEffect(() => {
    if (!projectId || isLoading) return
    triggerSave()
  }, [layoutObjects, projectId, isLoading])

  const handleRoomSwitch = async (roomId: string) => {
    if (roomId === currentRoomId || isSwitchingRoom) return
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    setIsSwitchingRoom(true)
    isSwitchingRoomRef.current = true
    if (currentRoomId && projectId) {
      try { await saveLayoutObjects(projectId, currentRoomId, buildSavePayload(layoutObjectsRef.current)) }
      catch (err) { console.error('Failed to save before room switch:', err) }
    }
    try {
      const objects = await getLayoutObjects(projectId, roomId)
      setLayoutObjects(mapDbObjects(objects))
      setCurrentRoomId(roomId)
      currentRoomIdRef.current = roomId
    } catch (err) {
      console.error('Failed to load room:', err)
    } finally {
      setIsSwitchingRoom(false)
      isSwitchingRoomRef.current = false
    }
  }

  // Called when a guest is dropped onto a chair from the guest panel
  const handleGuestDropOnChair = useCallback(async (chairId: string, guestId: string) => {
    try {
      const assignment = await assignSeat(projectId, guestId, chairId)
      assignGuest({
        id: assignment.id,
        projectId,
        guestId,
        layoutObjectId: chairId,
      })
    } catch (err) {
      console.error('Failed to assign guest to chair:', err)
    }
  }, [projectId, assignGuest])

  const handleTableDropped = (tableObject: LayoutObject, tableItem: DbCatalogItem) => {
    const { acceptsChairs, maxChairs } = getTableChairConfig(tableItem.name)
    if (!acceptsChairs) { useLayoutStore.getState().addObject(tableObject); return }
    setPendingTableDrop({ tableObject, tableItem, maxChairs })
  }

  const handleChairCountConfirm = (chairCount: number) => {
    if (!pendingTableDrop) return
    const { tableObject, tableItem } = pendingTableDrop
    const chairItem = catalogItems.find((i) => i.category === 'chairs')
    const isRound = tableItem.name.toLowerCase().includes('round')
    useLayoutStore.getState().addObject(tableObject)
    if (chairItem) {
      const chairs = generateChairObjects(tableObject, tableItem.width_cm, tableItem.depth_cm, isRound, chairCount, chairItem.id, chairItem.width_cm, chairItem.depth_cm)
      useLayoutStore.getState().updateObject(tableObject.id, { chairCount, chairCatalogItemId: chairItem.id, chairIds: chairs.map((c) => c.id) })
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

  // Find the chair being assigned to show its label in the popover
  const assigningChair = assigningChairId
    ? layoutObjects.find((o) => o.id === assigningChairId)
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
      {/* Left sidebar — catalog or hidden in guest mode */}
      {!isGuestMode && (
        <div className="flex-shrink-0">
          <CatalogSidebar catalogItems={catalogItems} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
          <button onClick={() => router.push('/')} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← Home
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-800">Venuria</h1>
          <span className="text-gray-300">|</span>

          {/* Room tabs */}
          <div className="flex items-center gap-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleRoomSwitch(room.id)}
                disabled={isSwitchingRoom}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  room.id === currentRoomId ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                } disabled:opacity-50`}
              >
                {room.type === 'outdoor' ? '🌿 ' : '🏛 '}{room.name}
              </button>
            ))}
          </div>

          <span className="text-gray-300">|</span>

          {/* Guest mode toggle */}
          <button
            onClick={() => setGuestMode(!isGuestMode)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              isGuestMode
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'text-gray-500 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            👥 {isGuestMode ? 'Guest Mode ON' : 'Guest Mode'}
          </button>

          <span className="text-xs text-gray-400 ml-auto">
            {zoom !== 1 ? `${Math.round(zoom * 100)}%` : 'Scroll to zoom · Right click drag to pan'}
          </span>

          <button
            onClick={() => setShow3D(true)}
            className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            View in 3D
          </button>

          <div className="text-xs text-gray-400">
            {isSwitchingRoom && 'Switching room...'}
            {!isSwitchingRoom && isSaving && 'Saving...'}
            {!isSwitchingRoom && !isSaving && lastSaved && `Saved at ${lastSaved.toLocaleTimeString()}`}
          </div>
        </div>

        {/* Canvas + panels */}
        <div className="flex-1 flex min-w-0 min-h-0">
          <div className="flex-1 overflow-hidden min-w-0">
            <FloorPlanCanvas
              onObjectSelect={() => {}}
              onZoomChange={setZoom}
              catalogItems={catalogItems}
              onTableDropped={handleTableDropped}
              isGuestMode={isGuestMode}
              onChairClickInGuestMode={(chairId) => setAssigningChairId(chairId)}
              onGuestDropOnChair={handleGuestDropOnChair}
              draggingGuestId={draggingGuestId}
            />
          </div>

          {/* Properties panel (only outside guest mode) */}
          {!isGuestMode && liveObject && (
            <div className="flex-shrink-0">
              <PropertiesPanel object={liveObject} catalogItems={catalogItems} />
            </div>
          )}

          {/* Guest panel (only in guest mode) */}
          {isGuestMode && (
            <GuestPanel
              projectId={projectId}
              onDragStart={(guestId) => setDraggingGuestId(guestId)}
            />
          )}
        </div>
      </div>

      {show3D && <ThreeSixtyViewer imageUrl="/assets/360-placeholder.jpg" onClose={() => setShow3D(false)} />}

      {pendingTableDrop && (
        <ChairCountPopover
          tableId={pendingTableDrop.tableObject.id}
          tableName={pendingTableDrop.tableItem.name}
          maxChairs={pendingTableDrop.maxChairs}
          onConfirm={handleChairCountConfirm}
          onSkip={handleChairSkip}
        />
      )}

      {/* Chair assignment popover */}
      {assigningChairId && (
        <ChairAssignmentPopover
          chairId={assigningChairId}
          projectId={projectId}
          chairLabel={assigningChair?.tableLabel ?? String(layoutObjects.filter((o) => o.isChairFor === assigningChair?.isChairFor).findIndex((o) => o.id === assigningChairId) + 1)}
          onClose={() => setAssigningChairId(null)}
        />
      )}
    </main>
  )
}