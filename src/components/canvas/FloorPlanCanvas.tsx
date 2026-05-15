'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Circle, Text, Line, Group, Transformer } from 'react-konva'
import { useLayoutStore } from '@/stores/layoutStore'
import { cmToPixels, pixelsToCm, snapToGrid, generateId } from '@/lib/utils/coordinates'
import { CatalogItem, LayoutObject } from '@/types'
import Konva from 'konva'

const BASE_SCALE = 2
const ROOM_WIDTH_CM = 1500
const ROOM_DEPTH_CM = 1000
const CANVAS_PADDING = 60
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

const PLACEHOLDER_CATALOG = [
  {
    id: 'round-table',
    name: 'Round Table',
    dimensions: { widthCm: 120, depthCm: 120 },
  },
  {
    id: 'rect-table',
    name: 'Rectangular Table',
    dimensions: { widthCm: 180, depthCm: 90 },
  },
  {
    id: 'chair',
    name: 'Chair',
    dimensions: { widthCm: 45, depthCm: 45 },
  },
]

type Props = {
  onObjectSelect?: (object: LayoutObject | null) => void
  onZoomChange?: (zoom: number) => void
}

export default function FloorPlanCanvas({ onObjectSelect, onZoomChange }: Props) {
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
    setStageSize({
      width: container.offsetWidth,
      height: container.offsetHeight,
    })
    const handleResize = () => {
      setStageSize({
        width: container.offsetWidth,
        height: container.offsetHeight,
      })
    }
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
    const factor = 0.1
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + direction * factor))

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldZoom,
      y: (pointer.y - stage.y()) / oldZoom,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    }

    setZoom(newZoom)
    setStagePos(newPos)
    onZoomChange?.(newZoom)
  }, [zoom, onZoomChange])

  const handleZoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, zoom + 0.1)
    setZoom(newZoom)
    onZoomChange?.(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, zoom - 0.1)
    setZoom(newZoom)
    onZoomChange?.(newZoom)
  }

  const handleZoomReset = () => {
    setZoom(1)
    setStagePos({ x: 0, y: 0 })
    onZoomChange?.(1)
  }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const isMiddle = e.evt.button === 1
    const isRight = e.evt.button === 2
    if (!isMiddle && !isRight) return
    e.evt.preventDefault()
    isPanning.current = true
    lastPointerPos.current = { x: e.evt.clientX, y: e.evt.clientY }
    const stage = stageRef.current
    if (stage) stage.container().style.cursor = 'grabbing'
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
    const stage = stageRef.current
    if (stage) stage.container().style.cursor = 'default'
  }

  const clampToRoom = (x: number, y: number, halfW: number, halfH: number) => {
    return {
      x: Math.max(roomOffsetX + halfW, Math.min(roomOffsetX + roomWidthPx - halfW, x)),
      y: Math.max(roomOffsetY + halfH, Math.min(roomOffsetY + roomDepthPx - halfH, y)),
    }
  }

  const renderGrid = () => {
    const lines = []
    for (let x = 0; x <= roomWidthPx; x += gridSizePx) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[roomOffsetX + x, roomOffsetY, roomOffsetX + x, roomOffsetY + roomDepthPx]}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      )
    }
    for (let y = 0; y <= roomDepthPx; y += gridSizePx) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[roomOffsetX, roomOffsetY + y, roomOffsetX + roomWidthPx, roomOffsetY + y]}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      )
    }
    return lines
  }

  const renderObject = (obj: LayoutObject) => {
    const x = cmToPixels(obj.positionCm.x, BASE_SCALE) + roomOffsetX
    const y = cmToPixels(obj.positionCm.y, BASE_SCALE) + roomOffsetY
    const isSelected = obj.id === selectedObjectId

    const catalogItem = PLACEHOLDER_CATALOG.find((i) => i.id === obj.catalogItemId)
    const widthPx = cmToPixels(catalogItem?.dimensions.widthCm ?? 50, BASE_SCALE)
    const depthPx = cmToPixels(catalogItem?.dimensions.depthCm ?? 50, BASE_SCALE)
    const isRound = obj.catalogItemId === 'round-table'
    const radius = widthPx / 2

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      let newX = e.target.x()
      let newY = e.target.y()

      if (snapEnabled) {
        newX = snapToGrid(newX - roomOffsetX, gridSizePx) + roomOffsetX
        newY = snapToGrid(newY - roomOffsetY, gridSizePx) + roomOffsetY
      }

      const clamped = clampToRoom(newX, newY, widthPx / 2, depthPx / 2)
      e.target.position(clamped)

      updateObject(obj.id, {
        positionCm: {
          x: pixelsToCm(clamped.x - roomOffsetX, BASE_SCALE),
          y: pixelsToCm(clamped.y - roomOffsetY, BASE_SCALE),
        }
      })
    }

    const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
      updateObject(obj.id, {
        rotationDeg: e.target.rotation(),
      })
    }

    const handleClick = () => {
      selectObject(obj.id)
      onObjectSelect?.(obj)
    }

    return (
      <Group
        key={obj.id}
        id={obj.id}
        x={x}
        y={y}
        rotation={obj.rotationDeg}
        draggable
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onTap={handleClick}
        onTransformEnd={handleTransformEnd}
      >
        {isRound ? (
          <Circle
            radius={radius}
            fill={isSelected ? '#bfdbfe' : '#dbeafe'}
            stroke={isSelected ? '#2563eb' : '#93c5fd'}
            strokeWidth={1}
          />
        ) : (
          <Rect
            width={widthPx}
            height={depthPx}
            offsetX={widthPx / 2}
            offsetY={depthPx / 2}
            fill={isSelected ? '#bbf7d0' : '#dcfce7'}
            stroke={isSelected ? '#16a34a' : '#86efac'}
            strokeWidth={1}
          />
        )}
        <Text
          text={catalogItem?.name ?? obj.catalogItemId}
          fontSize={Math.max(8, widthPx * 0.1)}
          fill="#374151"
          offsetX={isRound ? radius * 0.5 : widthPx * 0.3}
          offsetY={isRound ? 5 : depthPx * 0.1}
        />
      </Group>
    )
  }

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) return
    if (e.target === e.target.getStage()) {
      selectObject(null)
      onObjectSelect?.(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const itemData = e.dataTransfer.getData('catalogItem')
    if (!itemData) return

    const item: CatalogItem = JSON.parse(itemData)
    const stage = stageRef.current
    if (!stage) return

    const stageBox = stage.container().getBoundingClientRect()
    const x = (e.clientX - stageBox.left - stagePos.x) / zoom
    const y = (e.clientY - stageBox.top - stagePos.y) / zoom

    if (
      x < roomOffsetX || x > roomOffsetX + roomWidthPx ||
      y < roomOffsetY || y > roomOffsetY + roomDepthPx
    ) return

    let snappedX = x
    let snappedY = y

    if (snapEnabled) {
      snappedX = snapToGrid(x - roomOffsetX, gridSizePx) + roomOffsetX
      snappedY = snapToGrid(y - roomOffsetY, gridSizePx) + roomOffsetY
    }

    addObject({
      id: generateId(),
      catalogItemId: item.id,
      positionCm: {
        x: pixelsToCm(snappedX - roomOffsetX, BASE_SCALE),
        y: pixelsToCm(snappedY - roomOffsetY, BASE_SCALE),
      },
      rotationDeg: 0,
      quantity: 1,
    })
  }

  return (
    <div className="relative w-full h-full">
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1">
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded font-medium text-lg"
        >
          −
        </button>
        <button
          onClick={handleZoomReset}
          className="px-2 text-xs text-gray-500 hover:bg-gray-100 rounded min-w-[48px] text-center"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded font-medium text-lg"
        >
          +
        </button>
      </div>

      {/* Canvas container */}
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
            <Rect
              x={0}
              y={0}
              width={totalWidth}
              height={totalHeight}
              fill="#f3f4f6"
            />
            <Rect
              x={roomOffsetX}
              y={roomOffsetY}
              width={roomWidthPx}
              height={roomDepthPx}
              fill="#ffffff"
              stroke="#374151"
              strokeWidth={3}
              shadowColor="rgba(0,0,0,0.15)"
              shadowBlur={10}
              shadowOffsetX={2}
              shadowOffsetY={2}
            />
            <Text
              x={roomOffsetX + 8}
              y={roomOffsetY + 8}
              text={`Test Venue — Main Hall  (${ROOM_WIDTH_CM / 100}m × ${ROOM_DEPTH_CM / 100}m)`}
              fontSize={11}
              fill="#9ca3af"
            />
            {renderGrid()}
            {layoutObjects.map(renderObject)}
            <Transformer
              ref={transformerRef}
              rotateEnabled={true}
              resizeEnabled={false}
              enabledAnchors={[]}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}