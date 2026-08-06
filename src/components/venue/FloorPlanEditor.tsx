'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Group } from 'react-konva'
import Konva from 'konva'
import { ObstacleShape, Point2D } from '@/types'
import { DbRoom } from '@/types/db'
import { distanceCm } from '@/lib/utils/geometry'
import {
  uploadRoomFloorPlan,
  updateRoomCalibration,
  updateRoomBoundary,
  updateRoomObstacles,
  newObstacleId,
} from '@/lib/supabase/queries'

type Tool = 'view' | 'calibrate' | 'boundary' | 'obstacle-rect' | 'obstacle-circle' | 'obstacle-polygon'

type Props = {
  venueId: string
  room: DbRoom
  onRoomUpdated: (room: DbRoom) => void
}

const STAGE_PADDING = 40
const MIN_ZOOM = 0.1
const MAX_ZOOM = 3

/**
 * NOTE: the parent (RoomFloorPlanManager) renders this with `key={room.id}`,
 * so React fully remounts it on room switch — that's what resets boundaryDraft/
 * obstaclesDraft/tool/etc back to this room's values instead of carrying over
 * the previous room's in-progress edits. Don't remove the key without adding
 * back an explicit reset path.
 */
export default function FloorPlanEditor({ venueId, room, onRoomUpdated }: Props) {
  const [tool, setTool] = useState<Tool>('view')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Working copies — only written back to Supabase on explicit Save, so a venue
  // manager can trace/adjust a shape without every point round-tripping the DB.
  const [boundaryDraft, setBoundaryDraft] = useState<Point2D[]>(
    (room.floor_polygon as Point2D[]) ?? [],
  )
  const [obstaclesDraft, setObstaclesDraft] = useState<ObstacleShape[]>(room.obstacles ?? [])
  const [inProgressPolygon, setInProgressPolygon] = useState<Point2D[]>([])
  const [calibrationLine, setCalibrationLine] = useState<Point2D[]>([])
  const [calibrationInputCm, setCalibrationInputCm] = useState('')

  // Loaded image keyed by the url it was loaded for — see the equivalent
  // pattern in FloorPlanCanvas.tsx for why (avoids a synchronous setState in
  // the effect body just to clear a stale image).
  const [loadedImage, setLoadedImage] = useState<{ url: string; img: HTMLImageElement } | null>(null)
  useEffect(() => {
    const url = room.floor_plan_image_url
    if (!url) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    img.onload = () => setLoadedImage({ url, img })
  }, [room.floor_plan_image_url])
  const image = loadedImage?.url === room.floor_plan_image_url ? loadedImage.img : null

  // Image is displayed at a fixed px-per-screen-px scale of 1 (natural size,
  // scrollable) — the underlying coordinate system is the image's own pixel
  // grid. cm values are derived from px via room.cm_per_px on save/read.
  const imageWidthPx = room.floor_plan_image_width_px ?? image?.naturalWidth ?? 0
  const imageHeightPx = room.floor_plan_image_height_px ?? image?.naturalHeight ?? 0
  const cmPerPx = room.cm_per_px

  // ─── Upload ────────────────────────────────────────────────────────────────

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.type !== 'image/png') {
        setError('Floor plans must be a PNG file.')
        return
      }
      setError(null)
      setUploading(true)
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new window.Image()
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = () => reject(new Error('Could not read image dimensions.'))
          img.src = URL.createObjectURL(file)
        })
        await uploadRoomFloorPlan(venueId, room.id, file, dims.w, dims.h)
        onRoomUpdated({
          ...room,
          floor_plan_image_url: URL.createObjectURL(file), // optimistic; replaced by parent refetch
          floor_plan_image_width_px: dims.w,
          floor_plan_image_height_px: dims.h,
          cm_per_px: null,
          floor_polygon: [],
          obstacles: [],
        })
        setBoundaryDraft([])
        setObstaclesDraft([])
        setTool('calibrate')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [venueId, room, onRoomUpdated],
  )

  // ─── Stage click handling per active tool ───────────────────────────────────

  /**
   * getPointerPosition() returns the mouse position in Stage-space (raw canvas
   * pixels, BEFORE the Stage's own scaleX/scaleY zoom transform is undone —
   * Konva does not do that for you), and everything we draw lives inside
   * <Layer x={STAGE_PADDING} y={STAGE_PADDING}>. So a raw stage position needs
   * dividing by the current zoom, then shifting back by the padding, to land
   * in the same native-pixel coordinate space every point is stored in
   * (dragging is unaffected by this — Konva's node.x()/y() during a drag are
   * already reported in that same undistorted local space regardless of zoom).
   */
  const getLayerPoint = (stage: Konva.Stage): Point2D => {
    const pos = stage.getPointerPosition()
    if (!pos) return { x: 0, y: 0 }
    return { x: pos.x / zoom - STAGE_PADDING, y: pos.y / zoom - STAGE_PADDING }
  }

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage || !stage.getPointerPosition()) return
    const point = getLayerPoint(stage) // px in image space

    if (tool === 'calibrate') {
      if (calibrationLine.length === 0) {
        setCalibrationLine([point])
      } else if (calibrationLine.length === 1) {
        setCalibrationLine([calibrationLine[0], point])
      }
      return
    }

    if (tool === 'boundary' || tool === 'obstacle-polygon') {
      // Double-click closes the shape; single click adds a point.
      setInProgressPolygon((prev) => [...prev, point])
      return
    }
  }

  const handleStageDblClick = () => {
    if (tool === 'boundary' && inProgressPolygon.length >= 3) {
      setBoundaryDraft(pxPointsToCm(inProgressPolygon))
      setInProgressPolygon([])
      setTool('view')
    } else if (tool === 'obstacle-polygon' && inProgressPolygon.length >= 3) {
      setObstaclesDraft((prev) => [
        ...prev,
        { id: newObstacleId(), type: 'polygon', points: pxPointsToCm(inProgressPolygon) },
      ])
      setInProgressPolygon([])
      setTool('view')
    }
  }

  // Rect/circle obstacles: click-drag directly on the stage.
  const dragStartPx = useRef<Point2D | null>(null)
  const [dragPreview, setDragPreview] = useState<{ start: Point2D; current: Point2D } | null>(null)

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool !== 'obstacle-rect' && tool !== 'obstacle-circle') return
    const stage = e.target.getStage()
    if (!stage || !stage.getPointerPosition()) return
    const point = getLayerPoint(stage)
    dragStartPx.current = point
    setDragPreview({ start: point, current: point })
  }

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!dragStartPx.current) return
    const stage = e.target.getStage()
    if (!stage || !stage.getPointerPosition()) return
    setDragPreview({ start: dragStartPx.current, current: getLayerPoint(stage) })
  }

  const handleStageMouseUp = () => {
    if (!dragStartPx.current || !dragPreview) {
      dragStartPx.current = null
      setDragPreview(null)
      return
    }
    const { start, current } = dragPreview
    if (!cmPerPx) {
      setError('Calibrate the scale before adding obstacles.')
    } else if (tool === 'obstacle-rect') {
      const widthPx = Math.abs(current.x - start.x)
      const depthPx = Math.abs(current.y - start.y)
      if (widthPx > 4 && depthPx > 4) {
        const centerPx = { x: (start.x + current.x) / 2, y: (start.y + current.y) / 2 }
        setObstaclesDraft((prev) => [
          ...prev,
          {
            id: newObstacleId(),
            type: 'rect',
            center: pxToCm(centerPx),
            widthCm: widthPx * cmPerPx,
            depthCm: depthPx * cmPerPx,
            rotationDeg: 0,
          },
        ])
      }
    } else if (tool === 'obstacle-circle') {
      const radiusPx = distanceCm(start, current) // px distance, name is generic
      if (radiusPx > 4) {
        setObstaclesDraft((prev) => [
          ...prev,
          { id: newObstacleId(), type: 'circle', center: pxToCm(start), radiusCm: radiusPx * cmPerPx },
        ])
      }
    }
    dragStartPx.current = null
    setDragPreview(null)
  }

  function pxToCm(p: Point2D): Point2D {
    if (!cmPerPx) return p
    return { x: p.x * cmPerPx, y: p.y * cmPerPx }
  }
  function pxPointsToCm(points: Point2D[]): Point2D[] {
    return points.map(pxToCm)
  }
  function cmToPx(p: Point2D): Point2D {
    if (!cmPerPx) return p
    return { x: p.x / cmPerPx, y: p.y / cmPerPx }
  }

  // ─── Calibration confirm ─────────────────────────────────────────────────

  const confirmCalibration = async () => {
    const lengthCm = parseFloat(calibrationInputCm)
    if (calibrationLine.length !== 2 || !lengthCm || lengthCm <= 0) {
      setError('Draw a reference line and enter its real-world length in cm.')
      return
    }
    const pxLength = distanceCm(calibrationLine[0], calibrationLine[1])
    const ratio = lengthCm / pxLength
    setSaving(true)
    try {
      await updateRoomCalibration(room.id, ratio)
      onRoomUpdated({ ...room, cm_per_px: ratio })
      setCalibrationLine([])
      setCalibrationInputCm('')
      setError(null)
      setTool('boundary')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save calibration.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Save boundary / obstacles ────────────────────────────────────────────

  const saveBoundary = async () => {
    setSaving(true)
    try {
      await updateRoomBoundary(room.id, boundaryDraft)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the wall boundary.')
    } finally {
      setSaving(false)
    }
  }

  const saveObstacles = async () => {
    setSaving(true)
    try {
      await updateRoomObstacles(room.id, obstaclesDraft)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save obstacles.')
    } finally {
      setSaving(false)
    }
  }

  const removeObstacle = (id: string) => {
    setObstaclesDraft((prev) => prev.filter((o) => o.id !== id))
  }

  const boundaryPx = boundaryDraft.map(cmToPx)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          onChange={handleFileSelected}
          className="hidden"
          id="floor-plan-upload"
        />
        <label
          htmlFor="floor-plan-upload"
          className="cursor-pointer rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
        >
          {uploading ? 'Uploading…' : room.floor_plan_image_url ? 'Replace floor plan PNG' : 'Upload floor plan PNG'}
        </label>

        {room.floor_plan_image_url && (
          <>
            <ToolButton active={tool === 'calibrate'} onClick={() => setTool('calibrate')} disabled={saving}>
              📏 Calibrate scale
            </ToolButton>
            <ToolButton
              active={tool === 'boundary'}
              onClick={() => {
                setTool('boundary')
                setInProgressPolygon([])
              }}
              disabled={!cmPerPx || saving}
            >
              🧱 Trace walls
            </ToolButton>
            <ToolButton
              active={tool === 'obstacle-rect'}
              onClick={() => setTool('obstacle-rect')}
              disabled={!cmPerPx || saving}
            >
              ▭ Rect obstacle
            </ToolButton>
            <ToolButton
              active={tool === 'obstacle-circle'}
              onClick={() => setTool('obstacle-circle')}
              disabled={!cmPerPx || saving}
            >
              ⬤ Circle obstacle
            </ToolButton>
            <ToolButton
              active={tool === 'obstacle-polygon'}
              onClick={() => {
                setTool('obstacle-polygon')
                setInProgressPolygon([])
              }}
              disabled={!cmPerPx || saving}
            >
              ⬠ Freeform obstacle
            </ToolButton>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!cmPerPx && room.floor_plan_image_url && (
        <p className="text-sm text-amber-600">Calibrate the scale before tracing walls or adding obstacles.</p>
      )}

      {tool === 'calibrate' && (
        <div className="flex items-center gap-2 rounded bg-blue-50 p-2 text-sm">
          <span>Click two points on a wall of known length, then:</span>
          <input
            type="number"
            placeholder="length in cm"
            value={calibrationInputCm}
            onChange={(e) => setCalibrationInputCm(e.target.value)}
            className="w-28 rounded border px-2 py-1"
          />
          <button
            onClick={confirmCalibration}
            disabled={calibrationLine.length !== 2 || saving}
            className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40"
          >
            Set scale
          </button>
        </div>
      )}

      {(tool === 'boundary' || tool === 'obstacle-polygon') && (
        <p className="text-sm text-gray-500">
          Click to add points, double-click to close the shape ({inProgressPolygon.length} points so far).
        </p>
      )}

      {room.floor_plan_image_url && image && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 100) / 100))}
              className="rounded bg-gray-100 px-2 py-1 text-sm hover:bg-gray-200"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="w-12 text-center text-sm text-gray-500">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 100) / 100))}
              className="rounded bg-gray-100 px-2 py-1 text-sm hover:bg-gray-200"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => setZoom(1)}
              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              Reset
            </button>
          </div>
          <div className="overflow-auto rounded border" style={{ maxHeight: 600 }}>
            <Stage
              width={(imageWidthPx + STAGE_PADDING * 2) * zoom}
              height={(imageHeightPx + STAGE_PADDING * 2) * zoom}
              scaleX={zoom}
              scaleY={zoom}
              onClick={handleStageClick}
              onDblClick={handleStageDblClick}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onWheel={(e) => {
                e.evt.preventDefault()
                const direction = e.evt.deltaY > 0 ? -1 : 1
                setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + direction * 0.1) * 100) / 100)))
              }}
            >
              <Layer x={STAGE_PADDING} y={STAGE_PADDING}>
                <KonvaImage image={image} width={imageWidthPx} height={imageHeightPx} opacity={0.85} />

              {/* Saved wall boundary — vertices are draggable so a misplaced
                  point can be nudged without redrawing the whole shape. Hidden
                  while actively tracing a brand-new polygon so the handles
                  don't clash with in-progress points. */}
              {boundaryPx.length >= 3 && inProgressPolygon.length === 0 && (
                <>
                  <Line
                    points={boundaryPx.flatMap((p) => [p.x, p.y])}
                    closed
                    stroke="#dc2626"
                    strokeWidth={4}
                    fill="rgba(220,38,38,0.06)"
                  />
                  {boundaryPx.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={5}
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      draggable
                      onClick={(e) => { e.cancelBubble = true }}
                      onMouseDown={(e) => { e.cancelBubble = true }}
                      onDragMove={(e) => {
                        const { x, y } = e.target.position()
                        setBoundaryDraft((prev) => prev.map((pt, idx) => (idx === i ? pxToCm({ x, y }) : pt)))
                      }}
                    />
                  ))}
                </>
              )}

              {/* Saved obstacles — draggable as a whole shape (translate) so a
                  misplaced pillar/column can be repositioned without deleting
                  and redrawing it. */}
              {obstaclesDraft.map((o) => (
                <ObstacleShapeRender
                  key={o.id}
                  obstacle={o}
                  cmToPx={cmToPx}
                  pxToCm={pxToCm}
                  cmPerPx={cmPerPx ?? 1}
                  onDoubleClick={() => removeObstacle(o.id)}
                  onMoved={(updated) => setObstaclesDraft((prev) => prev.map((existing) => (existing.id === o.id ? updated : existing)))}
                />
              ))}

              {/* In-progress polygon (boundary or freeform obstacle) — points
                  are draggable so a misplaced click can be corrected before
                  double-clicking to close the shape. */}
              {inProgressPolygon.length > 0 && (
                <>
                  <Line
                    points={inProgressPolygon.flatMap((p) => [p.x, p.y])}
                    stroke={tool === 'boundary' ? '#dc2626' : '#d97706'}
                    strokeWidth={3}
                    dash={[6, 4]}
                  />
                  {inProgressPolygon.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={5}
                      fill={tool === 'boundary' ? '#dc2626' : '#d97706'}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      draggable
                      onClick={(e) => { e.cancelBubble = true }}
                      onMouseDown={(e) => { e.cancelBubble = true }}
                      onDragMove={(e) => {
                        const { x, y } = e.target.position()
                        setInProgressPolygon((prev) => prev.map((pt, idx) => (idx === i ? { x, y } : pt)))
                      }}
                    />
                  ))}
                </>
              )}

              {/* Calibration line — endpoints are draggable, which matters
                  most here since a bad calibration throws off every cm
                  measurement derived from it afterward. */}
              {calibrationLine.length > 0 && (
                <>
                  <Line
                    points={calibrationLine.flatMap((p) => [p.x, p.y])}
                    stroke="#2563eb"
                    strokeWidth={3}
                  />
                  {calibrationLine.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={6}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      draggable
                      onClick={(e) => { e.cancelBubble = true }}
                      onMouseDown={(e) => { e.cancelBubble = true }}
                      onDragMove={(e) => {
                        const { x, y } = e.target.position()
                        setCalibrationLine((prev) => prev.map((pt, idx) => (idx === i ? { x, y } : pt)))
                      }}
                    />
                  ))}
                </>
              )}

              {/* Live drag preview for rect/circle obstacles */}
              {dragPreview &&
                (tool === 'obstacle-rect' ? (
                  <Rect
                    x={Math.min(dragPreview.start.x, dragPreview.current.x)}
                    y={Math.min(dragPreview.start.y, dragPreview.current.y)}
                    width={Math.abs(dragPreview.current.x - dragPreview.start.x)}
                    height={Math.abs(dragPreview.current.y - dragPreview.start.y)}
                    stroke="#d97706"
                    strokeWidth={2}
                    dash={[4, 3]}
                  />
                ) : (
                  <Circle
                    x={dragPreview.start.x}
                    y={dragPreview.start.y}
                    radius={distanceCm(dragPreview.start, dragPreview.current)}
                    stroke="#d97706"
                    strokeWidth={2}
                    dash={[4, 3]}
                  />
                ))}
            </Layer>
          </Stage>
          </div>
        </>
      )}

      {room.floor_plan_image_url && (
        <div className="flex gap-2">
          <button
            onClick={saveBoundary}
            disabled={saving || boundaryDraft.length < 3}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Save wall boundary
          </button>
          <button
            onClick={saveObstacles}
            disabled={saving}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Save obstacles ({obstaclesDraft.length})
          </button>
          <span className="self-center text-xs text-gray-400">Double-click a saved obstacle to remove it.</span>
        </div>
      )}
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-sm disabled:opacity-40 ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function ObstacleShapeRender({
  obstacle,
  cmToPx,
  pxToCm,
  cmPerPx,
  onDoubleClick,
  onMoved,
}: {
  obstacle: ObstacleShape
  cmToPx: (p: Point2D) => Point2D
  pxToCm: (p: Point2D) => Point2D
  cmPerPx: number
  onDoubleClick: () => void
  onMoved: (updated: ObstacleShape) => void
}) {
  // cmToPx only maps positions (pure scale from the origin); lengths (radius,
  // width, depth) convert directly via the same ratio, no point math needed.
  const pxPerCm = 1 / cmPerPx
  const shared = {
    fill: 'rgba(217,119,6,0.25)',
    stroke: '#d97706',
    strokeWidth: 2,
    onDblClick: onDoubleClick,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true },
    draggable: true,
  }

  if (obstacle.type === 'circle') {
    const c = cmToPx(obstacle.center)
    return (
      <Circle
        x={c.x}
        y={c.y}
        radius={obstacle.radiusCm * pxPerCm}
        {...shared}
        onDragEnd={(e) => onMoved({ ...obstacle, center: pxToCm({ x: e.target.x(), y: e.target.y() }) })}
      />
    )
  }
  if (obstacle.type === 'rect') {
    const c = cmToPx(obstacle.center)
    const wPx = obstacle.widthCm * pxPerCm
    const dPx = obstacle.depthCm * pxPerCm
    return (
      <Group
        x={c.x}
        y={c.y}
        rotation={obstacle.rotationDeg}
        draggable
        onDragEnd={(e) => onMoved({ ...obstacle, center: pxToCm({ x: e.target.x(), y: e.target.y() }) })}
      >
        <Rect x={-wPx / 2} y={-dPx / 2} width={wPx} height={dPx} {...shared} draggable={false} />
      </Group>
    )
  }
  const pointsPx = obstacle.points.map(cmToPx)
  return (
    <Line
      points={pointsPx.flatMap((p) => [p.x, p.y])}
      closed
      {...shared}
      onDragEnd={(e) => {
        // Group-less freeform drag: Konva reports the Line's own x/y offset
        // (it starts at 0,0 since points are absolute), so that offset is the
        // px delta to apply to every point, then reset the node back to 0,0
        // since the points array itself now carries the new position.
        const deltaPx = { x: e.target.x(), y: e.target.y() }
        const deltaCm = { x: deltaPx.x * cmPerPx, y: deltaPx.y * cmPerPx }
        e.target.position({ x: 0, y: 0 })
        onMoved({
          ...obstacle,
          points: obstacle.points.map((p) => ({ x: p.x + deltaCm.x, y: p.y + deltaCm.y })),
        })
      }}
    />
  )
}
