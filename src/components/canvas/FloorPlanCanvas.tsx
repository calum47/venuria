'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Circle, Text, Line, Group, Transformer } from 'react-konva'
import { useLayoutStore } from '@/stores/layoutStore'
import { cmToPixels, pixelsToCm, snapToGrid, generateId } from '@/lib/utils/coordinates'
import { LayoutObject } from '@/types'
import Konva from 'konva'
import { mirrorDragRound, mirrorDragRect, rotateChairsWithTable, reassignChairEdge } from '@/lib/utils/seating'

const BASE_SCALE = 2
const ROOM_WIDTH_CM = 1500
const ROOM_DEPTH_CM = 1000
const CANVAS_PADDING = 60
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

type DbCatalogItem = {
  id: string
  name: string
  width_cm: number
  depth_cm: number
  category: string
}

type Props = {
  onObjectSelect?: (object: LayoutObject | null) => void
  onZoomChange?: (zoom: number) => void
  catalogItems: DbCatalogItem[]
  onTableDropped?: (tableObject: LayoutObject, tableItem: DbCatalogItem) => void
}

export default function FloorPlanCanvas({ onObjectSelect, onZoomChange, catalogItems, onTableDropped }: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const lastPointerPos = useRef({ x: 0, y: 0 })

  const {
    layoutObjects,
    selectedObjectId,
    snapToGrid: snapEnabled,
    gridSizeCm,
    addObject,
    updateObject,
    selectObject,
  } = useLayoutStore()

  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const gridSizePx = cmToPixels(gridSizeCm, BASE_SCALE)
  const roomWidthPx = cmToPixels(ROOM_WIDTH_CM, BASE_SCALE)
  const roomDepthPx = cmToPixels(ROOM_DEPTH_CM, BASE_SCALE)
  const roomOffsetX = CANVAS_PADDING
  const roomOffsetY = CANVAS_PADDING
  const totalWidth = roomWidthPx + CANVAS_PADDING * 2
  const totalHeight = roomDepthPx + CANVAS_PADDING * 2

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
    if (selectedObjectId) {
      const shape = stageRef.current.findOne(`#${selectedObjectId}`)
      if (shape) {
        transformerRef.current.nodes([shape])
        transformerRef.current.getLayer()?.batchDraw()
      }
    } else {
      transformerRef.current.nodes([])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [selectedObjectId])

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldZoom = zoom
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + direction * 0.1))
    const mousePointTo = { x: (pointer.x - stage.x()) / oldZoom, y: (pointer.y - stage.y()) / oldZoom }
    setZoom(newZoom)
    setStagePos({ x: pointer.x - mousePointTo.x * newZoom, y: pointer.y - mousePointTo.y * newZoom })
    onZoomChange?.(newZoom)
  }, [zoom, onZoomChange])

  const handleZoomIn = () => { const z = Math.min(MAX_ZOOM, zoom + 0.1); setZoom(z); onZoomChange?.(z) }
  const handleZoomOut = () => { const z = Math.max(MIN_ZOOM, zoom - 0.1); setZoom(z); onZoomChange?.(z) }
  const handleZoomReset = () => { setZoom(1); setStagePos({ x: 0, y: 0 }); onZoomChange?.(1) }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 1 && e.evt.button !== 2) return
    e.evt.preventDefault()
    isPanning.current = true
    lastPointerPos.current = { x: e.evt.clientX, y: e.evt.clientY }
    stageRef.current?.container().style.setProperty('cursor', 'grabbing')
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPanning.current) return
    const dx = e.evt.clientX - lastPointerPos.current.x
    const dy = e.evt.clientY - lastPointerPos.current.y
    lastPointerPos.current = { x: e.evt.clientX, y: e.evt.clientY }
    setStagePos((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }

  const handleMouseUp = () => {
    if (!isPanning.current) return
    isPanning.current = false
    stageRef.current?.container().style.setProperty('cursor', 'default')
  }

  const clampToRoom = (x: number, y: number, halfW: number, halfH: number) => ({
    x: Math.max(roomOffsetX + halfW, Math.min(roomOffsetX + roomWidthPx - halfW, x)),
    y: Math.max(roomOffsetY + halfH, Math.min(roomOffsetY + roomDepthPx - halfH, y)),
  })

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

    const fillColor = isSelected
      ? category === 'decorations' ? '#fde68a' : category === 'chairs' ? '#bbf7d0' : '#bfdbfe'
      : category === 'decorations' ? '#fef3c7' : category === 'chairs' ? '#dcfce7' : '#dbeafe'

    const strokeColor = isSelected
      ? category === 'decorations' ? '#d97706' : category === 'chairs' ? '#16a34a' : '#2563eb'
      : category === 'decorations' ? '#fcd34d' : category === 'chairs' ? '#86efac' : '#93c5fd'

    const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
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
        e.target.position({ x: cmToPixels(lockedXCm, BASE_SCALE) + roomOffsetX, y: cmToPixels(lockedYCm, BASE_SCALE) + roomOffsetY })
        updateObject(obj.id, { rotationDeg: angleDeg + 90 })

        if (existingChairs.length % 2 === 0 && mirrorOn) {
          const updated = mirrorDragRound(obj.id, angleDeg, parentTable, parentTableItem.width_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
          updated.forEach((chair) => { if (chair.id !== obj.id) updateObject(chair.id, { positionCm: chair.positionCm, rotationDeg: chair.rotationDeg }) })
        }
      } else {
        const currentXCm = pixelsToCm(currentX - roomOffsetX, BASE_SCALE)
        const currentYCm = pixelsToCm(currentY - roomOffsetY, BASE_SCALE)
        const chairCatalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)

        if (mirrorOn) {
          const updated = mirrorDragRect(obj, { x: currentXCm, y: currentYCm }, parentTable, parentTableItem.width_cm, parentTableItem.depth_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
          updated.forEach((chair) => {
            if (chair.id === obj.id) {
              e.target.position({ x: cmToPixels(chair.positionCm.x, BASE_SCALE) + roomOffsetX, y: cmToPixels(chair.positionCm.y, BASE_SCALE) + roomOffsetY })
            }
            updateObject(chair.id, { positionCm: chair.positionCm })
          })
        }
        // When mirror is off, Konva handles the visual drag freely — no locking during move
      }
    }

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      let newX = e.target.x()
      let newY = e.target.y()

      if (snapEnabled && !isChair) {
        newX = snapToGrid(newX - roomOffsetX, gridSizePx) + roomOffsetX
        newY = snapToGrid(newY - roomOffsetY, gridSizePx) + roomOffsetY
      }

      const clamped = clampToRoom(newX, newY, widthPx / 2, depthPx / 2)
      e.target.position(clamped)

      const newPosCm = {
        x: pixelsToCm(clamped.x - roomOffsetX, BASE_SCALE),
        y: pixelsToCm(clamped.y - roomOffsetY, BASE_SCALE),
      }

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
            updated.forEach((chair) => updateObject(chair.id, { positionCm: chair.positionCm, rotationDeg: chair.rotationDeg }))
          } else {
            const gapCm = 5
            const distanceFromCenter = parentTableItem.width_cm / 2 + gapCm + (chairCatalogItem?.depth_cm ?? 45) / 2
            const angleRad = (angleDeg * Math.PI) / 180
            updateObject(obj.id, {
              positionCm: {
                x: parentTable.positionCm.x + distanceFromCenter * Math.cos(angleRad),
                y: parentTable.positionCm.y + distanceFromCenter * Math.sin(angleRad),
              },
              rotationDeg: angleDeg + 90,
            })
          }
        } else {
          const chairCatalogItem = catalogItems.find((i) => i.id === obj.catalogItemId)

          // Always try edge reassignment first
          const reassigned = reassignChairEdge(
            obj,
            newPosCm,
            parentTable,
            parentTableItem.width_cm,
            parentTableItem.depth_cm,
            chairCatalogItem?.depth_cm ?? 45,
            existingChairs
          )

          const draggedResult = reassigned.find((c) => c.id === obj.id)
          const edgeChanged = draggedResult?.chairEdge !== obj.chairEdge

          if (edgeChanged) {
            reassigned.forEach((chair) =>
              updateObject(chair.id, {
                positionCm: chair.positionCm,
                rotationDeg: chair.rotationDeg,
                chairEdge: chair.chairEdge,
              })
            )
          } else if (isEven && mirrorOn) {
            const updated = mirrorDragRect(obj, newPosCm, parentTable, parentTableItem.width_cm, parentTableItem.depth_cm, chairCatalogItem?.depth_cm ?? 45, existingChairs)
            updated.forEach((chair) => updateObject(chair.id, { positionCm: chair.positionCm }))
          } else {
            updateObject(obj.id, { positionCm: newPosCm })
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
          existingChairs.forEach((chair) => updateObject(chair.id, { positionCm: { x: chair.positionCm.x + deltaX, y: chair.positionCm.y + deltaY } }))
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

    const handleClick = () => { selectObject(obj.id); onObjectSelect?.(obj) }

    const rawRot = obj.rotationDeg % 360
    const normalizedRot = rawRot > 90 && rawRot <= 270 ? rawRot + 180 : rawRot
    const label = obj.tableLabel ? obj.tableLabel : catalogItem?.name ?? obj.catalogItemId

    return (
      <Group key={obj.id} id={obj.id} x={x} y={y} rotation={obj.rotationDeg} draggable onDragMove={handleDragMove} onDragEnd={handleDragEnd} onClick={handleClick} onTap={handleClick} onTransformEnd={handleTransformEnd}>
        {isRound ? (
          <Circle radius={radius} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
        ) : category === 'chairs' ? (
          <Rect width={widthPx} height={depthPx} offsetX={widthPx / 2} offsetY={depthPx / 2} fill={fillColor} stroke={strokeColor} strokeWidth={1} cornerRadius={3} />
        ) : category === 'decorations' ? (
          <Rect width={widthPx} height={depthPx} offsetX={widthPx / 2} offsetY={depthPx / 2} fill={fillColor} stroke={strokeColor} strokeWidth={1} cornerRadius={2} />
        ) : (
          <Rect width={widthPx} height={depthPx} offsetX={widthPx / 2} offsetY={depthPx / 2} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
        )}
        <Text
          text={label}
          fontSize={Math.max(8, widthPx * 0.1)}
          fill="#374151"
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
    if (e.target === e.target.getStage()) { selectObject(null); onObjectSelect?.(null) }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const itemData = e.dataTransfer.getData('catalogItem')
    if (!itemData) return
    const item: DbCatalogItem = JSON.parse(itemData)
    const stage = stageRef.current
    if (!stage) return
    const stageBox = stage.container().getBoundingClientRect()
    const x = (e.clientX - stageBox.left - stagePos.x) / zoom
    const y = (e.clientY - stageBox.top - stagePos.y) / zoom
    if (x < roomOffsetX || x > roomOffsetX + roomWidthPx || y < roomOffsetY || y > roomOffsetY + roomDepthPx) return
    const snappedX = snapEnabled ? snapToGrid(x - roomOffsetX, gridSizePx) + roomOffsetX : x
    const snappedY = snapEnabled ? snapToGrid(y - roomOffsetY, gridSizePx) + roomOffsetY : y
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
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1">
        <button onClick={handleZoomOut} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded font-medium text-lg">−</button>
        <button onClick={handleZoomReset} className="px-2 text-xs text-gray-500 hover:bg-gray-100 rounded min-w-[48px] text-center">{Math.round(zoom * 100)}%</button>
        <button onClick={handleZoomIn} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded font-medium text-lg">+</button>
      </div>

      <div ref={containerRef} className="w-full h-full overflow-hidden bg-gray-100" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
        <Stage ref={stageRef} width={stageSize.width} height={stageSize.height} scaleX={zoom} scaleY={zoom} x={stagePos.x} y={stagePos.y} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onClick={handleStageClick}>
          <Layer>
            <Rect x={0} y={0} width={totalWidth} height={totalHeight} fill="#f3f4f6" />
            <Rect x={roomOffsetX} y={roomOffsetY} width={roomWidthPx} height={roomDepthPx} fill="#ffffff" stroke="#374151" strokeWidth={3} shadowColor="rgba(0,0,0,0.15)" shadowBlur={10} shadowOffsetX={2} shadowOffsetY={2} />
            <Text x={roomOffsetX + 8} y={roomOffsetY + 8} text={`Test Venue — Main Hall  (${ROOM_WIDTH_CM / 100}m × ${ROOM_DEPTH_CM / 100}m)`} fontSize={11} fill="#9ca3af" />
            {renderGrid()}
            {layoutObjects.map(renderObject)}
            <Transformer ref={transformerRef} rotateEnabled={true} resizeEnabled={false} enabledAnchors={[]} />
          </Layer>
        </Stage>
      </div>

      {tooltip && (
        <div className="fixed z-50 max-w-[280px] bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-pre-wrap leading-relaxed" style={{ left: tooltip.x + 16, top: tooltip.y - 8 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}