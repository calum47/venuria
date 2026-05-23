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
import { DbCatalogItem, DbRoom } from '@/types/db'
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

// ─── Editor page ──────────────────────────────────────────────────────────────

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  // ── Store slices ────────────────────────────────────────────────────────────

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

  // ── Local state ─────────────────────────────────────────────────────────────

  const [catalogItems, setCatalogItems] = useState<DbCatalogItem[]>([])
  const [rooms, setRooms] = useState<DbRoom[]>([])
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitchingRoom, setIsSwitchingRoom] = useState(false)
  const [show3D, setShow3D] = useState(false)

  // Table dropped — waiting for the user to choose chair count
  const [pendingTableDrop, setPendingTableDrop] = useState<{
    tableObject: LayoutObject
    tableItem: DbCatalogItem
    maxChairs: number
  } | null>(null)

  // Chair clicked in guest mode — triggers assignment popover
  const [assigningChairId, setAssigningChairId] = useState<string | null>(null)

  // Guest being dragged from the guest panel onto the canvas
  const [draggingGuestId, setDraggingGuestId] = useState<string | null>(null)

  // ── Refs (keep stable values accessible inside async callbacks) ─────────────

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentRoomIdRef = useRef<string | null>(null)
  const layoutObjectsRef = useRef<LayoutObject[]>([])
  const isSwitchingRoomRef = useRef(false)

  // Keep refs in sync with state
  useEffect(() => { currentRoomIdRef.current = currentRoomId }, [currentRoomId])
  useEffect(() => { layoutObjectsRef.current = layoutObjects }, [layoutObjects])
  useEffect(() => { isSwitchingRoomRef.current = isSwitchingRoom }, [isSwitchingRoom])

  // ── Initialise project ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId) return

    async function init() {
      try {
        const project = await getProject(projectId)
        if (!project) { router.push('/'); return }

        setProjectId(projectId)

        const [items, venueRooms, guestList, assignments] = await Promise.all([
          getCatalogItems(project.venue_id),
          getRoomsForVenue(project.venue_id),
          getGuests(projectId),
          getSeatAssignments(projectId),
        ])

        setCatalogItems(items)
        setRooms(venueRooms)
        setGuests(guestList)
        // getSeatAssignments already returns the correct shape including roomId — no remapping needed
        setSeatAssignments(assignments)

        // Load the first room's layout
        const firstRoom = venueRooms[0]
        if (firstRoom) {
          setCurrentRoomId(firstRoom.id)
          currentRoomIdRef.current = firstRoom.id
          const objects = await getLayoutObjects(projectId, firstRoom.id)
          setLayoutObjects(objects)
        }
      } catch (err) {
        console.error('Failed to initialise editor:', err)
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [projectId])

  // ── Auto-save ───────────────────────────────────────────────────────────────

  const triggerSave = useCallback(() => {
    if (!projectId || isSwitchingRoomRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      if (isSwitchingRoomRef.current) return
      const roomId = currentRoomIdRef.current
      if (!roomId) return

      setIsSaving(true)
      try {
        await saveLayoutObjects(projectId, roomId, layoutObjectsRef.current)
        setLastSaved(new Date())
      } catch (err) {
        console.error('Auto-save failed:', err)
      } finally {
        setIsSaving(false)
      }
    }, 2000)
  }, [projectId])

  useEffect(() => {
    if (!projectId || isLoading) return
    triggerSave()
  }, [layoutObjects, projectId, isLoading])

  // ── Room switching ──────────────────────────────────────────────────────────

  const handleRoomSwitch = async (roomId: string) => {
    if (roomId === currentRoomId || isSwitchingRoom) return

    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }

    setIsSwitchingRoom(true)
    isSwitchingRoomRef.current = true

    if (currentRoomId && projectId) {
      try {
        await saveLayoutObjects(projectId, currentRoomId, layoutObjectsRef.current)
      } catch (err) {
        console.error('Failed to save before room switch:', err)
      }
    }

    try {
      const objects = await getLayoutObjects(projectId, roomId)
      setLayoutObjects(objects)
      setCurrentRoomId(roomId)
      currentRoomIdRef.current = roomId
    } catch (err) {
      console.error('Failed to load room:', err)
    } finally {
      setIsSwitchingRoom(false)
      isSwitchingRoomRef.current = false
    }
  }

  // ── Table drop & chair count ────────────────────────────────────────────────

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
      ?? catalogItems.find((i) => i.name.toLowerCase().includes('chair'))

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
        chairItem.depth_cm,
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

  // ── Guest seat assignment ───────────────────────────────────────────────────

  // Called when a guest is dragged from the panel and dropped onto a chair
  const handleGuestDropOnChair = useCallback(async (chairId: string, guestId: string) => {
    const roomId = currentRoomIdRef.current
    if (!roomId) return
    try {
      const assignment = await assignSeat(projectId, guestId, chairId, roomId)
      assignGuest({
        id: assignment.id,
        projectId,
        roomId,
        guestId,
        layoutObjectId: chairId,
      })
    } catch (err) {
      console.error('Failed to assign guest to chair:', err)
    }
  }, [projectId, assignGuest])

  // ── Derived values ──────────────────────────────────────────────────────────

  const liveObject = selectedObjectId
    ? layoutObjects.find((o) => o.id === selectedObjectId) ?? null
    : null

  const assigningChair = assigningChairId
    ? layoutObjects.find((o) => o.id === assigningChairId)
    : null

  const assigningChairLabel = assigningChair?.tableLabel
    ?? String(
      layoutObjects
        .filter((o) => o.isChairFor === assigningChair?.isChairFor)
        .findIndex((o) => o.id === assigningChairId) + 1
    )

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading project...</p>
      </div>
    )
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-100">

      {/* Left sidebar — item catalog (hidden in guest mode) */}
      {!isGuestMode && (
        <div className="flex-shrink-0">
          <CatalogSidebar catalogItems={catalogItems} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex-shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
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
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                  room.id === currentRoomId
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
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

          {/* Zoom hint / level */}
          <span className="text-xs text-gray-400 ml-auto">
            {zoom !== 1
              ? `${Math.round(zoom * 100)}%`
              : 'Scroll to zoom · Right-click drag to pan'}
          </span>

          <button
            onClick={() => setShow3D(true)}
            className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            View in 3D
          </button>

          {/* Save status */}
          <div className="text-xs text-gray-400">
            {isSwitchingRoom && 'Switching room…'}
            {!isSwitchingRoom && isSaving && 'Saving…'}
            {!isSwitchingRoom && !isSaving && lastSaved && `Saved ${lastSaved.toLocaleTimeString()}`}
          </div>
        </div>

        {/* Canvas + side panels */}
        <div className="flex-1 flex min-w-0 min-h-0">
          <div className="flex-1 overflow-hidden min-w-0">
            <FloorPlanCanvas
              catalogItems={catalogItems}
              currentRoom={rooms.find((r) => r.id === currentRoomId) ?? null}
              onZoomChange={setZoom}
              onTableDropped={handleTableDropped}
              isGuestMode={isGuestMode}
              onChairClickInGuestMode={setAssigningChairId}
              onGuestDropOnChair={handleGuestDropOnChair}
              draggingGuestId={draggingGuestId}
            />
          </div>

          {/* Properties panel — only when an object is selected outside guest mode */}
          {!isGuestMode && liveObject && (
            <div className="flex-shrink-0">
              <PropertiesPanel object={liveObject} catalogItems={catalogItems} />
            </div>
          )}

          {/* Guest panel — only in guest mode */}
          {isGuestMode && (
            <GuestPanel
              projectId={projectId}
              onDragStart={setDraggingGuestId}
            />
          )}
        </div>
      </div>

      {/* 3D viewer overlay */}
      {show3D && (
        <ThreeSixtyViewer
          imageUrl="/assets/360-placeholder.jpg"
          onClose={() => setShow3D(false)}
        />
      )}

      {/* Chair count popover — shown after a table is dropped */}
      {pendingTableDrop && (
        <ChairCountPopover
          tableId={pendingTableDrop.tableObject.id}
          tableName={pendingTableDrop.tableItem.name}
          maxChairs={pendingTableDrop.maxChairs}
          onConfirm={handleChairCountConfirm}
          onSkip={handleChairSkip}
        />
      )}

      {/* Chair assignment popover — shown when a chair is clicked in guest mode */}
      {assigningChairId && (
        <ChairAssignmentPopover
          chairId={assigningChairId}
          projectId={projectId}
          roomId={currentRoomId ?? ''}
          chairLabel={assigningChairLabel}
          onClose={() => setAssigningChairId(null)}
        />
      )}
    </main>
  )
}