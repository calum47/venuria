'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Circle, Text, Line, Group, Transformer, Image as KonvaImage } from 'react-konva'
import { useLayoutStore } from '@/stores/layoutStore'
import { useGuestStore } from '@/stores/guestStore'
import { cmToPixels, pixelsToCm, snapToGrid, generateId } from '@/lib/utils/coordinates'
import { LayoutObject, ObstacleShape, Point2D } from '@/types'
import { DbCatalogItem, DbRoom } from '@/types/db'
import Konva from 'konva'
import { mirrorDragRound, mirrorDragRect, rotateChairsWithTable, reassignChairEdge } from '@/lib/utils/seating'
import { findNearestValidAlongPath, getFootprintCorners, validateFootprint } from '@/lib/utils/geometry'

const BASE_SCALE = 2
const CANVAS_PADDING = 60
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

type Props = {
  catalogItems: DbCatalogItem[]
  /** Active room — supplies real bounding box dimensions from the DB. */
  currentRoom: DbRoom | null
  onZoomChange?: (zoom: number) => void
  onTableDropped?: (tableObject: LayoutObject, tableItem: DbCatalogItem) => void
  // Guest mode
  isGuestMode?: boolean
  onChairClickInGuestMode?: (chairId: string) => void
  onGuestDropOnChair?: (chairId: string, guestId: string) => void
  draggingGuestId?: string | null
}

export default function FloorPlanCanvas({
  catalogItems,
  currentRoom,
  onZoomChange,
  onTableDropped,
  isGuestMode = false,
  onChairClickInGuestMode,
  onGuestDropOnChair,
  draggingGuestId,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const lastPointerPos = useRef({ x: 0, y: 0 })
  const rawDragPosCm = useRef<{ x: number; y: number } | null>(null)
  const stagePosRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const selectionStart = useRef<{ x: number; y: number } | null>(null)
  const isSelecting = useRef(false)
  const multiDragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const multiDragStartPosCm = useRef<{ x: number; y: number } | null>(null)

  const {
    layoutObjects,
    selectedObjectId,
    snapToGrid: snapEnabled,
    gridSizeCm,
    addObject,
    updateObject,
    selectObject,
    selectedObjectIds,
    setSelectedObjectIds,
    deleteSelection,
  } = useLayoutStore()

  const { getGuestForChair } = useGuestStore()

  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Room dimensions come from the DB via props; fall back to sensible defaults while loading
  const roomWidthCm = currentRoom?.bounding_box_width_cm ?? 1500
  const roomDepthCm = currentRoom?.bounding_box_depth_cm ?? 1000
  const roomName = currentRoom ? `${currentRoom.name}  (${roomWidthCm / 100}m × ${roomDepthCm / 100}m)` : 'Loading…'

  // Traced wall boundary + obstacles set by the venue manager (Phase 3 floor
  // plan tool). Empty floor_polygon means this room hasn't been traced yet.
  const boundaryPolygonCm = (currentRoom?.floor_polygon as Point2D[] | undefined) ?? []
  const hasTracedBoundary = boundaryPolygonCm.length >= 3
  const obstacles = (currentRoom?.obstacles as ObstacleShape[] | undefined) ?? []
  const boundaryPolygonPx = boundaryPolygonCm.map((p) => ({
    x: cmToPixels(p.x, BASE_SCALE) + CANVAS_PADDING,
    y: cmToPixels(p.y, BASE_SCALE) + CANVAS_PADDING,
  }))

  // Every boundary/obstacle-aware collision check below uses this instead of
  // branching on hasTracedBoundary — an untraced room falls back to a
  // synthetic 4-corner rectangle (0,0)-(roomWidthCm,roomDepthCm), which is a
  // perfectly valid polygon for the exact same point-in-polygon/footprint
  // logic used for a real traced boundary. Previously the untraced fallback
  // used a separate axis-aligned half-width/half-height clamp that ignored
  // rotation entirely (the long-open Phase 1 "rotated object boundary
  // clamping" item) — folding it into the same polygon path fixes that for
  // free instead of maintaining two different collision implementations.
  const effectiveBoundaryCm: Point2D[] = hasTracedBoundary
    ? boundaryPolygonCm
    : [
        { x: 0, y: 0 },
        { x: roomWidthCm, y: 0 },
        { x: roomWidthCm, y: roomDepthCm },
        { x: 0, y: roomDepthCm },
      ]

  // Track the loaded image keyed by the url it was loaded for, rather than
  // clearing state synchronously when the url changes/disappears — the state
  // setter only ever runs inside the async onload callback, and a stale image
  // is derived away automatically once the url no longer matches.
  const [loadedFloorPlan, setLoadedFloorPlan] = useState<{ url: string; img: HTMLImageElement } | null>(null)
  useEffect(() => {
    const url = currentRoom?.floor_plan_image_url
    if (!url) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    img.onload = () => setLoadedFloorPlan({ url, img })
  }, [currentRoom?.floor_plan_image_url])
  const floorPlanImage =
    loadedFloorPlan && loadedFloorPlan.url === currentRoom?.floor_plan_image_url ? loadedFloorPlan.img : null

  // The PNG was calibrated in its own pixel space (cm_per_px) — convert that to
  // room cm, then to canvas px, so it lines up under the traced boundary/objects
  // regardless of the image's native resolution.
  const floorPlanWidthPx =
    currentRoom?.cm_per_px && currentRoom.floor_plan_image_width_px
      ? cmToPixels(currentRoom.floor_plan_image_width_px * currentRoom.cm_per_px, BASE_SCALE)
      : 0
  const floorPlanDepthPx =
    currentRoom?.cm_per_px && currentRoom.floor_plan_image_height_px
      ? cmToPixels(currentRoom.floor_plan_image_height_px * currentRoom.cm_per_px, BASE_SCALE)
      : 0

  const gridSizePx = cmToPixels(gridSizeCm, BASE_SCALE)
  const roomWidthPx = cmToPixels(roomWidthCm, BASE_SCALE)
  const roomDepthPx = cmToPixels(roomDepthCm, BASE_SCALE)
  const roomOffsetX = CANVAS_PADDING
  const roomOffsetY = CANVAS_PADDING
  const totalWidth = roomWidthPx + CANVAS_PADDING * 2
  const totalHeight = roomDepthPx + CANVAS_PADDING * 2

  useEffect(() => { stagePosRef.current = stagePos }, [stagePos])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setStageSize({ width: container.offsetWidth, height: container.offsetHeight })
    const handleResize = () => setStageSize({ width: container.offsetWidth, height: container.offsetHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return
    if (selectedObjectId && !isGuestMode) {
      const shape = stageRef.current.findOne(`#${selectedObjectId}`)
      if (shape) {
        transformerRef.current.nodes([shape])
        transformerRef.current.getLayer()?.batchDraw()
      }
    } else {
      transformerRef.current.nodes([])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [selectedObjectId, isGuestMode])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectIds.length > 0 && !isGuestMode) {
        deleteSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedObjectIds, deleteSelection, isGuestMode])

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldZoom = zoomRef.current
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + direction * 0.1))
    const mousePointTo = { x: (pointer.x - stage.x()) / oldZoom, y: (pointer.y - stage.y()) / oldZoom }
    setZoom(newZoom)
    setStagePos({ x: pointer.x - mousePointTo.x * newZoom, y: pointer.y - mousePointTo.y * newZoom })
    onZoomChange?.(newZoom)
  }, [onZoomChange])

  const handleZoomIn    = () => { const z = Math.min(MAX_ZOOM, zoomRef.current + 0.1); setZoom(z); onZoomChange?.(z) }
  const handleZoomOut   = () => { const z = Math.max(MIN_ZOOM, zoomRef.current - 0.1); setZoom(z); onZoomChange?.(z) }
  const handleZoomReset = () => { setZoom(1); setStagePos({ x: 0, y: 0 }); onZoomChange?.(1) }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || e.evt.button === 2) {
      e.evt.preventDefault()
      isPanning.current = true
      lastPointerPos.current = { x: e.evt.clientX, y: e.evt.clientY }
      stageRef.current?.container().style.setProperty('cursor', 'grabbing')
      return
    }
    if (e.evt.button === 0 && !isGuestMode) {
      const target = e.target
      const isOnObject = target.getType() === 'Group' || (target.getParent() !== null && target.getParent()?.getType() === 'Group')
      if (isOnObject) return
      const stage = stageRef.current
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      const canvasX = (pos.x - stagePosRef.current.x) / zoomRef.current
      const canvasY = (pos.y - stagePosRef.current.y) / zoomRef.current
      selectionStart.current = { x: canvasX, y: canvasY }
      isSelecting.current = true
      setSelectionRect({ x: canvasX, y: canvasY, w: 0, h: 0 })
      setSelectedObjectIds([])
      selectObject(null)
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) {
      const dx = e.evt.clientX - lastPointerPos.current.x
      const dy = e.evt.clientY - lastPointerPos.current.y
      lastPointerPos.current = { x: e.evt.clientX, y: e.evt.clientY }
      setStagePos((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      return
    }
    if (isSelecting.current && selectionStart.current) {
      const stage = stageRef.current
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      const canvasX = (pos.x - stagePosRef.current.x) / zoomRef.current
      const canvasY = (pos.y - stagePosRef.current.y) / zoomRef.current
      setSelectionRect({
        x: Math.min(selectionStart.current.x, canvasX),
        y: Math.min(selectionStart.current.y, canvasY),
        w: Math.abs(canvasX - selectionStart.current.x),
        h: Math.abs(canvasY - selectionStart.current.y),
      })
    }
  }

  const handleMouseUp = () => {
    if (isPanning.current) {
      isPanning.current = false
      stageRef.current?.container().style.setProperty('cursor', 'default')
      return
    }
    if (isSelecting.current && selectionStart.current) {
      const stage = stageRef.current
      if (stage) {
        const pos = stage.getPointerPosition()
        if (pos) {
          const canvasX = (pos.x - stagePosRef.current.x) / zoomRef.current
          const canvasY = (pos.y - stagePosRef.current.y) / zoomRef.current
          const rect = {
            x: Math.min(selectionStart.current.x, canvasX),
            y: Math.min(selectionStart.current.y, canvasY),
            w: Math.abs(canvasX - selectionStart.current.x),
            h: Math.abs(canvasY - selectionStart.current.y),
          }
          if (rect.w > 5 && rect.h > 5) {
            const selected = layoutObjects.filter((obj) => {
              const ox = cmToPixels(obj.positionCm.x, BASE_SCALE) + roomOffsetX
              const oy = cmToPixels(obj.positionCm.y, BASE_SCALE) + roomOffsetY
              return ox >= rect.x && ox <= rect.x + rect.w && oy >= rect.y && oy <= rect.y + rect.h
            })
            setSelectedObjectIds(selected.map((o) => o.id))
          }
        }
      }
      isSelecting.current = false
      selectionStart.current = null
      setSelectionRect(null)
    }
  }

  /**
   * Resolves a candidate drop position (canvas px) against the room's
   * boundary (traced polygon, or a synthetic rectangle for untraced rooms —
   * see effectiveBoundaryCm) and obstacles, for the free-dragged object
   * itself (table or any non-chair item). Rotation-aware in both cases.
   */
  const resolveDragPosition = (
    xPx: number,
    yPx: number,
    widthCm: number,
    depthCm: number,
    rotationDeg: number,
    fallbackCm: { x: number; y: number },
  ) => {
    const candidateCm = {
      x: pixelsToCm(xPx - roomOffsetX, BASE_SCALE),
      y: pixelsToCm(yPx - roomOffsetY, BASE_SCALE),
    }
    const resolvedCm = findNearestValidAlongPath(
      fallbackCm, candidateCm, widthCm, depthCm, rotationDeg, effectiveBoundaryCm, obstacles,
    )
    return {
      x: cmToPixels(resolvedCm.x, BASE_SCALE) + roomOffsetX,
      y: cmToPixels(resolvedCm.y, BASE_SCALE) + roomOffsetY,
    }
  }

  /**
   * Same boundary/obstacle snap as `resolveDragPosition`, but in cm and keyed
   * by object id — used for every OTHER positionCm write during a drag (chair
   * mirror pairs, edge-reassigned chairs, table→chair cascade, multi-select),
   * so "act like real walls" applies uniformly rather than only to whichever
   * object Konva is directly dragging. `fromCm` defaults to the object's
   * current stored position (its last known-valid state).
   *
   * No-op (returns `candidateCm` unchanged) only when the object/its catalog
   * item can't be found (shouldn't normally happen) — every room, traced or
   * not, now goes through the same polygon collision via effectiveBoundaryCm.
   */
  const snapPositionToRoom = (
    objectId: string,
    candidateCm: { x: number; y: number },
    rotationDegOverride?: number,
    fromCmOverride?: { x: number; y: number },
  ): { x: number; y: number } => {
    const target = layoutObjects.find((o) => o.id === objectId)
    if (!target) return candidateCm
    const targetCatalogItem = catalogItems.find((i) => i.id === target.catalogItemId)
    const widthCm = targetCatalogItem?.width_cm ?? 50
    const depthCm = targetCatalogItem?.depth_cm ?? 50
    const rotationDeg = rotationDegOverride ?? target.rotationDeg ?? 0
    const fromCm = fromCmOverride ?? target.positionCm
    return findNearestValidAlongPath(fromCm, candidateCm, widthCm, depthCm, rotationDeg, effectiveBoundaryCm, obstacles)
  }

  /**
   * Multi-select group move: finds the largest delta-scale t∈[0,1] such that
   * EVERY selected object's footprint (each at its own start position + t ×
   * the shared requested delta) stays valid. Applying the same t to the
   * whole group keeps it rigid — everyone moves by the same fraction of the
   * requested delta and stops together, rather than each object snapping to
   * its own nearest valid point independently (which let the group visually
   * separate when only one member reached a wall/obstacle first).
   */
  const resolveGroupDelta = (
    ids: string[],
    startPositions: Map<string, { x: number; y: number }>,
    deltaCm: { x: number; y: number },
  ): number => {
    const isValidAt = (t: number) => {
      for (const id of ids) {
        const start = startPositions.get(id)
        const memberObj = layoutObjects.find((o) => o.id === id)
        if (!start || !memberObj) continue
        const item = catalogItems.find((i) => i.id === memberObj.catalogItemId)
        const widthCm = item?.width_cm ?? 50
        const depthCm = item?.depth_cm ?? 50
        const rotationDeg = memberObj.rotationDeg ?? 0
        const pos = { x: start.x + deltaCm.x * t, y: start.y + deltaCm.y * t }
        const footprint = getFootprintCorners(pos, widthCm, depthCm, rotationDeg)
        if (!validateFootprint(footprint, effectiveBoundaryCm, obstacles).valid) return false
      }
      return true
    }
    if (isValidAt(1)) return 1
    if (!isValidAt(0)) return 0 // group already invalid at its start position — don't move it further into trouble
    let validT = 0
    let invalidT = 1
    for (let i = 0; i < 14; i++) {
      const midT = (validT + invalidT) / 2
      if (isValidAt(midT)) validT = midT
      else invalidT = midT
    }
    return validT
  }

  const renderGrid = () => {
    const lines = []
    for (let x = 0; x <= roomWidthPx; x += gridSizePx)
      lines.push(<Line key={`v-${x}`} points={[roomOffsetX + x, roomOffsetY, roomOffsetX + x, roomOffsetY + roomDepthPx]} stroke="#e5e7eb" strokeWidth={0.5} />)
    for (let y = 0; y <= roomDepthPx; y += gridSizePx)
      lines.push(<Line key={`h-${y}`} points={[roomOffsetX, roomOffsetY + y, roomOffsetX + roomWidthPx, roomOffsetY + y]} stroke="#e5e7eb" strokeWidth={0.5} />)
    return lines
  }

  const renderObject = (obj: LayoutObject) => {
    const x = cmToPixels(obj.positionCm.x, BASE_SCALE) + roomOffsetX
    const y = cmToPixels(obj.positionCm.y, BASE_SCALE) + roomOffsetY
    const isSelected = obj.id === selectedObjectId
    const isMultiSelected = selectedObjectIds.includes(obj.id)

    const catalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)
    const widthPx = cmToPixels(catalogItem?.width_cm ?? 50, BASE_SCALE)
    const depthPx = cmToPixels(catalogItem?.depth_cm ?? 50, BASE_SCALE)
    const isRound = catalogItem?.name?.toLowerCase().includes('round') ?? false
    const radius = widthPx / 2
    const category = catalogItem?.category ?? 'tables'

    const parentTable = obj.isChairFor ? layoutObjects.find((o) => o.id === obj.isChairFor) : null
    const parentTableItem = parentTable ? catalogItems.find((i) => i.id === parentTable.catalogItemId) : null
    const parentIsRound = parentTableItem?.name?.toLowerCase().includes('round') ?? false
    const isChair = !!obj.isChairFor

    const assignedGuest = isChair ? getGuestForChair(obj.id) : null
    const chairIndex = isChair
      ? layoutObjects.filter((o) => o.isChairFor === obj.isChairFor).findIndex((o) => o.id === obj.id) + 1
      : null

    const fillColor = isGuestMode && isChair
      ? assignedGuest ? '#fef3c7' : '#f9fafb'
      : isSelected
        ? category === 'decorations' ? '#fde68a' : category === 'chairs' ? '#bbf7d0' : '#bfdbfe'
        : isMultiSelected
          ? category === 'decorations' ? '#ede9fe' : category === 'chairs' ? '#e9d5ff' : '#ede9fe'
          : category === 'decorations' ? '#fef3c7' : category === 'chairs' ? '#dcfce7' : '#dbeafe'

    const strokeColor = isGuestMode && isChair
      ? assignedGuest ? '#f59e0b' : '#d1d5db'
      : isSelected
        ? category === 'decorations' ? '#d97706' : category === 'chairs' ? '#16a34a' : '#2563eb'
        : isMultiSelected
          ? '#7c3aed'
          : category === 'decorations' ? '#fcd34d' : category === 'chairs' ? '#86efac' : '#93c5fd'

    const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
      if (isGuestMode) return
      const store = useLayoutStore.getState()
      const currentSelectedIds = store.selectedObjectIds

      if (currentSelectedIds.length > 1 && currentSelectedIds.includes(obj.id)) {
        const currentXPx = e.target.x()
        const currentYPx = e.target.y()
        const currentXCm = pixelsToCm(currentXPx - roomOffsetX, BASE_SCALE)
        const currentYCm = pixelsToCm(currentYPx - roomOffsetY, BASE_SCALE)
        const startPos = multiDragStartPositions.current.get(obj.id)
        const startCm = multiDragStartPosCm.current
        if (startPos && startCm) {
          const deltaCmX = currentXCm - startCm.x
          const deltaCmY = currentYCm - startCm.y
          const allObjects = store.layoutObjects
          const t = resolveGroupDelta(currentSelectedIds, multiDragStartPositions.current, { x: deltaCmX, y: deltaCmY })
          if (t < 1) {
            // Cap the dragged object's own on-screen position too, so it
            // doesn't visually outrun the rest of the group once the group
            // as a whole has hit a wall/obstacle.
            const cappedCm = { x: startCm.x + deltaCmX * t, y: startCm.y + deltaCmY * t }
            e.target.position({
              x: cmToPixels(cappedCm.x, BASE_SCALE) + roomOffsetX,
              y: cmToPixels(cappedCm.y, BASE_SCALE) + roomOffsetY,
            })
          }
          currentSelectedIds.forEach((id) => {
            if (id === obj.id) return
            const other = allObjects.find((o) => o.id === id)
            const otherStart = multiDragStartPositions.current.get(id)
            if (!other || !otherStart) return
            store.updateObject(id, { positionCm: { x: otherStart.x + deltaCmX * t, y: otherStart.y + deltaCmY * t } })
          })
        }
        return
      }

      if (!isChair || !parentTable || !parentTableItem) return
      const existingChairs = layoutObjects.filter((o) => o.isChairFor === parentTable.id)
      const currentX = e.target.x()
      const currentY = e.target.y()
      const mirrorOn = parentTable.mirrorEnabled ?? true

      if (parentIsRound) {
        const chairCatalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)
        const gapCm = 5
        const distanceFromCenter = parentTableItem.width_cm / 2 + gapCm + (chairCatalogItem?.depth_cm ?? 45) / 2
        const currentXCm = pixelsToCm(currentX - roomOffsetX, BASE_SCALE)
        const currentYCm = pixelsToCm(currentY - roomOffsetY, BASE_SCALE)
        const dx = currentXCm - parentTable.positionCm.x
        const dy = currentYCm - parentTable.positionCm.y
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
        const angleRad = (angleDeg * Math.PI) / 180
        const lockedXCm = parentTable.positionCm.x + distanceFromCenter * Math.cos(angleRad)
        const lockedYCm = parentTable.positionCm.y + distanceFromCenter * Math.sin(angleRad)
        // Live-snap the primary dragged chair too — previously this only
        // happened at drag-end, so a round chair could visibly sit inside a
        // wall/obstacle for the whole drag gesture before jumping to a valid
        // spot on release. fromCm is obj.positionCm (stable for this whole
        // gesture, since round-chair position isn't written to the store
        // until drop — only rotationDeg is), so every frame searches from
        // the same known-good starting point.
        const snappedRoundChair = snapPositionToRoom(obj.id, { x: lockedXCm, y: lockedYCm }, angleDeg + 90)
        e.target.position({
          x: cmToPixels(snappedRoundChair.x, BASE_SCALE) + roomOffsetX,
          y: cmToPixels(snappedRoundChair.y, BASE_SCALE) + roomOffsetY,
        })
        updateObject(obj.id, { rotationDeg: angleDeg + 90 })
        if (existingChairs.length % 2 === 0 && mirrorOn) {
          const updated = mirrorDragRound(obj.id, angleDeg, parentTable, parentTableItem.width_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
          updated.forEach((chair) => {
            if (chair.id === obj.id) return
            updateObject(chair.id, {
              positionCm: snapPositionToRoom(chair.id, chair.positionCm, chair.rotationDeg),
              rotationDeg: chair.rotationDeg,
            })
          })
        }
      } else {
        const currentXCm = pixelsToCm(currentX - roomOffsetX, BASE_SCALE)
        const currentYCm = pixelsToCm(currentY - roomOffsetY, BASE_SCALE)
        const chairCatalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)
        if (mirrorOn) {
          const updated = mirrorDragRect(obj, { x: currentXCm, y: currentYCm }, parentTable, parentTableItem.width_cm, parentTableItem.depth_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
          updated.forEach((chair) => {
            const snapped = snapPositionToRoom(chair.id, chair.positionCm, chair.rotationDeg)
            if (chair.id === obj.id) e.target.position({ x: cmToPixels(snapped.x, BASE_SCALE) + roomOffsetX, y: cmToPixels(snapped.y, BASE_SCALE) + roomOffsetY })
            updateObject(chair.id, { positionCm: snapped })
          })
        } else {
          rawDragPosCm.current = { x: currentXCm, y: currentYCm }
          const halfW = parentTableItem.width_cm / 2
          const halfD = parentTableItem.depth_cm / 2
          const gapCm = 5
          const distLong = halfD + gapCm + (chairCatalogItem?.depth_cm ?? 45) / 2
          const distShort = halfW + gapCm + (chairCatalogItem?.depth_cm ?? 45) / 2
          const tableRot = parentTable.rotationDeg ?? 0
          const tx = parentTable.positionCm.x
          const ty = parentTable.positionCm.y
          const edge = obj.chairEdge as 'top' | 'bottom' | 'left' | 'right'
          const cos = Math.cos((-tableRot * Math.PI) / 180)
          const sin = Math.sin((-tableRot * Math.PI) / 180)
          const dx = currentXCm - tx
          const dy = currentYCm - ty
          const ux = tx + dx * cos - dy * sin
          const uy = ty + dx * sin + dy * cos
          let lockedU: { x: number; y: number }
          if (edge === 'top')         lockedU = { x: Math.max(tx - halfW, Math.min(tx + halfW, ux)), y: ty - distLong }
          else if (edge === 'bottom') lockedU = { x: Math.max(tx - halfW, Math.min(tx + halfW, ux)), y: ty + distLong }
          else if (edge === 'left')   lockedU = { x: tx - distShort, y: Math.max(ty - halfD, Math.min(ty + halfD, uy)) }
          else                        lockedU = { x: tx + distShort, y: Math.max(ty - halfD, Math.min(ty + halfD, uy)) }
          const cos2 = Math.cos((tableRot * Math.PI) / 180)
          const sin2 = Math.sin((tableRot * Math.PI) / 180)
          const dx2 = lockedU.x - tx
          const dy2 = lockedU.y - ty
          const lockedXCm = tx + dx2 * cos2 - dy2 * sin2
          const lockedYCm = ty + dx2 * sin2 + dy2 * cos2
          const snapped = snapPositionToRoom(obj.id, { x: lockedXCm, y: lockedYCm })
          e.target.position({ x: cmToPixels(snapped.x, BASE_SCALE) + roomOffsetX, y: cmToPixels(snapped.y, BASE_SCALE) + roomOffsetY })
          updateObject(obj.id, { positionCm: snapped })
        }
      }
    }

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      if (isGuestMode) return
      const store = useLayoutStore.getState()
      const currentSelectedIds = store.selectedObjectIds

      if (currentSelectedIds.length > 1 && currentSelectedIds.includes(obj.id)) {
        const currentXPx = e.target.x()
        const currentYPx = e.target.y()
        const currentXCm = pixelsToCm(currentXPx - roomOffsetX, BASE_SCALE)
        const currentYCm = pixelsToCm(currentYPx - roomOffsetY, BASE_SCALE)
        const startCm = multiDragStartPosCm.current
        const startPos = multiDragStartPositions.current.get(obj.id)
        if (startCm && startPos) {
          const deltaCmX = currentXCm - startCm.x
          const deltaCmY = currentYCm - startCm.y
          const allObjects = store.layoutObjects
          const t = resolveGroupDelta(currentSelectedIds, multiDragStartPositions.current, { x: deltaCmX, y: deltaCmY })
          if (t < 1) {
            const cappedCm = { x: startCm.x + deltaCmX * t, y: startCm.y + deltaCmY * t }
            e.target.position({
              x: cmToPixels(cappedCm.x, BASE_SCALE) + roomOffsetX,
              y: cmToPixels(cappedCm.y, BASE_SCALE) + roomOffsetY,
            })
          }
          currentSelectedIds.forEach((id) => {
            const other = allObjects.find((o) => o.id === id)
            const otherStart = multiDragStartPositions.current.get(id)
            if (!other || !otherStart) return
            store.updateObject(id, { positionCm: { x: otherStart.x + deltaCmX * t, y: otherStart.y + deltaCmY * t } })
          })
        }
        multiDragStartPositions.current.clear()
        multiDragStartPosCm.current = null
        return
      }

      let newX = e.target.x()
      let newY = e.target.y()
      if (snapEnabled && !isChair) {
        newX = snapToGrid(newX - roomOffsetX, gridSizePx) + roomOffsetX
        newY = snapToGrid(newY - roomOffsetY, gridSizePx) + roomOffsetY
      }
      const clamped = resolveDragPosition(
        newX, newY,
        catalogItem?.width_cm ?? 50, catalogItem?.depth_cm ?? 50,
        obj.rotationDeg ?? 0,
        obj.positionCm,
      )
      e.target.position(clamped)
      const newPosCm = { x: pixelsToCm(clamped.x - roomOffsetX, BASE_SCALE), y: pixelsToCm(clamped.y - roomOffsetY, BASE_SCALE) }

      if (isChair && parentTable && parentTableItem) {
        const existingChairs = layoutObjects.filter((o) => o.isChairFor === parentTable.id)
        const isEven = existingChairs.length % 2 === 0
        const mirrorOn = parentTable.mirrorEnabled ?? true
        if (parentIsRound) {
          const dx = newPosCm.x - parentTable.positionCm.x
          const dy = newPosCm.y - parentTable.positionCm.y
          const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
          const chairCatalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)
          if (isEven && mirrorOn) {
            const updated = mirrorDragRound(obj.id, angleDeg, parentTable, parentTableItem.width_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
            updated.forEach((chair) =>
              updateObject(chair.id, {
                positionCm: snapPositionToRoom(chair.id, chair.positionCm, chair.rotationDeg),
                rotationDeg: chair.rotationDeg,
              }),
            )
          } else {
            const gapCm = 5
            const distanceFromCenter = parentTableItem.width_cm / 2 + gapCm + (chairCatalogItem?.depth_cm ?? 45) / 2
            const angleRad = (angleDeg * Math.PI) / 180
            const roundChairPos = {
              x: parentTable.positionCm.x + distanceFromCenter * Math.cos(angleRad),
              y: parentTable.positionCm.y + distanceFromCenter * Math.sin(angleRad),
            }
            updateObject(obj.id, {
              positionCm: snapPositionToRoom(obj.id, roundChairPos, angleDeg + 90),
              rotationDeg: angleDeg + 90,
            })
          }
        } else {
          const chairCatalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)
          const reassignPos = rawDragPosCm.current ?? newPosCm
          rawDragPosCm.current = null
          const reassigned = reassignChairEdge(obj, reassignPos, parentTable, parentTableItem.width_cm, parentTableItem.depth_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
          const draggedResult = reassigned.find((c) => c.id === obj.id)
          const edgeChanged = draggedResult?.chairEdge !== obj.chairEdge
          if (edgeChanged) {
            reassigned.forEach((chair) =>
              updateObject(chair.id, {
                positionCm: snapPositionToRoom(chair.id, chair.positionCm, chair.rotationDeg),
                rotationDeg: chair.rotationDeg,
                chairEdge: chair.chairEdge,
              }),
            )
            const draggedFinal = reassigned.find((c) => c.id === obj.id)!
            const draggedSnapped = snapPositionToRoom(obj.id, draggedFinal.positionCm, draggedFinal.rotationDeg)
            e.target.position({ x: cmToPixels(draggedSnapped.x, BASE_SCALE) + roomOffsetX, y: cmToPixels(draggedSnapped.y, BASE_SCALE) + roomOffsetY })
          } else if (isEven && mirrorOn) {
            const updated = mirrorDragRect(obj, newPosCm, parentTable, parentTableItem.width_cm, parentTableItem.depth_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
            updated.forEach((chair) => updateObject(chair.id, { positionCm: snapPositionToRoom(chair.id, chair.positionCm) }))
          } else {
            updateObject(obj.id, { positionCm: snapPositionToRoom(obj.id, newPosCm) })
          }
        }
        return
      }

      updateObject(obj.id, { positionCm: newPosCm })
      if (obj.chairIds && obj.chairIds.length > 0) {
        const existingChairs = layoutObjects.filter((o) => o.isChairFor === obj.id)
        if (existingChairs.length > 0) {
          const deltaX = newPosCm.x - obj.positionCm.x
          const deltaY = newPosCm.y - obj.positionCm.y
          existingChairs.forEach((chair) => {
            const candidateCm = { x: chair.positionCm.x + deltaX, y: chair.positionCm.y + deltaY }
            updateObject(chair.id, { positionCm: snapPositionToRoom(chair.id, candidateCm) })
          })
        }
      }
    }

    const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
      if (isGuestMode) { e.target.stopDrag(); return }
      const store = useLayoutStore.getState()
      const currentSelectedIds = store.selectedObjectIds
      if (currentSelectedIds.length > 1 && currentSelectedIds.includes(obj.id)) {
        multiDragStartPositions.current.clear()
        const allObjects = store.layoutObjects
        currentSelectedIds.forEach((id) => {
          const o = allObjects.find((lo) => lo.id === id)
          if (o) multiDragStartPositions.current.set(id, { x: o.positionCm.x, y: o.positionCm.y })
        })
        multiDragStartPosCm.current = {
          x: pixelsToCm(e.target.x() - roomOffsetX, BASE_SCALE),
          y: pixelsToCm(e.target.y() - roomOffsetY, BASE_SCALE),
        }
      }
    }

    const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
      const newRotation = e.target.rotation()
      const oldRotation = obj.rotationDeg
      updateObject(obj.id, { rotationDeg: newRotation })
      if (obj.chairIds && obj.chairIds.length > 0) {
        const existingChairs = layoutObjects.filter((o) => o.isChairFor === obj.id)
        if (existingChairs.length > 0) {
          rotateChairsWithTable(obj, newRotation, oldRotation, existingChairs)
            .forEach((chair) => updateObject(chair.id, { positionCm: chair.positionCm, rotationDeg: chair.rotationDeg }))
        }
      }
    }

    const handleClick = () => {
      if (isGuestMode && isChair) {
        onChairClickInGuestMode?.(obj.id)
        return
      }
      selectObject(obj.id)
    }

    const rawRot = obj.rotationDeg % 360
    const normalizedRot = rawRot > 90 && rawRot <= 270 ? rawRot + 180 : rawRot

    const label = isGuestMode && isChair
      ? assignedGuest ? assignedGuest.name : String(chairIndex ?? '')
      : obj.tableLabel
        ? obj.tableLabel
        : catalogItem?.name ?? obj.catalogItemId

    return (
      <Group
        key={obj.id}
        id={obj.id}
        x={x}
        y={y}
        rotation={obj.rotationDeg}
        draggable={!isGuestMode}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onTap={handleClick}
        onTransformEnd={handleTransformEnd}
      >
        {isRound ? (
          <Circle radius={radius} fill={fillColor} stroke={strokeColor} strokeWidth={isGuestMode && isChair ? 1.5 : 1} />
        ) : category === 'chairs' ? (
          <Rect width={widthPx} height={depthPx} offsetX={widthPx / 2} offsetY={depthPx / 2} fill={fillColor} stroke={strokeColor} strokeWidth={isGuestMode && isChair ? 1.5 : 1} cornerRadius={3} />
        ) : category === 'decorations' ? (
          <Rect width={widthPx} height={depthPx} offsetX={widthPx / 2} offsetY={depthPx / 2} fill={fillColor} stroke={strokeColor} strokeWidth={1} cornerRadius={2} />
        ) : (
          <Rect width={widthPx} height={depthPx} offsetX={widthPx / 2} offsetY={depthPx / 2} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
        )}
        <Text
          text={label}
          fontSize={Math.max(6, Math.min(widthPx * 0.18, 11))}
          fill={isGuestMode && isChair && assignedGuest ? '#92400e' : '#374151'}
          width={isRound ? radius * 1.2 : widthPx * 0.9}
          height={isRound ? radius * 1.2 : depthPx * 0.9}
          offsetX={isRound ? radius * 0.6 : widthPx * 0.45}
          offsetY={isRound ? radius * 0.6 : depthPx * 0.45}
          align="center"
          verticalAlign="middle"
          wrap="word"
          rotation={-obj.rotationDeg + normalizedRot}
        />
        {obj.tableNote && !isChair && (
          <Text
            text="📝"
            fontSize={28}
            x={isRound ? -14 : widthPx / 2 - 36}
            y={isRound ? -radius * 0.6 : -depthPx / 2 + 6}
            rotation={-obj.rotationDeg + normalizedRot}
            onMouseEnter={() => {
              const stage = stageRef.current
              if (!stage) return
              const pointer = stage.getPointerPosition()
              if (!pointer) return
              setTooltip({ text: obj.tableNote!, x: pointer.x, y: pointer.y })
              stage.container().style.cursor = 'default'
            }}
            onMouseMove={() => {
              const stage = stageRef.current
              if (!stage) return
              const pointer = stage.getPointerPosition()
              if (!pointer) return
              setTooltip((prev) => prev ? { ...prev, x: pointer.x, y: pointer.y } : null)
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        )}
      </Group>
    )
  }

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) return
    setTooltip(null)
    if (e.target === e.target.getStage() && !isGuestMode) {
      selectObject(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()

    // Guest dragging from the panel onto the canvas — find the nearest chair
    const guestId = e.dataTransfer.getData('guestId')
    if (guestId && isGuestMode) {
      const stage = stageRef.current
      if (!stage) return
      const stageBox = stage.container().getBoundingClientRect()
      const dropX = (e.clientX - stageBox.left - stagePosRef.current.x) / zoomRef.current
      const dropY = (e.clientY - stageBox.top - stagePosRef.current.y) / zoomRef.current

      let closestChair: LayoutObject | null = null
      let closestDist = 30 / zoomRef.current
      for (const obj of layoutObjects) {
        if (!obj.isChairFor) continue
        const ox = cmToPixels(obj.positionCm.x, BASE_SCALE) + roomOffsetX
        const oy = cmToPixels(obj.positionCm.y, BASE_SCALE) + roomOffsetY
        const dist = Math.sqrt((ox - dropX) ** 2 + (oy - dropY) ** 2)
        if (dist < closestDist) { closestDist = dist; closestChair = obj }
      }

      if (closestChair) onGuestDropOnChair?.(closestChair.id, guestId)
      return
    }

    // Catalog item drop
    const itemData = e.dataTransfer.getData('catalogItem')
    if (!itemData || isGuestMode) return
    const item: DbCatalogItem = JSON.parse(itemData)
    const stage = stageRef.current
    if (!stage) return
    const stageBox = stage.container().getBoundingClientRect()
    const x = (e.clientX - stageBox.left - stagePosRef.current.x) / zoomRef.current
    const y = (e.clientY - stageBox.top - stagePosRef.current.y) / zoomRef.current

    const widthCm = item.width_cm ?? 50
    const depthCm = item.depth_cm ?? 50

    // A fresh drop has no configuration yet (no chairs assigned, nothing to
    // lose) — unlike moving an already-placed table, where snapping to the
    // nearest valid spot makes sense so you don't lose that setup, here it's
    // simpler to just refuse the drop outright when it's outside the
    // boundary or inside an obstacle. Placing nothing means there's nothing
    // to configure, so onTableDropped never fires and the chair-count
    // popover correctly never shows for a table that isn't there. Uses
    // effectiveBoundaryCm so this is rotation-aware and correct even in
    // untraced rooms, same as every other collision check in this file.
    const candidateCm = { x: pixelsToCm(x - roomOffsetX, BASE_SCALE), y: pixelsToCm(y - roomOffsetY, BASE_SCALE) }
    const footprint = getFootprintCorners(candidateCm, widthCm, depthCm, 0)
    const { valid } = validateFootprint(footprint, effectiveBoundaryCm, obstacles)
    if (!valid) return
    const placedCm = candidateCm

    const placedPx = { x: cmToPixels(placedCm.x, BASE_SCALE) + roomOffsetX, y: cmToPixels(placedCm.y, BASE_SCALE) + roomOffsetY }
    const snappedX = snapEnabled ? snapToGrid(placedPx.x - roomOffsetX, gridSizePx) + roomOffsetX : placedPx.x
    const snappedY = snapEnabled ? snapToGrid(placedPx.y - roomOffsetY, gridSizePx) + roomOffsetY : placedPx.y
    const newObject: LayoutObject = {
      id: generateId(),
      catalogItemId: item.id,
      positionCm: { x: pixelsToCm(snappedX - roomOffsetX, BASE_SCALE), y: pixelsToCm(snappedY - roomOffsetY, BASE_SCALE) },
      rotationDeg: 0,
      quantity: 1,
    }
    if (item.category === 'tables' && onTableDropped) onTableDropped(newObject, item)
    else addObject(newObject)
  }

  return (
    <div className="relative w-full h-full">

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1">
        <button onClick={handleZoomOut}   className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded font-medium text-lg">−</button>
        <button onClick={handleZoomReset} className="px-2 text-xs text-gray-500 hover:bg-gray-100 rounded min-w-[48px] text-center">{Math.round(zoom * 100)}%</button>
        <button onClick={handleZoomIn}    className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded font-medium text-lg">+</button>
      </div>

      {/* Guest mode banner */}
      {isGuestMode && (
        <div className="absolute top-3 left-3 z-10 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          <p className="text-xs text-amber-700 font-medium">👥 Guest Mode — click a chair to assign, or drag from the guest list</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden bg-gray-100"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePos.x}
          y={stagePos.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleStageClick}
        >
          <Layer>
            {/* Canvas background */}
            <Rect x={0} y={0} width={totalWidth} height={totalHeight} fill="#f3f4f6" />

            {/* Room floor — traced wall boundary from the venue manager's floor plan
                once it exists, otherwise the legacy rectangle so older/unconfigured
                rooms keep rendering exactly as before. */}
            {hasTracedBoundary ? (
              <>
                {/* Image, boundary line, and obstacles are all positioned in the
                    same absolute canvas-px space as renderObject (roomOffsetX/Y +
                    cm→px), so no extra Group offset is needed here — nesting one
                    would double-apply the offset already baked into boundaryPolygonPx. */}
                {floorPlanImage && (
                  <KonvaImage
                    image={floorPlanImage}
                    x={roomOffsetX} y={roomOffsetY}
                    width={floorPlanWidthPx} height={floorPlanDepthPx}
                    opacity={0.5} listening={false}
                  />
                )}
                <Line
                  points={boundaryPolygonPx.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={floorPlanImage ? undefined : '#ffffff'}
                  stroke="#374151"
                  strokeWidth={4}
                  shadowColor="rgba(0,0,0,0.15)" shadowBlur={10} shadowOffsetX={2} shadowOffsetY={2}
                  listening={false}
                />
                {obstacles.map((o) => (
                  <ObstacleRender key={o.id} obstacle={o} roomOffsetX={roomOffsetX} roomOffsetY={roomOffsetY} />
                ))}
              </>
            ) : (
              <Rect
                x={roomOffsetX} y={roomOffsetY}
                width={roomWidthPx} height={roomDepthPx}
                fill="#ffffff" stroke="#374151" strokeWidth={3}
                shadowColor="rgba(0,0,0,0.15)" shadowBlur={10} shadowOffsetX={2} shadowOffsetY={2}
              />
            )}

            {/* Room label */}
            <Text x={roomOffsetX + 8} y={roomOffsetY + 8} text={roomName} fontSize={11} fill="#9ca3af" />

            {renderGrid()}
            {layoutObjects.map(renderObject)}

            {/* Drag-selection rectangle */}
            {selectionRect && (
              <Rect
                x={selectionRect.x} y={selectionRect.y}
                width={selectionRect.w} height={selectionRect.h}
                fill="rgba(99, 102, 241, 0.08)" stroke="#6366f1" strokeWidth={1}
                dash={[4, 3]} listening={false}
              />
            )}

            <Transformer ref={transformerRef} rotateEnabled={true} resizeEnabled={false} enabledAnchors={[]} />
          </Layer>
        </Stage>
      </div>

      {/* Table note tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 max-w-[280px] bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-pre-wrap leading-relaxed"
          style={{ left: tooltip.x + 16, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

/** Read-only render of a venue-defined obstacle (pillar/column/planter) on the Planner's canvas. */
function ObstacleRender({
  obstacle,
  roomOffsetX,
  roomOffsetY,
}: {
  obstacle: ObstacleShape
  roomOffsetX: number
  roomOffsetY: number
}) {
  const toPx = (p: Point2D) => ({
    x: cmToPixels(p.x, BASE_SCALE) + roomOffsetX,
    y: cmToPixels(p.y, BASE_SCALE) + roomOffsetY,
  })
  const shared = { fill: 'rgba(120,113,108,0.35)', stroke: '#78716c', strokeWidth: 1.5, listening: false }

  if (obstacle.type === 'circle') {
    const c = toPx(obstacle.center)
    return <Circle x={c.x} y={c.y} radius={cmToPixels(obstacle.radiusCm, BASE_SCALE)} {...shared} />
  }
  if (obstacle.type === 'rect') {
    const c = toPx(obstacle.center)
    const wPx = cmToPixels(obstacle.widthCm, BASE_SCALE)
    const dPx = cmToPixels(obstacle.depthCm, BASE_SCALE)
    return (
      <Group x={c.x} y={c.y} rotation={obstacle.rotationDeg}>
        <Rect x={-wPx / 2} y={-dPx / 2} width={wPx} height={dPx} {...shared} />
      </Group>
    )
  }
  const pointsPx = obstacle.points.map(toPx)
  return <Line points={pointsPx.flatMap((p) => [p.x, p.y])} closed {...shared} />
}